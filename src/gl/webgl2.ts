/// <reference lib="dom" />

export function isWebGL2(
    gl: WebGLRenderingContext
): gl is WebGL2RenderingContext {
    return gl.canvas.getContext('webgl2') === gl;
}
