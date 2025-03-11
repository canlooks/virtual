import {CSSProperties, ReactNode, useEffect, useMemo, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {useSync, useSyncState} from './util'

export type UseVirtualParams = {
    itemSize?: number
    totalCount?: number
    renderItemContent?(index: number): ReactNode
}

const itemClassName = '@canlooks/virtual_item'

const scrollerStyle: CSSProperties = {
    position: 'relative',
    WebkitOverflowScrolling: 'touch'
}

const verticalScrollerStyle: CSSProperties = {
    overflowY: 'auto',
    ...scrollerStyle
}

export const MAX_DOM_SIZE = 32_000_000

export function useVirtual({
    itemSize,
    totalCount = 0,
    renderItemContent
}: UseVirtualParams) {
    const syncProps = useSync({itemSize, totalCount})

    const [rangeStart, setRangeStart] = useSyncState(0)
    const [rangeEnd, setRangeEnd] = useSyncState(itemSize ? -1 : 0)
    const [scrollOffset, setScrollOffset] = useState(0)

    const scrollerRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const scrollRatio = useRef(1)
    const bracingRatio = useRef(1)

    /**
     * --------------------------------------------------------------------------------------------
     * 指定itemSize的情况
     */

    const initialize = () => {
        if (!itemSize || !scrollerRef.current) {
            return
        }
        const contentSize = itemSize * totalCount
        if (contentSize > MAX_DOM_SIZE) {
            let {clientHeight} = scrollerRef.current
            scrollRatio.current = (contentSize - clientHeight) / (MAX_DOM_SIZE - clientHeight)

            const lastPageContentSize = Math.ceil(clientHeight / itemSize) * itemSize
            bracingRatio.current = (MAX_DOM_SIZE - lastPageContentSize) / (contentSize - lastPageContentSize)
        } else {
            scrollRatio.current = bracingRatio.current = 1
        }
    }

    useEffect(initialize, [totalCount, itemSize])

    const computeRangeWithFixed = () => {
        const {itemSize, totalCount} = syncProps.current
        const {scrollTop, clientHeight} = scrollerRef.current!
        let computedScrollTop = scrollTop

        const isOverflowed = itemSize! * totalCount > MAX_DOM_SIZE
        if (isOverflowed) {
            computedScrollTop = Math.min(scrollTop, MAX_DOM_SIZE - clientHeight)
            computedScrollTop *= scrollRatio.current
        }

        const start = Math.floor(computedScrollTop / itemSize!)
        const end = Math.min(Math.ceil((computedScrollTop + clientHeight) / itemSize!), totalCount) - 1

        if (isOverflowed) {
            const originBracingStart = start * itemSize!
            const computedBracingStart = originBracingStart * bracingRatio.current
            setScrollOffset(scrollTop - computedScrollTop + originBracingStart - computedBracingStart)
        }

        return {start, end}
    }

    /**
     * --------------------------------------------------------------------------------------------
     * 未指定itemSize的情况
     */

    const cachedSizes = useRef<number[]>([])
    const estimatedItemSize = useRef(0)
    const estimatedWeight = useRef(0)
    const accumulatedSizes = useRef<number[]>([])

    const updateSizes = () => {
        if (itemSize || !scrollerRef.current) {
            return
        }
        const isInitial = !cachedSizes.current.length
        const items = document.getElementsByClassName(itemClassName) as HTMLCollectionOf<HTMLElement>
        const {length: itemLen} = items
        let sum = 0
        let count = 0

        for (let i = 0; i < itemLen; i++) {
            const cacheIndex = rangeStart.current + i
            const cachedSize = cachedSizes.current[cacheIndex]
            const currentSize = items[i].offsetHeight
            if (cachedSize === currentSize) {
                continue
            }
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
        // 非首次渲染，需要再次检查渲染元素是否占满视口
        if (!isInitial) {
            const lastItem = items[itemLen - 1]
            const {scrollTop, clientHeight} = scrollerRef.current

            if (lastItem.offsetTop + lastItem.offsetHeight < scrollTop + clientHeight) {
                computeRange(true)
            }
        }
    }

    useEffect(updateSizes, [rangeStart.current, rangeEnd.current, !itemSize])

    const updateRatio = () => {
        const contentSize = getTotalSize()
        if (contentSize > MAX_DOM_SIZE) {
            const {totalCount} = syncProps.current
            let {clientHeight} = scrollerRef.current!
            scrollRatio.current = (contentSize - clientHeight) / (MAX_DOM_SIZE - clientHeight)

        } else {
            scrollRatio.current = bracingRatio.current = 1
        }
    }

    const getAccumulated = (index: number) => {
        if (index < 0) {
            return 0
        }

        const _accumulatedSizes = accumulatedSizes.current
        const {length: accLength} = _accumulatedSizes
        if (index >= accLength) {
            let acc = _accumulatedSizes[accLength - 1] || 0
            for (let i = accLength; i <= index; i++) {
                acc += getCached(i)
                _accumulatedSizes.push(acc)
            }
        }

        return _accumulatedSizes[index]
    }

    const getCached = (index: number) => {
        return cachedSizes.current[index] ?? estimatedItemSize.current
    }

    const computeRangeWithEstimated = () => {
        const {totalCount} = syncProps.current
        let lastAccIndex = accumulatedSizes.current.length - 1
        const lastAcc = getAccumulated(lastAccIndex)

        const {scrollTop, clientHeight} = scrollerRef.current!

        const start = scrollTop >= lastAcc
            // 超过或等于已缓存的位置，使用顺序查找
            ? sequentialSearch(scrollTop, lastAccIndex)
            // 在已缓存位置内，使用二分查找
            : binarySearch(scrollTop, 0, lastAccIndex - 1)

        const estimatedCount = Math.ceil(clientHeight / estimatedItemSize.current)
        let end = start + estimatedCount - 1
        const scrollBottom = scrollTop + clientHeight
        while (end < totalCount && getAccumulated(end) < scrollBottom) {
            end++
        }
        end = Math.min(end, totalCount - 1)

        return {start, end}
    }

    const sequentialSearch = (targetPosition: number, fromIndex: number) => {
        const {totalCount} = syncProps.current
        while (fromIndex < totalCount && getAccumulated(fromIndex) <= targetPosition) {
            fromIndex++
        }
        return !totalCount || fromIndex < totalCount ? fromIndex : fromIndex - 1
    }

    const binarySearch = (targetPosition: number, min: number, max: number, interpolation?: boolean) => {
        while (min <= max) {
            const mid = Math.floor(
                interpolation
                    ? (targetPosition - getAccumulated(min)) / (getAccumulated(max) - getAccumulated(min)) * (max - min) + min
                    : (min + max) / 2
            )
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

        return Math.max(Math.min(min, max), 0)
    }

    const getTotalSize = () => {
        const acc = accumulatedSizes.current[accumulatedSizes.current.length - 1] || 0
        const est = (syncProps.current.totalCount - accumulatedSizes.current.length) * estimatedItemSize.current
        return acc + est
    }

    /**
     * --------------------------------------------------------------------------------------------
     * 通用部分
     */

    const computeRange = (noFlushSync = false) => {
        if (!scrollerRef.current) {
            return
        }
        const {start, end} = syncProps.current.itemSize
            ? computeRangeWithFixed()
            : computeRangeWithEstimated()

        const fn = () => {
            setRangeStart(start)
            setRangeEnd(end)
        }
        noFlushSync
            ? fn()
            : flushSync(fn)
    }

    useMemo(() => {
        computeRange(true)
    }, [itemSize])

    useEffect(() => {
        let prevStart = -1
        let prevEnd = -1
        const resizeObserver = new ResizeObserver(() => {
            // resize触发，但range未改变，可能是由于item尺寸改变造成的，需要更新尺寸
            if (rangeStart.current === prevStart && rangeEnd.current === prevEnd) {
                updateSizes()
            }
            computeRange()
            prevStart = rangeStart.current
            prevEnd = rangeEnd.current
        })
        scrollerRef.current && resizeObserver.observe(scrollerRef.current)
        !itemSize && containerRef.current && resizeObserver.observe(containerRef.current)
        return () => {
            resizeObserver.disconnect()
        }
    }, [!itemSize])

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

    const renderedItems = useMemo(() => {
        if (!renderItemContent) {
            return
        }
        const items: ReactNode[] = []
        for (let i = rangeStart.current; i <= rangeEnd.current; i++) {
            items.push(
                <div
                    key={i}
                    className={itemClassName}
                    style={{
                        height: itemSize,
                        overflowAnchor: 'none'
                    }}
                >
                    {renderItemContent(i)}
                </div>
            )
        }
        return items
    }, [rangeStart.current, rangeEnd.current, renderItemContent])

    return {
        scrollerStyle: verticalScrollerStyle,
        scrollerRef,
        containerRef,
        scrollOffset,
        bracing: itemSize
            ? {
                start: rangeStart.current * itemSize * bracingRatio.current,
                end: (totalCount - rangeEnd.current - 1) * itemSize * bracingRatio.current,
            }
            : {
                start: getAccumulated(rangeStart.current - 1) * bracingRatio.current,
                end: accumulatedSizes.current.length
                    ? (getTotalSize() - getAccumulated(rangeEnd.current)) * bracingRatio.current
                    : 0
            },
        renderedItems
    }
}