import {JSX, memo, ReactNode} from 'react'
import {CommonSlotProps, CommonVirtualProps, SlotsAndProps} from './types'
import {useVirtual} from './core'
import {mergeComponentProps} from './util'

export interface VTableSlotProps extends Omit<CommonSlotProps, 'item'> {
    /** 默认为`<table>` */
    table?: JSX.IntrinsicElements['table']
    /** 默认为`<tr>` */
    row?: CommonSlotProps['item']
    /** 默认为`<thead>` */
    thead?: JSX.IntrinsicElements['thead']
    /** 默认为`<tbody>` */
    tbody?: JSX.IntrinsicElements['tbody']
    /** 默认为`<tfoot>` */
    tfoot?: JSX.IntrinsicElements['tfoot']
}

export interface VTableProps extends Omit<CommonVirtualProps, 'itemSize' | 'renderItemContent' | 'orientation'>,
    SlotsAndProps<VTableSlotProps> {
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
        scrollerRef, headerRef, footerRef,
        scrollerStyle, scrollOffset,
        fillStart, fillEnd, renderedItems
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
            {...mergeComponentProps(props, slotProps.scroller, {
                ref: scrollerRef,
                style: scrollerStyle
            })}
        >
            <Table
                {...mergeComponentProps(slotProps.table, {
                    style: {borderSpacing: 0}
                })}
            >
                {!!headerContent &&
                    <TableHead
                        {...mergeComponentProps(slotProps.thead, {
                            ref: headerRef
                        })}
                    >
                        {headerContent}
                    </TableHead>
                }
                <TableBody
                    {...mergeComponentProps(slotProps.tbody, {
                        style: {transform: scrollOffset ? `translateY(${-scrollOffset}px)` : void 0}
                    })}
                >
                    {totalCount
                        ? <>
                            <tr>
                                <td style={{
                                    height: fillStart,
                                    border: 0,
                                    padding: 0
                                }}/>
                            </tr>
                            {renderedItems}
                            <tr>
                                <td style={{
                                    height: fillEnd,
                                    border: 0,
                                    padding: 0
                                }}/>
                            </tr>
                        </>
                        : noRowsPlaceholder
                    }
                </TableBody>
                {!!footerContent &&
                    <TableFoot
                        {...mergeComponentProps(slotProps, {
                            ref: footerRef
                        })}
                    >
                        {footerContent}
                    </TableFoot>
                }
            </Table>
        </Scroller>
    )
})