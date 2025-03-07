import React, {ComponentType, JSX, memo} from 'react'
import {useVirtual, VirtualListCommonProps} from './core'

export type VListComponents = {
    Scroller?: ComponentType<any> | string
    List?: ComponentType<any> | string
    Item?: ComponentType<any> | string
}

export interface VListProps extends VirtualListCommonProps, Omit<JSX.IntrinsicElements['div'], 'ref'> {
    /** 自定义渲染元素，默认均为`div` */
    components?: VListComponents
    wrapperProps?: JSX.IntrinsicElements['div']
}

export const VList = memo(({
    ref,
    itemSize,
    gridCount = 1,
    totalCount = 0,
    orientation = 'vertical',
    bufferCount = 1,

    renderItemContent,
    components = {},
    ...props
}: VListProps) => {
    const {
        Scroller = 'div',
        List = 'div',
        Item = 'div'
    } = components as any

    const {
        scrollerRef, scrollerStyle,
        wrapperRef, strut: {start, end},
        renderedItems
    } = useVirtual({
        ref,
        itemSize,
        gridCount,
        totalCount,
        orientation,
        bufferCount,
        renderItemContent,
        itemComponent: Item
    })

    const isVertical = orientation === 'vertical'

    return (
        <Scroller
            {...props}
            ref={scrollerRef}
            style={{
                ...scrollerStyle,
                ...props.style
            }}
        >
            <List
                ref={wrapperRef}
                style={{
                    boxSizing: 'border-box',
                    [isVertical ? 'paddingTop' : 'paddingLeft']: start,
                    [isVertical ? 'paddingBottom' : 'paddingBottom']: end,
                    ...gridCount > 1 && {
                        display: 'flex',
                        flexWrap: 'wrap',
                        [isVertical ? 'alignItems' : 'justifyContent']: 'flex-start',
                        flexDirection: isVertical ? 'row' : 'column',
                    }
                }}
            >
                {renderedItems}
            </List>
        </Scroller>
    )
})