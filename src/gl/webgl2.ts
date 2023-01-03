export function isWebGL2(
    gl: WebGLRenderingContext
): gl is WebGL2RenderingContext {
    return gl.constructor.name === 'WebGL2RenderingContext';
}
