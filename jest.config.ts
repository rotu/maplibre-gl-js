import type {JestConfigWithTsJest} from 'ts-jest';

const config: JestConfigWithTsJest = {
    testMatch: [
        '**/?(*.)+(test2).+(ts|tsx|js)'
    ],
    transform: {
        '[.](js|ts)x?$': ['ts-jest', {
            isolatedModules: true
        }],
    },
    transformIgnorePatterns: [],
};

export default config;
