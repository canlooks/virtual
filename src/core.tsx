import {CSSProperties, ReactNode, useEffect, useMemo, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {useSync} from '../src.b'

export type UseVirtualParams = {
    itemSize?: number
    totalCount?: number
    renderItemContent?(index: number): ReactNode
}

const itemClassName = '@canlooks/virtual_item'

const verticalScrollerStyle: CSSProperties = {
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch'
}

export const MAX_DOM_SIZE = 32_000_000

export function useVirtual({
    itemSize,
    totalCount = 0,
    renderItemContent
}: UseVirtualParams) {
    const syncProps = useSync({itemSize, totalCount})

    const [rangeStart, setRangeStart] = useState(0)
    const [rangeEnd, setRangeEnd] = useState(itemSize ? 0 : 1)
    const [scrollOffset, setScrollOffset] = useState(0)

    const scrollerRef = useRef<HTMLDivElement>(null)

    const scrollRatio = useRef(1)
    const bracingRatio = useRef(1)

    const initialize = () => {
        let {clientHeight} = scrollerRef.current!
        if (itemSize) {
            const contentSize = itemSize * totalCount
            if (contentSize > MAX_DOM_SIZE) {
                scrollRatio.current = (contentSize - clientHeight) / (MAX_DOM_SIZE - clientHeight)
                const lastViewportHeight = Math.ceil(clientHeight / itemSize) * itemSize
                bracingRatio.current = (MAX_DOM_SIZE - lastViewportHeight) / (contentSize - lastViewportHeight)
            }
        }
    }

    useEffect(initialize, [totalCount, itemSize])

    const computeRange = (noFlushSync = false) => {
        if (!scrollerRef.current) {
            return
        }
        const {start, end} = syncProps.current.itemSize
            ? computeRangeWithFixedSize()
            : computeRangeWithEstimatedSize()
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

    const computeRangeWithFixedSize = () => {
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
     */

    const cachedSizes = useRef<number[]>([])
    const estimatedItemSize = useRef(0)
    const estimatedWeight = useRef(0)
    const cumulativeSizes = useRef<number[]>([])
    const cumulatedToIndex = useRef(-1)

    const updateCachedSizes = () => {
        if (itemSize) {
            return
        }
        const items = document.getElementsByClassName(itemClassName) as HTMLCollectionOf<HTMLElement>
        let sum = 0
        let count = 0

        for (let i = 0, {length} = items; i < length; i++) {
            const rangeIndex = rangeStart + i
            const cachedSize = cachedSizes.current[rangeIndex]
            const currentSize = items[i].offsetHeight
            if (cachedSize !== currentSize) {
                if (typeof cachedSize === 'undefined') {
                    // cachedSize为undefined表示该项是第一次渲染，需要计入预估尺寸
                    sum += currentSize
                    count++
                }
                if (cumulatedToIndex.current > rangeIndex) {
                    cumulatedToIndex.current = rangeIndex - 1
                    cumulativeSizes.current.splice(rangeIndex)
                }
                cachedSizes.current[rangeIndex] = currentSize
            }
        }
        if (count) {
            estimatedItemSize.current = (estimatedItemSize.current * estimatedWeight.current + sum) / (estimatedWeight.current + count)
            estimatedWeight.current += count
        }
    }

    useEffect(updateCachedSizes, [rangeStart, rangeEnd])

    const computeRangeWithEstimatedSize = () => {
        const {scrollTop, clientHeight} = scrollerRef.current!
        const cumulatedToScrollTop = cumulativeSizes.current[cumulatedToIndex.current] ?? -1

        const start = scrollTop > cumulatedToScrollTop
            // 超过已缓存的位置，使用指数查找
            ? exponentialSearch(scrollTop, cumulatedToIndex.current)
            // 在已缓存位置内，使用二分查找
            : binarySearch(scrollTop, 0, cumulatedToIndex.current)

        const estimatedCount = Math.ceil(clientHeight / estimatedItemSize.current)
        let end = start + estimatedCount - 1
        const scrollBottom = scrollTop + clientHeight
        while (getItemCumulativeSize(end) < scrollBottom) {
            end++
        }

        return {start, end}
    }

    const exponentialSearch = (scrollPosition: number, fromIndex: number) => {
        if (fromIndex < 0) {
            fromIndex = 0
        }
        while (fromIndex < totalCount && getItemCumulativeSize(fromIndex) < scrollPosition) {
            fromIndex = fromIndex * 2 || 1
        }
        return binarySearch(scrollPosition, fromIndex / 2, Math.min(fromIndex, totalCount - 1))
    }

    const binarySearch = (scrollPosition: number, min: number, max: number) => {
        while (min <= max) {
            const mid = Math.floor((min + max) / 2)
            const midSize = getItemCumulativeSize(mid)

            if (midSize === scrollPosition) {
                return mid
            }
            if (midSize < scrollPosition) {
                max = mid - 1
            } else {

                min = mid + 1
            }
        }

        return Math.min(min, max)
    }

    const getItemCumulativeSize = (index: number) => {
        const _cumulatedToIndex = cumulatedToIndex.current
        const _cumulativeSizes = cumulativeSizes.current
        const _cachedSizes = cachedSizes.current
        const _estimatedItemSize = estimatedItemSize.current

        if (index > _cumulatedToIndex) {
            let cumulated = _cumulativeSizes[_cumulatedToIndex] || 0

            for (let i = _cumulatedToIndex + 1; i <= index; i++) {
                cumulated += _cachedSizes[i] ?? _estimatedItemSize
                _cumulativeSizes[i] = cumulated
            }
            cumulatedToIndex.current = index
        }

        return _cumulativeSizes[index]
    }

    /**
     * --------------------------------------------------------------------------------------------
     */

    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            computeRange()
        })
        resizeObserver.observe(scrollerRef.current!)
        return () => {
            resizeObserver.disconnect()
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

    /**
     * --------------------------------------------------------------------------------------------
     */

    const renderedItems = useMemo(() => {
        if (!totalCount || !renderItemContent) {
            return
        }
        const items: ReactNode[] = []
        for (let i = rangeStart; i <= rangeEnd; i++) {
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
    }, [rangeStart, rangeEnd, renderItemContent])

    return {
        scrollerStyle: verticalScrollerStyle,
        scrollerRef,
        scrollOffset,
        bracing: itemSize
            ? {
                start: rangeStart * itemSize * bracingRatio.current,
                end: (totalCount - rangeEnd) * itemSize * bracingRatio.current,
            }
            : {
                start: cumulativeSizes.current[rangeStart - 1] || 0,
                end: (() => {
                    const last = Math.max(rangeEnd, cumulatedToIndex.current)
                    const residue = (totalCount - 1 - last) * estimatedItemSize.current
                    return residue + cumulativeSizes.current[last] - cumulativeSizes.current[rangeEnd]
                })()
            },
        renderedItems
    }
}