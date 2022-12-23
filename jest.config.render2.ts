import type {JestConfigWithTsJest} from 'ts-jest';
// NODE_OPTIONS="--experimental-vm-modules" npx jest -c jest.config.render2.ts --no-cache
const config: JestConfigWithTsJest = {
    "preset": "ts-jest/presets/default-esm",

    testMatch: [
        '**/?(*.)+(test2).ts'
    ],
    transform: {
        '[.](js|ts)x?$': ['ts-jest', {
            useESM: true,
            isolatedModules: true,
        }],
    },

    // transformIgnorePatterns: [],
};

export default config;
