import {CSSProperties, ReactNode, useEffect, useMemo, useRef, useState} from 'react'
import {flushSync} from 'react-dom'

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

    const computeRange = (suppressFlushSync = false) => {
        if (!scrollerRef.current) {
            return
        }

        const {scrollTop, clientHeight} = scrollerRef.current
        let computedScrollTop = scrollTop

        if (itemSize) {
            const isOverflowed = itemSize * totalCount > MAX_DOM_SIZE
            if (isOverflowed) {
                computedScrollTop = Math.min(scrollTop, MAX_DOM_SIZE - clientHeight)
                computedScrollTop *= scrollRatio.current
            }
            const newStart = Math.floor(computedScrollTop / itemSize)
            const newEnd = Math.min(Math.ceil((computedScrollTop + clientHeight) / itemSize), totalCount)
            if (isOverflowed) {
                const originBracingStart = newStart * itemSize
                const computedBracingStart = originBracingStart * bracingRatio.current
                setScrollOffset(scrollTop - computedScrollTop + originBracingStart - computedBracingStart)
            }
            const fn = () => {
                setRangeStart(newStart)
                setRangeEnd(newEnd)
            }
            suppressFlushSync
                ? fn()
                : flushSync(fn)
        } else {
            const cumulatedToScrollTop = cumulativeSizes.current[cumulatedToIndex.current] || 0
            if (scrollTop > cumulatedToScrollTop) {
                // 超过已缓存的位置，使用指数查找
                exponentialSearch(scrollTop, cumulatedToIndex.current)
            } else {
                // 在已缓存位置内，使用二分查找
                binarySearch()
            }
        }
    }

    useMemo(() => {
        computeRange(true)
    }, [itemSize])

    /**
     * --------------------------------------------------------------------------------------------
     */

    const cachedSizes = useRef<number[]>([])
    const estimatedItemSize = useRef(0)
    const estimatedWeight = useRef(0)

    const updateCachedSizes = () => {
        const items = document.getElementsByClassName(itemClassName) as HTMLCollectionOf<HTMLElement>
        for (let i = 0, {length} = items; i < length; i++) {
            const rangeIndex = rangeStart + i
            cachedSizes.current[rangeIndex] = items[i].offsetHeight
        }
    }

    useEffect(updateCachedSizes, [rangeStart, rangeEnd])

    const cumulativeSizes = useRef<number[]>([])
    const cumulatedToIndex = useRef(-1)

    const exponentialSearch = (scrollTop: number, fromIndex: number) => {
        if (fromIndex < 0) {
            fromIndex = 0
        }
        let i = 1
        while (fromIndex < totalCount && getItemCumulativeSize(fromIndex) < scrollTop) {
            fromIndex += i
            i *= 2
        }
        return binarySearch(scrollTop, fromIndex / 2, Math.min(fromIndex, totalCount - 1))
    }

    const binarySearch = (scrollTop: number, min: number, max: number) => {

    }

    const getItemCumulativeSize = (index: number) => {
        const _cumulatedToIndex = cumulatedToIndex.current
        const _cumulativeSizes = cumulativeSizes.current
        const _cachedSizes = cachedSizes.current
        const _estimatedItemSize = estimatedItemSize.current

        if (index > _cumulatedToIndex) {
            let cumulated = _cumulativeSizes[_cumulatedToIndex] || 0
            for (let i = _cumulatedToIndex + 1; i <= index; i++) {
                cumulated += _cachedSizes[i] || _estimatedItemSize
                _cumulativeSizes[i] = cumulated
            }
            cumulatedToIndex.current = index
        }
        return cumulativeSizes.current[index]
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
        for (let i = rangeStart; i < rangeEnd; i++) {
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
                start: 0,
                end: 0
            },
        renderedItems
    }
}