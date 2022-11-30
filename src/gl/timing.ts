import {isWebGL2} from './webgl2';

interface Timing {
    QUERY_COUNTER_BITS: 0x8864;
    CURRENT_QUERY: 0x8865;
    QUERY_RESULT: 0x8866;
    QUERY_RESULT_AVAILABLE: 0x8867;
    TIMESTAMP: 0x8E28;
    TIME_ELAPSED: 0x88BF;
    GPU_DISJOINT: 0x8FBB;

    createQuery(): WebGLQuery;
    deleteQuery(query: WebGLQuery): void;
    isQueryEXT(query: WebGLQuery): boolean;
    beginQuery(target: GLenum, query: WebGLQuery): void;
    endQuery(target: GLenum): void;

    getQuery(target: Timing['TIME_ELAPSED'], pname: Timing['CURRENT_QUERY']): WebGLQuery | null;
    getQuery(target: Timing['TIMESTAMP'], pname: Timing['CURRENT_QUERY']): null;
    getQuery(target: Timing['TIME_ELAPSED'], pname: Timing['QUERY_COUNTER_BITS']): GLint;
    getQuery(target: Timing['TIMESTAMP'], pname: Timing['QUERY_COUNTER_BITS']): GLint;

    getQueryParameter(query: WebGLQuery, pname: Timing['QUERY_RESULT_AVAILABLE']): GLboolean;
    getQueryParameter(query: WebGLQuery, pname: Timing['QUERY_RESULT']): GLuint64;

    queryCounter(query: WebGLQuery, target: Timing['TIMESTAMP']): void;
}

export type {Timing};

export function getTimingAPI(gl: WebGLRenderingContext) : null | Timing {
    const result = {} as Partial<Timing>;

    if (isWebGL2(gl)) {
        const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!ext) return null;
        for (const m of [
            'createQuery',
            'deleteQuery',
            'isQuery',
            'beginQuery',
            'endQuery',
            'getQuery',
            'getQueryParameter',
        ]) {
            result[m] = gl[m].bind(gl);
        }
        for (const p of ['GPU_DISJOINT', 'QUERY_COUNTER_BITS', 'TIMESTAMP', 'TIME_ELAPSED']) {
            result[p] = ext[`${p}_EXT`];
        }
        for (const p of ['queryCounter']) {
            result[p] = ext[`${p}EXT`].bind(ext);
        }
        for (const p of ['CURRENT_QUERY', 'QUERY_RESULT', 'QUERY_RESULT_AVAILABLE']) {
            result[p] = gl[p];
        }

        return result as Timing;
    }
    {
        const ext = gl.getExtension('EXT_disjoint_timer_query');
        if (!ext) return null;
        for (const m of [
            'createQuery',
            'deleteQuery',
            'isQuery',
            'beginQuery',
            'endQuery',
            'getQuery',
            'queryCounter'
        ]) {
            result[m] = ext[`${m}EXT`].bind(ext);
        }
        result.getQueryParameter = ext.getQueryObjectEXT.bind(ext);

        for (const p of ['QUERY_COUNTER_BITS', 'CURRENT_QUERY', 'QUERY_RESULT', 'QUERY_RESULT_AVAILABLE',
            'TIME_ELAPSED', 'TIMESTAMP', 'GPU_DISJOINT']) {
            result[p] = ext[`${p}_EXT`];
        }

        return result as Timing;
    }
}
