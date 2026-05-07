import {ComponentProps, Dispatch, ElementType, Ref, RefObject, SetStateAction, useCallback, useRef, useState} from 'react'
import {Obj} from './types'

export function computeMaxDomSize() {
    const t = document.createElement('div')
    t.style.position = 'fixed'
    t.style.height = (navigator.userAgent.includes('Firefox') ? 1e7 : 4e7) + 'px'
    document.body.appendChild(t)
    const {offsetHeight} = t
    t.remove()
    return offsetHeight / 2
}

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
 * 克隆Ref
 * @param refs
 */
export function cloneRef<T>(...refs: (Ref<T> | undefined)[]): (ref: T | null) => void {
    return (r: T | null) => {
        refs.forEach(ref => {
            if (ref) {
                if (typeof ref === 'function') {
                    ref(r)
                } else {
                    ref.current = r
                }
            }
        })
    }
}

/**
 * 判断变量是否为undefined或null
 * @param it
 */
export function isUnset(it: any): it is undefined | null {
    return typeof it === 'undefined' || it === null
}

/**
 * 将某个值统一转换成数组或null
 * @param value
 */
export function toArray(value?: undefined | null): null
export function toArray<T>(value: T): T extends any[] ? T : T extends undefined | null ? null : T[]
export function toArray(value: any) {
    return isUnset(value)
        ? null
        : Array.isArray(value) ? value : [value]
}

/**
 * 拼接元素的类名
 * @param classes
 */
export function clsx(...classes: any[]) {
    const ret: string[] = []
    for (let i = 0, {length} = classes; i < length; i++) {
        const cls = classes[i]
        if (!cls) {
            continue
        }
        if (typeof cls === 'object') {
            if (Array.isArray(cls)) {
                cls.length && ret.push(clsx(...cls))
            } else {
                for (const k in cls) {
                    cls[k] && ret.push(k)
                }
            }
        } else {
            ret.push(cls)
        }
    }
    return ret.join(' ')
}

/**
 * 合并属性
 */

type ExtendableProps<T> = (T extends ElementType ? ComponentProps<T> : T) & Obj

export function mergeComponentProps<T>(...props: (Partial<ExtendableProps<T>> | null | false | undefined)[]): ExtendableProps<T>
export function mergeComponentProps(...props: any[]) {
    const {length} = props
    if (length <= 1) {
        return props[0]
    }

    const fn = (target: any, source: any) => {
        if (!source) {
            return
        }
        for (const p in source) {
            if (p in target) {
                switch (p) {
                    case 'css':
                        target.css = [...toArray(target.css), ...toArray(source.css)]
                        continue
                    case 'ref':
                        target.ref = cloneRef(target.ref, source.ref)
                        continue
                    case 'className':
                        target.className = clsx(target.className, source.className)
                        continue
                    case 'style':
                        target.style = {...source.style, ...target.style}
                        continue
                    default:
                        const sourceFn = source[p]
                        if (typeof sourceFn === 'function') {
                            const targetFn = target[p]
                            target[p] = (...args: any[]) => {
                                targetFn(...args)
                                sourceFn(...args)
                            }
                            continue
                        }
                }
            }
            target[p] = source[p]
        }
    }

    const merged = {...props[0]}
    for (let i = 1; i < length; i++) {
        fn(merged, props[i])
    }
    return merged
}