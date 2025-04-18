import {useVirtual} from './core'
import {memo} from 'react'
import {CommonSlotProps, CommonVirtualProps, DivProps, SlotsAndProps} from './types'

export interface VListSlotProps extends CommonSlotProps {
    list?: DivProps
}

export interface VListProps extends CommonVirtualProps, SlotsAndProps<VListSlotProps> {
    /** 自定义渲染元素，默认均为`div` */
    gridCount?: number
}

export const VList = memo(({
    slots = {},
    slotProps = {},
    /** 默认为`1`，大于`1`时采用网格布局。例如{@link orientation}为`vertical`时，`gridCount`表示列数 */
    gridCount = 1,
    itemSize,
    totalCount,
    bufferCount,
    renderItemContent,
    orientation,
    onRangeChange,
    ...props
}: VListProps) => {
    const {
        scroller: Scroller = 'div',
        list: List = 'div',
        item: Item = 'div'
    } = slots

    const {
        scrollerRef, scrollerStyle, scrollOffset,
        fillStart, fillEnd, renderedItems
    } = useVirtual({
        mode: 'list',
        ref: props.ref,
        itemSize,
        totalCount,
        gridCount,
        bufferCount,
        renderItemContent,
        orientation,
        onRangeChange,
        itemComponent: Item,
        itemProps: slotProps.item
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
                    [isVertical ? 'paddingTop' : 'paddingLeft']: fillStart,
                    [isVertical ? 'paddingBottom' : 'paddingBottom']: fillEnd,
                    transform: scrollOffset ? `${isVertical ? 'translateY' : 'translateX'}(${-scrollOffset}px)` : void 0,
                    ...gridCount > 1 && {
                        display: 'flex',
                        flexWrap: 'wrap',
                        [isVertical ? 'alignItems' : 'justifyContent']: 'flex-start',
                        flexDirection: isVertical ? 'row' : 'column',
                    },
                    ...slotProps.list?.style
                }}
            >
                {renderedItems}
            </List>
        </Scroller>
    )
})