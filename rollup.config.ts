import {plugins} from './build/rollup_plugins';
import banner from './build/banner';
import path from 'node:path';
const {BUILD} = process.env;
const production: boolean = (BUILD === 'production');
const suffix = production ? '' : '-dev';
const outputDir = 'dist' ;

const configs = ([
    {
        input: 'src/index.ts',
        output: [{
            name: 'maplibregl',
            file: path.join(outputDir, `maplibre-gl${suffix}.js`),
            format: 'umd',
            banner,
            sourcemap: true
        }, {
            file: path.join(outputDir, `maplibre-gl${suffix}.mjs`),
            format: 'es',
            banner,
            sourcemap: true
        }],
        plugins: plugins(production),
    },
    {
        input: 'src/source/worker.ts',
        output: [{
            name: 'MAPLIBRE_WORKER',
            file: path.join(outputDir, `maplibre-gl-worker${suffix}.js`),
            format: 'umd',
            banner,
            sourcemap: true
        }],
        plugins: plugins(production)
    }
]);

export default configs;
