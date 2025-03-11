import {useVirtual, UseVirtualParams} from './core'
import {JSX} from 'react'

export interface VListProps extends Partial<JSX.IntrinsicElements['div']>, UseVirtualParams {

}

export function VList({
    itemSize,
    totalCount,
    renderItemContent,
    ...props
}: VListProps) {
    const {
        scrollerStyle, scrollerRef, containerRef, scrollOffset,
        bracing: {start, end}, renderedItems
    } = useVirtual({
        itemSize,
        totalCount,
        renderItemContent
    })

    return (
        <div
            {...props}
            ref={scrollerRef}
            style={{
                ...scrollerStyle,
                ...props.style
            }}
        >
            <div
                ref={containerRef}
                style={{
                    paddingTop: start,
                    paddingBottom: end,
                    transform: scrollOffset ? `translateY(${scrollOffset}px)` : void 0
                }}
            >
                {renderedItems}
            </div>
        </div>
    )
}