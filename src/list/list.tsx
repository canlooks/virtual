import React, {ComponentType, ReactNode, Ref, useEffect, useImperativeHandle, useMemo, useRef} from 'react'
import {binarySearch, MAX_DOM_SIZE, useSync, useSyncState} from '../util'
import {flushSync} from 'react-dom'

export type VListScrollToIndexOptions = {
    index: number
    behavior?: ScrollBehavior
    /** 滚动后目标元素所在的位置，默认为`start` */
    align?: ScrollLogicalPosition
}

export interface VListRef extends HTMLDivElement {
    scrollToIndex(index: number): void
    scrollToIndex(options: VListScrollToIndexOptions): void
}

export type VListComponents = {
    Scroller?: ComponentType | string
    List?: ComponentType | string
    Item?: ComponentType | string
}

export interface VListProps extends Omit<React.JSX.IntrinsicElements['div'], 'ref'> {
    ref?: Ref<VListRef>
    /** 固定元素的尺寸，可获得更好的性能 */
    itemSize?: number
    totalCount?: number
    renderItem?(index: number): ReactNode
    /** 滚动方向，默认为`vertical` */
    orientation?: 'vertical' | 'horizontal'
    /** 自定义渲染元素，默认均为`div` */
    components?: VListComponents
    /** 缓冲数量，默认为`1` */
    bufferCount?: number
}

export function VList({
    itemSize,
    totalCount = 0,
    renderItem,
    orientation = 'vertical',
    components = {},
    bufferCount = 0,
    ...props
}: VListProps) {
    useImperativeHandle(props.ref, () => {
        if (scroller.current) {
            scroller.current.scrollToIndex = (a: number | VListScrollToIndexOptions) => {
                let {index, align = 'start', behavior} = typeof a === 'number' ? {index: a} : a
                const targetStart = index ? cumulativeSizes.current[index - 1] : 0
                const targetEnd = cumulativeSizes.current[index]
                if (align === 'nearest') {
                    const currentStart = scroller.current![scrollProp]
                    const currentEnd = currentStart + scroller.current![clientSizeProp]
                    const startDistance = Math.abs(targetStart - currentStart)
                    const endDistance = Math.abs(targetEnd - currentEnd)
                    align = startDistance < endDistance ? 'start' : 'end'
                }
                let targetPosition
                switch (align) {
                    case 'start':
                        targetPosition = targetStart
                        break
                    case 'end':
                        targetPosition = targetEnd - scroller.current![clientSizeProp]
                        break
                    default:
                        // 'center'
                        targetPosition = targetStart + (targetEnd - targetStart - scroller.current![clientSizeProp]) / 2
                }
                scroller.current!.scrollTo({
                    [isVertical ? 'top' : 'left']: targetPosition,
                    behavior
                })
            }
        }
        return scroller.current as VListRef
    })

    const syncTotalCount = useSync(totalCount)

    const isVertical = orientation === 'vertical'

    const offsetPosProp = isVertical ? 'offsetTop' : 'offsetLeft'
    const offsetSizeProp = isVertical ? 'offsetHeight' : 'offsetWidth'
    const scrollProp = isVertical ? 'scrollTop' : 'scrollLeft'
    const clientSizeProp = isVertical ? 'clientHeight' : 'clientWidth'

    const scroller = useRef<VListRef>(null)
    const wrapper = useRef<VListRef>(null)
    const itemRefs = useRef<{ el: HTMLDivElement | null, index: number }[]>([])
    const itemSizes = useRef<(number | undefined)[]>([])

    const [start, setStart] = useSyncState(0)
    const [end, setEnd] = useSyncState(totalCount && !itemSize ? 1 : 0)
    const cumulativeSizes = useRef<number[]>([])

    const scrollOffsetRatio = useRef(1)
    const paddingRatio = useRef(1)
    const lastPadding = useRef(0)

    const calculateOffsetRatio = () => {
        const totalSize = cumulativeSizes.current[cumulativeSizes.current.length - 1] || 0
        if (totalSize > MAX_DOM_SIZE) {
            const scrollerSize = scroller.current![clientSizeProp]
            scrollOffsetRatio.current = (totalSize - scrollerSize) / (MAX_DOM_SIZE - scrollerSize)

            const lastIndex = cumulativeSizes.current.findLastIndex(s => totalSize - s >= scrollerSize)
            lastPadding.current = cumulativeSizes.current[lastIndex - bufferCount]
            paddingRatio.current = lastPadding.current / (MAX_DOM_SIZE - totalSize + lastPadding.current)
        }
    }

    useEffect(() => {
        if (!itemSize) {
            return
        }
        // 元素固定尺寸，无需执行calculateRange，初始化操作在下面的scrollerResize中执行
        itemSizes.current = Array(syncTotalCount.current).fill(itemSize)
        let cumulated = 0
        cumulativeSizes.current = []
        for (let i = 0; i < syncTotalCount.current; i++) {
            cumulated += itemSize
            cumulativeSizes.current.push(cumulated)
        }
        calculateOffsetRatio()
    }, [itemSize])

    useEffect(() => {
        if (itemSize) {
            return
        }
        // 未固定元素尺寸，使用ResizeObserver监听
        const itemResize = new ResizeObserver(() => {
            let changed = false
            for (let i = 0, {length} = itemRefs.current; i < length; i++) {
                const {el, index} = itemRefs.current[i]
                if (el && el[offsetSizeProp] !== itemSizes.current[index]) {
                    itemSizes.current[index] = el[offsetSizeProp]
                    changed = true
                }
            }
            if (!changed) {
                return
            }

            let totalSize = 0
            let count = 0
            for (let i = 0, {length} = itemSizes.current; i < length; i++) {
                const size = itemSizes.current[i]
                if (typeof size === 'number') {
                    totalSize += size
                    count++
                }
            }
            const average = totalSize / count
            let cumulated = 0
            cumulativeSizes.current = []
            for (let i = 0; i < syncTotalCount.current; i++) {
                cumulated += itemSizes.current[i] ?? average
                cumulativeSizes.current.push(cumulated)
            }
            calculateOffsetRatio()

            const {el} = itemRefs.current[itemRefs.current.length - 1]
            if (el && el[offsetPosProp] + el[offsetSizeProp] < scroller.current![scrollProp] + scroller.current![clientSizeProp]) {
                calculateRange()
            }
        })

        itemRefs.current.forEach(r => r.el && itemResize.observe(r.el))
        return () => {
            itemResize.disconnect()
        }
    }, [start.current, end.current, orientation])

    const calculateRange = () => {
        const scrollOffset = scroller.current![scrollProp]
        const scrollStart = scrollOffset * scrollOffsetRatio.current
        const scrollEnd = scrollStart + scroller.current![clientSizeProp]

        // itemRefs.current.forEach(({el, index}) => {
        //     if (el) {
        //         el.style.transform = `translateY(${scrollOffset / scrollOffsetRatio.current}px)`
        //     }
        // })

        let startIndex: number, endIndex: number
        if (itemSize) {
            startIndex = Math.floor(scrollStart / itemSize)
            endIndex = Math.ceil(scrollEnd / itemSize)
        } else {
            startIndex = binarySearch(cumulativeSizes.current, s => s - scrollStart)
            startIndex = Math.ceil(startIndex)
            endIndex = binarySearch(cumulativeSizes.current, s => s - scrollEnd)
            endIndex = Math.ceil(endIndex) + 1
        }
        startIndex = Math.max(startIndex - bufferCount, 0)
        endIndex = Math.min(endIndex + bufferCount, syncTotalCount.current)

        const newPadding = startIndex >= 1
            ? cumulativeSizes.current[startIndex - 1] / paddingRatio.current
            : 0
        console.log(204, scrollOffset - newPadding)
        // TODO 做到这里，计算滚动偏移量
        // wrapper.current!.style.transform = `translateY(${(scrollOffset - newPadding)}px)`

        if (startIndex !== start.current || endIndex !== end.current) {
            if (startIndex !== start.current) {
                // wrapper.current!.style.transform = 'translateY(0)'

            }
            flushSync(() => {
                setStart(startIndex)
                setEnd(endIndex)
            })
            // itemRefs.current.forEach(({el}) => {
            //     if (el) {
            //         el.style.transform = `translateY(0)`
            //     }
            // })
        } else {
            // translate()
            // itemRefs.current.forEach(({el, index}) => {
            //     if (el) {
            //         el.style.transform = `translateY(${scrollOffset / scrollOffsetRatio.current}px)`
            //     }
            // })
        }
    }

    useEffect(() => {
        scroller.current!.addEventListener('scroll', calculateRange)
        return () => {
            scroller.current!.removeEventListener('scroll', calculateRange)
        }
    }, [])

    useEffect(() => {
        let prevScrollerSize: number | undefined
        const scrollerResize = new ResizeObserver(() => {
            const scrollerSize = scroller.current![clientSizeProp]
            if (scrollerSize === prevScrollerSize) {
                // 只监听一个方向的变化
                return
            }
            if (typeof prevScrollerSize !== 'undefined' || itemSize) {
                // 设定了itemSize，需要在初始化时执行；否则只需要在resize后再执行
                calculateRange()
            }
            prevScrollerSize = scrollerSize
        })
        scrollerResize.observe(scroller.current!)
        return () => {
            scrollerResize.disconnect()
        }
    }, [])

    const {
        Scroller = 'div',
        List = 'div',
        Item = 'div'
    } = components as any

    const renderedItems = useMemo(() => {
        itemRefs.current = []
        const items: ReactNode[] = []
        for (let i = start.current; i < end.current; i++) {
            items.push(
                <Item
                    key={i}
                    ref={(el: any) => {
                        itemRefs.current.push({el, index: i})
                    }}
                    style={{overflowAnchor: 'none'}}
                >
                    {renderItem?.(i)}
                </Item>
            )
        }
        return items
    }, [start.current, end.current, renderItem])

    return (
        <Scroller
            {...props}
            ref={scroller}
            style={{
                [isVertical ? 'overflowY' : 'overflowX']: 'auto',
                ...props.style
            }}
        >
            <List
                ref={wrapper}
                style={{
                    [isVertical ? 'height' : 'width']: cumulativeSizes.current.length
                        ? Math.min(cumulativeSizes.current[cumulativeSizes.current.length - 1], MAX_DOM_SIZE)
                        : 'auto',
                    [isVertical ? 'paddingTop' : 'paddingLeft']: start.current >= 1
                        ? cumulativeSizes.current[start.current - 1] / paddingRatio.current
                        : 0,
                    // [isVertical ? 'paddingBottom' : 'paddingRight']: cumulativeSizes.current.length && end.current
                    //     ? (cumulativeSizes.current[cumulativeSizes.current.length - 1] - cumulativeSizes.current[end.current - 1]) / paddingRatio.current
                    //     : 0,
                    boxSizing: 'border-box'
                }}
            >
                {renderedItems}
            </List>
        </Scroller>
    )
}