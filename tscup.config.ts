import {defineConfig} from '@canlooks/tscup'

export default defineConfig({
    input: '.',
    output: [
        {
            dir: 'dist/esm',
            format: 'esm'
        },
        {
            dir: 'dist/cjs',
            format: 'cjs'
        }
    ]
})