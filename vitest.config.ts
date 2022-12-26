/// <reference types="vitest" />
import {defineConfig} from 'vite';

export default defineConfig({
    test: {
        include: ['test/integration/render/render.test.ts'],
    },
});
