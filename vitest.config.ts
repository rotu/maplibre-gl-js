/// <reference types="vitest" />
import {defineConfig} from 'vite';

export default defineConfig({
    test: {
        name: 'Browser',
        globals: true,
        include: [
            'test/integration/render/render.test.ts',
            'test/integration/browser/browser.test.ts'
        ],
    },
});
