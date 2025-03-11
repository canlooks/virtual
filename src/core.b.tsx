import {MAX_DOM_SIZE} from './core'

const updateSizes = () => {
    if (itemSize) {
        return
    }
    const items = document.getElementsByClassName(itemClassName) as HTMLCollectionOf<HTMLElement>
    let sizeChanged = false
    let sum = 0
    let count = 0

    for (let i = 0, {length} = items; i < length; i++) {
        const cacheIndex = rangeStart + i
        const cachedSize = cachedSizes.current[cacheIndex]
        const currentSize = items[i].offsetHeight

        if (cachedSize === currentSize) {
            continue
        }
        sizeChanged = true
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
    if (sizeChanged) {
        // updateRatio()
        computeRange()
    }
}

const updateRatio = () => {
    const contentSize = getTotalSize()
    if (contentSize > MAX_DOM_SIZE) {
        const {totalCount} = syncProps.current
        let {clientHeight} = scrollerRef.current!
        scrollRatio.current = (contentSize - clientHeight) / (MAX_DOM_SIZE - clientHeight)

        const lastPageContentSize = accumulatedSizes.current.length === totalCount
            // accumulatedSizes长度与totalCount相等时，说明已经累计到最后一个元素，使用插值查找
            ? binarySearch(accumulatedSizes.current[totalCount - 1] - clientHeight, 0, totalCount - 1, true)
            : Math.ceil(clientHeight / estimatedItemSize.current) * estimatedItemSize.current
        bracingRatio.current = (MAX_DOM_SIZE - lastPageContentSize) / (contentSize - lastPageContentSize)
    } else {
        scrollRatio.current = bracingRatio.current = 1
    }
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
    console.log(168, getAccumulated(end), scrollBottom)
    end = Math.min(end, totalCount - 1)

    return {start, end}
}

const sequentialSearch = (targetPosition: number, fromIndex: number) => {
    const {totalCount} = syncProps.current
    while (fromIndex < totalCount && getAccumulated(fromIndex) <= targetPosition) {
        fromIndex++
    }
    return fromIndex < totalCount ? fromIndex : fromIndex - 1
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

const getTotalSize = () => {
    const acc = accumulatedSizes.current[accumulatedSizes.current.length - 1] || 0
    const est = (totalCount - accumulatedSizes.current.length) * estimatedItemSize.current
    return acc + est
}