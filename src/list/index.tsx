import React, {ComponentType, JSX, ReactNode, useMemo} from 'react'
import {useVirtual, VirtualCommonProps} from '../core'

export type VListComponents = {
    Scroller?: ComponentType<any> | string
    List?: ComponentType<any> | string
    Item?: ComponentType<any> | string
}

export interface VListProps extends VirtualCommonProps, Omit<JSX.IntrinsicElements['div'], 'ref'> {
    /** 自定义渲染元素，默认均为`div` */
    components?: VListComponents
}

export function VList({
    ref,
    itemSize,
    totalCount = 0,
    orientation = 'vertical',
    bufferCount = 1,

    renderItemContent,
    components = {},
    ...props
}: VListProps) {
    const {
        Scroller = 'div',
        List = 'div',
        Item = 'div'
    } = components as any

    const {
        scrollerRef, scrollerStyle,
        wrapperRef, wrapperStyle,
        renderedItems
    } = useVirtual({
        ref,
        itemSize,
        totalCount,
        orientation,
        bufferCount,
        renderItemContent,
        itemComponent: Item
    })

    return (
        <Scroller
            {...props}
            ref={scrollerRef}
            style={{
                ...scrollerStyle,
                ...props.style
            }}
        >
            <List ref={wrapperRef} style={wrapperStyle}>
                {renderedItems}
            </List>
        </Scroller>
    )
}