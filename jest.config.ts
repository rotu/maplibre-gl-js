import type {Config} from 'jest';
const transform = {'[.]m?(ts)x?$': ['ts-jest', {isolatedModules: true, useESM: true}]} as Config['transform'];

const config: Config = {
    transform: {},
    // transformIgnorePatterns: [],
    projects: [
        {
            displayName: 'e2e',
            testMatch: [
                '<rootDir>/test/integration/browser/**/*.test.{ts,mts,js}',
                '<rootDir>/test/integration/query/**/*.test.{ts,mts,js}',
            ],
            transform,
            extensionsToTreatAsEsm: ['.ts'],

            // transformIgnorePatterns: [],
            setupFiles: ['<rootDir>/jest-setup.js',
                'jest-canvas-mock'],
        },
        {
            displayName: 'jsdom',
            testMatch: [
                '<rootDir>/test/integration/**/*.test.{ts,mts,js}',
                '<rootDir>/test/integration/**/*.test.{ts,mts,js}',
                '<rootDir>/src/**/*.test.{ts,mts,js}',
            ],
            testEnvironment: 'jsdom',
            transform,
            extensionsToTreatAsEsm: ['.ts'],

            // transformIgnorePatterns: [],
            setupFiles: [
                '<rootDir>/jest-setup.js',

                'jest-canvas-mock',
                './test/unit/lib/web_worker_mock.ts'
            ],
        },
        {
            displayName: 'isolation',
            testMatch: [
                '<rootDir>/test/build/**/*.test.{ts,mts,js}',
            ],
            transform,
            extensionsToTreatAsEsm: ['.ts'],

            // transformIgnorePatterns: [],
            setupFiles: [
                '<rootDir>/jest-setup.js',
                'jest-canvas-mock'],
        }
    ]

};

export default config;
