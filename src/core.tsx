import React, {CSSProperties, ReactNode, Ref, useEffect, useImperativeHandle, useMemo, useRef} from 'react'
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

export interface GroupedScrollToIndexOptions extends Omit<ScrollToIndexOptions, 'index'> {
    itemIndex?: number
    groupIndex?: number
}

export interface VirtualListRef extends HTMLElement {
    scrollToIndex(index: number): void
    scrollToIndex(options: ScrollToIndexOptions): void
}

export interface VirtualGroupRef extends HTMLElement {
    scrollToIndex(groupIndex: number, itemIndex: number): void
    scrollToIndex(options: GroupedScrollToIndexOptions): void
}

type VirtualCommonProps = {
    /** 固定元素的尺寸，可获得更好的性能 */
    itemSize?: number
    /** 滚动方向，默认为`vertical` */
    orientation?: 'vertical' | 'horizontal'
    /** 缓冲数量，默认为`1`，通常无需修改 */
    bufferCount?: number
}

export interface VirtualListCommonProps extends VirtualCommonProps {
    ref?: Ref<VirtualListRef>
    totalCount?: number
    /** 返回值会被{@link itemComponent}包裹，当作{@link itemComponent}的`children`渲染 */
    renderItemContent?(index: number): ReactNode
}

export interface VirtualGroupedCommonProps extends VirtualCommonProps {
    ref?: Ref<VirtualGroupRef>
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

type VirtualRef<Mode extends 'list' | 'group' = 'list'> = Mode extends 'list' ? VirtualListRef : VirtualGroupRef

interface UseVirtualListParams<Mode extends 'list' | 'group' = 'list'> extends Omit<VirtualListCommonProps, 'ref' | 'renderItemContent'>,
    Omit<VirtualGroupedCommonProps, 'ref' | 'renderItemContent'> {
    mode?: Mode
    ref?: Ref<VirtualRef<Mode>>
    itemComponent?: any
    groupTitleComponent?: any
    renderItemContent?(itemIndex: number, groupIndex?: number): ReactNode
}

export function useVirtual<Mode extends 'list' | 'group' = 'list'>({
    mode = 'list' as Mode,
    ref,
    itemSize,
    orientation = 'vertical',
    bufferCount = 1,
    totalCount: definedTotalCount = 0,
    groupTitleSize = itemSize,
    groupedCounts,
    renderGroupTitle,
    renderItemContent,
    groupTitleComponent: GroupTitle = 'div',
    itemComponent: Item = 'div'
}: UseVirtualListParams<Mode>): {
    scrollerRef: Ref<VirtualRef<Mode>>
    scrollerStyle: CSSProperties
    wrapperRef: Ref<any>
    wrapperStyle: CSSProperties
    renderedItems: ReactNode[]
} {
    useImperativeHandle(ref as any, () => {
        if (scrollerRef.current) {
            if (mode === 'list') {
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
            } else {
                scrollerRef.current.scrollToIndex = (a: number | ScrollToOptions, itemIndex?: number) => {
                    // TODO
                }
            }
        }
        return scrollerRef.current as any
    })

    const isVertical = orientation === 'vertical'
    const offsetSizeProp = isVertical ? 'offsetHeight' : 'offsetWidth'
    const scrollPosProps = isVertical ? 'scrollTop' : 'scrollLeft'
    const clientSizeProp = isVertical ? 'clientHeight' : 'clientWidth'

    const totalCount = useMemo(() => {
        if (mode === 'list') {
            return definedTotalCount
        }
        if (!groupedCounts) {
            return 0
        }
        const itemCount = groupedCounts.reduce((prev, curr) => prev + curr, 0)
        return itemCount + groupedCounts.length
    }, [groupedCounts, definedTotalCount, mode])

    const scrollerRef = useRef<VirtualRef<Mode>>(null)
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
            const lastPadding = steps[lastIndex - bufferCount]
            paddingRatio.current = lastPadding / (MAX_DOM_SIZE - totalSize + lastPadding)
        } else {
            scrollOffsetRatio.current = paddingRatio.current = 1
        }
        // 未固定尺寸的情况下，滚动至底部需要纠正
        if (end === totalCount && checkScrollEnd && !itemSize) {
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
        }
    }
    const [start, end] = range.current

    const calculateRange = (sync = true) => {
        const [originScrollStart, originScrollEnd] = scrollPosition.current
        if (!originScrollEnd) {
            return
        }
        const scrollStart = originScrollStart * scrollOffsetRatio.current
        const scrollEnd = originScrollEnd * scrollOffsetRatio.current

        let start: number
        let end: number
        if (itemSize) {
            start = Math.floor(scrollStart / itemSize)
            end = Math.ceil(scrollEnd / itemSize)
        } else {
            start = binarySearch(sizeSteps.current, s => s - scrollStart)
            start = Math.ceil(start)
            end = binarySearch(sizeSteps.current, s => s - scrollEnd)
            // 索引为end的元素不渲染，需要+1
            end = Math.ceil(end) + 1
        }
        // 加上缓冲数量，同时防止越界
        start = Math.max(start - bufferCount, 0)
        end = mode === 'list'
            ? Math.min(end + bufferCount, totalCount)
            // group模式由于强制渲染了groupTitle，所以需要多渲染一个
            : Math.min(end + bufferCount + 1, totalCount)

        sync
            ? flushSync(() => setRange([start, end]))
            : setRange([start, end])

        // 存在偏移量
        if (scrollOffsetRatio.current !== 1 || paddingRatio.current !== 1) {
            let paddingOffset = start ? sizeSteps.current[start - 1] : 0
            paddingOffset = paddingOffset - paddingOffset / paddingRatio.current
            wrapperRef.current!.style.transform = `translateY(${-(scrollStart - originScrollStart - paddingOffset)}px)`
        }
    }

    useMemo(() => {
        calculateRange(false)
    }, [totalCount, bufferCount])

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
    }, [groupedCounts, mode])

    // 渲染Items
    const renderedItems = useMemo(() => {
        itemRefs.current = []
        const ret: ReactNode[] = []
        if (mode === 'list') {
            for (let i = start; i < end; i++) {
                ret.push(
                    <Item
                        key={i}
                        ref={(el: any) => {
                            el && itemRefs.current.push({el, index: i})
                        }}
                        style={{overflowAnchor: 'none'}}
                    >
                        {(renderItemContent)?.(i)}
                    </Item>
                )
            }
        } else {
            // mode === 'group'
            for (let i = start; i < end; i++) {
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
                                : renderItemContent?.(i - groupIndex, groupIndex)
                            }
                        </Component>
                    )
                }
                // 视口的第一组需要强制渲染groupTitle
                if (i === start && !isGroupTitle) {
                    ret.push(render(groupIndex, true))
                } else if (i < end - 1) {
                    ret.push(render(groupIndex, isGroupTitle))
                }
            }
        }
        return ret
    }, [start, end, renderItemContent, groupTitleIndices, renderGroupTitle])

    const cachedItemSizes = useRef<(number | undefined)[]>([])

    // 未固定itemSize，需要监听items的尺寸变化
    useEffect(() => {
        if (!itemSize) {
            const itemResize = new ResizeObserver(() => {
                let changed = false
                for (let i = 0, {length} = itemRefs.current; i < length; i++) {
                    const {el, index} = itemRefs.current[i]
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
                for (let i = 0; i < totalCount; i++) {
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
    }, [renderedItems, totalCount, itemSize])

    // 固定itemSize，直接计算sizeSteps
    useEffect(() => {
        if (itemSize && groupTitleSize) {
            const steps = []
            let cumulated = 0
            for (let i = 0; i < totalCount; i++) {
                cumulated += groupTitleIndices.includes(i) ? groupTitleSize : itemSize
                steps.push(cumulated)
            }
            setSizeSteps(steps, false)
        }
    }, [totalCount, itemSize, groupTitleIndices, groupTitleSize])

    // 监听滚动位置变化
    useEffect(() => {
        if (!scrollerRef.current) {
            return
        }
        const scroll = () => updateScrollPosition()
        scrollerRef.current!.addEventListener('scroll', scroll)
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
        wrapperStyle: {
            [isVertical ? 'height' : 'width']: steps.length
                ? Math.min(steps[steps.length - 1], MAX_DOM_SIZE)
                : 'auto',
            [isVertical ? 'paddingTop' : 'paddingLeft']: steps.length && start
                ? steps[start - 1] / paddingRatio.current
                : 0,
            boxSizing: 'border-box'
        },
        renderedItems
    }
}