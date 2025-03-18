import {CSSProperties, ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react'
import {ScrollToIndexOptions, UseVirtualParams, VirtualRef} from './types'
import {flushSync} from 'react-dom'
import {cloneRef, useSync, useSyncState} from './util'

const scrollerStyle: CSSProperties = {
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

export const MAX_DOM_SIZE = 32_000_000

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
                const targetStart = getItemPositionEnd(index - 1)
                const targetEnd = getItemPositionEnd(index)
                const {scrollPosition, scrollerSize} = getScrollerInfo()!

                if (align === 'nearest') {
                    const scrollEndPosition = scrollPosition + scrollerSize
                    const startDistance = Math.abs(targetStart - scrollPosition)
                    const endDistance = Math.abs(targetEnd - scrollEndPosition)
                    align = startDistance < endDistance ? 'start' : 'end'
                }

                let targetPosition
                switch (align) {
                    case 'start':
                        targetPosition = targetStart + offset
                        break
                    case 'end':
                        targetPosition = targetEnd - scrollerSize - offset
                        break
                    default:
                        // 'center'
                        targetPosition = targetStart + (targetEnd - targetStart - scrollerSize) / 2
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

    const totalGridCount = useMemo(() => {
        return gridCount > 1 ? Math.ceil(totalItemCount / gridCount) : totalItemCount
    }, [totalItemCount, gridCount])

    const isSizeFixed = !!itemSize && groupTitleSize === itemSize

    const sync = useSync({
        totalItemCount, totalGridCount, bufferCount, gridCount,
        itemSize, isSizeFixed, onRangeChange
    })

    const scrollerRef = useRef<VirtualRef>(null)
    const itemRefs = useRef<HTMLElement[]>([])

    const scrollRatio = useRef(1)
    const fillRatio = useRef(1)

    const [rangeStart, setRangeStart] = useSyncState(0)
    const [rangeEnd, setRangeEnd] = useSyncState(isSizeFixed || !totalGridCount ? -1 : 0)
    const [scrollOffset, setScrollOffset] = useState(0)

    const gridItemStart = useMemo(() => {
        return rangeStart.current * gridCount
    }, [rangeStart.current, gridCount])

    const gridItemEnd = useMemo(() => {
        return Math.min(rangeEnd.current * gridCount, totalItemCount)
    }, [rangeEnd.current, totalItemCount, gridCount])

    const setRange = (start: number, end: number, noFlushSync?: boolean) => {
        const {totalGridCount, bufferCount, onRangeChange} = sync.current
        start = mode === 'list'
            ? Math.max(start - bufferCount, 0)
            : Math.max(start - bufferCount - 1, 0)
        end = Math.min(end + bufferCount, totalGridCount - 1)

        const fn = () => {
            onRangeChange?.(start, end)
            setRangeStart(start)
            setRangeEnd(end)
        }
        noFlushSync ? fn() : flushSync(fn)

        return {start, end}
    }

    const offsetSize = isVertical ? 'offsetHeight' : 'offsetWidth'
    const offsetPosition = isVertical ? 'offsetTop' : 'offsetLeft'

    const getScrollerInfo = () => {
        const scroller = scrollerRef.current
        if (scroller) {
            return {
                scrollerSize: scroller?.[isVertical ? 'clientHeight' : 'clientWidth'],
                scrollPosition: scroller?.[isVertical ? 'scrollTop' : 'scrollLeft'],
            }
        }
    }

    /**
     * --------------------------------------------------------------------------------------------
     * 固定尺寸的情况
     */

    const updateRatioWithFixed = () => {
        if (!isSizeFixed || !scrollerRef.current) {
            return
        }
        const contentSize = itemSize * totalGridCount
        if (contentSize > MAX_DOM_SIZE) {
            const {scrollerSize} = getScrollerInfo()!
            scrollRatio.current = (contentSize - scrollerSize) / (MAX_DOM_SIZE - scrollerSize)

            const lastPageContentSize = (Math.ceil(scrollerSize / itemSize) + bufferCount) * itemSize
            fillRatio.current = (MAX_DOM_SIZE - lastPageContentSize) / (contentSize - lastPageContentSize)
        } else {
            scrollRatio.current = fillRatio.current = 1
        }
    }

    useEffect(updateRatioWithFixed, [totalGridCount, itemSize, bufferCount])

    const computeRangeWithFixed = () => {
        const {itemSize, totalGridCount} = sync.current
        const {scrollPosition, scrollerSize} = getScrollerInfo()!
        let computedPosition = scrollPosition

        const overflowed = itemSize! * totalGridCount > MAX_DOM_SIZE
        if (overflowed) {
            computedPosition = Math.min(scrollPosition, MAX_DOM_SIZE - scrollerSize)
            computedPosition *= scrollRatio.current
            setScrollOffset(computedPosition - scrollPosition)
        }

        return {
            start: Math.floor(computedPosition / itemSize!),
            end: Math.ceil((computedPosition + scrollerSize) / itemSize!) - 1
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
            const cacheIndex = gridItemStart + i
            const cachedSize = cachedSizes.current[cacheIndex]
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
            cachedSizes.current[cacheIndex] = currentSize
            accumulatedSizes.current.splice(cacheIndex)
            const acc = getAccumulated(cacheIndex - 1)
            accumulatedSizes.current.push(acc + currentSize)
        }
        if (count) {
            estimatedItemSize.current = (estimatedItemSize.current * estimatedWeight.current + sum) / (estimatedWeight.current + count)
            estimatedWeight.current += count
        }
        isSizeChanged && updateRatioWithEstimated()
        // 非首次渲染，需要再次检查渲染元素是否占满视口
        if (!isInitial && gridItemEnd < sync.current.totalGridCount - 1) {
            const {[offsetPosition]: itemPosition, [offsetSize]: itemSize} = items[itemLen - 1]
            const {scrollPosition, scrollerSize} = getScrollerInfo()!
            const scrollEndPosition = scrollPosition + scrollerSize
            const diff = scrollEndPosition - (itemPosition + itemSize)
            if (diff > 0) {
                const estimatedCount = Math.ceil(diff / itemSize)
                const end = sequentialSearch(scrollEndPosition, gridItemEnd + estimatedCount)
                setRange(gridItemStart, end, true)
            }
        }
    }

    const updateRatioWithEstimated = () => {
        const contentSize = getTotalSize()
        if (contentSize > MAX_DOM_SIZE) {
            const {scrollerSize} = getScrollerInfo()!
            scrollRatio.current = (contentSize - scrollerSize) / (MAX_DOM_SIZE - scrollerSize)

            const {totalGridCount} = sync.current
            const {length: accLen} = accumulatedSizes.current
            const estimatedCount = Math.ceil(scrollerSize / estimatedItemSize.current)
            let lastPageContentSize

            if (accLen === totalGridCount) {
                const lastPageStartIndex = sequentialSearch(
                    contentSize - scrollerSize,
                    totalGridCount - estimatedCount - 1
                )
                lastPageContentSize = accumulatedSizes.current[accLen - 1] - accumulatedSizes.current[lastPageStartIndex - 1]
            } else {
                lastPageContentSize = estimatedCount * estimatedItemSize.current
            }

            fillRatio.current = (MAX_DOM_SIZE - lastPageContentSize) / (contentSize - lastPageContentSize)
        } else {
            scrollRatio.current = fillRatio.current = 1
        }
    }

    const computeRangeWithEstimated = () => {
        let lastAccIndex = accumulatedSizes.current.length - 1
        const {scrollPosition, scrollerSize} = getScrollerInfo()!
        let computedPosition = scrollPosition

        const overflowed = getTotalSize() > MAX_DOM_SIZE
        if (overflowed) {
            computedPosition = Math.min(scrollPosition, MAX_DOM_SIZE - scrollerSize)
            computedPosition *= scrollRatio.current
            setScrollOffset(computedPosition - scrollPosition)
        }

        const start = computedPosition >= getAccumulated(lastAccIndex)
            // 超过或等于已缓存的位置，使用顺序查找
            ? sequentialSearch(computedPosition, lastAccIndex)
            // 在已缓存位置内，使用二分查找
            : binarySearch(computedPosition, 0, lastAccIndex - 1)

        let end = -1
        // 特殊情况，当totalGridCount为0，首次计算时无estimatedItemSize
        if (estimatedItemSize.current) {
            const estimatedCount = Math.ceil(scrollerSize / estimatedItemSize.current)
            // 从预估位置开始顺序查找
            end = sequentialSearch(computedPosition + scrollerSize, start + estimatedCount - 1)
        }
        console.log(start, end)
        return {start, end}
    }

    const sequentialSearch = (targetPosition: number, fromIndex: number) => {
        const {totalGridCount} = sync.current
        if (getAccumulated(fromIndex) <= targetPosition) {
            while (++fromIndex < totalGridCount && getAccumulated(fromIndex) <= targetPosition) {
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

        const _accumulatedSizes = accumulatedSizes.current
        const {length: accLen} = _accumulatedSizes
        if (index >= accLen) {
            let acc = _accumulatedSizes[accLen - 1] || 0
            for (let i = accLen; i <= index; i++) {
                acc += getCached(i)
                _accumulatedSizes.push(acc)
            }
        }

        return _accumulatedSizes[index]
    }

    const getCached = (index: number) => {
        return cachedSizes.current[index] ?? estimatedItemSize.current
    }

    const getTotalSize = () => {
        return getItemPositionEnd(sync.current.totalGridCount)
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

    const computeRange = (noFlushSync?: boolean) => {
        if (!scrollerRef.current) {
            return
        }
        const {start, end} = sync.current.isSizeFixed
            ? computeRangeWithFixed()
            : computeRangeWithEstimated()
        setRange(start, end, noFlushSync)
    }

    useMemo(() => {
        computeRange(true)
    }, [itemSize])

    const itemResize = useRef<ResizeObserver>(null)

    if (!isSizeFixed) {
        itemResize.current ||= new ResizeObserver(() => {
            updateSizes()
        })
    }

    useEffect(() => () => {
        itemResize.current?.disconnect()
    }, [isSizeFixed])

    const setItemResizeObserver = (r: HTMLElement | null) => {
        if (r) {
            itemRefs.current.push(r)
            itemResize.current?.observe(r)
        }
    }

    useEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) {
            return
        }
        const scrollerResize = new ResizeObserver(() => {
            computeRange()
        })
        scroller && scrollerResize.observe(scroller)

        return () => {
            scrollerResize.disconnect()
        }
    }, [])

    useEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) {
            return
        }
        const scroll = () => {
            computeRange()
        }
        scroller.addEventListener('scroll', scroll, {passive: true})

        return () => {
            scroller.removeEventListener('scroll', scroll)
        }
    }, [])

    useMemo(() => {
        if (totalGridCount > gridItemEnd || !scrollerRef.current) {
            return
        }
        const {scrollerSize} = getScrollerInfo()!
        const {isSizeFixed, itemSize} = sync.current

        if (isSizeFixed) {
            const onePageCount = Math.ceil(scrollerSize / itemSize!)
            setRange(totalGridCount - onePageCount, totalGridCount - 1, true)
        } else {
            const estimatedCount = Math.ceil(scrollerSize / estimatedItemSize.current)
            const start = sequentialSearch(
                getAccumulated(totalGridCount - 1) - scrollerSize,
                totalGridCount - estimatedCount - 1
            )
            setRange(start, totalGridCount - 1, true)
        }
    }, [totalGridCount])

    const fillStart = useMemo(() => {
        return isSizeFixed
            ? rangeStart.current * itemSize
            : getAccumulated(rangeStart.current - 1)
    }, [rangeStart.current, itemSize])

    const fillEnd = useMemo(() => {
        return isSizeFixed
            ? Math.max((totalGridCount - 1 - rangeEnd.current), 0) * itemSize
            : accumulatedSizes.current.length && rangeEnd.current < totalGridCount
                ? (getTotalSize() - getAccumulated(rangeEnd.current))
                : 0
    }, [rangeEnd.current, totalGridCount, itemSize])

    const translate = useMemo(() => {
        if (!scrollOffset || !fillEnd) {
            return 0
        }
        const computedFillStart = fillStart * fillRatio.current
        return fillStart - computedFillStart - scrollOffset
    }, [scrollOffset, fillStart, fillEnd])

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
            for (let i = gridItemStart; i <= gridItemEnd; i++) {
                const p = typeof itemProps === 'function' ? itemProps(i) : itemProps
                items.push(
                    <ItemComponent
                        key={i}
                        {...p}
                        ref={cloneRef(p?.ref, setItemResizeObserver)}
                        style={{
                            overflowAnchor: 'none',
                            [isVertical ? 'height' : 'width']: itemSize,
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
            for (let i = gridItemStart; i <= gridItemEnd; i++) {
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
                i === gridItemStart && !exact
                    ? fn(true)
                    : fn()
            }
        }
        return items
    }, [gridItemStart, gridItemEnd, renderItemContent, itemProps, groupTitleProps, gridCount, itemSize, groupTitleSize])

    return {
        scrollerStyle: isVertical ? verticalScrollerStyle : horizontalScrollerStyle,
        scrollerRef,
        translate,
        fill: {
            start: fillStart * fillRatio.current,
            end: fillEnd * fillRatio.current
        },
        renderedItems
    }
}