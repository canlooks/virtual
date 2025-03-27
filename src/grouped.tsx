import {useVirtual} from './core'
import React, {JSX} from 'react'
import {CommonGroupedProps, CommonSlotProps, Obj, SlotComponent} from './types'

export interface GroupedVListSlotProps extends CommonSlotProps {
    list?: Obj
    groupTitle?: Obj
}

export interface GroupedVListProps extends Omit<JSX.IntrinsicElements['div'], 'ref'>, Partial<CommonGroupedProps> {
    /** 自定义渲染元素，默认均为`div` */
    slots?: { [P in keyof GroupedVListSlotProps]?: SlotComponent }
    slotProps?: GroupedVListSlotProps
}

export function GroupedVList({
    slots = {},
    slotProps = {},
    itemSize,
    groupTitleSize,
    groupedCounts,
    bufferCount,
    renderItemContent,
    renderGroupTitleContent,
    orientation,
    onRangeChange,
    ...props
}: GroupedVListProps) {
    const {
        scroller: Scroller = 'div',
        list: List = 'div',
        groupTitle: GroupTitle = 'div',
        item: Item = 'div'
    } = slots as any

    const {
        scrollerStyle, scrollerRef, translate,
        fill: {start, end}, renderedItems
    } = useVirtual({
        mode: 'group',
        ref: props.ref,
        itemSize,
        groupTitleSize,
        totalCount: void 0,
        groupedCounts,
        bufferCount,
        renderItemContent,
        renderGroupTitleContent,
        orientation,
        onRangeChange,
        itemComponent: Item,
        itemProps: slotProps.item,
        groupTitleComponent: GroupTitle,
        groupTitleProps: slotProps.groupTitle
    })

    const isVertical = orientation !== 'horizontal'

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
                {...slotProps.list}
                style={{
                    boxSizing: 'border-box',
                    [isVertical ? 'paddingTop' : 'paddingLeft']: start,
                    [isVertical ? 'paddingBottom' : 'paddingBottom']: end,
                    transform: translate ? `${isVertical ? 'translateY' : 'translateX'}(${translate}px)` : void 0,
                    ...slotProps.list?.style
                }}
            >
                {renderedItems}
            </List>
        </Scroller>
    )
}