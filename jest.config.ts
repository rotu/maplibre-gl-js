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
            displayName: 'unit-nogl',
            testEnvironment: 'jsdom',
            testMatch: [
                '<rootDir>/src/**/*.test.{ts,mts,js}',
            ],
            testPathIgnorePatterns: [
                'src/gl',
                'src/ui/',
                'terrain[.]test[.]ts$',
                'terrain_source_cache[.]test[.]ts$'],
            setupFiles: [
                'jest-canvas-mock',
                './test/unit/lib/web_worker_mock.ts'
            ],
            ...sharedConfig,
        },
        {
            displayName: 'unit-gl',
            testMatch: [
                '<rootDir>/src/gl/**/*.test.{ts,mts,js}',
                '<rootDir>/src/ui/**/*.test.{ts,mts,js}',
                '<rootDir>/src/**/terrain.test.ts',
                '<rootDir>/src/**/terrain_source_cache.test.ts',
            ],
            testEnvironment: 'jsdom',
            setupFiles: [
                'jest-canvas-mock',
                './test/unit/lib/web_worker_mock.ts'
            ],
            ...sharedConfig
        },
        {
            displayName: 'integration-nogl',
            testEnvironment: 'node',
            testMatch: [
                '<rootDir>/test/integration/!(query|browser)/**/*.test.ts',
            ],
            ...sharedConfig,
        },
        {
            displayName: 'integration-gl',
            testEnvironment: 'node',
            testMatch: [
                '<rootDir>/test/integration/(query|browser)/**/*.test.ts',
            ],
            ...sharedConfig,
        },
        {
            displayName: 'build',
            testEnvironment: 'node',
            testMatch: [
                '<rootDir>/test/build/**/*.test.{ts,mts,js}',
            ],
            ...sharedConfig,
        },
        {
            displayName: 'lint-script',
            testMatch: ['<rootDir>/**/*.{ts,tsx,js,html}'],
            testPathIgnorePatterns: ['/dist/', '/staging/', '/node_modules/', '.*_generated.js'],
            runner: 'jest-runner-eslint',
        }
    ]
};

export default config;
