import maplibregl from '../index';

import type {WorkerSource} from '../source/worker_source';

export type MessageListener = (
    a: {
        data: any;
        target: any;
    }
) => unknown;

// The main thread interface. Provided by Worker in a browser environment,
export interface WorkerInterface {
    addEventListener(type: 'message', listener: MessageListener): void;
    removeEventListener(type: 'message', listener: MessageListener): void;
    postMessage(message: any): void;
    terminate(): void;
}

export interface WorkerGlobalScopeInterface {
    importScripts(...urls: Array<string>): void;
    registerWorkerSource: (
        b: string,
        a: {
            new(...args: any): WorkerSource;
        }
    ) => void;
    registerRTLTextPlugin: (_: any) => void;
}

export default function workerFactory() {
    // The worker may or may not use modules.
    // but this does allow <link type=modulepreload>
    const workerUrl = maplibregl.workerUrl ?? 'worker.js';
    const resolvedWorkerUrl = (() => {
        try { return import.meta.resolve(workerUrl, import.meta.url); } catch {  }
        try { return new URL(workerUrl, import.meta.url); } catch { }
        return workerUrl;
    })();

    return new Worker(resolvedWorkerUrl, {type: 'module', name: 'Maplibre Worker'});
}
