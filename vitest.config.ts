/// <reference types="vitest" />

import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        include: [
            'src/data/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'src/geo/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'src/gl/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        ],
        setupFiles: ['./vitest_setup.ts'],
        globals: true,
    },
    // test :{
    //     include: [
    //         'src/gl/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    //     ],
    //     setupFiles: ['./vitest_setup.ts'],
    //     globals: true,
    //     environment: 'jsdom',
    // }
});
