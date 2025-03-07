import {Dispatch, RefObject, SetStateAction, useCallback, useRef, useState} from 'react'

/**
 * 将某个值使用ref同步，主要用于对付组件的闭包问题
 * @param value
 */
export function useSync<T>(value: T) {
    const v = useRef<T>(value)
    v.current = value
    return v
}

/**
 * 同步的状态，state包裹在ref内，主要用于对付组件的闭包问题
 * @param initialState
 */
export function useSyncState<T>(initialState: T | (() => T)): [RefObject<T>, Dispatch<SetStateAction<T>>]
export function useSyncState<T = undefined>(): [RefObject<T | undefined>, Dispatch<SetStateAction<T | undefined>>]
export function useSyncState(initialState?: any): [RefObject<any>, Dispatch<SetStateAction<any>>] {
    const [state, setState] = useState(initialState)
    const synState = useSync(state)
    return [
        synState,
        useCallback(state => {
            const newState = typeof state === 'function' ? state(synState.current) : state
            synState.current !== newState && setState(synState.current = newState)
        }, [])
    ]
}

/**
 * 二分查找
 * @param arr
 * @param callback 返回负数，向右查找；返回正数，向左查找；返回0表示找到
 * @return 返回目标索引，若为浮点数（如0.5）表示没有找到，索引指向两项之间，使用时可通过 “取余1”来判断，整数取余1得零，否则得0.5
 */
export function binarySearch<T = any>(arr: T[], callback: (value: T, index: number, arr: T[]) => number) {
    let left = 0
    let right = arr.length - 1
    while (left <= right) {
        const mid = Math.floor((left + right) / 2)
        const result = callback(arr[mid], mid, arr)
        if (result === 0) {
            return mid
        }
        if (result < 0) {
            left = mid + 1
        } else {
            right = mid - 1
        }
    }
    return (left + right) / 2
}