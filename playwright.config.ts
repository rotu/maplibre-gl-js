import type {PlaywrightTestConfig} from '@playwright/test';
const config: PlaywrightTestConfig = {
    testMatch: '**/*.pwtest.ts',

    use: {
        headless: true,
        viewport: {width: 1280, height: 720},
        ignoreHTTPSErrors: true,
        video: 'on-first-retry',
    },
};
export default config;
