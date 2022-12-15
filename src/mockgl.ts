import  {HTMLCanvasElement} from '@playcanvas/canvas-mock';
export default function gl(width:number, height:number, _attributes) {
    return new HTMLCanvasElement(width, height).getContext('webgl');
}
