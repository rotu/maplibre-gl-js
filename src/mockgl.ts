import  {HTMLCanvasElement} from '@playcanvas/canvas-mock';
export default function gl(width: number, height: number, _attributes = {}) : WebGLRenderingContext {
    return new HTMLCanvasElement(width, height).getContext('webgl');
}
