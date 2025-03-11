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