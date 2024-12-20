import React, {ComponentType, ReactNode, Ref, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef} from 'react'
import {binarySearch, useSync, useSyncState} from '../util'
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

export interface VListProps extends Omit<React.JSX.IntrinsicElements['div'], 'ref'> {
    ref?: Ref<VListRef>
    /** 固定元素的尺寸，可获得更好的性能 */
    itemSize?: number
    totalCount?: number
    renderItem?(index: number): ReactNode
    /** 滚动方向，默认为`vertical` */
    orientation?: 'vertical' | 'horizontal'
    /** 自定义渲染元素，默认均为`div` */
    components?: {
        Scroller?: ComponentType
        List?: ComponentType
        Item?: ComponentType
    }
}

export function VList({
    itemSize,
    totalCount = 0,
    renderItem,
    orientation = 'vertical',
    components = {},
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
                    [orientation === 'vertical' ? 'top' : 'left']: targetPosition,
                    behavior
                })
            }
        }
        return scroller.current as VListRef
    })

    const scroller = useRef<VListRef>(null)
    const itemRefs = useRef<{ el: HTMLDivElement | null, index: number }[]>([])
    const itemSizes = useRef<(number | undefined)[]>([])

    const [start, setStart] = useSyncState(0)
    const [end, setEnd] = useSyncState(totalCount && !itemSize ? 1 : 0)
    const cumulativeSizes = useRef<number[]>([])

    const syncTotalCount = useSync(totalCount)

    const offsetPosProp = orientation === 'vertical' ? 'offsetTop' : 'offsetLeft'
    const offsetSizeProp = orientation === 'vertical' ? 'offsetHeight' : 'offsetWidth'
    const scrollProp = orientation === 'vertical' ? 'scrollTop' : 'scrollLeft'
    const clientSizeProp = orientation === 'vertical' ? 'clientHeight' : 'clientWidth'

    useLayoutEffect(() => {
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

    useMemo(() => {
        if (!itemSize) {
            return
        }
        // 设定了itemSize，无需执行calculateRange，初始化操作在下面的scrollerResize中执行
        itemSizes.current = Array(syncTotalCount.current).fill(itemSize)
        let cumulated = 0
        cumulativeSizes.current = []
        for (let i = 0; i < syncTotalCount.current; i++) {
            cumulated += itemSize
            cumulativeSizes.current.push(cumulated)
        }
    }, [itemSize])

    const calculateRange = () => {
        const scrollStart = scroller.current![scrollProp]
        const scrollEnd = scrollStart + scroller.current![clientSizeProp]

        let startIndex: number, endIndex: number
        if (itemSize) {
            startIndex = Math.floor(scrollStart / itemSize)
            endIndex = Math.ceil(scrollEnd / itemSize)
        } else {
            startIndex = binarySearch(cumulativeSizes.current, h => h - scrollStart)
            startIndex = Math.max(Math.ceil(startIndex), 0)
            endIndex = binarySearch(cumulativeSizes.current, h => h - scrollEnd)
            endIndex = Math.min(Math.ceil(endIndex) + 1, syncTotalCount.current)
        }

        if (startIndex !== start.current || endIndex !== end.current) {
            flushSync(() => {
                setStart(startIndex)
                setEnd(endIndex)
            })
        }
    }

    useEffect(() => {
        scroller.current!.addEventListener('scroll', calculateRange)
        return () => {
            scroller.current!.removeEventListener('scroll', calculateRange)
        }
    }, [])

    useEffect(() => {
        let prevscrollerSize: number | undefined
        const scrollerResize = new ResizeObserver(() => {
            const scrollerSize = scroller.current![clientSizeProp]
            if (scrollerSize === prevscrollerSize) {
                // 只监听一个方向的变化
                return
            }
            if (typeof prevscrollerSize !== 'undefined' || itemSize) {
                // 设定了itemSize，需要在初始化时执行；否则只需要在resize后再执行
                calculateRange()
            }
            prevscrollerSize = scrollerSize
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
    } = components

    const renderedItems = useMemo(() => {
        itemRefs.current = []
        const items: ReactNode[] = []
        for (let i = start.current; i < end.current; i++) {
            items.push(
                <Item
                    key={i}
                    ref={el => {
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
                [orientation === 'vertical' ? 'overflowY' : 'overflowX']: 'auto',
                ...props.style
            }}
        >
            <List
                style={{
                    [orientation === 'vertical' ? 'height' : 'width']: cumulativeSizes.current.length
                        ? cumulativeSizes.current[cumulativeSizes.current.length - 1]
                        : 'auto',
                    [orientation === 'vertical' ? 'paddingTop' : 'paddingLeft']: start.current
                        ? cumulativeSizes.current[start.current - 1]
                        : 0,
                    boxSizing: 'border-box'
                }}
            >
                {renderedItems}
            </List>
        </Scroller>
    )
}