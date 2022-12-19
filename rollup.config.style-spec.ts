import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import { RollupOptions } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

const esm = 'esm' in process.env;

const config: RollupOptions[] = [{
    input: 'src/style-spec/style-spec.ts',
    output: {
        name: 'maplibreGlStyleSpecification',
        file: `dist/style-spec/${esm ? 'index.mjs' : 'index.cjs'}`,
        format: esm ? 'esm' : 'umd',
        sourcemap: true
    },
    plugins: [
        json(),
        // https://github.com/zaach/jison/issues/351
        replace({
            preventAssignment: true,
            include: /\/jsonlint-lines-primitives\/lib\/jsonlint.js/,
            delimiters: ['', ''],
            values: {
                '_token_stack:': ''
            }
        }),
        resolve({
            browser: true,
            preferBuiltins: false,
            // don't allow referencing modules outside the src/style-spec folder
            rootDir: 'src/style-spec'
        }),
        typescript(),
        commonjs()
    ]
}];
export default config;
