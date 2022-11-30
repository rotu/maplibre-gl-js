/// <reference lib="dom" />

export function isWebGL2(
    gl: WebGLRenderingContext
): gl is WebGL2RenderingContext {
    return gl.getParameter(gl.VERSION).startsWith('WebGL 2.0');
}
