import React, {ReactNode, Ref, useEffect, useImperativeHandle, useMemo, useRef} from 'react'
import {binarySearch, useSyncState} from './util'
import {flushSync} from 'react-dom'

export const MAX_DOM_SIZE = 32_000_000

export type ScrollToIndexOptions = {
    index: number
    behavior?: ScrollBehavior
    /** 滚动后目标元素所在的位置，默认为`start` */
    align?: ScrollLogicalPosition
    /**
     * 偏移量，默认为`0`。
     * 例如offset为`10`，{@link align}为`start`时，滚动后目标元素距离容器顶部的距离为`10px`；
     * {@link align}为`end`时，滚动后目标元素距离容器底部的距离为`10px`。
     */
    offset?: number
}

export interface VirtualRef extends HTMLElement {
    scrollToIndex(index: number): void
    scrollToIndex(options: ScrollToIndexOptions): void
}

type VirtualCommonProps = {
    ref?: Ref<VirtualRef>
    /** 固定元素的尺寸，可获得更好的性能 */
    itemSize?: number
    /** 滚动方向，默认为`vertical` */
    orientation?: 'vertical' | 'horizontal'
    /** 缓冲数量，默认为`1`，通常无需修改 */
    bufferCount?: number
    onRangeChange?(start: number, end: number): void
}

export interface VirtualListCommonProps extends VirtualCommonProps {
    /** 默认为`1`，大于`1`时采用网格布局。例如{@link orientation}为`vertical`时，`gridCount`表示列数 */
    gridCount?: number
    totalCount?: number
    /** 返回值会被{@link itemComponent}包裹，当作{@link itemComponent}的`children`渲染 */
    renderItemContent?(index: number): ReactNode
}

export interface VirtualGroupedCommonProps extends VirtualCommonProps {
    /** 固定分组标题的尺寸可获得更好的性能，默认与{@link itemSize}相等 */
    groupTitleSize?: number
    /**
     * 分组数量与每组元素的数量，接受一个数组
     * @example [2, 3, 4]，表示总共有3组，每组分别有2, 3, 4个元素
     */
    groupedCounts?: number[]
    /** 返回值会被{@link groupTitleComponent}包裹，当作{@link groupTitleComponent}的`children`渲染 */
    renderGroupTitle?(groupIndex: number): ReactNode
    /** 返回值会被{@link itemComponent}包裹，当作{@link itemComponent}的`children`渲染 */
    renderItemContent?(itemIndex: number, groupIndex: number): ReactNode
}

interface UseVirtualParams extends Omit<VirtualListCommonProps, 'renderItemContent'>,
    Omit<VirtualGroupedCommonProps, 'renderItemContent'> {
    mode?: 'list' | 'group'
    itemComponent?: any
    groupTitleComponent?: any
    renderItemContent?(itemIndex: number, groupIndex?: number): ReactNode
}

export function useVirtual({
    mode = 'list',
    ref,
    itemSize,
    orientation = 'vertical',
    gridCount = 1,
    bufferCount = 1,
    onRangeChange,
    totalCount = 0,
    groupTitleSize = itemSize,
    groupedCounts,
    renderGroupTitle,
    renderItemContent,
    itemComponent: Item = 'div',
    groupTitleComponent: GroupTitle = 'div',
}: UseVirtualParams) {
    useImperativeHandle(ref, () => {
        if (scrollerRef.current) {
            scrollerRef.current.scrollToIndex = (a: number | ScrollToIndexOptions) => {
                let {index, align = 'start', behavior, offset = 0} = typeof a === 'number' ? {index: a} : a
                const targetStart = index ? sizeSteps.current[index - 1] : 0
                const targetEnd = sizeSteps.current[index]
                if (align === 'nearest') {
                    const currentStart = scrollerRef.current![scrollPosProps]
                    const currentEnd = currentStart + scrollerRef.current![clientSizeProp]
                    const startDistance = Math.abs(targetStart - currentStart)
                    const endDistance = Math.abs(targetEnd - currentEnd)
                    align = startDistance < endDistance ? 'start' : 'end'
                }
                let targetPosition
                switch (align) {
                    case 'start':
                        targetPosition = targetStart + offset
                        break
                    case 'end':
                        targetPosition = targetEnd - scrollerRef.current![clientSizeProp] - offset
                        break
                    default:
                        // 'center'
                        targetPosition = targetStart + (targetEnd - targetStart - scrollerRef.current![clientSizeProp]) / 2
                }
                scrollerRef.current!.scrollTo({
                    [isVertical ? 'top' : 'left']: targetPosition,
                    behavior
                })
            }
        }
        return scrollerRef.current!
    })

    const isVertical = orientation === 'vertical'
    const offsetSizeProp = isVertical ? 'offsetHeight' : 'offsetWidth'
    const scrollPosProps = isVertical ? 'scrollTop' : 'scrollLeft'
    const clientSizeProp = isVertical ? 'clientHeight' : 'clientWidth'

    const totalItemCount = useMemo(() => {
        if (mode === 'list') {
            return totalCount
        }
        if (!groupedCounts) {
            return 0
        }
        const itemCount = groupedCounts.reduce((prev, curr) => prev + curr, 0)
        return itemCount + groupedCounts.length
    }, [groupedCounts, totalCount])

    const totalGridCount = useMemo(() => {
        return gridCount > 1 ? Math.ceil(totalItemCount / gridCount) : totalItemCount
    }, [totalItemCount, gridCount])

    const scrollerRef = useRef<VirtualRef>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<{ el: HTMLElement, index: number }[]>([])

    const scrollOffsetRatio = useRef(1)
    const paddingRatio = useRef(1)

    const sizeSteps = useRef<number[]>([])
    const setSizeSteps = (steps: number[], checkScrollEnd = true) => {
        sizeSteps.current = steps
        // 超过最大DOM尺寸限制，需要计算偏移量
        const totalSize = steps[steps.length - 1]
        let scrollerSize: number
        let lastIndex: number
        if (totalSize > MAX_DOM_SIZE) {
            scrollerSize ||= scrollerRef.current![clientSizeProp]
            lastIndex ||= steps.findLastIndex(s => totalSize - s >= scrollerSize)
            scrollOffsetRatio.current = (totalSize - scrollerSize) / (MAX_DOM_SIZE - scrollerSize)
            const lastPadding = mode === 'list' ? steps[lastIndex - bufferCount] : steps[lastIndex - bufferCount - 1]
            paddingRatio.current = lastPadding / (MAX_DOM_SIZE - totalSize + lastPadding)
        } else {
            scrollOffsetRatio.current = paddingRatio.current = 1
        }
        // 未固定尺寸的情况下，滚动至底部需要纠正
        if (end === totalGridCount && checkScrollEnd && !itemSize) {
            scrollerSize ||= scrollerRef.current![clientSizeProp]
            lastIndex ||= steps.findLastIndex(s => totalSize - s >= scrollerSize)
            if (lastIndex !== start) {
                flushSync(() => _setRange([start, end]))
                calculateRange(false)
            }
        }
    }

    const scrollPosition = useRef<[number, number]>([0, 0])
    const updateScrollPosition = () => {
        const scrollStart = scrollerRef.current![scrollPosProps]
        const scrollEnd = scrollStart + scrollerRef.current![clientSizeProp]
        if (scrollStart !== scrollPosition.current[0] || scrollEnd !== scrollPosition.current[1]) {
            scrollPosition.current = [scrollStart, scrollEnd]
            calculateRange()
        }
    }

    const [range, _setRange] = useSyncState<[number, number]>([0, itemSize ? 0 : 1])
    const setRange = (newRange: [number, number]) => {
        if (newRange[0] !== range.current[0] || newRange[1] !== range.current[1]) {
            _setRange(newRange)
            onRangeChange?.(...newRange)
        }
    }
    const [start, end] = range.current

    const calculateRange = (sync = true) => {
        let [originScrollStart, originScrollEnd] = scrollPosition.current
        if (!originScrollEnd) {
            return
        }
        const hasOffset = scrollOffsetRatio.current !== 1 || paddingRatio.current !== 1
        // 存在偏移量需要限制滚动高度
        if (hasOffset) {
            originScrollStart = Math.min(MAX_DOM_SIZE - scrollerRef.current![clientSizeProp], originScrollStart)
        }
        let scrollStart = originScrollStart * scrollOffsetRatio.current
        const scrollEnd = scrollStart + originScrollEnd - originScrollStart

        let newStart: number
        let newEnd: number
        if (itemSize) {
            newStart = Math.floor(scrollStart / itemSize)
            newEnd = Math.ceil(scrollEnd / itemSize)
        } else {
            newStart = binarySearch(sizeSteps.current, s => s - scrollStart)
            newStart = Math.ceil(newStart)
            newEnd = binarySearch(sizeSteps.current, s => s - scrollEnd)
            // 索引为end的元素不渲染，需要+1
            newEnd = Math.ceil(newEnd) + 1
        }
        // 加上缓冲数量，同时防止越界
        newStart = mode === 'list'
            ? Math.max(newStart - bufferCount, 0)
            : Math.max(newStart - bufferCount - 1, 0)
        newEnd = Math.min(newEnd + bufferCount, totalGridCount)

        sync
            ? flushSync(() => setRange([newStart, newEnd]))
            : setRange([newStart, newEnd])

        // 存在偏移量，使用translate实现平滑滚动
        if (hasOffset) {
            let paddingOffset = newStart ? sizeSteps.current[newStart - 1] : 0
            paddingOffset = paddingOffset - paddingOffset / paddingRatio.current
            wrapperRef.current!.style.transform = `${
                orientation === 'vertical' ? 'translateY' : 'translateX'
            }(${originScrollStart + paddingOffset - scrollStart}px)`
        }
    }

    useMemo(() => {
        calculateRange(false)
    }, [totalGridCount, bufferCount])

    // 所有groupTitle对应的index
    const groupTitleIndices = useMemo(() => {
        const indices: number[] = []
        if (mode === 'group' && groupedCounts) {
            let groupIndex = 0
            for (let i = 0, {length} = groupedCounts; i < length; i++) {
                indices.push(groupIndex)
                groupIndex += groupedCounts[i] + 1
            }
        }
        return indices
    }, [groupedCounts])

    const gridItemStart = start * gridCount
    const gridItemEnd = Math.min(end * gridCount, totalItemCount)

    // 渲染Items
    const renderedItems = useMemo(() => {
        itemRefs.current = []
        const ret: ReactNode[] = []
        if (mode === 'list') {
            for (let i = gridItemStart; i < gridItemEnd; i++) {
                ret.push(
                    <Item
                        key={i}
                        ref={(el: any) => {
                            el && itemRefs.current.push({el, index: i})
                        }}
                        style={{
                            overflowAnchor: 'none',
                            ...itemSize && {
                                [orientation === 'vertical' ? 'height' : 'width']: itemSize,
                            },
                            ...gridCount > 1 && {
                                [orientation === 'vertical' ? 'width' : 'height']: `${100 / gridCount}%`
                            }
                        }}
                    >
                        {(renderItemContent)?.(i)}
                    </Item>
                )
            }
        } else {
            // mode === 'group'
            for (let i = gridItemStart; i < gridItemEnd; i++) {
                const gi = binarySearch(groupTitleIndices, ti => ti - i)
                const isGroupTitle = gi % 1 === 0
                const groupIndex = Math.floor(gi)

                const render = (groupIndex: number, isGroupTitle: boolean) => {
                    const Component = isGroupTitle ? GroupTitle : Item
                    const itemIndex = i - groupIndex
                    return (
                        <Component
                            key={isGroupTitle ? groupIndex : `${groupIndex}-${itemIndex}`}
                            ref={(el: any) => {
                                el && itemRefs.current.push({el, index: i})
                            }}
                            style={{
                                overflowAnchor: 'none',
                                ...isGroupTitle && {
                                    position: 'sticky',
                                    top: 0
                                }
                            }}
                        >
                            {isGroupTitle
                                ? renderGroupTitle?.(groupIndex)
                                : renderItemContent?.(i - groupIndex - 1, groupIndex)
                            }
                        </Component>
                    )
                }
                // 视口的第一组需要强制渲染groupTitle
                if (i === gridItemStart && !isGroupTitle) {
                    ret.push(render(groupIndex, true))
                }
                // 忽略最后一个
                if (i < gridItemEnd - 1) {
                    ret.push(render(groupIndex, isGroupTitle))
                }
            }
        }
        return ret
    }, [gridItemStart, gridItemEnd, renderItemContent, groupTitleIndices, renderGroupTitle, gridCount, orientation])

    const cachedItemSizes = useRef<(number | undefined)[]>([])

    // 未固定itemSize，需要监听items的尺寸变化
    useEffect(() => {
        if (!itemSize || !groupTitleSize) {
            const itemResize = new ResizeObserver(() => {
                let changed = false
                // 若是网格布局，每行只取一个元素
                for (let i = 0, {length} = itemRefs.current; i < length; i += gridCount) {
                    let {el, index} = itemRefs.current[i]
                    index /= gridCount
                    const size = el[offsetSizeProp]
                    if (cachedItemSizes.current[index] !== size) {
                        cachedItemSizes.current[index] = size
                        changed = true
                    }
                }
                if (!changed) {
                    return
                }
                // items尺寸有变化，重新计算sizeSteps（累加元素尺寸）
                let totalSize = 0
                let count = 0
                for (let i = 0, {length} = cachedItemSizes.current; i < length; i++) {
                    const size = cachedItemSizes.current[i]
                    if (typeof size === 'number') {
                        totalSize += size
                        count++
                    }
                }
                if (!count) {
                    return
                }
                const average = totalSize / count
                let cumulated = 0
                const steps = []
                for (let i = 0; i < totalGridCount; i++) {
                    cumulated += cachedItemSizes.current[i] ?? average
                    steps.push(cumulated)
                }
                setSizeSteps(steps)
            })
            itemRefs.current.forEach(({el}) => itemResize.observe(el))
            return () => {
                itemResize.disconnect()
            }
        }
    }, [renderedItems, totalGridCount, itemSize, groupTitleSize, gridCount])

    // 固定itemSize，直接计算sizeSteps
    useEffect(() => {
        if (itemSize && groupTitleSize) {
            const steps = []
            let cumulated = 0
            for (let i = 0; i < totalGridCount; i++) {
                cumulated += groupTitleIndices.includes(i) ? groupTitleSize : itemSize
                steps.push(cumulated)
            }
            setSizeSteps(steps, false)
        }
    }, [totalGridCount, itemSize, groupTitleIndices, groupTitleSize, gridCount])

    // 监听滚动位置变化
    useEffect(() => {
        if (!scrollerRef.current) {
            return
        }
        const scroll = () => updateScrollPosition()
        scrollerRef.current!.addEventListener('scroll', scroll, {passive: true})
        return () => {
            scrollerRef.current!.removeEventListener('scroll', scroll)
        }
    }, [])

    // 监听scroller尺寸变化
    useEffect(() => {
        if (!scrollerRef.current) {
            return
        }
        let prevSize: number | undefined
        const scrollerResize = () => {
            // 只监听一个方向的尺寸变化
            if (prevSize !== scrollerRef.current![clientSizeProp]) {
                prevSize = scrollerRef.current![clientSizeProp]
                updateScrollPosition()
            }
        }
        const resizeObserver = new ResizeObserver(scrollerResize)
        resizeObserver.observe(scrollerRef.current)
        return () => {
            resizeObserver.disconnect()
        }
    }, [])

    const steps = sizeSteps.current

    return {
        scrollerRef,
        scrollerStyle: {[isVertical ? 'overflowY' : 'overflowX']: 'auto'},
        wrapperRef,
        strut: {
            start: steps.length && start
                ? steps[start - 1] / paddingRatio.current
                : 0,
            end: steps.length
                ? (steps[steps.length - 1] - steps[end - 1]) / paddingRatio.current
                : 0
        },
        // wrapperStyle: {
        //     [isVertical ? 'paddingTop' : 'paddingLeft']: steps.length && start
        //         ? steps[start - 1] / paddingRatio.current
        //         : 0,
        //     [isVertical ? 'paddingBottom' : 'paddingRight']: steps.length
        //         ? (steps[steps.length - 1] - steps[end - 1]) / paddingRatio.current
        //         : 0,
        //     ...gridCount > 1 && {
        //         display: 'flex',
        //         flexWrap: 'wrap',
        //         [isVertical ? 'alignItems' : 'justifyContent']: 'flex-start',
        //         flexDirection: isVertical ? 'row' : 'column',
        //     },
        //     boxSizing: 'border-box'
        // },
        renderedItems
    }
}