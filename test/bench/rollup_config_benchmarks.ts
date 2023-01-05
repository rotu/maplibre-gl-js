import replace from '@rollup/plugin-replace';
import {plugins} from '../../build/rollup_plugins';
import {execSync} from 'child_process';
import {RollupOptions} from 'rollup';

let styles = ['https://api.maptiler.com/maps/streets/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL'];

if (process.env.MAPLIBRE_STYLES) {
    styles = process.env.MAPLIBRE_STYLES.split(',').map((style) =>
        style.match(/\.json$/) ? require(style) : style
    );
}

const gitDesc = execSync('git describe --all --always --dirty')
    .toString()
    .trim();
const gitRef = execSync('git rev-parse --short=7 HEAD').toString().trim();
const defaultBenchmarkVersion =
  gitDesc.replace(/^(heads|tags)\//, '') +
  (gitDesc.match(/^heads\//) ? ` ${gitRef}` : '');

const replaceConfig = {
    preventAssignment: true,
    'process.env.BENCHMARK_VERSION': JSON.stringify(
        process.env.BENCHMARK_VERSION || defaultBenchmarkVersion
    ),
    'process.env.MAPLIBRE_STYLES': JSON.stringify(styles),
    'process.env.NODE_ENV': JSON.stringify('production'),
};

const allPlugins = [...plugins(false), replace(replaceConfig)];

const rollupOptions: RollupOptions[] = [
    {
        input: 'src/source/worker.ts',
        output: [{
            name: 'MAPLIBRE_WORKER',
            dir: 'test/bench/versions/',
            format: 'iife',
            sourcemap: true
        },{
            name: 'MAPLIBRE_WORKER',
            dir: 'test/bench/styles/',
            format: 'iife',
            sourcemap: true
        }],
        plugins: allPlugins,
    },
    {
        input: 'test/bench/versions/benchmarks.ts',
        output: {
            file: 'test/bench/versions/benchmarks_generated.js',
            format: 'es',
            sourcemap: true
        },
        plugins: allPlugins,
    },
    {
        input: 'test/bench/styles/benchmarks.ts',
        output: {
            file: 'test/bench/styles/benchmarks_generated.js',
            format: 'es',
            sourcemap: true
        },
        plugins: allPlugins,
    },
    {
        input: 'test/bench/benchmarks_view.tsx',
        output: {
            name: 'Benchmarks',
            file: 'test/bench/benchmarks_view_generated.js',
            format: 'es',
            sourcemap: true
        },
        plugins: allPlugins,
    },
];

export default rollupOptions;
