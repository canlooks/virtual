import {createRoot} from 'react-dom/client'
import {useMemo, useState} from 'react'
import {VList, VTable, GroupedVList} from '../src'

createRoot(document.getElementById('app')!).render(<App/>)

function App() {
    const users = useMemo(() => {
        // return Array.from({length: 640_000}, (_, index) => ({
        return Array.from({length: 400_000}, (_, index) => ({
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

    const [totalCount, setTotalCount] = useState(users.length)

    return (
        <>
            {/*<VList*/}
            {/*    style={{height: 400}}*/}
            {/*    itemSize={150}*/}
            {/*    // gridCount={3}*/}
            {/*    totalCount={totalCount}*/}
            {/*    // totalCount={0}*/}
            {/*    renderItemContent={index => {*/}
            {/*        const user = users[index]*/}
            {/*        return (*/}
            {/*            <div*/}
            {/*                style={{*/}
            {/*                    height: '100%',*/}
            {/*                    // height: user.size,*/}
            {/*                    backgroundColor: user.bgColor,*/}
            {/*                    padding: '0.5rem',*/}
            {/*                    boxSizing: 'border-box'*/}
            {/*                }}*/}
            {/*            >*/}
            {/*                <p><strong>{user.name}</strong></p>*/}
            {/*                <div>size: {user.size}</div>*/}
            {/*                <div>{user.description}</div>*/}
            {/*            </div>*/}
            {/*        )*/}
            {/*    }}*/}
            {/*/>*/}
            <VTable
                style={{height: 400}}
                rowHeight={100}
                totalCount={users.length}
                renderRowContent={index => {
                    const user = users[index]
                    return (
                        <>
                            <td>{user.name}</td>
                            <td>{user.description}</td>
                        </>
                    )
                }}
            />

            {/*<GroupedVList*/}
            {/*    style={{height: 800}}*/}
            {/*    itemSize={100}*/}
            {/*    groupedCounts={groupedCounts}*/}
            {/*    renderGroupTitleContent={groupIndex =>*/}
            {/*        <div style={{*/}
            {/*            height: 100,*/}
            {/*            backgroundColor: 'pink'*/}
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