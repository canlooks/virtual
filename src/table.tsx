import React, {JSX, memo, ReactNode} from 'react'
import {CommonSlotProps, CommonVirtualProps, Obj, SlotComponent} from './types'
import {useVirtual} from './core'

export interface VTableSlotProps extends Omit<CommonSlotProps, 'item'> {
    /** 默认为`<table>` */
    table?: Obj
    /** 默认为`<tr>` */
    row?: CommonSlotProps['item']
    /** 默认为`<thead>` */
    thead?: Obj
    /** 默认为`<tbody>` */
    tbody?: Obj
    /** 默认为`<tfoot>` */
    tfoot?: Obj
}

export interface VTableProps extends Omit<JSX.IntrinsicElements['table'], 'ref'>,
    Omit<Partial<CommonVirtualProps>, 'itemSize' | 'renderItemContent' | 'orientation'> {
    slots?: { [P in keyof VTableSlotProps]?: SlotComponent }
    slotProps?: VTableSlotProps
    /** 固定行高，可获得更好的性能 */
    rowHeight?: number
    /**
     * 返回值会被{@link slots.row}包裹，
     * 当作{@link slots.row}的`children`渲染，
     * 通常应当返回`<td>`元素集
     */
    renderRowContent?: CommonVirtualProps['renderItemContent']
    /** 表头，包裹在`<thead>`元素内，通常传递`<tr>`元素 */
    headerContent?: ReactNode
    /** 表尾，包裹在`<tfoot>`元素内，通常传递`<tr>`元素 */
    footerContent?: ReactNode
    /** 无数据占位符 */
    noRowsPlaceholder?: ReactNode
}

export const VTable = memo(({
    slots = {},
    slotProps = {},
    rowHeight,
    renderRowContent,
    headerContent,
    footerContent,
    noRowsPlaceholder,
    totalCount,
    bufferCount,
    onRangeChange,
    ...props
}: VTableProps) => {
    const {
        scroller: Scroller = 'div',
        table: Table = 'table',
        row: Row = 'tr',
        thead: TableHead = 'thead',
        tbody: TableBody = 'tbody',
        tfoot: TableFoot = 'tfoot'
    } = slots

    const {
        scrollerStyle, scrollerRef, translate,
        fill: {start, end}, renderedItems,
    } = useVirtual({
        mode: 'list',
        ref: props.ref,
        itemSize: rowHeight,
        totalCount,
        bufferCount,
        onRangeChange,
        renderItemContent: renderRowContent,
        orientation: 'vertical',
        itemComponent: Row,
        itemProps: slotProps.row

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
            <Table
                {...slotProps.table}
                style={{
                    borderSpacing: 0,
                    transform: translate ? `translateY(${translate}px)` : void 0,
                    ...slotProps.table?.style
                }}
            >
                {!!headerContent &&
                    <TableHead>
                        {headerContent}
                    </TableHead>
                }
                <TableBody>
                    {totalCount
                        ? <>
                            <tr>
                                <td style={{
                                    height: start,
                                    border: 0,
                                    padding: 0
                                }}/>
                            </tr>
                            {renderedItems}
                            <tr>
                                <td style={{
                                    height: end,
                                    border: 0,
                                    padding: 0
                                }}/>
                            </tr>
                        </>
                        : noRowsPlaceholder
                    }
                </TableBody>
                {!!footerContent &&
                    <TableFoot>
                        {footerContent}
                    </TableFoot>
                }
            </Table>
        </Scroller>
    )
})