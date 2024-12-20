import {createRoot} from 'react-dom/client'
import {useMemo, useRef} from 'react'
import {VList, VListRef} from '../src/list/list'

createRoot(document.getElementById('app')!).render(<App/>)

function App() {
    const users = useMemo(() => {
        return Array.from({length: 1000}, (_, index) => ({
            name: `User ${index}`,
            bgColor: `hsl(${Math.random() * 360}, 70%, 80%)`,
            size: Math.floor(Math.random() * 100) + 100,
            description: `Description for user ${index}`
        }))
    }, [])

    const ref = useRef<VListRef>(null)

    return (
        <>
            <div>
                <button onClick={() => ref.current!.scrollToIndex(0)}>to 0</button>
                <button onClick={() => ref.current!.scrollToIndex(50)}>to 50</button>
                <button onClick={() => ref.current!.scrollToIndex({
                    index: 100,
                    align: 'center',
                    behavior: 'smooth'
                })}>to 100</button>
            </div>
            <VList
                ref={ref}
                style={{height: 800}}
                itemSize={110}
                totalCount={users.length}
                renderItem={index => {
                    const user = users[index]
                    return (
                        <div
                            style={{
                                backgroundColor: user.bgColor,
                                padding: '0.5rem',
                                boxSizing: 'border-box',
                                // height: `${user.size}px`
                                height: 110
                            }}
                        >
                            <p><strong>{user.name}</strong></p>
                            <div>{user.description}</div>
                        </div>
                    )
                }}
            />
        </>
    )
}