import type {Environment} from 'vitest';

import {builtinEnvironments} from 'vitest/environments';

// import createContext from 'gl';
// import  canvas from 'canvas';

// import JSDOMEnvironment from 'jest-environment-jsdom';

// interface EnvironmentReturn {
//     teardown: (global: any) => Awaitable<void>;
// }
// interface Environment {
//     name: string;
//     setup(global: any, options: Record<string, any>): Awaitable<EnvironmentReturn>;
// }
const jsde = builtinEnvironments.jsdom;
const MyEnvironment = {
    name: 'GL',
    async setup(global: any, options: Record<string, any>) {
        const superSetup = await jsde.setup(global, options);
        // const x = await import ("gl")

        Object.defineProperty(global, 'gl', {value: (await import('gl')).default});

        Object.defineProperty(global, 'ImageData', {value: class ImageData { }});
        // Object.defineProperty(global, 'Canvas', {value: canvas.Canvas});

        // global.gl = gl;
        return {
            teardown: async (x: any) => {
                await superSetup.teardown(x);
            }
        };
    }
} as Environment;

export default MyEnvironment;

// import  JSDOMEnvironment  from 'jest-environment-jsdom';

// class GLEnvironment extends JSDOMEnvironment {
//     constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
//         super(config, context);
//         //foo
//     }
//     async setup() {
//         await super.setup();

//     }
//     async teardown() {
//         return super.teardown();
//     }

// }

// export default GLEnvironment;
