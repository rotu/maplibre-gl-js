import {Config} from 'jest';

const sharedConfig = {
    transform: {
        // use typescript to convert from esm to cjs
        '[.](m|c)?(ts|js)(x)?$': ['ts-jest', {
            'isolatedModules': true,
        }],
    },
    // in build-tests, we might want to import these files
    transformIgnorePatterns: ['<rootDir>/dist']
} as Partial<Config>;

const config: Config = {
    projects: [
        {
            displayName: 'e2e',
            testMatch: [
                '<rootDir>/test/integration/query/query.test.ts',
            ],
            ...sharedConfig,
        },
        {
            displayName: 'jsdom',
            testMatch: [
                '<rootDir>/src/**/*.test.{ts,mts,js}',
                '<rootDir>/test/integration/expression/expression.test.ts',
                '<rootDir>/test/integration/symbol-shaping/shaping.test.ts',
            ],
            testEnvironment: 'jsdom',
            setupFiles: [
                'jest-canvas-mock',
                './test/unit/lib/web_worker_mock.ts'
            ],
            ...sharedConfig,
        },
        {
            displayName: 'bare',
            testEnvironment: 'node',
            testMatch: [
                '<rootDir>/test/integration/browser/browser.test.ts',
                '<rootDir>/test/integration/style-spec/validate_spec.test.ts',
                '<rootDir>/test/build/**/*.test.{ts,mts,js}',
            ],
            setupFiles: [],
            ...sharedConfig,
        },
        {
            displayName: 'stylelint',
            runner: 'jest-runner-stylelint',
            testMatch: ['stylelint src/css/maplibre-gl.css'],
        },
        {
            displayName: 'eslint',
            testMatch: ['<rootDir>/**/*.{ts,tsx,js,html}'],
            testPathIgnorePatterns: ['/dist/', '/staging/', '/node_modules/', '*_generated.js'],
            
            runner: 'jest-runner-eslint',
    ]

};

export default config;
