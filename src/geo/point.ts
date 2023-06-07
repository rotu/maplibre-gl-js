export class Point {
  x: number
  y: number 
  
  constructor(x:number, y:number) {
    this.x = x
    this.y = y
  }

  static convert(coords: {x:number, y:number} | [number, number]) : Point{
    if ('x' in coords && 'y' in coords && ! ('z' in coords)) {
      return new Point(coords.x, coords.y)
    }
    else if ("length" in coords && coords.length === 2) {
      return new Point(...coords)
    }
    else throw new TypeError(`could not convert object to point: ${coords}`)
  }

  equals(other: Point):boolean {
    if (Object.getPrototypeOf(other) !== Object.getPrototypeOf(this)) {
      throw new TypeError("other is not a point object")
    }
    return this.x === other.x && this.y === other.y
  }

  add(other: Point): Point {
    return new Point(this.x+other.x, this.y+other.y)
  }

  sub(other: Point): Point{
    return new Point(this.x-other.x, this.y-other.y)
  }

  div(scale: number): Point{
    return new Point(this.x / scale, this.y / scale)
  }

  mul(scale: number): Point{
    return new Point(this.x * scale, this.y * scale)
  }

  rotate(angle: number): Point{
    const rx = Math.cos(angle)
    const ry = Math.sin(angle)
    return new Point(this.x*rx - this.y*ry, this.x*ry + this.y*rx)
  }

  angleTo(other: Point): number {
    const diff = this.sub(other)
    return Math.atan2(diff.y, diff.x)
  }
  
  angleWith(other: Point): number {
    const origin = new Point(0, 0)
    return origin.angleTo(other) - origin.angleTo(this)
  }

  rotateAround(angle: number, pivot: Point): Point {
    return this.sub(pivot).rotate(angle).add(pivot)
  }

  dist(other: Point) {
    return this.sub(other).mag()
  }

  distSqr(other: Point) {
    return this.sub(other).mag()**2
  }

  mag(): number {
    return Math.sqrt(this.x*this.x + this.y*this.y)
  }

  perp(): Point {
    return new Point(-this.y, this.x)
  }

  unit(): Point {
    return this.div(this.mag())
  }
  
  round(): Point {
    return new Point(Math.round(this.x),Math.round(this.y))
  }
}

