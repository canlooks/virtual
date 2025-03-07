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
        scrollerStyle, scrollerRef, scrollOffset, bracing: {start, end}, renderedItems
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
                style={{
                    paddingTop: start,
                    paddingBottom: end,
                    transform: `translateY(${scrollOffset}px)`
                }}
            >
                {renderedItems}
            </div>
        </div>
    )
}