import {createRoot} from 'react-dom/client'
import {VTable, VTableComponents} from '../src/table'
import {useMemo} from 'react'
import {VList} from '../src/list'
import {GroupedVList} from '../src/grouped'

createRoot(document.getElementById('app')!).render(<App/>)

const tableComponents: VTableComponents = {
    Row: props => <tr {...props} style={{height: 100, ...props.style}}/>
}

function App() {
    const users = useMemo(() => {
        // return Array.from({length: 640_000}, (_, index) => ({
        return Array.from({length: 100}, (_, index) => ({
            name: `User ${index}`,
            bgColor: `hsl(${Math.random() * 360}, 70%, 80%)`,
            size: Math.floor(Math.random() * 100) + 100,
            description: `Description for user ${index}`
        }))
    }, [])

    const groupedCounts = useMemo(() => {
        return Array.from({length: 100}, () => {
            return Math.floor(Math.random() * 10) + 1
        })
    }, [])

    return (
        <>
            <VList
                style={{height: 400}}
                itemSize={100}
                gridCount={3}
                totalCount={users.length}
                renderItemContent={index => {
                    const user = users[index]
                    return (
                        <div
                            style={{
                                backgroundColor: user.bgColor,
                                padding: '0.5rem',
                                boxSizing: 'border-box',
                                // height: `${user.size}px`
                                height: 100
                            }}
                        >
                            <p><strong>{user.name}</strong></p>
                            <div>{user.description}</div>
                        </div>
                    )
                }}
            />
            {/*<VTable*/}
            {/*    style={{height: 400}}*/}
            {/*    components={tableComponents}*/}
            {/*    rowHeight={100}*/}
            {/*    totalCount={users.length}*/}
            {/*    renderRowContent={index => {*/}
            {/*        const user = users[index]*/}
            {/*        return (*/}
            {/*            <>*/}
            {/*                <td>{user.name}</td>*/}
            {/*                <td>{user.description}</td>*/}
            {/*            </>*/}
            {/*        )*/}
            {/*    }}*/}
            {/*/>*/}

            {/*<GroupedVList*/}
            {/*    style={{height: 400}}*/}
            {/*    itemSize={100}*/}
            {/*    groupedCounts={groupedCounts}*/}
            {/*    renderGroupTitle={groupIndex =>*/}
            {/*        <div style={{*/}
            {/*            height: 100,*/}
            {/*            backgroundColor: '#ffffff'*/}
            {/*        }}>*/}
            {/*            Group {groupIndex}*/}
            {/*        </div>*/}
            {/*    }*/}
            {/*    renderItemContent={(index, groupIndex) =>*/}
            {/*        <div style={{height: 100}}>*/}
            {/*            Item {index} in group {groupIndex}*/}
            {/*        </div>*/}
            {/*    }*/}
            {/*/>*/}
        </>
    )
}