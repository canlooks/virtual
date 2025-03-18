import {ComponentType, ReactNode, Ref} from 'react'

export type Obj = Record<any, any>

export type SlotComponent = ComponentType<any> | string

export type ScrollToIndexOptions = {
    index: number
    behavior?: ScrollBehavior
    /** 滚动后目标元素所在的位置，默认为`start` */
    align?: ScrollLogicalPosition
    /**
     * 偏移量，默认为`0`。
     * 例如offset为`10`，{@link align}为`start`时，滚动后目标元素距离容器顶部的距离为`10px`；
     * {@link align}为`end`时，滚动后目标元素距离容器底部的距离为`10px`。
     */
    offset?: number
}

export interface VirtualRef extends HTMLElement {
    scrollToIndex(index: number): void
    scrollToIndex(options: ScrollToIndexOptions): void
}

export type CommonVirtualProps = {
    ref: Ref<VirtualRef> | undefined
    /** 固定元素的尺寸，可获得更好的性能 */
    itemSize: number | undefined
    totalCount: number | undefined
    /** 缓冲数量，默认为`1`，通常无需修改 */
    bufferCount: number | undefined
    renderItemContent: ((index: number) => ReactNode) | undefined
    /** 滚动方向，默认为`vertical` */
    orientation: 'vertical' | 'horizontal' | undefined
    onRangeChange: ((start: number, end: number) => void) | undefined
}

export interface CommonGroupedProps extends Omit<CommonVirtualProps, 'totalCount' | 'renderItemContent'> {
    /** 固定分组标题的尺寸可获得更好的性能，默认与{@link itemSize}相等 */
    groupTitleSize?: number
    /**
     * 分组数量与每组元素的数量，接受一个数组
     * @example [2, 3, 4]，表示总共有3组，每组分别有2, 3, 4个元素
     */
    groupedCounts?: number[]
    /** 返回值会被{@link groupTitleComponent}包裹，当作{@link groupTitleComponent}的`children`渲染 */
    renderGroupTitleContent?(groupIndex: number): ReactNode
    /** 返回值会被{@link itemComponent}包裹，当作{@link itemComponent}的`children`渲染 */
    renderItemContent?(itemIndex: number, groupIndex: number): ReactNode
}

export interface UseVirtualParams extends Omit<CommonVirtualProps, 'renderItemContent'>, Omit<CommonGroupedProps, 'renderItemContent'> {
    mode: 'list' | 'group'
    renderItemContent?(itemIndex: number, groupIndex?: number): ReactNode
    gridCount?: number
    itemComponent: SlotComponent | undefined
    itemProps: Obj | ((index: number) => Obj) | undefined
    groupTitleComponent?: SlotComponent
    groupTitleProps?: Obj | ((groupIndex: number) => Obj) | undefined
}

export type CommonSlotProps = {
    scroller?: Obj
    item?: Obj | ((index: number) => Obj)
}