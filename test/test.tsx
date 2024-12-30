import {createRoot} from 'react-dom/client'
import {VTable, VTableComponents} from '../src/table'
import {useMemo} from 'react'
import {VList} from '../src/list'
import {GroupedVList} from '../src/grouped'

createRoot(document.getElementById('app')!).render(<App/>)

const tableComponents: VTableComponents = {
    Row: props => <tr {...props} style={{height: 40, ...props.style}}/>
}

function App() {
    const users = useMemo(() => {
        // return Array.from({length: 640_000}, (_, index) => ({
        return Array.from({length: 100_000}, (_, index) => ({
            name: `User ${index}`,
            bgColor: `hsl(${Math.random() * 360}, 70%, 80%)`,
            size: Math.floor(Math.random() * 100) + 100,
            description: `Description for user ${index}`
        }))
    }, [])

    const groupedCounts = useMemo(() => {
        return Array.from({length: 1000}, () => {
            return Math.floor(Math.random() * 10) + 1
        })
    }, [])

    return (
        <>
            {/*<VList*/}
            {/*    style={{height: 400}}*/}
            {/*    // itemSize={100}*/}
            {/*    totalCount={users.length}*/}
            {/*    renderItemContent={index => {*/}
            {/*        const user = users[index]*/}
            {/*        return (*/}
            {/*            <div*/}
            {/*                style={{*/}
            {/*                    backgroundColor: user.bgColor,*/}
            {/*                    padding: '0.5rem',*/}
            {/*                    boxSizing: 'border-box',*/}
            {/*                    height: `${user.size}px`*/}
            {/*                    // height: 100*/}
            {/*                }}*/}
            {/*            >*/}
            {/*                <p><strong>{user.name}</strong></p>*/}
            {/*                <div>{user.description}</div>*/}
            {/*            </div>*/}
            {/*        )*/}
            {/*    }}*/}
            {/*/>*/}
            {/*<VTable*/}
            {/*    style={{height: 400}}*/}
            {/*    components={tableComponents}*/}
            {/*    rowHeight={40}*/}
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

            <GroupedVList
                style={{height: 400}}
                itemSize={40}
                groupedCounts={groupedCounts}
                renderGroupTitle={groupIndex =>
                    <div style={{height: 40}}>
                        Group {groupIndex}
                    </div>
                }
                renderItemContent={(index, groupIndex) =>
                    <div style={{height: 40}}>
                        Item {index} in group {groupIndex}
                    </div>
                }
            />
        </>
    )
}