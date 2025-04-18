import {CSSProperties, ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react'
import {ScrollToIndexOptions, UseVirtualParams, VirtualRef} from './types'
import {flushSync} from 'react-dom'
import {cloneRef, computeMaxDomSize, useSync, useSyncState} from './util'

const scrollerStyle: CSSProperties = {
    overflowAnchor: 'none',
    position: 'relative',
    WebkitOverflowScrolling: 'touch'
}

const verticalScrollerStyle: CSSProperties = {
    overflowY: 'auto',
    ...scrollerStyle
}

const horizontalScrollerStyle: CSSProperties = {
    overflowX: 'auto',
    ...scrollerStyle
}

export const MAX_DOM_SIZE = computeMaxDomSize()

export function useVirtual({
    ref,
    mode,
    itemSize,
    totalCount = 0,
    groupedCounts,
    gridCount = 1,
    bufferCount = 1,
    renderItemContent,
    orientation = 'vertical',
    onRangeChange,
    itemComponent: ItemComponent = 'div',
    itemProps,
    groupTitleSize = itemSize,
    groupTitleComponent: GroupTitleComponent = 'div',
    groupTitleProps,
    renderGroupTitleContent,
}: UseVirtualParams) {
    if (gridCount > 1 && !itemSize) {
        throw Error('[@canlooks/virtual] "itemSize" must be specified when "gridCount" > 1.')
    }

    const isVertical = orientation === 'vertical'

    useImperativeHandle(ref, () => {
        if (scrollerRef.current) {
            scrollerRef.current.scrollToIndex = (a: number | ScrollToIndexOptions) => {
                let {
                    index,
                    align = 'start',
                    behavior,
                    offset = 0
                } = typeof a === 'number' ? {index: a} : a
                let targetStart: number
                let targetEnd: number
                const {scrollPosition, clientSize} = getScrollerInfo()!
                const {isSizeFixed, itemSize} = sync.current

                if (isSizeFixed) {
                    targetStart = itemSize! * index
                    targetEnd = targetStart + itemSize!
                } else {
                    // !isSizeFixed
                    targetStart = getItemPositionEnd(index - 1)
                    targetEnd = getItemPositionEnd(index)
                }
                if (align === 'nearest') {
                    const scrollEndPosition = scrollPosition + clientSize
                    const startDistance = Math.abs(targetStart - scrollPosition)
                    const endDistance = Math.abs(targetEnd - scrollEndPosition)
                    align = startDistance < endDistance ? 'start' : 'end'
                }

                let targetPosition: number
                switch (align) {
                    case 'start':
                        targetPosition = targetStart + offset
                        break
                    case 'end':
                        targetPosition = targetEnd - clientSize - offset
                        break
                    default:
                        // 'center'
                        targetPosition = targetStart + (targetEnd - targetStart - clientSize) / 2
                }

                scrollerRef.current!.scrollTo({
                    [isVertical ? 'top' : 'left']: targetPosition,
                    behavior
                })
            }
        }

        return scrollerRef.current!
    })

    const totalItemCount = useMemo(() => {
        if (mode === 'list') {
            return totalCount
        }
        if (!groupedCounts) {
            return 0
        }
        const itemCount = groupedCounts.reduce((p, c) => p + c, 0)
        return itemCount + groupedCounts.length
    }, [totalCount, groupedCounts, mode])

    const totalRowCount = useMemo(() => {
        return gridCount > 1 ? Math.ceil(totalItemCount / gridCount) : totalItemCount
    }, [totalItemCount, gridCount])

    const isSizeFixed = !!itemSize && groupTitleSize === itemSize

    const sync = useSync({
        totalItemCount, totalRowCount, bufferCount, gridCount,
        mode, itemSize, isSizeFixed, onRangeChange
    })

    const scrollerRef = useRef<VirtualRef>(null)
    const headerRef = useRef<HTMLElement>(null)
    const footerRef = useRef<HTMLElement>(null)
    const itemRefs = useRef<HTMLElement[]>([])

    const [rowStart, setRowStart] = useSyncState(0)
    const [rowEnd, setRowEnd] = useSyncState(isSizeFixed || !totalRowCount ? -1 : 0)

    const setRowRange = (start: number, end: number, noFlushSync?: boolean) => {
        if (start === rowStart.current && end === rowEnd.current) {
            return
        }

        const fn = () => {
            setRowStart(start)
            setRowEnd(end)
        }
        noFlushSync ? fn() : flushSync(fn)
    }

    const rowStartBuffer = useMemo(() => {
        const {mode, bufferCount} = sync.current
        return mode === 'list'
            ? Math.max(rowStart.current - bufferCount, 0)
            : Math.max(rowStart.current - bufferCount - 1, 0)
    }, [rowStart.current, bufferCount, mode])

    const rangeStart = useSync(rowStartBuffer * gridCount)

    const calRowEndWithBuffer = (end = rowEnd.current) => {
        if (end < 0) {
            return end
        }
        const {bufferCount, totalRowCount} = sync.current
        return Math.min(end + bufferCount, totalRowCount - 1)
    }

    const rowEndBuffer = useSync(
        useMemo(calRowEndWithBuffer, [rowEnd.current, totalRowCount, bufferCount])
    )

    const rangeEnd = useSync(
        useMemo(() => {
            return gridCount === 1
                ? rowEndBuffer.current
                : Math.min((rowEndBuffer.current + 1) * gridCount, totalItemCount) - 1
        }, [rowEndBuffer.current, totalItemCount, gridCount])
    )

    const scrollRatio = useRef(1)
    const fillRatio = useRef(1)
    const [scrollOffset, _setScrollOffset] = useState(0)

    const setScrollOffset = (scrollPosition: number, clientSize: number) => {
        let computedScrollPosition = Math.min(scrollPosition, MAX_DOM_SIZE - clientSize)
        computedScrollPosition *= scrollRatio.current
        _setScrollOffset(computedScrollPosition - scrollPosition)
        return computedScrollPosition
    }

    useMemo(() => {
        sync.current.onRangeChange?.(rangeStart.current, rangeEnd.current)
    }, [rangeStart.current, rangeEnd.current])

    const offsetSize = isVertical ? 'offsetHeight' : 'offsetWidth'

    const getScrollerInfo = () => {
        const scroller = scrollerRef.current
        if (scroller) {
            return {
                clientSize: scroller[isVertical ? 'clientHeight' : 'clientWidth'],
                scrollSize: scroller[isVertical ? 'scrollHeight' : 'scrollWidth'],
                scrollPosition: scroller[isVertical ? 'scrollTop' : 'scrollLeft'],
            }
        }
    }

    /**
     * --------------------------------------------------------------------------------------------
     * 固定尺寸的情况
     */

    const updateRatioWithFixed = () => {
        const {isSizeFixed, totalRowCount, itemSize} = sync.current
        if (!isSizeFixed || !scrollerRef.current) {
            return
        }
        suppressScrollerResize.current = true
        const headerHeight = headerRef.current?.offsetHeight || 0
        const footerHeight = footerRef.current?.offsetHeight || 0
        const contentSize = itemSize! * totalRowCount + headerHeight + footerHeight

        if (contentSize > MAX_DOM_SIZE) {
            const {clientSize} = getScrollerInfo()!
            scrollRatio.current = (contentSize - clientSize) / (MAX_DOM_SIZE - clientSize)

            const onePageCount = calRowEndWithBuffer(Math.ceil(clientSize / itemSize!))
            const onePageContentSize = onePageCount * itemSize!
            fillRatio.current = (MAX_DOM_SIZE - onePageContentSize) / (contentSize - onePageContentSize)
        } else {
            scrollRatio.current = fillRatio.current = 1
        }
    }

    useEffect(updateRatioWithFixed, [totalRowCount, itemSize, bufferCount])

    const computeRowRangeWithFixed = () => {
        const {itemSize, totalRowCount} = sync.current
        let {scrollPosition, clientSize} = getScrollerInfo()!

        if (itemSize! * totalRowCount > MAX_DOM_SIZE) {
            scrollPosition = setScrollOffset(scrollPosition, clientSize)
        }
        return {
            start: Math.floor(scrollPosition / itemSize!),
            end: Math.ceil((scrollPosition + clientSize) / itemSize!) - 1
        }
    }

    /**
     * --------------------------------------------------------------------------------------------
     * 未固定尺寸的情况
     */

    const cachedSizes = useRef<number[]>([])
    const estimatedItemSize = useRef(0)
    const estimatedWeight = useRef(0)
    const accumulatedSizes = useRef<number[]>([])

    const updateSizes = () => {
        if (isSizeFixed || !scrollerRef.current) {
            return
        }
        const isInitial = !cachedSizes.current.length
        const items = itemRefs.current
        const {length: itemLen} = items
        let sum = 0
        let count = 0
        let isSizeChanged = false

        for (let i = 0; i < itemLen; i++) {
            const itemIndex = rangeStart.current + i
            const cachedSize = cachedSizes.current[itemIndex]
            const currentSize = items[i][offsetSize]

            if (cachedSize === currentSize) {
                continue
            }
            isSizeChanged = true
            // cachedSize为undefined表示该项是第一次渲染，需要计入预估尺寸
            if (typeof cachedSize === 'undefined') {
                sum += currentSize
                count++
            }
            cachedSizes.current[itemIndex] = currentSize
            // 当前元素尺寸改变，需要重新计算后面元素的累加尺寸
            accumulatedSizes.current.splice(itemIndex)
            const acc = getAccumulated(itemIndex - 1)
            accumulatedSizes.current.push(acc + currentSize)
        }

        if (count) {
            estimatedItemSize.current = (estimatedItemSize.current * estimatedWeight.current + sum) / (estimatedWeight.current + count)
            estimatedWeight.current += count
        }
        isSizeChanged && updateRatioWithEstimated()
        // 非首次渲染，且未滚动至底部，需要再次检查渲染元素是否占满视口
        if (!isInitial && rowEnd.current < sync.current.totalRowCount - 1) {
            const {scrollPosition, clientSize} = getScrollerInfo()!
            const scrollEndPosition = scrollPosition + clientSize
            const diff = scrollEndPosition - accumulatedSizes.current[rowEndBuffer.current]

            if (diff > 0) {
                // 未占满
                const estimatedCount = Math.ceil(diff / cachedSizes.current[rowEndBuffer.current])
                const end = sequentialSearch(scrollEndPosition, rangeEnd.current + estimatedCount)
                suppressScrollerResize.current = true
                setRowRange(rowStart.current, end, true)
            }
        }
    }

    const updateRatioWithEstimated = () => {
        suppressScrollerResize.current = true
        const contentSize = getTotalSize()
        if (contentSize > MAX_DOM_SIZE) {
            const {clientSize} = getScrollerInfo()!
            scrollRatio.current = (contentSize - clientSize) / (MAX_DOM_SIZE - clientSize)

            const onePageCount = calRowEndWithBuffer(Math.ceil(clientSize / estimatedItemSize.current))
            const onePageContentSize = getAccumulated(onePageCount)
            fillRatio.current = (MAX_DOM_SIZE - onePageContentSize) / (contentSize - onePageContentSize)
        } else {
            scrollRatio.current = fillRatio.current = 1
        }
    }

    const computeRowRangeWithEstimated = () => {
        let lastAccIndex = accumulatedSizes.current.length - 1
        let {scrollPosition, clientSize} = getScrollerInfo()!

        if (getTotalSize() > MAX_DOM_SIZE) {
            scrollPosition = setScrollOffset(scrollPosition, clientSize)
        }

        const start = scrollPosition >= getAccumulated(lastAccIndex)
            // 超过或等于已缓存的位置，使用顺序查找
            ? sequentialSearch(scrollPosition, lastAccIndex)
            // 在已缓存位置内，使用二分查找
            : binarySearch(scrollPosition, 0, lastAccIndex - 1)

        let end = -1
        // 特殊情况，当totalRowCount为0，首次计算时无estimatedItemSize
        if (estimatedItemSize.current) {
            const estimatedCount = Math.ceil(clientSize / estimatedItemSize.current)
            // 从预估位置开始顺序查找
            end = sequentialSearch(scrollPosition + clientSize, start + estimatedCount - 1)
        }
        return {start, end}
    }

    const sequentialSearch = (targetPosition: number, fromIndex: number) => {
        const {totalRowCount} = sync.current
        if (getAccumulated(fromIndex) <= targetPosition) {
            while (++fromIndex < totalRowCount && getAccumulated(fromIndex) <= targetPosition) {
            }
        } else {
            while (--fromIndex >= 0 && getAccumulated(fromIndex) > targetPosition) {
            }
            fromIndex++
        }
        return fromIndex
    }

    const binarySearch = (targetPosition: number, min: number, max: number) => {
        while (min <= max) {
            const mid = Math.floor((min + max) / 2)
            const midCumulated = getAccumulated(mid) - getCached(mid)
            if (midCumulated === targetPosition) {
                return mid
            }
            if (midCumulated < targetPosition) {
                min = mid + 1
            } else {
                max = mid - 1
            }
        }

        return Math.min(min, max)
    }

    const getAccumulated = (index: number) => {
        if (index < 0) {
            return 0
        }
        const accSizes = accumulatedSizes.current
        const {length: accLen} = accSizes
        if (index >= accLen) {
            let acc = accSizes[accLen - 1] || 0
            for (let i = accLen; i <= index; i++) {
                acc += getCached(i)
                accSizes.push(acc)
            }
        }

        return accSizes[index]
    }

    const getCached = (index: number) => {
        return cachedSizes.current[index] ?? estimatedItemSize.current
    }

    const getTotalSize = () => {
        return getItemPositionEnd(sync.current.totalRowCount)
    }

    const getItemPositionEnd = (index: number) => {
        if (index < 0) {
            return 0
        }
        const {length: accLen} = accumulatedSizes.current
        if (index < accLen) {
            return accumulatedSizes.current[index]
        }
        const acc = accumulatedSizes.current[accLen - 1] || 0
        const est = (index - accLen) * estimatedItemSize.current
        return acc + est
    }

    /**
     * --------------------------------------------------------------------------------------------
     * 通用部分
     */

    const computeRowRange = (noFlushSync?: boolean) => {
        if (!scrollerRef.current) {
            return
        }
        const {start, end} = sync.current.isSizeFixed
            ? computeRowRangeWithFixed()
            : computeRowRangeWithEstimated()
        setRowRange(start, end, noFlushSync)
    }

    useEffect(() => {
        computeRowRange(true)
    }, [])

    /**
     * scroller resize
     */

    const suppressScrollerResize = useRef(false)

    useEffect(() => {
        suppressScrollerResize.current && setTimeout(() => {
            suppressScrollerResize.current = false
        })
    })

    useEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) {
            return
        }
        const scrollerResize = new ResizeObserver(() => {
            if (!suppressScrollerResize.current) {
                sync.current.isSizeFixed
                    ? updateRatioWithFixed()
                    : updateRatioWithEstimated()
                computeRowRange()
            }
        })
        scroller && scrollerResize.observe(scroller)

        return () => {
            scrollerResize.disconnect()
        }
    }, [])

    useMemo(() => {
        if (!scrollerRef.current) {
            return
        }
        if (totalRowCount <= rowEnd.current) {
            // 数量变少导致rowEnd超过最大范围
            const {clientSize} = getScrollerInfo()!
            const {isSizeFixed, itemSize} = sync.current

            suppressScrollerResize.current = true
            if (isSizeFixed) {
                const onePageCount = Math.ceil(clientSize / itemSize!)
                setRowRange(totalRowCount - onePageCount, totalRowCount - 1, true)
            } else {
                const estimatedCount = Math.ceil(clientSize / estimatedItemSize.current)
                const start = sequentialSearch(
                    getAccumulated(totalRowCount - 1) - clientSize,
                    totalRowCount - estimatedCount - 1
                )
                setRowRange(start, totalRowCount - 1, true)
            }
        } else {
            const {scrollSize, clientSize} = getScrollerInfo()!
            // 数量变化但内容未填满scroller，需要主动触发计算
            if (scrollSize <= clientSize) {
                suppressScrollerResize.current = true
                computeRowRange(true)
            }
            // else 数量变化时内容已填满，无需计算，只需修改`fillEnd`
        }
    }, [totalRowCount])

    /**
     * item resize
     */

    useMemo(() => {
        computeRowRange(true)
    }, [itemSize])

    const itemResizeObserver = useRef<ResizeObserver>(null)

    if (!isSizeFixed) {
        itemResizeObserver.current ||= new ResizeObserver(() => {
            updateSizes()
        })
    }

    useEffect(() => () => {
        itemResizeObserver.current?.disconnect()
    }, [isSizeFixed])

    const setItemResizeObserver = (r: HTMLElement | null) => {
        if (r) {
            itemRefs.current.push(r)
            itemResizeObserver.current?.observe(r)
        }
    }

    /**
     * scroll listener
     */

    useEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) {
            return
        }
        const scroll = () => {
            computeRowRange()
        }
        scroller.addEventListener('scroll', scroll, {passive: true})

        return () => {
            scroller.removeEventListener('scroll', scroll)
        }
    }, [])

    /**
     * render
     */

    const fillStart = useMemo(() => {
        return isSizeFixed
            ? rowStartBuffer * itemSize
            : getAccumulated(rowStartBuffer - 1)
    }, [rowStartBuffer, itemSize])

    const fillEnd = useMemo(() => {
        return isSizeFixed
            ? Math.max((totalRowCount - 1 - rowEndBuffer.current), 0) * itemSize
            : accumulatedSizes.current.length && rowEndBuffer.current < totalRowCount - 1
                ? getTotalSize() - getAccumulated(rowEndBuffer.current)
                : 0
    }, [rowEndBuffer.current, totalRowCount, itemSize])

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

    const getGroupIndex = (target: number) => {
        let min = 0
        let max = groupTitleIndices.length - 1

        while (min <= max) {
            let mid
            if (min === max) {
                mid = min
            } else {
                const minVal = groupTitleIndices[min]
                mid = (target - minVal) / (groupTitleIndices[max] - minVal) * (max - min) + min
                mid = Math.min(
                    Math.max(Math.floor(mid), min),
                    max
                )
            }
            const midVal = groupTitleIndices[mid]

            if (midVal === target) {
                return {exact: true, groupIndex: mid}
            }
            if (midVal < target) {
                min = mid + 1
            } else {
                max = mid - 1
            }
        }

        return {
            exact: false,
            groupIndex: Math.max(
                Math.min(min, max, groupTitleIndices.length - 1),
                0
            )
        }
    }

    const renderedItems = useMemo(() => {
        if (!renderItemContent) {
            return
        }
        itemRefs.current = []
        const items: ReactNode[] = []
        if (mode === 'list') {
            for (let i = rangeStart.current; i <= rangeEnd.current; i++) {
                const p = typeof itemProps === 'function' ? itemProps(i) : itemProps
                items.push(
                    <ItemComponent
                        key={i}
                        {...p}
                        ref={cloneRef(p?.ref, setItemResizeObserver)}
                        style={{
                            [isVertical ? 'height' : 'width']: itemSize,
                            overflowAnchor: 'none',
                            ...gridCount > 1 && {
                                [isVertical ? 'width' : 'height']: `${100 / gridCount}%`
                            },
                            ...p?.style
                        }}
                    >
                        {renderItemContent(i)}
                    </ItemComponent>
                )
            }
        } else {
            // mode === 'group'
            for (let i = rangeStart.current; i <= rangeEnd.current; i++) {
                const {groupIndex, exact} = getGroupIndex(i)
                const fn = (isTitle = exact) => {
                    if (isTitle && !renderGroupTitleContent) {
                        return
                    }
                    const itemIndex = i - groupIndex - 1
                    const p = isTitle
                        ? typeof itemProps === 'function' ? itemProps(itemIndex) : itemProps
                        : typeof groupTitleProps === 'function' ? groupTitleProps(groupIndex) : groupTitleProps

                    const Component = isTitle ? GroupTitleComponent : ItemComponent

                    items.push(
                        <Component
                            key={isTitle ? groupIndex : `${groupIndex}-${itemIndex}`}
                            {...p}
                            ref={cloneRef(p?.ref, setItemResizeObserver)}
                            style={{
                                [isVertical ? 'height' : 'width']: isTitle ? groupTitleSize : itemSize,
                                overflowAnchor: 'none',
                                ...isTitle && {
                                    position: 'sticky',
                                    top: 0
                                },
                                ...p?.style
                            }}
                        >
                            {isTitle
                                ? renderGroupTitleContent!(groupIndex)
                                : renderItemContent(itemIndex, groupIndex)
                            }
                        </Component>
                    )
                }
                // 第一个元素如果不是标题，需要强制渲染该组标题
                i === rangeStart.current && !exact
                    ? fn(true)
                    : fn()
            }
        }
        return items
    }, [rangeStart.current, rangeEnd.current, renderItemContent, itemProps, groupTitleProps, gridCount, itemSize, groupTitleSize, mode])

    return {
        scrollerRef, headerRef, footerRef,
        scrollerStyle: isVertical ? verticalScrollerStyle : horizontalScrollerStyle,
        scrollOffset: fillStart > MAX_DOM_SIZE / 2 ? 0 : scrollOffset,
        fillStart: fillStart > MAX_DOM_SIZE / 2 ? fillStart - scrollOffset : fillStart,
        fillEnd: fillEnd * fillRatio.current,
        renderedItems
    }
}