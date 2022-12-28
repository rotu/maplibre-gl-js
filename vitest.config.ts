/// <reference types="vitest" />
import {defineConfig} from 'vite';

export default defineConfig({
    test: {
        globals: true,
        include: [
            'test/integration/browser/browser.test.ts'
            // 'test/integration/render/render.test.ts'
        ],
    },
});
