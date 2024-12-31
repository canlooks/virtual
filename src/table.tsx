import React, {ComponentType, memo, ReactNode} from 'react'
import {useVirtual, VirtualListCommonProps} from './core'

export type VTableComponents = {
    /** 默认为`<div>` */
    Scroller?: ComponentType<any> | string
    /** 默认为`<table>` */
    Table?: ComponentType<any> | string
    /** 默认为`<tr>` */
    Row?: ComponentType<any> | string
}

export interface VTableProps extends Omit<VirtualListCommonProps, 'itemSize' | 'orientation'>,
    Omit<React.JSX.IntrinsicElements['table'], 'ref'> {
    /** 固定行高，可获得更好的性能 */
    rowHeight?: number
    /**
     * 返回值会被{@link VTableComponents.Row}包裹，
     * 当作{@link VTableComponents.Row}的`children`渲染，
     * 通常应当返回`<td>`元素集
     */
    renderRowContent?(index: number): ReactNode
    /** 表头，包裹在`<thead>`元素内，通常传递`<tr>`元素 */
    header?: ReactNode
    /** 表尾，包裹在`<tfoot>`元素内，通常传递`<tr>`元素 */
    footer?: ReactNode
    components?: VTableComponents
}

export const VTable = memo(({
    ref,
    totalCount = 0,
    bufferCount = 1,

    rowHeight,
    renderRowContent,
    header,
    footer,
    components = {},
    ...props
}: VTableProps) => {
    const {
        Scroller = 'div',
        Table = 'table',
        Row = 'tr'
    } = components as any

    const {
        scrollerRef, scrollerStyle,
        wrapperRef, wrapperStyle,
        renderedItems
    } = useVirtual({
        ref,
        itemSize: rowHeight,
        totalCount,
        bufferCount,
        renderItemContent: renderRowContent,
        itemComponent: Row
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
            <div ref={wrapperRef} style={wrapperStyle}>
                <Table style={{borderSpacing: 0, overflowAnchor: 'none'}}>
                    {!!header &&
                        <thead>
                        {header}
                        </thead>
                    }
                    <tbody>
                    {renderedItems}
                    </tbody>
                    {!!footer &&
                        <tfoot>
                        {footer}
                        </tfoot>
                    }
                </Table>
            </div>
        </Scroller>
    )
})