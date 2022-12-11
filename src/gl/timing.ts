import {isWebGL2} from './webgl2';

export function getTimingAPI(gl: WebGLRenderingContext) {
    if (isWebGL2(gl)) {
        const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!ext) return null;
        return {
            CURRENT_QUERY: gl.CURRENT_QUERY,
            QUERY_RESULT: gl.QUERY_RESULT,
            QUERY_RESULT_AVAILABLE: gl.QUERY_RESULT_AVAILABLE,

            GPU_DISJOINT: ext.GPU_DISJOINT_EXT,
            QUERY_COUNTER_BITS: ext.QUERY_COUNTER_BITS_EXT,
            TIMESTAMP: ext.TIMESTAMP_EXT,
            TIME_ELAPSED: ext.TIME_ELAPSED_EXT,

            createQuery: gl.createQuery.bind(gl),
            deleteQuery: gl.deleteQuery.bind(gl),
            isQuery: gl.isQuery.bind(gl),
            beginQuery: gl.beginQuery.bind(gl),
            endQuery: gl.endQuery.bind(gl),
            getQuery: gl.getQuery.bind(gl),
            getQueryParameter: gl.getQueryParameter.bind(gl),

            queryCounter: ext.queryCounterEXT.bind(ext),
        };
    }
    {
        const ext = gl.getExtension('EXT_disjoint_timer_query');
        if (!ext) return null;
        return {
            CURRENT_QUERY: ext.CURRENT_QUERY_EXT,
            QUERY_RESULT: ext.QUERY_RESULT_EXT,
            QUERY_RESULT_AVAILABLE: ext.QUERY_RESULT_AVAILABLE_EXT,

            GPU_DISJOINT: ext.GPU_DISJOINT_EXT,
            QUERY_COUNTER_BITS: ext.QUERY_COUNTER_BITS_EXT,
            TIMESTAMP: ext.TIMESTAMP_EXT,
            TIME_ELAPSED: ext.TIME_ELAPSED_EXT,

            createQuery: ext.createQueryEXT.bind(ext),
            deleteQuery: ext.deleteQueryEXT.bind(ext),
            isQuery: ext.isQueryEXT.bind(ext),
            beginQuery: ext.beginQueryEXT.bind(ext),
            endQuery: ext.endQueryEXT.bind(ext),
            getQuery: ext.getQueryEXT.bind(ext),
            getQueryParameter: ext.getQueryObjectEXT.bind(ext),

            queryCounter: ext.queryCounterEXT.bind(ext),
        };
    }
}
