import {useVirtual, VirtualGroupedCommonProps} from './core'
import React, {ComponentType, JSX} from 'react'

export type GroupedVListComponents = {
    Scroller?: ComponentType<any> | string
    List?: ComponentType<any> | string
    GroupTitle?: ComponentType<any> | string
    Item?: ComponentType<any> | string
}

export interface GroupedVListProps extends VirtualGroupedCommonProps, Omit<JSX.IntrinsicElements['div'], 'ref'> {
    /** 自定义渲染元素，默认均为`div` */
    components?: GroupedVListComponents
    wrapperProps?: JSX.IntrinsicElements['div']
}

export function GroupedVList({
    ref,
    itemSize,
    orientation = 'vertical',
    bufferCount = 1,

    groupedCounts,
    groupTitleSize = itemSize,
    renderGroupTitle,
    renderItemContent,
    components = {},
    ...props
}: GroupedVListProps) {
    const {
        Scroller = 'div',
        List = 'div',
        GroupTitle = 'div',
        Item = 'div'
    } = components as any

    const {
        scrollerRef, scrollerStyle,
        wrapperRef, strut: {start, end},
        renderedItems
    } = useVirtual({
        mode: 'group',
        ref,
        itemSize,
        orientation,
        bufferCount,
        groupedCounts,
        groupTitleSize,
        renderGroupTitle,
        renderItemContent,
        groupTitleComponent: GroupTitle,
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
                    [isVertical ? 'paddingBottom' : 'paddingBottom']: end
                }}
            >
                {renderedItems}
            </List>
        </Scroller>
    )
}