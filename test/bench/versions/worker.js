var MAPLIBRE_WORKER = (function () {
    'use strict';

    /**
     * @module util
     * @private
     */
    /**
     * Given a value `t` that varies between 0 and 1, return
     * an interpolation function that eases between 0 and 1 in a pleasing
     * cubic in-out fashion.
     *
     * @private
     */
    function easeCubicInOut(t) {
        if (t <= 0)
            return 0;
        if (t >= 1)
            return 1;
        const t2 = t * t, t3 = t2 * t;
        return 4 * (t < 0.5 ? t3 : 3 * (t - t2) + t3 - 0.75);
    }
    /**
     * constrain n to the given range via min + max
     *
     * @param n value
     * @param min the minimum value to be returned
     * @param max the maximum value to be returned
     * @returns the clamped value
     * @private
     */
    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }
    /**
     * constrain n to the given range, excluding the minimum, via modular arithmetic
     *
     * @param n value
     * @param min the minimum value to be returned, exclusive
     * @param max the maximum value to be returned, inclusive
     * @returns constrained number
     * @private
     */
    function wrap(n, min, max) {
        const d = max - min;
        const w = ((n - min) % d + d) % d + min;
        return (w === min) ? max : w;
    }
    /**
     * Given a destination object and optionally many source objects,
     * copy all properties from the source objects into the destination.
     * The last source object given overrides properties from previous
     * source objects.
     *
     * @param dest destination object
     * @param sources sources from which properties are pulled
     * @private
     */
    function extend$1(dest, ...sources) {
        for (const src of sources) {
            for (const k in src) {
                dest[k] = src[k];
            }
        }
        return dest;
    }
    /**
     * Return whether a given value is a power of two
     * @private
     */
    function isPowerOfTwo(value) {
        return (Math.log(value) / Math.LN2) % 1 === 0;
    }
    /**
     * Given an array of member function names as strings, replace all of them
     * with bound versions that will always refer to `context` as `this`. This
     * is useful for classes where otherwise event bindings would reassign
     * `this` to the evented object or some other value: this lets you ensure
     * the `this` value always.
     *
     * @param fns list of member function names
     * @param context the context value
     * @example
     * function MyClass() {
     *   bindAll(['ontimer'], this);
     *   this.name = 'Tom';
     * }
     * MyClass.prototype.ontimer = function() {
     *   alert(this.name);
     * };
     * var myClass = new MyClass();
     * setTimeout(myClass.ontimer, 100);
     * @private
     */
    function bindAll(fns, context) {
        fns.forEach((fn) => {
            if (!context[fn]) {
                return;
            }
            context[fn] = context[fn].bind(context);
        });
    }
    /**
     * Create an object by mapping all the values of an existing object while
     * preserving their keys.
     *
     * @private
     */
    function mapObject(input, iterator, context) {
        const output = {};
        for (const key in input) {
            output[key] = iterator.call(context || this, input[key], key, input);
        }
        return output;
    }
    /**
     * Create an object by filtering out values of an existing object.
     *
     * @private
     */
    function filterObject(input, iterator, context) {
        const output = {};
        for (const key in input) {
            if (iterator.call(context || this, input[key], key, input)) {
                output[key] = input[key];
            }
        }
        return output;
    }
    /**
     * Deeply clones two objects.
     *
     * @private
     */
    function clone(input) {
        if (Array.isArray(input)) {
            return input.map(clone);
        }
        else if (typeof input === 'object' && input) {
            return mapObject(input, clone);
        }
        else {
            return input;
        }
    }
    /**
     * Check if two arrays have at least one common element.
     *
     * @private
     */
    function arraysIntersect(a, b) {
        for (let l = 0; l < a.length; l++) {
            if (b.indexOf(a[l]) >= 0)
                return true;
        }
        return false;
    }
    /**
     * Print a warning message to the console and ensure duplicate warning messages
     * are not printed.
     *
     * @private
     */
    const warnOnceHistory = {};
    function warnOnce(message) {
        if (!warnOnceHistory[message]) {
            // console isn't defined in some WebWorkers, see #2558
            if (typeof console !== 'undefined')
                console.warn(message);
            warnOnceHistory[message] = true;
        }
    }
    /**
     * Indicates if the provided Points are in a counter clockwise (true) or clockwise (false) order
     *
     * @private
     * @returns true for a counter clockwise set of points
     */
    // http://bryceboe.com/2006/10/23/line-segment-intersection-algorithm/
    function isCounterClockwise(a, b, c) {
        return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    }
    /**
     * Returns the signed area for the polygon ring.  Positive areas are exterior rings and
     * have a clockwise winding.  Negative areas are interior rings and have a counter clockwise
     * ordering.
     *
     * @private
     * @param ring Exterior or interior ring
     */
    function calculateSignedArea(ring) {
        let sum = 0;
        for (let i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
            p1 = ring[i];
            p2 = ring[j];
            sum += (p2.x - p1.x) * (p1.y + p2.y);
        }
        return sum;
    }
    /**
     *  Returns true if the when run in the web-worker context.
     *
     * @private
     * @returns {boolean}
     */
    function isWorker() {
        // @ts-ignore
        return typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
    }
    /**
     * Parses data from 'Cache-Control' headers.
     *
     * @private
     * @param cacheControl Value of 'Cache-Control' header
     * @return object containing parsed header info.
     */
    function parseCacheControl(cacheControl) {
        // Taken from [Wreck](https://github.com/hapijs/wreck)
        const re = /(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g;
        const header = {};
        cacheControl.replace(re, ($0, $1, $2, $3) => {
            const value = $2 || $3;
            header[$1] = value ? value.toLowerCase() : true;
            return '';
        });
        if (header['max-age']) {
            const maxAge = parseInt(header['max-age'], 10);
            if (isNaN(maxAge))
                delete header['max-age'];
            else
                header['max-age'] = maxAge;
        }
        return header;
    }
    let _isSafari = null;
    /**
     * Returns true when run in WebKit derived browsers.
     * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
     * transfer data between WebWorkers and the main thread.
     * https://github.com/mapbox/mapbox-gl-js/issues/8771
     *
     * This should be removed once the underlying Safari issue is fixed.
     *
     * @private
     * @param scope {WindowOrWorkerGlobalScope} Since this function is used both on the main thread and WebWorker context,
     *      let the calling scope pass in the global scope object.
     * @returns {boolean}
     */
    function isSafari(scope) {
        if (_isSafari == null) {
            const userAgent = scope.navigator ? scope.navigator.userAgent : null;
            _isSafari = !!scope.safari ||
                !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))));
        }
        return _isSafari;
    }
    function isImageBitmap(image) {
        return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
    }

    /*
    This file was copied from https://github.com/mapbox/grid-index and was
    migrated from JavaScript to TypeScript.

    Copyright (c) 2016, Mapbox

    Permission to use, copy, modify, and/or distribute this software for any purpose
    with or without fee is hereby granted, provided that the above copyright notice
    and this permission notice appear in all copies.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
    FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
    OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
    TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
    THIS SOFTWARE.
    */
    const NUM_PARAMS = 3;
    class TransferableGridIndex {
        constructor(extent, n, padding) {
            const cells = this.cells = [];
            if (extent instanceof ArrayBuffer) {
                this.arrayBuffer = extent;
                const array = new Int32Array(this.arrayBuffer);
                extent = array[0];
                n = array[1];
                padding = array[2];
                this.d = n + 2 * padding;
                for (let k = 0; k < this.d * this.d; k++) {
                    const start = array[NUM_PARAMS + k];
                    const end = array[NUM_PARAMS + k + 1];
                    cells.push(start === end ? null : array.subarray(start, end));
                }
                const keysOffset = array[NUM_PARAMS + cells.length];
                const bboxesOffset = array[NUM_PARAMS + cells.length + 1];
                this.keys = array.subarray(keysOffset, bboxesOffset);
                this.bboxes = array.subarray(bboxesOffset);
                this.insert = this._insertReadonly;
            }
            else {
                this.d = n + 2 * padding;
                for (let i = 0; i < this.d * this.d; i++) {
                    cells.push([]);
                }
                this.keys = [];
                this.bboxes = [];
            }
            this.n = n;
            this.extent = extent;
            this.padding = padding;
            this.scale = n / extent;
            this.uid = 0;
            const p = (padding / n) * extent;
            this.min = -p;
            this.max = extent + p;
        }
        insert(key, x1, y1, x2, y2) {
            this._forEachCell(x1, y1, x2, y2, this._insertCell, this.uid++, undefined, undefined);
            this.keys.push(key);
            this.bboxes.push(x1);
            this.bboxes.push(y1);
            this.bboxes.push(x2);
            this.bboxes.push(y2);
        }
        _insertReadonly() {
            throw new Error('Cannot insert into a GridIndex created from an ArrayBuffer.');
        }
        _insertCell(x1, y1, x2, y2, cellIndex, uid) {
            this.cells[cellIndex].push(uid);
        }
        query(x1, y1, x2, y2, intersectionTest) {
            const min = this.min;
            const max = this.max;
            if (x1 <= min && y1 <= min && max <= x2 && max <= y2 && !intersectionTest) {
                // We use `Array#slice` because `this.keys` may be a `Int32Array` and
                // some browsers (Safari and IE) do not support `TypedArray#slice`
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/slice#Browser_compatibility
                return Array.prototype.slice.call(this.keys);
            }
            else {
                const result = [];
                const seenUids = {};
                this._forEachCell(x1, y1, x2, y2, this._queryCell, result, seenUids, intersectionTest);
                return result;
            }
        }
        _queryCell(x1, y1, x2, y2, cellIndex, result, seenUids, intersectionTest) {
            const cell = this.cells[cellIndex];
            if (cell !== null) {
                const keys = this.keys;
                const bboxes = this.bboxes;
                for (let u = 0; u < cell.length; u++) {
                    const uid = cell[u];
                    if (seenUids[uid] === undefined) {
                        const offset = uid * 4;
                        if (intersectionTest ?
                            intersectionTest(bboxes[offset + 0], bboxes[offset + 1], bboxes[offset + 2], bboxes[offset + 3]) :
                            ((x1 <= bboxes[offset + 2]) &&
                                (y1 <= bboxes[offset + 3]) &&
                                (x2 >= bboxes[offset + 0]) &&
                                (y2 >= bboxes[offset + 1]))) {
                            seenUids[uid] = true;
                            result.push(keys[uid]);
                        }
                        else {
                            seenUids[uid] = false;
                        }
                    }
                }
            }
        }
        _forEachCell(x1, y1, x2, y2, fn, arg1, arg2, intersectionTest) {
            const cx1 = this._convertToCellCoord(x1);
            const cy1 = this._convertToCellCoord(y1);
            const cx2 = this._convertToCellCoord(x2);
            const cy2 = this._convertToCellCoord(y2);
            for (let x = cx1; x <= cx2; x++) {
                for (let y = cy1; y <= cy2; y++) {
                    const cellIndex = this.d * y + x;
                    if (intersectionTest && !intersectionTest(this._convertFromCellCoord(x), this._convertFromCellCoord(y), this._convertFromCellCoord(x + 1), this._convertFromCellCoord(y + 1)))
                        continue;
                    if (fn.call(this, x1, y1, x2, y2, cellIndex, arg1, arg2, intersectionTest))
                        return;
                }
            }
        }
        _convertFromCellCoord(x) {
            return (x - this.padding) / this.scale;
        }
        _convertToCellCoord(x) {
            return Math.max(0, Math.min(this.d - 1, Math.floor(x * this.scale) + this.padding));
        }
        toArrayBuffer() {
            if (this.arrayBuffer)
                return this.arrayBuffer;
            const cells = this.cells;
            const metadataLength = NUM_PARAMS + this.cells.length + 1 + 1;
            let totalCellLength = 0;
            for (let i = 0; i < this.cells.length; i++) {
                totalCellLength += this.cells[i].length;
            }
            const array = new Int32Array(metadataLength + totalCellLength + this.keys.length + this.bboxes.length);
            array[0] = this.extent;
            array[1] = this.n;
            array[2] = this.padding;
            let offset = metadataLength;
            for (let k = 0; k < cells.length; k++) {
                const cell = cells[k];
                array[NUM_PARAMS + k] = offset;
                array.set(cell, offset);
                offset += cell.length;
            }
            array[NUM_PARAMS + cells.length] = offset;
            array.set(this.keys, offset);
            offset += this.keys.length;
            array[NUM_PARAMS + cells.length + 1] = offset;
            array.set(this.bboxes, offset);
            offset += this.bboxes.length;
            return array.buffer;
        }
        static serialize(grid, transferables) {
            const buffer = grid.toArrayBuffer();
            if (transferables) {
                transferables.push(buffer);
            }
            return { buffer };
        }
        static deserialize(serialized) {
            return new TransferableGridIndex(serialized.buffer);
        }
    }

    var csscolorparser = {};

    var parseCSSColor_1;
    // (c) Dean McNamee <dean@gmail.com>, 2012.
    //
    // https://github.com/deanm/css-color-parser-js
    //
    // Permission is hereby granted, free of charge, to any person obtaining a copy
    // of this software and associated documentation files (the "Software"), to
    // deal in the Software without restriction, including without limitation the
    // rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
    // sell copies of the Software, and to permit persons to whom the Software is
    // furnished to do so, subject to the following conditions:
    //
    // The above copyright notice and this permission notice shall be included in
    // all copies or substantial portions of the Software.
    //
    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    // FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
    // IN THE SOFTWARE.

    // http://www.w3.org/TR/css3-color/
    var kCSSColorTable = {
      "transparent": [0,0,0,0], "aliceblue": [240,248,255,1],
      "antiquewhite": [250,235,215,1], "aqua": [0,255,255,1],
      "aquamarine": [127,255,212,1], "azure": [240,255,255,1],
      "beige": [245,245,220,1], "bisque": [255,228,196,1],
      "black": [0,0,0,1], "blanchedalmond": [255,235,205,1],
      "blue": [0,0,255,1], "blueviolet": [138,43,226,1],
      "brown": [165,42,42,1], "burlywood": [222,184,135,1],
      "cadetblue": [95,158,160,1], "chartreuse": [127,255,0,1],
      "chocolate": [210,105,30,1], "coral": [255,127,80,1],
      "cornflowerblue": [100,149,237,1], "cornsilk": [255,248,220,1],
      "crimson": [220,20,60,1], "cyan": [0,255,255,1],
      "darkblue": [0,0,139,1], "darkcyan": [0,139,139,1],
      "darkgoldenrod": [184,134,11,1], "darkgray": [169,169,169,1],
      "darkgreen": [0,100,0,1], "darkgrey": [169,169,169,1],
      "darkkhaki": [189,183,107,1], "darkmagenta": [139,0,139,1],
      "darkolivegreen": [85,107,47,1], "darkorange": [255,140,0,1],
      "darkorchid": [153,50,204,1], "darkred": [139,0,0,1],
      "darksalmon": [233,150,122,1], "darkseagreen": [143,188,143,1],
      "darkslateblue": [72,61,139,1], "darkslategray": [47,79,79,1],
      "darkslategrey": [47,79,79,1], "darkturquoise": [0,206,209,1],
      "darkviolet": [148,0,211,1], "deeppink": [255,20,147,1],
      "deepskyblue": [0,191,255,1], "dimgray": [105,105,105,1],
      "dimgrey": [105,105,105,1], "dodgerblue": [30,144,255,1],
      "firebrick": [178,34,34,1], "floralwhite": [255,250,240,1],
      "forestgreen": [34,139,34,1], "fuchsia": [255,0,255,1],
      "gainsboro": [220,220,220,1], "ghostwhite": [248,248,255,1],
      "gold": [255,215,0,1], "goldenrod": [218,165,32,1],
      "gray": [128,128,128,1], "green": [0,128,0,1],
      "greenyellow": [173,255,47,1], "grey": [128,128,128,1],
      "honeydew": [240,255,240,1], "hotpink": [255,105,180,1],
      "indianred": [205,92,92,1], "indigo": [75,0,130,1],
      "ivory": [255,255,240,1], "khaki": [240,230,140,1],
      "lavender": [230,230,250,1], "lavenderblush": [255,240,245,1],
      "lawngreen": [124,252,0,1], "lemonchiffon": [255,250,205,1],
      "lightblue": [173,216,230,1], "lightcoral": [240,128,128,1],
      "lightcyan": [224,255,255,1], "lightgoldenrodyellow": [250,250,210,1],
      "lightgray": [211,211,211,1], "lightgreen": [144,238,144,1],
      "lightgrey": [211,211,211,1], "lightpink": [255,182,193,1],
      "lightsalmon": [255,160,122,1], "lightseagreen": [32,178,170,1],
      "lightskyblue": [135,206,250,1], "lightslategray": [119,136,153,1],
      "lightslategrey": [119,136,153,1], "lightsteelblue": [176,196,222,1],
      "lightyellow": [255,255,224,1], "lime": [0,255,0,1],
      "limegreen": [50,205,50,1], "linen": [250,240,230,1],
      "magenta": [255,0,255,1], "maroon": [128,0,0,1],
      "mediumaquamarine": [102,205,170,1], "mediumblue": [0,0,205,1],
      "mediumorchid": [186,85,211,1], "mediumpurple": [147,112,219,1],
      "mediumseagreen": [60,179,113,1], "mediumslateblue": [123,104,238,1],
      "mediumspringgreen": [0,250,154,1], "mediumturquoise": [72,209,204,1],
      "mediumvioletred": [199,21,133,1], "midnightblue": [25,25,112,1],
      "mintcream": [245,255,250,1], "mistyrose": [255,228,225,1],
      "moccasin": [255,228,181,1], "navajowhite": [255,222,173,1],
      "navy": [0,0,128,1], "oldlace": [253,245,230,1],
      "olive": [128,128,0,1], "olivedrab": [107,142,35,1],
      "orange": [255,165,0,1], "orangered": [255,69,0,1],
      "orchid": [218,112,214,1], "palegoldenrod": [238,232,170,1],
      "palegreen": [152,251,152,1], "paleturquoise": [175,238,238,1],
      "palevioletred": [219,112,147,1], "papayawhip": [255,239,213,1],
      "peachpuff": [255,218,185,1], "peru": [205,133,63,1],
      "pink": [255,192,203,1], "plum": [221,160,221,1],
      "powderblue": [176,224,230,1], "purple": [128,0,128,1],
      "rebeccapurple": [102,51,153,1],
      "red": [255,0,0,1], "rosybrown": [188,143,143,1],
      "royalblue": [65,105,225,1], "saddlebrown": [139,69,19,1],
      "salmon": [250,128,114,1], "sandybrown": [244,164,96,1],
      "seagreen": [46,139,87,1], "seashell": [255,245,238,1],
      "sienna": [160,82,45,1], "silver": [192,192,192,1],
      "skyblue": [135,206,235,1], "slateblue": [106,90,205,1],
      "slategray": [112,128,144,1], "slategrey": [112,128,144,1],
      "snow": [255,250,250,1], "springgreen": [0,255,127,1],
      "steelblue": [70,130,180,1], "tan": [210,180,140,1],
      "teal": [0,128,128,1], "thistle": [216,191,216,1],
      "tomato": [255,99,71,1], "turquoise": [64,224,208,1],
      "violet": [238,130,238,1], "wheat": [245,222,179,1],
      "white": [255,255,255,1], "whitesmoke": [245,245,245,1],
      "yellow": [255,255,0,1], "yellowgreen": [154,205,50,1]};

    function clamp_css_byte(i) {  // Clamp to integer 0 .. 255.
      i = Math.round(i);  // Seems to be what Chrome does (vs truncation).
      return i < 0 ? 0 : i > 255 ? 255 : i;
    }

    function clamp_css_float(f) {  // Clamp to float 0.0 .. 1.0.
      return f < 0 ? 0 : f > 1 ? 1 : f;
    }

    function parse_css_int(str) {  // int or percentage.
      if (str[str.length - 1] === '%')
        return clamp_css_byte(parseFloat(str) / 100 * 255);
      return clamp_css_byte(parseInt(str));
    }

    function parse_css_float(str) {  // float or percentage.
      if (str[str.length - 1] === '%')
        return clamp_css_float(parseFloat(str) / 100);
      return clamp_css_float(parseFloat(str));
    }

    function css_hue_to_rgb(m1, m2, h) {
      if (h < 0) h += 1;
      else if (h > 1) h -= 1;

      if (h * 6 < 1) return m1 + (m2 - m1) * h * 6;
      if (h * 2 < 1) return m2;
      if (h * 3 < 2) return m1 + (m2 - m1) * (2/3 - h) * 6;
      return m1;
    }

    function parseCSSColor(css_str) {
      // Remove all whitespace, not compliant, but should just be more accepting.
      var str = css_str.replace(/ /g, '').toLowerCase();

      // Color keywords (and transparent) lookup.
      if (str in kCSSColorTable) return kCSSColorTable[str].slice();  // dup.

      // #abc and #abc123 syntax.
      if (str[0] === '#') {
        if (str.length === 4) {
          var iv = parseInt(str.substr(1), 16);  // TODO(deanm): Stricter parsing.
          if (!(iv >= 0 && iv <= 0xfff)) return null;  // Covers NaN.
          return [((iv & 0xf00) >> 4) | ((iv & 0xf00) >> 8),
                  (iv & 0xf0) | ((iv & 0xf0) >> 4),
                  (iv & 0xf) | ((iv & 0xf) << 4),
                  1];
        } else if (str.length === 7) {
          var iv = parseInt(str.substr(1), 16);  // TODO(deanm): Stricter parsing.
          if (!(iv >= 0 && iv <= 0xffffff)) return null;  // Covers NaN.
          return [(iv & 0xff0000) >> 16,
                  (iv & 0xff00) >> 8,
                  iv & 0xff,
                  1];
        }

        return null;
      }

      var op = str.indexOf('('), ep = str.indexOf(')');
      if (op !== -1 && ep + 1 === str.length) {
        var fname = str.substr(0, op);
        var params = str.substr(op+1, ep-(op+1)).split(',');
        var alpha = 1;  // To allow case fallthrough.
        switch (fname) {
          case 'rgba':
            if (params.length !== 4) return null;
            alpha = parse_css_float(params.pop());
            // Fall through.
          case 'rgb':
            if (params.length !== 3) return null;
            return [parse_css_int(params[0]),
                    parse_css_int(params[1]),
                    parse_css_int(params[2]),
                    alpha];
          case 'hsla':
            if (params.length !== 4) return null;
            alpha = parse_css_float(params.pop());
            // Fall through.
          case 'hsl':
            if (params.length !== 3) return null;
            var h = (((parseFloat(params[0]) % 360) + 360) % 360) / 360;  // 0 .. 1
            // NOTE(deanm): According to the CSS spec s/l should only be
            // percentages, but we don't bother and let float or percentage.
            var s = parse_css_float(params[1]);
            var l = parse_css_float(params[2]);
            var m2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
            var m1 = l * 2 - m2;
            return [clamp_css_byte(css_hue_to_rgb(m1, m2, h+1/3) * 255),
                    clamp_css_byte(css_hue_to_rgb(m1, m2, h) * 255),
                    clamp_css_byte(css_hue_to_rgb(m1, m2, h-1/3) * 255),
                    alpha];
          default:
            return null;
        }
      }

      return null;
    }

    try { parseCSSColor_1 = csscolorparser.parseCSSColor = parseCSSColor; } catch(e) { }

    /**
     * An RGBA color value. Create instances from color strings using the static
     * method `Color.parse`. The constructor accepts RGB channel values in the range
     * `[0, 1]`, premultiplied by A.
     *
     * @param {number} r The red channel.
     * @param {number} g The green channel.
     * @param {number} b The blue channel.
     * @param {number} a The alpha channel.
     * @private
     */
    class Color {
        constructor(r, g, b, a = 1) {
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }
        /**
         * Parses valid CSS color strings and returns a `Color` instance.
         * @returns A `Color` instance, or `undefined` if the input is not a valid color string.
         */
        static parse(input) {
            if (!input) {
                return undefined;
            }
            if (input instanceof Color) {
                return input;
            }
            if (typeof input !== 'string') {
                return undefined;
            }
            const rgba = parseCSSColor_1(input);
            if (!rgba) {
                return undefined;
            }
            return new Color(rgba[0] / 255 * rgba[3], rgba[1] / 255 * rgba[3], rgba[2] / 255 * rgba[3], rgba[3]);
        }
        /**
         * Returns an RGBA string representing the color value.
         *
         * @returns An RGBA string.
         * @example
         * var purple = new Color.parse('purple');
         * purple.toString; // = "rgba(128,0,128,1)"
         * var translucentGreen = new Color.parse('rgba(26, 207, 26, .73)');
         * translucentGreen.toString(); // = "rgba(26,207,26,0.73)"
         */
        toString() {
            const [r, g, b, a] = this.toArray();
            return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
        }
        toArray() {
            const { r, g, b, a } = this;
            return a === 0 ? [0, 0, 0, 0] : [
                r * 255 / a,
                g * 255 / a,
                b * 255 / a,
                a
            ];
        }
    }
    Color.black = new Color(0, 0, 0, 1);
    Color.white = new Color(1, 1, 1, 1);
    Color.transparent = new Color(0, 0, 0, 0);
    Color.red = new Color(1, 0, 0, 1);

    function extendBy(output, ...inputs) {
        for (const input of inputs) {
            for (const k in input) {
                output[k] = input[k];
            }
        }
        return output;
    }

    class ExpressionParsingError extends Error {
        constructor(key, message) {
            super(message);
            this.message = message;
            this.key = key;
        }
    }

    /**
     * Tracks `let` bindings during expression parsing.
     * @private
     */
    class Scope {
        constructor(parent, bindings = []) {
            this.parent = parent;
            this.bindings = {};
            for (const [name, expression] of bindings) {
                this.bindings[name] = expression;
            }
        }
        concat(bindings) {
            return new Scope(this, bindings);
        }
        get(name) {
            if (this.bindings[name]) {
                return this.bindings[name];
            }
            if (this.parent) {
                return this.parent.get(name);
            }
            throw new Error(`${name} not found in scope.`);
        }
        has(name) {
            if (this.bindings[name])
                return true;
            return this.parent ? this.parent.has(name) : false;
        }
    }

    const NullType = { kind: 'null' };
    const NumberType = { kind: 'number' };
    const StringType = { kind: 'string' };
    const BooleanType = { kind: 'boolean' };
    const ColorType = { kind: 'color' };
    const ObjectType = { kind: 'object' };
    const ValueType = { kind: 'value' };
    const ErrorType = { kind: 'error' };
    const CollatorType = { kind: 'collator' };
    const FormattedType = { kind: 'formatted' };
    const PaddingType = { kind: 'padding' };
    const ResolvedImageType = { kind: 'resolvedImage' };
    function array$1(itemType, N) {
        return {
            kind: 'array',
            itemType,
            N
        };
    }
    function toString$1(type) {
        if (type.kind === 'array') {
            const itemType = toString$1(type.itemType);
            return typeof type.N === 'number' ?
                `array<${itemType}, ${type.N}>` :
                type.itemType.kind === 'value' ? 'array' : `array<${itemType}>`;
        }
        else {
            return type.kind;
        }
    }
    const valueMemberTypes = [
        NullType,
        NumberType,
        StringType,
        BooleanType,
        ColorType,
        FormattedType,
        ObjectType,
        array$1(ValueType),
        PaddingType,
        ResolvedImageType
    ];
    /**
     * Returns null if `t` is a subtype of `expected`; otherwise returns an
     * error message.
     * @private
     */
    function checkSubtype(expected, t) {
        if (t.kind === 'error') {
            // Error is a subtype of every type
            return null;
        }
        else if (expected.kind === 'array') {
            if (t.kind === 'array' &&
                ((t.N === 0 && t.itemType.kind === 'value') || !checkSubtype(expected.itemType, t.itemType)) &&
                (typeof expected.N !== 'number' || expected.N === t.N)) {
                return null;
            }
        }
        else if (expected.kind === t.kind) {
            return null;
        }
        else if (expected.kind === 'value') {
            for (const memberType of valueMemberTypes) {
                if (!checkSubtype(memberType, t)) {
                    return null;
                }
            }
        }
        return `Expected ${toString$1(expected)} but found ${toString$1(t)} instead.`;
    }
    function isValidType(provided, allowedTypes) {
        return allowedTypes.some(t => t.kind === provided.kind);
    }
    function isValidNativeType(provided, allowedTypes) {
        return allowedTypes.some(t => {
            if (t === 'null') {
                return provided === null;
            }
            else if (t === 'array') {
                return Array.isArray(provided);
            }
            else if (t === 'object') {
                return provided && !Array.isArray(provided) && typeof provided === 'object';
            }
            else {
                return t === typeof provided;
            }
        });
    }

    // Flow type declarations for Intl cribbed from
    // https://github.com/facebook/flow/issues/1270
    class Collator {
        constructor(caseSensitive, diacriticSensitive, locale) {
            if (caseSensitive)
                this.sensitivity = diacriticSensitive ? 'variant' : 'case';
            else
                this.sensitivity = diacriticSensitive ? 'accent' : 'base';
            this.locale = locale;
            this.collator = new Intl.Collator(this.locale ? this.locale : [], { sensitivity: this.sensitivity, usage: 'search' });
        }
        compare(lhs, rhs) {
            return this.collator.compare(lhs, rhs);
        }
        resolvedLocale() {
            // We create a Collator without "usage: search" because we don't want
            // the search options encoded in our result (e.g. "en-u-co-search")
            return new Intl.Collator(this.locale ? this.locale : [])
                .resolvedOptions().locale;
        }
    }

    class FormattedSection {
        constructor(text, image, scale, fontStack, textColor) {
            this.text = text;
            this.image = image;
            this.scale = scale;
            this.fontStack = fontStack;
            this.textColor = textColor;
        }
    }
    class Formatted {
        constructor(sections) {
            this.sections = sections;
        }
        static fromString(unformatted) {
            return new Formatted([new FormattedSection(unformatted, null, null, null, null)]);
        }
        isEmpty() {
            if (this.sections.length === 0)
                return true;
            return !this.sections.some(section => section.text.length !== 0 ||
                (section.image && section.image.name.length !== 0));
        }
        static factory(text) {
            if (text instanceof Formatted) {
                return text;
            }
            else {
                return Formatted.fromString(text);
            }
        }
        toString() {
            if (this.sections.length === 0)
                return '';
            return this.sections.map(section => section.text).join('');
        }
    }

    /**
     * A set of four numbers representing padding around a box. Create instances from
     * bare arrays or numeric values using the static method `Padding.parse`.
     * @private
     */
    class Padding {
        constructor(values) {
            this.values = values.slice();
        }
        /**
         * Numeric padding values
         * @returns A `Padding` instance, or `undefined` if the input is not a valid padding value.
         */
        static parse(input) {
            if (input instanceof Padding) {
                return input;
            }
            // Backwards compatibility: bare number is treated the same as array with single value.
            // Padding applies to all four sides.
            if (typeof input === 'number') {
                return new Padding([input, input, input, input]);
            }
            if (!Array.isArray(input)) {
                return undefined;
            }
            if (input.length < 1 || input.length > 4) {
                return undefined;
            }
            for (const val of input) {
                if (typeof val !== 'number') {
                    return undefined;
                }
            }
            // Expand shortcut properties into explicit 4-sided values
            switch (input.length) {
                case 1:
                    input = [input[0], input[0], input[0], input[0]];
                    break;
                case 2:
                    input = [input[0], input[1], input[0], input[1]];
                    break;
                case 3:
                    input = [input[0], input[1], input[2], input[1]];
                    break;
            }
            return new Padding(input);
        }
        toString() {
            return JSON.stringify(this.values);
        }
    }

    class ResolvedImage {
        constructor(options) {
            this.name = options.name;
            this.available = options.available;
        }
        toString() {
            return this.name;
        }
        static fromString(name) {
            if (!name)
                return null; // treat empty values as no image
            return new ResolvedImage({ name, available: false });
        }
    }

    function validateRGBA(r, g, b, a) {
        if (!(typeof r === 'number' && r >= 0 && r <= 255 &&
            typeof g === 'number' && g >= 0 && g <= 255 &&
            typeof b === 'number' && b >= 0 && b <= 255)) {
            const value = typeof a === 'number' ? [r, g, b, a] : [r, g, b];
            return `Invalid rgba value [${value.join(', ')}]: 'r', 'g', and 'b' must be between 0 and 255.`;
        }
        if (!(typeof a === 'undefined' || (typeof a === 'number' && a >= 0 && a <= 1))) {
            return `Invalid rgba value [${[r, g, b, a].join(', ')}]: 'a' must be between 0 and 1.`;
        }
        return null;
    }
    function isValue(mixed) {
        if (mixed === null) {
            return true;
        }
        else if (typeof mixed === 'string') {
            return true;
        }
        else if (typeof mixed === 'boolean') {
            return true;
        }
        else if (typeof mixed === 'number') {
            return true;
        }
        else if (mixed instanceof Color) {
            return true;
        }
        else if (mixed instanceof Collator) {
            return true;
        }
        else if (mixed instanceof Formatted) {
            return true;
        }
        else if (mixed instanceof Padding) {
            return true;
        }
        else if (mixed instanceof ResolvedImage) {
            return true;
        }
        else if (Array.isArray(mixed)) {
            for (const item of mixed) {
                if (!isValue(item)) {
                    return false;
                }
            }
            return true;
        }
        else if (typeof mixed === 'object') {
            for (const key in mixed) {
                if (!isValue(mixed[key])) {
                    return false;
                }
            }
            return true;
        }
        else {
            return false;
        }
    }
    function typeOf(value) {
        if (value === null) {
            return NullType;
        }
        else if (typeof value === 'string') {
            return StringType;
        }
        else if (typeof value === 'boolean') {
            return BooleanType;
        }
        else if (typeof value === 'number') {
            return NumberType;
        }
        else if (value instanceof Color) {
            return ColorType;
        }
        else if (value instanceof Collator) {
            return CollatorType;
        }
        else if (value instanceof Formatted) {
            return FormattedType;
        }
        else if (value instanceof Padding) {
            return PaddingType;
        }
        else if (value instanceof ResolvedImage) {
            return ResolvedImageType;
        }
        else if (Array.isArray(value)) {
            const length = value.length;
            let itemType;
            for (const item of value) {
                const t = typeOf(item);
                if (!itemType) {
                    itemType = t;
                }
                else if (itemType === t) {
                    continue;
                }
                else {
                    itemType = ValueType;
                    break;
                }
            }
            return array$1(itemType || ValueType, length);
        }
        else {
            return ObjectType;
        }
    }
    function toString(value) {
        const type = typeof value;
        if (value === null) {
            return '';
        }
        else if (type === 'string' || type === 'number' || type === 'boolean') {
            return String(value);
        }
        else if (value instanceof Color || value instanceof Formatted || value instanceof Padding || value instanceof ResolvedImage) {
            return value.toString();
        }
        else {
            return JSON.stringify(value);
        }
    }

    class Literal {
        constructor(type, value) {
            this.type = type;
            this.value = value;
        }
        static parse(args, context) {
            if (args.length !== 2)
                return context.error(`'literal' expression requires exactly one argument, but found ${args.length - 1} instead.`);
            if (!isValue(args[1]))
                return context.error('invalid value');
            const value = args[1];
            let type = typeOf(value);
            // special case: infer the item type if possible for zero-length arrays
            const expected = context.expectedType;
            if (type.kind === 'array' &&
                type.N === 0 &&
                expected &&
                expected.kind === 'array' &&
                (typeof expected.N !== 'number' || expected.N === 0)) {
                type = expected;
            }
            return new Literal(type, value);
        }
        evaluate() {
            return this.value;
        }
        eachChild() { }
        outputDefined() {
            return true;
        }
    }

    class RuntimeError {
        constructor(message) {
            this.name = 'ExpressionEvaluationError';
            this.message = message;
        }
        toJSON() {
            return this.message;
        }
    }

    const types$1 = {
        string: StringType,
        number: NumberType,
        boolean: BooleanType,
        object: ObjectType
    };
    class Assertion {
        constructor(type, args) {
            this.type = type;
            this.args = args;
        }
        static parse(args, context) {
            if (args.length < 2)
                return context.error('Expected at least one argument.');
            let i = 1;
            let type;
            const name = args[0];
            if (name === 'array') {
                let itemType;
                if (args.length > 2) {
                    const type = args[1];
                    if (typeof type !== 'string' || !(type in types$1) || type === 'object')
                        return context.error('The item type argument of "array" must be one of string, number, boolean', 1);
                    itemType = types$1[type];
                    i++;
                }
                else {
                    itemType = ValueType;
                }
                let N;
                if (args.length > 3) {
                    if (args[2] !== null &&
                        (typeof args[2] !== 'number' ||
                            args[2] < 0 ||
                            args[2] !== Math.floor(args[2]))) {
                        return context.error('The length argument to "array" must be a positive integer literal', 2);
                    }
                    N = args[2];
                    i++;
                }
                type = array$1(itemType, N);
            }
            else {
                if (!types$1[name])
                    throw new Error(`Types doesn't contain name = ${name}`);
                type = types$1[name];
            }
            const parsed = [];
            for (; i < args.length; i++) {
                const input = context.parse(args[i], i, ValueType);
                if (!input)
                    return null;
                parsed.push(input);
            }
            return new Assertion(type, parsed);
        }
        evaluate(ctx) {
            for (let i = 0; i < this.args.length; i++) {
                const value = this.args[i].evaluate(ctx);
                const error = checkSubtype(this.type, typeOf(value));
                if (!error) {
                    return value;
                }
                else if (i === this.args.length - 1) {
                    throw new RuntimeError(`Expected value to be of type ${toString$1(this.type)}, but found ${toString$1(typeOf(value))} instead.`);
                }
            }
            throw new Error();
        }
        eachChild(fn) {
            this.args.forEach(fn);
        }
        outputDefined() {
            return this.args.every(arg => arg.outputDefined());
        }
    }

    const types = {
        'to-boolean': BooleanType,
        'to-color': ColorType,
        'to-number': NumberType,
        'to-string': StringType
    };
    /**
     * Special form for error-coalescing coercion expressions "to-number",
     * "to-color".  Since these coercions can fail at runtime, they accept multiple
     * arguments, only evaluating one at a time until one succeeds.
     *
     * @private
     */
    class Coercion {
        constructor(type, args) {
            this.type = type;
            this.args = args;
        }
        static parse(args, context) {
            if (args.length < 2)
                return context.error('Expected at least one argument.');
            const name = args[0];
            if (!types[name])
                throw new Error(`Can't parse ${name} as it is not part of the known types`);
            if ((name === 'to-boolean' || name === 'to-string') && args.length !== 2)
                return context.error('Expected one argument.');
            const type = types[name];
            const parsed = [];
            for (let i = 1; i < args.length; i++) {
                const input = context.parse(args[i], i, ValueType);
                if (!input)
                    return null;
                parsed.push(input);
            }
            return new Coercion(type, parsed);
        }
        evaluate(ctx) {
            if (this.type.kind === 'boolean') {
                return Boolean(this.args[0].evaluate(ctx));
            }
            else if (this.type.kind === 'color') {
                let input;
                let error;
                for (const arg of this.args) {
                    input = arg.evaluate(ctx);
                    error = null;
                    if (input instanceof Color) {
                        return input;
                    }
                    else if (typeof input === 'string') {
                        const c = ctx.parseColor(input);
                        if (c)
                            return c;
                    }
                    else if (Array.isArray(input)) {
                        if (input.length < 3 || input.length > 4) {
                            error = `Invalid rbga value ${JSON.stringify(input)}: expected an array containing either three or four numeric values.`;
                        }
                        else {
                            error = validateRGBA(input[0], input[1], input[2], input[3]);
                        }
                        if (!error) {
                            return new Color(input[0] / 255, input[1] / 255, input[2] / 255, input[3]);
                        }
                    }
                }
                throw new RuntimeError(error || `Could not parse color from value '${typeof input === 'string' ? input : JSON.stringify(input)}'`);
            }
            else if (this.type.kind === 'padding') {
                let input;
                for (const arg of this.args) {
                    input = arg.evaluate(ctx);
                    const pad = Padding.parse(input);
                    if (pad) {
                        return pad;
                    }
                }
                throw new RuntimeError(`Could not parse padding from value '${typeof input === 'string' ? input : JSON.stringify(input)}'`);
            }
            else if (this.type.kind === 'number') {
                let value = null;
                for (const arg of this.args) {
                    value = arg.evaluate(ctx);
                    if (value === null)
                        return 0;
                    const num = Number(value);
                    if (isNaN(num))
                        continue;
                    return num;
                }
                throw new RuntimeError(`Could not convert ${JSON.stringify(value)} to number.`);
            }
            else if (this.type.kind === 'formatted') {
                // There is no explicit 'to-formatted' but this coercion can be implicitly
                // created by properties that expect the 'formatted' type.
                return Formatted.fromString(toString(this.args[0].evaluate(ctx)));
            }
            else if (this.type.kind === 'resolvedImage') {
                return ResolvedImage.fromString(toString(this.args[0].evaluate(ctx)));
            }
            else {
                return toString(this.args[0].evaluate(ctx));
            }
        }
        eachChild(fn) {
            this.args.forEach(fn);
        }
        outputDefined() {
            return this.args.every(arg => arg.outputDefined());
        }
    }

    const geometryTypes = ['Unknown', 'Point', 'LineString', 'Polygon'];
    class EvaluationContext {
        constructor() {
            this.globals = null;
            this.feature = null;
            this.featureState = null;
            this.formattedSection = null;
            this._parseColorCache = {};
            this.availableImages = null;
            this.canonical = null;
        }
        id() {
            return this.feature && 'id' in this.feature ? this.feature.id : null;
        }
        geometryType() {
            return this.feature ? typeof this.feature.type === 'number' ? geometryTypes[this.feature.type] : this.feature.type : null;
        }
        geometry() {
            return this.feature && 'geometry' in this.feature ? this.feature.geometry : null;
        }
        canonicalID() {
            return this.canonical;
        }
        properties() {
            return this.feature && this.feature.properties || {};
        }
        parseColor(input) {
            let cached = this._parseColorCache[input];
            if (!cached) {
                cached = this._parseColorCache[input] = Color.parse(input);
            }
            return cached;
        }
    }

    class CompoundExpression {
        constructor(name, type, evaluate, args) {
            this.name = name;
            this.type = type;
            this._evaluate = evaluate;
            this.args = args;
        }
        evaluate(ctx) {
            return this._evaluate(ctx, this.args);
        }
        eachChild(fn) {
            this.args.forEach(fn);
        }
        outputDefined() {
            return false;
        }
        static parse(args, context) {
            const op = args[0];
            const definition = CompoundExpression.definitions[op];
            if (!definition) {
                return context.error(`Unknown expression "${op}". If you wanted a literal array, use ["literal", [...]].`, 0);
            }
            // Now check argument types against each signature
            const type = Array.isArray(definition) ?
                definition[0] : definition.type;
            const availableOverloads = Array.isArray(definition) ?
                [[definition[1], definition[2]]] :
                definition.overloads;
            const overloads = availableOverloads.filter(([signature]) => (!Array.isArray(signature) || // varags
                signature.length === args.length - 1 // correct param count
            ));
            let signatureContext = null;
            for (const [params, evaluate] of overloads) {
                // Use a fresh context for each attempted signature so that, if
                // we eventually succeed, we haven't polluted `context.errors`.
                signatureContext = new ParsingContext$1(context.registry, context.path, null, context.scope);
                // First parse all the args, potentially coercing to the
                // types expected by this overload.
                const parsedArgs = [];
                let argParseFailed = false;
                for (let i = 1; i < args.length; i++) {
                    const arg = args[i];
                    const expectedType = Array.isArray(params) ?
                        params[i - 1] :
                        params.type;
                    const parsed = signatureContext.parse(arg, 1 + parsedArgs.length, expectedType);
                    if (!parsed) {
                        argParseFailed = true;
                        break;
                    }
                    parsedArgs.push(parsed);
                }
                if (argParseFailed) {
                    // Couldn't coerce args of this overload to expected type, move
                    // on to next one.
                    continue;
                }
                if (Array.isArray(params)) {
                    if (params.length !== parsedArgs.length) {
                        signatureContext.error(`Expected ${params.length} arguments, but found ${parsedArgs.length} instead.`);
                        continue;
                    }
                }
                for (let i = 0; i < parsedArgs.length; i++) {
                    const expected = Array.isArray(params) ? params[i] : params.type;
                    const arg = parsedArgs[i];
                    signatureContext.concat(i + 1).checkSubtype(expected, arg.type);
                }
                if (signatureContext.errors.length === 0) {
                    return new CompoundExpression(op, type, evaluate, parsedArgs);
                }
            }
            if (overloads.length === 1) {
                context.errors.push(...signatureContext.errors);
            }
            else {
                const expected = overloads.length ? overloads : availableOverloads;
                const signatures = expected
                    .map(([params]) => stringifySignature(params))
                    .join(' | ');
                const actualTypes = [];
                // For error message, re-parse arguments without trying to
                // apply any coercions
                for (let i = 1; i < args.length; i++) {
                    const parsed = context.parse(args[i], 1 + actualTypes.length);
                    if (!parsed)
                        return null;
                    actualTypes.push(toString$1(parsed.type));
                }
                context.error(`Expected arguments of type ${signatures}, but found (${actualTypes.join(', ')}) instead.`);
            }
            return null;
        }
        static register(registry, definitions) {
            CompoundExpression.definitions = definitions;
            for (const name in definitions) {
                registry[name] = CompoundExpression;
            }
        }
    }
    function stringifySignature(signature) {
        if (Array.isArray(signature)) {
            return `(${signature.map(toString$1).join(', ')})`;
        }
        else {
            return `(${toString$1(signature.type)}...)`;
        }
    }

    class CollatorExpression {
        constructor(caseSensitive, diacriticSensitive, locale) {
            this.type = CollatorType;
            this.locale = locale;
            this.caseSensitive = caseSensitive;
            this.diacriticSensitive = diacriticSensitive;
        }
        static parse(args, context) {
            if (args.length !== 2)
                return context.error('Expected one argument.');
            const options = args[1];
            if (typeof options !== 'object' || Array.isArray(options))
                return context.error('Collator options argument must be an object.');
            const caseSensitive = context.parse(options['case-sensitive'] === undefined ? false : options['case-sensitive'], 1, BooleanType);
            if (!caseSensitive)
                return null;
            const diacriticSensitive = context.parse(options['diacritic-sensitive'] === undefined ? false : options['diacritic-sensitive'], 1, BooleanType);
            if (!diacriticSensitive)
                return null;
            let locale = null;
            if (options['locale']) {
                locale = context.parse(options['locale'], 1, StringType);
                if (!locale)
                    return null;
            }
            return new CollatorExpression(caseSensitive, diacriticSensitive, locale);
        }
        evaluate(ctx) {
            return new Collator(this.caseSensitive.evaluate(ctx), this.diacriticSensitive.evaluate(ctx), this.locale ? this.locale.evaluate(ctx) : null);
        }
        eachChild(fn) {
            fn(this.caseSensitive);
            fn(this.diacriticSensitive);
            if (this.locale) {
                fn(this.locale);
            }
        }
        outputDefined() {
            // Technically the set of possible outputs is the combinatoric set of Collators produced
            // by all possible outputs of locale/caseSensitive/diacriticSensitive
            // But for the primary use of Collators in comparison operators, we ignore the Collator's
            // possible outputs anyway, so we can get away with leaving this false for now.
            return false;
        }
    }

    const EXTENT$1 = 8192;
    function updateBBox(bbox, coord) {
        bbox[0] = Math.min(bbox[0], coord[0]);
        bbox[1] = Math.min(bbox[1], coord[1]);
        bbox[2] = Math.max(bbox[2], coord[0]);
        bbox[3] = Math.max(bbox[3], coord[1]);
    }
    function mercatorXfromLng$1(lng) {
        return (180 + lng) / 360;
    }
    function mercatorYfromLat$1(lat) {
        return (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)))) / 360;
    }
    function boxWithinBox(bbox1, bbox2) {
        if (bbox1[0] <= bbox2[0])
            return false;
        if (bbox1[2] >= bbox2[2])
            return false;
        if (bbox1[1] <= bbox2[1])
            return false;
        if (bbox1[3] >= bbox2[3])
            return false;
        return true;
    }
    function getTileCoordinates(p, canonical) {
        const x = mercatorXfromLng$1(p[0]);
        const y = mercatorYfromLat$1(p[1]);
        const tilesAtZoom = Math.pow(2, canonical.z);
        return [Math.round(x * tilesAtZoom * EXTENT$1), Math.round(y * tilesAtZoom * EXTENT$1)];
    }
    function onBoundary(p, p1, p2) {
        const x1 = p[0] - p1[0];
        const y1 = p[1] - p1[1];
        const x2 = p[0] - p2[0];
        const y2 = p[1] - p2[1];
        return (x1 * y2 - x2 * y1 === 0) && (x1 * x2 <= 0) && (y1 * y2 <= 0);
    }
    function rayIntersect(p, p1, p2) {
        return ((p1[1] > p[1]) !== (p2[1] > p[1])) && (p[0] < (p2[0] - p1[0]) * (p[1] - p1[1]) / (p2[1] - p1[1]) + p1[0]);
    }
    // ray casting algorithm for detecting if point is in polygon
    function pointWithinPolygon(point, rings) {
        let inside = false;
        for (let i = 0, len = rings.length; i < len; i++) {
            const ring = rings[i];
            for (let j = 0, len2 = ring.length; j < len2 - 1; j++) {
                if (onBoundary(point, ring[j], ring[j + 1]))
                    return false;
                if (rayIntersect(point, ring[j], ring[j + 1]))
                    inside = !inside;
            }
        }
        return inside;
    }
    function pointWithinPolygons(point, polygons) {
        for (let i = 0; i < polygons.length; i++) {
            if (pointWithinPolygon(point, polygons[i]))
                return true;
        }
        return false;
    }
    function perp(v1, v2) {
        return (v1[0] * v2[1] - v1[1] * v2[0]);
    }
    // check if p1 and p2 are in different sides of line segment q1->q2
    function twoSided(p1, p2, q1, q2) {
        // q1->p1 (x1, y1), q1->p2 (x2, y2), q1->q2 (x3, y3)
        const x1 = p1[0] - q1[0];
        const y1 = p1[1] - q1[1];
        const x2 = p2[0] - q1[0];
        const y2 = p2[1] - q1[1];
        const x3 = q2[0] - q1[0];
        const y3 = q2[1] - q1[1];
        const det1 = (x1 * y3 - x3 * y1);
        const det2 = (x2 * y3 - x3 * y2);
        if ((det1 > 0 && det2 < 0) || (det1 < 0 && det2 > 0))
            return true;
        return false;
    }
    // a, b are end points for line segment1, c and d are end points for line segment2
    function lineIntersectLine(a, b, c, d) {
        // check if two segments are parallel or not
        // precondition is end point a, b is inside polygon, if line a->b is
        // parallel to polygon edge c->d, then a->b won't intersect with c->d
        const vectorP = [b[0] - a[0], b[1] - a[1]];
        const vectorQ = [d[0] - c[0], d[1] - c[1]];
        if (perp(vectorQ, vectorP) === 0)
            return false;
        // If lines are intersecting with each other, the relative location should be:
        // a and b lie in different sides of segment c->d
        // c and d lie in different sides of segment a->b
        if (twoSided(a, b, c, d) && twoSided(c, d, a, b))
            return true;
        return false;
    }
    function lineIntersectPolygon(p1, p2, polygon) {
        for (const ring of polygon) {
            // loop through every edge of the ring
            for (let j = 0; j < ring.length - 1; ++j) {
                if (lineIntersectLine(p1, p2, ring[j], ring[j + 1])) {
                    return true;
                }
            }
        }
        return false;
    }
    function lineStringWithinPolygon(line, polygon) {
        // First, check if geometry points of line segments are all inside polygon
        for (let i = 0; i < line.length; ++i) {
            if (!pointWithinPolygon(line[i], polygon)) {
                return false;
            }
        }
        // Second, check if there is line segment intersecting polygon edge
        for (let i = 0; i < line.length - 1; ++i) {
            if (lineIntersectPolygon(line[i], line[i + 1], polygon)) {
                return false;
            }
        }
        return true;
    }
    function lineStringWithinPolygons(line, polygons) {
        for (let i = 0; i < polygons.length; i++) {
            if (lineStringWithinPolygon(line, polygons[i]))
                return true;
        }
        return false;
    }
    function getTilePolygon(coordinates, bbox, canonical) {
        const polygon = [];
        for (let i = 0; i < coordinates.length; i++) {
            const ring = [];
            for (let j = 0; j < coordinates[i].length; j++) {
                const coord = getTileCoordinates(coordinates[i][j], canonical);
                updateBBox(bbox, coord);
                ring.push(coord);
            }
            polygon.push(ring);
        }
        return polygon;
    }
    function getTilePolygons(coordinates, bbox, canonical) {
        const polygons = [];
        for (let i = 0; i < coordinates.length; i++) {
            const polygon = getTilePolygon(coordinates[i], bbox, canonical);
            polygons.push(polygon);
        }
        return polygons;
    }
    function updatePoint(p, bbox, polyBBox, worldSize) {
        if (p[0] < polyBBox[0] || p[0] > polyBBox[2]) {
            const halfWorldSize = worldSize * 0.5;
            let shift = (p[0] - polyBBox[0] > halfWorldSize) ? -worldSize : (polyBBox[0] - p[0] > halfWorldSize) ? worldSize : 0;
            if (shift === 0) {
                shift = (p[0] - polyBBox[2] > halfWorldSize) ? -worldSize : (polyBBox[2] - p[0] > halfWorldSize) ? worldSize : 0;
            }
            p[0] += shift;
        }
        updateBBox(bbox, p);
    }
    function resetBBox(bbox) {
        bbox[0] = bbox[1] = Infinity;
        bbox[2] = bbox[3] = -Infinity;
    }
    function getTilePoints(geometry, pointBBox, polyBBox, canonical) {
        const worldSize = Math.pow(2, canonical.z) * EXTENT$1;
        const shifts = [canonical.x * EXTENT$1, canonical.y * EXTENT$1];
        const tilePoints = [];
        for (const points of geometry) {
            for (const point of points) {
                const p = [point.x + shifts[0], point.y + shifts[1]];
                updatePoint(p, pointBBox, polyBBox, worldSize);
                tilePoints.push(p);
            }
        }
        return tilePoints;
    }
    function getTileLines(geometry, lineBBox, polyBBox, canonical) {
        const worldSize = Math.pow(2, canonical.z) * EXTENT$1;
        const shifts = [canonical.x * EXTENT$1, canonical.y * EXTENT$1];
        const tileLines = [];
        for (const line of geometry) {
            const tileLine = [];
            for (const point of line) {
                const p = [point.x + shifts[0], point.y + shifts[1]];
                updateBBox(lineBBox, p);
                tileLine.push(p);
            }
            tileLines.push(tileLine);
        }
        if (lineBBox[2] - lineBBox[0] <= worldSize / 2) {
            resetBBox(lineBBox);
            for (const line of tileLines) {
                for (const p of line) {
                    updatePoint(p, lineBBox, polyBBox, worldSize);
                }
            }
        }
        return tileLines;
    }
    function pointsWithinPolygons(ctx, polygonGeometry) {
        const pointBBox = [Infinity, Infinity, -Infinity, -Infinity];
        const polyBBox = [Infinity, Infinity, -Infinity, -Infinity];
        const canonical = ctx.canonicalID();
        if (polygonGeometry.type === 'Polygon') {
            const tilePolygon = getTilePolygon(polygonGeometry.coordinates, polyBBox, canonical);
            const tilePoints = getTilePoints(ctx.geometry(), pointBBox, polyBBox, canonical);
            if (!boxWithinBox(pointBBox, polyBBox))
                return false;
            for (const point of tilePoints) {
                if (!pointWithinPolygon(point, tilePolygon))
                    return false;
            }
        }
        if (polygonGeometry.type === 'MultiPolygon') {
            const tilePolygons = getTilePolygons(polygonGeometry.coordinates, polyBBox, canonical);
            const tilePoints = getTilePoints(ctx.geometry(), pointBBox, polyBBox, canonical);
            if (!boxWithinBox(pointBBox, polyBBox))
                return false;
            for (const point of tilePoints) {
                if (!pointWithinPolygons(point, tilePolygons))
                    return false;
            }
        }
        return true;
    }
    function linesWithinPolygons(ctx, polygonGeometry) {
        const lineBBox = [Infinity, Infinity, -Infinity, -Infinity];
        const polyBBox = [Infinity, Infinity, -Infinity, -Infinity];
        const canonical = ctx.canonicalID();
        if (polygonGeometry.type === 'Polygon') {
            const tilePolygon = getTilePolygon(polygonGeometry.coordinates, polyBBox, canonical);
            const tileLines = getTileLines(ctx.geometry(), lineBBox, polyBBox, canonical);
            if (!boxWithinBox(lineBBox, polyBBox))
                return false;
            for (const line of tileLines) {
                if (!lineStringWithinPolygon(line, tilePolygon))
                    return false;
            }
        }
        if (polygonGeometry.type === 'MultiPolygon') {
            const tilePolygons = getTilePolygons(polygonGeometry.coordinates, polyBBox, canonical);
            const tileLines = getTileLines(ctx.geometry(), lineBBox, polyBBox, canonical);
            if (!boxWithinBox(lineBBox, polyBBox))
                return false;
            for (const line of tileLines) {
                if (!lineStringWithinPolygons(line, tilePolygons))
                    return false;
            }
        }
        return true;
    }
    class Within {
        constructor(geojson, geometries) {
            this.type = BooleanType;
            this.geojson = geojson;
            this.geometries = geometries;
        }
        static parse(args, context) {
            if (args.length !== 2)
                return context.error(`'within' expression requires exactly one argument, but found ${args.length - 1} instead.`);
            if (isValue(args[1])) {
                const geojson = args[1];
                if (geojson.type === 'FeatureCollection') {
                    for (let i = 0; i < geojson.features.length; ++i) {
                        const type = geojson.features[i].geometry.type;
                        if (type === 'Polygon' || type === 'MultiPolygon') {
                            return new Within(geojson, geojson.features[i].geometry);
                        }
                    }
                }
                else if (geojson.type === 'Feature') {
                    const type = geojson.geometry.type;
                    if (type === 'Polygon' || type === 'MultiPolygon') {
                        return new Within(geojson, geojson.geometry);
                    }
                }
                else if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
                    return new Within(geojson, geojson);
                }
            }
            return context.error('\'within\' expression requires valid geojson object that contains polygon geometry type.');
        }
        evaluate(ctx) {
            if (ctx.geometry() != null && ctx.canonicalID() != null) {
                if (ctx.geometryType() === 'Point') {
                    return pointsWithinPolygons(ctx, this.geometries);
                }
                else if (ctx.geometryType() === 'LineString') {
                    return linesWithinPolygons(ctx, this.geometries);
                }
            }
            return false;
        }
        eachChild() { }
        outputDefined() {
            return true;
        }
    }

    function isFeatureConstant(e) {
        if (e instanceof CompoundExpression) {
            if (e.name === 'get' && e.args.length === 1) {
                return false;
            }
            else if (e.name === 'feature-state') {
                return false;
            }
            else if (e.name === 'has' && e.args.length === 1) {
                return false;
            }
            else if (e.name === 'properties' ||
                e.name === 'geometry-type' ||
                e.name === 'id') {
                return false;
            }
            else if (/^filter-/.test(e.name)) {
                return false;
            }
        }
        if (e instanceof Within) {
            return false;
        }
        let result = true;
        e.eachChild(arg => {
            if (result && !isFeatureConstant(arg)) {
                result = false;
            }
        });
        return result;
    }
    function isStateConstant(e) {
        if (e instanceof CompoundExpression) {
            if (e.name === 'feature-state') {
                return false;
            }
        }
        let result = true;
        e.eachChild(arg => {
            if (result && !isStateConstant(arg)) {
                result = false;
            }
        });
        return result;
    }
    function isGlobalPropertyConstant(e, properties) {
        if (e instanceof CompoundExpression && properties.indexOf(e.name) >= 0) {
            return false;
        }
        let result = true;
        e.eachChild((arg) => {
            if (result && !isGlobalPropertyConstant(arg, properties)) {
                result = false;
            }
        });
        return result;
    }

    class Var {
        constructor(name, boundExpression) {
            this.type = boundExpression.type;
            this.name = name;
            this.boundExpression = boundExpression;
        }
        static parse(args, context) {
            if (args.length !== 2 || typeof args[1] !== 'string')
                return context.error('\'var\' expression requires exactly one string literal argument.');
            const name = args[1];
            if (!context.scope.has(name)) {
                return context.error(`Unknown variable "${name}". Make sure "${name}" has been bound in an enclosing "let" expression before using it.`, 1);
            }
            return new Var(name, context.scope.get(name));
        }
        evaluate(ctx) {
            return this.boundExpression.evaluate(ctx);
        }
        eachChild() { }
        outputDefined() {
            return false;
        }
    }

    /**
     * State associated parsing at a given point in an expression tree.
     * @private
     */
    class ParsingContext {
        constructor(registry, path = [], expectedType, scope = new Scope(), errors = []) {
            this.registry = registry;
            this.path = path;
            this.key = path.map(part => `[${part}]`).join('');
            this.scope = scope;
            this.errors = errors;
            this.expectedType = expectedType;
        }
        /**
         * @param expr the JSON expression to parse
         * @param index the optional argument index if this expression is an argument of a parent expression that's being parsed
         * @param options
         * @param options.omitTypeAnnotations set true to omit inferred type annotations.  Caller beware: with this option set, the parsed expression's type will NOT satisfy `expectedType` if it would normally be wrapped in an inferred annotation.
         * @private
         */
        parse(expr, index, expectedType, bindings, options = {}) {
            if (index) {
                return this.concat(index, expectedType, bindings)._parse(expr, options);
            }
            return this._parse(expr, options);
        }
        _parse(expr, options) {
            if (expr === null || typeof expr === 'string' || typeof expr === 'boolean' || typeof expr === 'number') {
                expr = ['literal', expr];
            }
            function annotate(parsed, type, typeAnnotation) {
                if (typeAnnotation === 'assert') {
                    return new Assertion(type, [parsed]);
                }
                else if (typeAnnotation === 'coerce') {
                    return new Coercion(type, [parsed]);
                }
                else {
                    return parsed;
                }
            }
            if (Array.isArray(expr)) {
                if (expr.length === 0) {
                    return this.error('Expected an array with at least one element. If you wanted a literal array, use ["literal", []].');
                }
                const op = expr[0];
                if (typeof op !== 'string') {
                    this.error(`Expression name must be a string, but found ${typeof op} instead. If you wanted a literal array, use ["literal", [...]].`, 0);
                    return null;
                }
                const Expr = this.registry[op];
                if (Expr) {
                    let parsed = Expr.parse(expr, this);
                    if (!parsed)
                        return null;
                    if (this.expectedType) {
                        const expected = this.expectedType;
                        const actual = parsed.type;
                        // When we expect a number, string, boolean, or array but have a value, wrap it in an assertion.
                        // When we expect a color or formatted string, but have a string or value, wrap it in a coercion.
                        // Otherwise, we do static type-checking.
                        //
                        // These behaviors are overridable for:
                        //   * The "coalesce" operator, which needs to omit type annotations.
                        //   * String-valued properties (e.g. `text-field`), where coercion is more convenient than assertion.
                        //
                        if ((expected.kind === 'string' || expected.kind === 'number' || expected.kind === 'boolean' || expected.kind === 'object' || expected.kind === 'array') && actual.kind === 'value') {
                            parsed = annotate(parsed, expected, options.typeAnnotation || 'assert');
                        }
                        else if ((expected.kind === 'color' || expected.kind === 'formatted' || expected.kind === 'resolvedImage') && (actual.kind === 'value' || actual.kind === 'string')) {
                            parsed = annotate(parsed, expected, options.typeAnnotation || 'coerce');
                        }
                        else if (expected.kind === 'padding' && (actual.kind === 'value' || actual.kind === 'number' || actual.kind === 'array')) {
                            parsed = annotate(parsed, expected, options.typeAnnotation || 'coerce');
                        }
                        else if (this.checkSubtype(expected, actual)) {
                            return null;
                        }
                    }
                    // If an expression's arguments are all literals, we can evaluate
                    // it immediately and replace it with a literal value in the
                    // parsed/compiled result. Expressions that expect an image should
                    // not be resolved here so we can later get the available images.
                    if (!(parsed instanceof Literal) && (parsed.type.kind !== 'resolvedImage') && isConstant(parsed)) {
                        const ec = new EvaluationContext();
                        try {
                            parsed = new Literal(parsed.type, parsed.evaluate(ec));
                        }
                        catch (e) {
                            this.error(e.message);
                            return null;
                        }
                    }
                    return parsed;
                }
                return this.error(`Unknown expression "${op}". If you wanted a literal array, use ["literal", [...]].`, 0);
            }
            else if (typeof expr === 'undefined') {
                return this.error('\'undefined\' value invalid. Use null instead.');
            }
            else if (typeof expr === 'object') {
                return this.error('Bare objects invalid. Use ["literal", {...}] instead.');
            }
            else {
                return this.error(`Expected an array, but found ${typeof expr} instead.`);
            }
        }
        /**
         * Returns a copy of this context suitable for parsing the subexpression at
         * index `index`, optionally appending to 'let' binding map.
         *
         * Note that `errors` property, intended for collecting errors while
         * parsing, is copied by reference rather than cloned.
         * @private
         */
        concat(index, expectedType, bindings) {
            const path = typeof index === 'number' ? this.path.concat(index) : this.path;
            const scope = bindings ? this.scope.concat(bindings) : this.scope;
            return new ParsingContext(this.registry, path, expectedType || null, scope, this.errors);
        }
        /**
         * Push a parsing (or type checking) error into the `this.errors`
         * @param error The message
         * @param keys Optionally specify the source of the error at a child
         * of the current expression at `this.key`.
         * @private
         */
        error(error, ...keys) {
            const key = `${this.key}${keys.map(k => `[${k}]`).join('')}`;
            this.errors.push(new ExpressionParsingError(key, error));
        }
        /**
         * Returns null if `t` is a subtype of `expected`; otherwise returns an
         * error message and also pushes it to `this.errors`.
         */
        checkSubtype(expected, t) {
            const error = checkSubtype(expected, t);
            if (error)
                this.error(error);
            return error;
        }
    }
    var ParsingContext$1 = ParsingContext;
    function isConstant(expression) {
        if (expression instanceof Var) {
            return isConstant(expression.boundExpression);
        }
        else if (expression instanceof CompoundExpression && expression.name === 'error') {
            return false;
        }
        else if (expression instanceof CollatorExpression) {
            // Although the results of a Collator expression with fixed arguments
            // generally shouldn't change between executions, we can't serialize them
            // as constant expressions because results change based on environment.
            return false;
        }
        else if (expression instanceof Within) {
            return false;
        }
        const isTypeAnnotation = expression instanceof Coercion ||
            expression instanceof Assertion;
        let childrenConstant = true;
        expression.eachChild(child => {
            // We can _almost_ assume that if `expressions` children are constant,
            // they would already have been evaluated to Literal values when they
            // were parsed.  Type annotations are the exception, because they might
            // have been inferred and added after a child was parsed.
            // So we recurse into isConstant() for the children of type annotations,
            // but otherwise simply check whether they are Literals.
            if (isTypeAnnotation) {
                childrenConstant = childrenConstant && isConstant(child);
            }
            else {
                childrenConstant = childrenConstant && child instanceof Literal;
            }
        });
        if (!childrenConstant) {
            return false;
        }
        return isFeatureConstant(expression) &&
            isGlobalPropertyConstant(expression, ['zoom', 'heatmap-density', 'line-progress', 'accumulated', 'is-supported-script']);
    }

    /**
     * Returns the index of the last stop <= input, or 0 if it doesn't exist.
     * @private
     */
    function findStopLessThanOrEqualTo(stops, input) {
        const lastIndex = stops.length - 1;
        let lowerIndex = 0;
        let upperIndex = lastIndex;
        let currentIndex = 0;
        let currentValue, nextValue;
        while (lowerIndex <= upperIndex) {
            currentIndex = Math.floor((lowerIndex + upperIndex) / 2);
            currentValue = stops[currentIndex];
            nextValue = stops[currentIndex + 1];
            if (currentValue <= input) {
                if (currentIndex === lastIndex || input < nextValue) { // Search complete
                    return currentIndex;
                }
                lowerIndex = currentIndex + 1;
            }
            else if (currentValue > input) {
                upperIndex = currentIndex - 1;
            }
            else {
                throw new RuntimeError('Input is not a number.');
            }
        }
        return 0;
    }

    class Step {
        constructor(type, input, stops) {
            this.type = type;
            this.input = input;
            this.labels = [];
            this.outputs = [];
            for (const [label, expression] of stops) {
                this.labels.push(label);
                this.outputs.push(expression);
            }
        }
        static parse(args, context) {
            if (args.length - 1 < 4) {
                return context.error(`Expected at least 4 arguments, but found only ${args.length - 1}.`);
            }
            if ((args.length - 1) % 2 !== 0) {
                return context.error('Expected an even number of arguments.');
            }
            const input = context.parse(args[1], 1, NumberType);
            if (!input)
                return null;
            const stops = [];
            let outputType = null;
            if (context.expectedType && context.expectedType.kind !== 'value') {
                outputType = context.expectedType;
            }
            for (let i = 1; i < args.length; i += 2) {
                const label = i === 1 ? -Infinity : args[i];
                const value = args[i + 1];
                const labelKey = i;
                const valueKey = i + 1;
                if (typeof label !== 'number') {
                    return context.error('Input/output pairs for "step" expressions must be defined using literal numeric values (not computed expressions) for the input values.', labelKey);
                }
                if (stops.length && stops[stops.length - 1][0] >= label) {
                    return context.error('Input/output pairs for "step" expressions must be arranged with input values in strictly ascending order.', labelKey);
                }
                const parsed = context.parse(value, valueKey, outputType);
                if (!parsed)
                    return null;
                outputType = outputType || parsed.type;
                stops.push([label, parsed]);
            }
            return new Step(outputType, input, stops);
        }
        evaluate(ctx) {
            const labels = this.labels;
            const outputs = this.outputs;
            if (labels.length === 1) {
                return outputs[0].evaluate(ctx);
            }
            const value = this.input.evaluate(ctx);
            if (value <= labels[0]) {
                return outputs[0].evaluate(ctx);
            }
            const stopCount = labels.length;
            if (value >= labels[stopCount - 1]) {
                return outputs[stopCount - 1].evaluate(ctx);
            }
            const index = findStopLessThanOrEqualTo(labels, value);
            return outputs[index].evaluate(ctx);
        }
        eachChild(fn) {
            fn(this.input);
            for (const expression of this.outputs) {
                fn(expression);
            }
        }
        outputDefined() {
            return this.outputs.every(out => out.outputDefined());
        }
    }

    /*
     * Copyright (C) 2008 Apple Inc. All Rights Reserved.
     *
     * Redistribution and use in source and binary forms, with or without
     * modification, are permitted provided that the following conditions
     * are met:
     * 1. Redistributions of source code must retain the above copyright
     *    notice, this list of conditions and the following disclaimer.
     * 2. Redistributions in binary form must reproduce the above copyright
     *    notice, this list of conditions and the following disclaimer in the
     *    documentation and/or other materials provided with the distribution.
     *
     * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
     * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
     * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
     * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
     * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
     * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
     * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     *
     * Ported from Webkit
     * http://svn.webkit.org/repository/webkit/trunk/Source/WebCore/platform/graphics/UnitBezier.h
     */

    var unitbezier = UnitBezier;

    function UnitBezier(p1x, p1y, p2x, p2y) {
        // Calculate the polynomial coefficients, implicit first and last control points are (0,0) and (1,1).
        this.cx = 3.0 * p1x;
        this.bx = 3.0 * (p2x - p1x) - this.cx;
        this.ax = 1.0 - this.cx - this.bx;

        this.cy = 3.0 * p1y;
        this.by = 3.0 * (p2y - p1y) - this.cy;
        this.ay = 1.0 - this.cy - this.by;

        this.p1x = p1x;
        this.p1y = p2y;
        this.p2x = p2x;
        this.p2y = p2y;
    }

    UnitBezier.prototype.sampleCurveX = function(t) {
        // `ax t^3 + bx t^2 + cx t' expanded using Horner's rule.
        return ((this.ax * t + this.bx) * t + this.cx) * t;
    };

    UnitBezier.prototype.sampleCurveY = function(t) {
        return ((this.ay * t + this.by) * t + this.cy) * t;
    };

    UnitBezier.prototype.sampleCurveDerivativeX = function(t) {
        return (3.0 * this.ax * t + 2.0 * this.bx) * t + this.cx;
    };

    UnitBezier.prototype.solveCurveX = function(x, epsilon) {
        if (typeof epsilon === 'undefined') epsilon = 1e-6;

        var t0, t1, t2, x2, i;

        // First try a few iterations of Newton's method -- normally very fast.
        for (t2 = x, i = 0; i < 8; i++) {

            x2 = this.sampleCurveX(t2) - x;
            if (Math.abs(x2) < epsilon) return t2;

            var d2 = this.sampleCurveDerivativeX(t2);
            if (Math.abs(d2) < 1e-6) break;

            t2 = t2 - x2 / d2;
        }

        // Fall back to the bisection method for reliability.
        t0 = 0.0;
        t1 = 1.0;
        t2 = x;

        if (t2 < t0) return t0;
        if (t2 > t1) return t1;

        while (t0 < t1) {

            x2 = this.sampleCurveX(t2);
            if (Math.abs(x2 - x) < epsilon) return t2;

            if (x > x2) {
                t0 = t2;
            } else {
                t1 = t2;
            }

            t2 = (t1 - t0) * 0.5 + t0;
        }

        // Failure.
        return t2;
    };

    UnitBezier.prototype.solve = function(x, epsilon) {
        return this.sampleCurveY(this.solveCurveX(x, epsilon));
    };

    function number(a, b, t) {
        return (a * (1 - t)) + (b * t);
    }
    function color(from, to, t) {
        return new Color(number(from.r, to.r, t), number(from.g, to.g, t), number(from.b, to.b, t), number(from.a, to.a, t));
    }
    function array(from, to, t) {
        return from.map((d, i) => {
            return number(d, to[i], t);
        });
    }
    function padding$1(from, to, t) {
        const fromVal = from.values;
        const toVal = to.values;
        return new Padding([
            number(fromVal[0], toVal[0], t),
            number(fromVal[1], toVal[1], t),
            number(fromVal[2], toVal[2], t),
            number(fromVal[3], toVal[3], t)
        ]);
    }

    var interpolate = /*#__PURE__*/Object.freeze({
        __proto__: null,
        array: array,
        color: color,
        number: number,
        padding: padding$1
    });

    // Constants
    const Xn = 0.950470, // D65 standard referent
    Yn = 1, Zn = 1.088830, t0 = 4 / 29, t1 = 6 / 29, t2 = 3 * t1 * t1, t3 = t1 * t1 * t1, deg2rad = Math.PI / 180, rad2deg = 180 / Math.PI;
    // Utilities
    function xyz2lab(t) {
        return t > t3 ? Math.pow(t, 1 / 3) : t / t2 + t0;
    }
    function lab2xyz(t) {
        return t > t1 ? t * t * t : t2 * (t - t0);
    }
    function xyz2rgb(x) {
        return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    }
    function rgb2xyz(x) {
        x /= 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }
    // LAB
    function rgbToLab(rgbColor) {
        const b = rgb2xyz(rgbColor.r), a = rgb2xyz(rgbColor.g), l = rgb2xyz(rgbColor.b), x = xyz2lab((0.4124564 * b + 0.3575761 * a + 0.1804375 * l) / Xn), y = xyz2lab((0.2126729 * b + 0.7151522 * a + 0.0721750 * l) / Yn), z = xyz2lab((0.0193339 * b + 0.1191920 * a + 0.9503041 * l) / Zn);
        return {
            l: 116 * y - 16,
            a: 500 * (x - y),
            b: 200 * (y - z),
            alpha: rgbColor.a
        };
    }
    function labToRgb(labColor) {
        let y = (labColor.l + 16) / 116, x = isNaN(labColor.a) ? y : y + labColor.a / 500, z = isNaN(labColor.b) ? y : y - labColor.b / 200;
        y = Yn * lab2xyz(y);
        x = Xn * lab2xyz(x);
        z = Zn * lab2xyz(z);
        return new Color(xyz2rgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z), // D65 -> sRGB
        xyz2rgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z), xyz2rgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z), labColor.alpha);
    }
    function interpolateLab(from, to, t) {
        return {
            l: number(from.l, to.l, t),
            a: number(from.a, to.a, t),
            b: number(from.b, to.b, t),
            alpha: number(from.alpha, to.alpha, t)
        };
    }
    // HCL
    function rgbToHcl(rgbColor) {
        const { l, a, b } = rgbToLab(rgbColor);
        const h = Math.atan2(b, a) * rad2deg;
        return {
            h: h < 0 ? h + 360 : h,
            c: Math.sqrt(a * a + b * b),
            l,
            alpha: rgbColor.a
        };
    }
    function hclToRgb(hclColor) {
        const h = hclColor.h * deg2rad, c = hclColor.c, l = hclColor.l;
        return labToRgb({
            l,
            a: Math.cos(h) * c,
            b: Math.sin(h) * c,
            alpha: hclColor.alpha
        });
    }
    function interpolateHue(a, b, t) {
        const d = b - a;
        return a + t * (d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d);
    }
    function interpolateHcl(from, to, t) {
        return {
            h: interpolateHue(from.h, to.h, t),
            c: number(from.c, to.c, t),
            l: number(from.l, to.l, t),
            alpha: number(from.alpha, to.alpha, t)
        };
    }
    const lab = {
        forward: rgbToLab,
        reverse: labToRgb,
        interpolate: interpolateLab
    };
    const hcl = {
        forward: rgbToHcl,
        reverse: hclToRgb,
        interpolate: interpolateHcl
    };

    var colorSpaces = /*#__PURE__*/Object.freeze({
        __proto__: null,
        hcl: hcl,
        lab: lab
    });

    class Interpolate {
        constructor(type, operator, interpolation, input, stops) {
            this.type = type;
            this.operator = operator;
            this.interpolation = interpolation;
            this.input = input;
            this.labels = [];
            this.outputs = [];
            for (const [label, expression] of stops) {
                this.labels.push(label);
                this.outputs.push(expression);
            }
        }
        static interpolationFactor(interpolation, input, lower, upper) {
            let t = 0;
            if (interpolation.name === 'exponential') {
                t = exponentialInterpolation(input, interpolation.base, lower, upper);
            }
            else if (interpolation.name === 'linear') {
                t = exponentialInterpolation(input, 1, lower, upper);
            }
            else if (interpolation.name === 'cubic-bezier') {
                const c = interpolation.controlPoints;
                const ub = new unitbezier(c[0], c[1], c[2], c[3]);
                t = ub.solve(exponentialInterpolation(input, 1, lower, upper));
            }
            return t;
        }
        static parse(args, context) {
            let [operator, interpolation, input, ...rest] = args;
            if (!Array.isArray(interpolation) || interpolation.length === 0) {
                return context.error('Expected an interpolation type expression.', 1);
            }
            if (interpolation[0] === 'linear') {
                interpolation = { name: 'linear' };
            }
            else if (interpolation[0] === 'exponential') {
                const base = interpolation[1];
                if (typeof base !== 'number')
                    return context.error('Exponential interpolation requires a numeric base.', 1, 1);
                interpolation = {
                    name: 'exponential',
                    base
                };
            }
            else if (interpolation[0] === 'cubic-bezier') {
                const controlPoints = interpolation.slice(1);
                if (controlPoints.length !== 4 ||
                    controlPoints.some(t => typeof t !== 'number' || t < 0 || t > 1)) {
                    return context.error('Cubic bezier interpolation requires four numeric arguments with values between 0 and 1.', 1);
                }
                interpolation = {
                    name: 'cubic-bezier',
                    controlPoints: controlPoints
                };
            }
            else {
                return context.error(`Unknown interpolation type ${String(interpolation[0])}`, 1, 0);
            }
            if (args.length - 1 < 4) {
                return context.error(`Expected at least 4 arguments, but found only ${args.length - 1}.`);
            }
            if ((args.length - 1) % 2 !== 0) {
                return context.error('Expected an even number of arguments.');
            }
            input = context.parse(input, 2, NumberType);
            if (!input)
                return null;
            const stops = [];
            let outputType = null;
            if (operator === 'interpolate-hcl' || operator === 'interpolate-lab') {
                outputType = ColorType;
            }
            else if (context.expectedType && context.expectedType.kind !== 'value') {
                outputType = context.expectedType;
            }
            for (let i = 0; i < rest.length; i += 2) {
                const label = rest[i];
                const value = rest[i + 1];
                const labelKey = i + 3;
                const valueKey = i + 4;
                if (typeof label !== 'number') {
                    return context.error('Input/output pairs for "interpolate" expressions must be defined using literal numeric values (not computed expressions) for the input values.', labelKey);
                }
                if (stops.length && stops[stops.length - 1][0] >= label) {
                    return context.error('Input/output pairs for "interpolate" expressions must be arranged with input values in strictly ascending order.', labelKey);
                }
                const parsed = context.parse(value, valueKey, outputType);
                if (!parsed)
                    return null;
                outputType = outputType || parsed.type;
                stops.push([label, parsed]);
            }
            if (outputType.kind !== 'number' &&
                outputType.kind !== 'color' &&
                outputType.kind !== 'padding' &&
                !(outputType.kind === 'array' &&
                    outputType.itemType.kind === 'number' &&
                    typeof outputType.N === 'number')) {
                return context.error(`Type ${toString$1(outputType)} is not interpolatable.`);
            }
            return new Interpolate(outputType, operator, interpolation, input, stops);
        }
        evaluate(ctx) {
            const labels = this.labels;
            const outputs = this.outputs;
            if (labels.length === 1) {
                return outputs[0].evaluate(ctx);
            }
            const value = this.input.evaluate(ctx);
            if (value <= labels[0]) {
                return outputs[0].evaluate(ctx);
            }
            const stopCount = labels.length;
            if (value >= labels[stopCount - 1]) {
                return outputs[stopCount - 1].evaluate(ctx);
            }
            const index = findStopLessThanOrEqualTo(labels, value);
            const lower = labels[index];
            const upper = labels[index + 1];
            const t = Interpolate.interpolationFactor(this.interpolation, value, lower, upper);
            const outputLower = outputs[index].evaluate(ctx);
            const outputUpper = outputs[index + 1].evaluate(ctx);
            if (this.operator === 'interpolate') {
                return interpolate[this.type.kind.toLowerCase()](outputLower, outputUpper, t); // eslint-disable-line import/namespace
            }
            else if (this.operator === 'interpolate-hcl') {
                return hcl.reverse(hcl.interpolate(hcl.forward(outputLower), hcl.forward(outputUpper), t));
            }
            else {
                return lab.reverse(lab.interpolate(lab.forward(outputLower), lab.forward(outputUpper), t));
            }
        }
        eachChild(fn) {
            fn(this.input);
            for (const expression of this.outputs) {
                fn(expression);
            }
        }
        outputDefined() {
            return this.outputs.every(out => out.outputDefined());
        }
    }
    /**
     * Returns a ratio that can be used to interpolate between exponential function
     * stops.
     * How it works: Two consecutive stop values define a (scaled and shifted) exponential function `f(x) = a * base^x + b`, where `base` is the user-specified base,
     * and `a` and `b` are constants affording sufficient degrees of freedom to fit
     * the function to the given stops.
     *
     * Here's a bit of algebra that lets us compute `f(x)` directly from the stop
     * values without explicitly solving for `a` and `b`:
     *
     * First stop value: `f(x0) = y0 = a * base^x0 + b`
     * Second stop value: `f(x1) = y1 = a * base^x1 + b`
     * => `y1 - y0 = a(base^x1 - base^x0)`
     * => `a = (y1 - y0)/(base^x1 - base^x0)`
     *
     * Desired value: `f(x) = y = a * base^x + b`
     * => `f(x) = y0 + a * (base^x - base^x0)`
     *
     * From the above, we can replace the `a` in `a * (base^x - base^x0)` and do a
     * little algebra:
     * ```
     * a * (base^x - base^x0) = (y1 - y0)/(base^x1 - base^x0) * (base^x - base^x0)
     *                     = (y1 - y0) * (base^x - base^x0) / (base^x1 - base^x0)
     * ```
     *
     * If we let `(base^x - base^x0) / (base^x1 base^x0)`, then we have
     * `f(x) = y0 + (y1 - y0) * ratio`.  In other words, `ratio` may be treated as
     * an interpolation factor between the two stops' output values.
     *
     * (Note: a slightly different form for `ratio`,
     * `(base^(x-x0) - 1) / (base^(x1-x0) - 1) `, is equivalent, but requires fewer
     * expensive `Math.pow()` operations.)
     *
     * @private
    */
    function exponentialInterpolation(input, base, lowerValue, upperValue) {
        const difference = upperValue - lowerValue;
        const progress = input - lowerValue;
        if (difference === 0) {
            return 0;
        }
        else if (base === 1) {
            return progress / difference;
        }
        else {
            return (Math.pow(base, progress) - 1) / (Math.pow(base, difference) - 1);
        }
    }

    class Coalesce {
        constructor(type, args) {
            this.type = type;
            this.args = args;
        }
        static parse(args, context) {
            if (args.length < 2) {
                return context.error('Expectected at least one argument.');
            }
            let outputType = null;
            const expectedType = context.expectedType;
            if (expectedType && expectedType.kind !== 'value') {
                outputType = expectedType;
            }
            const parsedArgs = [];
            for (const arg of args.slice(1)) {
                const parsed = context.parse(arg, 1 + parsedArgs.length, outputType, undefined, { typeAnnotation: 'omit' });
                if (!parsed)
                    return null;
                outputType = outputType || parsed.type;
                parsedArgs.push(parsed);
            }
            if (!outputType)
                throw new Error('No output type');
            // Above, we parse arguments without inferred type annotation so that
            // they don't produce a runtime error for `null` input, which would
            // preempt the desired null-coalescing behavior.
            // Thus, if any of our arguments would have needed an annotation, we
            // need to wrap the enclosing coalesce expression with it instead.
            const needsAnnotation = expectedType &&
                parsedArgs.some(arg => checkSubtype(expectedType, arg.type));
            return needsAnnotation ?
                new Coalesce(ValueType, parsedArgs) :
                new Coalesce(outputType, parsedArgs);
        }
        evaluate(ctx) {
            let result = null;
            let argCount = 0;
            let requestedImageName;
            for (const arg of this.args) {
                argCount++;
                result = arg.evaluate(ctx);
                // we need to keep track of the first requested image in a coalesce statement
                // if coalesce can't find a valid image, we return the first image name so styleimagemissing can fire
                if (result && result instanceof ResolvedImage && !result.available) {
                    if (!requestedImageName) {
                        requestedImageName = result.name;
                    }
                    result = null;
                    if (argCount === this.args.length) {
                        result = requestedImageName;
                    }
                }
                if (result !== null)
                    break;
            }
            return result;
        }
        eachChild(fn) {
            this.args.forEach(fn);
        }
        outputDefined() {
            return this.args.every(arg => arg.outputDefined());
        }
    }

    class Let {
        constructor(bindings, result) {
            this.type = result.type;
            this.bindings = [].concat(bindings);
            this.result = result;
        }
        evaluate(ctx) {
            return this.result.evaluate(ctx);
        }
        eachChild(fn) {
            for (const binding of this.bindings) {
                fn(binding[1]);
            }
            fn(this.result);
        }
        static parse(args, context) {
            if (args.length < 4)
                return context.error(`Expected at least 3 arguments, but found ${args.length - 1} instead.`);
            const bindings = [];
            for (let i = 1; i < args.length - 1; i += 2) {
                const name = args[i];
                if (typeof name !== 'string') {
                    return context.error(`Expected string, but found ${typeof name} instead.`, i);
                }
                if (/[^a-zA-Z0-9_]/.test(name)) {
                    return context.error('Variable names must contain only alphanumeric characters or \'_\'.', i);
                }
                const value = context.parse(args[i + 1], i + 1);
                if (!value)
                    return null;
                bindings.push([name, value]);
            }
            const result = context.parse(args[args.length - 1], args.length - 1, context.expectedType, bindings);
            if (!result)
                return null;
            return new Let(bindings, result);
        }
        outputDefined() {
            return this.result.outputDefined();
        }
    }

    class At {
        constructor(type, index, input) {
            this.type = type;
            this.index = index;
            this.input = input;
        }
        static parse(args, context) {
            if (args.length !== 3)
                return context.error(`Expected 2 arguments, but found ${args.length - 1} instead.`);
            const index = context.parse(args[1], 1, NumberType);
            const input = context.parse(args[2], 2, array$1(context.expectedType || ValueType));
            if (!index || !input)
                return null;
            const t = input.type;
            return new At(t.itemType, index, input);
        }
        evaluate(ctx) {
            const index = this.index.evaluate(ctx);
            const array = this.input.evaluate(ctx);
            if (index < 0) {
                throw new RuntimeError(`Array index out of bounds: ${index} < 0.`);
            }
            if (index >= array.length) {
                throw new RuntimeError(`Array index out of bounds: ${index} > ${array.length - 1}.`);
            }
            if (index !== Math.floor(index)) {
                throw new RuntimeError(`Array index must be an integer, but found ${index} instead.`);
            }
            return array[index];
        }
        eachChild(fn) {
            fn(this.index);
            fn(this.input);
        }
        outputDefined() {
            return false;
        }
    }

    class In {
        constructor(needle, haystack) {
            this.type = BooleanType;
            this.needle = needle;
            this.haystack = haystack;
        }
        static parse(args, context) {
            if (args.length !== 3) {
                return context.error(`Expected 2 arguments, but found ${args.length - 1} instead.`);
            }
            const needle = context.parse(args[1], 1, ValueType);
            const haystack = context.parse(args[2], 2, ValueType);
            if (!needle || !haystack)
                return null;
            if (!isValidType(needle.type, [BooleanType, StringType, NumberType, NullType, ValueType])) {
                return context.error(`Expected first argument to be of type boolean, string, number or null, but found ${toString$1(needle.type)} instead`);
            }
            return new In(needle, haystack);
        }
        evaluate(ctx) {
            const needle = this.needle.evaluate(ctx);
            const haystack = this.haystack.evaluate(ctx);
            if (!haystack)
                return false;
            if (!isValidNativeType(needle, ['boolean', 'string', 'number', 'null'])) {
                throw new RuntimeError(`Expected first argument to be of type boolean, string, number or null, but found ${toString$1(typeOf(needle))} instead.`);
            }
            if (!isValidNativeType(haystack, ['string', 'array'])) {
                throw new RuntimeError(`Expected second argument to be of type array or string, but found ${toString$1(typeOf(haystack))} instead.`);
            }
            return haystack.indexOf(needle) >= 0;
        }
        eachChild(fn) {
            fn(this.needle);
            fn(this.haystack);
        }
        outputDefined() {
            return true;
        }
    }

    class IndexOf {
        constructor(needle, haystack, fromIndex) {
            this.type = NumberType;
            this.needle = needle;
            this.haystack = haystack;
            this.fromIndex = fromIndex;
        }
        static parse(args, context) {
            if (args.length <= 2 || args.length >= 5) {
                return context.error(`Expected 3 or 4 arguments, but found ${args.length - 1} instead.`);
            }
            const needle = context.parse(args[1], 1, ValueType);
            const haystack = context.parse(args[2], 2, ValueType);
            if (!needle || !haystack)
                return null;
            if (!isValidType(needle.type, [BooleanType, StringType, NumberType, NullType, ValueType])) {
                return context.error(`Expected first argument to be of type boolean, string, number or null, but found ${toString$1(needle.type)} instead`);
            }
            if (args.length === 4) {
                const fromIndex = context.parse(args[3], 3, NumberType);
                if (!fromIndex)
                    return null;
                return new IndexOf(needle, haystack, fromIndex);
            }
            else {
                return new IndexOf(needle, haystack);
            }
        }
        evaluate(ctx) {
            const needle = this.needle.evaluate(ctx);
            const haystack = this.haystack.evaluate(ctx);
            if (!isValidNativeType(needle, ['boolean', 'string', 'number', 'null'])) {
                throw new RuntimeError(`Expected first argument to be of type boolean, string, number or null, but found ${toString$1(typeOf(needle))} instead.`);
            }
            if (!isValidNativeType(haystack, ['string', 'array'])) {
                throw new RuntimeError(`Expected second argument to be of type array or string, but found ${toString$1(typeOf(haystack))} instead.`);
            }
            if (this.fromIndex) {
                const fromIndex = this.fromIndex.evaluate(ctx);
                return haystack.indexOf(needle, fromIndex);
            }
            return haystack.indexOf(needle);
        }
        eachChild(fn) {
            fn(this.needle);
            fn(this.haystack);
            if (this.fromIndex) {
                fn(this.fromIndex);
            }
        }
        outputDefined() {
            return false;
        }
    }

    class Match {
        constructor(inputType, outputType, input, cases, outputs, otherwise) {
            this.inputType = inputType;
            this.type = outputType;
            this.input = input;
            this.cases = cases;
            this.outputs = outputs;
            this.otherwise = otherwise;
        }
        static parse(args, context) {
            if (args.length < 5)
                return context.error(`Expected at least 4 arguments, but found only ${args.length - 1}.`);
            if (args.length % 2 !== 1)
                return context.error('Expected an even number of arguments.');
            let inputType;
            let outputType;
            if (context.expectedType && context.expectedType.kind !== 'value') {
                outputType = context.expectedType;
            }
            const cases = {};
            const outputs = [];
            for (let i = 2; i < args.length - 1; i += 2) {
                let labels = args[i];
                const value = args[i + 1];
                if (!Array.isArray(labels)) {
                    labels = [labels];
                }
                const labelContext = context.concat(i);
                if (labels.length === 0) {
                    return labelContext.error('Expected at least one branch label.');
                }
                for (const label of labels) {
                    if (typeof label !== 'number' && typeof label !== 'string') {
                        return labelContext.error('Branch labels must be numbers or strings.');
                    }
                    else if (typeof label === 'number' && Math.abs(label) > Number.MAX_SAFE_INTEGER) {
                        return labelContext.error(`Branch labels must be integers no larger than ${Number.MAX_SAFE_INTEGER}.`);
                    }
                    else if (typeof label === 'number' && Math.floor(label) !== label) {
                        return labelContext.error('Numeric branch labels must be integer values.');
                    }
                    else if (!inputType) {
                        inputType = typeOf(label);
                    }
                    else if (labelContext.checkSubtype(inputType, typeOf(label))) {
                        return null;
                    }
                    if (typeof cases[String(label)] !== 'undefined') {
                        return labelContext.error('Branch labels must be unique.');
                    }
                    cases[String(label)] = outputs.length;
                }
                const result = context.parse(value, i, outputType);
                if (!result)
                    return null;
                outputType = outputType || result.type;
                outputs.push(result);
            }
            const input = context.parse(args[1], 1, ValueType);
            if (!input)
                return null;
            const otherwise = context.parse(args[args.length - 1], args.length - 1, outputType);
            if (!otherwise)
                return null;
            if (input.type.kind !== 'value' && context.concat(1).checkSubtype(inputType, input.type)) {
                return null;
            }
            return new Match(inputType, outputType, input, cases, outputs, otherwise);
        }
        evaluate(ctx) {
            const input = this.input.evaluate(ctx);
            const output = (typeOf(input) === this.inputType && this.outputs[this.cases[input]]) || this.otherwise;
            return output.evaluate(ctx);
        }
        eachChild(fn) {
            fn(this.input);
            this.outputs.forEach(fn);
            fn(this.otherwise);
        }
        outputDefined() {
            return this.outputs.every(out => out.outputDefined()) && this.otherwise.outputDefined();
        }
    }

    class Case {
        constructor(type, branches, otherwise) {
            this.type = type;
            this.branches = branches;
            this.otherwise = otherwise;
        }
        static parse(args, context) {
            if (args.length < 4)
                return context.error(`Expected at least 3 arguments, but found only ${args.length - 1}.`);
            if (args.length % 2 !== 0)
                return context.error('Expected an odd number of arguments.');
            let outputType;
            if (context.expectedType && context.expectedType.kind !== 'value') {
                outputType = context.expectedType;
            }
            const branches = [];
            for (let i = 1; i < args.length - 1; i += 2) {
                const test = context.parse(args[i], i, BooleanType);
                if (!test)
                    return null;
                const result = context.parse(args[i + 1], i + 1, outputType);
                if (!result)
                    return null;
                branches.push([test, result]);
                outputType = outputType || result.type;
            }
            const otherwise = context.parse(args[args.length - 1], args.length - 1, outputType);
            if (!otherwise)
                return null;
            if (!outputType)
                throw new Error('Can\'t infer output type');
            return new Case(outputType, branches, otherwise);
        }
        evaluate(ctx) {
            for (const [test, expression] of this.branches) {
                if (test.evaluate(ctx)) {
                    return expression.evaluate(ctx);
                }
            }
            return this.otherwise.evaluate(ctx);
        }
        eachChild(fn) {
            for (const [test, expression] of this.branches) {
                fn(test);
                fn(expression);
            }
            fn(this.otherwise);
        }
        outputDefined() {
            return this.branches.every(([_, out]) => out.outputDefined()) && this.otherwise.outputDefined();
        }
    }

    class Slice {
        constructor(type, input, beginIndex, endIndex) {
            this.type = type;
            this.input = input;
            this.beginIndex = beginIndex;
            this.endIndex = endIndex;
        }
        static parse(args, context) {
            if (args.length <= 2 || args.length >= 5) {
                return context.error(`Expected 3 or 4 arguments, but found ${args.length - 1} instead.`);
            }
            const input = context.parse(args[1], 1, ValueType);
            const beginIndex = context.parse(args[2], 2, NumberType);
            if (!input || !beginIndex)
                return null;
            if (!isValidType(input.type, [array$1(ValueType), StringType, ValueType])) {
                return context.error(`Expected first argument to be of type array or string, but found ${toString$1(input.type)} instead`);
            }
            if (args.length === 4) {
                const endIndex = context.parse(args[3], 3, NumberType);
                if (!endIndex)
                    return null;
                return new Slice(input.type, input, beginIndex, endIndex);
            }
            else {
                return new Slice(input.type, input, beginIndex);
            }
        }
        evaluate(ctx) {
            const input = this.input.evaluate(ctx);
            const beginIndex = this.beginIndex.evaluate(ctx);
            if (!isValidNativeType(input, ['string', 'array'])) {
                throw new RuntimeError(`Expected first argument to be of type array or string, but found ${toString$1(typeOf(input))} instead.`);
            }
            if (this.endIndex) {
                const endIndex = this.endIndex.evaluate(ctx);
                return input.slice(beginIndex, endIndex);
            }
            return input.slice(beginIndex);
        }
        eachChild(fn) {
            fn(this.input);
            fn(this.beginIndex);
            if (this.endIndex) {
                fn(this.endIndex);
            }
        }
        outputDefined() {
            return false;
        }
    }

    function isComparableType(op, type) {
        if (op === '==' || op === '!=') {
            // equality operator
            return type.kind === 'boolean' ||
                type.kind === 'string' ||
                type.kind === 'number' ||
                type.kind === 'null' ||
                type.kind === 'value';
        }
        else {
            // ordering operator
            return type.kind === 'string' ||
                type.kind === 'number' ||
                type.kind === 'value';
        }
    }
    function eq(ctx, a, b) { return a === b; }
    function neq(ctx, a, b) { return a !== b; }
    function lt(ctx, a, b) { return a < b; }
    function gt(ctx, a, b) { return a > b; }
    function lteq(ctx, a, b) { return a <= b; }
    function gteq(ctx, a, b) { return a >= b; }
    function eqCollate(ctx, a, b, c) { return c.compare(a, b) === 0; }
    function neqCollate(ctx, a, b, c) { return !eqCollate(ctx, a, b, c); }
    function ltCollate(ctx, a, b, c) { return c.compare(a, b) < 0; }
    function gtCollate(ctx, a, b, c) { return c.compare(a, b) > 0; }
    function lteqCollate(ctx, a, b, c) { return c.compare(a, b) <= 0; }
    function gteqCollate(ctx, a, b, c) { return c.compare(a, b) >= 0; }
    /**
     * Special form for comparison operators, implementing the signatures:
     * - (T, T, ?Collator) => boolean
     * - (T, value, ?Collator) => boolean
     * - (value, T, ?Collator) => boolean
     *
     * For inequalities, T must be either value, string, or number. For ==/!=, it
     * can also be boolean or null.
     *
     * Equality semantics are equivalent to Javascript's strict equality (===/!==)
     * -- i.e., when the arguments' types don't match, == evaluates to false, != to
     * true.
     *
     * When types don't match in an ordering comparison, a runtime error is thrown.
     *
     * @private
     */
    function makeComparison(op, compareBasic, compareWithCollator) {
        const isOrderComparison = op !== '==' && op !== '!=';
        return class Comparison {
            constructor(lhs, rhs, collator) {
                this.type = BooleanType;
                this.lhs = lhs;
                this.rhs = rhs;
                this.collator = collator;
                this.hasUntypedArgument = lhs.type.kind === 'value' || rhs.type.kind === 'value';
            }
            static parse(args, context) {
                if (args.length !== 3 && args.length !== 4)
                    return context.error('Expected two or three arguments.');
                const op = args[0];
                let lhs = context.parse(args[1], 1, ValueType);
                if (!lhs)
                    return null;
                if (!isComparableType(op, lhs.type)) {
                    return context.concat(1).error(`"${op}" comparisons are not supported for type '${toString$1(lhs.type)}'.`);
                }
                let rhs = context.parse(args[2], 2, ValueType);
                if (!rhs)
                    return null;
                if (!isComparableType(op, rhs.type)) {
                    return context.concat(2).error(`"${op}" comparisons are not supported for type '${toString$1(rhs.type)}'.`);
                }
                if (lhs.type.kind !== rhs.type.kind &&
                    lhs.type.kind !== 'value' &&
                    rhs.type.kind !== 'value') {
                    return context.error(`Cannot compare types '${toString$1(lhs.type)}' and '${toString$1(rhs.type)}'.`);
                }
                if (isOrderComparison) {
                    // typing rules specific to less/greater than operators
                    if (lhs.type.kind === 'value' && rhs.type.kind !== 'value') {
                        // (value, T)
                        lhs = new Assertion(rhs.type, [lhs]);
                    }
                    else if (lhs.type.kind !== 'value' && rhs.type.kind === 'value') {
                        // (T, value)
                        rhs = new Assertion(lhs.type, [rhs]);
                    }
                }
                let collator = null;
                if (args.length === 4) {
                    if (lhs.type.kind !== 'string' &&
                        rhs.type.kind !== 'string' &&
                        lhs.type.kind !== 'value' &&
                        rhs.type.kind !== 'value') {
                        return context.error('Cannot use collator to compare non-string types.');
                    }
                    collator = context.parse(args[3], 3, CollatorType);
                    if (!collator)
                        return null;
                }
                return new Comparison(lhs, rhs, collator);
            }
            evaluate(ctx) {
                const lhs = this.lhs.evaluate(ctx);
                const rhs = this.rhs.evaluate(ctx);
                if (isOrderComparison && this.hasUntypedArgument) {
                    const lt = typeOf(lhs);
                    const rt = typeOf(rhs);
                    // check that type is string or number, and equal
                    if (lt.kind !== rt.kind || !(lt.kind === 'string' || lt.kind === 'number')) {
                        throw new RuntimeError(`Expected arguments for "${op}" to be (string, string) or (number, number), but found (${lt.kind}, ${rt.kind}) instead.`);
                    }
                }
                if (this.collator && !isOrderComparison && this.hasUntypedArgument) {
                    const lt = typeOf(lhs);
                    const rt = typeOf(rhs);
                    if (lt.kind !== 'string' || rt.kind !== 'string') {
                        return compareBasic(ctx, lhs, rhs);
                    }
                }
                return this.collator ?
                    compareWithCollator(ctx, lhs, rhs, this.collator.evaluate(ctx)) :
                    compareBasic(ctx, lhs, rhs);
            }
            eachChild(fn) {
                fn(this.lhs);
                fn(this.rhs);
                if (this.collator) {
                    fn(this.collator);
                }
            }
            outputDefined() {
                return true;
            }
        };
    }
    const Equals = makeComparison('==', eq, eqCollate);
    const NotEquals = makeComparison('!=', neq, neqCollate);
    const LessThan = makeComparison('<', lt, ltCollate);
    const GreaterThan = makeComparison('>', gt, gtCollate);
    const LessThanOrEqual = makeComparison('<=', lteq, lteqCollate);
    const GreaterThanOrEqual = makeComparison('>=', gteq, gteqCollate);

    class NumberFormat {
        constructor(number, locale, currency, minFractionDigits, maxFractionDigits) {
            this.type = StringType;
            this.number = number;
            this.locale = locale;
            this.currency = currency;
            this.minFractionDigits = minFractionDigits;
            this.maxFractionDigits = maxFractionDigits;
        }
        static parse(args, context) {
            if (args.length !== 3)
                return context.error('Expected two arguments.');
            const number = context.parse(args[1], 1, NumberType);
            if (!number)
                return null;
            const options = args[2];
            if (typeof options !== 'object' || Array.isArray(options))
                return context.error('NumberFormat options argument must be an object.');
            let locale = null;
            if (options['locale']) {
                locale = context.parse(options['locale'], 1, StringType);
                if (!locale)
                    return null;
            }
            let currency = null;
            if (options['currency']) {
                currency = context.parse(options['currency'], 1, StringType);
                if (!currency)
                    return null;
            }
            let minFractionDigits = null;
            if (options['min-fraction-digits']) {
                minFractionDigits = context.parse(options['min-fraction-digits'], 1, NumberType);
                if (!minFractionDigits)
                    return null;
            }
            let maxFractionDigits = null;
            if (options['max-fraction-digits']) {
                maxFractionDigits = context.parse(options['max-fraction-digits'], 1, NumberType);
                if (!maxFractionDigits)
                    return null;
            }
            return new NumberFormat(number, locale, currency, minFractionDigits, maxFractionDigits);
        }
        evaluate(ctx) {
            return new Intl.NumberFormat(this.locale ? this.locale.evaluate(ctx) : [], {
                style: this.currency ? 'currency' : 'decimal',
                currency: this.currency ? this.currency.evaluate(ctx) : undefined,
                minimumFractionDigits: this.minFractionDigits ? this.minFractionDigits.evaluate(ctx) : undefined,
                maximumFractionDigits: this.maxFractionDigits ? this.maxFractionDigits.evaluate(ctx) : undefined,
            }).format(this.number.evaluate(ctx));
        }
        eachChild(fn) {
            fn(this.number);
            if (this.locale) {
                fn(this.locale);
            }
            if (this.currency) {
                fn(this.currency);
            }
            if (this.minFractionDigits) {
                fn(this.minFractionDigits);
            }
            if (this.maxFractionDigits) {
                fn(this.maxFractionDigits);
            }
        }
        outputDefined() {
            return false;
        }
    }

    class FormatExpression {
        constructor(sections) {
            this.type = FormattedType;
            this.sections = sections;
        }
        static parse(args, context) {
            if (args.length < 2) {
                return context.error('Expected at least one argument.');
            }
            const firstArg = args[1];
            if (!Array.isArray(firstArg) && typeof firstArg === 'object') {
                return context.error('First argument must be an image or text section.');
            }
            const sections = [];
            let nextTokenMayBeObject = false;
            for (let i = 1; i <= args.length - 1; ++i) {
                const arg = args[i];
                if (nextTokenMayBeObject && typeof arg === 'object' && !Array.isArray(arg)) {
                    nextTokenMayBeObject = false;
                    let scale = null;
                    if (arg['font-scale']) {
                        scale = context.parse(arg['font-scale'], 1, NumberType);
                        if (!scale)
                            return null;
                    }
                    let font = null;
                    if (arg['text-font']) {
                        font = context.parse(arg['text-font'], 1, array$1(StringType));
                        if (!font)
                            return null;
                    }
                    let textColor = null;
                    if (arg['text-color']) {
                        textColor = context.parse(arg['text-color'], 1, ColorType);
                        if (!textColor)
                            return null;
                    }
                    const lastExpression = sections[sections.length - 1];
                    lastExpression.scale = scale;
                    lastExpression.font = font;
                    lastExpression.textColor = textColor;
                }
                else {
                    const content = context.parse(args[i], 1, ValueType);
                    if (!content)
                        return null;
                    const kind = content.type.kind;
                    if (kind !== 'string' && kind !== 'value' && kind !== 'null' && kind !== 'resolvedImage')
                        return context.error('Formatted text type must be \'string\', \'value\', \'image\' or \'null\'.');
                    nextTokenMayBeObject = true;
                    sections.push({ content, scale: null, font: null, textColor: null });
                }
            }
            return new FormatExpression(sections);
        }
        evaluate(ctx) {
            const evaluateSection = section => {
                const evaluatedContent = section.content.evaluate(ctx);
                if (typeOf(evaluatedContent) === ResolvedImageType) {
                    return new FormattedSection('', evaluatedContent, null, null, null);
                }
                return new FormattedSection(toString(evaluatedContent), null, section.scale ? section.scale.evaluate(ctx) : null, section.font ? section.font.evaluate(ctx).join(',') : null, section.textColor ? section.textColor.evaluate(ctx) : null);
            };
            return new Formatted(this.sections.map(evaluateSection));
        }
        eachChild(fn) {
            for (const section of this.sections) {
                fn(section.content);
                if (section.scale) {
                    fn(section.scale);
                }
                if (section.font) {
                    fn(section.font);
                }
                if (section.textColor) {
                    fn(section.textColor);
                }
            }
        }
        outputDefined() {
            // Technically the combinatoric set of all children
            // Usually, this.text will be undefined anyway
            return false;
        }
    }

    class ImageExpression {
        constructor(input) {
            this.type = ResolvedImageType;
            this.input = input;
        }
        static parse(args, context) {
            if (args.length !== 2) {
                return context.error('Expected two arguments.');
            }
            const name = context.parse(args[1], 1, StringType);
            if (!name)
                return context.error('No image name provided.');
            return new ImageExpression(name);
        }
        evaluate(ctx) {
            const evaluatedImageName = this.input.evaluate(ctx);
            const value = ResolvedImage.fromString(evaluatedImageName);
            if (value && ctx.availableImages)
                value.available = ctx.availableImages.indexOf(evaluatedImageName) > -1;
            return value;
        }
        eachChild(fn) {
            fn(this.input);
        }
        outputDefined() {
            // The output of image is determined by the list of available images in the evaluation context
            return false;
        }
    }

    class Length {
        constructor(input) {
            this.type = NumberType;
            this.input = input;
        }
        static parse(args, context) {
            if (args.length !== 2)
                return context.error(`Expected 1 argument, but found ${args.length - 1} instead.`);
            const input = context.parse(args[1], 1);
            if (!input)
                return null;
            if (input.type.kind !== 'array' && input.type.kind !== 'string' && input.type.kind !== 'value')
                return context.error(`Expected argument of type string or array, but found ${toString$1(input.type)} instead.`);
            return new Length(input);
        }
        evaluate(ctx) {
            const input = this.input.evaluate(ctx);
            if (typeof input === 'string') {
                return input.length;
            }
            else if (Array.isArray(input)) {
                return input.length;
            }
            else {
                throw new RuntimeError(`Expected value to be of type string or array, but found ${toString$1(typeOf(input))} instead.`);
            }
        }
        eachChild(fn) {
            fn(this.input);
        }
        outputDefined() {
            return false;
        }
    }

    const expressions = {
        // special forms
        '==': Equals,
        '!=': NotEquals,
        '>': GreaterThan,
        '<': LessThan,
        '>=': GreaterThanOrEqual,
        '<=': LessThanOrEqual,
        'array': Assertion,
        'at': At,
        'boolean': Assertion,
        'case': Case,
        'coalesce': Coalesce,
        'collator': CollatorExpression,
        'format': FormatExpression,
        'image': ImageExpression,
        'in': In,
        'index-of': IndexOf,
        'interpolate': Interpolate,
        'interpolate-hcl': Interpolate,
        'interpolate-lab': Interpolate,
        'length': Length,
        'let': Let,
        'literal': Literal,
        'match': Match,
        'number': Assertion,
        'number-format': NumberFormat,
        'object': Assertion,
        'slice': Slice,
        'step': Step,
        'string': Assertion,
        'to-boolean': Coercion,
        'to-color': Coercion,
        'to-number': Coercion,
        'to-string': Coercion,
        'var': Var,
        'within': Within
    };
    function rgba(ctx, [r, g, b, a]) {
        r = r.evaluate(ctx);
        g = g.evaluate(ctx);
        b = b.evaluate(ctx);
        const alpha = a ? a.evaluate(ctx) : 1;
        const error = validateRGBA(r, g, b, alpha);
        if (error)
            throw new RuntimeError(error);
        return new Color(r / 255 * alpha, g / 255 * alpha, b / 255 * alpha, alpha);
    }
    function has(key, obj) {
        return key in obj;
    }
    function get(key, obj) {
        const v = obj[key];
        return typeof v === 'undefined' ? null : v;
    }
    function binarySearch(v, a, i, j) {
        while (i <= j) {
            const m = (i + j) >> 1;
            if (a[m] === v)
                return true;
            if (a[m] > v)
                j = m - 1;
            else
                i = m + 1;
        }
        return false;
    }
    function varargs(type) {
        return { type };
    }
    CompoundExpression.register(expressions, {
        'error': [
            ErrorType,
            [StringType],
            (ctx, [v]) => { throw new RuntimeError(v.evaluate(ctx)); }
        ],
        'typeof': [
            StringType,
            [ValueType],
            (ctx, [v]) => toString$1(typeOf(v.evaluate(ctx)))
        ],
        'to-rgba': [
            array$1(NumberType, 4),
            [ColorType],
            (ctx, [v]) => {
                return v.evaluate(ctx).toArray();
            }
        ],
        'rgb': [
            ColorType,
            [NumberType, NumberType, NumberType],
            rgba
        ],
        'rgba': [
            ColorType,
            [NumberType, NumberType, NumberType, NumberType],
            rgba
        ],
        'has': {
            type: BooleanType,
            overloads: [
                [
                    [StringType],
                    (ctx, [key]) => has(key.evaluate(ctx), ctx.properties())
                ], [
                    [StringType, ObjectType],
                    (ctx, [key, obj]) => has(key.evaluate(ctx), obj.evaluate(ctx))
                ]
            ]
        },
        'get': {
            type: ValueType,
            overloads: [
                [
                    [StringType],
                    (ctx, [key]) => get(key.evaluate(ctx), ctx.properties())
                ], [
                    [StringType, ObjectType],
                    (ctx, [key, obj]) => get(key.evaluate(ctx), obj.evaluate(ctx))
                ]
            ]
        },
        'feature-state': [
            ValueType,
            [StringType],
            (ctx, [key]) => get(key.evaluate(ctx), ctx.featureState || {})
        ],
        'properties': [
            ObjectType,
            [],
            (ctx) => ctx.properties()
        ],
        'geometry-type': [
            StringType,
            [],
            (ctx) => ctx.geometryType()
        ],
        'id': [
            ValueType,
            [],
            (ctx) => ctx.id()
        ],
        'zoom': [
            NumberType,
            [],
            (ctx) => ctx.globals.zoom
        ],
        'heatmap-density': [
            NumberType,
            [],
            (ctx) => ctx.globals.heatmapDensity || 0
        ],
        'line-progress': [
            NumberType,
            [],
            (ctx) => ctx.globals.lineProgress || 0
        ],
        'accumulated': [
            ValueType,
            [],
            (ctx) => ctx.globals.accumulated === undefined ? null : ctx.globals.accumulated
        ],
        '+': [
            NumberType,
            varargs(NumberType),
            (ctx, args) => {
                let result = 0;
                for (const arg of args) {
                    result += arg.evaluate(ctx);
                }
                return result;
            }
        ],
        '*': [
            NumberType,
            varargs(NumberType),
            (ctx, args) => {
                let result = 1;
                for (const arg of args) {
                    result *= arg.evaluate(ctx);
                }
                return result;
            }
        ],
        '-': {
            type: NumberType,
            overloads: [
                [
                    [NumberType, NumberType],
                    (ctx, [a, b]) => a.evaluate(ctx) - b.evaluate(ctx)
                ], [
                    [NumberType],
                    (ctx, [a]) => -a.evaluate(ctx)
                ]
            ]
        },
        '/': [
            NumberType,
            [NumberType, NumberType],
            (ctx, [a, b]) => a.evaluate(ctx) / b.evaluate(ctx)
        ],
        '%': [
            NumberType,
            [NumberType, NumberType],
            (ctx, [a, b]) => a.evaluate(ctx) % b.evaluate(ctx)
        ],
        'ln2': [
            NumberType,
            [],
            () => Math.LN2
        ],
        'pi': [
            NumberType,
            [],
            () => Math.PI
        ],
        'e': [
            NumberType,
            [],
            () => Math.E
        ],
        '^': [
            NumberType,
            [NumberType, NumberType],
            (ctx, [b, e]) => Math.pow(b.evaluate(ctx), e.evaluate(ctx))
        ],
        'sqrt': [
            NumberType,
            [NumberType],
            (ctx, [x]) => Math.sqrt(x.evaluate(ctx))
        ],
        'log10': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.log(n.evaluate(ctx)) / Math.LN10
        ],
        'ln': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.log(n.evaluate(ctx))
        ],
        'log2': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.log(n.evaluate(ctx)) / Math.LN2
        ],
        'sin': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.sin(n.evaluate(ctx))
        ],
        'cos': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.cos(n.evaluate(ctx))
        ],
        'tan': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.tan(n.evaluate(ctx))
        ],
        'asin': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.asin(n.evaluate(ctx))
        ],
        'acos': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.acos(n.evaluate(ctx))
        ],
        'atan': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.atan(n.evaluate(ctx))
        ],
        'min': [
            NumberType,
            varargs(NumberType),
            (ctx, args) => Math.min(...args.map(arg => arg.evaluate(ctx)))
        ],
        'max': [
            NumberType,
            varargs(NumberType),
            (ctx, args) => Math.max(...args.map(arg => arg.evaluate(ctx)))
        ],
        'abs': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.abs(n.evaluate(ctx))
        ],
        'round': [
            NumberType,
            [NumberType],
            (ctx, [n]) => {
                const v = n.evaluate(ctx);
                // Javascript's Math.round() rounds towards +Infinity for halfway
                // values, even when they're negative. It's more common to round
                // away from 0 (e.g., this is what python and C++ do)
                return v < 0 ? -Math.round(-v) : Math.round(v);
            }
        ],
        'floor': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.floor(n.evaluate(ctx))
        ],
        'ceil': [
            NumberType,
            [NumberType],
            (ctx, [n]) => Math.ceil(n.evaluate(ctx))
        ],
        'filter-==': [
            BooleanType,
            [StringType, ValueType],
            (ctx, [k, v]) => ctx.properties()[k.value] === v.value
        ],
        'filter-id-==': [
            BooleanType,
            [ValueType],
            (ctx, [v]) => ctx.id() === v.value
        ],
        'filter-type-==': [
            BooleanType,
            [StringType],
            (ctx, [v]) => ctx.geometryType() === v.value
        ],
        'filter-<': [
            BooleanType,
            [StringType, ValueType],
            (ctx, [k, v]) => {
                const a = ctx.properties()[k.value];
                const b = v.value;
                return typeof a === typeof b && a < b;
            }
        ],
        'filter-id-<': [
            BooleanType,
            [ValueType],
            (ctx, [v]) => {
                const a = ctx.id();
                const b = v.value;
                return typeof a === typeof b && a < b;
            }
        ],
        'filter->': [
            BooleanType,
            [StringType, ValueType],
            (ctx, [k, v]) => {
                const a = ctx.properties()[k.value];
                const b = v.value;
                return typeof a === typeof b && a > b;
            }
        ],
        'filter-id->': [
            BooleanType,
            [ValueType],
            (ctx, [v]) => {
                const a = ctx.id();
                const b = v.value;
                return typeof a === typeof b && a > b;
            }
        ],
        'filter-<=': [
            BooleanType,
            [StringType, ValueType],
            (ctx, [k, v]) => {
                const a = ctx.properties()[k.value];
                const b = v.value;
                return typeof a === typeof b && a <= b;
            }
        ],
        'filter-id-<=': [
            BooleanType,
            [ValueType],
            (ctx, [v]) => {
                const a = ctx.id();
                const b = v.value;
                return typeof a === typeof b && a <= b;
            }
        ],
        'filter->=': [
            BooleanType,
            [StringType, ValueType],
            (ctx, [k, v]) => {
                const a = ctx.properties()[k.value];
                const b = v.value;
                return typeof a === typeof b && a >= b;
            }
        ],
        'filter-id->=': [
            BooleanType,
            [ValueType],
            (ctx, [v]) => {
                const a = ctx.id();
                const b = v.value;
                return typeof a === typeof b && a >= b;
            }
        ],
        'filter-has': [
            BooleanType,
            [ValueType],
            (ctx, [k]) => k.value in ctx.properties()
        ],
        'filter-has-id': [
            BooleanType,
            [],
            (ctx) => (ctx.id() !== null && ctx.id() !== undefined)
        ],
        'filter-type-in': [
            BooleanType,
            [array$1(StringType)],
            (ctx, [v]) => v.value.indexOf(ctx.geometryType()) >= 0
        ],
        'filter-id-in': [
            BooleanType,
            [array$1(ValueType)],
            (ctx, [v]) => v.value.indexOf(ctx.id()) >= 0
        ],
        'filter-in-small': [
            BooleanType,
            [StringType, array$1(ValueType)],
            // assumes v is an array literal
            (ctx, [k, v]) => v.value.indexOf(ctx.properties()[k.value]) >= 0
        ],
        'filter-in-large': [
            BooleanType,
            [StringType, array$1(ValueType)],
            // assumes v is a array literal with values sorted in ascending order and of a single type
            (ctx, [k, v]) => binarySearch(ctx.properties()[k.value], v.value, 0, v.value.length - 1)
        ],
        'all': {
            type: BooleanType,
            overloads: [
                [
                    [BooleanType, BooleanType],
                    (ctx, [a, b]) => a.evaluate(ctx) && b.evaluate(ctx)
                ],
                [
                    varargs(BooleanType),
                    (ctx, args) => {
                        for (const arg of args) {
                            if (!arg.evaluate(ctx))
                                return false;
                        }
                        return true;
                    }
                ]
            ]
        },
        'any': {
            type: BooleanType,
            overloads: [
                [
                    [BooleanType, BooleanType],
                    (ctx, [a, b]) => a.evaluate(ctx) || b.evaluate(ctx)
                ],
                [
                    varargs(BooleanType),
                    (ctx, args) => {
                        for (const arg of args) {
                            if (arg.evaluate(ctx))
                                return true;
                        }
                        return false;
                    }
                ]
            ]
        },
        '!': [
            BooleanType,
            [BooleanType],
            (ctx, [b]) => !b.evaluate(ctx)
        ],
        'is-supported-script': [
            BooleanType,
            [StringType],
            // At parse time this will always return true, so we need to exclude this expression with isGlobalPropertyConstant
            (ctx, [s]) => {
                const isSupportedScript = ctx.globals && ctx.globals.isSupportedScript;
                if (isSupportedScript) {
                    return isSupportedScript(s.evaluate(ctx));
                }
                return true;
            }
        ],
        'upcase': [
            StringType,
            [StringType],
            (ctx, [s]) => s.evaluate(ctx).toUpperCase()
        ],
        'downcase': [
            StringType,
            [StringType],
            (ctx, [s]) => s.evaluate(ctx).toLowerCase()
        ],
        'concat': [
            StringType,
            varargs(ValueType),
            (ctx, args) => args.map(arg => toString(arg.evaluate(ctx))).join('')
        ],
        'resolved-locale': [
            StringType,
            [CollatorType],
            (ctx, [collator]) => collator.evaluate(ctx).resolvedLocale()
        ]
    });

    function success(value) {
        return { result: 'success', value };
    }
    function error(value) {
        return { result: 'error', value };
    }

    function supportsPropertyExpression(spec) {
        return spec['property-type'] === 'data-driven' || spec['property-type'] === 'cross-faded-data-driven';
    }
    function supportsZoomExpression(spec) {
        return !!spec.expression && spec.expression.parameters.indexOf('zoom') > -1;
    }
    function supportsInterpolation(spec) {
        return !!spec.expression && spec.expression.interpolated;
    }

    function getType(val) {
        if (val instanceof Number) {
            return 'number';
        }
        else if (val instanceof String) {
            return 'string';
        }
        else if (val instanceof Boolean) {
            return 'boolean';
        }
        else if (Array.isArray(val)) {
            return 'array';
        }
        else if (val === null) {
            return 'null';
        }
        else {
            return typeof val;
        }
    }

    function isFunction(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    function identityFunction(x) {
        return x;
    }
    function createFunction(parameters, propertySpec) {
        const isColor = propertySpec.type === 'color';
        const zoomAndFeatureDependent = parameters.stops && typeof parameters.stops[0][0] === 'object';
        const featureDependent = zoomAndFeatureDependent || parameters.property !== undefined;
        const zoomDependent = zoomAndFeatureDependent || !featureDependent;
        const type = parameters.type || (supportsInterpolation(propertySpec) ? 'exponential' : 'interval');
        if (isColor || propertySpec.type === 'padding') {
            const parseFn = isColor ? Color.parse : Padding.parse;
            parameters = extendBy({}, parameters);
            if (parameters.stops) {
                parameters.stops = parameters.stops.map((stop) => {
                    return [stop[0], parseFn(stop[1])];
                });
            }
            if (parameters.default) {
                parameters.default = parseFn(parameters.default);
            }
            else {
                parameters.default = parseFn(propertySpec.default);
            }
        }
        if (parameters.colorSpace && parameters.colorSpace !== 'rgb' && !colorSpaces[parameters.colorSpace]) { // eslint-disable-line import/namespace
            throw new Error(`Unknown color space: ${parameters.colorSpace}`);
        }
        let innerFun;
        let hashedStops;
        let categoricalKeyType;
        if (type === 'exponential') {
            innerFun = evaluateExponentialFunction;
        }
        else if (type === 'interval') {
            innerFun = evaluateIntervalFunction;
        }
        else if (type === 'categorical') {
            innerFun = evaluateCategoricalFunction;
            // For categorical functions, generate an Object as a hashmap of the stops for fast searching
            hashedStops = Object.create(null);
            for (const stop of parameters.stops) {
                hashedStops[stop[0]] = stop[1];
            }
            // Infer key type based on first stop key-- used to encforce strict type checking later
            categoricalKeyType = typeof parameters.stops[0][0];
        }
        else if (type === 'identity') {
            innerFun = evaluateIdentityFunction;
        }
        else {
            throw new Error(`Unknown function type "${type}"`);
        }
        if (zoomAndFeatureDependent) {
            const featureFunctions = {};
            const zoomStops = [];
            for (let s = 0; s < parameters.stops.length; s++) {
                const stop = parameters.stops[s];
                const zoom = stop[0].zoom;
                if (featureFunctions[zoom] === undefined) {
                    featureFunctions[zoom] = {
                        zoom,
                        type: parameters.type,
                        property: parameters.property,
                        default: parameters.default,
                        stops: []
                    };
                    zoomStops.push(zoom);
                }
                featureFunctions[zoom].stops.push([stop[0].value, stop[1]]);
            }
            const featureFunctionStops = [];
            for (const z of zoomStops) {
                featureFunctionStops.push([featureFunctions[z].zoom, createFunction(featureFunctions[z], propertySpec)]);
            }
            const interpolationType = { name: 'linear' };
            return {
                kind: 'composite',
                interpolationType,
                interpolationFactor: Interpolate.interpolationFactor.bind(undefined, interpolationType),
                zoomStops: featureFunctionStops.map(s => s[0]),
                evaluate({ zoom }, properties) {
                    return evaluateExponentialFunction({
                        stops: featureFunctionStops,
                        base: parameters.base
                    }, propertySpec, zoom).evaluate(zoom, properties);
                }
            };
        }
        else if (zoomDependent) {
            const interpolationType = type === 'exponential' ?
                { name: 'exponential', base: parameters.base !== undefined ? parameters.base : 1 } : null;
            return {
                kind: 'camera',
                interpolationType,
                interpolationFactor: Interpolate.interpolationFactor.bind(undefined, interpolationType),
                zoomStops: parameters.stops.map(s => s[0]),
                evaluate: ({ zoom }) => innerFun(parameters, propertySpec, zoom, hashedStops, categoricalKeyType)
            };
        }
        else {
            return {
                kind: 'source',
                evaluate(_, feature) {
                    const value = feature && feature.properties ? feature.properties[parameters.property] : undefined;
                    if (value === undefined) {
                        return coalesce(parameters.default, propertySpec.default);
                    }
                    return innerFun(parameters, propertySpec, value, hashedStops, categoricalKeyType);
                }
            };
        }
    }
    function coalesce(a, b, c) {
        if (a !== undefined)
            return a;
        if (b !== undefined)
            return b;
        if (c !== undefined)
            return c;
    }
    function evaluateCategoricalFunction(parameters, propertySpec, input, hashedStops, keyType) {
        const evaluated = typeof input === keyType ? hashedStops[input] : undefined; // Enforce strict typing on input
        return coalesce(evaluated, parameters.default, propertySpec.default);
    }
    function evaluateIntervalFunction(parameters, propertySpec, input) {
        // Edge cases
        if (getType(input) !== 'number')
            return coalesce(parameters.default, propertySpec.default);
        const n = parameters.stops.length;
        if (n === 1)
            return parameters.stops[0][1];
        if (input <= parameters.stops[0][0])
            return parameters.stops[0][1];
        if (input >= parameters.stops[n - 1][0])
            return parameters.stops[n - 1][1];
        const index = findStopLessThanOrEqualTo(parameters.stops.map((stop) => stop[0]), input);
        return parameters.stops[index][1];
    }
    function evaluateExponentialFunction(parameters, propertySpec, input) {
        const base = parameters.base !== undefined ? parameters.base : 1;
        // Edge cases
        if (getType(input) !== 'number')
            return coalesce(parameters.default, propertySpec.default);
        const n = parameters.stops.length;
        if (n === 1)
            return parameters.stops[0][1];
        if (input <= parameters.stops[0][0])
            return parameters.stops[0][1];
        if (input >= parameters.stops[n - 1][0])
            return parameters.stops[n - 1][1];
        const index = findStopLessThanOrEqualTo(parameters.stops.map((stop) => stop[0]), input);
        const t = interpolationFactor(input, base, parameters.stops[index][0], parameters.stops[index + 1][0]);
        const outputLower = parameters.stops[index][1];
        const outputUpper = parameters.stops[index + 1][1];
        let interp = interpolate[propertySpec.type] || identityFunction; // eslint-disable-line import/namespace
        if (parameters.colorSpace && parameters.colorSpace !== 'rgb') {
            const colorspace = colorSpaces[parameters.colorSpace]; // eslint-disable-line import/namespace
            interp = (a, b) => colorspace.reverse(colorspace.interpolate(colorspace.forward(a), colorspace.forward(b), t));
        }
        if (typeof outputLower.evaluate === 'function') {
            return {
                evaluate(...args) {
                    const evaluatedLower = outputLower.evaluate.apply(undefined, args);
                    const evaluatedUpper = outputUpper.evaluate.apply(undefined, args);
                    // Special case for fill-outline-color, which has no spec default.
                    if (evaluatedLower === undefined || evaluatedUpper === undefined) {
                        return undefined;
                    }
                    return interp(evaluatedLower, evaluatedUpper, t);
                }
            };
        }
        return interp(outputLower, outputUpper, t);
    }
    function evaluateIdentityFunction(parameters, propertySpec, input) {
        switch (propertySpec.type) {
            case 'color':
                input = Color.parse(input);
                break;
            case 'formatted':
                input = Formatted.fromString(input.toString());
                break;
            case 'resolvedImage':
                input = ResolvedImage.fromString(input.toString());
                break;
            case 'padding':
                input = Padding.parse(input);
                break;
            default:
                if (getType(input) !== propertySpec.type && (propertySpec.type !== 'enum' || !propertySpec.values[input])) {
                    input = undefined;
                }
        }
        return coalesce(input, parameters.default, propertySpec.default);
    }
    /**
     * Returns a ratio that can be used to interpolate between exponential function
     * stops.
     *
     * How it works:
     * Two consecutive stop values define a (scaled and shifted) exponential
     * function `f(x) = a * base^x + b`, where `base` is the user-specified base,
     * and `a` and `b` are constants affording sufficient degrees of freedom to fit
     * the function to the given stops.
     *
     * Here's a bit of algebra that lets us compute `f(x)` directly from the stop
     * values without explicitly solving for `a` and `b`:
     *
     * First stop value: `f(x0) = y0 = a * base^x0 + b`
     * Second stop value: `f(x1) = y1 = a * base^x1 + b`
     * => `y1 - y0 = a(base^x1 - base^x0)`
     * => `a = (y1 - y0)/(base^x1 - base^x0)`
     *
     * Desired value: `f(x) = y = a * base^x + b`
     * => `f(x) = y0 + a * (base^x - base^x0)`
     *
     * From the above, we can replace the `a` in `a * (base^x - base^x0)` and do a
     * little algebra:
     * ```
     * a * (base^x - base^x0) = (y1 - y0)/(base^x1 - base^x0) * (base^x - base^x0)
     *                     = (y1 - y0) * (base^x - base^x0) / (base^x1 - base^x0)
     * ```
     *
     * If we let `(base^x - base^x0) / (base^x1 base^x0)`, then we have
     * `f(x) = y0 + (y1 - y0) * ratio`.  In other words, `ratio` may be treated as
     * an interpolation factor between the two stops' output values.
     *
     * (Note: a slightly different form for `ratio`,
     * `(base^(x-x0) - 1) / (base^(x1-x0) - 1) `, is equivalent, but requires fewer
     * expensive `Math.pow()` operations.)
     *
     * @private
     */
    function interpolationFactor(input, base, lowerValue, upperValue) {
        const difference = upperValue - lowerValue;
        const progress = input - lowerValue;
        if (difference === 0) {
            return 0;
        }
        else if (base === 1) {
            return progress / difference;
        }
        else {
            return (Math.pow(base, progress) - 1) / (Math.pow(base, difference) - 1);
        }
    }

    class StyleExpression {
        constructor(expression, propertySpec) {
            this.expression = expression;
            this._warningHistory = {};
            this._evaluator = new EvaluationContext();
            this._defaultValue = propertySpec ? getDefaultValue(propertySpec) : null;
            this._enumValues = propertySpec && propertySpec.type === 'enum' ? propertySpec.values : null;
        }
        evaluateWithoutErrorHandling(globals, feature, featureState, canonical, availableImages, formattedSection) {
            this._evaluator.globals = globals;
            this._evaluator.feature = feature;
            this._evaluator.featureState = featureState;
            this._evaluator.canonical = canonical;
            this._evaluator.availableImages = availableImages || null;
            this._evaluator.formattedSection = formattedSection;
            return this.expression.evaluate(this._evaluator);
        }
        evaluate(globals, feature, featureState, canonical, availableImages, formattedSection) {
            this._evaluator.globals = globals;
            this._evaluator.feature = feature || null;
            this._evaluator.featureState = featureState || null;
            this._evaluator.canonical = canonical;
            this._evaluator.availableImages = availableImages || null;
            this._evaluator.formattedSection = formattedSection || null;
            try {
                const val = this.expression.evaluate(this._evaluator);
                // eslint-disable-next-line no-self-compare
                if (val === null || val === undefined || (typeof val === 'number' && val !== val)) {
                    return this._defaultValue;
                }
                if (this._enumValues && !(val in this._enumValues)) {
                    throw new RuntimeError(`Expected value to be one of ${Object.keys(this._enumValues).map(v => JSON.stringify(v)).join(', ')}, but found ${JSON.stringify(val)} instead.`);
                }
                return val;
            }
            catch (e) {
                if (!this._warningHistory[e.message]) {
                    this._warningHistory[e.message] = true;
                    if (typeof console !== 'undefined') {
                        console.warn(e.message);
                    }
                }
                return this._defaultValue;
            }
        }
    }
    function isExpression(expression) {
        return Array.isArray(expression) && expression.length > 0 &&
            typeof expression[0] === 'string' && expression[0] in expressions;
    }
    /**
     * Parse and typecheck the given style spec JSON expression.  If
     * options.defaultValue is provided, then the resulting StyleExpression's
     * `evaluate()` method will handle errors by logging a warning (once per
     * message) and returning the default value.  Otherwise, it will throw
     * evaluation errors.
     *
     * @private
     */
    function createExpression(expression, propertySpec) {
        const parser = new ParsingContext$1(expressions, [], propertySpec ? getExpectedType(propertySpec) : undefined);
        // For string-valued properties, coerce to string at the top level rather than asserting.
        const parsed = parser.parse(expression, undefined, undefined, undefined, propertySpec && propertySpec.type === 'string' ? { typeAnnotation: 'coerce' } : undefined);
        if (!parsed) {
            return error(parser.errors);
        }
        return success(new StyleExpression(parsed, propertySpec));
    }
    class ZoomConstantExpression {
        constructor(kind, expression) {
            this.kind = kind;
            this._styleExpression = expression;
            this.isStateDependent = kind !== 'constant' && !isStateConstant(expression.expression);
        }
        evaluateWithoutErrorHandling(globals, feature, featureState, canonical, availableImages, formattedSection) {
            return this._styleExpression.evaluateWithoutErrorHandling(globals, feature, featureState, canonical, availableImages, formattedSection);
        }
        evaluate(globals, feature, featureState, canonical, availableImages, formattedSection) {
            return this._styleExpression.evaluate(globals, feature, featureState, canonical, availableImages, formattedSection);
        }
    }
    class ZoomDependentExpression {
        constructor(kind, expression, zoomStops, interpolationType) {
            this.kind = kind;
            this.zoomStops = zoomStops;
            this._styleExpression = expression;
            this.isStateDependent = kind !== 'camera' && !isStateConstant(expression.expression);
            this.interpolationType = interpolationType;
        }
        evaluateWithoutErrorHandling(globals, feature, featureState, canonical, availableImages, formattedSection) {
            return this._styleExpression.evaluateWithoutErrorHandling(globals, feature, featureState, canonical, availableImages, formattedSection);
        }
        evaluate(globals, feature, featureState, canonical, availableImages, formattedSection) {
            return this._styleExpression.evaluate(globals, feature, featureState, canonical, availableImages, formattedSection);
        }
        interpolationFactor(input, lower, upper) {
            if (this.interpolationType) {
                return Interpolate.interpolationFactor(this.interpolationType, input, lower, upper);
            }
            else {
                return 0;
            }
        }
    }
    function createPropertyExpression(expressionInput, propertySpec) {
        const expression = createExpression(expressionInput, propertySpec);
        if (expression.result === 'error') {
            return expression;
        }
        const parsed = expression.value.expression;
        const isFeatureConstant$1 = isFeatureConstant(parsed);
        if (!isFeatureConstant$1 && !supportsPropertyExpression(propertySpec)) {
            return error([new ExpressionParsingError('', 'data expressions not supported')]);
        }
        const isZoomConstant = isGlobalPropertyConstant(parsed, ['zoom']);
        if (!isZoomConstant && !supportsZoomExpression(propertySpec)) {
            return error([new ExpressionParsingError('', 'zoom expressions not supported')]);
        }
        const zoomCurve = findZoomCurve(parsed);
        if (!zoomCurve && !isZoomConstant) {
            return error([new ExpressionParsingError('', '"zoom" expression may only be used as input to a top-level "step" or "interpolate" expression.')]);
        }
        else if (zoomCurve instanceof ExpressionParsingError) {
            return error([zoomCurve]);
        }
        else if (zoomCurve instanceof Interpolate && !supportsInterpolation(propertySpec)) {
            return error([new ExpressionParsingError('', '"interpolate" expressions cannot be used with this property')]);
        }
        if (!zoomCurve) {
            return success(isFeatureConstant$1 ?
                new ZoomConstantExpression('constant', expression.value) :
                new ZoomConstantExpression('source', expression.value));
        }
        const interpolationType = zoomCurve instanceof Interpolate ? zoomCurve.interpolation : undefined;
        return success(isFeatureConstant$1 ?
            new ZoomDependentExpression('camera', expression.value, zoomCurve.labels, interpolationType) :
            new ZoomDependentExpression('composite', expression.value, zoomCurve.labels, interpolationType));
    }
    // serialization wrapper for old-style stop functions normalized to the
    // expression interface
    class StylePropertyFunction {
        constructor(parameters, specification) {
            this._parameters = parameters;
            this._specification = specification;
            extendBy(this, createFunction(this._parameters, this._specification));
        }
        static deserialize(serialized) {
            return new StylePropertyFunction(serialized._parameters, serialized._specification);
        }
        static serialize(input) {
            return {
                _parameters: input._parameters,
                _specification: input._specification
            };
        }
    }
    function normalizePropertyExpression(value, specification) {
        if (isFunction(value)) {
            return new StylePropertyFunction(value, specification);
        }
        else if (isExpression(value)) {
            const expression = createPropertyExpression(value, specification);
            if (expression.result === 'error') {
                // this should have been caught in validation
                throw new Error(expression.value.map(err => `${err.key}: ${err.message}`).join(', '));
            }
            return expression.value;
        }
        else {
            let constant = value;
            if (specification.type === 'color' && typeof value === 'string') {
                constant = Color.parse(value);
            }
            else if (specification.type === 'padding' && (typeof value === 'number' || Array.isArray(value))) {
                constant = Padding.parse(value);
            }
            return {
                kind: 'constant',
                evaluate: () => constant
            };
        }
    }
    // Zoom-dependent expressions may only use ["zoom"] as the input to a top-level "step" or "interpolate"
    // expression (collectively referred to as a "curve"). The curve may be wrapped in one or more "let" or
    // "coalesce" expressions.
    function findZoomCurve(expression) {
        let result = null;
        if (expression instanceof Let) {
            result = findZoomCurve(expression.result);
        }
        else if (expression instanceof Coalesce) {
            for (const arg of expression.args) {
                result = findZoomCurve(arg);
                if (result) {
                    break;
                }
            }
        }
        else if ((expression instanceof Step || expression instanceof Interpolate) &&
            expression.input instanceof CompoundExpression &&
            expression.input.name === 'zoom') {
            result = expression;
        }
        if (result instanceof ExpressionParsingError) {
            return result;
        }
        expression.eachChild((child) => {
            const childResult = findZoomCurve(child);
            if (childResult instanceof ExpressionParsingError) {
                result = childResult;
            }
            else if (!result && childResult) {
                result = new ExpressionParsingError('', '"zoom" expression may only be used as input to a top-level "step" or "interpolate" expression.');
            }
            else if (result && childResult && result !== childResult) {
                result = new ExpressionParsingError('', 'Only one zoom-based "step" or "interpolate" subexpression may be used in an expression.');
            }
        });
        return result;
    }
    function getExpectedType(spec) {
        const types = {
            color: ColorType,
            string: StringType,
            number: NumberType,
            enum: StringType,
            boolean: BooleanType,
            formatted: FormattedType,
            padding: PaddingType,
            resolvedImage: ResolvedImageType
        };
        if (spec.type === 'array') {
            return array$1(types[spec.value] || ValueType, spec.length);
        }
        return types[spec.type];
    }
    function getDefaultValue(spec) {
        if (spec.type === 'color' && isFunction(spec.default)) {
            // Special case for heatmap-color: it uses the 'default:' to define a
            // default color ramp, but createExpression expects a simple value to fall
            // back to in case of runtime errors
            return new Color(0, 0, 0, 0);
        }
        else if (spec.type === 'color') {
            return Color.parse(spec.default) || null;
        }
        else if (spec.type === 'padding') {
            return Padding.parse(spec.default) || null;
        }
        else if (spec.default === undefined) {
            return null;
        }
        else {
            return spec.default;
        }
    }

    const config = {
        MAX_PARALLEL_IMAGE_REQUESTS: 16,
        REGISTERED_PROTOCOLS: {},
    };

    const CACHE_NAME = 'mapbox-tiles';
    const MIN_TIME_UNTIL_EXPIRY = 1000 * 60 * 7; // 7 minutes. Skip caching tiles with a short enough max age.
    // We're using a global shared cache object. Normally, requesting ad-hoc Cache objects is fine, but
    // Safari has a memory leak in which it fails to release memory when requesting keys() from a Cache
    // object. See https://bugs.webkit.org/show_bug.cgi?id=203991 for more information.
    let sharedCache;
    function cacheOpen() {
        if (typeof caches !== 'undefined' && !sharedCache) {
            sharedCache = caches.open(CACHE_NAME);
        }
    }
    let responseConstructorSupportsReadableStream;
    function prepareBody(response, callback) {
        if (responseConstructorSupportsReadableStream === undefined) {
            try {
                new Response(new ReadableStream()); // eslint-disable-line no-undef
                responseConstructorSupportsReadableStream = true;
            }
            catch (e) {
                // Edge
                responseConstructorSupportsReadableStream = false;
            }
        }
        if (responseConstructorSupportsReadableStream) {
            callback(response.body);
        }
        else {
            response.blob().then(callback);
        }
    }
    function cachePut(request, response, requestTime) {
        cacheOpen();
        if (!sharedCache)
            return;
        const options = {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers()
        };
        response.headers.forEach((v, k) => options.headers.set(k, v));
        const cacheControl = parseCacheControl(response.headers.get('Cache-Control') || '');
        if (cacheControl['no-store']) {
            return;
        }
        if (cacheControl['max-age']) {
            options.headers.set('Expires', new Date(requestTime + cacheControl['max-age'] * 1000).toUTCString());
        }
        const timeUntilExpiry = new Date(options.headers.get('Expires')).getTime() - requestTime;
        if (timeUntilExpiry < MIN_TIME_UNTIL_EXPIRY)
            return;
        prepareBody(response, body => {
            const clonedResponse = new Response(body, options);
            cacheOpen();
            if (!sharedCache)
                return;
            sharedCache
                .then(cache => cache.put(stripQueryParameters(request.url), clonedResponse))
                .catch(e => warnOnce(e.message));
        });
    }
    function stripQueryParameters(url) {
        const start = url.indexOf('?');
        return start < 0 ? url : url.slice(0, start);
    }
    // runs on worker, see above comment
    function enforceCacheSizeLimit(limit) {
        cacheOpen();
        if (!sharedCache)
            return;
        sharedCache
            .then(cache => {
            cache.keys().then(keys => {
                for (let i = 0; i < keys.length - limit; i++) {
                    cache.delete(keys[i]);
                }
            });
        });
    }

    const exported = {
        supported: false,
        testSupport
    };
    let glForTesting;
    let webpCheckComplete = false;
    let webpImgTest;
    let webpImgTestOnloadComplete = false;
    if (typeof document !== 'undefined') {
        webpImgTest = document.createElement('img');
        webpImgTest.onload = function () {
            if (glForTesting)
                testWebpTextureUpload(glForTesting);
            glForTesting = null;
            webpImgTestOnloadComplete = true;
        };
        webpImgTest.onerror = function () {
            webpCheckComplete = true;
            glForTesting = null;
        };
        webpImgTest.src = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAQAAAAfQ//73v/+BiOh/AAA=';
    }
    function testSupport(gl) {
        if (webpCheckComplete || !webpImgTest)
            return;
        // HTMLImageElement.complete is set when an image is done loading it's source
        // regardless of whether the load was successful or not.
        // It's possible for an error to set HTMLImageElement.complete to true which would trigger
        // testWebpTextureUpload and mistakenly set exported.supported to true in browsers which don't support webp
        // To avoid this, we set a flag in the image's onload handler and only call testWebpTextureUpload
        // after a successful image load event.
        if (webpImgTestOnloadComplete) {
            testWebpTextureUpload(gl);
        }
        else {
            glForTesting = gl;
        }
    }
    function testWebpTextureUpload(gl) {
        // Edge 18 supports WebP but not uploading a WebP image to a gl texture
        // Test support for this before allowing WebP images.
        // https://github.com/mapbox/mapbox-gl-js/issues/7671
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, webpImgTest);
            // The error does not get triggered in Edge if the context is lost
            if (gl.isContextLost())
                return;
            exported.supported = true;
        }
        catch (e) {
            // Catch "Unspecified Error." in Edge 18.
        }
        gl.deleteTexture(texture);
        webpCheckComplete = true;
    }

    /**
     * An error thrown when a HTTP request results in an error response.
     * @extends Error
     * @param {number} status The response's HTTP status code.
     * @param {string} statusText The response's HTTP status text.
     * @param {string} url The request's URL.
     * @param {Blob} body The response's body.
     */
    class AJAXError extends Error {
        constructor(status, statusText, url, body) {
            super(`AJAXError: ${statusText} (${status}): ${url}`);
            this.status = status;
            this.statusText = statusText;
            this.url = url;
            this.body = body;
        }
    }
    // Ensure that we're sending the correct referrer from blob URL worker bundles.
    // For files loaded from the local file system, `location.origin` will be set
    // to the string(!) "null" (Firefox), or "file://" (Chrome, Safari, Edge, IE),
    // and we will set an empty referrer. Otherwise, we're using the document's URL.
    /* global self */
    const getReferrer = isWorker() ?
        () => self.worker && self.worker.referrer :
        () => (window.location.protocol === 'blob:' ? window.parent : window).location.href;
    // Determines whether a URL is a file:// URL. This is obviously the case if it begins
    // with file://. Relative URLs are also file:// URLs iff the original document was loaded
    // via a file:// URL.
    const isFileURL = url => /^file:/.test(url) || (/^file:/.test(getReferrer()) && !/^\w+:/.test(url));
    function makeFetchRequest(requestParameters, callback) {
        const controller = new AbortController();
        const request = new Request(requestParameters.url, {
            method: requestParameters.method || 'GET',
            body: requestParameters.body,
            credentials: requestParameters.credentials,
            headers: requestParameters.headers,
            referrer: getReferrer(),
            signal: controller.signal
        });
        let complete = false;
        let aborted = false;
        if (requestParameters.type === 'json') {
            request.headers.set('Accept', 'application/json');
        }
        const validateOrFetch = (err, cachedResponse, responseIsFresh) => {
            if (aborted)
                return;
            if (err) {
                // Do fetch in case of cache error.
                // HTTP pages in Edge trigger a security error that can be ignored.
                if (err.message !== 'SecurityError') {
                    warnOnce(err);
                }
            }
            if (cachedResponse && responseIsFresh) {
                return finishRequest(cachedResponse);
            }
            const requestTime = Date.now();
            fetch(request).then(response => {
                if (response.ok) {
                    const cacheableResponse = null;
                    return finishRequest(response, cacheableResponse, requestTime);
                }
                else {
                    return response.blob().then(body => callback(new AJAXError(response.status, response.statusText, requestParameters.url, body)));
                }
            }).catch(error => {
                if (error.code === 20) {
                    // silence expected AbortError
                    return;
                }
                callback(new Error(error.message));
            });
        };
        const finishRequest = (response, cacheableResponse, requestTime) => {
            (requestParameters.type === 'arrayBuffer' ? response.arrayBuffer() :
                requestParameters.type === 'json' ? response.json() :
                    response.text()).then(result => {
                if (aborted)
                    return;
                if (cacheableResponse && requestTime) {
                    // The response needs to be inserted into the cache after it has completely loaded.
                    // Until it is fully loaded there is a chance it will be aborted. Aborting while
                    // reading the body can cause the cache insertion to error. We could catch this error
                    // in most browsers but in Firefox it seems to sometimes crash the tab. Adding
                    // it to the cache here avoids that error.
                    cachePut(request, cacheableResponse, requestTime);
                }
                complete = true;
                callback(null, result, response.headers.get('Cache-Control'), response.headers.get('Expires'));
            }).catch(err => {
                if (!aborted)
                    callback(new Error(err.message));
            });
        };
        {
            validateOrFetch(null, null);
        }
        return { cancel: () => {
                aborted = true;
                if (!complete)
                    controller.abort();
            } };
    }
    function makeXMLHttpRequest(requestParameters, callback) {
        const xhr = new XMLHttpRequest();
        xhr.open(requestParameters.method || 'GET', requestParameters.url, true);
        if (requestParameters.type === 'arrayBuffer') {
            xhr.responseType = 'arraybuffer';
        }
        for (const k in requestParameters.headers) {
            xhr.setRequestHeader(k, requestParameters.headers[k]);
        }
        if (requestParameters.type === 'json') {
            xhr.responseType = 'text';
            xhr.setRequestHeader('Accept', 'application/json');
        }
        xhr.withCredentials = requestParameters.credentials === 'include';
        xhr.onerror = () => {
            callback(new Error(xhr.statusText));
        };
        xhr.onload = () => {
            if (((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) && xhr.response !== null) {
                let data = xhr.response;
                if (requestParameters.type === 'json') {
                    // We're manually parsing JSON here to get better error messages.
                    try {
                        data = JSON.parse(xhr.response);
                    }
                    catch (err) {
                        return callback(err);
                    }
                }
                callback(null, data, xhr.getResponseHeader('Cache-Control'), xhr.getResponseHeader('Expires'));
            }
            else {
                const body = new Blob([xhr.response], { type: xhr.getResponseHeader('Content-Type') });
                callback(new AJAXError(xhr.status, xhr.statusText, requestParameters.url, body));
            }
        };
        xhr.send(requestParameters.body);
        return { cancel: () => xhr.abort() };
    }
    const makeRequest = function (requestParameters, callback) {
        // We're trying to use the Fetch API if possible. However, in some situations we can't use it:
        // - IE11 doesn't support it at all. In this case, we dispatch the request to the main thread so
        //   that we can get an accruate referrer header.
        // - Safari exposes window.AbortController, but it doesn't work actually abort any requests in
        //   some versions (see https://bugs.webkit.org/show_bug.cgi?id=174980#c2)
        // - Requests for resources with the file:// URI scheme don't work with the Fetch API either. In
        //   this case we unconditionally use XHR on the current thread since referrers don't matter.
        if (/:\/\//.test(requestParameters.url) && !(/^https?:|^file:/.test(requestParameters.url))) {
            if (isWorker() && self.worker && self.worker.actor) {
                return self.worker.actor.send('getResource', requestParameters, callback);
            }
            if (!isWorker()) {
                const protocol = requestParameters.url.substring(0, requestParameters.url.indexOf('://'));
                const action = config.REGISTERED_PROTOCOLS[protocol] || makeFetchRequest;
                return action(requestParameters, callback);
            }
        }
        if (!isFileURL(requestParameters.url)) {
            if (fetch && Request && AbortController && Object.prototype.hasOwnProperty.call(Request.prototype, 'signal')) {
                return makeFetchRequest(requestParameters, callback);
            }
            if (isWorker() && self.worker && self.worker.actor) {
                const queueOnMainThread = true;
                return self.worker.actor.send('getResource', requestParameters, callback, undefined, queueOnMainThread);
            }
        }
        return makeXMLHttpRequest(requestParameters, callback);
    };
    const getJSON = function (requestParameters, callback) {
        return makeRequest(extend$1(requestParameters, { type: 'json' }), callback);
    };
    const getArrayBuffer = function (requestParameters, callback) {
        return makeRequest(extend$1(requestParameters, { type: 'arrayBuffer' }), callback);
    };

    const registry = {};
    /**
     * Register the given class as serializable.
     *
     * @param options
     * @param options.omit List of properties to omit from serialization (e.g., cached/computed properties)
     * @param options.shallow List of properties that should be serialized by a simple shallow copy, rather than by a recursive call to serialize().
     *
     * @private
     */
    function register(name, klass, options = {}) {
        if (registry[name])
            throw new Error(`${name} is already registered.`);
        Object.defineProperty(klass, '_classRegistryKey', {
            value: name,
            writeable: false
        });
        registry[name] = {
            klass,
            omit: options.omit || [],
            shallow: options.shallow || []
        };
    }
    register('Object', Object);
    register('TransferableGridIndex', TransferableGridIndex);
    register('Color', Color);
    register('Error', Error);
    register('AJAXError', AJAXError);
    register('ResolvedImage', ResolvedImage);
    register('StylePropertyFunction', StylePropertyFunction);
    register('StyleExpression', StyleExpression, { omit: ['_evaluator'] });
    register('ZoomDependentExpression', ZoomDependentExpression);
    register('ZoomConstantExpression', ZoomConstantExpression);
    register('CompoundExpression', CompoundExpression, { omit: ['_evaluate'] });
    for (const name in expressions) {
        if (expressions[name]._classRegistryKey)
            continue;
        register(`Expression_${name}`, expressions[name]);
    }
    function isArrayBuffer(value) {
        return value && typeof ArrayBuffer !== 'undefined' &&
            (value instanceof ArrayBuffer || (value.constructor && value.constructor.name === 'ArrayBuffer'));
    }
    /**
     * Serialize the given object for transfer to or from a web worker.
     *
     * For non-builtin types, recursively serialize each property (possibly
     * omitting certain properties - see register()), and package the result along
     * with the constructor's `name` so that the appropriate constructor can be
     * looked up in `deserialize()`.
     *
     * If a `transferables` array is provided, add any transferable objects (i.e.,
     * any ArrayBuffers or ArrayBuffer views) to the list. (If a copy is needed,
     * this should happen in the client code, before using serialize().)
     *
     * @private
     */
    function serialize(input, transferables) {
        if (input === null ||
            input === undefined ||
            typeof input === 'boolean' ||
            typeof input === 'number' ||
            typeof input === 'string' ||
            input instanceof Boolean ||
            input instanceof Number ||
            input instanceof String ||
            input instanceof Date ||
            input instanceof RegExp ||
            input instanceof Blob) {
            return input;
        }
        if (isArrayBuffer(input)) {
            if (transferables) {
                transferables.push(input);
            }
            return input;
        }
        if (isImageBitmap(input)) {
            if (transferables) {
                transferables.push(input);
            }
            return input;
        }
        if (ArrayBuffer.isView(input)) {
            const view = input;
            if (transferables) {
                transferables.push(view.buffer);
            }
            return view;
        }
        if (input instanceof ImageData) {
            if (transferables) {
                transferables.push(input.data.buffer);
            }
            return input;
        }
        if (Array.isArray(input)) {
            const serialized = [];
            for (const item of input) {
                serialized.push(serialize(item, transferables));
            }
            return serialized;
        }
        if (typeof input === 'object') {
            const klass = input.constructor;
            const name = klass._classRegistryKey;
            if (!name) {
                throw new Error('can\'t serialize object of unregistered class');
            }
            if (!registry[name])
                throw new Error(`${name} is not registered.`);
            const properties = klass.serialize ?
                // (Temporary workaround) allow a class to provide static
                // `serialize()` and `deserialize()` methods to bypass the generic
                // approach.
                // This temporary workaround lets us use the generic serialization
                // approach for objects whose members include instances of dynamic
                // StructArray types. Once we refactor StructArray to be static,
                // we can remove this complexity.
                klass.serialize(input, transferables) : {};
            if (!klass.serialize) {
                for (const key in input) {
                    // any cast due to https://github.com/facebook/flow/issues/5393
                    if (!input.hasOwnProperty(key))
                        continue; // eslint-disable-line no-prototype-builtins
                    if (registry[name].omit.indexOf(key) >= 0)
                        continue;
                    const property = input[key];
                    properties[key] = registry[name].shallow.indexOf(key) >= 0 ?
                        property :
                        serialize(property, transferables);
                }
                if (input instanceof Error) {
                    properties.message = input.message;
                }
            }
            else {
                if (transferables && properties === transferables[transferables.length - 1]) {
                    throw new Error('statically serialized object won\'t survive transfer of $name property');
                }
            }
            if (properties.$name) {
                throw new Error('$name property is reserved for worker serialization logic.');
            }
            if (name !== 'Object') {
                properties.$name = name;
            }
            return properties;
        }
        throw new Error(`can't serialize object of type ${typeof input}`);
    }
    function deserialize(input) {
        if (input === null ||
            input === undefined ||
            typeof input === 'boolean' ||
            typeof input === 'number' ||
            typeof input === 'string' ||
            input instanceof Boolean ||
            input instanceof Number ||
            input instanceof String ||
            input instanceof Date ||
            input instanceof RegExp ||
            input instanceof Blob ||
            isArrayBuffer(input) ||
            isImageBitmap(input) ||
            ArrayBuffer.isView(input) ||
            input instanceof ImageData) {
            return input;
        }
        if (Array.isArray(input)) {
            return input.map(deserialize);
        }
        if (typeof input === 'object') {
            const name = input.$name || 'Object';
            if (!registry[name]) {
                throw new Error(`can't deserialize unregistered class ${name}`);
            }
            const { klass } = registry[name];
            if (!klass) {
                throw new Error(`can't deserialize unregistered class ${name}`);
            }
            if (klass.deserialize) {
                return klass.deserialize(input);
            }
            const result = Object.create(klass.prototype);
            for (const key of Object.keys(input)) {
                if (key === '$name')
                    continue;
                const value = input[key];
                result[key] = registry[name].shallow.indexOf(key) >= 0 ? value : deserialize(value);
            }
            return result;
        }
        throw new Error(`can't deserialize object of type ${typeof input}`);
    }

    /**
     * Invokes the wrapped function in a non-blocking way when trigger() is called. Invocation requests
     * are ignored until the function was actually invoked.
     *
     * @private
     */
    class ThrottledInvoker {
        constructor(callback) {
            this._callback = callback;
            this._triggered = false;
            if (typeof MessageChannel !== 'undefined') {
                this._channel = new MessageChannel();
                this._channel.port2.onmessage = () => {
                    this._triggered = false;
                    this._callback();
                };
            }
        }
        trigger() {
            if (!this._triggered) {
                this._triggered = true;
                if (this._channel) {
                    this._channel.port1.postMessage(true);
                }
                else {
                    setTimeout(() => {
                        this._triggered = false;
                        this._callback();
                    }, 0);
                }
            }
        }
        remove() {
            delete this._channel;
            this._callback = () => { };
        }
    }

    /**
     * An implementation of the [Actor design pattern](http://en.wikipedia.org/wiki/Actor_model)
     * that maintains the relationship between asynchronous tasks and the objects
     * that spin them off - in this case, tasks like parsing parts of styles,
     * owned by the styles
     *
     * @param {WebWorker} target
     * @param {WebWorker} parent
     * @param {string|number} mapId A unique identifier for the Map instance using this Actor.
     * @private
     */
    class Actor {
        constructor(target, parent, mapId) {
            this.target = target;
            this.parent = parent;
            this.mapId = mapId;
            this.callbacks = {};
            this.tasks = {};
            this.taskQueue = [];
            this.cancelCallbacks = {};
            bindAll(['receive', 'process'], this);
            this.invoker = new ThrottledInvoker(this.process);
            this.target.addEventListener('message', this.receive, false);
            this.globalScope = isWorker() ? target : window;
        }
        /**
         * Sends a message from a main-thread map to a Worker or from a Worker back to
         * a main-thread map instance.
         *
         * @param type The name of the target method to invoke or '[source-type].[source-name].name' for a method on a WorkerSource.
         * @param targetMapId A particular mapId to which to send this message.
         * @private
         */
        send(type, data, callback, targetMapId, mustQueue = false) {
            // We're using a string ID instead of numbers because they are being used as object keys
            // anyway, and thus stringified implicitly. We use random IDs because an actor may receive
            // message from multiple other actors which could run in different execution context. A
            // linearly increasing ID could produce collisions.
            const id = Math.round((Math.random() * 1e18)).toString(36).substring(0, 10);
            if (callback) {
                this.callbacks[id] = callback;
            }
            const buffers = isSafari(this.globalScope) ? undefined : [];
            this.target.postMessage({
                id,
                type,
                hasCallback: !!callback,
                targetMapId,
                mustQueue,
                sourceMapId: this.mapId,
                data: serialize(data, buffers)
            }, buffers);
            return {
                cancel: () => {
                    if (callback) {
                        // Set the callback to null so that it never fires after the request is aborted.
                        delete this.callbacks[id];
                    }
                    this.target.postMessage({
                        id,
                        type: '<cancel>',
                        targetMapId,
                        sourceMapId: this.mapId
                    });
                }
            };
        }
        receive(message) {
            const data = message.data, id = data.id;
            if (!id) {
                return;
            }
            if (data.targetMapId && this.mapId !== data.targetMapId) {
                return;
            }
            if (data.type === '<cancel>') {
                // Remove the original request from the queue. This is only possible if it
                // hasn't been kicked off yet. The id will remain in the queue, but because
                // there is no associated task, it will be dropped once it's time to execute it.
                delete this.tasks[id];
                const cancel = this.cancelCallbacks[id];
                delete this.cancelCallbacks[id];
                if (cancel) {
                    cancel();
                }
            }
            else {
                if (isWorker() || data.mustQueue) {
                    // In workers, store the tasks that we need to process before actually processing them. This
                    // is necessary because we want to keep receiving messages, and in particular,
                    // <cancel> messages. Some tasks may take a while in the worker thread, so before
                    // executing the next task in our queue, postMessage preempts this and <cancel>
                    // messages can be processed. We're using a MessageChannel object to get throttle the
                    // process() flow to one at a time.
                    this.tasks[id] = data;
                    this.taskQueue.push(id);
                    this.invoker.trigger();
                }
                else {
                    // In the main thread, process messages immediately so that other work does not slip in
                    // between getting partial data back from workers.
                    this.processTask(id, data);
                }
            }
        }
        process() {
            if (!this.taskQueue.length) {
                return;
            }
            const id = this.taskQueue.shift();
            const task = this.tasks[id];
            delete this.tasks[id];
            // Schedule another process call if we know there's more to process _before_ invoking the
            // current task. This is necessary so that processing continues even if the current task
            // doesn't execute successfully.
            if (this.taskQueue.length) {
                this.invoker.trigger();
            }
            if (!task) {
                // If the task ID doesn't have associated task data anymore, it was canceled.
                return;
            }
            this.processTask(id, task);
        }
        processTask(id, task) {
            if (task.type === '<response>') {
                // The done() function in the counterpart has been called, and we are now
                // firing the callback in the originating actor, if there is one.
                const callback = this.callbacks[id];
                delete this.callbacks[id];
                if (callback) {
                    // If we get a response, but don't have a callback, the request was canceled.
                    if (task.error) {
                        callback(deserialize(task.error));
                    }
                    else {
                        callback(null, deserialize(task.data));
                    }
                }
            }
            else {
                let completed = false;
                const buffers = isSafari(this.globalScope) ? undefined : [];
                const done = task.hasCallback ? (err, data) => {
                    completed = true;
                    delete this.cancelCallbacks[id];
                    this.target.postMessage({
                        id,
                        type: '<response>',
                        sourceMapId: this.mapId,
                        error: err ? serialize(err) : null,
                        data: serialize(data, buffers)
                    }, buffers);
                } : (_) => {
                    completed = true;
                };
                let callback = null;
                const params = deserialize(task.data);
                if (this.parent[task.type]) {
                    // task.type == 'loadTile', 'removeTile', etc.
                    callback = this.parent[task.type](task.sourceMapId, params, done);
                }
                else if (this.parent.getWorkerSource) {
                    // task.type == sourcetype.method
                    const keys = task.type.split('.');
                    const scope = this.parent.getWorkerSource(task.sourceMapId, keys[0], params.source);
                    callback = scope[keys[1]](params, done);
                }
                else {
                    // No function was found.
                    done(new Error(`Could not find function ${task.type}`));
                }
                if (!completed && callback && callback.cancel) {
                    // Allows canceling the task as long as it hasn't been completed yet.
                    this.cancelCallbacks[id] = callback.cancel;
                }
            }
        }
        remove() {
            this.invoker.remove();
            this.target.removeEventListener('message', this.receive, false);
        }
    }

    var $version = 8;
    var $root = {
    	version: {
    		required: true,
    		type: "enum",
    		values: [
    			8
    		]
    	},
    	name: {
    		type: "string"
    	},
    	metadata: {
    		type: "*"
    	},
    	center: {
    		type: "array",
    		value: "number"
    	},
    	zoom: {
    		type: "number"
    	},
    	bearing: {
    		type: "number",
    		"default": 0,
    		period: 360,
    		units: "degrees"
    	},
    	pitch: {
    		type: "number",
    		"default": 0,
    		units: "degrees"
    	},
    	light: {
    		type: "light"
    	},
    	terrain: {
    		type: "terrain"
    	},
    	sources: {
    		required: true,
    		type: "sources"
    	},
    	sprite: {
    		type: "sprite"
    	},
    	glyphs: {
    		type: "string"
    	},
    	transition: {
    		type: "transition"
    	},
    	layers: {
    		required: true,
    		type: "array",
    		value: "layer"
    	}
    };
    var sources = {
    	"*": {
    		type: "source"
    	}
    };
    var source = [
    	"source_vector",
    	"source_raster",
    	"source_raster_dem",
    	"source_geojson",
    	"source_video",
    	"source_image"
    ];
    var source_vector = {
    	type: {
    		required: true,
    		type: "enum",
    		values: {
    			vector: {
    			}
    		}
    	},
    	url: {
    		type: "string"
    	},
    	tiles: {
    		type: "array",
    		value: "string"
    	},
    	bounds: {
    		type: "array",
    		value: "number",
    		length: 4,
    		"default": [
    			-180,
    			-85.051129,
    			180,
    			85.051129
    		]
    	},
    	scheme: {
    		type: "enum",
    		values: {
    			xyz: {
    			},
    			tms: {
    			}
    		},
    		"default": "xyz"
    	},
    	minzoom: {
    		type: "number",
    		"default": 0
    	},
    	maxzoom: {
    		type: "number",
    		"default": 22
    	},
    	attribution: {
    		type: "string"
    	},
    	promoteId: {
    		type: "promoteId"
    	},
    	volatile: {
    		type: "boolean",
    		"default": false
    	},
    	"*": {
    		type: "*"
    	}
    };
    var source_raster = {
    	type: {
    		required: true,
    		type: "enum",
    		values: {
    			raster: {
    			}
    		}
    	},
    	url: {
    		type: "string"
    	},
    	tiles: {
    		type: "array",
    		value: "string"
    	},
    	bounds: {
    		type: "array",
    		value: "number",
    		length: 4,
    		"default": [
    			-180,
    			-85.051129,
    			180,
    			85.051129
    		]
    	},
    	minzoom: {
    		type: "number",
    		"default": 0
    	},
    	maxzoom: {
    		type: "number",
    		"default": 22
    	},
    	tileSize: {
    		type: "number",
    		"default": 512,
    		units: "pixels"
    	},
    	scheme: {
    		type: "enum",
    		values: {
    			xyz: {
    			},
    			tms: {
    			}
    		},
    		"default": "xyz"
    	},
    	attribution: {
    		type: "string"
    	},
    	volatile: {
    		type: "boolean",
    		"default": false
    	},
    	"*": {
    		type: "*"
    	}
    };
    var source_raster_dem = {
    	type: {
    		required: true,
    		type: "enum",
    		values: {
    			"raster-dem": {
    			}
    		}
    	},
    	url: {
    		type: "string"
    	},
    	tiles: {
    		type: "array",
    		value: "string"
    	},
    	bounds: {
    		type: "array",
    		value: "number",
    		length: 4,
    		"default": [
    			-180,
    			-85.051129,
    			180,
    			85.051129
    		]
    	},
    	minzoom: {
    		type: "number",
    		"default": 0
    	},
    	maxzoom: {
    		type: "number",
    		"default": 22
    	},
    	tileSize: {
    		type: "number",
    		"default": 512,
    		units: "pixels"
    	},
    	attribution: {
    		type: "string"
    	},
    	encoding: {
    		type: "enum",
    		values: {
    			terrarium: {
    			},
    			mapbox: {
    			}
    		},
    		"default": "mapbox"
    	},
    	volatile: {
    		type: "boolean",
    		"default": false
    	},
    	"*": {
    		type: "*"
    	}
    };
    var source_geojson = {
    	type: {
    		required: true,
    		type: "enum",
    		values: {
    			geojson: {
    			}
    		}
    	},
    	data: {
    		required: true,
    		type: "*"
    	},
    	maxzoom: {
    		type: "number",
    		"default": 18
    	},
    	attribution: {
    		type: "string"
    	},
    	buffer: {
    		type: "number",
    		"default": 128,
    		maximum: 512,
    		minimum: 0
    	},
    	filter: {
    		type: "*"
    	},
    	tolerance: {
    		type: "number",
    		"default": 0.375
    	},
    	cluster: {
    		type: "boolean",
    		"default": false
    	},
    	clusterRadius: {
    		type: "number",
    		"default": 50,
    		minimum: 0
    	},
    	clusterMaxZoom: {
    		type: "number"
    	},
    	clusterMinPoints: {
    		type: "number"
    	},
    	clusterProperties: {
    		type: "*"
    	},
    	lineMetrics: {
    		type: "boolean",
    		"default": false
    	},
    	generateId: {
    		type: "boolean",
    		"default": false
    	},
    	promoteId: {
    		type: "promoteId"
    	}
    };
    var source_video = {
    	type: {
    		required: true,
    		type: "enum",
    		values: {
    			video: {
    			}
    		}
    	},
    	urls: {
    		required: true,
    		type: "array",
    		value: "string"
    	},
    	coordinates: {
    		required: true,
    		type: "array",
    		length: 4,
    		value: {
    			type: "array",
    			length: 2,
    			value: "number"
    		}
    	}
    };
    var source_image = {
    	type: {
    		required: true,
    		type: "enum",
    		values: {
    			image: {
    			}
    		}
    	},
    	url: {
    		required: true,
    		type: "string"
    	},
    	coordinates: {
    		required: true,
    		type: "array",
    		length: 4,
    		value: {
    			type: "array",
    			length: 2,
    			value: "number"
    		}
    	}
    };
    var layer = {
    	id: {
    		type: "string",
    		required: true
    	},
    	type: {
    		type: "enum",
    		values: {
    			fill: {
    			},
    			line: {
    			},
    			symbol: {
    			},
    			circle: {
    			},
    			heatmap: {
    			},
    			"fill-extrusion": {
    			},
    			raster: {
    			},
    			hillshade: {
    			},
    			background: {
    			}
    		},
    		required: true
    	},
    	metadata: {
    		type: "*"
    	},
    	source: {
    		type: "string"
    	},
    	"source-layer": {
    		type: "string"
    	},
    	minzoom: {
    		type: "number",
    		minimum: 0,
    		maximum: 24
    	},
    	maxzoom: {
    		type: "number",
    		minimum: 0,
    		maximum: 24
    	},
    	filter: {
    		type: "filter"
    	},
    	layout: {
    		type: "layout"
    	},
    	paint: {
    		type: "paint"
    	}
    };
    var layout$7 = [
    	"layout_fill",
    	"layout_line",
    	"layout_circle",
    	"layout_heatmap",
    	"layout_fill-extrusion",
    	"layout_symbol",
    	"layout_raster",
    	"layout_hillshade",
    	"layout_background"
    ];
    var layout_background = {
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var layout_fill = {
    	"fill-sort-key": {
    		type: "number",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var layout_circle = {
    	"circle-sort-key": {
    		type: "number",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var layout_heatmap = {
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var layout_line = {
    	"line-cap": {
    		type: "enum",
    		values: {
    			butt: {
    			},
    			round: {
    			},
    			square: {
    			}
    		},
    		"default": "butt",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"line-join": {
    		type: "enum",
    		values: {
    			bevel: {
    			},
    			round: {
    			},
    			miter: {
    			}
    		},
    		"default": "miter",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"line-miter-limit": {
    		type: "number",
    		"default": 2,
    		requires: [
    			{
    				"line-join": "miter"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"line-round-limit": {
    		type: "number",
    		"default": 1.05,
    		requires: [
    			{
    				"line-join": "round"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"line-sort-key": {
    		type: "number",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var layout_symbol = {
    	"symbol-placement": {
    		type: "enum",
    		values: {
    			point: {
    			},
    			line: {
    			},
    			"line-center": {
    			}
    		},
    		"default": "point",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"symbol-spacing": {
    		type: "number",
    		"default": 250,
    		minimum: 1,
    		units: "pixels",
    		requires: [
    			{
    				"symbol-placement": "line"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"symbol-avoid-edges": {
    		type: "boolean",
    		"default": false,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"symbol-sort-key": {
    		type: "number",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"symbol-z-order": {
    		type: "enum",
    		values: {
    			auto: {
    			},
    			"viewport-y": {
    			},
    			source: {
    			}
    		},
    		"default": "auto",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-allow-overlap": {
    		type: "boolean",
    		"default": false,
    		requires: [
    			"icon-image",
    			{
    				"!": "icon-overlap"
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-overlap": {
    		type: "enum",
    		values: {
    			never: {
    			},
    			always: {
    			},
    			cooperative: {
    			}
    		},
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-ignore-placement": {
    		type: "boolean",
    		"default": false,
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-optional": {
    		type: "boolean",
    		"default": false,
    		requires: [
    			"icon-image",
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-rotation-alignment": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			},
    			auto: {
    			}
    		},
    		"default": "auto",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-size": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		units: "factor of the original icon size",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-text-fit": {
    		type: "enum",
    		values: {
    			none: {
    			},
    			width: {
    			},
    			height: {
    			},
    			both: {
    			}
    		},
    		"default": "none",
    		requires: [
    			"icon-image",
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-text-fit-padding": {
    		type: "array",
    		value: "number",
    		length: 4,
    		"default": [
    			0,
    			0,
    			0,
    			0
    		],
    		units: "pixels",
    		requires: [
    			"icon-image",
    			"text-field",
    			{
    				"icon-text-fit": [
    					"both",
    					"width",
    					"height"
    				]
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-image": {
    		type: "resolvedImage",
    		tokens: true,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-rotate": {
    		type: "number",
    		"default": 0,
    		period: 360,
    		units: "degrees",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-padding": {
    		type: "padding",
    		"default": [
    			2
    		],
    		units: "pixels",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-keep-upright": {
    		type: "boolean",
    		"default": false,
    		requires: [
    			"icon-image",
    			{
    				"icon-rotation-alignment": "map"
    			},
    			{
    				"symbol-placement": [
    					"line",
    					"line-center"
    				]
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-offset": {
    		type: "array",
    		value: "number",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-anchor": {
    		type: "enum",
    		values: {
    			center: {
    			},
    			left: {
    			},
    			right: {
    			},
    			top: {
    			},
    			bottom: {
    			},
    			"top-left": {
    			},
    			"top-right": {
    			},
    			"bottom-left": {
    			},
    			"bottom-right": {
    			}
    		},
    		"default": "center",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-pitch-alignment": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			},
    			auto: {
    			}
    		},
    		"default": "auto",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-pitch-alignment": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			},
    			auto: {
    			}
    		},
    		"default": "auto",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-rotation-alignment": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			},
    			"viewport-glyph": {
    			},
    			auto: {
    			}
    		},
    		"default": "auto",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-field": {
    		type: "formatted",
    		"default": "",
    		tokens: true,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-font": {
    		type: "array",
    		value: "string",
    		"default": [
    			"Open Sans Regular",
    			"Arial Unicode MS Regular"
    		],
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-size": {
    		type: "number",
    		"default": 16,
    		minimum: 0,
    		units: "pixels",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-max-width": {
    		type: "number",
    		"default": 10,
    		minimum: 0,
    		units: "ems",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-line-height": {
    		type: "number",
    		"default": 1.2,
    		units: "ems",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-letter-spacing": {
    		type: "number",
    		"default": 0,
    		units: "ems",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-justify": {
    		type: "enum",
    		values: {
    			auto: {
    			},
    			left: {
    			},
    			center: {
    			},
    			right: {
    			}
    		},
    		"default": "center",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-radial-offset": {
    		type: "number",
    		units: "ems",
    		"default": 0,
    		requires: [
    			"text-field"
    		],
    		"property-type": "data-driven",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		}
    	},
    	"text-variable-anchor": {
    		type: "array",
    		value: "enum",
    		values: {
    			center: {
    			},
    			left: {
    			},
    			right: {
    			},
    			top: {
    			},
    			bottom: {
    			},
    			"top-left": {
    			},
    			"top-right": {
    			},
    			"bottom-left": {
    			},
    			"bottom-right": {
    			}
    		},
    		requires: [
    			"text-field",
    			{
    				"symbol-placement": [
    					"point"
    				]
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-anchor": {
    		type: "enum",
    		values: {
    			center: {
    			},
    			left: {
    			},
    			right: {
    			},
    			top: {
    			},
    			bottom: {
    			},
    			"top-left": {
    			},
    			"top-right": {
    			},
    			"bottom-left": {
    			},
    			"bottom-right": {
    			}
    		},
    		"default": "center",
    		requires: [
    			"text-field",
    			{
    				"!": "text-variable-anchor"
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-max-angle": {
    		type: "number",
    		"default": 45,
    		units: "degrees",
    		requires: [
    			"text-field",
    			{
    				"symbol-placement": [
    					"line",
    					"line-center"
    				]
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-writing-mode": {
    		type: "array",
    		value: "enum",
    		values: {
    			horizontal: {
    			},
    			vertical: {
    			}
    		},
    		requires: [
    			"text-field",
    			{
    				"symbol-placement": [
    					"point"
    				]
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-rotate": {
    		type: "number",
    		"default": 0,
    		period: 360,
    		units: "degrees",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-padding": {
    		type: "number",
    		"default": 2,
    		minimum: 0,
    		units: "pixels",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-keep-upright": {
    		type: "boolean",
    		"default": true,
    		requires: [
    			"text-field",
    			{
    				"text-rotation-alignment": "map"
    			},
    			{
    				"symbol-placement": [
    					"line",
    					"line-center"
    				]
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-transform": {
    		type: "enum",
    		values: {
    			none: {
    			},
    			uppercase: {
    			},
    			lowercase: {
    			}
    		},
    		"default": "none",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-offset": {
    		type: "array",
    		value: "number",
    		units: "ems",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		requires: [
    			"text-field",
    			{
    				"!": "text-radial-offset"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-allow-overlap": {
    		type: "boolean",
    		"default": false,
    		requires: [
    			"text-field",
    			{
    				"!": "text-overlap"
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-overlap": {
    		type: "enum",
    		values: {
    			never: {
    			},
    			always: {
    			},
    			cooperative: {
    			}
    		},
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-ignore-placement": {
    		type: "boolean",
    		"default": false,
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-optional": {
    		type: "boolean",
    		"default": false,
    		requires: [
    			"text-field",
    			"icon-image"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var layout_raster = {
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var layout_hillshade = {
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    };
    var filter = {
    	type: "array",
    	value: "*"
    };
    var filter_operator = {
    	type: "enum",
    	values: {
    		"==": {
    		},
    		"!=": {
    		},
    		">": {
    		},
    		">=": {
    		},
    		"<": {
    		},
    		"<=": {
    		},
    		"in": {
    		},
    		"!in": {
    		},
    		all: {
    		},
    		any: {
    		},
    		none: {
    		},
    		has: {
    		},
    		"!has": {
    		},
    		within: {
    		}
    	}
    };
    var geometry_type = {
    	type: "enum",
    	values: {
    		Point: {
    		},
    		LineString: {
    		},
    		Polygon: {
    		}
    	}
    };
    var function_stop = {
    	type: "array",
    	minimum: 0,
    	maximum: 24,
    	value: [
    		"number",
    		"color"
    	],
    	length: 2
    };
    var expression = {
    	type: "array",
    	value: "*",
    	minimum: 1
    };
    var light = {
    	anchor: {
    		type: "enum",
    		"default": "viewport",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"property-type": "data-constant",
    		transition: false,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		}
    	},
    	position: {
    		type: "array",
    		"default": [
    			1.15,
    			210,
    			30
    		],
    		length: 3,
    		value: "number",
    		"property-type": "data-constant",
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		}
    	},
    	color: {
    		type: "color",
    		"property-type": "data-constant",
    		"default": "#ffffff",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		transition: true
    	},
    	intensity: {
    		type: "number",
    		"property-type": "data-constant",
    		"default": 0.5,
    		minimum: 0,
    		maximum: 1,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		transition: true
    	}
    };
    var terrain = {
    	source: {
    		type: "string",
    		required: true
    	},
    	exaggeration: {
    		type: "number",
    		minimum: 0,
    		"default": 1
    	}
    };
    var paint$9 = [
    	"paint_fill",
    	"paint_line",
    	"paint_circle",
    	"paint_heatmap",
    	"paint_fill-extrusion",
    	"paint_symbol",
    	"paint_raster",
    	"paint_hillshade",
    	"paint_background"
    ];
    var paint_fill = {
    	"fill-antialias": {
    		type: "boolean",
    		"default": true,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"fill-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"fill-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		requires: [
    			{
    				"!": "fill-pattern"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"fill-outline-color": {
    		type: "color",
    		transition: true,
    		requires: [
    			{
    				"!": "fill-pattern"
    			},
    			{
    				"fill-antialias": true
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"fill-translate": {
    		type: "array",
    		value: "number",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"fill-translate-anchor": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "map",
    		requires: [
    			"fill-translate"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"fill-pattern": {
    		type: "resolvedImage",
    		transition: true,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "cross-faded-data-driven"
    	}
    };
    var paint_line = {
    	"line-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"line-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		requires: [
    			{
    				"!": "line-pattern"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"line-translate": {
    		type: "array",
    		value: "number",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"line-translate-anchor": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "map",
    		requires: [
    			"line-translate"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"line-width": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"line-gap-width": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"line-offset": {
    		type: "number",
    		"default": 0,
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"line-blur": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"line-dasharray": {
    		type: "array",
    		value: "number",
    		minimum: 0,
    		transition: true,
    		units: "line widths",
    		requires: [
    			{
    				"!": "line-pattern"
    			}
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "cross-faded"
    	},
    	"line-pattern": {
    		type: "resolvedImage",
    		transition: true,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "cross-faded-data-driven"
    	},
    	"line-gradient": {
    		type: "color",
    		transition: false,
    		requires: [
    			{
    				"!": "line-dasharray"
    			},
    			{
    				"!": "line-pattern"
    			},
    			{
    				source: "geojson",
    				has: {
    					lineMetrics: true
    				}
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"line-progress"
    			]
    		},
    		"property-type": "color-ramp"
    	}
    };
    var paint_circle = {
    	"circle-radius": {
    		type: "number",
    		"default": 5,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"circle-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"circle-blur": {
    		type: "number",
    		"default": 0,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"circle-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"circle-translate": {
    		type: "array",
    		value: "number",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"circle-translate-anchor": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "map",
    		requires: [
    			"circle-translate"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"circle-pitch-scale": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "map",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"circle-pitch-alignment": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "viewport",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"circle-stroke-width": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"circle-stroke-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"circle-stroke-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	}
    };
    var paint_heatmap = {
    	"heatmap-radius": {
    		type: "number",
    		"default": 30,
    		minimum: 1,
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"heatmap-weight": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		transition: false,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"heatmap-intensity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"heatmap-color": {
    		type: "color",
    		"default": [
    			"interpolate",
    			[
    				"linear"
    			],
    			[
    				"heatmap-density"
    			],
    			0,
    			"rgba(0, 0, 255, 0)",
    			0.1,
    			"royalblue",
    			0.3,
    			"cyan",
    			0.5,
    			"lime",
    			0.7,
    			"yellow",
    			1,
    			"red"
    		],
    		transition: false,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"heatmap-density"
    			]
    		},
    		"property-type": "color-ramp"
    	},
    	"heatmap-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	}
    };
    var paint_symbol = {
    	"icon-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-halo-color": {
    		type: "color",
    		"default": "rgba(0, 0, 0, 0)",
    		transition: true,
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-halo-width": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-halo-blur": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"icon-translate": {
    		type: "array",
    		value: "number",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		transition: true,
    		units: "pixels",
    		requires: [
    			"icon-image"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"icon-translate-anchor": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "map",
    		requires: [
    			"icon-image",
    			"icon-translate"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		overridable: true,
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-halo-color": {
    		type: "color",
    		"default": "rgba(0, 0, 0, 0)",
    		transition: true,
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-halo-width": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-halo-blur": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		transition: true,
    		units: "pixels",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"text-translate": {
    		type: "array",
    		value: "number",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		transition: true,
    		units: "pixels",
    		requires: [
    			"text-field"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"text-translate-anchor": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "map",
    		requires: [
    			"text-field",
    			"text-translate"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	}
    };
    var paint_raster = {
    	"raster-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"raster-hue-rotate": {
    		type: "number",
    		"default": 0,
    		period: 360,
    		transition: true,
    		units: "degrees",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"raster-brightness-min": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"raster-brightness-max": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"raster-saturation": {
    		type: "number",
    		"default": 0,
    		minimum: -1,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"raster-contrast": {
    		type: "number",
    		"default": 0,
    		minimum: -1,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"raster-resampling": {
    		type: "enum",
    		values: {
    			linear: {
    			},
    			nearest: {
    			}
    		},
    		"default": "linear",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"raster-fade-duration": {
    		type: "number",
    		"default": 300,
    		minimum: 0,
    		transition: false,
    		units: "milliseconds",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	}
    };
    var paint_hillshade = {
    	"hillshade-illumination-direction": {
    		type: "number",
    		"default": 335,
    		minimum: 0,
    		maximum: 359,
    		transition: false,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"hillshade-illumination-anchor": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "viewport",
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"hillshade-exaggeration": {
    		type: "number",
    		"default": 0.5,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"hillshade-shadow-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"hillshade-highlight-color": {
    		type: "color",
    		"default": "#FFFFFF",
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"hillshade-accent-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	}
    };
    var paint_background = {
    	"background-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		requires: [
    			{
    				"!": "background-pattern"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"background-pattern": {
    		type: "resolvedImage",
    		transition: true,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "cross-faded"
    	},
    	"background-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	}
    };
    var transition = {
    	duration: {
    		type: "number",
    		"default": 300,
    		minimum: 0,
    		units: "milliseconds"
    	},
    	delay: {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		units: "milliseconds"
    	}
    };
    var promoteId = {
    	"*": {
    		type: "string"
    	}
    };
    var spec = {
    	$version: $version,
    	$root: $root,
    	sources: sources,
    	source: source,
    	source_vector: source_vector,
    	source_raster: source_raster,
    	source_raster_dem: source_raster_dem,
    	source_geojson: source_geojson,
    	source_video: source_video,
    	source_image: source_image,
    	layer: layer,
    	layout: layout$7,
    	layout_background: layout_background,
    	layout_fill: layout_fill,
    	layout_circle: layout_circle,
    	layout_heatmap: layout_heatmap,
    	"layout_fill-extrusion": {
    	visibility: {
    		type: "enum",
    		values: {
    			visible: {
    			},
    			none: {
    			}
    		},
    		"default": "visible",
    		"property-type": "constant"
    	}
    },
    	layout_line: layout_line,
    	layout_symbol: layout_symbol,
    	layout_raster: layout_raster,
    	layout_hillshade: layout_hillshade,
    	filter: filter,
    	filter_operator: filter_operator,
    	geometry_type: geometry_type,
    	"function": {
    	expression: {
    		type: "expression"
    	},
    	stops: {
    		type: "array",
    		value: "function_stop"
    	},
    	base: {
    		type: "number",
    		"default": 1,
    		minimum: 0
    	},
    	property: {
    		type: "string",
    		"default": "$zoom"
    	},
    	type: {
    		type: "enum",
    		values: {
    			identity: {
    			},
    			exponential: {
    			},
    			interval: {
    			},
    			categorical: {
    			}
    		},
    		"default": "exponential"
    	},
    	colorSpace: {
    		type: "enum",
    		values: {
    			rgb: {
    			},
    			lab: {
    			},
    			hcl: {
    			}
    		},
    		"default": "rgb"
    	},
    	"default": {
    		type: "*",
    		required: false
    	}
    },
    	function_stop: function_stop,
    	expression: expression,
    	light: light,
    	terrain: terrain,
    	paint: paint$9,
    	paint_fill: paint_fill,
    	"paint_fill-extrusion": {
    	"fill-extrusion-opacity": {
    		type: "number",
    		"default": 1,
    		minimum: 0,
    		maximum: 1,
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"fill-extrusion-color": {
    		type: "color",
    		"default": "#000000",
    		transition: true,
    		requires: [
    			{
    				"!": "fill-extrusion-pattern"
    			}
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"fill-extrusion-translate": {
    		type: "array",
    		value: "number",
    		length: 2,
    		"default": [
    			0,
    			0
    		],
    		transition: true,
    		units: "pixels",
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"fill-extrusion-translate-anchor": {
    		type: "enum",
    		values: {
    			map: {
    			},
    			viewport: {
    			}
    		},
    		"default": "map",
    		requires: [
    			"fill-extrusion-translate"
    		],
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	},
    	"fill-extrusion-pattern": {
    		type: "resolvedImage",
    		transition: true,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom",
    				"feature"
    			]
    		},
    		"property-type": "cross-faded-data-driven"
    	},
    	"fill-extrusion-height": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		units: "meters",
    		transition: true,
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"fill-extrusion-base": {
    		type: "number",
    		"default": 0,
    		minimum: 0,
    		units: "meters",
    		transition: true,
    		requires: [
    			"fill-extrusion-height"
    		],
    		expression: {
    			interpolated: true,
    			parameters: [
    				"zoom",
    				"feature",
    				"feature-state"
    			]
    		},
    		"property-type": "data-driven"
    	},
    	"fill-extrusion-vertical-gradient": {
    		type: "boolean",
    		"default": true,
    		transition: false,
    		expression: {
    			interpolated: false,
    			parameters: [
    				"zoom"
    			]
    		},
    		"property-type": "data-constant"
    	}
    },
    	paint_line: paint_line,
    	paint_circle: paint_circle,
    	paint_heatmap: paint_heatmap,
    	paint_symbol: paint_symbol,
    	paint_raster: paint_raster,
    	paint_hillshade: paint_hillshade,
    	paint_background: paint_background,
    	transition: transition,
    	"property-type": {
    	"data-driven": {
    		type: "property-type"
    	},
    	"cross-faded": {
    		type: "property-type"
    	},
    	"cross-faded-data-driven": {
    		type: "property-type"
    	},
    	"color-ramp": {
    		type: "property-type"
    	},
    	"data-constant": {
    		type: "property-type"
    	},
    	constant: {
    		type: "property-type"
    	}
    },
    	promoteId: promoteId
    };

    // Note: Do not inherit from Error. It breaks when transpiling to ES5.
    class ValidationError {
        constructor(key, value, message, identifier) {
            this.message = (key ? `${key}: ` : '') + message;
            if (identifier)
                this.identifier = identifier;
            if (value !== null && value !== undefined && value.__line__) {
                this.line = value.__line__;
            }
        }
    }

    function validateConstants(options) {
        const key = options.key;
        const constants = options.value;
        if (constants) {
            return [new ValidationError(key, constants, 'constants have been deprecated as of v8')];
        }
        else {
            return [];
        }
    }

    // Turn jsonlint-lines-primitives objects into primitive objects
    function unbundle(value) {
        if (value instanceof Number || value instanceof String || value instanceof Boolean) {
            return value.valueOf();
        }
        else {
            return value;
        }
    }
    function deepUnbundle(value) {
        if (Array.isArray(value)) {
            return value.map(deepUnbundle);
        }
        else if (value instanceof Object && !(value instanceof Number || value instanceof String || value instanceof Boolean)) {
            const unbundledValue = {};
            for (const key in value) {
                unbundledValue[key] = deepUnbundle(value[key]);
            }
            return unbundledValue;
        }
        return unbundle(value);
    }

    function validateObject(options) {
        const key = options.key;
        const object = options.value;
        const elementSpecs = options.valueSpec || {};
        const elementValidators = options.objectElementValidators || {};
        const style = options.style;
        const styleSpec = options.styleSpec;
        const validateSpec = options.validateSpec;
        let errors = [];
        const type = getType(object);
        if (type !== 'object') {
            return [new ValidationError(key, object, `object expected, ${type} found`)];
        }
        for (const objectKey in object) {
            const elementSpecKey = objectKey.split('.')[0]; // treat 'paint.*' as 'paint'
            const elementSpec = elementSpecs[elementSpecKey] || elementSpecs['*'];
            let validateElement;
            if (elementValidators[elementSpecKey]) {
                validateElement = elementValidators[elementSpecKey];
            }
            else if (elementSpecs[elementSpecKey]) {
                validateElement = validateSpec;
            }
            else if (elementValidators['*']) {
                validateElement = elementValidators['*'];
            }
            else if (elementSpecs['*']) {
                validateElement = validateSpec;
            }
            else {
                errors.push(new ValidationError(key, object[objectKey], `unknown property "${objectKey}"`));
                continue;
            }
            errors = errors.concat(validateElement({
                key: (key ? `${key}.` : key) + objectKey,
                value: object[objectKey],
                valueSpec: elementSpec,
                style,
                styleSpec,
                object,
                objectKey,
                validateSpec,
            }, object));
        }
        for (const elementSpecKey in elementSpecs) {
            // Don't check `required` when there's a custom validator for that property.
            if (elementValidators[elementSpecKey]) {
                continue;
            }
            if (elementSpecs[elementSpecKey].required && elementSpecs[elementSpecKey]['default'] === undefined && object[elementSpecKey] === undefined) {
                errors.push(new ValidationError(key, object, `missing required property "${elementSpecKey}"`));
            }
        }
        return errors;
    }

    function validateArray(options) {
        const array = options.value;
        const arraySpec = options.valueSpec;
        const validateSpec = options.validateSpec;
        const style = options.style;
        const styleSpec = options.styleSpec;
        const key = options.key;
        const validateArrayElement = options.arrayElementValidator || validateSpec;
        if (getType(array) !== 'array') {
            return [new ValidationError(key, array, `array expected, ${getType(array)} found`)];
        }
        if (arraySpec.length && array.length !== arraySpec.length) {
            return [new ValidationError(key, array, `array length ${arraySpec.length} expected, length ${array.length} found`)];
        }
        if (arraySpec['min-length'] && array.length < arraySpec['min-length']) {
            return [new ValidationError(key, array, `array length at least ${arraySpec['min-length']} expected, length ${array.length} found`)];
        }
        let arrayElementSpec = {
            'type': arraySpec.value,
            'values': arraySpec.values
        };
        if (styleSpec.$version < 7) {
            arrayElementSpec['function'] = arraySpec.function;
        }
        if (getType(arraySpec.value) === 'object') {
            arrayElementSpec = arraySpec.value;
        }
        let errors = [];
        for (let i = 0; i < array.length; i++) {
            errors = errors.concat(validateArrayElement({
                array,
                arrayIndex: i,
                value: array[i],
                valueSpec: arrayElementSpec,
                validateSpec: options.validateSpec,
                style,
                styleSpec,
                key: `${key}[${i}]`
            }));
        }
        return errors;
    }

    function validateNumber(options) {
        const key = options.key;
        const value = options.value;
        const valueSpec = options.valueSpec;
        let type = getType(value);
        // eslint-disable-next-line no-self-compare
        if (type === 'number' && value !== value) {
            type = 'NaN';
        }
        if (type !== 'number') {
            return [new ValidationError(key, value, `number expected, ${type} found`)];
        }
        if ('minimum' in valueSpec && value < valueSpec.minimum) {
            return [new ValidationError(key, value, `${value} is less than the minimum value ${valueSpec.minimum}`)];
        }
        if ('maximum' in valueSpec && value > valueSpec.maximum) {
            return [new ValidationError(key, value, `${value} is greater than the maximum value ${valueSpec.maximum}`)];
        }
        return [];
    }

    function validateFunction(options) {
        const functionValueSpec = options.valueSpec;
        const functionType = unbundle(options.value.type);
        let stopKeyType;
        let stopDomainValues = {};
        let previousStopDomainValue;
        let previousStopDomainZoom;
        const isZoomFunction = functionType !== 'categorical' && options.value.property === undefined;
        const isPropertyFunction = !isZoomFunction;
        const isZoomAndPropertyFunction = getType(options.value.stops) === 'array' &&
            getType(options.value.stops[0]) === 'array' &&
            getType(options.value.stops[0][0]) === 'object';
        const errors = validateObject({
            key: options.key,
            value: options.value,
            valueSpec: options.styleSpec.function,
            validateSpec: options.validateSpec,
            style: options.style,
            styleSpec: options.styleSpec,
            objectElementValidators: {
                stops: validateFunctionStops,
                default: validateFunctionDefault
            }
        });
        if (functionType === 'identity' && isZoomFunction) {
            errors.push(new ValidationError(options.key, options.value, 'missing required property "property"'));
        }
        if (functionType !== 'identity' && !options.value.stops) {
            errors.push(new ValidationError(options.key, options.value, 'missing required property "stops"'));
        }
        if (functionType === 'exponential' && options.valueSpec.expression && !supportsInterpolation(options.valueSpec)) {
            errors.push(new ValidationError(options.key, options.value, 'exponential functions not supported'));
        }
        if (options.styleSpec.$version >= 8) {
            if (isPropertyFunction && !supportsPropertyExpression(options.valueSpec)) {
                errors.push(new ValidationError(options.key, options.value, 'property functions not supported'));
            }
            else if (isZoomFunction && !supportsZoomExpression(options.valueSpec)) {
                errors.push(new ValidationError(options.key, options.value, 'zoom functions not supported'));
            }
        }
        if ((functionType === 'categorical' || isZoomAndPropertyFunction) && options.value.property === undefined) {
            errors.push(new ValidationError(options.key, options.value, '"property" property is required'));
        }
        return errors;
        function validateFunctionStops(options) {
            if (functionType === 'identity') {
                return [new ValidationError(options.key, options.value, 'identity function may not have a "stops" property')];
            }
            let errors = [];
            const value = options.value;
            errors = errors.concat(validateArray({
                key: options.key,
                value,
                valueSpec: options.valueSpec,
                validateSpec: options.validateSpec,
                style: options.style,
                styleSpec: options.styleSpec,
                arrayElementValidator: validateFunctionStop
            }));
            if (getType(value) === 'array' && value.length === 0) {
                errors.push(new ValidationError(options.key, value, 'array must have at least one stop'));
            }
            return errors;
        }
        function validateFunctionStop(options) {
            let errors = [];
            const value = options.value;
            const key = options.key;
            if (getType(value) !== 'array') {
                return [new ValidationError(key, value, `array expected, ${getType(value)} found`)];
            }
            if (value.length !== 2) {
                return [new ValidationError(key, value, `array length 2 expected, length ${value.length} found`)];
            }
            if (isZoomAndPropertyFunction) {
                if (getType(value[0]) !== 'object') {
                    return [new ValidationError(key, value, `object expected, ${getType(value[0])} found`)];
                }
                if (value[0].zoom === undefined) {
                    return [new ValidationError(key, value, 'object stop key must have zoom')];
                }
                if (value[0].value === undefined) {
                    return [new ValidationError(key, value, 'object stop key must have value')];
                }
                if (previousStopDomainZoom && previousStopDomainZoom > unbundle(value[0].zoom)) {
                    return [new ValidationError(key, value[0].zoom, 'stop zoom values must appear in ascending order')];
                }
                if (unbundle(value[0].zoom) !== previousStopDomainZoom) {
                    previousStopDomainZoom = unbundle(value[0].zoom);
                    previousStopDomainValue = undefined;
                    stopDomainValues = {};
                }
                errors = errors.concat(validateObject({
                    key: `${key}[0]`,
                    value: value[0],
                    valueSpec: { zoom: {} },
                    validateSpec: options.validateSpec,
                    style: options.style,
                    styleSpec: options.styleSpec,
                    objectElementValidators: { zoom: validateNumber, value: validateStopDomainValue }
                }));
            }
            else {
                errors = errors.concat(validateStopDomainValue({
                    key: `${key}[0]`,
                    value: value[0],
                    valueSpec: {},
                    validateSpec: options.validateSpec,
                    style: options.style,
                    styleSpec: options.styleSpec
                }, value));
            }
            if (isExpression(deepUnbundle(value[1]))) {
                return errors.concat([new ValidationError(`${key}[1]`, value[1], 'expressions are not allowed in function stops.')]);
            }
            return errors.concat(options.validateSpec({
                key: `${key}[1]`,
                value: value[1],
                valueSpec: functionValueSpec,
                validateSpec: options.validateSpec,
                style: options.style,
                styleSpec: options.styleSpec
            }));
        }
        function validateStopDomainValue(options, stop) {
            const type = getType(options.value);
            const value = unbundle(options.value);
            const reportValue = options.value !== null ? options.value : stop;
            if (!stopKeyType) {
                stopKeyType = type;
            }
            else if (type !== stopKeyType) {
                return [new ValidationError(options.key, reportValue, `${type} stop domain type must match previous stop domain type ${stopKeyType}`)];
            }
            if (type !== 'number' && type !== 'string' && type !== 'boolean') {
                return [new ValidationError(options.key, reportValue, 'stop domain value must be a number, string, or boolean')];
            }
            if (type !== 'number' && functionType !== 'categorical') {
                let message = `number expected, ${type} found`;
                if (supportsPropertyExpression(functionValueSpec) && functionType === undefined) {
                    message += '\nIf you intended to use a categorical function, specify `"type": "categorical"`.';
                }
                return [new ValidationError(options.key, reportValue, message)];
            }
            if (functionType === 'categorical' && type === 'number' && (!isFinite(value) || Math.floor(value) !== value)) {
                return [new ValidationError(options.key, reportValue, `integer expected, found ${value}`)];
            }
            if (functionType !== 'categorical' && type === 'number' && previousStopDomainValue !== undefined && value < previousStopDomainValue) {
                return [new ValidationError(options.key, reportValue, 'stop domain values must appear in ascending order')];
            }
            else {
                previousStopDomainValue = value;
            }
            if (functionType === 'categorical' && value in stopDomainValues) {
                return [new ValidationError(options.key, reportValue, 'stop domain values must be unique')];
            }
            else {
                stopDomainValues[value] = true;
            }
            return [];
        }
        function validateFunctionDefault(options) {
            return options.validateSpec({
                key: options.key,
                value: options.value,
                valueSpec: functionValueSpec,
                validateSpec: options.validateSpec,
                style: options.style,
                styleSpec: options.styleSpec
            });
        }
    }

    function validateExpression(options) {
        const expression = (options.expressionContext === 'property' ? createPropertyExpression : createExpression)(deepUnbundle(options.value), options.valueSpec);
        if (expression.result === 'error') {
            return expression.value.map((error) => {
                return new ValidationError(`${options.key}${error.key}`, options.value, error.message);
            });
        }
        const expressionObj = expression.value.expression || expression.value._styleExpression.expression;
        if (options.expressionContext === 'property' && (options.propertyKey === 'text-font') &&
            !expressionObj.outputDefined()) {
            return [new ValidationError(options.key, options.value, `Invalid data expression for "${options.propertyKey}". Output values must be contained as literals within the expression.`)];
        }
        if (options.expressionContext === 'property' && options.propertyType === 'layout' &&
            (!isStateConstant(expressionObj))) {
            return [new ValidationError(options.key, options.value, '"feature-state" data expressions are not supported with layout properties.')];
        }
        if (options.expressionContext === 'filter' && !isStateConstant(expressionObj)) {
            return [new ValidationError(options.key, options.value, '"feature-state" data expressions are not supported with filters.')];
        }
        if (options.expressionContext && options.expressionContext.indexOf('cluster') === 0) {
            if (!isGlobalPropertyConstant(expressionObj, ['zoom', 'feature-state'])) {
                return [new ValidationError(options.key, options.value, '"zoom" and "feature-state" expressions are not supported with cluster properties.')];
            }
            if (options.expressionContext === 'cluster-initial' && !isFeatureConstant(expressionObj)) {
                return [new ValidationError(options.key, options.value, 'Feature data expressions are not supported with initial expression part of cluster properties.')];
            }
        }
        return [];
    }

    function validateBoolean(options) {
        const value = options.value;
        const key = options.key;
        const type = getType(value);
        if (type !== 'boolean') {
            return [new ValidationError(key, value, `boolean expected, ${type} found`)];
        }
        return [];
    }

    function validateColor(options) {
        const key = options.key;
        const value = options.value;
        const type = getType(value);
        if (type !== 'string') {
            return [new ValidationError(key, value, `color expected, ${type} found`)];
        }
        if (parseCSSColor_1(value) === null) {
            return [new ValidationError(key, value, `color expected, "${value}" found`)];
        }
        return [];
    }

    function validateEnum(options) {
        const key = options.key;
        const value = options.value;
        const valueSpec = options.valueSpec;
        const errors = [];
        if (Array.isArray(valueSpec.values)) { // <=v7
            if (valueSpec.values.indexOf(unbundle(value)) === -1) {
                errors.push(new ValidationError(key, value, `expected one of [${valueSpec.values.join(', ')}], ${JSON.stringify(value)} found`));
            }
        }
        else { // >=v8
            if (Object.keys(valueSpec.values).indexOf(unbundle(value)) === -1) {
                errors.push(new ValidationError(key, value, `expected one of [${Object.keys(valueSpec.values).join(', ')}], ${JSON.stringify(value)} found`));
            }
        }
        return errors;
    }

    function isExpressionFilter(filter) {
        if (filter === true || filter === false) {
            return true;
        }
        if (!Array.isArray(filter) || filter.length === 0) {
            return false;
        }
        switch (filter[0]) {
            case 'has':
                return filter.length >= 2 && filter[1] !== '$id' && filter[1] !== '$type';
            case 'in':
                return filter.length >= 3 && (typeof filter[1] !== 'string' || Array.isArray(filter[2]));
            case '!in':
            case '!has':
            case 'none':
                return false;
            case '==':
            case '!=':
            case '>':
            case '>=':
            case '<':
            case '<=':
                return filter.length !== 3 || (Array.isArray(filter[1]) || Array.isArray(filter[2]));
            case 'any':
            case 'all':
                for (const f of filter.slice(1)) {
                    if (!isExpressionFilter(f) && typeof f !== 'boolean') {
                        return false;
                    }
                }
                return true;
            default:
                return true;
        }
    }
    const filterSpec = {
        'type': 'boolean',
        'default': false,
        'transition': false,
        'property-type': 'data-driven',
        'expression': {
            'interpolated': false,
            'parameters': ['zoom', 'feature']
        }
    };
    /**
     * Given a filter expressed as nested arrays, return a new function
     * that evaluates whether a given feature (with a .properties or .tags property)
     * passes its test.
     *
     * @private
     * @param {Array} filter maplibre gl filter
     * @returns {Function} filter-evaluating function
     */
    function createFilter(filter) {
        if (filter === null || filter === undefined) {
            return { filter: () => true, needGeometry: false };
        }
        if (!isExpressionFilter(filter)) {
            filter = convertFilter(filter);
        }
        const compiled = createExpression(filter, filterSpec);
        if (compiled.result === 'error') {
            throw new Error(compiled.value.map(err => `${err.key}: ${err.message}`).join(', '));
        }
        else {
            const needGeometry = geometryNeeded(filter);
            return { filter: (globalProperties, feature, canonical) => compiled.value.evaluate(globalProperties, feature, {}, canonical),
                needGeometry };
        }
    }
    // Comparison function to sort numbers and strings
    function compare(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    function geometryNeeded(filter) {
        if (!Array.isArray(filter))
            return false;
        if (filter[0] === 'within')
            return true;
        for (let index = 1; index < filter.length; index++) {
            if (geometryNeeded(filter[index]))
                return true;
        }
        return false;
    }
    function convertFilter(filter) {
        if (!filter)
            return true;
        const op = filter[0];
        if (filter.length <= 1)
            return (op !== 'any');
        const converted = op === '==' ? convertComparisonOp(filter[1], filter[2], '==') :
            op === '!=' ? convertNegation(convertComparisonOp(filter[1], filter[2], '==')) :
                op === '<' ||
                    op === '>' ||
                    op === '<=' ||
                    op === '>=' ? convertComparisonOp(filter[1], filter[2], op) :
                    op === 'any' ? convertDisjunctionOp(filter.slice(1)) :
                        op === 'all' ? ['all'].concat(filter.slice(1).map(convertFilter)) :
                            op === 'none' ? ['all'].concat(filter.slice(1).map(convertFilter).map(convertNegation)) :
                                op === 'in' ? convertInOp(filter[1], filter.slice(2)) :
                                    op === '!in' ? convertNegation(convertInOp(filter[1], filter.slice(2))) :
                                        op === 'has' ? convertHasOp(filter[1]) :
                                            op === '!has' ? convertNegation(convertHasOp(filter[1])) :
                                                op === 'within' ? filter :
                                                    true;
        return converted;
    }
    function convertComparisonOp(property, value, op) {
        switch (property) {
            case '$type':
                return [`filter-type-${op}`, value];
            case '$id':
                return [`filter-id-${op}`, value];
            default:
                return [`filter-${op}`, property, value];
        }
    }
    function convertDisjunctionOp(filters) {
        return ['any'].concat(filters.map(convertFilter));
    }
    function convertInOp(property, values) {
        if (values.length === 0) {
            return false;
        }
        switch (property) {
            case '$type':
                return ['filter-type-in', ['literal', values]];
            case '$id':
                return ['filter-id-in', ['literal', values]];
            default:
                if (values.length > 200 && !values.some(v => typeof v !== typeof values[0])) {
                    return ['filter-in-large', property, ['literal', values.sort(compare)]];
                }
                else {
                    return ['filter-in-small', property, ['literal', values]];
                }
        }
    }
    function convertHasOp(property) {
        switch (property) {
            case '$type':
                return true;
            case '$id':
                return ['filter-has-id'];
            default:
                return ['filter-has', property];
        }
    }
    function convertNegation(filter) {
        return ['!', filter];
    }

    function validateFilter(options) {
        if (isExpressionFilter(deepUnbundle(options.value))) {
            return validateExpression(extendBy({}, options, {
                expressionContext: 'filter',
                valueSpec: { value: 'boolean' }
            }));
        }
        else {
            return validateNonExpressionFilter(options);
        }
    }
    function validateNonExpressionFilter(options) {
        const value = options.value;
        const key = options.key;
        if (getType(value) !== 'array') {
            return [new ValidationError(key, value, `array expected, ${getType(value)} found`)];
        }
        const styleSpec = options.styleSpec;
        let type;
        let errors = [];
        if (value.length < 1) {
            return [new ValidationError(key, value, 'filter array must have at least 1 element')];
        }
        errors = errors.concat(validateEnum({
            key: `${key}[0]`,
            value: value[0],
            valueSpec: styleSpec.filter_operator,
            style: options.style,
            styleSpec: options.styleSpec
        }));
        switch (unbundle(value[0])) {
            case '<':
            case '<=':
            case '>':
            case '>=':
                if (value.length >= 2 && unbundle(value[1]) === '$type') {
                    errors.push(new ValidationError(key, value, `"$type" cannot be use with operator "${value[0]}"`));
                }
            /* falls through */
            case '==':
            case '!=':
                if (value.length !== 3) {
                    errors.push(new ValidationError(key, value, `filter array for operator "${value[0]}" must have 3 elements`));
                }
            /* falls through */
            case 'in':
            case '!in':
                if (value.length >= 2) {
                    type = getType(value[1]);
                    if (type !== 'string') {
                        errors.push(new ValidationError(`${key}[1]`, value[1], `string expected, ${type} found`));
                    }
                }
                for (let i = 2; i < value.length; i++) {
                    type = getType(value[i]);
                    if (unbundle(value[1]) === '$type') {
                        errors = errors.concat(validateEnum({
                            key: `${key}[${i}]`,
                            value: value[i],
                            valueSpec: styleSpec.geometry_type,
                            style: options.style,
                            styleSpec: options.styleSpec
                        }));
                    }
                    else if (type !== 'string' && type !== 'number' && type !== 'boolean') {
                        errors.push(new ValidationError(`${key}[${i}]`, value[i], `string, number, or boolean expected, ${type} found`));
                    }
                }
                break;
            case 'any':
            case 'all':
            case 'none':
                for (let i = 1; i < value.length; i++) {
                    errors = errors.concat(validateNonExpressionFilter({
                        key: `${key}[${i}]`,
                        value: value[i],
                        style: options.style,
                        styleSpec: options.styleSpec
                    }));
                }
                break;
            case 'has':
            case '!has':
                type = getType(value[1]);
                if (value.length !== 2) {
                    errors.push(new ValidationError(key, value, `filter array for "${value[0]}" operator must have 2 elements`));
                }
                else if (type !== 'string') {
                    errors.push(new ValidationError(`${key}[1]`, value[1], `string expected, ${type} found`));
                }
                break;
            case 'within':
                type = getType(value[1]);
                if (value.length !== 2) {
                    errors.push(new ValidationError(key, value, `filter array for "${value[0]}" operator must have 2 elements`));
                }
                else if (type !== 'object') {
                    errors.push(new ValidationError(`${key}[1]`, value[1], `object expected, ${type} found`));
                }
                break;
        }
        return errors;
    }

    function validateProperty(options, propertyType) {
        const key = options.key;
        const validateSpec = options.validateSpec;
        const style = options.style;
        const styleSpec = options.styleSpec;
        const value = options.value;
        const propertyKey = options.objectKey;
        const layerSpec = styleSpec[`${propertyType}_${options.layerType}`];
        if (!layerSpec)
            return [];
        const transitionMatch = propertyKey.match(/^(.*)-transition$/);
        if (propertyType === 'paint' && transitionMatch && layerSpec[transitionMatch[1]] && layerSpec[transitionMatch[1]].transition) {
            return validateSpec({
                key,
                value,
                valueSpec: styleSpec.transition,
                style,
                styleSpec
            });
        }
        const valueSpec = options.valueSpec || layerSpec[propertyKey];
        if (!valueSpec) {
            return [new ValidationError(key, value, `unknown property "${propertyKey}"`)];
        }
        let tokenMatch;
        if (getType(value) === 'string' && supportsPropertyExpression(valueSpec) && !valueSpec.tokens && (tokenMatch = /^{([^}]+)}$/.exec(value))) {
            return [new ValidationError(key, value, `"${propertyKey}" does not support interpolation syntax\n` +
                    `Use an identity property function instead: \`{ "type": "identity", "property": ${JSON.stringify(tokenMatch[1])} }\`.`)];
        }
        const errors = [];
        if (options.layerType === 'symbol') {
            if (propertyKey === 'text-field' && style && !style.glyphs) {
                errors.push(new ValidationError(key, value, 'use of "text-field" requires a style "glyphs" property'));
            }
            if (propertyKey === 'text-font' && isFunction(deepUnbundle(value)) && unbundle(value.type) === 'identity') {
                errors.push(new ValidationError(key, value, '"text-font" does not support identity functions'));
            }
        }
        return errors.concat(validateSpec({
            key: options.key,
            value,
            valueSpec,
            style,
            styleSpec,
            expressionContext: 'property',
            propertyType,
            propertyKey
        }));
    }

    function validatePaintProperty$1(options) {
        return validateProperty(options, 'paint');
    }

    function validateLayoutProperty$1(options) {
        return validateProperty(options, 'layout');
    }

    function validateLayer(options) {
        let errors = [];
        const layer = options.value;
        const key = options.key;
        const style = options.style;
        const styleSpec = options.styleSpec;
        if (!layer.type && !layer.ref) {
            errors.push(new ValidationError(key, layer, 'either "type" or "ref" is required'));
        }
        let type = unbundle(layer.type);
        const ref = unbundle(layer.ref);
        if (layer.id) {
            const layerId = unbundle(layer.id);
            for (let i = 0; i < options.arrayIndex; i++) {
                const otherLayer = style.layers[i];
                if (unbundle(otherLayer.id) === layerId) {
                    errors.push(new ValidationError(key, layer.id, `duplicate layer id "${layer.id}", previously used at line ${otherLayer.id.__line__}`));
                }
            }
        }
        if ('ref' in layer) {
            ['type', 'source', 'source-layer', 'filter', 'layout'].forEach((p) => {
                if (p in layer) {
                    errors.push(new ValidationError(key, layer[p], `"${p}" is prohibited for ref layers`));
                }
            });
            let parent;
            style.layers.forEach((layer) => {
                if (unbundle(layer.id) === ref)
                    parent = layer;
            });
            if (!parent) {
                errors.push(new ValidationError(key, layer.ref, `ref layer "${ref}" not found`));
            }
            else if (parent.ref) {
                errors.push(new ValidationError(key, layer.ref, 'ref cannot reference another ref layer'));
            }
            else {
                type = unbundle(parent.type);
            }
        }
        else if (type !== 'background') {
            if (!layer.source) {
                errors.push(new ValidationError(key, layer, 'missing required property "source"'));
            }
            else {
                const source = style.sources && style.sources[layer.source];
                const sourceType = source && unbundle(source.type);
                if (!source) {
                    errors.push(new ValidationError(key, layer.source, `source "${layer.source}" not found`));
                }
                else if (sourceType === 'vector' && type === 'raster') {
                    errors.push(new ValidationError(key, layer.source, `layer "${layer.id}" requires a raster source`));
                }
                else if (sourceType === 'raster' && type !== 'raster') {
                    errors.push(new ValidationError(key, layer.source, `layer "${layer.id}" requires a vector source`));
                }
                else if (sourceType === 'vector' && !layer['source-layer']) {
                    errors.push(new ValidationError(key, layer, `layer "${layer.id}" must specify a "source-layer"`));
                }
                else if (sourceType === 'raster-dem' && type !== 'hillshade') {
                    errors.push(new ValidationError(key, layer.source, 'raster-dem source can only be used with layer type \'hillshade\'.'));
                }
                else if (type === 'line' && layer.paint && layer.paint['line-gradient'] &&
                    (sourceType !== 'geojson' || !source.lineMetrics)) {
                    errors.push(new ValidationError(key, layer, `layer "${layer.id}" specifies a line-gradient, which requires a GeoJSON source with \`lineMetrics\` enabled.`));
                }
            }
        }
        errors = errors.concat(validateObject({
            key,
            value: layer,
            valueSpec: styleSpec.layer,
            style: options.style,
            styleSpec: options.styleSpec,
            validateSpec: options.validateSpec,
            objectElementValidators: {
                '*'() {
                    return [];
                },
                // We don't want to enforce the spec's `"requires": true` for backward compatibility with refs;
                // the actual requirement is validated above. See https://github.com/mapbox/mapbox-gl-js/issues/5772.
                type() {
                    return options.validateSpec({
                        key: `${key}.type`,
                        value: layer.type,
                        valueSpec: styleSpec.layer.type,
                        style: options.style,
                        styleSpec: options.styleSpec,
                        validateSpec: options.validateSpec,
                        object: layer,
                        objectKey: 'type'
                    });
                },
                filter: validateFilter,
                layout(options) {
                    return validateObject({
                        layer,
                        key: options.key,
                        value: options.value,
                        style: options.style,
                        styleSpec: options.styleSpec,
                        validateSpec: options.validateSpec,
                        objectElementValidators: {
                            '*'(options) {
                                return validateLayoutProperty$1(extendBy({ layerType: type }, options));
                            }
                        }
                    });
                },
                paint(options) {
                    return validateObject({
                        layer,
                        key: options.key,
                        value: options.value,
                        style: options.style,
                        styleSpec: options.styleSpec,
                        validateSpec: options.validateSpec,
                        objectElementValidators: {
                            '*'(options) {
                                return validatePaintProperty$1(extendBy({ layerType: type }, options));
                            }
                        }
                    });
                }
            }
        }));
        return errors;
    }

    function validateString(options) {
        const value = options.value;
        const key = options.key;
        const type = getType(value);
        if (type !== 'string') {
            return [new ValidationError(key, value, `string expected, ${type} found`)];
        }
        return [];
    }

    const objectElementValidators = {
        promoteId: validatePromoteId
    };
    function validateSource(options) {
        const value = options.value;
        const key = options.key;
        const styleSpec = options.styleSpec;
        const style = options.style;
        const validateSpec = options.validateSpec;
        if (!value.type) {
            return [new ValidationError(key, value, '"type" is required')];
        }
        const type = unbundle(value.type);
        let errors;
        switch (type) {
            case 'vector':
            case 'raster':
            case 'raster-dem':
                errors = validateObject({
                    key,
                    value,
                    valueSpec: styleSpec[`source_${type.replace('-', '_')}`],
                    style: options.style,
                    styleSpec,
                    objectElementValidators,
                    validateSpec,
                });
                return errors;
            case 'geojson':
                errors = validateObject({
                    key,
                    value,
                    valueSpec: styleSpec.source_geojson,
                    style,
                    styleSpec,
                    validateSpec,
                    objectElementValidators
                });
                if (value.cluster) {
                    for (const prop in value.clusterProperties) {
                        const [operator, mapExpr] = value.clusterProperties[prop];
                        const reduceExpr = typeof operator === 'string' ? [operator, ['accumulated'], ['get', prop]] : operator;
                        errors.push(...validateExpression({
                            key: `${key}.${prop}.map`,
                            value: mapExpr,
                            validateSpec,
                            expressionContext: 'cluster-map'
                        }));
                        errors.push(...validateExpression({
                            key: `${key}.${prop}.reduce`,
                            value: reduceExpr,
                            validateSpec,
                            expressionContext: 'cluster-reduce'
                        }));
                    }
                }
                return errors;
            case 'video':
                return validateObject({
                    key,
                    value,
                    valueSpec: styleSpec.source_video,
                    style,
                    validateSpec,
                    styleSpec
                });
            case 'image':
                return validateObject({
                    key,
                    value,
                    valueSpec: styleSpec.source_image,
                    style,
                    validateSpec,
                    styleSpec
                });
            case 'canvas':
                return [new ValidationError(key, null, 'Please use runtime APIs to add canvas sources, rather than including them in stylesheets.', 'source.canvas')];
            default:
                return validateEnum({
                    key: `${key}.type`,
                    value: value.type,
                    valueSpec: { values: ['vector', 'raster', 'raster-dem', 'geojson', 'video', 'image'] },
                    style,
                    validateSpec,
                    styleSpec
                });
        }
    }
    function validatePromoteId({ key, value }) {
        if (getType(value) === 'string') {
            return validateString({ key, value });
        }
        else {
            const errors = [];
            for (const prop in value) {
                errors.push(...validateString({ key: `${key}.${prop}`, value: value[prop] }));
            }
            return errors;
        }
    }

    function validateLight(options) {
        const light = options.value;
        const styleSpec = options.styleSpec;
        const lightSpec = styleSpec.light;
        const style = options.style;
        let errors = [];
        const rootType = getType(light);
        if (light === undefined) {
            return errors;
        }
        else if (rootType !== 'object') {
            errors = errors.concat([new ValidationError('light', light, `object expected, ${rootType} found`)]);
            return errors;
        }
        for (const key in light) {
            const transitionMatch = key.match(/^(.*)-transition$/);
            if (transitionMatch && lightSpec[transitionMatch[1]] && lightSpec[transitionMatch[1]].transition) {
                errors = errors.concat(options.validateSpec({
                    key,
                    value: light[key],
                    valueSpec: styleSpec.transition,
                    validateSpec: options.validateSpec,
                    style,
                    styleSpec
                }));
            }
            else if (lightSpec[key]) {
                errors = errors.concat(options.validateSpec({
                    key,
                    value: light[key],
                    valueSpec: lightSpec[key],
                    validateSpec: options.validateSpec,
                    style,
                    styleSpec
                }));
            }
            else {
                errors = errors.concat([new ValidationError(key, light[key], `unknown property "${key}"`)]);
            }
        }
        return errors;
    }

    function validateTerrain(options) {
        const terrain = options.value;
        const styleSpec = options.styleSpec;
        const terrainSpec = styleSpec.terrain;
        const style = options.style;
        let errors = [];
        const rootType = getType(terrain);
        if (terrain === undefined) {
            return errors;
        }
        else if (rootType !== 'object') {
            errors = errors.concat([new ValidationError('terrain', terrain, `object expected, ${rootType} found`)]);
            return errors;
        }
        for (const key in terrain) {
            if (terrainSpec[key]) {
                errors = errors.concat(options.validateSpec({
                    key,
                    value: terrain[key],
                    valueSpec: terrainSpec[key],
                    validateSpec: options.validateSpec,
                    style,
                    styleSpec
                }));
            }
            else {
                errors = errors.concat([new ValidationError(key, terrain[key], `unknown property "${key}"`)]);
            }
        }
        return errors;
    }

    function validateFormatted(options) {
        if (validateString(options).length === 0) {
            return [];
        }
        return validateExpression(options);
    }

    function validateImage(options) {
        if (validateString(options).length === 0) {
            return [];
        }
        return validateExpression(options);
    }

    function validatePadding(options) {
        const key = options.key;
        const value = options.value;
        const type = getType(value);
        if (type === 'array') {
            if (value.length < 1 || value.length > 4) {
                return [new ValidationError(key, value, `padding requires 1 to 4 values; ${value.length} values found`)];
            }
            const arrayElementSpec = {
                type: 'number'
            };
            let errors = [];
            for (let i = 0; i < value.length; i++) {
                errors = errors.concat(options.validateSpec({
                    key: `${key}[${i}]`,
                    value: value[i],
                    validateSpec: options.validateSpec,
                    valueSpec: arrayElementSpec
                }));
            }
            return errors;
        }
        else {
            return validateNumber({
                key,
                value,
                valueSpec: {}
            });
        }
    }

    function validateSprite(options) {
        let errors = [];
        const sprite = options.value;
        const key = options.key;
        if (!Array.isArray(sprite)) {
            return validateString({
                key,
                value: sprite
            });
        }
        else {
            const allSpriteIds = [];
            const allSpriteURLs = [];
            for (const i in sprite) {
                if (sprite[i].id && allSpriteIds.includes(sprite[i].id))
                    errors.push(new ValidationError(key, sprite, `all the sprites' ids must be unique, but ${sprite[i].id} is duplicated`));
                allSpriteIds.push(sprite[i].id);
                if (sprite[i].url && allSpriteURLs.includes(sprite[i].url))
                    errors.push(new ValidationError(key, sprite, `all the sprites' URLs must be unique, but ${sprite[i].url} is duplicated`));
                allSpriteURLs.push(sprite[i].url);
                const pairSpec = {
                    id: {
                        type: 'string',
                        required: true,
                    },
                    url: {
                        type: 'string',
                        required: true,
                    }
                };
                errors = errors.concat(validateObject({
                    key: `${key}[${i}]`,
                    value: sprite[i],
                    valueSpec: pairSpec,
                    validateSpec: options.validateSpec,
                }));
            }
            return errors;
        }
    }

    const VALIDATORS = {
        '*'() {
            return [];
        },
        'array': validateArray,
        'boolean': validateBoolean,
        'number': validateNumber,
        'color': validateColor,
        'constants': validateConstants,
        'enum': validateEnum,
        'filter': validateFilter,
        'function': validateFunction,
        'layer': validateLayer,
        'object': validateObject,
        'source': validateSource,
        'light': validateLight,
        'terrain': validateTerrain,
        'string': validateString,
        'formatted': validateFormatted,
        'resolvedImage': validateImage,
        'padding': validatePadding,
        'sprite': validateSprite,
    };
    // Main recursive validation function. Tracks:
    //
    // - key: string representing location of validation in style tree. Used only
    //   for more informative error reporting.
    // - value: current value from style being evaluated. May be anything from a
    //   high level object that needs to be descended into deeper or a simple
    //   scalar value.
    // - valueSpec: current spec being evaluated. Tracks value.
    // - styleSpec: current full spec being evaluated.
    function validate(options) {
        const value = options.value;
        const valueSpec = options.valueSpec;
        const styleSpec = options.styleSpec;
        options.validateSpec = validate;
        if (valueSpec.expression && isFunction(unbundle(value))) {
            return validateFunction(options);
        }
        else if (valueSpec.expression && isExpression(deepUnbundle(value))) {
            return validateExpression(options);
        }
        else if (valueSpec.type && VALIDATORS[valueSpec.type]) {
            return VALIDATORS[valueSpec.type](options);
        }
        else {
            const valid = validateObject(extendBy({}, options, {
                valueSpec: valueSpec.type ? styleSpec[valueSpec.type] : valueSpec
            }));
            return valid;
        }
    }

    function validateGlyphsUrl(options) {
        const value = options.value;
        const key = options.key;
        const errors = validateString(options);
        if (errors.length)
            return errors;
        if (value.indexOf('{fontstack}') === -1) {
            errors.push(new ValidationError(key, value, '"glyphs" url must include a "{fontstack}" token'));
        }
        if (value.indexOf('{range}') === -1) {
            errors.push(new ValidationError(key, value, '"glyphs" url must include a "{range}" token'));
        }
        return errors;
    }

    /**
     * Validate a MapLibre GL style against the style specification. This entrypoint,
     * `maplibre-gl-style-spec/lib/validate_style.min`, is designed to produce as
     * small a browserify bundle as possible by omitting unnecessary functionality
     * and legacy style specifications.
     *
     * @private
     * @param {Object} style The style to be validated.
     * @param {Object} [styleSpec] The style specification to validate against.
     *     If omitted, the latest style spec is used.
     * @returns {Array<ValidationError>}
     * @example
     *   var validate = require('maplibre-gl-style-spec/lib/validate_style.min');
     *   var errors = validate(style);
     */
    function validateStyleMin(style, styleSpec = spec) {
        let errors = [];
        errors = errors.concat(validate({
            key: '',
            value: style,
            valueSpec: styleSpec.$root,
            styleSpec,
            style,
            validateSpec: validate,
            objectElementValidators: {
                glyphs: validateGlyphsUrl,
                '*'() {
                    return [];
                }
            }
        }));
        if (style['constants']) {
            errors = errors.concat(validateConstants({
                key: 'constants',
                value: style['constants'],
                style,
                styleSpec,
                validateSpec: validate,
            }));
        }
        return sortErrors(errors);
    }
    validateStyleMin.source = wrapCleanErrors(injectValidateSpec(validateSource));
    validateStyleMin.sprite = wrapCleanErrors(injectValidateSpec(validateSprite));
    validateStyleMin.glyphs = wrapCleanErrors(injectValidateSpec(validateGlyphsUrl));
    validateStyleMin.light = wrapCleanErrors(injectValidateSpec(validateLight));
    validateStyleMin.terrain = wrapCleanErrors(injectValidateSpec(validateTerrain));
    validateStyleMin.layer = wrapCleanErrors(injectValidateSpec(validateLayer));
    validateStyleMin.filter = wrapCleanErrors(injectValidateSpec(validateFilter));
    validateStyleMin.paintProperty = wrapCleanErrors(injectValidateSpec(validatePaintProperty$1));
    validateStyleMin.layoutProperty = wrapCleanErrors(injectValidateSpec(validateLayoutProperty$1));
    function injectValidateSpec(validator) {
        return function (options) {
            return validator({
                ...options,
                validateSpec: validate,
            });
        };
    }
    function sortErrors(errors) {
        return [].concat(errors).sort((a, b) => {
            return a.line - b.line;
        });
    }
    function wrapCleanErrors(inner) {
        return function (...args) {
            return sortErrors(inner.apply(this, args));
        };
    }

    function _addEventListener(type, listener, listenerList) {
        const listenerExists = listenerList[type] && listenerList[type].indexOf(listener) !== -1;
        if (!listenerExists) {
            listenerList[type] = listenerList[type] || [];
            listenerList[type].push(listener);
        }
    }
    function _removeEventListener(type, listener, listenerList) {
        if (listenerList && listenerList[type]) {
            const index = listenerList[type].indexOf(listener);
            if (index !== -1) {
                listenerList[type].splice(index, 1);
            }
        }
    }
    class Event {
        constructor(type, data = {}) {
            extend$1(this, data);
            this.type = type;
        }
    }
    class ErrorEvent extends Event {
        constructor(error, data = {}) {
            super('error', extend$1({ error }, data));
        }
    }
    /**
     * Methods mixed in to other classes for event capabilities.
     *
     * @mixin Evented
     */
    class Evented {
        /**
         * Adds a listener to a specified event type.
         *
         * @param {string} type The event type to add a listen for.
         * @param {Function} listener The function to be called when the event is fired.
         *   The listener function is called with the data object passed to `fire`,
         *   extended with `target` and `type` properties.
         * @returns {Object} `this`
         */
        on(type, listener) {
            this._listeners = this._listeners || {};
            _addEventListener(type, listener, this._listeners);
            return this;
        }
        /**
         * Removes a previously registered event listener.
         *
         * @param {string} type The event type to remove listeners for.
         * @param {Function} listener The listener function to remove.
         * @returns {Object} `this`
         */
        off(type, listener) {
            _removeEventListener(type, listener, this._listeners);
            _removeEventListener(type, listener, this._oneTimeListeners);
            return this;
        }
        /**
         * Adds a listener that will be called only once to a specified event type.
         *
         * The listener will be called first time the event fires after the listener is registered.
         *
         * @param {string} type The event type to listen for.
         * @param {Function} listener The function to be called when the event is fired the first time.
         * @returns {Object} `this` or a promise if a listener is not provided
         */
        once(type, listener) {
            if (!listener) {
                return new Promise((resolve) => this.once(type, resolve));
            }
            this._oneTimeListeners = this._oneTimeListeners || {};
            _addEventListener(type, listener, this._oneTimeListeners);
            return this;
        }
        fire(event, properties) {
            // Compatibility with (type: string, properties: Object) signature from previous versions.
            // See https://github.com/mapbox/mapbox-gl-js/issues/6522,
            //     https://github.com/mapbox/mapbox-gl-draw/issues/766
            if (typeof event === 'string') {
                event = new Event(event, properties || {});
            }
            const type = event.type;
            if (this.listens(type)) {
                event.target = this;
                // make sure adding or removing listeners inside other listeners won't cause an infinite loop
                const listeners = this._listeners && this._listeners[type] ? this._listeners[type].slice() : [];
                for (const listener of listeners) {
                    listener.call(this, event);
                }
                const oneTimeListeners = this._oneTimeListeners && this._oneTimeListeners[type] ? this._oneTimeListeners[type].slice() : [];
                for (const listener of oneTimeListeners) {
                    _removeEventListener(type, listener, this._oneTimeListeners);
                    listener.call(this, event);
                }
                const parent = this._eventedParent;
                if (parent) {
                    extend$1(event, typeof this._eventedParentData === 'function' ? this._eventedParentData() : this._eventedParentData);
                    parent.fire(event);
                }
                // To ensure that no error events are dropped, print them to the
                // console if they have no listeners.
            }
            else if (event instanceof ErrorEvent) {
                console.error(event.error);
            }
            return this;
        }
        /**
         * Returns a true if this instance of Evented or any forwardeed instances of Evented have a listener for the specified type.
         *
         * @param {string} type The event type
         * @returns {boolean} `true` if there is at least one registered listener for specified event type, `false` otherwise
         * @private
         */
        listens(type) {
            return ((this._listeners && this._listeners[type] && this._listeners[type].length > 0) ||
                (this._oneTimeListeners && this._oneTimeListeners[type] && this._oneTimeListeners[type].length > 0) ||
                (this._eventedParent && this._eventedParent.listens(type)));
        }
        /**
         * Bubble all events fired by this instance of Evented to this parent instance of Evented.
         *
         * @private
         * @returns {Object} `this`
         * @private
         */
        setEventedParent(parent, data) {
            this._eventedParent = parent;
            this._eventedParentData = data;
            return this;
        }
    }

    const validateStyle = validateStyleMin;
    validateStyle.source;
    validateStyle.light;
    validateStyle.terrain;
    validateStyle.filter;
    const validatePaintProperty = validateStyle.paintProperty;
    const validateLayoutProperty = validateStyle.layoutProperty;
    function emitValidationErrors(emitter, errors) {
        let hasErrors = false;
        if (errors && errors.length) {
            for (const error of errors) {
                emitter.fire(new ErrorEvent(new Error(error.message)));
                hasErrors = true;
            }
        }
        return hasErrors;
    }

    class ZoomHistory {
        constructor() {
            this.first = true;
        }
        update(z, now) {
            const floorZ = Math.floor(z);
            if (this.first) {
                this.first = false;
                this.lastIntegerZoom = floorZ;
                this.lastIntegerZoomTime = 0;
                this.lastZoom = z;
                this.lastFloorZoom = floorZ;
                return true;
            }
            if (this.lastFloorZoom > floorZ) {
                this.lastIntegerZoom = floorZ + 1;
                this.lastIntegerZoomTime = now;
            }
            else if (this.lastFloorZoom < floorZ) {
                this.lastIntegerZoom = floorZ;
                this.lastIntegerZoomTime = now;
            }
            if (z !== this.lastZoom) {
                this.lastZoom = z;
                this.lastFloorZoom = floorZ;
                return true;
            }
            return false;
        }
    }

    // The following table comes from <http://www.unicode.org/Public/12.0.0/ucd/Blocks.txt>.
    // Keep it synchronized with <http://www.unicode.org/Public/UCD/latest/ucd/Blocks.txt>.
    const unicodeBlockLookup = {
        // 'Basic Latin': (char) => char >= 0x0000 && char <= 0x007F,
        'Latin-1 Supplement': (char) => char >= 0x0080 && char <= 0x00FF,
        // 'Latin Extended-A': (char) => char >= 0x0100 && char <= 0x017F,
        // 'Latin Extended-B': (char) => char >= 0x0180 && char <= 0x024F,
        // 'IPA Extensions': (char) => char >= 0x0250 && char <= 0x02AF,
        // 'Spacing Modifier Letters': (char) => char >= 0x02B0 && char <= 0x02FF,
        // 'Combining Diacritical Marks': (char) => char >= 0x0300 && char <= 0x036F,
        // 'Greek and Coptic': (char) => char >= 0x0370 && char <= 0x03FF,
        // 'Cyrillic': (char) => char >= 0x0400 && char <= 0x04FF,
        // 'Cyrillic Supplement': (char) => char >= 0x0500 && char <= 0x052F,
        // 'Armenian': (char) => char >= 0x0530 && char <= 0x058F,
        //'Hebrew': (char) => char >= 0x0590 && char <= 0x05FF,
        'Arabic': (char) => char >= 0x0600 && char <= 0x06FF,
        //'Syriac': (char) => char >= 0x0700 && char <= 0x074F,
        'Arabic Supplement': (char) => char >= 0x0750 && char <= 0x077F,
        // 'Thaana': (char) => char >= 0x0780 && char <= 0x07BF,
        // 'NKo': (char) => char >= 0x07C0 && char <= 0x07FF,
        // 'Samaritan': (char) => char >= 0x0800 && char <= 0x083F,
        // 'Mandaic': (char) => char >= 0x0840 && char <= 0x085F,
        // 'Syriac Supplement': (char) => char >= 0x0860 && char <= 0x086F,
        'Arabic Extended-A': (char) => char >= 0x08A0 && char <= 0x08FF,
        // 'Devanagari': (char) => char >= 0x0900 && char <= 0x097F,
        // 'Bengali': (char) => char >= 0x0980 && char <= 0x09FF,
        // 'Gurmukhi': (char) => char >= 0x0A00 && char <= 0x0A7F,
        // 'Gujarati': (char) => char >= 0x0A80 && char <= 0x0AFF,
        // 'Oriya': (char) => char >= 0x0B00 && char <= 0x0B7F,
        // 'Tamil': (char) => char >= 0x0B80 && char <= 0x0BFF,
        // 'Telugu': (char) => char >= 0x0C00 && char <= 0x0C7F,
        // 'Kannada': (char) => char >= 0x0C80 && char <= 0x0CFF,
        // 'Malayalam': (char) => char >= 0x0D00 && char <= 0x0D7F,
        // 'Sinhala': (char) => char >= 0x0D80 && char <= 0x0DFF,
        // 'Thai': (char) => char >= 0x0E00 && char <= 0x0E7F,
        // 'Lao': (char) => char >= 0x0E80 && char <= 0x0EFF,
        // 'Tibetan': (char) => char >= 0x0F00 && char <= 0x0FFF,
        // 'Myanmar': (char) => char >= 0x1000 && char <= 0x109F,
        // 'Georgian': (char) => char >= 0x10A0 && char <= 0x10FF,
        'Hangul Jamo': (char) => char >= 0x1100 && char <= 0x11FF,
        // 'Ethiopic': (char) => char >= 0x1200 && char <= 0x137F,
        // 'Ethiopic Supplement': (char) => char >= 0x1380 && char <= 0x139F,
        // 'Cherokee': (char) => char >= 0x13A0 && char <= 0x13FF,
        'Unified Canadian Aboriginal Syllabics': (char) => char >= 0x1400 && char <= 0x167F,
        // 'Ogham': (char) => char >= 0x1680 && char <= 0x169F,
        // 'Runic': (char) => char >= 0x16A0 && char <= 0x16FF,
        // 'Tagalog': (char) => char >= 0x1700 && char <= 0x171F,
        // 'Hanunoo': (char) => char >= 0x1720 && char <= 0x173F,
        // 'Buhid': (char) => char >= 0x1740 && char <= 0x175F,
        // 'Tagbanwa': (char) => char >= 0x1760 && char <= 0x177F,
        'Khmer': (char) => char >= 0x1780 && char <= 0x17FF,
        // 'Mongolian': (char) => char >= 0x1800 && char <= 0x18AF,
        'Unified Canadian Aboriginal Syllabics Extended': (char) => char >= 0x18B0 && char <= 0x18FF,
        // 'Limbu': (char) => char >= 0x1900 && char <= 0x194F,
        // 'Tai Le': (char) => char >= 0x1950 && char <= 0x197F,
        // 'New Tai Lue': (char) => char >= 0x1980 && char <= 0x19DF,
        // 'Khmer Symbols': (char) => char >= 0x19E0 && char <= 0x19FF,
        // 'Buginese': (char) => char >= 0x1A00 && char <= 0x1A1F,
        // 'Tai Tham': (char) => char >= 0x1A20 && char <= 0x1AAF,
        // 'Combining Diacritical Marks Extended': (char) => char >= 0x1AB0 && char <= 0x1AFF,
        // 'Balinese': (char) => char >= 0x1B00 && char <= 0x1B7F,
        // 'Sundanese': (char) => char >= 0x1B80 && char <= 0x1BBF,
        // 'Batak': (char) => char >= 0x1BC0 && char <= 0x1BFF,
        // 'Lepcha': (char) => char >= 0x1C00 && char <= 0x1C4F,
        // 'Ol Chiki': (char) => char >= 0x1C50 && char <= 0x1C7F,
        // 'Cyrillic Extended-C': (char) => char >= 0x1C80 && char <= 0x1C8F,
        // 'Georgian Extended': (char) => char >= 0x1C90 && char <= 0x1CBF,
        // 'Sundanese Supplement': (char) => char >= 0x1CC0 && char <= 0x1CCF,
        // 'Vedic Extensions': (char) => char >= 0x1CD0 && char <= 0x1CFF,
        // 'Phonetic Extensions': (char) => char >= 0x1D00 && char <= 0x1D7F,
        // 'Phonetic Extensions Supplement': (char) => char >= 0x1D80 && char <= 0x1DBF,
        // 'Combining Diacritical Marks Supplement': (char) => char >= 0x1DC0 && char <= 0x1DFF,
        // 'Latin Extended Additional': (char) => char >= 0x1E00 && char <= 0x1EFF,
        // 'Greek Extended': (char) => char >= 0x1F00 && char <= 0x1FFF,
        'General Punctuation': (char) => char >= 0x2000 && char <= 0x206F,
        // 'Superscripts and Subscripts': (char) => char >= 0x2070 && char <= 0x209F,
        // 'Currency Symbols': (char) => char >= 0x20A0 && char <= 0x20CF,
        // 'Combining Diacritical Marks for Symbols': (char) => char >= 0x20D0 && char <= 0x20FF,
        'Letterlike Symbols': (char) => char >= 0x2100 && char <= 0x214F,
        'Number Forms': (char) => char >= 0x2150 && char <= 0x218F,
        // 'Arrows': (char) => char >= 0x2190 && char <= 0x21FF,
        // 'Mathematical Operators': (char) => char >= 0x2200 && char <= 0x22FF,
        'Miscellaneous Technical': (char) => char >= 0x2300 && char <= 0x23FF,
        'Control Pictures': (char) => char >= 0x2400 && char <= 0x243F,
        'Optical Character Recognition': (char) => char >= 0x2440 && char <= 0x245F,
        'Enclosed Alphanumerics': (char) => char >= 0x2460 && char <= 0x24FF,
        // 'Box Drawing': (char) => char >= 0x2500 && char <= 0x257F,
        // 'Block Elements': (char) => char >= 0x2580 && char <= 0x259F,
        'Geometric Shapes': (char) => char >= 0x25A0 && char <= 0x25FF,
        'Miscellaneous Symbols': (char) => char >= 0x2600 && char <= 0x26FF,
        // 'Dingbats': (char) => char >= 0x2700 && char <= 0x27BF,
        // 'Miscellaneous Mathematical Symbols-A': (char) => char >= 0x27C0 && char <= 0x27EF,
        // 'Supplemental Arrows-A': (char) => char >= 0x27F0 && char <= 0x27FF,
        // 'Braille Patterns': (char) => char >= 0x2800 && char <= 0x28FF,
        // 'Supplemental Arrows-B': (char) => char >= 0x2900 && char <= 0x297F,
        // 'Miscellaneous Mathematical Symbols-B': (char) => char >= 0x2980 && char <= 0x29FF,
        // 'Supplemental Mathematical Operators': (char) => char >= 0x2A00 && char <= 0x2AFF,
        'Miscellaneous Symbols and Arrows': (char) => char >= 0x2B00 && char <= 0x2BFF,
        // 'Glagolitic': (char) => char >= 0x2C00 && char <= 0x2C5F,
        // 'Latin Extended-C': (char) => char >= 0x2C60 && char <= 0x2C7F,
        // 'Coptic': (char) => char >= 0x2C80 && char <= 0x2CFF,
        // 'Georgian Supplement': (char) => char >= 0x2D00 && char <= 0x2D2F,
        // 'Tifinagh': (char) => char >= 0x2D30 && char <= 0x2D7F,
        // 'Ethiopic Extended': (char) => char >= 0x2D80 && char <= 0x2DDF,
        // 'Cyrillic Extended-A': (char) => char >= 0x2DE0 && char <= 0x2DFF,
        // 'Supplemental Punctuation': (char) => char >= 0x2E00 && char <= 0x2E7F,
        'CJK Radicals Supplement': (char) => char >= 0x2E80 && char <= 0x2EFF,
        'Kangxi Radicals': (char) => char >= 0x2F00 && char <= 0x2FDF,
        'Ideographic Description Characters': (char) => char >= 0x2FF0 && char <= 0x2FFF,
        'CJK Symbols and Punctuation': (char) => char >= 0x3000 && char <= 0x303F,
        'Hiragana': (char) => char >= 0x3040 && char <= 0x309F,
        'Katakana': (char) => char >= 0x30A0 && char <= 0x30FF,
        'Bopomofo': (char) => char >= 0x3100 && char <= 0x312F,
        'Hangul Compatibility Jamo': (char) => char >= 0x3130 && char <= 0x318F,
        'Kanbun': (char) => char >= 0x3190 && char <= 0x319F,
        'Bopomofo Extended': (char) => char >= 0x31A0 && char <= 0x31BF,
        'CJK Strokes': (char) => char >= 0x31C0 && char <= 0x31EF,
        'Katakana Phonetic Extensions': (char) => char >= 0x31F0 && char <= 0x31FF,
        'Enclosed CJK Letters and Months': (char) => char >= 0x3200 && char <= 0x32FF,
        'CJK Compatibility': (char) => char >= 0x3300 && char <= 0x33FF,
        'CJK Unified Ideographs Extension A': (char) => char >= 0x3400 && char <= 0x4DBF,
        'Yijing Hexagram Symbols': (char) => char >= 0x4DC0 && char <= 0x4DFF,
        'CJK Unified Ideographs': (char) => char >= 0x4E00 && char <= 0x9FFF,
        'Yi Syllables': (char) => char >= 0xA000 && char <= 0xA48F,
        'Yi Radicals': (char) => char >= 0xA490 && char <= 0xA4CF,
        // 'Lisu': (char) => char >= 0xA4D0 && char <= 0xA4FF,
        // 'Vai': (char) => char >= 0xA500 && char <= 0xA63F,
        // 'Cyrillic Extended-B': (char) => char >= 0xA640 && char <= 0xA69F,
        // 'Bamum': (char) => char >= 0xA6A0 && char <= 0xA6FF,
        // 'Modifier Tone Letters': (char) => char >= 0xA700 && char <= 0xA71F,
        // 'Latin Extended-D': (char) => char >= 0xA720 && char <= 0xA7FF,
        // 'Syloti Nagri': (char) => char >= 0xA800 && char <= 0xA82F,
        // 'Common Indic Number Forms': (char) => char >= 0xA830 && char <= 0xA83F,
        // 'Phags-pa': (char) => char >= 0xA840 && char <= 0xA87F,
        // 'Saurashtra': (char) => char >= 0xA880 && char <= 0xA8DF,
        // 'Devanagari Extended': (char) => char >= 0xA8E0 && char <= 0xA8FF,
        // 'Kayah Li': (char) => char >= 0xA900 && char <= 0xA92F,
        // 'Rejang': (char) => char >= 0xA930 && char <= 0xA95F,
        'Hangul Jamo Extended-A': (char) => char >= 0xA960 && char <= 0xA97F,
        // 'Javanese': (char) => char >= 0xA980 && char <= 0xA9DF,
        // 'Myanmar Extended-B': (char) => char >= 0xA9E0 && char <= 0xA9FF,
        // 'Cham': (char) => char >= 0xAA00 && char <= 0xAA5F,
        // 'Myanmar Extended-A': (char) => char >= 0xAA60 && char <= 0xAA7F,
        // 'Tai Viet': (char) => char >= 0xAA80 && char <= 0xAADF,
        // 'Meetei Mayek Extensions': (char) => char >= 0xAAE0 && char <= 0xAAFF,
        // 'Ethiopic Extended-A': (char) => char >= 0xAB00 && char <= 0xAB2F,
        // 'Latin Extended-E': (char) => char >= 0xAB30 && char <= 0xAB6F,
        // 'Cherokee Supplement': (char) => char >= 0xAB70 && char <= 0xABBF,
        // 'Meetei Mayek': (char) => char >= 0xABC0 && char <= 0xABFF,
        'Hangul Syllables': (char) => char >= 0xAC00 && char <= 0xD7AF,
        'Hangul Jamo Extended-B': (char) => char >= 0xD7B0 && char <= 0xD7FF,
        // 'High Surrogates': (char) => char >= 0xD800 && char <= 0xDB7F,
        // 'High Private Use Surrogates': (char) => char >= 0xDB80 && char <= 0xDBFF,
        // 'Low Surrogates': (char) => char >= 0xDC00 && char <= 0xDFFF,
        'Private Use Area': (char) => char >= 0xE000 && char <= 0xF8FF,
        'CJK Compatibility Ideographs': (char) => char >= 0xF900 && char <= 0xFAFF,
        // 'Alphabetic Presentation Forms': (char) => char >= 0xFB00 && char <= 0xFB4F,
        'Arabic Presentation Forms-A': (char) => char >= 0xFB50 && char <= 0xFDFF,
        // 'Variation Selectors': (char) => char >= 0xFE00 && char <= 0xFE0F,
        'Vertical Forms': (char) => char >= 0xFE10 && char <= 0xFE1F,
        // 'Combining Half Marks': (char) => char >= 0xFE20 && char <= 0xFE2F,
        'CJK Compatibility Forms': (char) => char >= 0xFE30 && char <= 0xFE4F,
        'Small Form Variants': (char) => char >= 0xFE50 && char <= 0xFE6F,
        'Arabic Presentation Forms-B': (char) => char >= 0xFE70 && char <= 0xFEFF,
        'Halfwidth and Fullwidth Forms': (char) => char >= 0xFF00 && char <= 0xFFEF
        // 'Specials': (char) => char >= 0xFFF0 && char <= 0xFFFF,
        // 'Linear B Syllabary': (char) => char >= 0x10000 && char <= 0x1007F,
        // 'Linear B Ideograms': (char) => char >= 0x10080 && char <= 0x100FF,
        // 'Aegean Numbers': (char) => char >= 0x10100 && char <= 0x1013F,
        // 'Ancient Greek Numbers': (char) => char >= 0x10140 && char <= 0x1018F,
        // 'Ancient Symbols': (char) => char >= 0x10190 && char <= 0x101CF,
        // 'Phaistos Disc': (char) => char >= 0x101D0 && char <= 0x101FF,
        // 'Lycian': (char) => char >= 0x10280 && char <= 0x1029F,
        // 'Carian': (char) => char >= 0x102A0 && char <= 0x102DF,
        // 'Coptic Epact Numbers': (char) => char >= 0x102E0 && char <= 0x102FF,
        // 'Old Italic': (char) => char >= 0x10300 && char <= 0x1032F,
        // 'Gothic': (char) => char >= 0x10330 && char <= 0x1034F,
        // 'Old Permic': (char) => char >= 0x10350 && char <= 0x1037F,
        // 'Ugaritic': (char) => char >= 0x10380 && char <= 0x1039F,
        // 'Old Persian': (char) => char >= 0x103A0 && char <= 0x103DF,
        // 'Deseret': (char) => char >= 0x10400 && char <= 0x1044F,
        // 'Shavian': (char) => char >= 0x10450 && char <= 0x1047F,
        // 'Osmanya': (char) => char >= 0x10480 && char <= 0x104AF,
        // 'Osage': (char) => char >= 0x104B0 && char <= 0x104FF,
        // 'Elbasan': (char) => char >= 0x10500 && char <= 0x1052F,
        // 'Caucasian Albanian': (char) => char >= 0x10530 && char <= 0x1056F,
        // 'Linear A': (char) => char >= 0x10600 && char <= 0x1077F,
        // 'Cypriot Syllabary': (char) => char >= 0x10800 && char <= 0x1083F,
        // 'Imperial Aramaic': (char) => char >= 0x10840 && char <= 0x1085F,
        // 'Palmyrene': (char) => char >= 0x10860 && char <= 0x1087F,
        // 'Nabataean': (char) => char >= 0x10880 && char <= 0x108AF,
        // 'Hatran': (char) => char >= 0x108E0 && char <= 0x108FF,
        // 'Phoenician': (char) => char >= 0x10900 && char <= 0x1091F,
        // 'Lydian': (char) => char >= 0x10920 && char <= 0x1093F,
        // 'Meroitic Hieroglyphs': (char) => char >= 0x10980 && char <= 0x1099F,
        // 'Meroitic Cursive': (char) => char >= 0x109A0 && char <= 0x109FF,
        // 'Kharoshthi': (char) => char >= 0x10A00 && char <= 0x10A5F,
        // 'Old South Arabian': (char) => char >= 0x10A60 && char <= 0x10A7F,
        // 'Old North Arabian': (char) => char >= 0x10A80 && char <= 0x10A9F,
        // 'Manichaean': (char) => char >= 0x10AC0 && char <= 0x10AFF,
        // 'Avestan': (char) => char >= 0x10B00 && char <= 0x10B3F,
        // 'Inscriptional Parthian': (char) => char >= 0x10B40 && char <= 0x10B5F,
        // 'Inscriptional Pahlavi': (char) => char >= 0x10B60 && char <= 0x10B7F,
        // 'Psalter Pahlavi': (char) => char >= 0x10B80 && char <= 0x10BAF,
        // 'Old Turkic': (char) => char >= 0x10C00 && char <= 0x10C4F,
        // 'Old Hungarian': (char) => char >= 0x10C80 && char <= 0x10CFF,
        // 'Hanifi Rohingya': (char) => char >= 0x10D00 && char <= 0x10D3F,
        // 'Rumi Numeral Symbols': (char) => char >= 0x10E60 && char <= 0x10E7F,
        // 'Old Sogdian': (char) => char >= 0x10F00 && char <= 0x10F2F,
        // 'Sogdian': (char) => char >= 0x10F30 && char <= 0x10F6F,
        // 'Elymaic': (char) => char >= 0x10FE0 && char <= 0x10FFF,
        // 'Brahmi': (char) => char >= 0x11000 && char <= 0x1107F,
        // 'Kaithi': (char) => char >= 0x11080 && char <= 0x110CF,
        // 'Sora Sompeng': (char) => char >= 0x110D0 && char <= 0x110FF,
        // 'Chakma': (char) => char >= 0x11100 && char <= 0x1114F,
        // 'Mahajani': (char) => char >= 0x11150 && char <= 0x1117F,
        // 'Sharada': (char) => char >= 0x11180 && char <= 0x111DF,
        // 'Sinhala Archaic Numbers': (char) => char >= 0x111E0 && char <= 0x111FF,
        // 'Khojki': (char) => char >= 0x11200 && char <= 0x1124F,
        // 'Multani': (char) => char >= 0x11280 && char <= 0x112AF,
        // 'Khudawadi': (char) => char >= 0x112B0 && char <= 0x112FF,
        // 'Grantha': (char) => char >= 0x11300 && char <= 0x1137F,
        // 'Newa': (char) => char >= 0x11400 && char <= 0x1147F,
        // 'Tirhuta': (char) => char >= 0x11480 && char <= 0x114DF,
        // 'Siddham': (char) => char >= 0x11580 && char <= 0x115FF,
        // 'Modi': (char) => char >= 0x11600 && char <= 0x1165F,
        // 'Mongolian Supplement': (char) => char >= 0x11660 && char <= 0x1167F,
        // 'Takri': (char) => char >= 0x11680 && char <= 0x116CF,
        // 'Ahom': (char) => char >= 0x11700 && char <= 0x1173F,
        // 'Dogra': (char) => char >= 0x11800 && char <= 0x1184F,
        // 'Warang Citi': (char) => char >= 0x118A0 && char <= 0x118FF,
        // 'Nandinagari': (char) => char >= 0x119A0 && char <= 0x119FF,
        // 'Zanabazar Square': (char) => char >= 0x11A00 && char <= 0x11A4F,
        // 'Soyombo': (char) => char >= 0x11A50 && char <= 0x11AAF,
        // 'Pau Cin Hau': (char) => char >= 0x11AC0 && char <= 0x11AFF,
        // 'Bhaiksuki': (char) => char >= 0x11C00 && char <= 0x11C6F,
        // 'Marchen': (char) => char >= 0x11C70 && char <= 0x11CBF,
        // 'Masaram Gondi': (char) => char >= 0x11D00 && char <= 0x11D5F,
        // 'Gunjala Gondi': (char) => char >= 0x11D60 && char <= 0x11DAF,
        // 'Makasar': (char) => char >= 0x11EE0 && char <= 0x11EFF,
        // 'Tamil Supplement': (char) => char >= 0x11FC0 && char <= 0x11FFF,
        // 'Cuneiform': (char) => char >= 0x12000 && char <= 0x123FF,
        // 'Cuneiform Numbers and Punctuation': (char) => char >= 0x12400 && char <= 0x1247F,
        // 'Early Dynastic Cuneiform': (char) => char >= 0x12480 && char <= 0x1254F,
        // 'Egyptian Hieroglyphs': (char) => char >= 0x13000 && char <= 0x1342F,
        // 'Egyptian Hieroglyph Format Controls': (char) => char >= 0x13430 && char <= 0x1343F,
        // 'Anatolian Hieroglyphs': (char) => char >= 0x14400 && char <= 0x1467F,
        // 'Bamum Supplement': (char) => char >= 0x16800 && char <= 0x16A3F,
        // 'Mro': (char) => char >= 0x16A40 && char <= 0x16A6F,
        // 'Bassa Vah': (char) => char >= 0x16AD0 && char <= 0x16AFF,
        // 'Pahawh Hmong': (char) => char >= 0x16B00 && char <= 0x16B8F,
        // 'Medefaidrin': (char) => char >= 0x16E40 && char <= 0x16E9F,
        // 'Miao': (char) => char >= 0x16F00 && char <= 0x16F9F,
        // 'Ideographic Symbols and Punctuation': (char) => char >= 0x16FE0 && char <= 0x16FFF,
        // 'Tangut': (char) => char >= 0x17000 && char <= 0x187FF,
        // 'Tangut Components': (char) => char >= 0x18800 && char <= 0x18AFF,
        // 'Kana Supplement': (char) => char >= 0x1B000 && char <= 0x1B0FF,
        // 'Kana Extended-A': (char) => char >= 0x1B100 && char <= 0x1B12F,
        // 'Small Kana Extension': (char) => char >= 0x1B130 && char <= 0x1B16F,
        // 'Nushu': (char) => char >= 0x1B170 && char <= 0x1B2FF,
        // 'Duployan': (char) => char >= 0x1BC00 && char <= 0x1BC9F,
        // 'Shorthand Format Controls': (char) => char >= 0x1BCA0 && char <= 0x1BCAF,
        // 'Byzantine Musical Symbols': (char) => char >= 0x1D000 && char <= 0x1D0FF,
        // 'Musical Symbols': (char) => char >= 0x1D100 && char <= 0x1D1FF,
        // 'Ancient Greek Musical Notation': (char) => char >= 0x1D200 && char <= 0x1D24F,
        // 'Mayan Numerals': (char) => char >= 0x1D2E0 && char <= 0x1D2FF,
        // 'Tai Xuan Jing Symbols': (char) => char >= 0x1D300 && char <= 0x1D35F,
        // 'Counting Rod Numerals': (char) => char >= 0x1D360 && char <= 0x1D37F,
        // 'Mathematical Alphanumeric Symbols': (char) => char >= 0x1D400 && char <= 0x1D7FF,
        // 'Sutton SignWriting': (char) => char >= 0x1D800 && char <= 0x1DAAF,
        // 'Glagolitic Supplement': (char) => char >= 0x1E000 && char <= 0x1E02F,
        // 'Nyiakeng Puachue Hmong': (char) => char >= 0x1E100 && char <= 0x1E14F,
        // 'Wancho': (char) => char >= 0x1E2C0 && char <= 0x1E2FF,
        // 'Mende Kikakui': (char) => char >= 0x1E800 && char <= 0x1E8DF,
        // 'Adlam': (char) => char >= 0x1E900 && char <= 0x1E95F,
        // 'Indic Siyaq Numbers': (char) => char >= 0x1EC70 && char <= 0x1ECBF,
        // 'Ottoman Siyaq Numbers': (char) => char >= 0x1ED00 && char <= 0x1ED4F,
        // 'Arabic Mathematical Alphabetic Symbols': (char) => char >= 0x1EE00 && char <= 0x1EEFF,
        // 'Mahjong Tiles': (char) => char >= 0x1F000 && char <= 0x1F02F,
        // 'Domino Tiles': (char) => char >= 0x1F030 && char <= 0x1F09F,
        // 'Playing Cards': (char) => char >= 0x1F0A0 && char <= 0x1F0FF,
        // 'Enclosed Alphanumeric Supplement': (char) => char >= 0x1F100 && char <= 0x1F1FF,
        // 'Enclosed Ideographic Supplement': (char) => char >= 0x1F200 && char <= 0x1F2FF,
        // 'Miscellaneous Symbols and Pictographs': (char) => char >= 0x1F300 && char <= 0x1F5FF,
        // 'Emoticons': (char) => char >= 0x1F600 && char <= 0x1F64F,
        // 'Ornamental Dingbats': (char) => char >= 0x1F650 && char <= 0x1F67F,
        // 'Transport and Map Symbols': (char) => char >= 0x1F680 && char <= 0x1F6FF,
        // 'Alchemical Symbols': (char) => char >= 0x1F700 && char <= 0x1F77F,
        // 'Geometric Shapes Extended': (char) => char >= 0x1F780 && char <= 0x1F7FF,
        // 'Supplemental Arrows-C': (char) => char >= 0x1F800 && char <= 0x1F8FF,
        // 'Supplemental Symbols and Pictographs': (char) => char >= 0x1F900 && char <= 0x1F9FF,
        // 'Chess Symbols': (char) => char >= 0x1FA00 && char <= 0x1FA6F,
        // 'Symbols and Pictographs Extended-A': (char) => char >= 0x1FA70 && char <= 0x1FAFF,
        // 'CJK Unified Ideographs Extension B': (char) => char >= 0x20000 && char <= 0x2A6DF,
        // 'CJK Unified Ideographs Extension C': (char) => char >= 0x2A700 && char <= 0x2B73F,
        // 'CJK Unified Ideographs Extension D': (char) => char >= 0x2B740 && char <= 0x2B81F,
        // 'CJK Unified Ideographs Extension E': (char) => char >= 0x2B820 && char <= 0x2CEAF,
        // 'CJK Unified Ideographs Extension F': (char) => char >= 0x2CEB0 && char <= 0x2EBEF,
        // 'CJK Compatibility Ideographs Supplement': (char) => char >= 0x2F800 && char <= 0x2FA1F,
        // 'Tags': (char) => char >= 0xE0000 && char <= 0xE007F,
        // 'Variation Selectors Supplement': (char) => char >= 0xE0100 && char <= 0xE01EF,
        // 'Supplementary Private Use Area-A': (char) => char >= 0xF0000 && char <= 0xFFFFF,
        // 'Supplementary Private Use Area-B': (char) => char >= 0x100000 && char <= 0x10FFFF,
    };

    /* eslint-disable new-cap */
    function allowsVerticalWritingMode(chars) {
        for (const char of chars) {
            if (charHasUprightVerticalOrientation(char.charCodeAt(0)))
                return true;
        }
        return false;
    }
    function allowsLetterSpacing(chars) {
        for (const char of chars) {
            if (!charAllowsLetterSpacing(char.charCodeAt(0)))
                return false;
        }
        return true;
    }
    function charAllowsLetterSpacing(char) {
        if (unicodeBlockLookup['Arabic'](char))
            return false;
        if (unicodeBlockLookup['Arabic Supplement'](char))
            return false;
        if (unicodeBlockLookup['Arabic Extended-A'](char))
            return false;
        if (unicodeBlockLookup['Arabic Presentation Forms-A'](char))
            return false;
        if (unicodeBlockLookup['Arabic Presentation Forms-B'](char))
            return false;
        return true;
    }
    function charAllowsIdeographicBreaking(char) {
        // Return early for characters outside all ideographic ranges.
        if (char < 0x2E80)
            return false;
        if (unicodeBlockLookup['Bopomofo Extended'](char))
            return true;
        if (unicodeBlockLookup['Bopomofo'](char))
            return true;
        if (unicodeBlockLookup['CJK Compatibility Forms'](char))
            return true;
        if (unicodeBlockLookup['CJK Compatibility Ideographs'](char))
            return true;
        if (unicodeBlockLookup['CJK Compatibility'](char))
            return true;
        if (unicodeBlockLookup['CJK Radicals Supplement'](char))
            return true;
        if (unicodeBlockLookup['CJK Strokes'](char))
            return true;
        if (unicodeBlockLookup['CJK Symbols and Punctuation'](char))
            return true;
        if (unicodeBlockLookup['CJK Unified Ideographs Extension A'](char))
            return true;
        if (unicodeBlockLookup['CJK Unified Ideographs'](char))
            return true;
        if (unicodeBlockLookup['Enclosed CJK Letters and Months'](char))
            return true;
        if (unicodeBlockLookup['Halfwidth and Fullwidth Forms'](char))
            return true;
        if (unicodeBlockLookup['Hiragana'](char))
            return true;
        if (unicodeBlockLookup['Ideographic Description Characters'](char))
            return true;
        if (unicodeBlockLookup['Kangxi Radicals'](char))
            return true;
        if (unicodeBlockLookup['Katakana Phonetic Extensions'](char))
            return true;
        if (unicodeBlockLookup['Katakana'](char))
            return true;
        if (unicodeBlockLookup['Vertical Forms'](char))
            return true;
        if (unicodeBlockLookup['Yi Radicals'](char))
            return true;
        if (unicodeBlockLookup['Yi Syllables'](char))
            return true;
        return false;
    }
    // The following logic comes from
    // <http://www.unicode.org/Public/12.0.0/ucd/VerticalOrientation.txt>.
    // Keep it synchronized with
    // <http://www.unicode.org/Public/UCD/latest/ucd/VerticalOrientation.txt>.
    // The data file denotes with “U” or “Tu” any codepoint that may be drawn
    // upright in vertical text but does not distinguish between upright and
    // “neutral” characters.
    // Blocks in the Unicode supplementary planes are excluded from this module due
    // to <https://github.com/mapbox/mapbox-gl/issues/29>.
    /**
     * Returns true if the given Unicode codepoint identifies a character with
     * upright orientation.
     *
     * A character has upright orientation if it is drawn upright (unrotated)
     * whether the line is oriented horizontally or vertically, even if both
     * adjacent characters can be rotated. For example, a Chinese character is
     * always drawn upright. An uprightly oriented character causes an adjacent
     * “neutral” character to be drawn upright as well.
     * @private
     */
    function charHasUprightVerticalOrientation(char) {
        if (char === 0x02EA /* modifier letter yin departing tone mark */ ||
            char === 0x02EB /* modifier letter yang departing tone mark */) {
            return true;
        }
        // Return early for characters outside all ranges whose characters remain
        // upright in vertical writing mode.
        if (char < 0x1100)
            return false;
        if (unicodeBlockLookup['Bopomofo Extended'](char))
            return true;
        if (unicodeBlockLookup['Bopomofo'](char))
            return true;
        if (unicodeBlockLookup['CJK Compatibility Forms'](char)) {
            if (!((char >= 0xFE49 /* dashed overline */ && char <= 0xFE4F) /* wavy low line */)) {
                return true;
            }
        }
        if (unicodeBlockLookup['CJK Compatibility Ideographs'](char))
            return true;
        if (unicodeBlockLookup['CJK Compatibility'](char))
            return true;
        if (unicodeBlockLookup['CJK Radicals Supplement'](char))
            return true;
        if (unicodeBlockLookup['CJK Strokes'](char))
            return true;
        if (unicodeBlockLookup['CJK Symbols and Punctuation'](char)) {
            if (!((char >= 0x3008 /* left angle bracket */ && char <= 0x3011) /* right black lenticular bracket */) &&
                !((char >= 0x3014 /* left tortoise shell bracket */ && char <= 0x301F) /* low double prime quotation mark */) &&
                char !== 0x3030 /* wavy dash */) {
                return true;
            }
        }
        if (unicodeBlockLookup['CJK Unified Ideographs Extension A'](char))
            return true;
        if (unicodeBlockLookup['CJK Unified Ideographs'](char))
            return true;
        if (unicodeBlockLookup['Enclosed CJK Letters and Months'](char))
            return true;
        if (unicodeBlockLookup['Hangul Compatibility Jamo'](char))
            return true;
        if (unicodeBlockLookup['Hangul Jamo Extended-A'](char))
            return true;
        if (unicodeBlockLookup['Hangul Jamo Extended-B'](char))
            return true;
        if (unicodeBlockLookup['Hangul Jamo'](char))
            return true;
        if (unicodeBlockLookup['Hangul Syllables'](char))
            return true;
        if (unicodeBlockLookup['Hiragana'](char))
            return true;
        if (unicodeBlockLookup['Ideographic Description Characters'](char))
            return true;
        if (unicodeBlockLookup['Kanbun'](char))
            return true;
        if (unicodeBlockLookup['Kangxi Radicals'](char))
            return true;
        if (unicodeBlockLookup['Katakana Phonetic Extensions'](char))
            return true;
        if (unicodeBlockLookup['Katakana'](char)) {
            if (char !== 0x30FC /* katakana-hiragana prolonged sound mark */) {
                return true;
            }
        }
        if (unicodeBlockLookup['Halfwidth and Fullwidth Forms'](char)) {
            if (char !== 0xFF08 /* fullwidth left parenthesis */ &&
                char !== 0xFF09 /* fullwidth right parenthesis */ &&
                char !== 0xFF0D /* fullwidth hyphen-minus */ &&
                !((char >= 0xFF1A /* fullwidth colon */ && char <= 0xFF1E) /* fullwidth greater-than sign */) &&
                char !== 0xFF3B /* fullwidth left square bracket */ &&
                char !== 0xFF3D /* fullwidth right square bracket */ &&
                char !== 0xFF3F /* fullwidth low line */ &&
                !(char >= 0xFF5B /* fullwidth left curly bracket */ && char <= 0xFFDF) &&
                char !== 0xFFE3 /* fullwidth macron */ &&
                !(char >= 0xFFE8 /* halfwidth forms light vertical */ && char <= 0xFFEF)) {
                return true;
            }
        }
        if (unicodeBlockLookup['Small Form Variants'](char)) {
            if (!((char >= 0xFE58 /* small em dash */ && char <= 0xFE5E) /* small right tortoise shell bracket */) &&
                !((char >= 0xFE63 /* small hyphen-minus */ && char <= 0xFE66) /* small equals sign */)) {
                return true;
            }
        }
        if (unicodeBlockLookup['Unified Canadian Aboriginal Syllabics'](char))
            return true;
        if (unicodeBlockLookup['Unified Canadian Aboriginal Syllabics Extended'](char))
            return true;
        if (unicodeBlockLookup['Vertical Forms'](char))
            return true;
        if (unicodeBlockLookup['Yijing Hexagram Symbols'](char))
            return true;
        if (unicodeBlockLookup['Yi Syllables'](char))
            return true;
        if (unicodeBlockLookup['Yi Radicals'](char))
            return true;
        return false;
    }
    /**
     * Returns true if the given Unicode codepoint identifies a character with
     * neutral orientation.
     *
     * A character has neutral orientation if it may be drawn rotated or unrotated
     * when the line is oriented vertically, depending on the orientation of the
     * adjacent characters. For example, along a verticlly oriented line, the vulgar
     * fraction ½ is drawn upright among Chinese characters but rotated among Latin
     * letters. A neutrally oriented character does not influence whether an
     * adjacent character is drawn upright or rotated.
     * @private
     */
    function charHasNeutralVerticalOrientation(char) {
        if (unicodeBlockLookup['Latin-1 Supplement'](char)) {
            if (char === 0x00A7 /* section sign */ ||
                char === 0x00A9 /* copyright sign */ ||
                char === 0x00AE /* registered sign */ ||
                char === 0x00B1 /* plus-minus sign */ ||
                char === 0x00BC /* vulgar fraction one quarter */ ||
                char === 0x00BD /* vulgar fraction one half */ ||
                char === 0x00BE /* vulgar fraction three quarters */ ||
                char === 0x00D7 /* multiplication sign */ ||
                char === 0x00F7 /* division sign */) {
                return true;
            }
        }
        if (unicodeBlockLookup['General Punctuation'](char)) {
            if (char === 0x2016 /* double vertical line */ ||
                char === 0x2020 /* dagger */ ||
                char === 0x2021 /* double dagger */ ||
                char === 0x2030 /* per mille sign */ ||
                char === 0x2031 /* per ten thousand sign */ ||
                char === 0x203B /* reference mark */ ||
                char === 0x203C /* double exclamation mark */ ||
                char === 0x2042 /* asterism */ ||
                char === 0x2047 /* double question mark */ ||
                char === 0x2048 /* question exclamation mark */ ||
                char === 0x2049 /* exclamation question mark */ ||
                char === 0x2051 /* two asterisks aligned vertically */) {
                return true;
            }
        }
        if (unicodeBlockLookup['Letterlike Symbols'](char))
            return true;
        if (unicodeBlockLookup['Number Forms'](char))
            return true;
        if (unicodeBlockLookup['Miscellaneous Technical'](char)) {
            if ((char >= 0x2300 /* diameter sign */ && char <= 0x2307 /* wavy line */) ||
                (char >= 0x230C /* bottom right crop */ && char <= 0x231F /* bottom right corner */) ||
                (char >= 0x2324 /* up arrowhead between two horizontal bars */ && char <= 0x2328 /* keyboard */) ||
                char === 0x232B /* erase to the left */ ||
                (char >= 0x237D /* shouldered open box */ && char <= 0x239A /* clear screen symbol */) ||
                (char >= 0x23BE /* dentistry symbol light vertical and top right */ && char <= 0x23CD /* square foot */) ||
                char === 0x23CF /* eject symbol */ ||
                (char >= 0x23D1 /* metrical breve */ && char <= 0x23DB /* fuse */) ||
                (char >= 0x23E2 /* white trapezium */ && char <= 0x23FF)) {
                return true;
            }
        }
        if (unicodeBlockLookup['Control Pictures'](char) && char !== 0x2423 /* open box */)
            return true;
        if (unicodeBlockLookup['Optical Character Recognition'](char))
            return true;
        if (unicodeBlockLookup['Enclosed Alphanumerics'](char))
            return true;
        if (unicodeBlockLookup['Geometric Shapes'](char))
            return true;
        if (unicodeBlockLookup['Miscellaneous Symbols'](char)) {
            if (!((char >= 0x261A /* black left pointing index */ && char <= 0x261F) /* white down pointing index */)) {
                return true;
            }
        }
        if (unicodeBlockLookup['Miscellaneous Symbols and Arrows'](char)) {
            if ((char >= 0x2B12 /* square with top half black */ && char <= 0x2B2F /* white vertical ellipse */) ||
                (char >= 0x2B50 /* white medium star */ && char <= 0x2B59 /* heavy circled saltire */) ||
                (char >= 0x2BB8 /* upwards white arrow from bar with horizontal bar */ && char <= 0x2BEB)) {
                return true;
            }
        }
        if (unicodeBlockLookup['CJK Symbols and Punctuation'](char))
            return true;
        if (unicodeBlockLookup['Katakana'](char))
            return true;
        if (unicodeBlockLookup['Private Use Area'](char))
            return true;
        if (unicodeBlockLookup['CJK Compatibility Forms'](char))
            return true;
        if (unicodeBlockLookup['Small Form Variants'](char))
            return true;
        if (unicodeBlockLookup['Halfwidth and Fullwidth Forms'](char))
            return true;
        if (char === 0x221E /* infinity */ ||
            char === 0x2234 /* therefore */ ||
            char === 0x2235 /* because */ ||
            (char >= 0x2700 /* black safety scissors */ && char <= 0x2767 /* rotated floral heart bullet */) ||
            (char >= 0x2776 /* dingbat negative circled digit one */ && char <= 0x2793 /* dingbat negative circled sans-serif number ten */) ||
            char === 0xFFFC /* object replacement character */ ||
            char === 0xFFFD /* replacement character */) {
            return true;
        }
        return false;
    }
    /**
     * Returns true if the given Unicode codepoint identifies a character with
     * rotated orientation.
     *
     * A character has rotated orientation if it is drawn rotated when the line is
     * oriented vertically, even if both adjacent characters are upright. For
     * example, a Latin letter is drawn rotated along a vertical line. A rotated
     * character causes an adjacent “neutral” character to be drawn rotated as well.
     * @private
     */
    function charHasRotatedVerticalOrientation(char) {
        return !(charHasUprightVerticalOrientation(char) ||
            charHasNeutralVerticalOrientation(char));
    }
    function charInComplexShapingScript(char) {
        return unicodeBlockLookup['Arabic'](char) ||
            unicodeBlockLookup['Arabic Supplement'](char) ||
            unicodeBlockLookup['Arabic Extended-A'](char) ||
            unicodeBlockLookup['Arabic Presentation Forms-A'](char) ||
            unicodeBlockLookup['Arabic Presentation Forms-B'](char);
    }
    function charInRTLScript(char) {
        // Main blocks for Hebrew, Arabic, Thaana and other RTL scripts
        return (char >= 0x0590 && char <= 0x08FF) ||
            unicodeBlockLookup['Arabic Presentation Forms-A'](char) ||
            unicodeBlockLookup['Arabic Presentation Forms-B'](char);
    }
    function charInSupportedScript(char, canRenderRTL) {
        // This is a rough heuristic: whether we "can render" a script
        // actually depends on the properties of the font being used
        // and whether differences from the ideal rendering are considered
        // semantically significant.
        // Even in Latin script, we "can't render" combinations such as the fi
        // ligature, but we don't consider that semantically significant.
        if (!canRenderRTL && charInRTLScript(char)) {
            return false;
        }
        if ((char >= 0x0900 && char <= 0x0DFF) ||
            // Main blocks for Indic scripts and Sinhala
            (char >= 0x0F00 && char <= 0x109F) ||
            // Main blocks for Tibetan and Myanmar
            unicodeBlockLookup['Khmer'](char)) {
            // These blocks cover common scripts that require
            // complex text shaping, based on unicode script metadata:
            // http://www.unicode.org/repos/cldr/trunk/common/properties/scriptMetadata.txt
            // where "Web Rank <= 32" "Shaping Required = YES"
            return false;
        }
        return true;
    }
    function stringContainsRTLText(chars) {
        for (const char of chars) {
            if (charInRTLScript(char.charCodeAt(0))) {
                return true;
            }
        }
        return false;
    }
    function isStringInSupportedScript(chars, canRenderRTL) {
        for (const char of chars) {
            if (!charInSupportedScript(char.charCodeAt(0), canRenderRTL)) {
                return false;
            }
        }
        return true;
    }

    typeof performance !== 'undefined' && performance && performance.now ?
        performance.now.bind(performance) :
        Date.now.bind(Date);

    const status = {
        unavailable: 'unavailable',
        deferred: 'deferred',
        loading: 'loading',
        loaded: 'loaded',
        error: 'error'
    };
    //Variables defining the current state of the plugin
    let pluginStatus = status.unavailable;
    let pluginURL = null;
    const getRTLTextPluginStatus = function () {
        return pluginStatus;
    };
    const plugin = {
        applyArabicShaping: null,
        processBidirectionalText: null,
        processStyledBidirectionalText: null,
        isLoaded() {
            return pluginStatus === status.loaded || // Main Thread: loaded if the completion callback returned successfully
                plugin.applyArabicShaping != null; // Web-worker: loaded if the plugin functions have been compiled
        },
        isLoading() {
            return pluginStatus === status.loading;
        },
        setState(state) {
            if (!isWorker())
                throw new Error('Cannot set the state of the rtl-text-plugin when not in the web-worker context');
            pluginStatus = state.pluginStatus;
            pluginURL = state.pluginURL;
        },
        isParsed() {
            if (!isWorker())
                throw new Error('rtl-text-plugin is only parsed on the worker-threads');
            return plugin.applyArabicShaping != null &&
                plugin.processBidirectionalText != null &&
                plugin.processStyledBidirectionalText != null;
        },
        getPluginURL() {
            if (!isWorker())
                throw new Error('rtl-text-plugin url can only be queried from the worker threads');
            return pluginURL;
        }
    };

    class EvaluationParameters {
        // "options" may also be another EvaluationParameters to copy, see CrossFadedProperty.possiblyEvaluate
        constructor(zoom, options) {
            this.zoom = zoom;
            if (options) {
                this.now = options.now;
                this.fadeDuration = options.fadeDuration;
                this.zoomHistory = options.zoomHistory;
                this.transition = options.transition;
            }
            else {
                this.now = 0;
                this.fadeDuration = 0;
                this.zoomHistory = new ZoomHistory();
                this.transition = {};
            }
        }
        isSupportedScript(str) {
            return isStringInSupportedScript(str, plugin.isLoaded());
        }
        crossFadingFactor() {
            if (this.fadeDuration === 0) {
                return 1;
            }
            else {
                return Math.min((this.now - this.zoomHistory.lastIntegerZoomTime) / this.fadeDuration, 1);
            }
        }
        getCrossfadeParameters() {
            const z = this.zoom;
            const fraction = z - Math.floor(z);
            const t = this.crossFadingFactor();
            return z > this.zoomHistory.lastIntegerZoom ?
                { fromScale: 2, toScale: 1, t: fraction + (1 - fraction) * t } :
                { fromScale: 0.5, toScale: 1, t: 1 - (1 - t) * fraction };
        }
    }

    /**
     *  `PropertyValue` represents the value part of a property key-value unit. It's used to represent both
     *  paint and layout property values, and regardless of whether or not their property supports data-driven
     *  expressions.
     *
     *  `PropertyValue` stores the raw input value as seen in a style or a runtime styling API call, i.e. one of the
     *  following:
     *
     *    * A constant value of the type appropriate for the property
     *    * A function which produces a value of that type (but functions are quasi-deprecated in favor of expressions)
     *    * An expression which produces a value of that type
     *    * "undefined"/"not present", in which case the property is assumed to take on its default value.
     *
     *  In addition to storing the original input value, `PropertyValue` also stores a normalized representation,
     *  effectively treating functions as if they are expressions, and constant or default values as if they are
     *  (constant) expressions.
     *
     *  @private
     */
    class PropertyValue {
        constructor(property, value) {
            this.property = property;
            this.value = value;
            this.expression = normalizePropertyExpression(value === undefined ? property.specification.default : value, property.specification);
        }
        isDataDriven() {
            return this.expression.kind === 'source' || this.expression.kind === 'composite';
        }
        possiblyEvaluate(parameters, canonical, availableImages) {
            return this.property.possiblyEvaluate(this, parameters, canonical, availableImages);
        }
    }
    /**
     * Paint properties are _transitionable_: they can change in a fluid manner, interpolating or cross-fading between
     * old and new value. The duration of the transition, and the delay before it begins, is configurable.
     *
     * `TransitionablePropertyValue` is a compositional class that stores both the property value and that transition
     * configuration.
     *
     * A `TransitionablePropertyValue` can calculate the next step in the evaluation chain for paint property values:
     * `TransitioningPropertyValue`.
     *
     * @private
     */
    class TransitionablePropertyValue {
        constructor(property) {
            this.property = property;
            this.value = new PropertyValue(property, undefined);
        }
        transitioned(parameters, prior) {
            return new TransitioningPropertyValue(this.property, this.value, prior, // eslint-disable-line no-use-before-define
            extend$1({}, parameters.transition, this.transition), parameters.now);
        }
        untransitioned() {
            return new TransitioningPropertyValue(this.property, this.value, null, {}, 0); // eslint-disable-line no-use-before-define
        }
    }
    /**
     * `Transitionable` stores a map of all (property name, `TransitionablePropertyValue`) pairs for paint properties of a
     * given layer type. It can calculate the `TransitioningPropertyValue`s for all of them at once, producing a
     * `Transitioning` instance for the same set of properties.
     *
     * @private
     */
    class Transitionable {
        constructor(properties) {
            this._properties = properties;
            this._values = Object.create(properties.defaultTransitionablePropertyValues);
        }
        getValue(name) {
            return clone(this._values[name].value.value);
        }
        setValue(name, value) {
            if (!Object.prototype.hasOwnProperty.call(this._values, name)) {
                this._values[name] = new TransitionablePropertyValue(this._values[name].property);
            }
            // Note that we do not _remove_ an own property in the case where a value is being reset
            // to the default: the transition might still be non-default.
            this._values[name].value = new PropertyValue(this._values[name].property, value === null ? undefined : clone(value));
        }
        getTransition(name) {
            return clone(this._values[name].transition);
        }
        setTransition(name, value) {
            if (!Object.prototype.hasOwnProperty.call(this._values, name)) {
                this._values[name] = new TransitionablePropertyValue(this._values[name].property);
            }
            this._values[name].transition = clone(value) || undefined;
        }
        serialize() {
            const result = {};
            for (const property of Object.keys(this._values)) {
                const value = this.getValue(property);
                if (value !== undefined) {
                    result[property] = value;
                }
                const transition = this.getTransition(property);
                if (transition !== undefined) {
                    result[`${property}-transition`] = transition;
                }
            }
            return result;
        }
        transitioned(parameters, prior) {
            const result = new Transitioning(this._properties); // eslint-disable-line no-use-before-define
            for (const property of Object.keys(this._values)) {
                result._values[property] = this._values[property].transitioned(parameters, prior._values[property]);
            }
            return result;
        }
        untransitioned() {
            const result = new Transitioning(this._properties); // eslint-disable-line no-use-before-define
            for (const property of Object.keys(this._values)) {
                result._values[property] = this._values[property].untransitioned();
            }
            return result;
        }
    }
    // ------- Transitioning -------
    /**
     * `TransitioningPropertyValue` implements the first of two intermediate steps in the evaluation chain of a paint
     * property value. In this step, transitions between old and new values are handled: as long as the transition is in
     * progress, `TransitioningPropertyValue` maintains a reference to the prior value, and interpolates between it and
     * the new value based on the current time and the configured transition duration and delay. The product is the next
     * step in the evaluation chain: the "possibly evaluated" result type `R`. See below for more on this concept.
     *
     * @private
     */
    class TransitioningPropertyValue {
        constructor(property, value, prior, transition, now) {
            this.property = property;
            this.value = value;
            this.begin = now + transition.delay || 0;
            this.end = this.begin + transition.duration || 0;
            if (property.specification.transition && (transition.delay || transition.duration)) {
                this.prior = prior;
            }
        }
        possiblyEvaluate(parameters, canonical, availableImages) {
            const now = parameters.now || 0;
            const finalValue = this.value.possiblyEvaluate(parameters, canonical, availableImages);
            const prior = this.prior;
            if (!prior) {
                // No prior value.
                return finalValue;
            }
            else if (now > this.end) {
                // Transition from prior value is now complete.
                this.prior = null;
                return finalValue;
            }
            else if (this.value.isDataDriven()) {
                // Transitions to data-driven properties are not supported.
                // We snap immediately to the data-driven value so that, when we perform layout,
                // we see the data-driven function and can use it to populate vertex buffers.
                this.prior = null;
                return finalValue;
            }
            else if (now < this.begin) {
                // Transition hasn't started yet.
                return prior.possiblyEvaluate(parameters, canonical, availableImages);
            }
            else {
                // Interpolate between recursively-calculated prior value and final.
                const t = (now - this.begin) / (this.end - this.begin);
                return this.property.interpolate(prior.possiblyEvaluate(parameters, canonical, availableImages), finalValue, easeCubicInOut(t));
            }
        }
    }
    /**
     * `Transitioning` stores a map of all (property name, `TransitioningPropertyValue`) pairs for paint properties of a
     * given layer type. It can calculate the possibly-evaluated values for all of them at once, producing a
     * `PossiblyEvaluated` instance for the same set of properties.
     *
     * @private
     */
    class Transitioning {
        constructor(properties) {
            this._properties = properties;
            this._values = Object.create(properties.defaultTransitioningPropertyValues);
        }
        possiblyEvaluate(parameters, canonical, availableImages) {
            const result = new PossiblyEvaluated(this._properties); // eslint-disable-line no-use-before-define
            for (const property of Object.keys(this._values)) {
                result._values[property] = this._values[property].possiblyEvaluate(parameters, canonical, availableImages);
            }
            return result;
        }
        hasTransition() {
            for (const property of Object.keys(this._values)) {
                if (this._values[property].prior) {
                    return true;
                }
            }
            return false;
        }
    }
    // ------- Layout -------
    /**
     * Because layout properties are not transitionable, they have a simpler representation and evaluation chain than
     * paint properties: `PropertyValue`s are possibly evaluated, producing possibly evaluated values, which are then
     * fully evaluated.
     *
     * `Layout` stores a map of all (property name, `PropertyValue`) pairs for layout properties of a
     * given layer type. It can calculate the possibly-evaluated values for all of them at once, producing a
     * `PossiblyEvaluated` instance for the same set of properties.
     *
     * @private
     */
    class Layout {
        constructor(properties) {
            this._properties = properties;
            this._values = Object.create(properties.defaultPropertyValues);
        }
        getValue(name) {
            return clone(this._values[name].value);
        }
        setValue(name, value) {
            this._values[name] = new PropertyValue(this._values[name].property, value === null ? undefined : clone(value));
        }
        serialize() {
            const result = {};
            for (const property of Object.keys(this._values)) {
                const value = this.getValue(property);
                if (value !== undefined) {
                    result[property] = value;
                }
            }
            return result;
        }
        possiblyEvaluate(parameters, canonical, availableImages) {
            const result = new PossiblyEvaluated(this._properties); // eslint-disable-line no-use-before-define
            for (const property of Object.keys(this._values)) {
                result._values[property] = this._values[property].possiblyEvaluate(parameters, canonical, availableImages);
            }
            return result;
        }
    }
    /**
     * `PossiblyEvaluatedPropertyValue` is used for data-driven paint and layout property values. It holds a
     * `PossiblyEvaluatedValue` and the `GlobalProperties` that were used to generate it. You're not allowed to supply
     * a different set of `GlobalProperties` when performing the final evaluation because they would be ignored in the
     * case where the input value was a constant or camera function.
     *
     * @private
     */
    class PossiblyEvaluatedPropertyValue {
        constructor(property, value, parameters) {
            this.property = property;
            this.value = value;
            this.parameters = parameters;
        }
        isConstant() {
            return this.value.kind === 'constant';
        }
        constantOr(value) {
            if (this.value.kind === 'constant') {
                return this.value.value;
            }
            else {
                return value;
            }
        }
        evaluate(feature, featureState, canonical, availableImages) {
            return this.property.evaluate(this.value, this.parameters, feature, featureState, canonical, availableImages);
        }
    }
    /**
     * `PossiblyEvaluated` stores a map of all (property name, `R`) pairs for paint or layout properties of a
     * given layer type.
     * @private
     */
    class PossiblyEvaluated {
        constructor(properties) {
            this._properties = properties;
            this._values = Object.create(properties.defaultPossiblyEvaluatedValues);
        }
        get(name) {
            return this._values[name];
        }
    }
    /**
     * An implementation of `Property` for properties that do not permit data-driven (source or composite) expressions.
     * This restriction allows us to declare statically that the result of possibly evaluating this kind of property
     * is in fact always the scalar type `T`, and can be used without further evaluating the value on a per-feature basis.
     *
     * @private
     */
    class DataConstantProperty {
        constructor(specification) {
            this.specification = specification;
        }
        possiblyEvaluate(value, parameters) {
            if (value.isDataDriven())
                throw new Error('Value should not be data driven');
            return value.expression.evaluate(parameters);
        }
        interpolate(a, b, t) {
            const interp = interpolate[this.specification.type];
            if (interp) {
                return interp(a, b, t);
            }
            else {
                return a;
            }
        }
    }
    /**
     * An implementation of `Property` for properties that permit data-driven (source or composite) expressions.
     * The result of possibly evaluating this kind of property is `PossiblyEvaluatedPropertyValue<T>`; obtaining
     * a scalar value `T` requires further evaluation on a per-feature basis.
     *
     * @private
     */
    class DataDrivenProperty {
        constructor(specification, overrides) {
            this.specification = specification;
            this.overrides = overrides;
        }
        possiblyEvaluate(value, parameters, canonical, availableImages) {
            if (value.expression.kind === 'constant' || value.expression.kind === 'camera') {
                return new PossiblyEvaluatedPropertyValue(this, { kind: 'constant', value: value.expression.evaluate(parameters, null, {}, canonical, availableImages) }, parameters);
            }
            else {
                return new PossiblyEvaluatedPropertyValue(this, value.expression, parameters);
            }
        }
        interpolate(a, b, t) {
            // If either possibly-evaluated value is non-constant, give up: we aren't able to interpolate data-driven values.
            if (a.value.kind !== 'constant' || b.value.kind !== 'constant') {
                return a;
            }
            // Special case hack solely for fill-outline-color. The undefined value is subsequently handled in
            // FillStyleLayer#recalculate, which sets fill-outline-color to the fill-color value if the former
            // is a PossiblyEvaluatedPropertyValue containing a constant undefined value. In addition to the
            // return value here, the other source of a PossiblyEvaluatedPropertyValue containing a constant
            // undefined value is the "default value" for fill-outline-color held in
            // `Properties#defaultPossiblyEvaluatedValues`, which serves as the prototype of
            // `PossiblyEvaluated#_values`.
            if (a.value.value === undefined || b.value.value === undefined) {
                return new PossiblyEvaluatedPropertyValue(this, { kind: 'constant', value: undefined }, a.parameters);
            }
            const interp = interpolate[this.specification.type];
            if (interp) {
                return new PossiblyEvaluatedPropertyValue(this, { kind: 'constant', value: interp(a.value.value, b.value.value, t) }, a.parameters);
            }
            else {
                return a;
            }
        }
        evaluate(value, parameters, feature, featureState, canonical, availableImages) {
            if (value.kind === 'constant') {
                return value.value;
            }
            else {
                return value.evaluate(parameters, feature, featureState, canonical, availableImages);
            }
        }
    }
    /**
     * An implementation of `Property` for  data driven `line-pattern` which are transitioned by cross-fading
     * rather than interpolation.
     *
     * @private
     */
    class CrossFadedDataDrivenProperty extends DataDrivenProperty {
        possiblyEvaluate(value, parameters, canonical, availableImages) {
            if (value.value === undefined) {
                return new PossiblyEvaluatedPropertyValue(this, { kind: 'constant', value: undefined }, parameters);
            }
            else if (value.expression.kind === 'constant') {
                const evaluatedValue = value.expression.evaluate(parameters, null, {}, canonical, availableImages);
                const isImageExpression = value.property.specification.type === 'resolvedImage';
                const constantValue = isImageExpression && typeof evaluatedValue !== 'string' ? evaluatedValue.name : evaluatedValue;
                const constant = this._calculate(constantValue, constantValue, constantValue, parameters);
                return new PossiblyEvaluatedPropertyValue(this, { kind: 'constant', value: constant }, parameters);
            }
            else if (value.expression.kind === 'camera') {
                const cameraVal = this._calculate(value.expression.evaluate({ zoom: parameters.zoom - 1.0 }), value.expression.evaluate({ zoom: parameters.zoom }), value.expression.evaluate({ zoom: parameters.zoom + 1.0 }), parameters);
                return new PossiblyEvaluatedPropertyValue(this, { kind: 'constant', value: cameraVal }, parameters);
            }
            else {
                // source or composite expression
                return new PossiblyEvaluatedPropertyValue(this, value.expression, parameters);
            }
        }
        evaluate(value, globals, feature, featureState, canonical, availableImages) {
            if (value.kind === 'source') {
                const constant = value.evaluate(globals, feature, featureState, canonical, availableImages);
                return this._calculate(constant, constant, constant, globals);
            }
            else if (value.kind === 'composite') {
                return this._calculate(value.evaluate({ zoom: Math.floor(globals.zoom) - 1.0 }, feature, featureState), value.evaluate({ zoom: Math.floor(globals.zoom) }, feature, featureState), value.evaluate({ zoom: Math.floor(globals.zoom) + 1.0 }, feature, featureState), globals);
            }
            else {
                return value.value;
            }
        }
        _calculate(min, mid, max, parameters) {
            const z = parameters.zoom;
            return z > parameters.zoomHistory.lastIntegerZoom ? { from: min, to: mid } : { from: max, to: mid };
        }
        interpolate(a) {
            return a;
        }
    }
    /**
     * An implementation of `Property` for `*-pattern` and `line-dasharray`, which are transitioned by cross-fading
     * rather than interpolation.
     *
     * @private
     */
    class CrossFadedProperty {
        constructor(specification) {
            this.specification = specification;
        }
        possiblyEvaluate(value, parameters, canonical, availableImages) {
            if (value.value === undefined) {
                return undefined;
            }
            else if (value.expression.kind === 'constant') {
                const constant = value.expression.evaluate(parameters, null, {}, canonical, availableImages);
                return this._calculate(constant, constant, constant, parameters);
            }
            else {
                return this._calculate(value.expression.evaluate(new EvaluationParameters(Math.floor(parameters.zoom - 1.0), parameters)), value.expression.evaluate(new EvaluationParameters(Math.floor(parameters.zoom), parameters)), value.expression.evaluate(new EvaluationParameters(Math.floor(parameters.zoom + 1.0), parameters)), parameters);
            }
        }
        _calculate(min, mid, max, parameters) {
            const z = parameters.zoom;
            return z > parameters.zoomHistory.lastIntegerZoom ? { from: min, to: mid } : { from: max, to: mid };
        }
        interpolate(a) {
            return a;
        }
    }
    /**
     * An implementation of `Property` for `heatmap-color` and `line-gradient`. Interpolation is a no-op, and
     * evaluation returns a boolean value in order to indicate its presence, but the real
     * evaluation happens in StyleLayer classes.
     *
     * @private
     */
    class ColorRampProperty {
        constructor(specification) {
            this.specification = specification;
        }
        possiblyEvaluate(value, parameters, canonical, availableImages) {
            return !!value.expression.evaluate(parameters, null, {}, canonical, availableImages);
        }
        interpolate() { return false; }
    }
    /**
     * `Properties` holds objects containing default values for the layout or paint property set of a given
     * layer type. These objects are immutable, and they are used as the prototypes for the `_values` members of
     * `Transitionable`, `Transitioning`, `Layout`, and `PossiblyEvaluated`. This allows these classes to avoid
     * doing work in the common case where a property has no explicit value set and should be considered to take
     * on the default value: using `for (const property of Object.keys(this._values))`, they can iterate over
     * only the _own_ properties of `_values`, skipping repeated calculation of transitions and possible/final
     * evaluations for defaults, the result of which will always be the same.
     *
     * @private
     */
    class Properties {
        constructor(properties) {
            this.properties = properties;
            this.defaultPropertyValues = {};
            this.defaultTransitionablePropertyValues = {};
            this.defaultTransitioningPropertyValues = {};
            this.defaultPossiblyEvaluatedValues = {};
            this.overridableProperties = [];
            for (const property in properties) {
                const prop = properties[property];
                if (prop.specification.overridable) {
                    this.overridableProperties.push(property);
                }
                const defaultPropertyValue = this.defaultPropertyValues[property] =
                    new PropertyValue(prop, undefined);
                const defaultTransitionablePropertyValue = this.defaultTransitionablePropertyValues[property] =
                    new TransitionablePropertyValue(prop);
                this.defaultTransitioningPropertyValues[property] =
                    defaultTransitionablePropertyValue.untransitioned();
                this.defaultPossiblyEvaluatedValues[property] =
                    defaultPropertyValue.possiblyEvaluate({});
            }
        }
    }
    register('DataDrivenProperty', DataDrivenProperty);
    register('DataConstantProperty', DataConstantProperty);
    register('CrossFadedDataDrivenProperty', CrossFadedDataDrivenProperty);
    register('CrossFadedProperty', CrossFadedProperty);
    register('ColorRampProperty', ColorRampProperty);

    const TRANSITION_SUFFIX = '-transition';
    class StyleLayer extends Evented {
        constructor(layer, properties) {
            super();
            this.id = layer.id;
            this.type = layer.type;
            this._featureFilter = { filter: () => true, needGeometry: false };
            if (layer.type === 'custom')
                return;
            layer = layer;
            this.metadata = layer.metadata;
            this.minzoom = layer.minzoom;
            this.maxzoom = layer.maxzoom;
            if (layer.type !== 'background') {
                this.source = layer.source;
                this.sourceLayer = layer['source-layer'];
                this.filter = layer.filter;
            }
            if (properties.layout) {
                this._unevaluatedLayout = new Layout(properties.layout);
            }
            if (properties.paint) {
                this._transitionablePaint = new Transitionable(properties.paint);
                for (const property in layer.paint) {
                    this.setPaintProperty(property, layer.paint[property], { validate: false });
                }
                for (const property in layer.layout) {
                    this.setLayoutProperty(property, layer.layout[property], { validate: false });
                }
                this._transitioningPaint = this._transitionablePaint.untransitioned();
                //$FlowFixMe
                this.paint = new PossiblyEvaluated(properties.paint);
            }
        }
        getCrossfadeParameters() {
            return this._crossfadeParameters;
        }
        getLayoutProperty(name) {
            if (name === 'visibility') {
                return this.visibility;
            }
            return this._unevaluatedLayout.getValue(name);
        }
        setLayoutProperty(name, value, options = {}) {
            if (value !== null && value !== undefined) {
                const key = `layers.${this.id}.layout.${name}`;
                if (this._validate(validateLayoutProperty, key, name, value, options)) {
                    return;
                }
            }
            if (name === 'visibility') {
                this.visibility = value;
                return;
            }
            this._unevaluatedLayout.setValue(name, value);
        }
        getPaintProperty(name) {
            if (name.endsWith(TRANSITION_SUFFIX)) {
                return this._transitionablePaint.getTransition(name.slice(0, -TRANSITION_SUFFIX.length));
            }
            else {
                return this._transitionablePaint.getValue(name);
            }
        }
        setPaintProperty(name, value, options = {}) {
            if (value !== null && value !== undefined) {
                const key = `layers.${this.id}.paint.${name}`;
                if (this._validate(validatePaintProperty, key, name, value, options)) {
                    return false;
                }
            }
            if (name.endsWith(TRANSITION_SUFFIX)) {
                this._transitionablePaint.setTransition(name.slice(0, -TRANSITION_SUFFIX.length), value || undefined);
                return false;
            }
            else {
                const transitionable = this._transitionablePaint._values[name];
                const isCrossFadedProperty = transitionable.property.specification['property-type'] === 'cross-faded-data-driven';
                const wasDataDriven = transitionable.value.isDataDriven();
                const oldValue = transitionable.value;
                this._transitionablePaint.setValue(name, value);
                this._handleSpecialPaintPropertyUpdate(name);
                const newValue = this._transitionablePaint._values[name].value;
                const isDataDriven = newValue.isDataDriven();
                // if a cross-faded value is changed, we need to make sure the new icons get added to each tile's iconAtlas
                // so a call to _updateLayer is necessary, and we return true from this function so it gets called in
                // Style#setPaintProperty
                return isDataDriven || wasDataDriven || isCrossFadedProperty || this._handleOverridablePaintPropertyUpdate(name, oldValue, newValue);
            }
        }
        _handleSpecialPaintPropertyUpdate(_) {
            // No-op; can be overridden by derived classes.
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _handleOverridablePaintPropertyUpdate(name, oldValue, newValue) {
            // No-op; can be overridden by derived classes.
            return false;
        }
        isHidden(zoom) {
            if (this.minzoom && zoom < this.minzoom)
                return true;
            if (this.maxzoom && zoom >= this.maxzoom)
                return true;
            return this.visibility === 'none';
        }
        updateTransitions(parameters) {
            this._transitioningPaint = this._transitionablePaint.transitioned(parameters, this._transitioningPaint);
        }
        hasTransition() {
            return this._transitioningPaint.hasTransition();
        }
        recalculate(parameters, availableImages) {
            if (parameters.getCrossfadeParameters) {
                this._crossfadeParameters = parameters.getCrossfadeParameters();
            }
            if (this._unevaluatedLayout) {
                this.layout = this._unevaluatedLayout.possiblyEvaluate(parameters, undefined, availableImages);
            }
            this.paint = this._transitioningPaint.possiblyEvaluate(parameters, undefined, availableImages);
        }
        serialize() {
            const output = {
                'id': this.id,
                'type': this.type,
                'source': this.source,
                'source-layer': this.sourceLayer,
                'metadata': this.metadata,
                'minzoom': this.minzoom,
                'maxzoom': this.maxzoom,
                'filter': this.filter,
                'layout': this._unevaluatedLayout && this._unevaluatedLayout.serialize(),
                'paint': this._transitionablePaint && this._transitionablePaint.serialize()
            };
            if (this.visibility) {
                output.layout = output.layout || {};
                output.layout.visibility = this.visibility;
            }
            return filterObject(output, (value, key) => {
                return value !== undefined &&
                    !(key === 'layout' && !Object.keys(value).length) &&
                    !(key === 'paint' && !Object.keys(value).length);
            });
        }
        _validate(validate, key, name, value, options = {}) {
            if (options && options.validate === false) {
                return false;
            }
            return emitValidationErrors(this, validate.call(validateStyle, {
                key,
                layerType: this.type,
                objectKey: name,
                value,
                styleSpec: spec,
                // Workaround for https://github.com/mapbox/mapbox-gl-js/issues/2407
                style: { glyphs: true, sprite: true }
            }));
        }
        is3D() {
            return false;
        }
        isTileClipped() {
            return false;
        }
        hasOffscreenPass() {
            return false;
        }
        resize() {
            // noop
        }
        isStateDependent() {
            for (const property in this.paint._values) {
                const value = this.paint.get(property);
                if (!(value instanceof PossiblyEvaluatedPropertyValue) || !supportsPropertyExpression(value.property.specification)) {
                    continue;
                }
                if ((value.value.kind === 'source' || value.value.kind === 'composite') &&
                    value.value.isStateDependent) {
                    return true;
                }
            }
            return false;
        }
    }

    // Note: all "sizes" are measured in bytes
    const viewTypes = {
        'Int8': Int8Array,
        'Uint8': Uint8Array,
        'Int16': Int16Array,
        'Uint16': Uint16Array,
        'Int32': Int32Array,
        'Uint32': Uint32Array,
        'Float32': Float32Array
    };
    /**
     * @private
     */
    class Struct {
        /**
         * @param {StructArray} structArray The StructArray the struct is stored in
         * @param {number} index The index of the struct in the StructArray.
         * @private
         */
        constructor(structArray, index) {
            this._structArray = structArray;
            this._pos1 = index * this.size;
            this._pos2 = this._pos1 / 2;
            this._pos4 = this._pos1 / 4;
            this._pos8 = this._pos1 / 8;
        }
    }
    const DEFAULT_CAPACITY = 128;
    const RESIZE_MULTIPLIER = 5;
    /**
     * `StructArray` provides an abstraction over `ArrayBuffer` and `TypedArray`
     * making it behave like an array of typed structs.
     *
     * Conceptually, a StructArray is comprised of elements, i.e., instances of its
     * associated struct type. Each particular struct type, together with an
     * alignment size, determines the memory layout of a StructArray whose elements
     * are of that type.  Thus, for each such layout that we need, we have
     * a corrseponding StructArrayLayout class, inheriting from StructArray and
     * implementing `emplaceBack()` and `_refreshViews()`.
     *
     * In some cases, where we need to access particular elements of a StructArray,
     * we implement a more specific subclass that inherits from one of the
     * StructArrayLayouts and adds a `get(i): T` accessor that returns a structured
     * object whose properties are proxies into the underlying memory space for the
     * i-th element.  This affords the convience of working with (seemingly) plain
     * Javascript objects without the overhead of serializing/deserializing them
     * into ArrayBuffers for efficient web worker transfer.
     *
     * @private
     */
    class StructArray {
        constructor() {
            this.isTransferred = false;
            this.capacity = -1;
            this.resize(0);
        }
        /**
         * Serialize a StructArray instance.  Serializes both the raw data and the
         * metadata needed to reconstruct the StructArray base class during
         * deserialization.
         * @private
         */
        static serialize(array, transferables) {
            array._trim();
            if (transferables) {
                array.isTransferred = true;
                transferables.push(array.arrayBuffer);
            }
            return {
                length: array.length,
                arrayBuffer: array.arrayBuffer,
            };
        }
        static deserialize(input) {
            const structArray = Object.create(this.prototype);
            structArray.arrayBuffer = input.arrayBuffer;
            structArray.length = input.length;
            structArray.capacity = input.arrayBuffer.byteLength / structArray.bytesPerElement;
            structArray._refreshViews();
            return structArray;
        }
        /**
         * Resize the array to discard unused capacity.
         */
        _trim() {
            if (this.length !== this.capacity) {
                this.capacity = this.length;
                this.arrayBuffer = this.arrayBuffer.slice(0, this.length * this.bytesPerElement);
                this._refreshViews();
            }
        }
        /**
         * Resets the the length of the array to 0 without de-allocating capcacity.
         */
        clear() {
            this.length = 0;
        }
        /**
         * Resize the array.
         * If `n` is greater than the current length then additional elements with undefined values are added.
         * If `n` is less than the current length then the array will be reduced to the first `n` elements.
         * @param {number} n The new size of the array.
         */
        resize(n) {
            this.reserve(n);
            this.length = n;
        }
        /**
         * Indicate a planned increase in size, so that any necessary allocation may
         * be done once, ahead of time.
         * @param {number} n The expected size of the array.
         */
        reserve(n) {
            if (n > this.capacity) {
                this.capacity = Math.max(n, Math.floor(this.capacity * RESIZE_MULTIPLIER), DEFAULT_CAPACITY);
                this.arrayBuffer = new ArrayBuffer(this.capacity * this.bytesPerElement);
                const oldUint8Array = this.uint8;
                this._refreshViews();
                if (oldUint8Array)
                    this.uint8.set(oldUint8Array);
            }
        }
        /**
         * Create TypedArray views for the current ArrayBuffer.
         */
        _refreshViews() {
            throw new Error('_refreshViews() must be implemented by each concrete StructArray layout');
        }
    }
    /**
     * Given a list of member fields, create a full StructArrayLayout, in
     * particular calculating the correct byte offset for each field.  This data
     * is used at build time to generate StructArrayLayout_*#emplaceBack() and
     * other accessors, and at runtime for binding vertex buffer attributes.
     *
     * @private
     */
    function createLayout(members, alignment = 1) {
        let offset = 0;
        let maxSize = 0;
        const layoutMembers = members.map((member) => {
            const typeSize = sizeOf(member.type);
            const memberOffset = offset = align$1(offset, Math.max(alignment, typeSize));
            const components = member.components || 1;
            maxSize = Math.max(maxSize, typeSize);
            offset += typeSize * components;
            return {
                name: member.name,
                type: member.type,
                components,
                offset: memberOffset,
            };
        });
        const size = align$1(offset, Math.max(maxSize, alignment));
        return {
            members: layoutMembers,
            size,
            alignment
        };
    }
    function sizeOf(type) {
        return viewTypes[type].BYTES_PER_ELEMENT;
    }
    function align$1(offset, size) {
        return Math.ceil(offset / size) * size;
    }

    var pointGeometry = Point$2;

    /**
     * A standalone point geometry with useful accessor, comparison, and
     * modification methods.
     *
     * @class Point
     * @param {Number} x the x-coordinate. this could be longitude or screen
     * pixels, or any other sort of unit.
     * @param {Number} y the y-coordinate. this could be latitude or screen
     * pixels, or any other sort of unit.
     * @example
     * var point = new Point(-77, 38);
     */
    function Point$2(x, y) {
        this.x = x;
        this.y = y;
    }

    Point$2.prototype = {

        /**
         * Clone this point, returning a new point that can be modified
         * without affecting the old one.
         * @return {Point} the clone
         */
        clone: function() { return new Point$2(this.x, this.y); },

        /**
         * Add this point's x & y coordinates to another point,
         * yielding a new point.
         * @param {Point} p the other point
         * @return {Point} output point
         */
        add:     function(p) { return this.clone()._add(p); },

        /**
         * Subtract this point's x & y coordinates to from point,
         * yielding a new point.
         * @param {Point} p the other point
         * @return {Point} output point
         */
        sub:     function(p) { return this.clone()._sub(p); },

        /**
         * Multiply this point's x & y coordinates by point,
         * yielding a new point.
         * @param {Point} p the other point
         * @return {Point} output point
         */
        multByPoint:    function(p) { return this.clone()._multByPoint(p); },

        /**
         * Divide this point's x & y coordinates by point,
         * yielding a new point.
         * @param {Point} p the other point
         * @return {Point} output point
         */
        divByPoint:     function(p) { return this.clone()._divByPoint(p); },

        /**
         * Multiply this point's x & y coordinates by a factor,
         * yielding a new point.
         * @param {Point} k factor
         * @return {Point} output point
         */
        mult:    function(k) { return this.clone()._mult(k); },

        /**
         * Divide this point's x & y coordinates by a factor,
         * yielding a new point.
         * @param {Point} k factor
         * @return {Point} output point
         */
        div:     function(k) { return this.clone()._div(k); },

        /**
         * Rotate this point around the 0, 0 origin by an angle a,
         * given in radians
         * @param {Number} a angle to rotate around, in radians
         * @return {Point} output point
         */
        rotate:  function(a) { return this.clone()._rotate(a); },

        /**
         * Rotate this point around p point by an angle a,
         * given in radians
         * @param {Number} a angle to rotate around, in radians
         * @param {Point} p Point to rotate around
         * @return {Point} output point
         */
        rotateAround:  function(a,p) { return this.clone()._rotateAround(a,p); },

        /**
         * Multiply this point by a 4x1 transformation matrix
         * @param {Array<Number>} m transformation matrix
         * @return {Point} output point
         */
        matMult: function(m) { return this.clone()._matMult(m); },

        /**
         * Calculate this point but as a unit vector from 0, 0, meaning
         * that the distance from the resulting point to the 0, 0
         * coordinate will be equal to 1 and the angle from the resulting
         * point to the 0, 0 coordinate will be the same as before.
         * @return {Point} unit vector point
         */
        unit:    function() { return this.clone()._unit(); },

        /**
         * Compute a perpendicular point, where the new y coordinate
         * is the old x coordinate and the new x coordinate is the old y
         * coordinate multiplied by -1
         * @return {Point} perpendicular point
         */
        perp:    function() { return this.clone()._perp(); },

        /**
         * Return a version of this point with the x & y coordinates
         * rounded to integers.
         * @return {Point} rounded point
         */
        round:   function() { return this.clone()._round(); },

        /**
         * Return the magitude of this point: this is the Euclidean
         * distance from the 0, 0 coordinate to this point's x and y
         * coordinates.
         * @return {Number} magnitude
         */
        mag: function() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        },

        /**
         * Judge whether this point is equal to another point, returning
         * true or false.
         * @param {Point} other the other point
         * @return {boolean} whether the points are equal
         */
        equals: function(other) {
            return this.x === other.x &&
                   this.y === other.y;
        },

        /**
         * Calculate the distance from this point to another point
         * @param {Point} p the other point
         * @return {Number} distance
         */
        dist: function(p) {
            return Math.sqrt(this.distSqr(p));
        },

        /**
         * Calculate the distance from this point to another point,
         * without the square root step. Useful if you're comparing
         * relative distances.
         * @param {Point} p the other point
         * @return {Number} distance
         */
        distSqr: function(p) {
            var dx = p.x - this.x,
                dy = p.y - this.y;
            return dx * dx + dy * dy;
        },

        /**
         * Get the angle from the 0, 0 coordinate to this point, in radians
         * coordinates.
         * @return {Number} angle
         */
        angle: function() {
            return Math.atan2(this.y, this.x);
        },

        /**
         * Get the angle from this point to another point, in radians
         * @param {Point} b the other point
         * @return {Number} angle
         */
        angleTo: function(b) {
            return Math.atan2(this.y - b.y, this.x - b.x);
        },

        /**
         * Get the angle between this point and another point, in radians
         * @param {Point} b the other point
         * @return {Number} angle
         */
        angleWith: function(b) {
            return this.angleWithSep(b.x, b.y);
        },

        /*
         * Find the angle of the two vectors, solving the formula for
         * the cross product a x b = |a||b|sin(θ) for θ.
         * @param {Number} x the x-coordinate
         * @param {Number} y the y-coordinate
         * @return {Number} the angle in radians
         */
        angleWithSep: function(x, y) {
            return Math.atan2(
                this.x * y - this.y * x,
                this.x * x + this.y * y);
        },

        _matMult: function(m) {
            var x = m[0] * this.x + m[1] * this.y,
                y = m[2] * this.x + m[3] * this.y;
            this.x = x;
            this.y = y;
            return this;
        },

        _add: function(p) {
            this.x += p.x;
            this.y += p.y;
            return this;
        },

        _sub: function(p) {
            this.x -= p.x;
            this.y -= p.y;
            return this;
        },

        _mult: function(k) {
            this.x *= k;
            this.y *= k;
            return this;
        },

        _div: function(k) {
            this.x /= k;
            this.y /= k;
            return this;
        },

        _multByPoint: function(p) {
            this.x *= p.x;
            this.y *= p.y;
            return this;
        },

        _divByPoint: function(p) {
            this.x /= p.x;
            this.y /= p.y;
            return this;
        },

        _unit: function() {
            this._div(this.mag());
            return this;
        },

        _perp: function() {
            var y = this.y;
            this.y = this.x;
            this.x = -y;
            return this;
        },

        _rotate: function(angle) {
            var cos = Math.cos(angle),
                sin = Math.sin(angle),
                x = cos * this.x - sin * this.y,
                y = sin * this.x + cos * this.y;
            this.x = x;
            this.y = y;
            return this;
        },

        _rotateAround: function(angle, p) {
            var cos = Math.cos(angle),
                sin = Math.sin(angle),
                x = p.x + cos * (this.x - p.x) - sin * (this.y - p.y),
                y = p.y + sin * (this.x - p.x) + cos * (this.y - p.y);
            this.x = x;
            this.y = y;
            return this;
        },

        _round: function() {
            this.x = Math.round(this.x);
            this.y = Math.round(this.y);
            return this;
        }
    };

    /**
     * Construct a point from an array if necessary, otherwise if the input
     * is already a Point, or an unknown type, return it unchanged
     * @param {Array<Number>|Point|*} a any kind of input value
     * @return {Point} constructed point, or passed-through value.
     * @example
     * // this
     * var point = Point.convert([0, 1]);
     * // is equivalent to
     * var point = new Point(0, 1);
     */
    Point$2.convert = function (a) {
        if (a instanceof Point$2) {
            return a;
        }
        if (Array.isArray(a)) {
            return new Point$2(a[0], a[1]);
        }
        return a;
    };

    // This file is generated. Edit build/generate-struct-arrays.ts, then run `npm run codegen`.
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[2]
     *
     * @private
     */
    class StructArrayLayout2i4 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1);
        }
        emplace(i, v0, v1) {
            const o2 = i * 2;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            return i;
        }
    }
    StructArrayLayout2i4.prototype.bytesPerElement = 4;
    register('StructArrayLayout2i4', StructArrayLayout2i4);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[3]
     *
     * @private
     */
    class StructArrayLayout3i6 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2);
        }
        emplace(i, v0, v1, v2) {
            const o2 = i * 3;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.int16[o2 + 2] = v2;
            return i;
        }
    }
    StructArrayLayout3i6.prototype.bytesPerElement = 6;
    register('StructArrayLayout3i6', StructArrayLayout3i6);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[4]
     *
     * @private
     */
    class StructArrayLayout4i8 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3);
        }
        emplace(i, v0, v1, v2, v3) {
            const o2 = i * 4;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.int16[o2 + 2] = v2;
            this.int16[o2 + 3] = v3;
            return i;
        }
    }
    StructArrayLayout4i8.prototype.bytesPerElement = 8;
    register('StructArrayLayout4i8', StructArrayLayout4i8);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[2]
     * [4]: Int16[4]
     *
     * @private
     */
    class StructArrayLayout2i4i12 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5);
        }
        emplace(i, v0, v1, v2, v3, v4, v5) {
            const o2 = i * 6;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.int16[o2 + 2] = v2;
            this.int16[o2 + 3] = v3;
            this.int16[o2 + 4] = v4;
            this.int16[o2 + 5] = v5;
            return i;
        }
    }
    StructArrayLayout2i4i12.prototype.bytesPerElement = 12;
    register('StructArrayLayout2i4i12', StructArrayLayout2i4i12);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[2]
     * [4]: Uint8[4]
     *
     * @private
     */
    class StructArrayLayout2i4ub8 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5);
        }
        emplace(i, v0, v1, v2, v3, v4, v5) {
            const o2 = i * 4;
            const o1 = i * 8;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.uint8[o1 + 4] = v2;
            this.uint8[o1 + 5] = v3;
            this.uint8[o1 + 6] = v4;
            this.uint8[o1 + 7] = v5;
            return i;
        }
    }
    StructArrayLayout2i4ub8.prototype.bytesPerElement = 8;
    register('StructArrayLayout2i4ub8', StructArrayLayout2i4ub8);
    /**
     * Implementation of the StructArray layout:
     * [0]: Float32[2]
     *
     * @private
     */
    class StructArrayLayout2f8 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1);
        }
        emplace(i, v0, v1) {
            const o4 = i * 2;
            this.float32[o4 + 0] = v0;
            this.float32[o4 + 1] = v1;
            return i;
        }
    }
    StructArrayLayout2f8.prototype.bytesPerElement = 8;
    register('StructArrayLayout2f8', StructArrayLayout2f8);
    /**
     * Implementation of the StructArray layout:
     * [0]: Uint16[10]
     *
     * @private
     */
    class StructArrayLayout10ui20 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5, v6, v7, v8, v9) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9);
        }
        emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9) {
            const o2 = i * 10;
            this.uint16[o2 + 0] = v0;
            this.uint16[o2 + 1] = v1;
            this.uint16[o2 + 2] = v2;
            this.uint16[o2 + 3] = v3;
            this.uint16[o2 + 4] = v4;
            this.uint16[o2 + 5] = v5;
            this.uint16[o2 + 6] = v6;
            this.uint16[o2 + 7] = v7;
            this.uint16[o2 + 8] = v8;
            this.uint16[o2 + 9] = v9;
            return i;
        }
    }
    StructArrayLayout10ui20.prototype.bytesPerElement = 20;
    register('StructArrayLayout10ui20', StructArrayLayout10ui20);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[4]
     * [8]: Uint16[4]
     * [16]: Int16[4]
     *
     * @private
     */
    class StructArrayLayout4i4ui4i24 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11);
        }
        emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11) {
            const o2 = i * 12;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.int16[o2 + 2] = v2;
            this.int16[o2 + 3] = v3;
            this.uint16[o2 + 4] = v4;
            this.uint16[o2 + 5] = v5;
            this.uint16[o2 + 6] = v6;
            this.uint16[o2 + 7] = v7;
            this.int16[o2 + 8] = v8;
            this.int16[o2 + 9] = v9;
            this.int16[o2 + 10] = v10;
            this.int16[o2 + 11] = v11;
            return i;
        }
    }
    StructArrayLayout4i4ui4i24.prototype.bytesPerElement = 24;
    register('StructArrayLayout4i4ui4i24', StructArrayLayout4i4ui4i24);
    /**
     * Implementation of the StructArray layout:
     * [0]: Float32[3]
     *
     * @private
     */
    class StructArrayLayout3f12 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2);
        }
        emplace(i, v0, v1, v2) {
            const o4 = i * 3;
            this.float32[o4 + 0] = v0;
            this.float32[o4 + 1] = v1;
            this.float32[o4 + 2] = v2;
            return i;
        }
    }
    StructArrayLayout3f12.prototype.bytesPerElement = 12;
    register('StructArrayLayout3f12', StructArrayLayout3f12);
    /**
     * Implementation of the StructArray layout:
     * [0]: Uint32[1]
     *
     * @private
     */
    class StructArrayLayout1ul4 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.uint32 = new Uint32Array(this.arrayBuffer);
        }
        emplaceBack(v0) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0);
        }
        emplace(i, v0) {
            const o4 = i * 1;
            this.uint32[o4 + 0] = v0;
            return i;
        }
    }
    StructArrayLayout1ul4.prototype.bytesPerElement = 4;
    register('StructArrayLayout1ul4', StructArrayLayout1ul4);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[6]
     * [12]: Uint32[1]
     * [16]: Uint16[2]
     *
     * @private
     */
    class StructArrayLayout6i1ul2ui20 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
            this.uint32 = new Uint32Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5, v6, v7, v8) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8);
        }
        emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8) {
            const o2 = i * 10;
            const o4 = i * 5;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.int16[o2 + 2] = v2;
            this.int16[o2 + 3] = v3;
            this.int16[o2 + 4] = v4;
            this.int16[o2 + 5] = v5;
            this.uint32[o4 + 3] = v6;
            this.uint16[o2 + 8] = v7;
            this.uint16[o2 + 9] = v8;
            return i;
        }
    }
    StructArrayLayout6i1ul2ui20.prototype.bytesPerElement = 20;
    register('StructArrayLayout6i1ul2ui20', StructArrayLayout6i1ul2ui20);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[2]
     * [4]: Int16[2]
     * [8]: Int16[2]
     *
     * @private
     */
    class StructArrayLayout2i2i2i12 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5);
        }
        emplace(i, v0, v1, v2, v3, v4, v5) {
            const o2 = i * 6;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.int16[o2 + 2] = v2;
            this.int16[o2 + 3] = v3;
            this.int16[o2 + 4] = v4;
            this.int16[o2 + 5] = v5;
            return i;
        }
    }
    StructArrayLayout2i2i2i12.prototype.bytesPerElement = 12;
    register('StructArrayLayout2i2i2i12', StructArrayLayout2i2i2i12);
    /**
     * Implementation of the StructArray layout:
     * [0]: Float32[2]
     * [8]: Float32[1]
     * [12]: Int16[2]
     *
     * @private
     */
    class StructArrayLayout2f1f2i16 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4);
        }
        emplace(i, v0, v1, v2, v3, v4) {
            const o4 = i * 4;
            const o2 = i * 8;
            this.float32[o4 + 0] = v0;
            this.float32[o4 + 1] = v1;
            this.float32[o4 + 2] = v2;
            this.int16[o2 + 6] = v3;
            this.int16[o2 + 7] = v4;
            return i;
        }
    }
    StructArrayLayout2f1f2i16.prototype.bytesPerElement = 16;
    register('StructArrayLayout2f1f2i16', StructArrayLayout2f1f2i16);
    /**
     * Implementation of the StructArray layout:
     * [0]: Uint8[2]
     * [4]: Float32[2]
     *
     * @private
     */
    class StructArrayLayout2ub2f12 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3);
        }
        emplace(i, v0, v1, v2, v3) {
            const o1 = i * 12;
            const o4 = i * 3;
            this.uint8[o1 + 0] = v0;
            this.uint8[o1 + 1] = v1;
            this.float32[o4 + 1] = v2;
            this.float32[o4 + 2] = v3;
            return i;
        }
    }
    StructArrayLayout2ub2f12.prototype.bytesPerElement = 12;
    register('StructArrayLayout2ub2f12', StructArrayLayout2ub2f12);
    /**
     * Implementation of the StructArray layout:
     * [0]: Uint16[3]
     *
     * @private
     */
    class StructArrayLayout3ui6 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2);
        }
        emplace(i, v0, v1, v2) {
            const o2 = i * 3;
            this.uint16[o2 + 0] = v0;
            this.uint16[o2 + 1] = v1;
            this.uint16[o2 + 2] = v2;
            return i;
        }
    }
    StructArrayLayout3ui6.prototype.bytesPerElement = 6;
    register('StructArrayLayout3ui6', StructArrayLayout3ui6);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[2]
     * [4]: Uint16[2]
     * [8]: Uint32[3]
     * [20]: Uint16[3]
     * [28]: Float32[2]
     * [36]: Uint8[3]
     * [40]: Uint32[1]
     * [44]: Int16[1]
     *
     * @private
     */
    class StructArrayLayout2i2ui3ul3ui2f3ub1ul1i48 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
            this.uint32 = new Uint32Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16);
        }
        emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16) {
            const o2 = i * 24;
            const o4 = i * 12;
            const o1 = i * 48;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.uint16[o2 + 2] = v2;
            this.uint16[o2 + 3] = v3;
            this.uint32[o4 + 2] = v4;
            this.uint32[o4 + 3] = v5;
            this.uint32[o4 + 4] = v6;
            this.uint16[o2 + 10] = v7;
            this.uint16[o2 + 11] = v8;
            this.uint16[o2 + 12] = v9;
            this.float32[o4 + 7] = v10;
            this.float32[o4 + 8] = v11;
            this.uint8[o1 + 36] = v12;
            this.uint8[o1 + 37] = v13;
            this.uint8[o1 + 38] = v14;
            this.uint32[o4 + 10] = v15;
            this.int16[o2 + 22] = v16;
            return i;
        }
    }
    StructArrayLayout2i2ui3ul3ui2f3ub1ul1i48.prototype.bytesPerElement = 48;
    register('StructArrayLayout2i2ui3ul3ui2f3ub1ul1i48', StructArrayLayout2i2ui3ul3ui2f3ub1ul1i48);
    /**
     * Implementation of the StructArray layout:
     * [0]: Int16[8]
     * [16]: Uint16[15]
     * [48]: Uint32[1]
     * [52]: Float32[4]
     *
     * @private
     */
    class StructArrayLayout8i15ui1ul4f68 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.int16 = new Int16Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
            this.uint32 = new Uint32Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16, v17, v18, v19, v20, v21, v22, v23, v24, v25, v26, v27) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16, v17, v18, v19, v20, v21, v22, v23, v24, v25, v26, v27);
        }
        emplace(i, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16, v17, v18, v19, v20, v21, v22, v23, v24, v25, v26, v27) {
            const o2 = i * 34;
            const o4 = i * 17;
            this.int16[o2 + 0] = v0;
            this.int16[o2 + 1] = v1;
            this.int16[o2 + 2] = v2;
            this.int16[o2 + 3] = v3;
            this.int16[o2 + 4] = v4;
            this.int16[o2 + 5] = v5;
            this.int16[o2 + 6] = v6;
            this.int16[o2 + 7] = v7;
            this.uint16[o2 + 8] = v8;
            this.uint16[o2 + 9] = v9;
            this.uint16[o2 + 10] = v10;
            this.uint16[o2 + 11] = v11;
            this.uint16[o2 + 12] = v12;
            this.uint16[o2 + 13] = v13;
            this.uint16[o2 + 14] = v14;
            this.uint16[o2 + 15] = v15;
            this.uint16[o2 + 16] = v16;
            this.uint16[o2 + 17] = v17;
            this.uint16[o2 + 18] = v18;
            this.uint16[o2 + 19] = v19;
            this.uint16[o2 + 20] = v20;
            this.uint16[o2 + 21] = v21;
            this.uint16[o2 + 22] = v22;
            this.uint32[o4 + 12] = v23;
            this.float32[o4 + 13] = v24;
            this.float32[o4 + 14] = v25;
            this.float32[o4 + 15] = v26;
            this.float32[o4 + 16] = v27;
            return i;
        }
    }
    StructArrayLayout8i15ui1ul4f68.prototype.bytesPerElement = 68;
    register('StructArrayLayout8i15ui1ul4f68', StructArrayLayout8i15ui1ul4f68);
    /**
     * Implementation of the StructArray layout:
     * [0]: Float32[1]
     *
     * @private
     */
    class StructArrayLayout1f4 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
        }
        emplaceBack(v0) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0);
        }
        emplace(i, v0) {
            const o4 = i * 1;
            this.float32[o4 + 0] = v0;
            return i;
        }
    }
    StructArrayLayout1f4.prototype.bytesPerElement = 4;
    register('StructArrayLayout1f4', StructArrayLayout1f4);
    /**
     * Implementation of the StructArray layout:
     * [0]: Uint32[1]
     * [4]: Uint16[2]
     *
     * @private
     */
    class StructArrayLayout1ul2ui8 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.uint32 = new Uint32Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2);
        }
        emplace(i, v0, v1, v2) {
            const o4 = i * 2;
            const o2 = i * 4;
            this.uint32[o4 + 0] = v0;
            this.uint16[o2 + 2] = v1;
            this.uint16[o2 + 3] = v2;
            return i;
        }
    }
    StructArrayLayout1ul2ui8.prototype.bytesPerElement = 8;
    register('StructArrayLayout1ul2ui8', StructArrayLayout1ul2ui8);
    /**
     * Implementation of the StructArray layout:
     * [0]: Uint16[2]
     *
     * @private
     */
    class StructArrayLayout2ui4 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1);
        }
        emplace(i, v0, v1) {
            const o2 = i * 2;
            this.uint16[o2 + 0] = v0;
            this.uint16[o2 + 1] = v1;
            return i;
        }
    }
    StructArrayLayout2ui4.prototype.bytesPerElement = 4;
    register('StructArrayLayout2ui4', StructArrayLayout2ui4);
    /**
     * Implementation of the StructArray layout:
     * [0]: Uint16[1]
     *
     * @private
     */
    class StructArrayLayout1ui2 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.uint16 = new Uint16Array(this.arrayBuffer);
        }
        emplaceBack(v0) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0);
        }
        emplace(i, v0) {
            const o2 = i * 1;
            this.uint16[o2 + 0] = v0;
            return i;
        }
    }
    StructArrayLayout1ui2.prototype.bytesPerElement = 2;
    register('StructArrayLayout1ui2', StructArrayLayout1ui2);
    /**
     * Implementation of the StructArray layout:
     * [0]: Float32[4]
     *
     * @private
     */
    class StructArrayLayout4f16 extends StructArray {
        _refreshViews() {
            this.uint8 = new Uint8Array(this.arrayBuffer);
            this.float32 = new Float32Array(this.arrayBuffer);
        }
        emplaceBack(v0, v1, v2, v3) {
            const i = this.length;
            this.resize(i + 1);
            return this.emplace(i, v0, v1, v2, v3);
        }
        emplace(i, v0, v1, v2, v3) {
            const o4 = i * 4;
            this.float32[o4 + 0] = v0;
            this.float32[o4 + 1] = v1;
            this.float32[o4 + 2] = v2;
            this.float32[o4 + 3] = v3;
            return i;
        }
    }
    StructArrayLayout4f16.prototype.bytesPerElement = 16;
    register('StructArrayLayout4f16', StructArrayLayout4f16);
    class CollisionBoxStruct extends Struct {
        get anchorPointX() { return this._structArray.int16[this._pos2 + 0]; }
        get anchorPointY() { return this._structArray.int16[this._pos2 + 1]; }
        get x1() { return this._structArray.int16[this._pos2 + 2]; }
        get y1() { return this._structArray.int16[this._pos2 + 3]; }
        get x2() { return this._structArray.int16[this._pos2 + 4]; }
        get y2() { return this._structArray.int16[this._pos2 + 5]; }
        get featureIndex() { return this._structArray.uint32[this._pos4 + 3]; }
        get sourceLayerIndex() { return this._structArray.uint16[this._pos2 + 8]; }
        get bucketIndex() { return this._structArray.uint16[this._pos2 + 9]; }
        get anchorPoint() { return new pointGeometry(this.anchorPointX, this.anchorPointY); }
    }
    CollisionBoxStruct.prototype.size = 20;
    /**
     * @private
     */
    class CollisionBoxArray extends StructArrayLayout6i1ul2ui20 {
        /**
         * Return the CollisionBoxStruct at the given location in the array.
         * @param {number} index The index of the element.
         * @private
         */
        get(index) {
            return new CollisionBoxStruct(this, index);
        }
    }
    register('CollisionBoxArray', CollisionBoxArray);
    class PlacedSymbolStruct extends Struct {
        get anchorX() { return this._structArray.int16[this._pos2 + 0]; }
        get anchorY() { return this._structArray.int16[this._pos2 + 1]; }
        get glyphStartIndex() { return this._structArray.uint16[this._pos2 + 2]; }
        get numGlyphs() { return this._structArray.uint16[this._pos2 + 3]; }
        get vertexStartIndex() { return this._structArray.uint32[this._pos4 + 2]; }
        get lineStartIndex() { return this._structArray.uint32[this._pos4 + 3]; }
        get lineLength() { return this._structArray.uint32[this._pos4 + 4]; }
        get segment() { return this._structArray.uint16[this._pos2 + 10]; }
        get lowerSize() { return this._structArray.uint16[this._pos2 + 11]; }
        get upperSize() { return this._structArray.uint16[this._pos2 + 12]; }
        get lineOffsetX() { return this._structArray.float32[this._pos4 + 7]; }
        get lineOffsetY() { return this._structArray.float32[this._pos4 + 8]; }
        get writingMode() { return this._structArray.uint8[this._pos1 + 36]; }
        get placedOrientation() { return this._structArray.uint8[this._pos1 + 37]; }
        set placedOrientation(x) { this._structArray.uint8[this._pos1 + 37] = x; }
        get hidden() { return this._structArray.uint8[this._pos1 + 38]; }
        set hidden(x) { this._structArray.uint8[this._pos1 + 38] = x; }
        get crossTileID() { return this._structArray.uint32[this._pos4 + 10]; }
        set crossTileID(x) { this._structArray.uint32[this._pos4 + 10] = x; }
        get associatedIconIndex() { return this._structArray.int16[this._pos2 + 22]; }
    }
    PlacedSymbolStruct.prototype.size = 48;
    /**
     * @private
     */
    class PlacedSymbolArray extends StructArrayLayout2i2ui3ul3ui2f3ub1ul1i48 {
        /**
         * Return the PlacedSymbolStruct at the given location in the array.
         * @param {number} index The index of the element.
         * @private
         */
        get(index) {
            return new PlacedSymbolStruct(this, index);
        }
    }
    register('PlacedSymbolArray', PlacedSymbolArray);
    class SymbolInstanceStruct extends Struct {
        get anchorX() { return this._structArray.int16[this._pos2 + 0]; }
        get anchorY() { return this._structArray.int16[this._pos2 + 1]; }
        get rightJustifiedTextSymbolIndex() { return this._structArray.int16[this._pos2 + 2]; }
        get centerJustifiedTextSymbolIndex() { return this._structArray.int16[this._pos2 + 3]; }
        get leftJustifiedTextSymbolIndex() { return this._structArray.int16[this._pos2 + 4]; }
        get verticalPlacedTextSymbolIndex() { return this._structArray.int16[this._pos2 + 5]; }
        get placedIconSymbolIndex() { return this._structArray.int16[this._pos2 + 6]; }
        get verticalPlacedIconSymbolIndex() { return this._structArray.int16[this._pos2 + 7]; }
        get key() { return this._structArray.uint16[this._pos2 + 8]; }
        get textBoxStartIndex() { return this._structArray.uint16[this._pos2 + 9]; }
        get textBoxEndIndex() { return this._structArray.uint16[this._pos2 + 10]; }
        get verticalTextBoxStartIndex() { return this._structArray.uint16[this._pos2 + 11]; }
        get verticalTextBoxEndIndex() { return this._structArray.uint16[this._pos2 + 12]; }
        get iconBoxStartIndex() { return this._structArray.uint16[this._pos2 + 13]; }
        get iconBoxEndIndex() { return this._structArray.uint16[this._pos2 + 14]; }
        get verticalIconBoxStartIndex() { return this._structArray.uint16[this._pos2 + 15]; }
        get verticalIconBoxEndIndex() { return this._structArray.uint16[this._pos2 + 16]; }
        get featureIndex() { return this._structArray.uint16[this._pos2 + 17]; }
        get numHorizontalGlyphVertices() { return this._structArray.uint16[this._pos2 + 18]; }
        get numVerticalGlyphVertices() { return this._structArray.uint16[this._pos2 + 19]; }
        get numIconVertices() { return this._structArray.uint16[this._pos2 + 20]; }
        get numVerticalIconVertices() { return this._structArray.uint16[this._pos2 + 21]; }
        get useRuntimeCollisionCircles() { return this._structArray.uint16[this._pos2 + 22]; }
        get crossTileID() { return this._structArray.uint32[this._pos4 + 12]; }
        set crossTileID(x) { this._structArray.uint32[this._pos4 + 12] = x; }
        get textBoxScale() { return this._structArray.float32[this._pos4 + 13]; }
        get textOffset0() { return this._structArray.float32[this._pos4 + 14]; }
        get textOffset1() { return this._structArray.float32[this._pos4 + 15]; }
        get collisionCircleDiameter() { return this._structArray.float32[this._pos4 + 16]; }
    }
    SymbolInstanceStruct.prototype.size = 68;
    /**
     * @private
     */
    class SymbolInstanceArray extends StructArrayLayout8i15ui1ul4f68 {
        /**
         * Return the SymbolInstanceStruct at the given location in the array.
         * @param {number} index The index of the element.
         * @private
         */
        get(index) {
            return new SymbolInstanceStruct(this, index);
        }
    }
    register('SymbolInstanceArray', SymbolInstanceArray);
    /**
     * @private
     */
    class GlyphOffsetArray extends StructArrayLayout1f4 {
        getoffsetX(index) { return this.float32[index * 1 + 0]; }
    }
    register('GlyphOffsetArray', GlyphOffsetArray);
    /**
     * @private
     */
    class SymbolLineVertexArray extends StructArrayLayout3i6 {
        getx(index) { return this.int16[index * 3 + 0]; }
        gety(index) { return this.int16[index * 3 + 1]; }
        gettileUnitDistanceFromAnchor(index) { return this.int16[index * 3 + 2]; }
    }
    register('SymbolLineVertexArray', SymbolLineVertexArray);
    class FeatureIndexStruct extends Struct {
        get featureIndex() { return this._structArray.uint32[this._pos4 + 0]; }
        get sourceLayerIndex() { return this._structArray.uint16[this._pos2 + 2]; }
        get bucketIndex() { return this._structArray.uint16[this._pos2 + 3]; }
    }
    FeatureIndexStruct.prototype.size = 8;
    /**
     * @private
     */
    class FeatureIndexArray extends StructArrayLayout1ul2ui8 {
        /**
         * Return the FeatureIndexStruct at the given location in the array.
         * @param {number} index The index of the element.
         * @private
         */
        get(index) {
            return new FeatureIndexStruct(this, index);
        }
    }
    register('FeatureIndexArray', FeatureIndexArray);
    class PosArray extends StructArrayLayout2i4 {
    }
    class CircleLayoutArray extends StructArrayLayout2i4 {
    }
    class FillLayoutArray extends StructArrayLayout2i4 {
    }
    class FillExtrusionLayoutArray extends StructArrayLayout2i4i12 {
    }
    class LineLayoutArray extends StructArrayLayout2i4ub8 {
    }
    class LineExtLayoutArray extends StructArrayLayout2f8 {
    }
    class PatternLayoutArray extends StructArrayLayout10ui20 {
    }
    class SymbolLayoutArray extends StructArrayLayout4i4ui4i24 {
    }
    class SymbolDynamicLayoutArray extends StructArrayLayout3f12 {
    }
    class SymbolOpacityArray extends StructArrayLayout1ul4 {
    }
    class CollisionBoxLayoutArray extends StructArrayLayout2i2i2i12 {
    }
    class CollisionVertexArray extends StructArrayLayout2ub2f12 {
    }
    class TriangleIndexArray extends StructArrayLayout3ui6 {
    }
    class LineIndexArray extends StructArrayLayout2ui4 {
    }

    const layout$6 = createLayout([
        { name: 'a_pos', components: 2, type: 'Int16' }
    ], 4);
    const { members: members$4, size: size$4, alignment: alignment$4 } = layout$6;

    class SegmentVector {
        constructor(segments = []) {
            this.segments = segments;
        }
        prepareSegment(numVertices, layoutVertexArray, indexArray, sortKey) {
            let segment = this.segments[this.segments.length - 1];
            if (numVertices > SegmentVector.MAX_VERTEX_ARRAY_LENGTH)
                warnOnce(`Max vertices per segment is ${SegmentVector.MAX_VERTEX_ARRAY_LENGTH}: bucket requested ${numVertices}`);
            if (!segment || segment.vertexLength + numVertices > SegmentVector.MAX_VERTEX_ARRAY_LENGTH || segment.sortKey !== sortKey) {
                segment = {
                    vertexOffset: layoutVertexArray.length,
                    primitiveOffset: indexArray.length,
                    vertexLength: 0,
                    primitiveLength: 0
                };
                if (sortKey !== undefined)
                    segment.sortKey = sortKey;
                this.segments.push(segment);
            }
            return segment;
        }
        get() {
            return this.segments;
        }
        destroy() {
            for (const segment of this.segments) {
                for (const k in segment.vaos) {
                    segment.vaos[k].destroy();
                }
            }
        }
        static simpleSegment(vertexOffset, primitiveOffset, vertexLength, primitiveLength) {
            return new SegmentVector([{
                    vertexOffset,
                    primitiveOffset,
                    vertexLength,
                    primitiveLength,
                    vaos: {},
                    sortKey: 0
                }]);
        }
    }
    /*
     * The maximum size of a vertex array. This limit is imposed by WebGL's 16 bit
     * addressing of vertex buffers.
     * @private
     * @readonly
     */
    SegmentVector.MAX_VERTEX_ARRAY_LENGTH = Math.pow(2, 16) - 1;
    register('SegmentVector', SegmentVector);

    /**
     * Packs two numbers, interpreted as 8-bit unsigned integers, into a single
     * float.  Unpack them in the shader using the `unpack_float()` function,
     * defined in _prelude.vertex.glsl
     *
     * @private
     */
    function packUint8ToFloat(a, b) {
        // coerce a and b to 8-bit ints
        a = clamp(Math.floor(a), 0, 255);
        b = clamp(Math.floor(b), 0, 255);
        return 256 * a + b;
    }

    const patternAttributes = createLayout([
        // [tl.x, tl.y, br.x, br.y]
        { name: 'a_pattern_from', components: 4, type: 'Uint16' },
        { name: 'a_pattern_to', components: 4, type: 'Uint16' },
        { name: 'a_pixel_ratio_from', components: 1, type: 'Uint16' },
        { name: 'a_pixel_ratio_to', components: 1, type: 'Uint16' },
    ]);

    var murmurhashJsExports = {};
    var murmurhashJs = {
      get exports(){ return murmurhashJsExports; },
      set exports(v){ murmurhashJsExports = v; },
    };

    var murmurhash3_gcExports = {};
    var murmurhash3_gc = {
      get exports(){ return murmurhash3_gcExports; },
      set exports(v){ murmurhash3_gcExports = v; },
    };

    /**
     * JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)
     * 
     * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
     * @see http://github.com/garycourt/murmurhash-js
     * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
     * @see http://sites.google.com/site/murmurhash/
     * 
     * @param {string} key ASCII only
     * @param {number} seed Positive integer only
     * @return {number} 32-bit positive integer hash 
     */

    (function (module) {
    	function murmurhash3_32_gc(key, seed) {
    		var remainder, bytes, h1, h1b, c1, c2, k1, i;
    		
    		remainder = key.length & 3; // key.length % 4
    		bytes = key.length - remainder;
    		h1 = seed;
    		c1 = 0xcc9e2d51;
    		c2 = 0x1b873593;
    		i = 0;
    		
    		while (i < bytes) {
    		  	k1 = 
    		  	  ((key.charCodeAt(i) & 0xff)) |
    		  	  ((key.charCodeAt(++i) & 0xff) << 8) |
    		  	  ((key.charCodeAt(++i) & 0xff) << 16) |
    		  	  ((key.charCodeAt(++i) & 0xff) << 24);
    			++i;
    			
    			k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
    			k1 = (k1 << 15) | (k1 >>> 17);
    			k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

    			h1 ^= k1;
    	        h1 = (h1 << 13) | (h1 >>> 19);
    			h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
    			h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
    		}
    		
    		k1 = 0;
    		
    		switch (remainder) {
    			case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    			case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    			case 1: k1 ^= (key.charCodeAt(i) & 0xff);
    			
    			k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
    			k1 = (k1 << 15) | (k1 >>> 17);
    			k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
    			h1 ^= k1;
    		}
    		
    		h1 ^= key.length;

    		h1 ^= h1 >>> 16;
    		h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
    		h1 ^= h1 >>> 13;
    		h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
    		h1 ^= h1 >>> 16;

    		return h1 >>> 0;
    	}

    	{
    	  module.exports = murmurhash3_32_gc;
    	}
    } (murmurhash3_gc));

    var murmurhash2_gcExports = {};
    var murmurhash2_gc = {
      get exports(){ return murmurhash2_gcExports; },
      set exports(v){ murmurhash2_gcExports = v; },
    };

    /**
     * JS Implementation of MurmurHash2
     * 
     * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
     * @see http://github.com/garycourt/murmurhash-js
     * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
     * @see http://sites.google.com/site/murmurhash/
     * 
     * @param {string} str ASCII only
     * @param {number} seed Positive integer only
     * @return {number} 32-bit positive integer hash
     */

    (function (module) {
    	function murmurhash2_32_gc(str, seed) {
    	  var
    	    l = str.length,
    	    h = seed ^ l,
    	    i = 0,
    	    k;
    	  
    	  while (l >= 4) {
    	  	k = 
    	  	  ((str.charCodeAt(i) & 0xff)) |
    	  	  ((str.charCodeAt(++i) & 0xff) << 8) |
    	  	  ((str.charCodeAt(++i) & 0xff) << 16) |
    	  	  ((str.charCodeAt(++i) & 0xff) << 24);
    	    
    	    k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));
    	    k ^= k >>> 24;
    	    k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));

    		h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16)) ^ k;

    	    l -= 4;
    	    ++i;
    	  }
    	  
    	  switch (l) {
    	  case 3: h ^= (str.charCodeAt(i + 2) & 0xff) << 16;
    	  case 2: h ^= (str.charCodeAt(i + 1) & 0xff) << 8;
    	  case 1: h ^= (str.charCodeAt(i) & 0xff);
    	          h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
    	  }

    	  h ^= h >>> 13;
    	  h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
    	  h ^= h >>> 15;

    	  return h >>> 0;
    	}

    	{
    	  module.exports = murmurhash2_32_gc;
    	}
    } (murmurhash2_gc));

    var murmur3 = murmurhash3_gcExports;
    var murmur2 = murmurhash2_gcExports;

    murmurhashJs.exports = murmur3;
    murmurhashJsExports.murmur3 = murmur3;
    murmurhashJsExports.murmur2 = murmur2;

    // A transferable data structure that maps feature ids to their indices and buffer offsets
    class FeaturePositionMap {
        constructor() {
            this.ids = [];
            this.positions = [];
            this.indexed = false;
        }
        add(id, index, start, end) {
            this.ids.push(getNumericId(id));
            this.positions.push(index, start, end);
        }
        getPositions(id) {
            if (!this.indexed)
                throw new Error('Trying to get index, but feature positions are not indexed');
            const intId = getNumericId(id);
            // binary search for the first occurrence of id in this.ids;
            // relies on ids/positions being sorted by id, which happens in serialization
            let i = 0;
            let j = this.ids.length - 1;
            while (i < j) {
                const m = (i + j) >> 1;
                if (this.ids[m] >= intId) {
                    j = m;
                }
                else {
                    i = m + 1;
                }
            }
            const positions = [];
            while (this.ids[i] === intId) {
                const index = this.positions[3 * i];
                const start = this.positions[3 * i + 1];
                const end = this.positions[3 * i + 2];
                positions.push({ index, start, end });
                i++;
            }
            return positions;
        }
        static serialize(map, transferables) {
            const ids = new Float64Array(map.ids);
            const positions = new Uint32Array(map.positions);
            sort(ids, positions, 0, ids.length - 1);
            if (transferables) {
                transferables.push(ids.buffer, positions.buffer);
            }
            return { ids, positions };
        }
        static deserialize(obj) {
            const map = new FeaturePositionMap();
            // after transferring, we only use these arrays statically (no pushes),
            // so TypedArray vs Array distinction that flow points out doesn't matter
            map.ids = obj.ids;
            map.positions = obj.positions;
            map.indexed = true;
            return map;
        }
    }
    function getNumericId(value) {
        const numValue = +value;
        if (!isNaN(numValue) && numValue <= Number.MAX_SAFE_INTEGER) {
            return numValue;
        }
        return murmurhashJsExports(String(value));
    }
    // custom quicksort that sorts ids, indices and offsets together (by ids)
    // uses Hoare partitioning & manual tail call optimization to avoid worst case scenarios
    function sort(ids, positions, left, right) {
        while (left < right) {
            const pivot = ids[(left + right) >> 1];
            let i = left - 1;
            let j = right + 1;
            while (true) {
                do
                    i++;
                while (ids[i] < pivot);
                do
                    j--;
                while (ids[j] > pivot);
                if (i >= j)
                    break;
                swap$1(ids, i, j);
                swap$1(positions, 3 * i, 3 * j);
                swap$1(positions, 3 * i + 1, 3 * j + 1);
                swap$1(positions, 3 * i + 2, 3 * j + 2);
            }
            if (j - left < right - j) {
                sort(ids, positions, left, j);
                left = j + 1;
            }
            else {
                sort(ids, positions, j + 1, right);
                right = j;
            }
        }
    }
    function swap$1(arr, i, j) {
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    register('FeaturePositionMap', FeaturePositionMap);

    class Uniform {
        constructor(context, location) {
            this.gl = context.gl;
            this.location = location;
        }
    }
    class Uniform1f extends Uniform {
        constructor(context, location) {
            super(context, location);
            this.current = 0;
        }
        set(v) {
            if (this.current !== v) {
                this.current = v;
                this.gl.uniform1f(this.location, v);
            }
        }
    }
    class Uniform4f extends Uniform {
        constructor(context, location) {
            super(context, location);
            this.current = [0, 0, 0, 0];
        }
        set(v) {
            if (v[0] !== this.current[0] || v[1] !== this.current[1] ||
                v[2] !== this.current[2] || v[3] !== this.current[3]) {
                this.current = v;
                this.gl.uniform4f(this.location, v[0], v[1], v[2], v[3]);
            }
        }
    }
    class UniformColor extends Uniform {
        constructor(context, location) {
            super(context, location);
            this.current = Color.transparent;
        }
        set(v) {
            if (v.r !== this.current.r || v.g !== this.current.g ||
                v.b !== this.current.b || v.a !== this.current.a) {
                this.current = v;
                this.gl.uniform4f(this.location, v.r, v.g, v.b, v.a);
            }
        }
    }

    function packColor(color) {
        return [
            packUint8ToFloat(255 * color.r, 255 * color.g),
            packUint8ToFloat(255 * color.b, 255 * color.a)
        ];
    }
    class ConstantBinder {
        constructor(value, names, type) {
            this.value = value;
            this.uniformNames = names.map(name => `u_${name}`);
            this.type = type;
        }
        setUniform(uniform, globals, currentValue) {
            uniform.set(currentValue.constantOr(this.value));
        }
        getBinding(context, location, _) {
            return (this.type === 'color') ?
                new UniformColor(context, location) :
                new Uniform1f(context, location);
        }
    }
    class CrossFadedConstantBinder {
        constructor(value, names) {
            this.uniformNames = names.map(name => `u_${name}`);
            this.patternFrom = null;
            this.patternTo = null;
            this.pixelRatioFrom = 1.0;
            this.pixelRatioTo = 1.0;
        }
        setConstantPatternPositions(posTo, posFrom) {
            this.pixelRatioFrom = posFrom.pixelRatio;
            this.pixelRatioTo = posTo.pixelRatio;
            this.patternFrom = posFrom.tlbr;
            this.patternTo = posTo.tlbr;
        }
        setUniform(uniform, globals, currentValue, uniformName) {
            const pos = uniformName === 'u_pattern_to' ? this.patternTo :
                uniformName === 'u_pattern_from' ? this.patternFrom :
                    uniformName === 'u_pixel_ratio_to' ? this.pixelRatioTo :
                        uniformName === 'u_pixel_ratio_from' ? this.pixelRatioFrom : null;
            if (pos)
                uniform.set(pos);
        }
        getBinding(context, location, name) {
            return name.substr(0, 9) === 'u_pattern' ?
                new Uniform4f(context, location) :
                new Uniform1f(context, location);
        }
    }
    class SourceExpressionBinder {
        constructor(expression, names, type, PaintVertexArray) {
            this.expression = expression;
            this.type = type;
            this.maxValue = 0;
            this.paintVertexAttributes = names.map((name) => ({
                name: `a_${name}`,
                type: 'Float32',
                components: type === 'color' ? 2 : 1,
                offset: 0
            }));
            this.paintVertexArray = new PaintVertexArray();
        }
        populatePaintArray(newLength, feature, imagePositions, canonical, formattedSection) {
            const start = this.paintVertexArray.length;
            const value = this.expression.evaluate(new EvaluationParameters(0), feature, {}, canonical, [], formattedSection);
            this.paintVertexArray.resize(newLength);
            this._setPaintValue(start, newLength, value);
        }
        updatePaintArray(start, end, feature, featureState) {
            const value = this.expression.evaluate({ zoom: 0 }, feature, featureState);
            this._setPaintValue(start, end, value);
        }
        _setPaintValue(start, end, value) {
            if (this.type === 'color') {
                const color = packColor(value);
                for (let i = start; i < end; i++) {
                    this.paintVertexArray.emplace(i, color[0], color[1]);
                }
            }
            else {
                for (let i = start; i < end; i++) {
                    this.paintVertexArray.emplace(i, value);
                }
                this.maxValue = Math.max(this.maxValue, Math.abs(value));
            }
        }
        upload(context) {
            if (this.paintVertexArray && this.paintVertexArray.arrayBuffer) {
                if (this.paintVertexBuffer && this.paintVertexBuffer.buffer) {
                    this.paintVertexBuffer.updateData(this.paintVertexArray);
                }
                else {
                    this.paintVertexBuffer = context.createVertexBuffer(this.paintVertexArray, this.paintVertexAttributes, this.expression.isStateDependent);
                }
            }
        }
        destroy() {
            if (this.paintVertexBuffer) {
                this.paintVertexBuffer.destroy();
            }
        }
    }
    class CompositeExpressionBinder {
        constructor(expression, names, type, useIntegerZoom, zoom, PaintVertexArray) {
            this.expression = expression;
            this.uniformNames = names.map(name => `u_${name}_t`);
            this.type = type;
            this.useIntegerZoom = useIntegerZoom;
            this.zoom = zoom;
            this.maxValue = 0;
            this.paintVertexAttributes = names.map((name) => ({
                name: `a_${name}`,
                type: 'Float32',
                components: type === 'color' ? 4 : 2,
                offset: 0
            }));
            this.paintVertexArray = new PaintVertexArray();
        }
        populatePaintArray(newLength, feature, imagePositions, canonical, formattedSection) {
            const min = this.expression.evaluate(new EvaluationParameters(this.zoom), feature, {}, canonical, [], formattedSection);
            const max = this.expression.evaluate(new EvaluationParameters(this.zoom + 1), feature, {}, canonical, [], formattedSection);
            const start = this.paintVertexArray.length;
            this.paintVertexArray.resize(newLength);
            this._setPaintValue(start, newLength, min, max);
        }
        updatePaintArray(start, end, feature, featureState) {
            const min = this.expression.evaluate({ zoom: this.zoom }, feature, featureState);
            const max = this.expression.evaluate({ zoom: this.zoom + 1 }, feature, featureState);
            this._setPaintValue(start, end, min, max);
        }
        _setPaintValue(start, end, min, max) {
            if (this.type === 'color') {
                const minColor = packColor(min);
                const maxColor = packColor(max);
                for (let i = start; i < end; i++) {
                    this.paintVertexArray.emplace(i, minColor[0], minColor[1], maxColor[0], maxColor[1]);
                }
            }
            else {
                for (let i = start; i < end; i++) {
                    this.paintVertexArray.emplace(i, min, max);
                }
                this.maxValue = Math.max(this.maxValue, Math.abs(min), Math.abs(max));
            }
        }
        upload(context) {
            if (this.paintVertexArray && this.paintVertexArray.arrayBuffer) {
                if (this.paintVertexBuffer && this.paintVertexBuffer.buffer) {
                    this.paintVertexBuffer.updateData(this.paintVertexArray);
                }
                else {
                    this.paintVertexBuffer = context.createVertexBuffer(this.paintVertexArray, this.paintVertexAttributes, this.expression.isStateDependent);
                }
            }
        }
        destroy() {
            if (this.paintVertexBuffer) {
                this.paintVertexBuffer.destroy();
            }
        }
        setUniform(uniform, globals) {
            const currentZoom = this.useIntegerZoom ? Math.floor(globals.zoom) : globals.zoom;
            const factor = clamp(this.expression.interpolationFactor(currentZoom, this.zoom, this.zoom + 1), 0, 1);
            uniform.set(factor);
        }
        getBinding(context, location, _) {
            return new Uniform1f(context, location);
        }
    }
    class CrossFadedCompositeBinder {
        constructor(expression, type, useIntegerZoom, zoom, PaintVertexArray, layerId) {
            this.expression = expression;
            this.type = type;
            this.useIntegerZoom = useIntegerZoom;
            this.zoom = zoom;
            this.layerId = layerId;
            this.zoomInPaintVertexArray = new PaintVertexArray();
            this.zoomOutPaintVertexArray = new PaintVertexArray();
        }
        populatePaintArray(length, feature, imagePositions) {
            const start = this.zoomInPaintVertexArray.length;
            this.zoomInPaintVertexArray.resize(length);
            this.zoomOutPaintVertexArray.resize(length);
            this._setPaintValues(start, length, feature.patterns && feature.patterns[this.layerId], imagePositions);
        }
        updatePaintArray(start, end, feature, featureState, imagePositions) {
            this._setPaintValues(start, end, feature.patterns && feature.patterns[this.layerId], imagePositions);
        }
        _setPaintValues(start, end, patterns, positions) {
            if (!positions || !patterns)
                return;
            const { min, mid, max } = patterns;
            const imageMin = positions[min];
            const imageMid = positions[mid];
            const imageMax = positions[max];
            if (!imageMin || !imageMid || !imageMax)
                return;
            // We populate two paint arrays because, for cross-faded properties, we don't know which direction
            // we're cross-fading to at layout time. In order to keep vertex attributes to a minimum and not pass
            // unnecessary vertex data to the shaders, we determine which to upload at draw time.
            for (let i = start; i < end; i++) {
                this.zoomInPaintVertexArray.emplace(i, imageMid.tl[0], imageMid.tl[1], imageMid.br[0], imageMid.br[1], imageMin.tl[0], imageMin.tl[1], imageMin.br[0], imageMin.br[1], imageMid.pixelRatio, imageMin.pixelRatio);
                this.zoomOutPaintVertexArray.emplace(i, imageMid.tl[0], imageMid.tl[1], imageMid.br[0], imageMid.br[1], imageMax.tl[0], imageMax.tl[1], imageMax.br[0], imageMax.br[1], imageMid.pixelRatio, imageMax.pixelRatio);
            }
        }
        upload(context) {
            if (this.zoomInPaintVertexArray && this.zoomInPaintVertexArray.arrayBuffer && this.zoomOutPaintVertexArray && this.zoomOutPaintVertexArray.arrayBuffer) {
                this.zoomInPaintVertexBuffer = context.createVertexBuffer(this.zoomInPaintVertexArray, patternAttributes.members, this.expression.isStateDependent);
                this.zoomOutPaintVertexBuffer = context.createVertexBuffer(this.zoomOutPaintVertexArray, patternAttributes.members, this.expression.isStateDependent);
            }
        }
        destroy() {
            if (this.zoomOutPaintVertexBuffer)
                this.zoomOutPaintVertexBuffer.destroy();
            if (this.zoomInPaintVertexBuffer)
                this.zoomInPaintVertexBuffer.destroy();
        }
    }
    /**
     * ProgramConfiguration contains the logic for binding style layer properties and tile
     * layer feature data into GL program uniforms and vertex attributes.
     *
     * Non-data-driven property values are bound to shader uniforms. Data-driven property
     * values are bound to vertex attributes. In order to support a uniform GLSL syntax over
     * both, [Mapbox GL Shaders](https://github.com/mapbox/mapbox-gl-shaders) defines a `#pragma`
     * abstraction, which ProgramConfiguration is responsible for implementing. At runtime,
     * it examines the attributes of a particular layer, combines this with fixed knowledge
     * about how layers of the particular type are implemented, and determines which uniforms
     * and vertex attributes will be required. It can then substitute the appropriate text
     * into the shader source code, create and link a program, and bind the uniforms and
     * vertex attributes in preparation for drawing.
     *
     * When a vector tile is parsed, this same configuration information is used to
     * populate the attribute buffers needed for data-driven styling using the zoom
     * level and feature property data.
     *
     * @private
     */
    class ProgramConfiguration {
        constructor(layer, zoom, filterProperties) {
            this.binders = {};
            this._buffers = [];
            const keys = [];
            for (const property in layer.paint._values) {
                if (!filterProperties(property))
                    continue;
                const value = layer.paint.get(property);
                if (!(value instanceof PossiblyEvaluatedPropertyValue) || !supportsPropertyExpression(value.property.specification)) {
                    continue;
                }
                const names = paintAttributeNames(property, layer.type);
                const expression = value.value;
                const type = value.property.specification.type;
                const useIntegerZoom = value.property.useIntegerZoom;
                const propType = value.property.specification['property-type'];
                const isCrossFaded = propType === 'cross-faded' || propType === 'cross-faded-data-driven';
                if (expression.kind === 'constant') {
                    this.binders[property] = isCrossFaded ?
                        new CrossFadedConstantBinder(expression.value, names) :
                        new ConstantBinder(expression.value, names, type);
                    keys.push(`/u_${property}`);
                }
                else if (expression.kind === 'source' || isCrossFaded) {
                    const StructArrayLayout = layoutType(property, type, 'source');
                    this.binders[property] = isCrossFaded ?
                        new CrossFadedCompositeBinder(expression, type, useIntegerZoom, zoom, StructArrayLayout, layer.id) :
                        new SourceExpressionBinder(expression, names, type, StructArrayLayout);
                    keys.push(`/a_${property}`);
                }
                else {
                    const StructArrayLayout = layoutType(property, type, 'composite');
                    this.binders[property] = new CompositeExpressionBinder(expression, names, type, useIntegerZoom, zoom, StructArrayLayout);
                    keys.push(`/z_${property}`);
                }
            }
            this.cacheKey = keys.sort().join('');
        }
        getMaxValue(property) {
            const binder = this.binders[property];
            return binder instanceof SourceExpressionBinder || binder instanceof CompositeExpressionBinder ? binder.maxValue : 0;
        }
        populatePaintArrays(newLength, feature, imagePositions, canonical, formattedSection) {
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof SourceExpressionBinder || binder instanceof CompositeExpressionBinder || binder instanceof CrossFadedCompositeBinder)
                    binder.populatePaintArray(newLength, feature, imagePositions, canonical, formattedSection);
            }
        }
        setConstantPatternPositions(posTo, posFrom) {
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof CrossFadedConstantBinder)
                    binder.setConstantPatternPositions(posTo, posFrom);
            }
        }
        updatePaintArrays(featureStates, featureMap, vtLayer, layer, imagePositions) {
            let dirty = false;
            for (const id in featureStates) {
                const positions = featureMap.getPositions(id);
                for (const pos of positions) {
                    const feature = vtLayer.feature(pos.index);
                    for (const property in this.binders) {
                        const binder = this.binders[property];
                        if ((binder instanceof SourceExpressionBinder || binder instanceof CompositeExpressionBinder ||
                            binder instanceof CrossFadedCompositeBinder) && binder.expression.isStateDependent === true) {
                            //AHM: Remove after https://github.com/mapbox/mapbox-gl-js/issues/6255
                            const value = layer.paint.get(property);
                            binder.expression = value.value;
                            binder.updatePaintArray(pos.start, pos.end, feature, featureStates[id], imagePositions);
                            dirty = true;
                        }
                    }
                }
            }
            return dirty;
        }
        defines() {
            const result = [];
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof ConstantBinder || binder instanceof CrossFadedConstantBinder) {
                    result.push(...binder.uniformNames.map(name => `#define HAS_UNIFORM_${name}`));
                }
            }
            return result;
        }
        getBinderAttributes() {
            const result = [];
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof SourceExpressionBinder || binder instanceof CompositeExpressionBinder) {
                    for (let i = 0; i < binder.paintVertexAttributes.length; i++) {
                        result.push(binder.paintVertexAttributes[i].name);
                    }
                }
                else if (binder instanceof CrossFadedCompositeBinder) {
                    for (let i = 0; i < patternAttributes.members.length; i++) {
                        result.push(patternAttributes.members[i].name);
                    }
                }
            }
            return result;
        }
        getBinderUniforms() {
            const uniforms = [];
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof ConstantBinder || binder instanceof CrossFadedConstantBinder || binder instanceof CompositeExpressionBinder) {
                    for (const uniformName of binder.uniformNames) {
                        uniforms.push(uniformName);
                    }
                }
            }
            return uniforms;
        }
        getPaintVertexBuffers() {
            return this._buffers;
        }
        getUniforms(context, locations) {
            const uniforms = [];
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof ConstantBinder || binder instanceof CrossFadedConstantBinder || binder instanceof CompositeExpressionBinder) {
                    for (const name of binder.uniformNames) {
                        if (locations[name]) {
                            const binding = binder.getBinding(context, locations[name], name);
                            uniforms.push({ name, property, binding });
                        }
                    }
                }
            }
            return uniforms;
        }
        setUniforms(context, binderUniforms, properties, globals) {
            // Uniform state bindings are owned by the Program, but we set them
            // from within the ProgramConfiguraton's binder members.
            for (const { name, property, binding } of binderUniforms) {
                this.binders[property].setUniform(binding, globals, properties.get(property), name);
            }
        }
        updatePaintBuffers(crossfade) {
            this._buffers = [];
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (crossfade && binder instanceof CrossFadedCompositeBinder) {
                    const patternVertexBuffer = crossfade.fromScale === 2 ? binder.zoomInPaintVertexBuffer : binder.zoomOutPaintVertexBuffer;
                    if (patternVertexBuffer)
                        this._buffers.push(patternVertexBuffer);
                }
                else if ((binder instanceof SourceExpressionBinder || binder instanceof CompositeExpressionBinder) && binder.paintVertexBuffer) {
                    this._buffers.push(binder.paintVertexBuffer);
                }
            }
        }
        upload(context) {
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof SourceExpressionBinder || binder instanceof CompositeExpressionBinder || binder instanceof CrossFadedCompositeBinder)
                    binder.upload(context);
            }
            this.updatePaintBuffers();
        }
        destroy() {
            for (const property in this.binders) {
                const binder = this.binders[property];
                if (binder instanceof SourceExpressionBinder || binder instanceof CompositeExpressionBinder || binder instanceof CrossFadedCompositeBinder)
                    binder.destroy();
            }
        }
    }
    class ProgramConfigurationSet {
        constructor(layers, zoom, filterProperties = () => true) {
            this.programConfigurations = {};
            for (const layer of layers) {
                this.programConfigurations[layer.id] = new ProgramConfiguration(layer, zoom, filterProperties);
            }
            this.needsUpload = false;
            this._featureMap = new FeaturePositionMap();
            this._bufferOffset = 0;
        }
        populatePaintArrays(length, feature, index, imagePositions, canonical, formattedSection) {
            for (const key in this.programConfigurations) {
                this.programConfigurations[key].populatePaintArrays(length, feature, imagePositions, canonical, formattedSection);
            }
            if (feature.id !== undefined) {
                this._featureMap.add(feature.id, index, this._bufferOffset, length);
            }
            this._bufferOffset = length;
            this.needsUpload = true;
        }
        updatePaintArrays(featureStates, vtLayer, layers, imagePositions) {
            for (const layer of layers) {
                this.needsUpload = this.programConfigurations[layer.id].updatePaintArrays(featureStates, this._featureMap, vtLayer, layer, imagePositions) || this.needsUpload;
            }
        }
        get(layerId) {
            return this.programConfigurations[layerId];
        }
        upload(context) {
            if (!this.needsUpload)
                return;
            for (const layerId in this.programConfigurations) {
                this.programConfigurations[layerId].upload(context);
            }
            this.needsUpload = false;
        }
        destroy() {
            for (const layerId in this.programConfigurations) {
                this.programConfigurations[layerId].destroy();
            }
        }
    }
    function paintAttributeNames(property, type) {
        const attributeNameExceptions = {
            'text-opacity': ['opacity'],
            'icon-opacity': ['opacity'],
            'text-color': ['fill_color'],
            'icon-color': ['fill_color'],
            'text-halo-color': ['halo_color'],
            'icon-halo-color': ['halo_color'],
            'text-halo-blur': ['halo_blur'],
            'icon-halo-blur': ['halo_blur'],
            'text-halo-width': ['halo_width'],
            'icon-halo-width': ['halo_width'],
            'line-gap-width': ['gapwidth'],
            'line-pattern': ['pattern_to', 'pattern_from', 'pixel_ratio_to', 'pixel_ratio_from'],
            'fill-pattern': ['pattern_to', 'pattern_from', 'pixel_ratio_to', 'pixel_ratio_from'],
            'fill-extrusion-pattern': ['pattern_to', 'pattern_from', 'pixel_ratio_to', 'pixel_ratio_from'],
        };
        return attributeNameExceptions[property] || [property.replace(`${type}-`, '').replace(/-/g, '_')];
    }
    function getLayoutException(property) {
        const propertyExceptions = {
            'line-pattern': {
                'source': PatternLayoutArray,
                'composite': PatternLayoutArray
            },
            'fill-pattern': {
                'source': PatternLayoutArray,
                'composite': PatternLayoutArray
            },
            'fill-extrusion-pattern': {
                'source': PatternLayoutArray,
                'composite': PatternLayoutArray
            }
        };
        return propertyExceptions[property];
    }
    function layoutType(property, type, binderType) {
        const defaultLayouts = {
            'color': {
                'source': StructArrayLayout2f8,
                'composite': StructArrayLayout4f16
            },
            'number': {
                'source': StructArrayLayout1f4,
                'composite': StructArrayLayout2f8
            }
        };
        const layoutException = getLayoutException(property);
        return layoutException && layoutException[binderType] || defaultLayouts[type][binderType];
    }
    register('ConstantBinder', ConstantBinder);
    register('CrossFadedConstantBinder', CrossFadedConstantBinder);
    register('SourceExpressionBinder', SourceExpressionBinder);
    register('CrossFadedCompositeBinder', CrossFadedCompositeBinder);
    register('CompositeExpressionBinder', CompositeExpressionBinder);
    register('ProgramConfiguration', ProgramConfiguration, { omit: ['_buffers'] });
    register('ProgramConfigurationSet', ProgramConfigurationSet);

    /**
     * The maximum value of a coordinate in the internal tile coordinate system. Coordinates of
     * all source features normalized to this extent upon load.
     *
     * The value is a consequence of the following:
     *
     * * Vertex buffer store positions as signed 16 bit integers.
     * * One bit is lost for signedness to support tile buffers.
     * * One bit is lost because the line vertex buffer used to pack 1 bit of other data into the int.
     * * One bit is lost to support features extending past the extent on the right edge of the tile.
     * * This leaves us with 2^13 = 8192
     *
     * @private
     * @readonly
     */
    var EXTENT = 8192;

    // These bounds define the minimum and maximum supported coordinate values.
    // While visible coordinates are within [0, EXTENT], tiles may theoretically
    // contain cordinates within [-Infinity, Infinity]. Our range is limited by the
    // number of bits used to represent the coordinate.
    const BITS = 15;
    const MAX = Math.pow(2, BITS - 1) - 1;
    const MIN = -MAX - 1;
    /**
     * Loads a geometry from a VectorTileFeature and scales it to the common extent
     * used internally.
     * @param {VectorTileFeature} feature
     * @private
     */
    function loadGeometry(feature) {
        const scale = EXTENT / feature.extent;
        const geometry = feature.loadGeometry();
        for (let r = 0; r < geometry.length; r++) {
            const ring = geometry[r];
            for (let p = 0; p < ring.length; p++) {
                const point = ring[p];
                // round here because mapbox-gl-native uses integers to represent
                // points and we need to do the same to avoid renering differences.
                const x = Math.round(point.x * scale);
                const y = Math.round(point.y * scale);
                point.x = clamp(x, MIN, MAX);
                point.y = clamp(y, MIN, MAX);
                if (x < point.x || x > point.x + 1 || y < point.y || y > point.y + 1) {
                    // warn when exceeding allowed extent except for the 1-px-off case
                    // https://github.com/mapbox/mapbox-gl-js/issues/8992
                    warnOnce('Geometry exceeds allowed extent, reduce your vector tile buffer size');
                }
            }
        }
        return geometry;
    }

    /**
     * Construct a new feature based on a VectorTileFeature for expression evaluation, the geometry of which
     * will be loaded based on necessity.
     * @param {VectorTileFeature} feature
     * @param {boolean} needGeometry
     * @private
     */
    function toEvaluationFeature(feature, needGeometry) {
        return { type: feature.type,
            id: feature.id,
            properties: feature.properties,
            geometry: needGeometry ? loadGeometry(feature) : [] };
    }

    function addCircleVertex(layoutVertexArray, x, y, extrudeX, extrudeY) {
        layoutVertexArray.emplaceBack((x * 2) + ((extrudeX + 1) / 2), (y * 2) + ((extrudeY + 1) / 2));
    }
    /**
     * Circles are represented by two triangles.
     *
     * Each corner has a pos that is the center of the circle and an extrusion
     * vector that is where it points.
     * @private
     */
    class CircleBucket {
        constructor(options) {
            this.zoom = options.zoom;
            this.overscaling = options.overscaling;
            this.layers = options.layers;
            this.layerIds = this.layers.map(layer => layer.id);
            this.index = options.index;
            this.hasPattern = false;
            this.layoutVertexArray = new CircleLayoutArray();
            this.indexArray = new TriangleIndexArray();
            this.segments = new SegmentVector();
            this.programConfigurations = new ProgramConfigurationSet(options.layers, options.zoom);
            this.stateDependentLayerIds = this.layers.filter((l) => l.isStateDependent()).map((l) => l.id);
        }
        populate(features, options, canonical) {
            const styleLayer = this.layers[0];
            const bucketFeatures = [];
            let circleSortKey = null;
            let sortFeaturesByKey = false;
            // Heatmap layers are handled in this bucket and have no evaluated properties, so we check our access
            if (styleLayer.type === 'circle') {
                circleSortKey = styleLayer.layout.get('circle-sort-key');
                sortFeaturesByKey = !circleSortKey.isConstant();
            }
            for (const { feature, id, index, sourceLayerIndex } of features) {
                const needGeometry = this.layers[0]._featureFilter.needGeometry;
                const evaluationFeature = toEvaluationFeature(feature, needGeometry);
                if (!this.layers[0]._featureFilter.filter(new EvaluationParameters(this.zoom), evaluationFeature, canonical))
                    continue;
                const sortKey = sortFeaturesByKey ?
                    circleSortKey.evaluate(evaluationFeature, {}, canonical) :
                    undefined;
                const bucketFeature = {
                    id,
                    properties: feature.properties,
                    type: feature.type,
                    sourceLayerIndex,
                    index,
                    geometry: needGeometry ? evaluationFeature.geometry : loadGeometry(feature),
                    patterns: {},
                    sortKey
                };
                bucketFeatures.push(bucketFeature);
            }
            if (sortFeaturesByKey) {
                bucketFeatures.sort((a, b) => a.sortKey - b.sortKey);
            }
            for (const bucketFeature of bucketFeatures) {
                const { geometry, index, sourceLayerIndex } = bucketFeature;
                const feature = features[index].feature;
                this.addFeature(bucketFeature, geometry, index, canonical);
                options.featureIndex.insert(feature, geometry, index, sourceLayerIndex, this.index);
            }
        }
        update(states, vtLayer, imagePositions) {
            if (!this.stateDependentLayers.length)
                return;
            this.programConfigurations.updatePaintArrays(states, vtLayer, this.stateDependentLayers, imagePositions);
        }
        isEmpty() {
            return this.layoutVertexArray.length === 0;
        }
        uploadPending() {
            return !this.uploaded || this.programConfigurations.needsUpload;
        }
        upload(context) {
            if (!this.uploaded) {
                this.layoutVertexBuffer = context.createVertexBuffer(this.layoutVertexArray, members$4);
                this.indexBuffer = context.createIndexBuffer(this.indexArray);
            }
            this.programConfigurations.upload(context);
            this.uploaded = true;
        }
        destroy() {
            if (!this.layoutVertexBuffer)
                return;
            this.layoutVertexBuffer.destroy();
            this.indexBuffer.destroy();
            this.programConfigurations.destroy();
            this.segments.destroy();
        }
        addFeature(feature, geometry, index, canonical) {
            for (const ring of geometry) {
                for (const point of ring) {
                    const x = point.x;
                    const y = point.y;
                    // Do not include points that are outside the tile boundaries.
                    if (x < 0 || x >= EXTENT || y < 0 || y >= EXTENT)
                        continue;
                    // this geometry will be of the Point type, and we'll derive
                    // two triangles from it.
                    //
                    // ┌─────────┐
                    // │ 3     2 │
                    // │         │
                    // │ 0     1 │
                    // └─────────┘
                    const segment = this.segments.prepareSegment(4, this.layoutVertexArray, this.indexArray, feature.sortKey);
                    const index = segment.vertexLength;
                    addCircleVertex(this.layoutVertexArray, x, y, -1, -1);
                    addCircleVertex(this.layoutVertexArray, x, y, 1, -1);
                    addCircleVertex(this.layoutVertexArray, x, y, 1, 1);
                    addCircleVertex(this.layoutVertexArray, x, y, -1, 1);
                    this.indexArray.emplaceBack(index, index + 1, index + 2);
                    this.indexArray.emplaceBack(index, index + 3, index + 2);
                    segment.vertexLength += 4;
                    segment.primitiveLength += 2;
                }
            }
            this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length, feature, index, {}, canonical);
        }
    }
    register('CircleBucket', CircleBucket, { omit: ['layers'] });

    function polygonIntersectsPolygon(polygonA, polygonB) {
        for (let i = 0; i < polygonA.length; i++) {
            if (polygonContainsPoint(polygonB, polygonA[i]))
                return true;
        }
        for (let i = 0; i < polygonB.length; i++) {
            if (polygonContainsPoint(polygonA, polygonB[i]))
                return true;
        }
        if (lineIntersectsLine(polygonA, polygonB))
            return true;
        return false;
    }
    function polygonIntersectsBufferedPoint(polygon, point, radius) {
        if (polygonContainsPoint(polygon, point))
            return true;
        if (pointIntersectsBufferedLine(point, polygon, radius))
            return true;
        return false;
    }
    function polygonIntersectsMultiPolygon(polygon, multiPolygon) {
        if (polygon.length === 1) {
            return multiPolygonContainsPoint(multiPolygon, polygon[0]);
        }
        for (let m = 0; m < multiPolygon.length; m++) {
            const ring = multiPolygon[m];
            for (let n = 0; n < ring.length; n++) {
                if (polygonContainsPoint(polygon, ring[n]))
                    return true;
            }
        }
        for (let i = 0; i < polygon.length; i++) {
            if (multiPolygonContainsPoint(multiPolygon, polygon[i]))
                return true;
        }
        for (let k = 0; k < multiPolygon.length; k++) {
            if (lineIntersectsLine(polygon, multiPolygon[k]))
                return true;
        }
        return false;
    }
    function polygonIntersectsBufferedMultiLine(polygon, multiLine, radius) {
        for (let i = 0; i < multiLine.length; i++) {
            const line = multiLine[i];
            if (polygon.length >= 3) {
                for (let k = 0; k < line.length; k++) {
                    if (polygonContainsPoint(polygon, line[k]))
                        return true;
                }
            }
            if (lineIntersectsBufferedLine(polygon, line, radius))
                return true;
        }
        return false;
    }
    function lineIntersectsBufferedLine(lineA, lineB, radius) {
        if (lineA.length > 1) {
            if (lineIntersectsLine(lineA, lineB))
                return true;
            // Check whether any point in either line is within radius of the other line
            for (let j = 0; j < lineB.length; j++) {
                if (pointIntersectsBufferedLine(lineB[j], lineA, radius))
                    return true;
            }
        }
        for (let k = 0; k < lineA.length; k++) {
            if (pointIntersectsBufferedLine(lineA[k], lineB, radius))
                return true;
        }
        return false;
    }
    function lineIntersectsLine(lineA, lineB) {
        if (lineA.length === 0 || lineB.length === 0)
            return false;
        for (let i = 0; i < lineA.length - 1; i++) {
            const a0 = lineA[i];
            const a1 = lineA[i + 1];
            for (let j = 0; j < lineB.length - 1; j++) {
                const b0 = lineB[j];
                const b1 = lineB[j + 1];
                if (lineSegmentIntersectsLineSegment(a0, a1, b0, b1))
                    return true;
            }
        }
        return false;
    }
    function lineSegmentIntersectsLineSegment(a0, a1, b0, b1) {
        return isCounterClockwise(a0, b0, b1) !== isCounterClockwise(a1, b0, b1) &&
            isCounterClockwise(a0, a1, b0) !== isCounterClockwise(a0, a1, b1);
    }
    function pointIntersectsBufferedLine(p, line, radius) {
        const radiusSquared = radius * radius;
        if (line.length === 1)
            return p.distSqr(line[0]) < radiusSquared;
        for (let i = 1; i < line.length; i++) {
            // Find line segments that have a distance <= radius^2 to p
            // In that case, we treat the line as "containing point p".
            const v = line[i - 1], w = line[i];
            if (distToSegmentSquared(p, v, w) < radiusSquared)
                return true;
        }
        return false;
    }
    // Code from http://stackoverflow.com/a/1501725/331379.
    function distToSegmentSquared(p, v, w) {
        const l2 = v.distSqr(w);
        if (l2 === 0)
            return p.distSqr(v);
        const t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        if (t < 0)
            return p.distSqr(v);
        if (t > 1)
            return p.distSqr(w);
        return p.distSqr(w.sub(v)._mult(t)._add(v));
    }
    // point in polygon ray casting algorithm
    function multiPolygonContainsPoint(rings, p) {
        let c = false, ring, p1, p2;
        for (let k = 0; k < rings.length; k++) {
            ring = rings[k];
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                p1 = ring[i];
                p2 = ring[j];
                if (((p1.y > p.y) !== (p2.y > p.y)) && (p.x < (p2.x - p1.x) * (p.y - p1.y) / (p2.y - p1.y) + p1.x)) {
                    c = !c;
                }
            }
        }
        return c;
    }
    function polygonContainsPoint(ring, p) {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const p1 = ring[i];
            const p2 = ring[j];
            if (((p1.y > p.y) !== (p2.y > p.y)) && (p.x < (p2.x - p1.x) * (p.y - p1.y) / (p2.y - p1.y) + p1.x)) {
                c = !c;
            }
        }
        return c;
    }
    function polygonIntersectsBox(ring, boxX1, boxY1, boxX2, boxY2) {
        for (const p of ring) {
            if (boxX1 <= p.x &&
                boxY1 <= p.y &&
                boxX2 >= p.x &&
                boxY2 >= p.y)
                return true;
        }
        const corners = [
            new pointGeometry(boxX1, boxY1),
            new pointGeometry(boxX1, boxY2),
            new pointGeometry(boxX2, boxY2),
            new pointGeometry(boxX2, boxY1)
        ];
        if (ring.length > 2) {
            for (const corner of corners) {
                if (polygonContainsPoint(ring, corner))
                    return true;
            }
        }
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];
            if (edgeIntersectsBox(p1, p2, corners))
                return true;
        }
        return false;
    }
    function edgeIntersectsBox(e1, e2, corners) {
        const tl = corners[0];
        const br = corners[2];
        // the edge and box do not intersect in either the x or y dimensions
        if (((e1.x < tl.x) && (e2.x < tl.x)) ||
            ((e1.x > br.x) && (e2.x > br.x)) ||
            ((e1.y < tl.y) && (e2.y < tl.y)) ||
            ((e1.y > br.y) && (e2.y > br.y)))
            return false;
        // check if all corners of the box are on the same side of the edge
        const dir = isCounterClockwise(e1, e2, corners[0]);
        return dir !== isCounterClockwise(e1, e2, corners[1]) ||
            dir !== isCounterClockwise(e1, e2, corners[2]) ||
            dir !== isCounterClockwise(e1, e2, corners[3]);
    }

    function getMaximumPaintValue(property, layer, bucket) {
        const value = layer.paint.get(property).value;
        if (value.kind === 'constant') {
            return value.value;
        }
        else {
            return bucket.programConfigurations.get(layer.id).getMaxValue(property);
        }
    }
    function translateDistance(translate) {
        return Math.sqrt(translate[0] * translate[0] + translate[1] * translate[1]);
    }
    function translate(queryGeometry, translate, translateAnchor, bearing, pixelsToTileUnits) {
        if (!translate[0] && !translate[1]) {
            return queryGeometry;
        }
        const pt = pointGeometry.convert(translate)._mult(pixelsToTileUnits);
        if (translateAnchor === 'viewport') {
            pt._rotate(-bearing);
        }
        const translated = [];
        for (let i = 0; i < queryGeometry.length; i++) {
            const point = queryGeometry[i];
            translated.push(point.sub(pt));
        }
        return translated;
    }
    function offsetLine(rings, offset) {
        const newRings = [];
        for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
            const ring = rings[ringIndex];
            const newRing = [];
            for (let index = 0; index < ring.length; index++) {
                const a = ring[index - 1];
                const b = ring[index];
                const c = ring[index + 1];
                const aToB = index === 0 ? new pointGeometry(0, 0) : b.sub(a)._unit()._perp();
                const bToC = index === ring.length - 1 ? new pointGeometry(0, 0) : c.sub(b)._unit()._perp();
                const extrude = aToB._add(bToC)._unit();
                const cosHalfAngle = extrude.x * bToC.x + extrude.y * bToC.y;
                if (cosHalfAngle !== 0) {
                    extrude._mult(1 / cosHalfAngle);
                }
                newRing.push(extrude._mult(offset)._add(b));
            }
            newRings.push(newRing);
        }
        return newRings;
    }

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const layout$5 = new Properties({
        "circle-sort-key": new DataDrivenProperty(spec["layout_circle"]["circle-sort-key"]),
    });
    const paint$8 = new Properties({
        "circle-radius": new DataDrivenProperty(spec["paint_circle"]["circle-radius"]),
        "circle-color": new DataDrivenProperty(spec["paint_circle"]["circle-color"]),
        "circle-blur": new DataDrivenProperty(spec["paint_circle"]["circle-blur"]),
        "circle-opacity": new DataDrivenProperty(spec["paint_circle"]["circle-opacity"]),
        "circle-translate": new DataConstantProperty(spec["paint_circle"]["circle-translate"]),
        "circle-translate-anchor": new DataConstantProperty(spec["paint_circle"]["circle-translate-anchor"]),
        "circle-pitch-scale": new DataConstantProperty(spec["paint_circle"]["circle-pitch-scale"]),
        "circle-pitch-alignment": new DataConstantProperty(spec["paint_circle"]["circle-pitch-alignment"]),
        "circle-stroke-width": new DataDrivenProperty(spec["paint_circle"]["circle-stroke-width"]),
        "circle-stroke-color": new DataDrivenProperty(spec["paint_circle"]["circle-stroke-color"]),
        "circle-stroke-opacity": new DataDrivenProperty(spec["paint_circle"]["circle-stroke-opacity"]),
    });
    var properties$8 = { paint: paint$8, layout: layout$5 };

    /**
     * Common utilities
     * @module glMatrix
     */
    // Configuration Constants
    var EPSILON = 0.000001;
    var ARRAY_TYPE = typeof Float32Array !== 'undefined' ? Float32Array : Array;
    if (!Math.hypot) Math.hypot = function () {
      var y = 0,
          i = arguments.length;

      while (i--) {
        y += arguments[i] * arguments[i];
      }

      return Math.sqrt(y);
    };

    /**
     * 3x3 Matrix
     * @module mat3
     */

    /**
     * Creates a new identity mat3
     *
     * @returns {mat3} a new 3x3 matrix
     */

    function create$4() {
      var out = new ARRAY_TYPE(9);

      if (ARRAY_TYPE != Float32Array) {
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[5] = 0;
        out[6] = 0;
        out[7] = 0;
      }

      out[0] = 1;
      out[4] = 1;
      out[8] = 1;
      return out;
    }

    /**
     * Set a mat4 to the identity matrix
     *
     * @param {mat4} out the receiving matrix
     * @returns {mat4} out
     */

    function identity(out) {
      out[0] = 1;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = 1;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = 1;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }

    /**
     * 3 Dimensional Vector
     * @module vec3
     */

    /**
     * Creates a new, empty vec3
     *
     * @returns {vec3} a new 3D vector
     */

    function create$3() {
      var out = new ARRAY_TYPE(3);

      if (ARRAY_TYPE != Float32Array) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
      }

      return out;
    }
    /**
     * Calculates the length of a vec3
     *
     * @param {ReadonlyVec3} a vector to calculate length of
     * @returns {Number} length of a
     */

    function length(a) {
      var x = a[0];
      var y = a[1];
      var z = a[2];
      return Math.hypot(x, y, z);
    }
    /**
     * Creates a new vec3 initialized with the given values
     *
     * @param {Number} x X component
     * @param {Number} y Y component
     * @param {Number} z Z component
     * @returns {vec3} a new 3D vector
     */

    function fromValues(x, y, z) {
      var out = new ARRAY_TYPE(3);
      out[0] = x;
      out[1] = y;
      out[2] = z;
      return out;
    }
    /**
     * Normalize a vec3
     *
     * @param {vec3} out the receiving vector
     * @param {ReadonlyVec3} a vector to normalize
     * @returns {vec3} out
     */

    function normalize$2(out, a) {
      var x = a[0];
      var y = a[1];
      var z = a[2];
      var len = x * x + y * y + z * z;

      if (len > 0) {
        //TODO: evaluate use of glm_invsqrt here?
        len = 1 / Math.sqrt(len);
      }

      out[0] = a[0] * len;
      out[1] = a[1] * len;
      out[2] = a[2] * len;
      return out;
    }
    /**
     * Calculates the dot product of two vec3's
     *
     * @param {ReadonlyVec3} a the first operand
     * @param {ReadonlyVec3} b the second operand
     * @returns {Number} dot product of a and b
     */

    function dot$1(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    /**
     * Computes the cross product of two vec3's
     *
     * @param {vec3} out the receiving vector
     * @param {ReadonlyVec3} a the first operand
     * @param {ReadonlyVec3} b the second operand
     * @returns {vec3} out
     */

    function cross(out, a, b) {
      var ax = a[0],
          ay = a[1],
          az = a[2];
      var bx = b[0],
          by = b[1],
          bz = b[2];
      out[0] = ay * bz - az * by;
      out[1] = az * bx - ax * bz;
      out[2] = ax * by - ay * bx;
      return out;
    }
    /**
     * Alias for {@link vec3.length}
     * @function
     */

    var len = length;
    /**
     * Perform some operation over an array of vec3s.
     *
     * @param {Array} a the array of vectors to iterate over
     * @param {Number} stride Number of elements between the start of each vec3. If 0 assumes tightly packed
     * @param {Number} offset Number of elements to skip at the beginning of the array
     * @param {Number} count Number of vec3s to iterate over. If 0 iterates over entire array
     * @param {Function} fn Function to call for each vector in the array
     * @param {Object} [arg] additional argument to pass to fn
     * @returns {Array} a
     * @function
     */

    (function () {
      var vec = create$3();
      return function (a, stride, offset, count, fn, arg) {
        var i, l;

        if (!stride) {
          stride = 3;
        }

        if (!offset) {
          offset = 0;
        }

        if (count) {
          l = Math.min(count * stride + offset, a.length);
        } else {
          l = a.length;
        }

        for (i = offset; i < l; i += stride) {
          vec[0] = a[i];
          vec[1] = a[i + 1];
          vec[2] = a[i + 2];
          fn(vec, vec, arg);
          a[i] = vec[0];
          a[i + 1] = vec[1];
          a[i + 2] = vec[2];
        }

        return a;
      };
    })();

    /**
     * 4 Dimensional Vector
     * @module vec4
     */

    /**
     * Creates a new, empty vec4
     *
     * @returns {vec4} a new 4D vector
     */

    function create$2() {
      var out = new ARRAY_TYPE(4);

      if (ARRAY_TYPE != Float32Array) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
      }

      return out;
    }
    /**
     * Normalize a vec4
     *
     * @param {vec4} out the receiving vector
     * @param {ReadonlyVec4} a vector to normalize
     * @returns {vec4} out
     */

    function normalize$1(out, a) {
      var x = a[0];
      var y = a[1];
      var z = a[2];
      var w = a[3];
      var len = x * x + y * y + z * z + w * w;

      if (len > 0) {
        len = 1 / Math.sqrt(len);
      }

      out[0] = x * len;
      out[1] = y * len;
      out[2] = z * len;
      out[3] = w * len;
      return out;
    }
    /**
     * Transforms the vec4 with a mat4.
     *
     * @param {vec4} out the receiving vector
     * @param {ReadonlyVec4} a the vector to transform
     * @param {ReadonlyMat4} m matrix to transform with
     * @returns {vec4} out
     */

    function transformMat4(out, a, m) {
      var x = a[0],
          y = a[1],
          z = a[2],
          w = a[3];
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
      out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
      return out;
    }
    /**
     * Perform some operation over an array of vec4s.
     *
     * @param {Array} a the array of vectors to iterate over
     * @param {Number} stride Number of elements between the start of each vec4. If 0 assumes tightly packed
     * @param {Number} offset Number of elements to skip at the beginning of the array
     * @param {Number} count Number of vec4s to iterate over. If 0 iterates over entire array
     * @param {Function} fn Function to call for each vector in the array
     * @param {Object} [arg] additional argument to pass to fn
     * @returns {Array} a
     * @function
     */

    (function () {
      var vec = create$2();
      return function (a, stride, offset, count, fn, arg) {
        var i, l;

        if (!stride) {
          stride = 4;
        }

        if (!offset) {
          offset = 0;
        }

        if (count) {
          l = Math.min(count * stride + offset, a.length);
        } else {
          l = a.length;
        }

        for (i = offset; i < l; i += stride) {
          vec[0] = a[i];
          vec[1] = a[i + 1];
          vec[2] = a[i + 2];
          vec[3] = a[i + 3];
          fn(vec, vec, arg);
          a[i] = vec[0];
          a[i + 1] = vec[1];
          a[i + 2] = vec[2];
          a[i + 3] = vec[3];
        }

        return a;
      };
    })();

    /**
     * Quaternion
     * @module quat
     */

    /**
     * Creates a new identity quat
     *
     * @returns {quat} a new quaternion
     */

    function create$1() {
      var out = new ARRAY_TYPE(4);

      if (ARRAY_TYPE != Float32Array) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
      }

      out[3] = 1;
      return out;
    }
    /**
     * Sets a quat from the given angle and rotation axis,
     * then returns it.
     *
     * @param {quat} out the receiving quaternion
     * @param {ReadonlyVec3} axis the axis around which to rotate
     * @param {Number} rad the angle in radians
     * @returns {quat} out
     **/

    function setAxisAngle(out, axis, rad) {
      rad = rad * 0.5;
      var s = Math.sin(rad);
      out[0] = s * axis[0];
      out[1] = s * axis[1];
      out[2] = s * axis[2];
      out[3] = Math.cos(rad);
      return out;
    }
    /**
     * Performs a spherical linear interpolation between two quat
     *
     * @param {quat} out the receiving quaternion
     * @param {ReadonlyQuat} a the first operand
     * @param {ReadonlyQuat} b the second operand
     * @param {Number} t interpolation amount, in the range [0-1], between the two inputs
     * @returns {quat} out
     */

    function slerp(out, a, b, t) {
      // benchmarks:
      //    http://jsperf.com/quaternion-slerp-implementations
      var ax = a[0],
          ay = a[1],
          az = a[2],
          aw = a[3];
      var bx = b[0],
          by = b[1],
          bz = b[2],
          bw = b[3];
      var omega, cosom, sinom, scale0, scale1; // calc cosine

      cosom = ax * bx + ay * by + az * bz + aw * bw; // adjust signs (if necessary)

      if (cosom < 0.0) {
        cosom = -cosom;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
      } // calculate coefficients


      if (1.0 - cosom > EPSILON) {
        // standard case (slerp)
        omega = Math.acos(cosom);
        sinom = Math.sin(omega);
        scale0 = Math.sin((1.0 - t) * omega) / sinom;
        scale1 = Math.sin(t * omega) / sinom;
      } else {
        // "from" and "to" quaternions are very close
        //  ... so we can do a linear interpolation
        scale0 = 1.0 - t;
        scale1 = t;
      } // calculate final values


      out[0] = scale0 * ax + scale1 * bx;
      out[1] = scale0 * ay + scale1 * by;
      out[2] = scale0 * az + scale1 * bz;
      out[3] = scale0 * aw + scale1 * bw;
      return out;
    }
    /**
     * Creates a quaternion from the given 3x3 rotation matrix.
     *
     * NOTE: The resultant quaternion is not normalized, so you should be sure
     * to renormalize the quaternion yourself where necessary.
     *
     * @param {quat} out the receiving quaternion
     * @param {ReadonlyMat3} m rotation matrix
     * @returns {quat} out
     * @function
     */

    function fromMat3(out, m) {
      // Algorithm in Ken Shoemake's article in 1987 SIGGRAPH course notes
      // article "Quaternion Calculus and Fast Animation".
      var fTrace = m[0] + m[4] + m[8];
      var fRoot;

      if (fTrace > 0.0) {
        // |w| > 1/2, may as well choose w > 1/2
        fRoot = Math.sqrt(fTrace + 1.0); // 2w

        out[3] = 0.5 * fRoot;
        fRoot = 0.5 / fRoot; // 1/(4w)

        out[0] = (m[5] - m[7]) * fRoot;
        out[1] = (m[6] - m[2]) * fRoot;
        out[2] = (m[1] - m[3]) * fRoot;
      } else {
        // |w| <= 1/2
        var i = 0;
        if (m[4] > m[0]) i = 1;
        if (m[8] > m[i * 3 + i]) i = 2;
        var j = (i + 1) % 3;
        var k = (i + 2) % 3;
        fRoot = Math.sqrt(m[i * 3 + i] - m[j * 3 + j] - m[k * 3 + k] + 1.0);
        out[i] = 0.5 * fRoot;
        fRoot = 0.5 / fRoot;
        out[3] = (m[j * 3 + k] - m[k * 3 + j]) * fRoot;
        out[j] = (m[j * 3 + i] + m[i * 3 + j]) * fRoot;
        out[k] = (m[k * 3 + i] + m[i * 3 + k]) * fRoot;
      }

      return out;
    }
    /**
     * Normalize a quat
     *
     * @param {quat} out the receiving quaternion
     * @param {ReadonlyQuat} a quaternion to normalize
     * @returns {quat} out
     * @function
     */

    var normalize = normalize$1;
    /**
     * Sets a quaternion to represent the shortest rotation from one
     * vector to another.
     *
     * Both vectors are assumed to be unit length.
     *
     * @param {quat} out the receiving quaternion.
     * @param {ReadonlyVec3} a the initial vector
     * @param {ReadonlyVec3} b the destination vector
     * @returns {quat} out
     */

    (function () {
      var tmpvec3 = create$3();
      var xUnitVec3 = fromValues(1, 0, 0);
      var yUnitVec3 = fromValues(0, 1, 0);
      return function (out, a, b) {
        var dot = dot$1(a, b);

        if (dot < -0.999999) {
          cross(tmpvec3, xUnitVec3, a);
          if (len(tmpvec3) < 0.000001) cross(tmpvec3, yUnitVec3, a);
          normalize$2(tmpvec3, tmpvec3);
          setAxisAngle(out, tmpvec3, Math.PI);
          return out;
        } else if (dot > 0.999999) {
          out[0] = 0;
          out[1] = 0;
          out[2] = 0;
          out[3] = 1;
          return out;
        } else {
          cross(tmpvec3, a, b);
          out[0] = tmpvec3[0];
          out[1] = tmpvec3[1];
          out[2] = tmpvec3[2];
          out[3] = 1 + dot;
          return normalize(out, out);
        }
      };
    })();
    /**
     * Performs a spherical linear interpolation with two control points
     *
     * @param {quat} out the receiving quaternion
     * @param {ReadonlyQuat} a the first operand
     * @param {ReadonlyQuat} b the second operand
     * @param {ReadonlyQuat} c the third operand
     * @param {ReadonlyQuat} d the fourth operand
     * @param {Number} t interpolation amount, in the range [0-1], between the two inputs
     * @returns {quat} out
     */

    (function () {
      var temp1 = create$1();
      var temp2 = create$1();
      return function (out, a, b, c, d, t) {
        slerp(temp1, a, d, t);
        slerp(temp2, b, c, t);
        slerp(out, temp1, temp2, 2 * t * (1 - t));
        return out;
      };
    })();
    /**
     * Sets the specified quaternion with values corresponding to the given
     * axes. Each axis is a vec3 and is expected to be unit length and
     * perpendicular to all other specified axes.
     *
     * @param {ReadonlyVec3} view  the vector representing the viewing direction
     * @param {ReadonlyVec3} right the vector representing the local "right" direction
     * @param {ReadonlyVec3} up    the vector representing the local "up" direction
     * @returns {quat} out
     */

    (function () {
      var matr = create$4();
      return function (out, view, right, up) {
        matr[0] = right[0];
        matr[3] = right[1];
        matr[6] = right[2];
        matr[1] = up[0];
        matr[4] = up[1];
        matr[7] = up[2];
        matr[2] = -view[0];
        matr[5] = -view[1];
        matr[8] = -view[2];
        return normalize(out, fromMat3(out, matr));
      };
    })();

    /**
     * 2 Dimensional Vector
     * @module vec2
     */

    /**
     * Creates a new, empty vec2
     *
     * @returns {vec2} a new 2D vector
     */

    function create() {
      var out = new ARRAY_TYPE(2);

      if (ARRAY_TYPE != Float32Array) {
        out[0] = 0;
        out[1] = 0;
      }

      return out;
    }
    /**
     * Perform some operation over an array of vec2s.
     *
     * @param {Array} a the array of vectors to iterate over
     * @param {Number} stride Number of elements between the start of each vec2. If 0 assumes tightly packed
     * @param {Number} offset Number of elements to skip at the beginning of the array
     * @param {Number} count Number of vec2s to iterate over. If 0 iterates over entire array
     * @param {Function} fn Function to call for each vector in the array
     * @param {Object} [arg] additional argument to pass to fn
     * @returns {Array} a
     * @function
     */

    (function () {
      var vec = create();
      return function (a, stride, offset, count, fn, arg) {
        var i, l;

        if (!stride) {
          stride = 2;
        }

        if (!offset) {
          offset = 0;
        }

        if (count) {
          l = Math.min(count * stride + offset, a.length);
        } else {
          l = a.length;
        }

        for (i = offset; i < l; i += stride) {
          vec[0] = a[i];
          vec[1] = a[i + 1];
          fn(vec, vec, arg);
          a[i] = vec[0];
          a[i + 1] = vec[1];
        }

        return a;
      };
    })();

    class CircleStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties$8);
        }
        createBucket(parameters) {
            return new CircleBucket(parameters);
        }
        queryRadius(bucket) {
            const circleBucket = bucket;
            return getMaximumPaintValue('circle-radius', this, circleBucket) +
                getMaximumPaintValue('circle-stroke-width', this, circleBucket) +
                translateDistance(this.paint.get('circle-translate'));
        }
        queryIntersectsFeature(queryGeometry, feature, featureState, geometry, zoom, transform, pixelsToTileUnits, pixelPosMatrix) {
            const translatedPolygon = translate(queryGeometry, this.paint.get('circle-translate'), this.paint.get('circle-translate-anchor'), transform.angle, pixelsToTileUnits);
            const radius = this.paint.get('circle-radius').evaluate(feature, featureState);
            const stroke = this.paint.get('circle-stroke-width').evaluate(feature, featureState);
            const size = radius + stroke;
            // For pitch-alignment: map, compare feature geometry to query geometry in the plane of the tile
            // // Otherwise, compare geometry in the plane of the viewport
            // // A circle with fixed scaling relative to the viewport gets larger in tile space as it moves into the distance
            // // A circle with fixed scaling relative to the map gets smaller in viewport space as it moves into the distance
            const alignWithMap = this.paint.get('circle-pitch-alignment') === 'map';
            const transformedPolygon = alignWithMap ? translatedPolygon : projectQueryGeometry$1(translatedPolygon, pixelPosMatrix);
            const transformedSize = alignWithMap ? size * pixelsToTileUnits : size;
            for (const ring of geometry) {
                for (const point of ring) {
                    const transformedPoint = alignWithMap ? point : projectPoint(point, pixelPosMatrix);
                    let adjustedSize = transformedSize;
                    const projectedCenter = transformMat4([], [point.x, point.y, 0, 1], pixelPosMatrix);
                    if (this.paint.get('circle-pitch-scale') === 'viewport' && this.paint.get('circle-pitch-alignment') === 'map') {
                        adjustedSize *= projectedCenter[3] / transform.cameraToCenterDistance;
                    }
                    else if (this.paint.get('circle-pitch-scale') === 'map' && this.paint.get('circle-pitch-alignment') === 'viewport') {
                        adjustedSize *= transform.cameraToCenterDistance / projectedCenter[3];
                    }
                    if (polygonIntersectsBufferedPoint(transformedPolygon, transformedPoint, adjustedSize))
                        return true;
                }
            }
            return false;
        }
    }
    function projectPoint(p, pixelPosMatrix) {
        const point = transformMat4([], [p.x, p.y, 0, 1], pixelPosMatrix);
        return new pointGeometry(point[0] / point[3], point[1] / point[3]);
    }
    function projectQueryGeometry$1(queryGeometry, pixelPosMatrix) {
        return queryGeometry.map((p) => {
            return projectPoint(p, pixelPosMatrix);
        });
    }

    class HeatmapBucket extends CircleBucket {
    }
    register('HeatmapBucket', HeatmapBucket, { omit: ['layers'] });

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const paint$7 = new Properties({
        "heatmap-radius": new DataDrivenProperty(spec["paint_heatmap"]["heatmap-radius"]),
        "heatmap-weight": new DataDrivenProperty(spec["paint_heatmap"]["heatmap-weight"]),
        "heatmap-intensity": new DataConstantProperty(spec["paint_heatmap"]["heatmap-intensity"]),
        "heatmap-color": new ColorRampProperty(spec["paint_heatmap"]["heatmap-color"]),
        "heatmap-opacity": new DataConstantProperty(spec["paint_heatmap"]["heatmap-opacity"]),
    });
    var properties$7 = { paint: paint$7 };

    function createImage(image, { width, height }, channels, data) {
        if (!data) {
            data = new Uint8Array(width * height * channels);
        }
        else if (data instanceof Uint8ClampedArray) {
            data = new Uint8Array(data.buffer);
        }
        else if (data.length !== width * height * channels) {
            throw new RangeError(`mismatched image size. expected: ${data.length} but got: ${width * height * channels}`);
        }
        image.width = width;
        image.height = height;
        image.data = data;
        return image;
    }
    function resizeImage(image, { width, height }, channels) {
        if (width === image.width && height === image.height) {
            return;
        }
        const newImage = createImage({}, { width, height }, channels);
        copyImage(image, newImage, { x: 0, y: 0 }, { x: 0, y: 0 }, {
            width: Math.min(image.width, width),
            height: Math.min(image.height, height)
        }, channels);
        image.width = width;
        image.height = height;
        image.data = newImage.data;
    }
    function copyImage(srcImg, dstImg, srcPt, dstPt, size, channels) {
        if (size.width === 0 || size.height === 0) {
            return dstImg;
        }
        if (size.width > srcImg.width ||
            size.height > srcImg.height ||
            srcPt.x > srcImg.width - size.width ||
            srcPt.y > srcImg.height - size.height) {
            throw new RangeError('out of range source coordinates for image copy');
        }
        if (size.width > dstImg.width ||
            size.height > dstImg.height ||
            dstPt.x > dstImg.width - size.width ||
            dstPt.y > dstImg.height - size.height) {
            throw new RangeError('out of range destination coordinates for image copy');
        }
        const srcData = srcImg.data;
        const dstData = dstImg.data;
        if (srcData === dstData)
            throw new Error('srcData equals dstData, so image is already copied');
        for (let y = 0; y < size.height; y++) {
            const srcOffset = ((srcPt.y + y) * srcImg.width + srcPt.x) * channels;
            const dstOffset = ((dstPt.y + y) * dstImg.width + dstPt.x) * channels;
            for (let i = 0; i < size.width * channels; i++) {
                dstData[dstOffset + i] = srcData[srcOffset + i];
            }
        }
        return dstImg;
    }
    class AlphaImage {
        constructor(size, data) {
            createImage(this, size, 1, data);
        }
        resize(size) {
            resizeImage(this, size, 1);
        }
        clone() {
            return new AlphaImage({ width: this.width, height: this.height }, new Uint8Array(this.data));
        }
        static copy(srcImg, dstImg, srcPt, dstPt, size) {
            copyImage(srcImg, dstImg, srcPt, dstPt, size, 1);
        }
    }
    // Not premultiplied, because ImageData is not premultiplied.
    // UNPACK_PREMULTIPLY_ALPHA_WEBGL must be used when uploading to a texture.
    class RGBAImage {
        constructor(size, data) {
            createImage(this, size, 4, data);
        }
        resize(size) {
            resizeImage(this, size, 4);
        }
        replace(data, copy) {
            if (copy) {
                this.data.set(data);
            }
            else if (data instanceof Uint8ClampedArray) {
                this.data = new Uint8Array(data.buffer);
            }
            else {
                this.data = data;
            }
        }
        clone() {
            return new RGBAImage({ width: this.width, height: this.height }, new Uint8Array(this.data));
        }
        static copy(srcImg, dstImg, srcPt, dstPt, size) {
            copyImage(srcImg, dstImg, srcPt, dstPt, size, 4);
        }
    }
    register('AlphaImage', AlphaImage);
    register('RGBAImage', RGBAImage);

    /**
     * Given an expression that should evaluate to a color ramp,
     * return a RGBA image representing that ramp expression.
     *
     * @private
     */
    function renderColorRamp(params) {
        const evaluationGlobals = {};
        const width = params.resolution || 256;
        const height = params.clips ? params.clips.length : 1;
        const image = params.image || new RGBAImage({ width, height });
        if (!isPowerOfTwo(width))
            throw new Error(`width is not a power of 2 - ${width}`);
        const renderPixel = (stride, index, progress) => {
            evaluationGlobals[params.evaluationKey] = progress;
            const pxColor = params.expression.evaluate(evaluationGlobals);
            // the colors are being unpremultiplied because Color uses
            // premultiplied values, and the Texture class expects unpremultiplied ones
            image.data[stride + index + 0] = Math.floor(pxColor.r * 255 / pxColor.a);
            image.data[stride + index + 1] = Math.floor(pxColor.g * 255 / pxColor.a);
            image.data[stride + index + 2] = Math.floor(pxColor.b * 255 / pxColor.a);
            image.data[stride + index + 3] = Math.floor(pxColor.a * 255);
        };
        if (!params.clips) {
            for (let i = 0, j = 0; i < width; i++, j += 4) {
                const progress = i / (width - 1);
                renderPixel(0, j, progress);
            }
        }
        else {
            for (let clip = 0, stride = 0; clip < height; ++clip, stride += width * 4) {
                for (let i = 0, j = 0; i < width; i++, j += 4) {
                    // Remap progress between clips
                    const progress = i / (width - 1);
                    const { start, end } = params.clips[clip];
                    const evaluationProgress = start * (1 - progress) + end * progress;
                    renderPixel(stride, j, evaluationProgress);
                }
            }
        }
        return image;
    }

    class HeatmapStyleLayer extends StyleLayer {
        createBucket(options) {
            return new HeatmapBucket(options);
        }
        constructor(layer) {
            super(layer, properties$7);
            // make sure color ramp texture is generated for default heatmap color too
            this._updateColorRamp();
        }
        _handleSpecialPaintPropertyUpdate(name) {
            if (name === 'heatmap-color') {
                this._updateColorRamp();
            }
        }
        _updateColorRamp() {
            const expression = this._transitionablePaint._values['heatmap-color'].value.expression;
            this.colorRamp = renderColorRamp({
                expression,
                evaluationKey: 'heatmapDensity',
                image: this.colorRamp
            });
            this.colorRampTexture = null;
        }
        resize() {
            if (this.heatmapFbo) {
                this.heatmapFbo.destroy();
                this.heatmapFbo = null;
            }
        }
        queryRadius() {
            return 0;
        }
        queryIntersectsFeature() {
            return false;
        }
        hasOffscreenPass() {
            return this.paint.get('heatmap-opacity') !== 0 && this.visibility !== 'none';
        }
    }

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const paint$6 = new Properties({
        "hillshade-illumination-direction": new DataConstantProperty(spec["paint_hillshade"]["hillshade-illumination-direction"]),
        "hillshade-illumination-anchor": new DataConstantProperty(spec["paint_hillshade"]["hillshade-illumination-anchor"]),
        "hillshade-exaggeration": new DataConstantProperty(spec["paint_hillshade"]["hillshade-exaggeration"]),
        "hillshade-shadow-color": new DataConstantProperty(spec["paint_hillshade"]["hillshade-shadow-color"]),
        "hillshade-highlight-color": new DataConstantProperty(spec["paint_hillshade"]["hillshade-highlight-color"]),
        "hillshade-accent-color": new DataConstantProperty(spec["paint_hillshade"]["hillshade-accent-color"]),
    });
    var properties$6 = { paint: paint$6 };

    class HillshadeStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties$6);
        }
        hasOffscreenPass() {
            return this.paint.get('hillshade-exaggeration') !== 0 && this.visibility !== 'none';
        }
    }

    const layout$4 = createLayout([
        { name: 'a_pos', components: 2, type: 'Int16' }
    ], 4);
    const { members: members$3, size: size$3, alignment: alignment$3 } = layout$4;

    var earcutExports = {};
    var earcut$1 = {
      get exports(){ return earcutExports; },
      set exports(v){ earcutExports = v; },
    };

    earcut$1.exports = earcut;
    earcutExports.default = earcut;

    function earcut(data, holeIndices, dim) {

        dim = dim || 2;

        var hasHoles = holeIndices && holeIndices.length,
            outerLen = hasHoles ? holeIndices[0] * dim : data.length,
            outerNode = linkedList(data, 0, outerLen, dim, true),
            triangles = [];

        if (!outerNode || outerNode.next === outerNode.prev) return triangles;

        var minX, minY, maxX, maxY, x, y, invSize;

        if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

        // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
        if (data.length > 80 * dim) {
            minX = maxX = data[0];
            minY = maxY = data[1];

            for (var i = dim; i < outerLen; i += dim) {
                x = data[i];
                y = data[i + 1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }

            // minX, minY and invSize are later used to transform coords into integers for z-order calculation
            invSize = Math.max(maxX - minX, maxY - minY);
            invSize = invSize !== 0 ? 32767 / invSize : 0;
        }

        earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);

        return triangles;
    }

    // create a circular doubly linked list from polygon points in the specified winding order
    function linkedList(data, start, end, dim, clockwise) {
        var i, last;

        if (clockwise === (signedArea$1(data, start, end, dim) > 0)) {
            for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
        } else {
            for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
        }

        if (last && equals(last, last.next)) {
            removeNode(last);
            last = last.next;
        }

        return last;
    }

    // eliminate colinear or duplicate points
    function filterPoints(start, end) {
        if (!start) return start;
        if (!end) end = start;

        var p = start,
            again;
        do {
            again = false;

            if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
                removeNode(p);
                p = end = p.prev;
                if (p === p.next) break;
                again = true;

            } else {
                p = p.next;
            }
        } while (again || p !== end);

        return end;
    }

    // main ear slicing loop which triangulates a polygon (given as a linked list)
    function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
        if (!ear) return;

        // interlink polygon nodes in z-order
        if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

        var stop = ear,
            prev, next;

        // iterate through ears, slicing them one by one
        while (ear.prev !== ear.next) {
            prev = ear.prev;
            next = ear.next;

            if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
                // cut off the triangle
                triangles.push(prev.i / dim | 0);
                triangles.push(ear.i / dim | 0);
                triangles.push(next.i / dim | 0);

                removeNode(ear);

                // skipping the next vertex leads to less sliver triangles
                ear = next.next;
                stop = next.next;

                continue;
            }

            ear = next;

            // if we looped through the whole remaining polygon and can't find any more ears
            if (ear === stop) {
                // try filtering points and slicing again
                if (!pass) {
                    earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);

                // if this didn't work, try curing all small self-intersections locally
                } else if (pass === 1) {
                    ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
                    earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);

                // as a last resort, try splitting the remaining polygon into two
                } else if (pass === 2) {
                    splitEarcut(ear, triangles, dim, minX, minY, invSize);
                }

                break;
            }
        }
    }

    // check whether a polygon node forms a valid ear with adjacent nodes
    function isEar(ear) {
        var a = ear.prev,
            b = ear,
            c = ear.next;

        if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

        // now make sure we don't have other points inside the potential ear
        var ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

        // triangle bbox; min & max are calculated like this for speed
        var x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
            y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
            x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
            y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

        var p = c.next;
        while (p !== a) {
            if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
                pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
                area(p.prev, p, p.next) >= 0) return false;
            p = p.next;
        }

        return true;
    }

    function isEarHashed(ear, minX, minY, invSize) {
        var a = ear.prev,
            b = ear,
            c = ear.next;

        if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

        var ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

        // triangle bbox; min & max are calculated like this for speed
        var x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
            y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
            x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
            y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

        // z-order range for the current triangle bbox;
        var minZ = zOrder(x0, y0, minX, minY, invSize),
            maxZ = zOrder(x1, y1, minX, minY, invSize);

        var p = ear.prevZ,
            n = ear.nextZ;

        // look for points inside the triangle in both directions
        while (p && p.z >= minZ && n && n.z <= maxZ) {
            if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
                pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
            p = p.prevZ;

            if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
                pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
            n = n.nextZ;
        }

        // look for remaining points in decreasing z-order
        while (p && p.z >= minZ) {
            if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
                pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
            p = p.prevZ;
        }

        // look for remaining points in increasing z-order
        while (n && n.z <= maxZ) {
            if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
                pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
            n = n.nextZ;
        }

        return true;
    }

    // go through all polygon nodes and cure small local self-intersections
    function cureLocalIntersections(start, triangles, dim) {
        var p = start;
        do {
            var a = p.prev,
                b = p.next.next;

            if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

                triangles.push(a.i / dim | 0);
                triangles.push(p.i / dim | 0);
                triangles.push(b.i / dim | 0);

                // remove two nodes involved
                removeNode(p);
                removeNode(p.next);

                p = start = b;
            }
            p = p.next;
        } while (p !== start);

        return filterPoints(p);
    }

    // try splitting polygon into two and triangulate them independently
    function splitEarcut(start, triangles, dim, minX, minY, invSize) {
        // look for a valid diagonal that divides the polygon into two
        var a = start;
        do {
            var b = a.next.next;
            while (b !== a.prev) {
                if (a.i !== b.i && isValidDiagonal(a, b)) {
                    // split the polygon in two by the diagonal
                    var c = splitPolygon(a, b);

                    // filter colinear points around the cuts
                    a = filterPoints(a, a.next);
                    c = filterPoints(c, c.next);

                    // run earcut on each half
                    earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
                    earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
                    return;
                }
                b = b.next;
            }
            a = a.next;
        } while (a !== start);
    }

    // link every hole into the outer loop, producing a single-ring polygon without holes
    function eliminateHoles(data, holeIndices, outerNode, dim) {
        var queue = [],
            i, len, start, end, list;

        for (i = 0, len = holeIndices.length; i < len; i++) {
            start = holeIndices[i] * dim;
            end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
            list = linkedList(data, start, end, dim, false);
            if (list === list.next) list.steiner = true;
            queue.push(getLeftmost(list));
        }

        queue.sort(compareX);

        // process holes from left to right
        for (i = 0; i < queue.length; i++) {
            outerNode = eliminateHole(queue[i], outerNode);
        }

        return outerNode;
    }

    function compareX(a, b) {
        return a.x - b.x;
    }

    // find a bridge between vertices that connects hole with an outer ring and and link it
    function eliminateHole(hole, outerNode) {
        var bridge = findHoleBridge(hole, outerNode);
        if (!bridge) {
            return outerNode;
        }

        var bridgeReverse = splitPolygon(bridge, hole);

        // filter collinear points around the cuts
        filterPoints(bridgeReverse, bridgeReverse.next);
        return filterPoints(bridge, bridge.next);
    }

    // David Eberly's algorithm for finding a bridge between hole and outer polygon
    function findHoleBridge(hole, outerNode) {
        var p = outerNode,
            hx = hole.x,
            hy = hole.y,
            qx = -Infinity,
            m;

        // find a segment intersected by a ray from the hole's leftmost point to the left;
        // segment's endpoint with lesser x will be potential connection point
        do {
            if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
                var x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
                if (x <= hx && x > qx) {
                    qx = x;
                    m = p.x < p.next.x ? p : p.next;
                    if (x === hx) return m; // hole touches outer segment; pick leftmost endpoint
                }
            }
            p = p.next;
        } while (p !== outerNode);

        if (!m) return null;

        // look for points inside the triangle of hole point, segment intersection and endpoint;
        // if there are no points found, we have a valid connection;
        // otherwise choose the point of the minimum angle with the ray as connection point

        var stop = m,
            mx = m.x,
            my = m.y,
            tanMin = Infinity,
            tan;

        p = m;

        do {
            if (hx >= p.x && p.x >= mx && hx !== p.x &&
                    pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

                tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

                if (locallyInside(p, hole) &&
                    (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
                    m = p;
                    tanMin = tan;
                }
            }

            p = p.next;
        } while (p !== stop);

        return m;
    }

    // whether sector in vertex m contains sector in vertex p in the same coordinates
    function sectorContainsSector(m, p) {
        return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
    }

    // interlink polygon nodes in z-order
    function indexCurve(start, minX, minY, invSize) {
        var p = start;
        do {
            if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
            p.prevZ = p.prev;
            p.nextZ = p.next;
            p = p.next;
        } while (p !== start);

        p.prevZ.nextZ = null;
        p.prevZ = null;

        sortLinked(p);
    }

    // Simon Tatham's linked list merge sort algorithm
    // http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
    function sortLinked(list) {
        var i, p, q, e, tail, numMerges, pSize, qSize,
            inSize = 1;

        do {
            p = list;
            list = null;
            tail = null;
            numMerges = 0;

            while (p) {
                numMerges++;
                q = p;
                pSize = 0;
                for (i = 0; i < inSize; i++) {
                    pSize++;
                    q = q.nextZ;
                    if (!q) break;
                }
                qSize = inSize;

                while (pSize > 0 || (qSize > 0 && q)) {

                    if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                        e = p;
                        p = p.nextZ;
                        pSize--;
                    } else {
                        e = q;
                        q = q.nextZ;
                        qSize--;
                    }

                    if (tail) tail.nextZ = e;
                    else list = e;

                    e.prevZ = tail;
                    tail = e;
                }

                p = q;
            }

            tail.nextZ = null;
            inSize *= 2;

        } while (numMerges > 1);

        return list;
    }

    // z-order of a point given coords and inverse of the longer side of data bbox
    function zOrder(x, y, minX, minY, invSize) {
        // coords are transformed into non-negative 15-bit integer range
        x = (x - minX) * invSize | 0;
        y = (y - minY) * invSize | 0;

        x = (x | (x << 8)) & 0x00FF00FF;
        x = (x | (x << 4)) & 0x0F0F0F0F;
        x = (x | (x << 2)) & 0x33333333;
        x = (x | (x << 1)) & 0x55555555;

        y = (y | (y << 8)) & 0x00FF00FF;
        y = (y | (y << 4)) & 0x0F0F0F0F;
        y = (y | (y << 2)) & 0x33333333;
        y = (y | (y << 1)) & 0x55555555;

        return x | (y << 1);
    }

    // find the leftmost node of a polygon ring
    function getLeftmost(start) {
        var p = start,
            leftmost = start;
        do {
            if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
            p = p.next;
        } while (p !== start);

        return leftmost;
    }

    // check if a point lies within a convex triangle
    function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
        return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
               (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
               (bx - px) * (cy - py) >= (cx - px) * (by - py);
    }

    // check if a diagonal between two polygon nodes is valid (lies in polygon interior)
    function isValidDiagonal(a, b) {
        return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && // dones't intersect other edges
               (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && // locally visible
                (area(a.prev, a, b.prev) || area(a, b.prev, b)) || // does not create opposite-facing sectors
                equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0); // special zero-length case
    }

    // signed area of a triangle
    function area(p, q, r) {
        return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    }

    // check if two points are equal
    function equals(p1, p2) {
        return p1.x === p2.x && p1.y === p2.y;
    }

    // check if two segments intersect
    function intersects(p1, q1, p2, q2) {
        var o1 = sign(area(p1, q1, p2));
        var o2 = sign(area(p1, q1, q2));
        var o3 = sign(area(p2, q2, p1));
        var o4 = sign(area(p2, q2, q1));

        if (o1 !== o2 && o3 !== o4) return true; // general case

        if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
        if (o2 === 0 && onSegment(p1, q2, q1)) return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
        if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
        if (o4 === 0 && onSegment(p2, q1, q2)) return true; // p2, q2 and q1 are collinear and q1 lies on p2q2

        return false;
    }

    // for collinear points p, q, r, check if point q lies on segment pr
    function onSegment(p, q, r) {
        return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
    }

    function sign(num) {
        return num > 0 ? 1 : num < 0 ? -1 : 0;
    }

    // check if a polygon diagonal intersects any polygon segments
    function intersectsPolygon(a, b) {
        var p = a;
        do {
            if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
                    intersects(p, p.next, a, b)) return true;
            p = p.next;
        } while (p !== a);

        return false;
    }

    // check if a polygon diagonal is locally inside the polygon
    function locallyInside(a, b) {
        return area(a.prev, a, a.next) < 0 ?
            area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
            area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
    }

    // check if the middle point of a polygon diagonal is inside the polygon
    function middleInside(a, b) {
        var p = a,
            inside = false,
            px = (a.x + b.x) / 2,
            py = (a.y + b.y) / 2;
        do {
            if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
                    (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
                inside = !inside;
            p = p.next;
        } while (p !== a);

        return inside;
    }

    // link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
    // if one belongs to the outer ring and another to a hole, it merges it into a single ring
    function splitPolygon(a, b) {
        var a2 = new Node(a.i, a.x, a.y),
            b2 = new Node(b.i, b.x, b.y),
            an = a.next,
            bp = b.prev;

        a.next = b;
        b.prev = a;

        a2.next = an;
        an.prev = a2;

        b2.next = a2;
        a2.prev = b2;

        bp.next = b2;
        b2.prev = bp;

        return b2;
    }

    // create a node and optionally link it with previous one (in a circular doubly linked list)
    function insertNode(i, x, y, last) {
        var p = new Node(i, x, y);

        if (!last) {
            p.prev = p;
            p.next = p;

        } else {
            p.next = last.next;
            p.prev = last;
            last.next.prev = p;
            last.next = p;
        }
        return p;
    }

    function removeNode(p) {
        p.next.prev = p.prev;
        p.prev.next = p.next;

        if (p.prevZ) p.prevZ.nextZ = p.nextZ;
        if (p.nextZ) p.nextZ.prevZ = p.prevZ;
    }

    function Node(i, x, y) {
        // vertex index in coordinates array
        this.i = i;

        // vertex coordinates
        this.x = x;
        this.y = y;

        // previous and next vertex nodes in a polygon ring
        this.prev = null;
        this.next = null;

        // z-order curve value
        this.z = 0;

        // previous and next nodes in z-order
        this.prevZ = null;
        this.nextZ = null;

        // indicates whether this is a steiner point
        this.steiner = false;
    }

    // return a percentage difference between the polygon area and its triangulation area;
    // used to verify correctness of triangulation
    earcut.deviation = function (data, holeIndices, dim, triangles) {
        var hasHoles = holeIndices && holeIndices.length;
        var outerLen = hasHoles ? holeIndices[0] * dim : data.length;

        var polygonArea = Math.abs(signedArea$1(data, 0, outerLen, dim));
        if (hasHoles) {
            for (var i = 0, len = holeIndices.length; i < len; i++) {
                var start = holeIndices[i] * dim;
                var end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
                polygonArea -= Math.abs(signedArea$1(data, start, end, dim));
            }
        }

        var trianglesArea = 0;
        for (i = 0; i < triangles.length; i += 3) {
            var a = triangles[i] * dim;
            var b = triangles[i + 1] * dim;
            var c = triangles[i + 2] * dim;
            trianglesArea += Math.abs(
                (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
                (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
        }

        return polygonArea === 0 && trianglesArea === 0 ? 0 :
            Math.abs((trianglesArea - polygonArea) / polygonArea);
    };

    function signedArea$1(data, start, end, dim) {
        var sum = 0;
        for (var i = start, j = end - dim; i < end; i += dim) {
            sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
            j = i;
        }
        return sum;
    }

    // turn a polygon in a multi-dimensional array form (e.g. as in GeoJSON) into a form Earcut accepts
    earcut.flatten = function (data) {
        var dim = data[0][0].length,
            result = {vertices: [], holes: [], dimensions: dim},
            holeIndex = 0;

        for (var i = 0; i < data.length; i++) {
            for (var j = 0; j < data[i].length; j++) {
                for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
            }
            if (i > 0) {
                holeIndex += data[i - 1].length;
                result.holes.push(holeIndex);
            }
        }
        return result;
    };

    var quickselectExports = {};
    var quickselect$1 = {
      get exports(){ return quickselectExports; },
      set exports(v){ quickselectExports = v; },
    };

    (function (module, exports) {
    	(function (global, factory) {
    		module.exports = factory() ;
    	}(this, (function () {
    	function quickselect(arr, k, left, right, compare) {
    	    quickselectStep(arr, k, left || 0, right || (arr.length - 1), compare || defaultCompare);
    	}

    	function quickselectStep(arr, k, left, right, compare) {

    	    while (right > left) {
    	        if (right - left > 600) {
    	            var n = right - left + 1;
    	            var m = k - left + 1;
    	            var z = Math.log(n);
    	            var s = 0.5 * Math.exp(2 * z / 3);
    	            var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
    	            var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
    	            var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
    	            quickselectStep(arr, k, newLeft, newRight, compare);
    	        }

    	        var t = arr[k];
    	        var i = left;
    	        var j = right;

    	        swap(arr, left, k);
    	        if (compare(arr[right], t) > 0) swap(arr, left, right);

    	        while (i < j) {
    	            swap(arr, i, j);
    	            i++;
    	            j--;
    	            while (compare(arr[i], t) < 0) i++;
    	            while (compare(arr[j], t) > 0) j--;
    	        }

    	        if (compare(arr[left], t) === 0) swap(arr, left, j);
    	        else {
    	            j++;
    	            swap(arr, j, right);
    	        }

    	        if (j <= k) left = j + 1;
    	        if (k <= j) right = j - 1;
    	    }
    	}

    	function swap(arr, i, j) {
    	    var tmp = arr[i];
    	    arr[i] = arr[j];
    	    arr[j] = tmp;
    	}

    	function defaultCompare(a, b) {
    	    return a < b ? -1 : a > b ? 1 : 0;
    	}

    	return quickselect;

    	})));
    } (quickselect$1));

    var quickselect = quickselectExports;

    // classifies an array of rings into polygons with outer rings and holes
    function classifyRings$1(rings, maxRings) {
        const len = rings.length;
        if (len <= 1)
            return [rings];
        const polygons = [];
        let polygon, ccw;
        for (let i = 0; i < len; i++) {
            const area = calculateSignedArea(rings[i]);
            if (area === 0)
                continue;
            rings[i].area = Math.abs(area);
            if (ccw === undefined)
                ccw = area < 0;
            if (ccw === area < 0) {
                if (polygon)
                    polygons.push(polygon);
                polygon = [rings[i]];
            }
            else {
                polygon.push(rings[i]);
            }
        }
        if (polygon)
            polygons.push(polygon);
        // Earcut performance degrades with the # of rings in a polygon. For this
        // reason, we limit strip out all but the `maxRings` largest rings.
        if (maxRings > 1) {
            for (let j = 0; j < polygons.length; j++) {
                if (polygons[j].length <= maxRings)
                    continue;
                quickselect(polygons[j], maxRings, 1, polygons[j].length - 1, compareAreas);
                polygons[j] = polygons[j].slice(0, maxRings);
            }
        }
        return polygons;
    }
    function compareAreas(a, b) {
        return b.area - a.area;
    }

    function hasPattern(type, layers, options) {
        const patterns = options.patternDependencies;
        let hasPattern = false;
        for (const layer of layers) {
            const patternProperty = layer.paint.get(`${type}-pattern`);
            if (!patternProperty.isConstant()) {
                hasPattern = true;
            }
            const constantPattern = patternProperty.constantOr(null);
            if (constantPattern) {
                hasPattern = true;
                patterns[constantPattern.to] = true;
                patterns[constantPattern.from] = true;
            }
        }
        return hasPattern;
    }
    function addPatternDependencies(type, layers, patternFeature, zoom, options) {
        const patterns = options.patternDependencies;
        for (const layer of layers) {
            const patternProperty = layer.paint.get(`${type}-pattern`);
            const patternPropertyValue = patternProperty.value;
            if (patternPropertyValue.kind !== 'constant') {
                let min = patternPropertyValue.evaluate({ zoom: zoom - 1 }, patternFeature, {}, options.availableImages);
                let mid = patternPropertyValue.evaluate({ zoom }, patternFeature, {}, options.availableImages);
                let max = patternPropertyValue.evaluate({ zoom: zoom + 1 }, patternFeature, {}, options.availableImages);
                min = min && min.name ? min.name : min;
                mid = mid && mid.name ? mid.name : mid;
                max = max && max.name ? max.name : max;
                // add to patternDependencies
                patterns[min] = true;
                patterns[mid] = true;
                patterns[max] = true;
                // save for layout
                patternFeature.patterns[layer.id] = { min, mid, max };
            }
        }
        return patternFeature;
    }

    const EARCUT_MAX_RINGS$1 = 500;
    class FillBucket {
        constructor(options) {
            this.zoom = options.zoom;
            this.overscaling = options.overscaling;
            this.layers = options.layers;
            this.layerIds = this.layers.map(layer => layer.id);
            this.index = options.index;
            this.hasPattern = false;
            this.patternFeatures = [];
            this.layoutVertexArray = new FillLayoutArray();
            this.indexArray = new TriangleIndexArray();
            this.indexArray2 = new LineIndexArray();
            this.programConfigurations = new ProgramConfigurationSet(options.layers, options.zoom);
            this.segments = new SegmentVector();
            this.segments2 = new SegmentVector();
            this.stateDependentLayerIds = this.layers.filter((l) => l.isStateDependent()).map((l) => l.id);
        }
        populate(features, options, canonical) {
            this.hasPattern = hasPattern('fill', this.layers, options);
            const fillSortKey = this.layers[0].layout.get('fill-sort-key');
            const sortFeaturesByKey = !fillSortKey.isConstant();
            const bucketFeatures = [];
            for (const { feature, id, index, sourceLayerIndex } of features) {
                const needGeometry = this.layers[0]._featureFilter.needGeometry;
                const evaluationFeature = toEvaluationFeature(feature, needGeometry);
                if (!this.layers[0]._featureFilter.filter(new EvaluationParameters(this.zoom), evaluationFeature, canonical))
                    continue;
                const sortKey = sortFeaturesByKey ?
                    fillSortKey.evaluate(evaluationFeature, {}, canonical, options.availableImages) :
                    undefined;
                const bucketFeature = {
                    id,
                    properties: feature.properties,
                    type: feature.type,
                    sourceLayerIndex,
                    index,
                    geometry: needGeometry ? evaluationFeature.geometry : loadGeometry(feature),
                    patterns: {},
                    sortKey
                };
                bucketFeatures.push(bucketFeature);
            }
            if (sortFeaturesByKey) {
                bucketFeatures.sort((a, b) => a.sortKey - b.sortKey);
            }
            for (const bucketFeature of bucketFeatures) {
                const { geometry, index, sourceLayerIndex } = bucketFeature;
                if (this.hasPattern) {
                    const patternFeature = addPatternDependencies('fill', this.layers, bucketFeature, this.zoom, options);
                    // pattern features are added only once the pattern is loaded into the image atlas
                    // so are stored during populate until later updated with positions by tile worker in addFeatures
                    this.patternFeatures.push(patternFeature);
                }
                else {
                    this.addFeature(bucketFeature, geometry, index, canonical, {});
                }
                const feature = features[index].feature;
                options.featureIndex.insert(feature, geometry, index, sourceLayerIndex, this.index);
            }
        }
        update(states, vtLayer, imagePositions) {
            if (!this.stateDependentLayers.length)
                return;
            this.programConfigurations.updatePaintArrays(states, vtLayer, this.stateDependentLayers, imagePositions);
        }
        addFeatures(options, canonical, imagePositions) {
            for (const feature of this.patternFeatures) {
                this.addFeature(feature, feature.geometry, feature.index, canonical, imagePositions);
            }
        }
        isEmpty() {
            return this.layoutVertexArray.length === 0;
        }
        uploadPending() {
            return !this.uploaded || this.programConfigurations.needsUpload;
        }
        upload(context) {
            if (!this.uploaded) {
                this.layoutVertexBuffer = context.createVertexBuffer(this.layoutVertexArray, members$3);
                this.indexBuffer = context.createIndexBuffer(this.indexArray);
                this.indexBuffer2 = context.createIndexBuffer(this.indexArray2);
            }
            this.programConfigurations.upload(context);
            this.uploaded = true;
        }
        destroy() {
            if (!this.layoutVertexBuffer)
                return;
            this.layoutVertexBuffer.destroy();
            this.indexBuffer.destroy();
            this.indexBuffer2.destroy();
            this.programConfigurations.destroy();
            this.segments.destroy();
            this.segments2.destroy();
        }
        addFeature(feature, geometry, index, canonical, imagePositions) {
            for (const polygon of classifyRings$1(geometry, EARCUT_MAX_RINGS$1)) {
                let numVertices = 0;
                for (const ring of polygon) {
                    numVertices += ring.length;
                }
                const triangleSegment = this.segments.prepareSegment(numVertices, this.layoutVertexArray, this.indexArray);
                const triangleIndex = triangleSegment.vertexLength;
                const flattened = [];
                const holeIndices = [];
                for (const ring of polygon) {
                    if (ring.length === 0) {
                        continue;
                    }
                    if (ring !== polygon[0]) {
                        holeIndices.push(flattened.length / 2);
                    }
                    const lineSegment = this.segments2.prepareSegment(ring.length, this.layoutVertexArray, this.indexArray2);
                    const lineIndex = lineSegment.vertexLength;
                    this.layoutVertexArray.emplaceBack(ring[0].x, ring[0].y);
                    this.indexArray2.emplaceBack(lineIndex + ring.length - 1, lineIndex);
                    flattened.push(ring[0].x);
                    flattened.push(ring[0].y);
                    for (let i = 1; i < ring.length; i++) {
                        this.layoutVertexArray.emplaceBack(ring[i].x, ring[i].y);
                        this.indexArray2.emplaceBack(lineIndex + i - 1, lineIndex + i);
                        flattened.push(ring[i].x);
                        flattened.push(ring[i].y);
                    }
                    lineSegment.vertexLength += ring.length;
                    lineSegment.primitiveLength += ring.length;
                }
                const indices = earcutExports(flattened, holeIndices);
                for (let i = 0; i < indices.length; i += 3) {
                    this.indexArray.emplaceBack(triangleIndex + indices[i], triangleIndex + indices[i + 1], triangleIndex + indices[i + 2]);
                }
                triangleSegment.vertexLength += numVertices;
                triangleSegment.primitiveLength += indices.length / 3;
            }
            this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length, feature, index, imagePositions, canonical);
        }
    }
    register('FillBucket', FillBucket, { omit: ['layers', 'patternFeatures'] });

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const layout$3 = new Properties({
        "fill-sort-key": new DataDrivenProperty(spec["layout_fill"]["fill-sort-key"]),
    });
    const paint$5 = new Properties({
        "fill-antialias": new DataConstantProperty(spec["paint_fill"]["fill-antialias"]),
        "fill-opacity": new DataDrivenProperty(spec["paint_fill"]["fill-opacity"]),
        "fill-color": new DataDrivenProperty(spec["paint_fill"]["fill-color"]),
        "fill-outline-color": new DataDrivenProperty(spec["paint_fill"]["fill-outline-color"]),
        "fill-translate": new DataConstantProperty(spec["paint_fill"]["fill-translate"]),
        "fill-translate-anchor": new DataConstantProperty(spec["paint_fill"]["fill-translate-anchor"]),
        "fill-pattern": new CrossFadedDataDrivenProperty(spec["paint_fill"]["fill-pattern"]),
    });
    var properties$5 = { paint: paint$5, layout: layout$3 };

    class FillStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties$5);
        }
        recalculate(parameters, availableImages) {
            super.recalculate(parameters, availableImages);
            const outlineColor = this.paint._values['fill-outline-color'];
            if (outlineColor.value.kind === 'constant' && outlineColor.value.value === undefined) {
                this.paint._values['fill-outline-color'] = this.paint._values['fill-color'];
            }
        }
        createBucket(parameters) {
            return new FillBucket(parameters);
        }
        queryRadius() {
            return translateDistance(this.paint.get('fill-translate'));
        }
        queryIntersectsFeature(queryGeometry, feature, featureState, geometry, zoom, transform, pixelsToTileUnits) {
            const translatedPolygon = translate(queryGeometry, this.paint.get('fill-translate'), this.paint.get('fill-translate-anchor'), transform.angle, pixelsToTileUnits);
            return polygonIntersectsMultiPolygon(translatedPolygon, geometry);
        }
        isTileClipped() {
            return true;
        }
    }

    const layout$2 = createLayout([
        { name: 'a_pos', components: 2, type: 'Int16' },
        { name: 'a_normal_ed', components: 4, type: 'Int16' },
    ], 4);
    const centroidAttributes = createLayout([
        { name: 'a_centroid', components: 2, type: 'Int16' }
    ], 4);
    const { members: members$2, size: size$2, alignment: alignment$2 } = layout$2;

    var vectorTile = {};

    var Point$1 = pointGeometry;

    var vectortilefeature = VectorTileFeature$2;

    function VectorTileFeature$2(pbf, end, extent, keys, values) {
        // Public
        this.properties = {};
        this.extent = extent;
        this.type = 0;

        // Private
        this._pbf = pbf;
        this._geometry = -1;
        this._keys = keys;
        this._values = values;

        pbf.readFields(readFeature, this, end);
    }

    function readFeature(tag, feature, pbf) {
        if (tag == 1) feature.id = pbf.readVarint();
        else if (tag == 2) readTag(pbf, feature);
        else if (tag == 3) feature.type = pbf.readVarint();
        else if (tag == 4) feature._geometry = pbf.pos;
    }

    function readTag(pbf, feature) {
        var end = pbf.readVarint() + pbf.pos;

        while (pbf.pos < end) {
            var key = feature._keys[pbf.readVarint()],
                value = feature._values[pbf.readVarint()];
            feature.properties[key] = value;
        }
    }

    VectorTileFeature$2.types = ['Unknown', 'Point', 'LineString', 'Polygon'];

    VectorTileFeature$2.prototype.loadGeometry = function() {
        var pbf = this._pbf;
        pbf.pos = this._geometry;

        var end = pbf.readVarint() + pbf.pos,
            cmd = 1,
            length = 0,
            x = 0,
            y = 0,
            lines = [],
            line;

        while (pbf.pos < end) {
            if (length <= 0) {
                var cmdLen = pbf.readVarint();
                cmd = cmdLen & 0x7;
                length = cmdLen >> 3;
            }

            length--;

            if (cmd === 1 || cmd === 2) {
                x += pbf.readSVarint();
                y += pbf.readSVarint();

                if (cmd === 1) { // moveTo
                    if (line) lines.push(line);
                    line = [];
                }

                line.push(new Point$1(x, y));

            } else if (cmd === 7) {

                // Workaround for https://github.com/mapbox/mapnik-vector-tile/issues/90
                if (line) {
                    line.push(line[0].clone()); // closePolygon
                }

            } else {
                throw new Error('unknown command ' + cmd);
            }
        }

        if (line) lines.push(line);

        return lines;
    };

    VectorTileFeature$2.prototype.bbox = function() {
        var pbf = this._pbf;
        pbf.pos = this._geometry;

        var end = pbf.readVarint() + pbf.pos,
            cmd = 1,
            length = 0,
            x = 0,
            y = 0,
            x1 = Infinity,
            x2 = -Infinity,
            y1 = Infinity,
            y2 = -Infinity;

        while (pbf.pos < end) {
            if (length <= 0) {
                var cmdLen = pbf.readVarint();
                cmd = cmdLen & 0x7;
                length = cmdLen >> 3;
            }

            length--;

            if (cmd === 1 || cmd === 2) {
                x += pbf.readSVarint();
                y += pbf.readSVarint();
                if (x < x1) x1 = x;
                if (x > x2) x2 = x;
                if (y < y1) y1 = y;
                if (y > y2) y2 = y;

            } else if (cmd !== 7) {
                throw new Error('unknown command ' + cmd);
            }
        }

        return [x1, y1, x2, y2];
    };

    VectorTileFeature$2.prototype.toGeoJSON = function(x, y, z) {
        var size = this.extent * Math.pow(2, z),
            x0 = this.extent * x,
            y0 = this.extent * y,
            coords = this.loadGeometry(),
            type = VectorTileFeature$2.types[this.type],
            i, j;

        function project(line) {
            for (var j = 0; j < line.length; j++) {
                var p = line[j], y2 = 180 - (p.y + y0) * 360 / size;
                line[j] = [
                    (p.x + x0) * 360 / size - 180,
                    360 / Math.PI * Math.atan(Math.exp(y2 * Math.PI / 180)) - 90
                ];
            }
        }

        switch (this.type) {
        case 1:
            var points = [];
            for (i = 0; i < coords.length; i++) {
                points[i] = coords[i][0];
            }
            coords = points;
            project(coords);
            break;

        case 2:
            for (i = 0; i < coords.length; i++) {
                project(coords[i]);
            }
            break;

        case 3:
            coords = classifyRings(coords);
            for (i = 0; i < coords.length; i++) {
                for (j = 0; j < coords[i].length; j++) {
                    project(coords[i][j]);
                }
            }
            break;
        }

        if (coords.length === 1) {
            coords = coords[0];
        } else {
            type = 'Multi' + type;
        }

        var result = {
            type: "Feature",
            geometry: {
                type: type,
                coordinates: coords
            },
            properties: this.properties
        };

        if ('id' in this) {
            result.id = this.id;
        }

        return result;
    };

    // classifies an array of rings into polygons with outer rings and holes

    function classifyRings(rings) {
        var len = rings.length;

        if (len <= 1) return [rings];

        var polygons = [],
            polygon,
            ccw;

        for (var i = 0; i < len; i++) {
            var area = signedArea(rings[i]);
            if (area === 0) continue;

            if (ccw === undefined) ccw = area < 0;

            if (ccw === area < 0) {
                if (polygon) polygons.push(polygon);
                polygon = [rings[i]];

            } else {
                polygon.push(rings[i]);
            }
        }
        if (polygon) polygons.push(polygon);

        return polygons;
    }

    function signedArea(ring) {
        var sum = 0;
        for (var i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
            p1 = ring[i];
            p2 = ring[j];
            sum += (p2.x - p1.x) * (p1.y + p2.y);
        }
        return sum;
    }

    var VectorTileFeature$1 = vectortilefeature;

    var vectortilelayer = VectorTileLayer$1;

    function VectorTileLayer$1(pbf, end) {
        // Public
        this.version = 1;
        this.name = null;
        this.extent = 4096;
        this.length = 0;

        // Private
        this._pbf = pbf;
        this._keys = [];
        this._values = [];
        this._features = [];

        pbf.readFields(readLayer, this, end);

        this.length = this._features.length;
    }

    function readLayer(tag, layer, pbf) {
        if (tag === 15) layer.version = pbf.readVarint();
        else if (tag === 1) layer.name = pbf.readString();
        else if (tag === 5) layer.extent = pbf.readVarint();
        else if (tag === 2) layer._features.push(pbf.pos);
        else if (tag === 3) layer._keys.push(pbf.readString());
        else if (tag === 4) layer._values.push(readValueMessage(pbf));
    }

    function readValueMessage(pbf) {
        var value = null,
            end = pbf.readVarint() + pbf.pos;

        while (pbf.pos < end) {
            var tag = pbf.readVarint() >> 3;

            value = tag === 1 ? pbf.readString() :
                tag === 2 ? pbf.readFloat() :
                tag === 3 ? pbf.readDouble() :
                tag === 4 ? pbf.readVarint64() :
                tag === 5 ? pbf.readVarint() :
                tag === 6 ? pbf.readSVarint() :
                tag === 7 ? pbf.readBoolean() : null;
        }

        return value;
    }

    // return feature `i` from this layer as a `VectorTileFeature`
    VectorTileLayer$1.prototype.feature = function(i) {
        if (i < 0 || i >= this._features.length) throw new Error('feature index out of bounds');

        this._pbf.pos = this._features[i];

        var end = this._pbf.readVarint() + this._pbf.pos;
        return new VectorTileFeature$1(this._pbf, end, this.extent, this._keys, this._values);
    };

    var VectorTileLayer = vectortilelayer;

    var vectortile = VectorTile;

    function VectorTile(pbf, end) {
        this.layers = pbf.readFields(readTile, {}, end);
    }

    function readTile(tag, layers, pbf) {
        if (tag === 3) {
            var layer = new VectorTileLayer(pbf, pbf.readVarint() + pbf.pos);
            if (layer.length) layers[layer.name] = layer;
        }
    }

    vectorTile.VectorTile = vectortile;
    vectorTile.VectorTileFeature = vectortilefeature;
    vectorTile.VectorTileLayer = vectortilelayer;

    const vectorTileFeatureTypes$2 = vectorTile.VectorTileFeature.types;
    const EARCUT_MAX_RINGS = 500;
    const FACTOR = Math.pow(2, 13);
    function addVertex$1(vertexArray, x, y, nx, ny, nz, t, e) {
        vertexArray.emplaceBack(
        // a_pos
        x, y, 
        // a_normal_ed: 3-component normal and 1-component edgedistance
        Math.floor(nx * FACTOR) * 2 + t, ny * FACTOR * 2, nz * FACTOR * 2, 
        // edgedistance (used for wrapping patterns around extrusion sides)
        Math.round(e));
    }
    class FillExtrusionBucket {
        constructor(options) {
            this.zoom = options.zoom;
            this.overscaling = options.overscaling;
            this.layers = options.layers;
            this.layerIds = this.layers.map(layer => layer.id);
            this.index = options.index;
            this.hasPattern = false;
            this.layoutVertexArray = new FillExtrusionLayoutArray();
            this.centroidVertexArray = new PosArray();
            this.indexArray = new TriangleIndexArray();
            this.programConfigurations = new ProgramConfigurationSet(options.layers, options.zoom);
            this.segments = new SegmentVector();
            this.stateDependentLayerIds = this.layers.filter((l) => l.isStateDependent()).map((l) => l.id);
        }
        populate(features, options, canonical) {
            this.features = [];
            this.hasPattern = hasPattern('fill-extrusion', this.layers, options);
            for (const { feature, id, index, sourceLayerIndex } of features) {
                const needGeometry = this.layers[0]._featureFilter.needGeometry;
                const evaluationFeature = toEvaluationFeature(feature, needGeometry);
                if (!this.layers[0]._featureFilter.filter(new EvaluationParameters(this.zoom), evaluationFeature, canonical))
                    continue;
                const bucketFeature = {
                    id,
                    sourceLayerIndex,
                    index,
                    geometry: needGeometry ? evaluationFeature.geometry : loadGeometry(feature),
                    properties: feature.properties,
                    type: feature.type,
                    patterns: {}
                };
                if (this.hasPattern) {
                    this.features.push(addPatternDependencies('fill-extrusion', this.layers, bucketFeature, this.zoom, options));
                }
                else {
                    this.addFeature(bucketFeature, bucketFeature.geometry, index, canonical, {});
                }
                options.featureIndex.insert(feature, bucketFeature.geometry, index, sourceLayerIndex, this.index, true);
            }
        }
        addFeatures(options, canonical, imagePositions) {
            for (const feature of this.features) {
                const { geometry } = feature;
                this.addFeature(feature, geometry, feature.index, canonical, imagePositions);
            }
        }
        update(states, vtLayer, imagePositions) {
            if (!this.stateDependentLayers.length)
                return;
            this.programConfigurations.updatePaintArrays(states, vtLayer, this.stateDependentLayers, imagePositions);
        }
        isEmpty() {
            return this.layoutVertexArray.length === 0 && this.centroidVertexArray.length === 0;
        }
        uploadPending() {
            return !this.uploaded || this.programConfigurations.needsUpload;
        }
        upload(context) {
            if (!this.uploaded) {
                this.layoutVertexBuffer = context.createVertexBuffer(this.layoutVertexArray, members$2);
                this.centroidVertexBuffer = context.createVertexBuffer(this.centroidVertexArray, centroidAttributes.members, true);
                this.indexBuffer = context.createIndexBuffer(this.indexArray);
            }
            this.programConfigurations.upload(context);
            this.uploaded = true;
        }
        destroy() {
            if (!this.layoutVertexBuffer)
                return;
            this.layoutVertexBuffer.destroy();
            this.indexBuffer.destroy();
            this.programConfigurations.destroy();
            this.segments.destroy();
            this.centroidVertexBuffer.destroy();
        }
        addFeature(feature, geometry, index, canonical, imagePositions) {
            const centroid = { x: 0, y: 0, vertexCount: 0 };
            for (const polygon of classifyRings$1(geometry, EARCUT_MAX_RINGS)) {
                let numVertices = 0;
                for (const ring of polygon) {
                    numVertices += ring.length;
                }
                let segment = this.segments.prepareSegment(4, this.layoutVertexArray, this.indexArray);
                for (const ring of polygon) {
                    if (ring.length === 0) {
                        continue;
                    }
                    if (isEntirelyOutside(ring)) {
                        continue;
                    }
                    let edgeDistance = 0;
                    for (let p = 0; p < ring.length; p++) {
                        const p1 = ring[p];
                        if (p >= 1) {
                            const p2 = ring[p - 1];
                            if (!isBoundaryEdge(p1, p2)) {
                                if (segment.vertexLength + 4 > SegmentVector.MAX_VERTEX_ARRAY_LENGTH) {
                                    segment = this.segments.prepareSegment(4, this.layoutVertexArray, this.indexArray);
                                }
                                const perp = p1.sub(p2)._perp()._unit();
                                const dist = p2.dist(p1);
                                if (edgeDistance + dist > 32768)
                                    edgeDistance = 0;
                                addVertex$1(this.layoutVertexArray, p1.x, p1.y, perp.x, perp.y, 0, 0, edgeDistance);
                                addVertex$1(this.layoutVertexArray, p1.x, p1.y, perp.x, perp.y, 0, 1, edgeDistance);
                                centroid.x += 2 * p1.x;
                                centroid.y += 2 * p1.y;
                                centroid.vertexCount += 2;
                                edgeDistance += dist;
                                addVertex$1(this.layoutVertexArray, p2.x, p2.y, perp.x, perp.y, 0, 0, edgeDistance);
                                addVertex$1(this.layoutVertexArray, p2.x, p2.y, perp.x, perp.y, 0, 1, edgeDistance);
                                centroid.x += 2 * p2.x;
                                centroid.y += 2 * p2.y;
                                centroid.vertexCount += 2;
                                const bottomRight = segment.vertexLength;
                                // ┌──────┐
                                // │ 0  1 │ Counter-clockwise winding order.
                                // │      │ Triangle 1: 0 => 2 => 1
                                // │ 2  3 │ Triangle 2: 1 => 2 => 3
                                // └──────┘
                                this.indexArray.emplaceBack(bottomRight, bottomRight + 2, bottomRight + 1);
                                this.indexArray.emplaceBack(bottomRight + 1, bottomRight + 2, bottomRight + 3);
                                segment.vertexLength += 4;
                                segment.primitiveLength += 2;
                            }
                        }
                    }
                }
                if (segment.vertexLength + numVertices > SegmentVector.MAX_VERTEX_ARRAY_LENGTH) {
                    segment = this.segments.prepareSegment(numVertices, this.layoutVertexArray, this.indexArray);
                }
                //Only triangulate and draw the area of the feature if it is a polygon
                //Other feature types (e.g. LineString) do not have area, so triangulation is pointless / undefined
                if (vectorTileFeatureTypes$2[feature.type] !== 'Polygon')
                    continue;
                const flattened = [];
                const holeIndices = [];
                const triangleIndex = segment.vertexLength;
                for (const ring of polygon) {
                    if (ring.length === 0) {
                        continue;
                    }
                    if (ring !== polygon[0]) {
                        holeIndices.push(flattened.length / 2);
                    }
                    for (let i = 0; i < ring.length; i++) {
                        const p = ring[i];
                        addVertex$1(this.layoutVertexArray, p.x, p.y, 0, 0, 1, 1, 0);
                        centroid.x += p.x;
                        centroid.y += p.y;
                        centroid.vertexCount += 1;
                        flattened.push(p.x);
                        flattened.push(p.y);
                    }
                }
                const indices = earcutExports(flattened, holeIndices);
                for (let j = 0; j < indices.length; j += 3) {
                    // Counter-clockwise winding order.
                    this.indexArray.emplaceBack(triangleIndex + indices[j], triangleIndex + indices[j + 2], triangleIndex + indices[j + 1]);
                }
                segment.primitiveLength += indices.length / 3;
                segment.vertexLength += numVertices;
            }
            // remember polygon centroid to calculate elevation in GPU
            for (let i = 0; i < centroid.vertexCount; i++) {
                this.centroidVertexArray.emplaceBack(Math.floor(centroid.x / centroid.vertexCount), Math.floor(centroid.y / centroid.vertexCount));
            }
            this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length, feature, index, imagePositions, canonical);
        }
    }
    register('FillExtrusionBucket', FillExtrusionBucket, { omit: ['layers', 'features'] });
    function isBoundaryEdge(p1, p2) {
        return (p1.x === p2.x && (p1.x < 0 || p1.x > EXTENT)) ||
            (p1.y === p2.y && (p1.y < 0 || p1.y > EXTENT));
    }
    function isEntirelyOutside(ring) {
        return ring.every(p => p.x < 0) ||
            ring.every(p => p.x > EXTENT) ||
            ring.every(p => p.y < 0) ||
            ring.every(p => p.y > EXTENT);
    }

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const paint$4 = new Properties({
        "fill-extrusion-opacity": new DataConstantProperty(spec["paint_fill-extrusion"]["fill-extrusion-opacity"]),
        "fill-extrusion-color": new DataDrivenProperty(spec["paint_fill-extrusion"]["fill-extrusion-color"]),
        "fill-extrusion-translate": new DataConstantProperty(spec["paint_fill-extrusion"]["fill-extrusion-translate"]),
        "fill-extrusion-translate-anchor": new DataConstantProperty(spec["paint_fill-extrusion"]["fill-extrusion-translate-anchor"]),
        "fill-extrusion-pattern": new CrossFadedDataDrivenProperty(spec["paint_fill-extrusion"]["fill-extrusion-pattern"]),
        "fill-extrusion-height": new DataDrivenProperty(spec["paint_fill-extrusion"]["fill-extrusion-height"]),
        "fill-extrusion-base": new DataDrivenProperty(spec["paint_fill-extrusion"]["fill-extrusion-base"]),
        "fill-extrusion-vertical-gradient": new DataConstantProperty(spec["paint_fill-extrusion"]["fill-extrusion-vertical-gradient"]),
    });
    var properties$4 = { paint: paint$4 };

    class FillExtrusionStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties$4);
        }
        createBucket(parameters) {
            return new FillExtrusionBucket(parameters);
        }
        queryRadius() {
            return translateDistance(this.paint.get('fill-extrusion-translate'));
        }
        is3D() {
            return true;
        }
        queryIntersectsFeature(queryGeometry, feature, featureState, geometry, zoom, transform, pixelsToTileUnits, pixelPosMatrix) {
            const translatedPolygon = translate(queryGeometry, this.paint.get('fill-extrusion-translate'), this.paint.get('fill-extrusion-translate-anchor'), transform.angle, pixelsToTileUnits);
            const height = this.paint.get('fill-extrusion-height').evaluate(feature, featureState);
            const base = this.paint.get('fill-extrusion-base').evaluate(feature, featureState);
            const projectedQueryGeometry = projectQueryGeometry(translatedPolygon, pixelPosMatrix, transform, 0);
            const projected = projectExtrusion(geometry, base, height, pixelPosMatrix);
            const projectedBase = projected[0];
            const projectedTop = projected[1];
            return checkIntersection(projectedBase, projectedTop, projectedQueryGeometry);
        }
    }
    function dot(a, b) {
        return a.x * b.x + a.y * b.y;
    }
    function getIntersectionDistance(projectedQueryGeometry, projectedFace) {
        if (projectedQueryGeometry.length === 1) {
            // For point queries calculate the z at which the point intersects the face
            // using barycentric coordinates.
            // Find the barycentric coordinates of the projected point within the first
            // triangle of the face, using only the xy plane. It doesn't matter if the
            // point is outside the first triangle because all the triangles in the face
            // are in the same plane.
            //
            // Check whether points are coincident and use other points if they are.
            let i = 0;
            const a = projectedFace[i++];
            let b;
            while (!b || a.equals(b)) {
                b = projectedFace[i++];
                if (!b)
                    return Infinity;
            }
            // Loop until point `c` is not colinear with points `a` and `b`.
            for (; i < projectedFace.length; i++) {
                const c = projectedFace[i];
                const p = projectedQueryGeometry[0];
                const ab = b.sub(a);
                const ac = c.sub(a);
                const ap = p.sub(a);
                const dotABAB = dot(ab, ab);
                const dotABAC = dot(ab, ac);
                const dotACAC = dot(ac, ac);
                const dotAPAB = dot(ap, ab);
                const dotAPAC = dot(ap, ac);
                const denom = dotABAB * dotACAC - dotABAC * dotABAC;
                const v = (dotACAC * dotAPAB - dotABAC * dotAPAC) / denom;
                const w = (dotABAB * dotAPAC - dotABAC * dotAPAB) / denom;
                const u = 1 - v - w;
                // Use the barycentric weighting along with the original triangle z coordinates to get the point of intersection.
                const distance = a.z * u + b.z * v + c.z * w;
                if (isFinite(distance))
                    return distance;
            }
            return Infinity;
        }
        else {
            // The counts as closest is less clear when the query is a box. This
            // returns the distance to the nearest point on the face, whether it is
            // within the query or not. It could be more correct to return the
            // distance to the closest point within the query box but this would be
            // more complicated and expensive to calculate with little benefit.
            let closestDistance = Infinity;
            for (const p of projectedFace) {
                closestDistance = Math.min(closestDistance, p.z);
            }
            return closestDistance;
        }
    }
    function checkIntersection(projectedBase, projectedTop, projectedQueryGeometry) {
        let closestDistance = Infinity;
        if (polygonIntersectsMultiPolygon(projectedQueryGeometry, projectedTop)) {
            closestDistance = getIntersectionDistance(projectedQueryGeometry, projectedTop[0]);
        }
        for (let r = 0; r < projectedTop.length; r++) {
            const ringTop = projectedTop[r];
            const ringBase = projectedBase[r];
            for (let p = 0; p < ringTop.length - 1; p++) {
                const topA = ringTop[p];
                const topB = ringTop[p + 1];
                const baseA = ringBase[p];
                const baseB = ringBase[p + 1];
                const face = [topA, topB, baseB, baseA, topA];
                if (polygonIntersectsPolygon(projectedQueryGeometry, face)) {
                    closestDistance = Math.min(closestDistance, getIntersectionDistance(projectedQueryGeometry, face));
                }
            }
        }
        return closestDistance === Infinity ? false : closestDistance;
    }
    /*
     * Project the geometry using matrix `m`. This is essentially doing
     * `vec4.transformMat4([], [p.x, p.y, z, 1], m)` but the multiplication
     * is inlined so that parts of the projection that are the same across
     * different points can only be done once. This produced a measurable
     * performance improvement.
     */
    function projectExtrusion(geometry, zBase, zTop, m) {
        const projectedBase = [];
        const projectedTop = [];
        const baseXZ = m[8] * zBase;
        const baseYZ = m[9] * zBase;
        const baseZZ = m[10] * zBase;
        const baseWZ = m[11] * zBase;
        const topXZ = m[8] * zTop;
        const topYZ = m[9] * zTop;
        const topZZ = m[10] * zTop;
        const topWZ = m[11] * zTop;
        for (const r of geometry) {
            const ringBase = [];
            const ringTop = [];
            for (const p of r) {
                const x = p.x;
                const y = p.y;
                const sX = m[0] * x + m[4] * y + m[12];
                const sY = m[1] * x + m[5] * y + m[13];
                const sZ = m[2] * x + m[6] * y + m[14];
                const sW = m[3] * x + m[7] * y + m[15];
                const baseX = sX + baseXZ;
                const baseY = sY + baseYZ;
                const baseZ = sZ + baseZZ;
                const baseW = sW + baseWZ;
                const topX = sX + topXZ;
                const topY = sY + topYZ;
                const topZ = sZ + topZZ;
                const topW = sW + topWZ;
                const b = new pointGeometry(baseX / baseW, baseY / baseW);
                b.z = baseZ / baseW;
                ringBase.push(b);
                const t = new pointGeometry(topX / topW, topY / topW);
                t.z = topZ / topW;
                ringTop.push(t);
            }
            projectedBase.push(ringBase);
            projectedTop.push(ringTop);
        }
        return [projectedBase, projectedTop];
    }
    function projectQueryGeometry(queryGeometry, pixelPosMatrix, transform, z) {
        const projectedQueryGeometry = [];
        for (const p of queryGeometry) {
            const v = [p.x, p.y, z, 1];
            transformMat4(v, v, pixelPosMatrix);
            projectedQueryGeometry.push(new pointGeometry(v[0] / v[3], v[1] / v[3]));
        }
        return projectedQueryGeometry;
    }

    const lineLayoutAttributes = createLayout([
        { name: 'a_pos_normal', components: 2, type: 'Int16' },
        { name: 'a_data', components: 4, type: 'Uint8' }
    ], 4);
    const { members: members$1, size: size$1, alignment: alignment$1 } = lineLayoutAttributes;

    const lineLayoutAttributesExt = createLayout([
        { name: 'a_uv_x', components: 1, type: 'Float32' },
        { name: 'a_split_index', components: 1, type: 'Float32' },
    ]);
    const { members, size, alignment } = lineLayoutAttributesExt;

    const vectorTileFeatureTypes$1 = vectorTile.VectorTileFeature.types;
    // NOTE ON EXTRUDE SCALE:
    // scale the extrusion vector so that the normal length is this value.
    // contains the "texture" normals (-1..1). this is distinct from the extrude
    // normals for line joins, because the x-value remains 0 for the texture
    // normal array, while the extrude normal actually moves the vertex to create
    // the acute/bevelled line join.
    const EXTRUDE_SCALE = 63;
    /*
     * Sharp corners cause dashed lines to tilt because the distance along the line
     * is the same at both the inner and outer corners. To improve the appearance of
     * dashed lines we add extra points near sharp corners so that a smaller part
     * of the line is tilted.
     *
     * COS_HALF_SHARP_CORNER controls how sharp a corner has to be for us to add an
     * extra vertex. The default is 75 degrees.
     *
     * The newly created vertices are placed SHARP_CORNER_OFFSET pixels from the corner.
     */
    const COS_HALF_SHARP_CORNER = Math.cos(75 / 2 * (Math.PI / 180));
    const SHARP_CORNER_OFFSET = 15;
    // Angle per triangle for approximating round line joins.
    const DEG_PER_TRIANGLE = 20;
    // The number of bits that is used to store the line distance in the buffer.
    const LINE_DISTANCE_BUFFER_BITS = 15;
    // We don't have enough bits for the line distance as we'd like to have, so
    // use this value to scale the line distance (in tile units) down to a smaller
    // value. This lets us store longer distances while sacrificing precision.
    const LINE_DISTANCE_SCALE = 1 / 2;
    // The maximum line distance, in tile units, that fits in the buffer.
    const MAX_LINE_DISTANCE = Math.pow(2, LINE_DISTANCE_BUFFER_BITS - 1) / LINE_DISTANCE_SCALE;
    /**
     * @private
     */
    class LineBucket {
        constructor(options) {
            this.zoom = options.zoom;
            this.overscaling = options.overscaling;
            this.layers = options.layers;
            this.layerIds = this.layers.map(layer => layer.id);
            this.index = options.index;
            this.hasPattern = false;
            this.patternFeatures = [];
            this.lineClipsArray = [];
            this.gradients = {};
            this.layers.forEach(layer => {
                this.gradients[layer.id] = {};
            });
            this.layoutVertexArray = new LineLayoutArray();
            this.layoutVertexArray2 = new LineExtLayoutArray();
            this.indexArray = new TriangleIndexArray();
            this.programConfigurations = new ProgramConfigurationSet(options.layers, options.zoom);
            this.segments = new SegmentVector();
            this.maxLineLength = 0;
            this.stateDependentLayerIds = this.layers.filter((l) => l.isStateDependent()).map((l) => l.id);
        }
        populate(features, options, canonical) {
            this.hasPattern = hasPattern('line', this.layers, options);
            const lineSortKey = this.layers[0].layout.get('line-sort-key');
            const sortFeaturesByKey = !lineSortKey.isConstant();
            const bucketFeatures = [];
            for (const { feature, id, index, sourceLayerIndex } of features) {
                const needGeometry = this.layers[0]._featureFilter.needGeometry;
                const evaluationFeature = toEvaluationFeature(feature, needGeometry);
                if (!this.layers[0]._featureFilter.filter(new EvaluationParameters(this.zoom), evaluationFeature, canonical))
                    continue;
                const sortKey = sortFeaturesByKey ?
                    lineSortKey.evaluate(evaluationFeature, {}, canonical) :
                    undefined;
                const bucketFeature = {
                    id,
                    properties: feature.properties,
                    type: feature.type,
                    sourceLayerIndex,
                    index,
                    geometry: needGeometry ? evaluationFeature.geometry : loadGeometry(feature),
                    patterns: {},
                    sortKey
                };
                bucketFeatures.push(bucketFeature);
            }
            if (sortFeaturesByKey) {
                bucketFeatures.sort((a, b) => {
                    return (a.sortKey) - (b.sortKey);
                });
            }
            for (const bucketFeature of bucketFeatures) {
                const { geometry, index, sourceLayerIndex } = bucketFeature;
                if (this.hasPattern) {
                    const patternBucketFeature = addPatternDependencies('line', this.layers, bucketFeature, this.zoom, options);
                    // pattern features are added only once the pattern is loaded into the image atlas
                    // so are stored during populate until later updated with positions by tile worker in addFeatures
                    this.patternFeatures.push(patternBucketFeature);
                }
                else {
                    this.addFeature(bucketFeature, geometry, index, canonical, {});
                }
                const feature = features[index].feature;
                options.featureIndex.insert(feature, geometry, index, sourceLayerIndex, this.index);
            }
        }
        update(states, vtLayer, imagePositions) {
            if (!this.stateDependentLayers.length)
                return;
            this.programConfigurations.updatePaintArrays(states, vtLayer, this.stateDependentLayers, imagePositions);
        }
        addFeatures(options, canonical, imagePositions) {
            for (const feature of this.patternFeatures) {
                this.addFeature(feature, feature.geometry, feature.index, canonical, imagePositions);
            }
        }
        isEmpty() {
            return this.layoutVertexArray.length === 0;
        }
        uploadPending() {
            return !this.uploaded || this.programConfigurations.needsUpload;
        }
        upload(context) {
            if (!this.uploaded) {
                if (this.layoutVertexArray2.length !== 0) {
                    this.layoutVertexBuffer2 = context.createVertexBuffer(this.layoutVertexArray2, members);
                }
                this.layoutVertexBuffer = context.createVertexBuffer(this.layoutVertexArray, members$1);
                this.indexBuffer = context.createIndexBuffer(this.indexArray);
            }
            this.programConfigurations.upload(context);
            this.uploaded = true;
        }
        destroy() {
            if (!this.layoutVertexBuffer)
                return;
            this.layoutVertexBuffer.destroy();
            this.indexBuffer.destroy();
            this.programConfigurations.destroy();
            this.segments.destroy();
        }
        lineFeatureClips(feature) {
            if (!!feature.properties && Object.prototype.hasOwnProperty.call(feature.properties, 'mapbox_clip_start') && Object.prototype.hasOwnProperty.call(feature.properties, 'mapbox_clip_end')) {
                const start = +feature.properties['mapbox_clip_start'];
                const end = +feature.properties['mapbox_clip_end'];
                return { start, end };
            }
        }
        addFeature(feature, geometry, index, canonical, imagePositions) {
            const layout = this.layers[0].layout;
            const join = layout.get('line-join').evaluate(feature, {});
            const cap = layout.get('line-cap');
            const miterLimit = layout.get('line-miter-limit');
            const roundLimit = layout.get('line-round-limit');
            this.lineClips = this.lineFeatureClips(feature);
            for (const line of geometry) {
                this.addLine(line, feature, join, cap, miterLimit, roundLimit);
            }
            this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length, feature, index, imagePositions, canonical);
        }
        addLine(vertices, feature, join, cap, miterLimit, roundLimit) {
            this.distance = 0;
            this.scaledDistance = 0;
            this.totalDistance = 0;
            if (this.lineClips) {
                this.lineClipsArray.push(this.lineClips);
                // Calculate the total distance, in tile units, of this tiled line feature
                for (let i = 0; i < vertices.length - 1; i++) {
                    this.totalDistance += vertices[i].dist(vertices[i + 1]);
                }
                this.updateScaledDistance();
                this.maxLineLength = Math.max(this.maxLineLength, this.totalDistance);
            }
            const isPolygon = vectorTileFeatureTypes$1[feature.type] === 'Polygon';
            // If the line has duplicate vertices at the ends, adjust start/length to remove them.
            let len = vertices.length;
            while (len >= 2 && vertices[len - 1].equals(vertices[len - 2])) {
                len--;
            }
            let first = 0;
            while (first < len - 1 && vertices[first].equals(vertices[first + 1])) {
                first++;
            }
            // Ignore invalid geometry.
            if (len < (isPolygon ? 3 : 2))
                return;
            if (join === 'bevel')
                miterLimit = 1.05;
            const sharpCornerOffset = this.overscaling <= 16 ?
                SHARP_CORNER_OFFSET * EXTENT / (512 * this.overscaling) :
                0;
            // we could be more precise, but it would only save a negligible amount of space
            const segment = this.segments.prepareSegment(len * 10, this.layoutVertexArray, this.indexArray);
            let currentVertex;
            let prevVertex;
            let nextVertex;
            let prevNormal;
            let nextNormal;
            // the last two vertices added
            this.e1 = this.e2 = -1;
            if (isPolygon) {
                currentVertex = vertices[len - 2];
                nextNormal = vertices[first].sub(currentVertex)._unit()._perp();
            }
            for (let i = first; i < len; i++) {
                nextVertex = i === len - 1 ?
                    (isPolygon ? vertices[first + 1] : undefined) : // if it's a polygon, treat the last vertex like the first
                    vertices[i + 1]; // just the next vertex
                // if two consecutive vertices exist, skip the current one
                if (nextVertex && vertices[i].equals(nextVertex))
                    continue;
                if (nextNormal)
                    prevNormal = nextNormal;
                if (currentVertex)
                    prevVertex = currentVertex;
                currentVertex = vertices[i];
                // Calculate the normal towards the next vertex in this line. In case
                // there is no next vertex, pretend that the line is continuing straight,
                // meaning that we are just using the previous normal.
                nextNormal = nextVertex ? nextVertex.sub(currentVertex)._unit()._perp() : prevNormal;
                // If we still don't have a previous normal, this is the beginning of a
                // non-closed line, so we're doing a straight "join".
                prevNormal = prevNormal || nextNormal;
                // Determine the normal of the join extrusion. It is the angle bisector
                // of the segments between the previous line and the next line.
                // In the case of 180° angles, the prev and next normals cancel each other out:
                // prevNormal + nextNormal = (0, 0), its magnitude is 0, so the unit vector would be
                // undefined. In that case, we're keeping the joinNormal at (0, 0), so that the cosHalfAngle
                // below will also become 0 and miterLength will become Infinity.
                let joinNormal = prevNormal.add(nextNormal);
                if (joinNormal.x !== 0 || joinNormal.y !== 0) {
                    joinNormal._unit();
                }
                /*  joinNormal     prevNormal
                 *             ↖      ↑
                 *                .________. prevVertex
                 *                |
                 * nextNormal  ←  |  currentVertex
                 *                |
                 *     nextVertex !
                 *
                 */
                // calculate cosines of the angle (and its half) using dot product
                const cosAngle = prevNormal.x * nextNormal.x + prevNormal.y * nextNormal.y;
                const cosHalfAngle = joinNormal.x * nextNormal.x + joinNormal.y * nextNormal.y;
                // Calculate the length of the miter (the ratio of the miter to the width)
                // as the inverse of cosine of the angle between next and join normals
                const miterLength = cosHalfAngle !== 0 ? 1 / cosHalfAngle : Infinity;
                // approximate angle from cosine
                const approxAngle = 2 * Math.sqrt(2 - 2 * cosHalfAngle);
                const isSharpCorner = cosHalfAngle < COS_HALF_SHARP_CORNER && prevVertex && nextVertex;
                const lineTurnsLeft = prevNormal.x * nextNormal.y - prevNormal.y * nextNormal.x > 0;
                if (isSharpCorner && i > first) {
                    const prevSegmentLength = currentVertex.dist(prevVertex);
                    if (prevSegmentLength > 2 * sharpCornerOffset) {
                        const newPrevVertex = currentVertex.sub(currentVertex.sub(prevVertex)._mult(sharpCornerOffset / prevSegmentLength)._round());
                        this.updateDistance(prevVertex, newPrevVertex);
                        this.addCurrentVertex(newPrevVertex, prevNormal, 0, 0, segment);
                        prevVertex = newPrevVertex;
                    }
                }
                // The join if a middle vertex, otherwise the cap.
                const middleVertex = prevVertex && nextVertex;
                let currentJoin = middleVertex ? join : isPolygon ? 'butt' : cap;
                if (middleVertex && currentJoin === 'round') {
                    if (miterLength < roundLimit) {
                        currentJoin = 'miter';
                    }
                    else if (miterLength <= 2) {
                        currentJoin = 'fakeround';
                    }
                }
                if (currentJoin === 'miter' && miterLength > miterLimit) {
                    currentJoin = 'bevel';
                }
                if (currentJoin === 'bevel') {
                    // The maximum extrude length is 128 / 63 = 2 times the width of the line
                    // so if miterLength >= 2 we need to draw a different type of bevel here.
                    if (miterLength > 2)
                        currentJoin = 'flipbevel';
                    // If the miterLength is really small and the line bevel wouldn't be visible,
                    // just draw a miter join to save a triangle.
                    if (miterLength < miterLimit)
                        currentJoin = 'miter';
                }
                // Calculate how far along the line the currentVertex is
                if (prevVertex)
                    this.updateDistance(prevVertex, currentVertex);
                if (currentJoin === 'miter') {
                    joinNormal._mult(miterLength);
                    this.addCurrentVertex(currentVertex, joinNormal, 0, 0, segment);
                }
                else if (currentJoin === 'flipbevel') {
                    // miter is too big, flip the direction to make a beveled join
                    if (miterLength > 100) {
                        // Almost parallel lines
                        joinNormal = nextNormal.mult(-1);
                    }
                    else {
                        const bevelLength = miterLength * prevNormal.add(nextNormal).mag() / prevNormal.sub(nextNormal).mag();
                        joinNormal._perp()._mult(bevelLength * (lineTurnsLeft ? -1 : 1));
                    }
                    this.addCurrentVertex(currentVertex, joinNormal, 0, 0, segment);
                    this.addCurrentVertex(currentVertex, joinNormal.mult(-1), 0, 0, segment);
                }
                else if (currentJoin === 'bevel' || currentJoin === 'fakeround') {
                    const offset = -Math.sqrt(miterLength * miterLength - 1);
                    const offsetA = lineTurnsLeft ? offset : 0;
                    const offsetB = lineTurnsLeft ? 0 : offset;
                    // Close previous segment with a bevel
                    if (prevVertex) {
                        this.addCurrentVertex(currentVertex, prevNormal, offsetA, offsetB, segment);
                    }
                    if (currentJoin === 'fakeround') {
                        // The join angle is sharp enough that a round join would be visible.
                        // Bevel joins fill the gap between segments with a single pie slice triangle.
                        // Create a round join by adding multiple pie slices. The join isn't actually round, but
                        // it looks like it is at the sizes we render lines at.
                        // pick the number of triangles for approximating round join by based on the angle between normals
                        const n = Math.round((approxAngle * 180 / Math.PI) / DEG_PER_TRIANGLE);
                        for (let m = 1; m < n; m++) {
                            let t = m / n;
                            if (t !== 0.5) {
                                // approximate spherical interpolation https://observablehq.com/@mourner/approximating-geometric-slerp
                                const t2 = t - 0.5;
                                const A = 1.0904 + cosAngle * (-3.2452 + cosAngle * (3.55645 - cosAngle * 1.43519));
                                const B = 0.848013 + cosAngle * (-1.06021 + cosAngle * 0.215638);
                                t = t + t * t2 * (t - 1) * (A * t2 * t2 + B);
                            }
                            const extrude = nextNormal.sub(prevNormal)._mult(t)._add(prevNormal)._unit()._mult(lineTurnsLeft ? -1 : 1);
                            this.addHalfVertex(currentVertex, extrude.x, extrude.y, false, lineTurnsLeft, 0, segment);
                        }
                    }
                    if (nextVertex) {
                        // Start next segment
                        this.addCurrentVertex(currentVertex, nextNormal, -offsetA, -offsetB, segment);
                    }
                }
                else if (currentJoin === 'butt') {
                    this.addCurrentVertex(currentVertex, joinNormal, 0, 0, segment); // butt cap
                }
                else if (currentJoin === 'square') {
                    const offset = prevVertex ? 1 : -1; // closing or starting square cap
                    this.addCurrentVertex(currentVertex, joinNormal, offset, offset, segment);
                }
                else if (currentJoin === 'round') {
                    if (prevVertex) {
                        // Close previous segment with butt
                        this.addCurrentVertex(currentVertex, prevNormal, 0, 0, segment);
                        // Add round cap or linejoin at end of segment
                        this.addCurrentVertex(currentVertex, prevNormal, 1, 1, segment, true);
                    }
                    if (nextVertex) {
                        // Add round cap before first segment
                        this.addCurrentVertex(currentVertex, nextNormal, -1, -1, segment, true);
                        // Start next segment with a butt
                        this.addCurrentVertex(currentVertex, nextNormal, 0, 0, segment);
                    }
                }
                if (isSharpCorner && i < len - 1) {
                    const nextSegmentLength = currentVertex.dist(nextVertex);
                    if (nextSegmentLength > 2 * sharpCornerOffset) {
                        const newCurrentVertex = currentVertex.add(nextVertex.sub(currentVertex)._mult(sharpCornerOffset / nextSegmentLength)._round());
                        this.updateDistance(currentVertex, newCurrentVertex);
                        this.addCurrentVertex(newCurrentVertex, nextNormal, 0, 0, segment);
                        currentVertex = newCurrentVertex;
                    }
                }
            }
        }
        /**
         * Add two vertices to the buffers.
         *
         * @param p the line vertex to add buffer vertices for
         * @param normal vertex normal
         * @param endLeft extrude to shift the left vertex along the line
         * @param endRight extrude to shift the left vertex along the line
         * @param segment the segment object to add the vertex to
         * @param round whether this is a round cap
         * @private
         */
        addCurrentVertex(p, normal, endLeft, endRight, segment, round = false) {
            // left and right extrude vectors, perpendicularly shifted by endLeft/endRight
            const leftX = normal.x + normal.y * endLeft;
            const leftY = normal.y - normal.x * endLeft;
            const rightX = -normal.x + normal.y * endRight;
            const rightY = -normal.y - normal.x * endRight;
            this.addHalfVertex(p, leftX, leftY, round, false, endLeft, segment);
            this.addHalfVertex(p, rightX, rightY, round, true, -endRight, segment);
            // There is a maximum "distance along the line" that we can store in the buffers.
            // When we get close to the distance, reset it to zero and add the vertex again with
            // a distance of zero. The max distance is determined by the number of bits we allocate
            // to `linesofar`.
            if (this.distance > MAX_LINE_DISTANCE / 2 && this.totalDistance === 0) {
                this.distance = 0;
                this.addCurrentVertex(p, normal, endLeft, endRight, segment, round);
            }
        }
        addHalfVertex({ x, y }, extrudeX, extrudeY, round, up, dir, segment) {
            const totalDistance = this.lineClips ? this.scaledDistance * (MAX_LINE_DISTANCE - 1) : this.scaledDistance;
            // scale down so that we can store longer distances while sacrificing precision.
            const linesofarScaled = totalDistance * LINE_DISTANCE_SCALE;
            this.layoutVertexArray.emplaceBack(
            // a_pos_normal
            // Encode round/up the least significant bits
            (x << 1) + (round ? 1 : 0), (y << 1) + (up ? 1 : 0), 
            // a_data
            // add 128 to store a byte in an unsigned byte
            Math.round(EXTRUDE_SCALE * extrudeX) + 128, Math.round(EXTRUDE_SCALE * extrudeY) + 128, 
            // Encode the -1/0/1 direction value into the first two bits of .z of a_data.
            // Combine it with the lower 6 bits of `linesofarScaled` (shifted by 2 bits to make
            // room for the direction value). The upper 8 bits of `linesofarScaled` are placed in
            // the `w` component.
            ((dir === 0 ? 0 : (dir < 0 ? -1 : 1)) + 1) | ((linesofarScaled & 0x3F) << 2), linesofarScaled >> 6);
            // Constructs a second vertex buffer with higher precision line progress
            if (this.lineClips) {
                const progressRealigned = this.scaledDistance - this.lineClips.start;
                const endClipRealigned = this.lineClips.end - this.lineClips.start;
                const uvX = progressRealigned / endClipRealigned;
                this.layoutVertexArray2.emplaceBack(uvX, this.lineClipsArray.length);
            }
            const e = segment.vertexLength++;
            if (this.e1 >= 0 && this.e2 >= 0) {
                this.indexArray.emplaceBack(this.e1, this.e2, e);
                segment.primitiveLength++;
            }
            if (up) {
                this.e2 = e;
            }
            else {
                this.e1 = e;
            }
        }
        updateScaledDistance() {
            // Knowing the ratio of the full linestring covered by this tiled feature, as well
            // as the total distance (in tile units) of this tiled feature, and the distance
            // (in tile units) of the current vertex, we can determine the relative distance
            // of this vertex along the full linestring feature and scale it to [0, 2^15)
            this.scaledDistance = this.lineClips ?
                this.lineClips.start + (this.lineClips.end - this.lineClips.start) * this.distance / this.totalDistance :
                this.distance;
        }
        updateDistance(prev, next) {
            this.distance += prev.dist(next);
            this.updateScaledDistance();
        }
    }
    register('LineBucket', LineBucket, { omit: ['layers', 'patternFeatures'] });

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const layout$1 = new Properties({
        "line-cap": new DataConstantProperty(spec["layout_line"]["line-cap"]),
        "line-join": new DataDrivenProperty(spec["layout_line"]["line-join"]),
        "line-miter-limit": new DataConstantProperty(spec["layout_line"]["line-miter-limit"]),
        "line-round-limit": new DataConstantProperty(spec["layout_line"]["line-round-limit"]),
        "line-sort-key": new DataDrivenProperty(spec["layout_line"]["line-sort-key"]),
    });
    const paint$3 = new Properties({
        "line-opacity": new DataDrivenProperty(spec["paint_line"]["line-opacity"]),
        "line-color": new DataDrivenProperty(spec["paint_line"]["line-color"]),
        "line-translate": new DataConstantProperty(spec["paint_line"]["line-translate"]),
        "line-translate-anchor": new DataConstantProperty(spec["paint_line"]["line-translate-anchor"]),
        "line-width": new DataDrivenProperty(spec["paint_line"]["line-width"]),
        "line-gap-width": new DataDrivenProperty(spec["paint_line"]["line-gap-width"]),
        "line-offset": new DataDrivenProperty(spec["paint_line"]["line-offset"]),
        "line-blur": new DataDrivenProperty(spec["paint_line"]["line-blur"]),
        "line-dasharray": new CrossFadedProperty(spec["paint_line"]["line-dasharray"]),
        "line-pattern": new CrossFadedDataDrivenProperty(spec["paint_line"]["line-pattern"]),
        "line-gradient": new ColorRampProperty(spec["paint_line"]["line-gradient"]),
    });
    var properties$3 = { paint: paint$3, layout: layout$1 };

    class LineFloorwidthProperty extends DataDrivenProperty {
        possiblyEvaluate(value, parameters) {
            parameters = new EvaluationParameters(Math.floor(parameters.zoom), {
                now: parameters.now,
                fadeDuration: parameters.fadeDuration,
                zoomHistory: parameters.zoomHistory,
                transition: parameters.transition
            });
            return super.possiblyEvaluate(value, parameters);
        }
        evaluate(value, globals, feature, featureState) {
            globals = extend$1({}, globals, { zoom: Math.floor(globals.zoom) });
            return super.evaluate(value, globals, feature, featureState);
        }
    }
    const lineFloorwidthProperty = new LineFloorwidthProperty(properties$3.paint.properties['line-width'].specification);
    lineFloorwidthProperty.useIntegerZoom = true;
    class LineStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties$3);
            this.gradientVersion = 0;
        }
        _handleSpecialPaintPropertyUpdate(name) {
            if (name === 'line-gradient') {
                const expression = this._transitionablePaint._values['line-gradient'].value.expression;
                this.stepInterpolant = expression._styleExpression.expression instanceof Step;
                this.gradientVersion = (this.gradientVersion + 1) % Number.MAX_SAFE_INTEGER;
            }
        }
        gradientExpression() {
            return this._transitionablePaint._values['line-gradient'].value.expression;
        }
        recalculate(parameters, availableImages) {
            super.recalculate(parameters, availableImages);
            this.paint._values['line-floorwidth'] =
                lineFloorwidthProperty.possiblyEvaluate(this._transitioningPaint._values['line-width'].value, parameters);
        }
        createBucket(parameters) {
            return new LineBucket(parameters);
        }
        queryRadius(bucket) {
            const lineBucket = bucket;
            const width = getLineWidth(getMaximumPaintValue('line-width', this, lineBucket), getMaximumPaintValue('line-gap-width', this, lineBucket));
            const offset = getMaximumPaintValue('line-offset', this, lineBucket);
            return width / 2 + Math.abs(offset) + translateDistance(this.paint.get('line-translate'));
        }
        queryIntersectsFeature(queryGeometry, feature, featureState, geometry, zoom, transform, pixelsToTileUnits) {
            const translatedPolygon = translate(queryGeometry, this.paint.get('line-translate'), this.paint.get('line-translate-anchor'), transform.angle, pixelsToTileUnits);
            const halfWidth = pixelsToTileUnits / 2 * getLineWidth(this.paint.get('line-width').evaluate(feature, featureState), this.paint.get('line-gap-width').evaluate(feature, featureState));
            const lineOffset = this.paint.get('line-offset').evaluate(feature, featureState);
            if (lineOffset) {
                geometry = offsetLine(geometry, lineOffset * pixelsToTileUnits);
            }
            return polygonIntersectsBufferedMultiLine(translatedPolygon, geometry, halfWidth);
        }
        isTileClipped() {
            return true;
        }
    }
    function getLineWidth(lineWidth, lineGapWidth) {
        if (lineGapWidth > 0) {
            return lineGapWidth + 2 * lineWidth;
        }
        else {
            return lineWidth;
        }
    }

    const symbolLayoutAttributes = createLayout([
        { name: 'a_pos_offset', components: 4, type: 'Int16' },
        { name: 'a_data', components: 4, type: 'Uint16' },
        { name: 'a_pixeloffset', components: 4, type: 'Int16' }
    ], 4);
    const dynamicLayoutAttributes = createLayout([
        { name: 'a_projected_pos', components: 3, type: 'Float32' }
    ], 4);
    createLayout([
        { name: 'a_fade_opacity', components: 1, type: 'Uint32' }
    ], 4);
    const collisionVertexAttributes = createLayout([
        { name: 'a_placed', components: 2, type: 'Uint8' },
        { name: 'a_shift', components: 2, type: 'Float32' }
    ]);
    createLayout([
        // the box is centered around the anchor point
        { type: 'Int16', name: 'anchorPointX' },
        { type: 'Int16', name: 'anchorPointY' },
        // distances to the edges from the anchor
        { type: 'Int16', name: 'x1' },
        { type: 'Int16', name: 'y1' },
        { type: 'Int16', name: 'x2' },
        { type: 'Int16', name: 'y2' },
        // the index of the feature in the original vectortile
        { type: 'Uint32', name: 'featureIndex' },
        // the source layer the feature appears in
        { type: 'Uint16', name: 'sourceLayerIndex' },
        // the bucket the feature appears in
        { type: 'Uint16', name: 'bucketIndex' },
    ]);
    const collisionBoxLayout = createLayout([
        { name: 'a_pos', components: 2, type: 'Int16' },
        { name: 'a_anchor_pos', components: 2, type: 'Int16' },
        { name: 'a_extrude', components: 2, type: 'Int16' }
    ], 4);
    createLayout([
        { name: 'a_pos', components: 2, type: 'Float32' },
        { name: 'a_radius', components: 1, type: 'Float32' },
        { name: 'a_flags', components: 2, type: 'Int16' }
    ], 4);
    createLayout([
        { name: 'triangle', components: 3, type: 'Uint16' },
    ]);
    createLayout([
        { type: 'Int16', name: 'anchorX' },
        { type: 'Int16', name: 'anchorY' },
        { type: 'Uint16', name: 'glyphStartIndex' },
        { type: 'Uint16', name: 'numGlyphs' },
        { type: 'Uint32', name: 'vertexStartIndex' },
        { type: 'Uint32', name: 'lineStartIndex' },
        { type: 'Uint32', name: 'lineLength' },
        { type: 'Uint16', name: 'segment' },
        { type: 'Uint16', name: 'lowerSize' },
        { type: 'Uint16', name: 'upperSize' },
        { type: 'Float32', name: 'lineOffsetX' },
        { type: 'Float32', name: 'lineOffsetY' },
        { type: 'Uint8', name: 'writingMode' },
        { type: 'Uint8', name: 'placedOrientation' },
        { type: 'Uint8', name: 'hidden' },
        { type: 'Uint32', name: 'crossTileID' },
        { type: 'Int16', name: 'associatedIconIndex' }
    ]);
    createLayout([
        { type: 'Int16', name: 'anchorX' },
        { type: 'Int16', name: 'anchorY' },
        { type: 'Int16', name: 'rightJustifiedTextSymbolIndex' },
        { type: 'Int16', name: 'centerJustifiedTextSymbolIndex' },
        { type: 'Int16', name: 'leftJustifiedTextSymbolIndex' },
        { type: 'Int16', name: 'verticalPlacedTextSymbolIndex' },
        { type: 'Int16', name: 'placedIconSymbolIndex' },
        { type: 'Int16', name: 'verticalPlacedIconSymbolIndex' },
        { type: 'Uint16', name: 'key' },
        { type: 'Uint16', name: 'textBoxStartIndex' },
        { type: 'Uint16', name: 'textBoxEndIndex' },
        { type: 'Uint16', name: 'verticalTextBoxStartIndex' },
        { type: 'Uint16', name: 'verticalTextBoxEndIndex' },
        { type: 'Uint16', name: 'iconBoxStartIndex' },
        { type: 'Uint16', name: 'iconBoxEndIndex' },
        { type: 'Uint16', name: 'verticalIconBoxStartIndex' },
        { type: 'Uint16', name: 'verticalIconBoxEndIndex' },
        { type: 'Uint16', name: 'featureIndex' },
        { type: 'Uint16', name: 'numHorizontalGlyphVertices' },
        { type: 'Uint16', name: 'numVerticalGlyphVertices' },
        { type: 'Uint16', name: 'numIconVertices' },
        { type: 'Uint16', name: 'numVerticalIconVertices' },
        { type: 'Uint16', name: 'useRuntimeCollisionCircles' },
        { type: 'Uint32', name: 'crossTileID' },
        { type: 'Float32', name: 'textBoxScale' },
        { type: 'Float32', components: 2, name: 'textOffset' },
        { type: 'Float32', name: 'collisionCircleDiameter' },
    ]);
    createLayout([
        { type: 'Float32', name: 'offsetX' }
    ]);
    createLayout([
        { type: 'Int16', name: 'x' },
        { type: 'Int16', name: 'y' },
        { type: 'Int16', name: 'tileUnitDistanceFromAnchor' }
    ]);

    function transformTextInternal(text, layer, feature) {
        const transform = layer.layout.get('text-transform').evaluate(feature, {});
        if (transform === 'uppercase') {
            text = text.toLocaleUpperCase();
        }
        else if (transform === 'lowercase') {
            text = text.toLocaleLowerCase();
        }
        if (plugin.applyArabicShaping) {
            text = plugin.applyArabicShaping(text);
        }
        return text;
    }
    function transformText(text, layer, feature) {
        text.sections.forEach(section => {
            section.text = transformTextInternal(section.text, layer, feature);
        });
        return text;
    }

    function mergeLines(features) {
        const leftIndex = {};
        const rightIndex = {};
        const mergedFeatures = [];
        let mergedIndex = 0;
        function add(k) {
            mergedFeatures.push(features[k]);
            mergedIndex++;
        }
        function mergeFromRight(leftKey, rightKey, geom) {
            const i = rightIndex[leftKey];
            delete rightIndex[leftKey];
            rightIndex[rightKey] = i;
            mergedFeatures[i].geometry[0].pop();
            mergedFeatures[i].geometry[0] = mergedFeatures[i].geometry[0].concat(geom[0]);
            return i;
        }
        function mergeFromLeft(leftKey, rightKey, geom) {
            const i = leftIndex[rightKey];
            delete leftIndex[rightKey];
            leftIndex[leftKey] = i;
            mergedFeatures[i].geometry[0].shift();
            mergedFeatures[i].geometry[0] = geom[0].concat(mergedFeatures[i].geometry[0]);
            return i;
        }
        function getKey(text, geom, onRight) {
            const point = onRight ? geom[0][geom[0].length - 1] : geom[0][0];
            return `${text}:${point.x}:${point.y}`;
        }
        for (let k = 0; k < features.length; k++) {
            const feature = features[k];
            const geom = feature.geometry;
            const text = feature.text ? feature.text.toString() : null;
            if (!text) {
                add(k);
                continue;
            }
            const leftKey = getKey(text, geom), rightKey = getKey(text, geom, true);
            if ((leftKey in rightIndex) && (rightKey in leftIndex) && (rightIndex[leftKey] !== leftIndex[rightKey])) {
                // found lines with the same text adjacent to both ends of the current line, merge all three
                const j = mergeFromLeft(leftKey, rightKey, geom);
                const i = mergeFromRight(leftKey, rightKey, mergedFeatures[j].geometry);
                delete leftIndex[leftKey];
                delete rightIndex[rightKey];
                rightIndex[getKey(text, mergedFeatures[i].geometry, true)] = i;
                mergedFeatures[j].geometry = null;
            }
            else if (leftKey in rightIndex) {
                // found mergeable line adjacent to the start of the current line, merge
                mergeFromRight(leftKey, rightKey, geom);
            }
            else if (rightKey in leftIndex) {
                // found mergeable line adjacent to the end of the current line, merge
                mergeFromLeft(leftKey, rightKey, geom);
            }
            else {
                // no adjacent lines, add as a new item
                add(k);
                leftIndex[leftKey] = mergedIndex - 1;
                rightIndex[rightKey] = mergedIndex - 1;
            }
        }
        return mergedFeatures.filter((f) => f.geometry);
    }

    const verticalizedCharacterMap = {
        '!': '︕',
        '#': '＃',
        '$': '＄',
        '%': '％',
        '&': '＆',
        '(': '︵',
        ')': '︶',
        '*': '＊',
        '+': '＋',
        ',': '︐',
        '-': '︲',
        '.': '・',
        '/': '／',
        ':': '︓',
        ';': '︔',
        '<': '︿',
        '=': '＝',
        '>': '﹀',
        '?': '︖',
        '@': '＠',
        '[': '﹇',
        '\\': '＼',
        ']': '﹈',
        '^': '＾',
        '_': '︳',
        '`': '｀',
        '{': '︷',
        '|': '―',
        '}': '︸',
        '~': '～',
        '¢': '￠',
        '£': '￡',
        '¥': '￥',
        '¦': '￤',
        '¬': '￢',
        '¯': '￣',
        '–': '︲',
        '—': '︱',
        '‘': '﹃',
        '’': '﹄',
        '“': '﹁',
        '”': '﹂',
        '…': '︙',
        '‧': '・',
        '₩': '￦',
        '、': '︑',
        '。': '︒',
        '〈': '︿',
        '〉': '﹀',
        '《': '︽',
        '》': '︾',
        '「': '﹁',
        '」': '﹂',
        '『': '﹃',
        '』': '﹄',
        '【': '︻',
        '】': '︼',
        '〔': '︹',
        '〕': '︺',
        '〖': '︗',
        '〗': '︘',
        '！': '︕',
        '（': '︵',
        '）': '︶',
        '，': '︐',
        '－': '︲',
        '．': '・',
        '：': '︓',
        '；': '︔',
        '＜': '︿',
        '＞': '﹀',
        '？': '︖',
        '［': '﹇',
        '］': '﹈',
        '＿': '︳',
        '｛': '︷',
        '｜': '―',
        '｝': '︸',
        '｟': '︵',
        '｠': '︶',
        '｡': '︒',
        '｢': '﹁',
        '｣': '﹂'
    };
    function verticalizePunctuation(input) {
        let output = '';
        for (let i = 0; i < input.length; i++) {
            const nextCharCode = input.charCodeAt(i + 1) || null;
            const prevCharCode = input.charCodeAt(i - 1) || null;
            const canReplacePunctuation = ((!nextCharCode || !charHasRotatedVerticalOrientation(nextCharCode) || verticalizedCharacterMap[input[i + 1]]) &&
                (!prevCharCode || !charHasRotatedVerticalOrientation(prevCharCode) || verticalizedCharacterMap[input[i - 1]]));
            if (canReplacePunctuation && verticalizedCharacterMap[input[i]]) {
                output += verticalizedCharacterMap[input[i]];
            }
            else {
                output += input[i];
            }
        }
        return output;
    }

    // ONE_EM constant used to go between "em" units used in style spec and "points" used internally for layout
    var ONE_EM = 24;

    var ieee754$1 = {};

    /*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */

    ieee754$1.read = function (buffer, offset, isLE, mLen, nBytes) {
      var e, m;
      var eLen = (nBytes * 8) - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE ? (nBytes - 1) : 0;
      var d = isLE ? -1 : 1;
      var s = buffer[offset + i];

      i += d;

      e = s & ((1 << (-nBits)) - 1);
      s >>= (-nBits);
      nBits += eLen;
      for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

      m = e & ((1 << (-nBits)) - 1);
      e >>= (-nBits);
      nBits += mLen;
      for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : ((s ? -1 : 1) * Infinity)
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
    };

    ieee754$1.write = function (buffer, value, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = (nBytes * 8) - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
      var i = isLE ? 0 : (nBytes - 1);
      var d = isLE ? 1 : -1;
      var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

      value = Math.abs(value);

      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }

        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = ((value * c) - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }

      for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

      e = (e << mLen) | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

      buffer[offset + i - d] |= s * 128;
    };

    var pbf = Pbf$1;

    var ieee754 = ieee754$1;

    function Pbf$1(buf) {
        this.buf = ArrayBuffer.isView && ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf || 0);
        this.pos = 0;
        this.type = 0;
        this.length = this.buf.length;
    }

    Pbf$1.Varint  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
    Pbf$1.Fixed64 = 1; // 64-bit: double, fixed64, sfixed64
    Pbf$1.Bytes   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
    Pbf$1.Fixed32 = 5; // 32-bit: float, fixed32, sfixed32

    var SHIFT_LEFT_32 = (1 << 16) * (1 << 16),
        SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

    // Threshold chosen based on both benchmarking and knowledge about browser string
    // data structures (which currently switch structure types at 12 bytes or more)
    var TEXT_DECODER_MIN_LENGTH = 12;
    var utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf8');

    Pbf$1.prototype = {

        destroy: function() {
            this.buf = null;
        },

        // === READING =================================================================

        readFields: function(readField, result, end) {
            end = end || this.length;

            while (this.pos < end) {
                var val = this.readVarint(),
                    tag = val >> 3,
                    startPos = this.pos;

                this.type = val & 0x7;
                readField(tag, result, this);

                if (this.pos === startPos) this.skip(val);
            }
            return result;
        },

        readMessage: function(readField, result) {
            return this.readFields(readField, result, this.readVarint() + this.pos);
        },

        readFixed32: function() {
            var val = readUInt32(this.buf, this.pos);
            this.pos += 4;
            return val;
        },

        readSFixed32: function() {
            var val = readInt32(this.buf, this.pos);
            this.pos += 4;
            return val;
        },

        // 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

        readFixed64: function() {
            var val = readUInt32(this.buf, this.pos) + readUInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
            this.pos += 8;
            return val;
        },

        readSFixed64: function() {
            var val = readUInt32(this.buf, this.pos) + readInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
            this.pos += 8;
            return val;
        },

        readFloat: function() {
            var val = ieee754.read(this.buf, this.pos, true, 23, 4);
            this.pos += 4;
            return val;
        },

        readDouble: function() {
            var val = ieee754.read(this.buf, this.pos, true, 52, 8);
            this.pos += 8;
            return val;
        },

        readVarint: function(isSigned) {
            var buf = this.buf,
                val, b;

            b = buf[this.pos++]; val  =  b & 0x7f;        if (b < 0x80) return val;
            b = buf[this.pos++]; val |= (b & 0x7f) << 7;  if (b < 0x80) return val;
            b = buf[this.pos++]; val |= (b & 0x7f) << 14; if (b < 0x80) return val;
            b = buf[this.pos++]; val |= (b & 0x7f) << 21; if (b < 0x80) return val;
            b = buf[this.pos];   val |= (b & 0x0f) << 28;

            return readVarintRemainder(val, isSigned, this);
        },

        readVarint64: function() { // for compatibility with v2.0.1
            return this.readVarint(true);
        },

        readSVarint: function() {
            var num = this.readVarint();
            return num % 2 === 1 ? (num + 1) / -2 : num / 2; // zigzag encoding
        },

        readBoolean: function() {
            return Boolean(this.readVarint());
        },

        readString: function() {
            var end = this.readVarint() + this.pos;
            var pos = this.pos;
            this.pos = end;

            if (end - pos >= TEXT_DECODER_MIN_LENGTH && utf8TextDecoder) {
                // longer strings are fast with the built-in browser TextDecoder API
                return readUtf8TextDecoder(this.buf, pos, end);
            }
            // short strings are fast with our custom implementation
            return readUtf8(this.buf, pos, end);
        },

        readBytes: function() {
            var end = this.readVarint() + this.pos,
                buffer = this.buf.subarray(this.pos, end);
            this.pos = end;
            return buffer;
        },

        // verbose for performance reasons; doesn't affect gzipped size

        readPackedVarint: function(arr, isSigned) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readVarint(isSigned));
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readVarint(isSigned));
            return arr;
        },
        readPackedSVarint: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readSVarint());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readSVarint());
            return arr;
        },
        readPackedBoolean: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readBoolean());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readBoolean());
            return arr;
        },
        readPackedFloat: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readFloat());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readFloat());
            return arr;
        },
        readPackedDouble: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readDouble());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readDouble());
            return arr;
        },
        readPackedFixed32: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readFixed32());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readFixed32());
            return arr;
        },
        readPackedSFixed32: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readSFixed32());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readSFixed32());
            return arr;
        },
        readPackedFixed64: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readFixed64());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readFixed64());
            return arr;
        },
        readPackedSFixed64: function(arr) {
            if (this.type !== Pbf$1.Bytes) return arr.push(this.readSFixed64());
            var end = readPackedEnd(this);
            arr = arr || [];
            while (this.pos < end) arr.push(this.readSFixed64());
            return arr;
        },

        skip: function(val) {
            var type = val & 0x7;
            if (type === Pbf$1.Varint) while (this.buf[this.pos++] > 0x7f) {}
            else if (type === Pbf$1.Bytes) this.pos = this.readVarint() + this.pos;
            else if (type === Pbf$1.Fixed32) this.pos += 4;
            else if (type === Pbf$1.Fixed64) this.pos += 8;
            else throw new Error('Unimplemented type: ' + type);
        },

        // === WRITING =================================================================

        writeTag: function(tag, type) {
            this.writeVarint((tag << 3) | type);
        },

        realloc: function(min) {
            var length = this.length || 16;

            while (length < this.pos + min) length *= 2;

            if (length !== this.length) {
                var buf = new Uint8Array(length);
                buf.set(this.buf);
                this.buf = buf;
                this.length = length;
            }
        },

        finish: function() {
            this.length = this.pos;
            this.pos = 0;
            return this.buf.subarray(0, this.length);
        },

        writeFixed32: function(val) {
            this.realloc(4);
            writeInt32(this.buf, val, this.pos);
            this.pos += 4;
        },

        writeSFixed32: function(val) {
            this.realloc(4);
            writeInt32(this.buf, val, this.pos);
            this.pos += 4;
        },

        writeFixed64: function(val) {
            this.realloc(8);
            writeInt32(this.buf, val & -1, this.pos);
            writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
            this.pos += 8;
        },

        writeSFixed64: function(val) {
            this.realloc(8);
            writeInt32(this.buf, val & -1, this.pos);
            writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
            this.pos += 8;
        },

        writeVarint: function(val) {
            val = +val || 0;

            if (val > 0xfffffff || val < 0) {
                writeBigVarint(val, this);
                return;
            }

            this.realloc(4);

            this.buf[this.pos++] =           val & 0x7f  | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
            this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
            this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
            this.buf[this.pos++] =   (val >>> 7) & 0x7f;
        },

        writeSVarint: function(val) {
            this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2);
        },

        writeBoolean: function(val) {
            this.writeVarint(Boolean(val));
        },

        writeString: function(str) {
            str = String(str);
            this.realloc(str.length * 4);

            this.pos++; // reserve 1 byte for short string length

            var startPos = this.pos;
            // write the string directly to the buffer and see how much was written
            this.pos = writeUtf8(this.buf, str, this.pos);
            var len = this.pos - startPos;

            if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

            // finally, write the message length in the reserved place and restore the position
            this.pos = startPos - 1;
            this.writeVarint(len);
            this.pos += len;
        },

        writeFloat: function(val) {
            this.realloc(4);
            ieee754.write(this.buf, val, this.pos, true, 23, 4);
            this.pos += 4;
        },

        writeDouble: function(val) {
            this.realloc(8);
            ieee754.write(this.buf, val, this.pos, true, 52, 8);
            this.pos += 8;
        },

        writeBytes: function(buffer) {
            var len = buffer.length;
            this.writeVarint(len);
            this.realloc(len);
            for (var i = 0; i < len; i++) this.buf[this.pos++] = buffer[i];
        },

        writeRawMessage: function(fn, obj) {
            this.pos++; // reserve 1 byte for short message length

            // write the message directly to the buffer and see how much was written
            var startPos = this.pos;
            fn(obj, this);
            var len = this.pos - startPos;

            if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

            // finally, write the message length in the reserved place and restore the position
            this.pos = startPos - 1;
            this.writeVarint(len);
            this.pos += len;
        },

        writeMessage: function(tag, fn, obj) {
            this.writeTag(tag, Pbf$1.Bytes);
            this.writeRawMessage(fn, obj);
        },

        writePackedVarint:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedVarint, arr);   },
        writePackedSVarint:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSVarint, arr);  },
        writePackedBoolean:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedBoolean, arr);  },
        writePackedFloat:    function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFloat, arr);    },
        writePackedDouble:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedDouble, arr);   },
        writePackedFixed32:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed32, arr);  },
        writePackedSFixed32: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed32, arr); },
        writePackedFixed64:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed64, arr);  },
        writePackedSFixed64: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed64, arr); },

        writeBytesField: function(tag, buffer) {
            this.writeTag(tag, Pbf$1.Bytes);
            this.writeBytes(buffer);
        },
        writeFixed32Field: function(tag, val) {
            this.writeTag(tag, Pbf$1.Fixed32);
            this.writeFixed32(val);
        },
        writeSFixed32Field: function(tag, val) {
            this.writeTag(tag, Pbf$1.Fixed32);
            this.writeSFixed32(val);
        },
        writeFixed64Field: function(tag, val) {
            this.writeTag(tag, Pbf$1.Fixed64);
            this.writeFixed64(val);
        },
        writeSFixed64Field: function(tag, val) {
            this.writeTag(tag, Pbf$1.Fixed64);
            this.writeSFixed64(val);
        },
        writeVarintField: function(tag, val) {
            this.writeTag(tag, Pbf$1.Varint);
            this.writeVarint(val);
        },
        writeSVarintField: function(tag, val) {
            this.writeTag(tag, Pbf$1.Varint);
            this.writeSVarint(val);
        },
        writeStringField: function(tag, str) {
            this.writeTag(tag, Pbf$1.Bytes);
            this.writeString(str);
        },
        writeFloatField: function(tag, val) {
            this.writeTag(tag, Pbf$1.Fixed32);
            this.writeFloat(val);
        },
        writeDoubleField: function(tag, val) {
            this.writeTag(tag, Pbf$1.Fixed64);
            this.writeDouble(val);
        },
        writeBooleanField: function(tag, val) {
            this.writeVarintField(tag, Boolean(val));
        }
    };

    function readVarintRemainder(l, s, p) {
        var buf = p.buf,
            h, b;

        b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum(l, h, s);
        b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum(l, h, s);
        b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum(l, h, s);
        b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum(l, h, s);
        b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum(l, h, s);
        b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum(l, h, s);

        throw new Error('Expected varint not more than 10 bytes');
    }

    function readPackedEnd(pbf) {
        return pbf.type === Pbf$1.Bytes ?
            pbf.readVarint() + pbf.pos : pbf.pos + 1;
    }

    function toNum(low, high, isSigned) {
        if (isSigned) {
            return high * 0x100000000 + (low >>> 0);
        }

        return ((high >>> 0) * 0x100000000) + (low >>> 0);
    }

    function writeBigVarint(val, pbf) {
        var low, high;

        if (val >= 0) {
            low  = (val % 0x100000000) | 0;
            high = (val / 0x100000000) | 0;
        } else {
            low  = ~(-val % 0x100000000);
            high = ~(-val / 0x100000000);

            if (low ^ 0xffffffff) {
                low = (low + 1) | 0;
            } else {
                low = 0;
                high = (high + 1) | 0;
            }
        }

        if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
            throw new Error('Given varint doesn\'t fit into 10 bytes');
        }

        pbf.realloc(10);

        writeBigVarintLow(low, high, pbf);
        writeBigVarintHigh(high, pbf);
    }

    function writeBigVarintLow(low, high, pbf) {
        pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
        pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
        pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
        pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
        pbf.buf[pbf.pos]   = low & 0x7f;
    }

    function writeBigVarintHigh(high, pbf) {
        var lsb = (high & 0x07) << 4;

        pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0); if (!high) return;
        pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
        pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
        pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
        pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
        pbf.buf[pbf.pos++]  = high & 0x7f;
    }

    function makeRoomForExtraLength(startPos, len, pbf) {
        var extraLen =
            len <= 0x3fff ? 1 :
            len <= 0x1fffff ? 2 :
            len <= 0xfffffff ? 3 : Math.floor(Math.log(len) / (Math.LN2 * 7));

        // if 1 byte isn't enough for encoding message length, shift the data to the right
        pbf.realloc(extraLen);
        for (var i = pbf.pos - 1; i >= startPos; i--) pbf.buf[i + extraLen] = pbf.buf[i];
    }

    function writePackedVarint(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);   }
    function writePackedSVarint(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);  }
    function writePackedFloat(arr, pbf)    { for (var i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);    }
    function writePackedDouble(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);   }
    function writePackedBoolean(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);  }
    function writePackedFixed32(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);  }
    function writePackedSFixed32(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]); }
    function writePackedFixed64(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);  }
    function writePackedSFixed64(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]); }

    // Buffer code below from https://github.com/feross/buffer, MIT-licensed

    function readUInt32(buf, pos) {
        return ((buf[pos]) |
            (buf[pos + 1] << 8) |
            (buf[pos + 2] << 16)) +
            (buf[pos + 3] * 0x1000000);
    }

    function writeInt32(buf, val, pos) {
        buf[pos] = val;
        buf[pos + 1] = (val >>> 8);
        buf[pos + 2] = (val >>> 16);
        buf[pos + 3] = (val >>> 24);
    }

    function readInt32(buf, pos) {
        return ((buf[pos]) |
            (buf[pos + 1] << 8) |
            (buf[pos + 2] << 16)) +
            (buf[pos + 3] << 24);
    }

    function readUtf8(buf, pos, end) {
        var str = '';
        var i = pos;

        while (i < end) {
            var b0 = buf[i];
            var c = null; // codepoint
            var bytesPerSequence =
                b0 > 0xEF ? 4 :
                b0 > 0xDF ? 3 :
                b0 > 0xBF ? 2 : 1;

            if (i + bytesPerSequence > end) break;

            var b1, b2, b3;

            if (bytesPerSequence === 1) {
                if (b0 < 0x80) {
                    c = b0;
                }
            } else if (bytesPerSequence === 2) {
                b1 = buf[i + 1];
                if ((b1 & 0xC0) === 0x80) {
                    c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F);
                    if (c <= 0x7F) {
                        c = null;
                    }
                }
            } else if (bytesPerSequence === 3) {
                b1 = buf[i + 1];
                b2 = buf[i + 2];
                if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
                    c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F);
                    if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) {
                        c = null;
                    }
                }
            } else if (bytesPerSequence === 4) {
                b1 = buf[i + 1];
                b2 = buf[i + 2];
                b3 = buf[i + 3];
                if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                    c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F);
                    if (c <= 0xFFFF || c >= 0x110000) {
                        c = null;
                    }
                }
            }

            if (c === null) {
                c = 0xFFFD;
                bytesPerSequence = 1;

            } else if (c > 0xFFFF) {
                c -= 0x10000;
                str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800);
                c = 0xDC00 | c & 0x3FF;
            }

            str += String.fromCharCode(c);
            i += bytesPerSequence;
        }

        return str;
    }

    function readUtf8TextDecoder(buf, pos, end) {
        return utf8TextDecoder.decode(buf.subarray(pos, end));
    }

    function writeUtf8(buf, str, pos) {
        for (var i = 0, c, lead; i < str.length; i++) {
            c = str.charCodeAt(i); // code point

            if (c > 0xD7FF && c < 0xE000) {
                if (lead) {
                    if (c < 0xDC00) {
                        buf[pos++] = 0xEF;
                        buf[pos++] = 0xBF;
                        buf[pos++] = 0xBD;
                        lead = c;
                        continue;
                    } else {
                        c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000;
                        lead = null;
                    }
                } else {
                    if (c > 0xDBFF || (i + 1 === str.length)) {
                        buf[pos++] = 0xEF;
                        buf[pos++] = 0xBF;
                        buf[pos++] = 0xBD;
                    } else {
                        lead = c;
                    }
                    continue;
                }
            } else if (lead) {
                buf[pos++] = 0xEF;
                buf[pos++] = 0xBF;
                buf[pos++] = 0xBD;
                lead = null;
            }

            if (c < 0x80) {
                buf[pos++] = c;
            } else {
                if (c < 0x800) {
                    buf[pos++] = c >> 0x6 | 0xC0;
                } else {
                    if (c < 0x10000) {
                        buf[pos++] = c >> 0xC | 0xE0;
                    } else {
                        buf[pos++] = c >> 0x12 | 0xF0;
                        buf[pos++] = c >> 0xC & 0x3F | 0x80;
                    }
                    buf[pos++] = c >> 0x6 & 0x3F | 0x80;
                }
                buf[pos++] = c & 0x3F | 0x80;
            }
        }
        return pos;
    }

    const border$1 = 3;
    const GLYPH_PBF_BORDER = border$1;

    function potpack(boxes) {

        // calculate total box area and maximum box width
        let area = 0;
        let maxWidth = 0;

        for (const box of boxes) {
            area += box.w * box.h;
            maxWidth = Math.max(maxWidth, box.w);
        }

        // sort the boxes for insertion by height, descending
        boxes.sort((a, b) => b.h - a.h);

        // aim for a squarish resulting container,
        // slightly adjusted for sub-100% space utilization
        const startWidth = Math.max(Math.ceil(Math.sqrt(area / 0.95)), maxWidth);

        // start with a single empty space, unbounded at the bottom
        const spaces = [{x: 0, y: 0, w: startWidth, h: Infinity}];

        let width = 0;
        let height = 0;

        for (const box of boxes) {
            // look through spaces backwards so that we check smaller spaces first
            for (let i = spaces.length - 1; i >= 0; i--) {
                const space = spaces[i];

                // look for empty spaces that can accommodate the current box
                if (box.w > space.w || box.h > space.h) continue;

                // found the space; add the box to its top-left corner
                // |-------|-------|
                // |  box  |       |
                // |_______|       |
                // |         space |
                // |_______________|
                box.x = space.x;
                box.y = space.y;

                height = Math.max(height, box.y + box.h);
                width = Math.max(width, box.x + box.w);

                if (box.w === space.w && box.h === space.h) {
                    // space matches the box exactly; remove it
                    const last = spaces.pop();
                    if (i < spaces.length) spaces[i] = last;

                } else if (box.h === space.h) {
                    // space matches the box height; update it accordingly
                    // |-------|---------------|
                    // |  box  | updated space |
                    // |_______|_______________|
                    space.x += box.w;
                    space.w -= box.w;

                } else if (box.w === space.w) {
                    // space matches the box width; update it accordingly
                    // |---------------|
                    // |      box      |
                    // |_______________|
                    // | updated space |
                    // |_______________|
                    space.y += box.h;
                    space.h -= box.h;

                } else {
                    // otherwise the box splits the space into two spaces
                    // |-------|-----------|
                    // |  box  | new space |
                    // |_______|___________|
                    // | updated space     |
                    // |___________________|
                    spaces.push({
                        x: space.x + box.w,
                        y: space.y,
                        w: space.w - box.w,
                        h: box.h
                    });
                    space.y += box.h;
                    space.h -= box.h;
                }
                break;
            }
        }

        return {
            w: width, // container width
            h: height, // container height
            fill: (area / (width * height)) || 0 // space utilization
        };
    }

    /* eslint-disable key-spacing */
    const IMAGE_PADDING = 1;
    class ImagePosition {
        constructor(paddedRect, { pixelRatio, version, stretchX, stretchY, content }) {
            this.paddedRect = paddedRect;
            this.pixelRatio = pixelRatio;
            this.stretchX = stretchX;
            this.stretchY = stretchY;
            this.content = content;
            this.version = version;
        }
        get tl() {
            return [
                this.paddedRect.x + IMAGE_PADDING,
                this.paddedRect.y + IMAGE_PADDING
            ];
        }
        get br() {
            return [
                this.paddedRect.x + this.paddedRect.w - IMAGE_PADDING,
                this.paddedRect.y + this.paddedRect.h - IMAGE_PADDING
            ];
        }
        get tlbr() {
            return this.tl.concat(this.br);
        }
        get displaySize() {
            return [
                (this.paddedRect.w - IMAGE_PADDING * 2) / this.pixelRatio,
                (this.paddedRect.h - IMAGE_PADDING * 2) / this.pixelRatio
            ];
        }
    }
    class ImageAtlas {
        constructor(icons, patterns) {
            const iconPositions = {}, patternPositions = {};
            this.haveRenderCallbacks = [];
            const bins = [];
            this.addImages(icons, iconPositions, bins);
            this.addImages(patterns, patternPositions, bins);
            const { w, h } = potpack(bins);
            const image = new RGBAImage({ width: w || 1, height: h || 1 });
            for (const id in icons) {
                const src = icons[id];
                const bin = iconPositions[id].paddedRect;
                RGBAImage.copy(src.data, image, { x: 0, y: 0 }, { x: bin.x + IMAGE_PADDING, y: bin.y + IMAGE_PADDING }, src.data);
            }
            for (const id in patterns) {
                const src = patterns[id];
                const bin = patternPositions[id].paddedRect;
                const x = bin.x + IMAGE_PADDING, y = bin.y + IMAGE_PADDING, w = src.data.width, h = src.data.height;
                RGBAImage.copy(src.data, image, { x: 0, y: 0 }, { x, y }, src.data);
                // Add 1 pixel wrapped padding on each side of the image.
                RGBAImage.copy(src.data, image, { x: 0, y: h - 1 }, { x, y: y - 1 }, { width: w, height: 1 }); // T
                RGBAImage.copy(src.data, image, { x: 0, y: 0 }, { x, y: y + h }, { width: w, height: 1 }); // B
                RGBAImage.copy(src.data, image, { x: w - 1, y: 0 }, { x: x - 1, y }, { width: 1, height: h }); // L
                RGBAImage.copy(src.data, image, { x: 0, y: 0 }, { x: x + w, y }, { width: 1, height: h }); // R
            }
            this.image = image;
            this.iconPositions = iconPositions;
            this.patternPositions = patternPositions;
        }
        addImages(images, positions, bins) {
            for (const id in images) {
                const src = images[id];
                const bin = {
                    x: 0,
                    y: 0,
                    w: src.data.width + 2 * IMAGE_PADDING,
                    h: src.data.height + 2 * IMAGE_PADDING,
                };
                bins.push(bin);
                positions[id] = new ImagePosition(bin, src);
                if (src.hasRenderCallback) {
                    this.haveRenderCallbacks.push(id);
                }
            }
        }
        patchUpdatedImages(imageManager, texture) {
            imageManager.dispatchRenderCallbacks(this.haveRenderCallbacks);
            for (const name in imageManager.updatedImages) {
                this.patchUpdatedImage(this.iconPositions[name], imageManager.getImage(name), texture);
                this.patchUpdatedImage(this.patternPositions[name], imageManager.getImage(name), texture);
            }
        }
        patchUpdatedImage(position, image, texture) {
            if (!position || !image)
                return;
            if (position.version === image.version)
                return;
            position.version = image.version;
            const [x, y] = position.tl;
            texture.update(image.data, undefined, { x, y });
        }
    }
    register('ImagePosition', ImagePosition);
    register('ImageAtlas', ImageAtlas);

    var WritingMode;
    (function (WritingMode) {
        WritingMode[WritingMode["none"] = 0] = "none";
        WritingMode[WritingMode["horizontal"] = 1] = "horizontal";
        WritingMode[WritingMode["vertical"] = 2] = "vertical";
        WritingMode[WritingMode["horizontalOnly"] = 3] = "horizontalOnly";
    })(WritingMode || (WritingMode = {}));
    const SHAPING_DEFAULT_OFFSET = -17;
    function isEmpty(positionedLines) {
        for (const line of positionedLines) {
            if (line.positionedGlyphs.length !== 0) {
                return false;
            }
        }
        return true;
    }
    // Max number of images in label is 6401 U+E000–U+F8FF that covers
    // Basic Multilingual Plane Unicode Private Use Area (PUA).
    const PUAbegin = 0xE000;
    const PUAend = 0xF8FF;
    class SectionOptions {
        constructor() {
            this.scale = 1.0;
            this.fontStack = '';
            this.imageName = null;
        }
        static forText(scale, fontStack) {
            const textOptions = new SectionOptions();
            textOptions.scale = scale || 1;
            textOptions.fontStack = fontStack;
            return textOptions;
        }
        static forImage(imageName) {
            const imageOptions = new SectionOptions();
            imageOptions.imageName = imageName;
            return imageOptions;
        }
    }
    class TaggedString {
        constructor() {
            this.text = '';
            this.sectionIndex = [];
            this.sections = [];
            this.imageSectionID = null;
        }
        static fromFeature(text, defaultFontStack) {
            const result = new TaggedString();
            for (let i = 0; i < text.sections.length; i++) {
                const section = text.sections[i];
                if (!section.image) {
                    result.addTextSection(section, defaultFontStack);
                }
                else {
                    result.addImageSection(section);
                }
            }
            return result;
        }
        length() {
            return this.text.length;
        }
        getSection(index) {
            return this.sections[this.sectionIndex[index]];
        }
        getSectionIndex(index) {
            return this.sectionIndex[index];
        }
        getCharCode(index) {
            return this.text.charCodeAt(index);
        }
        verticalizePunctuation() {
            this.text = verticalizePunctuation(this.text);
        }
        trim() {
            let beginningWhitespace = 0;
            for (let i = 0; i < this.text.length && whitespace[this.text.charCodeAt(i)]; i++) {
                beginningWhitespace++;
            }
            let trailingWhitespace = this.text.length;
            for (let i = this.text.length - 1; i >= 0 && i >= beginningWhitespace && whitespace[this.text.charCodeAt(i)]; i--) {
                trailingWhitespace--;
            }
            this.text = this.text.substring(beginningWhitespace, trailingWhitespace);
            this.sectionIndex = this.sectionIndex.slice(beginningWhitespace, trailingWhitespace);
        }
        substring(start, end) {
            const substring = new TaggedString();
            substring.text = this.text.substring(start, end);
            substring.sectionIndex = this.sectionIndex.slice(start, end);
            substring.sections = this.sections;
            return substring;
        }
        toString() {
            return this.text;
        }
        getMaxScale() {
            return this.sectionIndex.reduce((max, index) => Math.max(max, this.sections[index].scale), 0);
        }
        addTextSection(section, defaultFontStack) {
            this.text += section.text;
            this.sections.push(SectionOptions.forText(section.scale, section.fontStack || defaultFontStack));
            const index = this.sections.length - 1;
            for (let i = 0; i < section.text.length; ++i) {
                this.sectionIndex.push(index);
            }
        }
        addImageSection(section) {
            const imageName = section.image ? section.image.name : '';
            if (imageName.length === 0) {
                warnOnce('Can\'t add FormattedSection with an empty image.');
                return;
            }
            const nextImageSectionCharCode = this.getNextImageSectionCharCode();
            if (!nextImageSectionCharCode) {
                warnOnce(`Reached maximum number of images ${PUAend - PUAbegin + 2}`);
                return;
            }
            this.text += String.fromCharCode(nextImageSectionCharCode);
            this.sections.push(SectionOptions.forImage(imageName));
            this.sectionIndex.push(this.sections.length - 1);
        }
        getNextImageSectionCharCode() {
            if (!this.imageSectionID) {
                this.imageSectionID = PUAbegin;
                return this.imageSectionID;
            }
            if (this.imageSectionID >= PUAend)
                return null;
            return ++this.imageSectionID;
        }
    }
    function breakLines(input, lineBreakPoints) {
        const lines = [];
        const text = input.text;
        let start = 0;
        for (const lineBreak of lineBreakPoints) {
            lines.push(input.substring(start, lineBreak));
            start = lineBreak;
        }
        if (start < text.length) {
            lines.push(input.substring(start, text.length));
        }
        return lines;
    }
    function shapeText(text, glyphMap, glyphPositions, imagePositions, defaultFontStack, maxWidth, lineHeight, textAnchor, textJustify, spacing, translate, writingMode, allowVerticalPlacement, symbolPlacement, layoutTextSize, layoutTextSizeThisZoom) {
        const logicalInput = TaggedString.fromFeature(text, defaultFontStack);
        if (writingMode === WritingMode.vertical) {
            logicalInput.verticalizePunctuation();
        }
        let lines;
        const { processBidirectionalText, processStyledBidirectionalText } = plugin;
        if (processBidirectionalText && logicalInput.sections.length === 1) {
            // Bidi doesn't have to be style-aware
            lines = [];
            const untaggedLines = processBidirectionalText(logicalInput.toString(), determineLineBreaks(logicalInput, spacing, maxWidth, glyphMap, imagePositions, symbolPlacement, layoutTextSize));
            for (const line of untaggedLines) {
                const taggedLine = new TaggedString();
                taggedLine.text = line;
                taggedLine.sections = logicalInput.sections;
                for (let i = 0; i < line.length; i++) {
                    taggedLine.sectionIndex.push(0);
                }
                lines.push(taggedLine);
            }
        }
        else if (processStyledBidirectionalText) {
            // Need version of mapbox-gl-rtl-text with style support for combining RTL text
            // with formatting
            lines = [];
            const processedLines = processStyledBidirectionalText(logicalInput.text, logicalInput.sectionIndex, determineLineBreaks(logicalInput, spacing, maxWidth, glyphMap, imagePositions, symbolPlacement, layoutTextSize));
            for (const line of processedLines) {
                const taggedLine = new TaggedString();
                taggedLine.text = line[0];
                taggedLine.sectionIndex = line[1];
                taggedLine.sections = logicalInput.sections;
                lines.push(taggedLine);
            }
        }
        else {
            lines = breakLines(logicalInput, determineLineBreaks(logicalInput, spacing, maxWidth, glyphMap, imagePositions, symbolPlacement, layoutTextSize));
        }
        const positionedLines = [];
        const shaping = {
            positionedLines,
            text: logicalInput.toString(),
            top: translate[1],
            bottom: translate[1],
            left: translate[0],
            right: translate[0],
            writingMode,
            iconsInText: false,
            verticalizable: false
        };
        shapeLines(shaping, glyphMap, glyphPositions, imagePositions, lines, lineHeight, textAnchor, textJustify, writingMode, spacing, allowVerticalPlacement, layoutTextSizeThisZoom);
        if (isEmpty(positionedLines))
            return false;
        return shaping;
    }
    // using computed properties due to https://github.com/facebook/flow/issues/380
    /* eslint no-useless-computed-key: 0 */
    const whitespace = {
        [0x09]: true,
        [0x0a]: true,
        [0x0b]: true,
        [0x0c]: true,
        [0x0d]: true,
        [0x20]: true, // space
    };
    const breakable = {
        [0x0a]: true,
        [0x20]: true,
        [0x26]: true,
        [0x28]: true,
        [0x29]: true,
        [0x2b]: true,
        [0x2d]: true,
        [0x2f]: true,
        [0xad]: true,
        [0xb7]: true,
        [0x200b]: true,
        [0x2010]: true,
        [0x2013]: true,
        [0x2027]: true // interpunct
        // Many other characters may be reasonable breakpoints
        // Consider "neutral orientation" characters at scriptDetection.charHasNeutralVerticalOrientation
        // See https://github.com/mapbox/mapbox-gl-js/issues/3658
    };
    function getGlyphAdvance(codePoint, section, glyphMap, imagePositions, spacing, layoutTextSize) {
        if (!section.imageName) {
            const positions = glyphMap[section.fontStack];
            const glyph = positions && positions[codePoint];
            if (!glyph)
                return 0;
            return glyph.metrics.advance * section.scale + spacing;
        }
        else {
            const imagePosition = imagePositions[section.imageName];
            if (!imagePosition)
                return 0;
            return imagePosition.displaySize[0] * section.scale * ONE_EM / layoutTextSize + spacing;
        }
    }
    function determineAverageLineWidth(logicalInput, spacing, maxWidth, glyphMap, imagePositions, layoutTextSize) {
        let totalWidth = 0;
        for (let index = 0; index < logicalInput.length(); index++) {
            const section = logicalInput.getSection(index);
            totalWidth += getGlyphAdvance(logicalInput.getCharCode(index), section, glyphMap, imagePositions, spacing, layoutTextSize);
        }
        const lineCount = Math.max(1, Math.ceil(totalWidth / maxWidth));
        return totalWidth / lineCount;
    }
    function calculateBadness(lineWidth, targetWidth, penalty, isLastBreak) {
        const raggedness = Math.pow(lineWidth - targetWidth, 2);
        if (isLastBreak) {
            // Favor finals lines shorter than average over longer than average
            if (lineWidth < targetWidth) {
                return raggedness / 2;
            }
            else {
                return raggedness * 2;
            }
        }
        return raggedness + Math.abs(penalty) * penalty;
    }
    function calculatePenalty(codePoint, nextCodePoint, penalizableIdeographicBreak) {
        let penalty = 0;
        // Force break on newline
        if (codePoint === 0x0a) {
            penalty -= 10000;
        }
        // Penalize breaks between characters that allow ideographic breaking because
        // they are less preferable than breaks at spaces (or zero width spaces).
        if (penalizableIdeographicBreak) {
            penalty += 150;
        }
        // Penalize open parenthesis at end of line
        if (codePoint === 0x28 || codePoint === 0xff08) {
            penalty += 50;
        }
        // Penalize close parenthesis at beginning of line
        if (nextCodePoint === 0x29 || nextCodePoint === 0xff09) {
            penalty += 50;
        }
        return penalty;
    }
    function evaluateBreak(breakIndex, breakX, targetWidth, potentialBreaks, penalty, isLastBreak) {
        // We could skip evaluating breaks where the line length (breakX - priorBreak.x) > maxWidth
        //  ...but in fact we allow lines longer than maxWidth (if there's no break points)
        //  ...and when targetWidth and maxWidth are close, strictly enforcing maxWidth can give
        //     more lopsided results.
        let bestPriorBreak = null;
        let bestBreakBadness = calculateBadness(breakX, targetWidth, penalty, isLastBreak);
        for (const potentialBreak of potentialBreaks) {
            const lineWidth = breakX - potentialBreak.x;
            const breakBadness = calculateBadness(lineWidth, targetWidth, penalty, isLastBreak) + potentialBreak.badness;
            if (breakBadness <= bestBreakBadness) {
                bestPriorBreak = potentialBreak;
                bestBreakBadness = breakBadness;
            }
        }
        return {
            index: breakIndex,
            x: breakX,
            priorBreak: bestPriorBreak,
            badness: bestBreakBadness
        };
    }
    function leastBadBreaks(lastLineBreak) {
        if (!lastLineBreak) {
            return [];
        }
        return leastBadBreaks(lastLineBreak.priorBreak).concat(lastLineBreak.index);
    }
    function determineLineBreaks(logicalInput, spacing, maxWidth, glyphMap, imagePositions, symbolPlacement, layoutTextSize) {
        if (symbolPlacement !== 'point')
            return [];
        if (!logicalInput)
            return [];
        const potentialLineBreaks = [];
        const targetWidth = determineAverageLineWidth(logicalInput, spacing, maxWidth, glyphMap, imagePositions, layoutTextSize);
        const hasServerSuggestedBreakpoints = logicalInput.text.indexOf('\u200b') >= 0;
        let currentX = 0;
        for (let i = 0; i < logicalInput.length(); i++) {
            const section = logicalInput.getSection(i);
            const codePoint = logicalInput.getCharCode(i);
            if (!whitespace[codePoint])
                currentX += getGlyphAdvance(codePoint, section, glyphMap, imagePositions, spacing, layoutTextSize);
            // Ideographic characters, spaces, and word-breaking punctuation that often appear without
            // surrounding spaces.
            if ((i < logicalInput.length() - 1)) {
                const ideographicBreak = charAllowsIdeographicBreaking(codePoint);
                if (breakable[codePoint] || ideographicBreak || section.imageName) {
                    potentialLineBreaks.push(evaluateBreak(i + 1, currentX, targetWidth, potentialLineBreaks, calculatePenalty(codePoint, logicalInput.getCharCode(i + 1), ideographicBreak && hasServerSuggestedBreakpoints), false));
                }
            }
        }
        return leastBadBreaks(evaluateBreak(logicalInput.length(), currentX, targetWidth, potentialLineBreaks, 0, true));
    }
    function getAnchorAlignment(anchor) {
        let horizontalAlign = 0.5, verticalAlign = 0.5;
        switch (anchor) {
            case 'right':
            case 'top-right':
            case 'bottom-right':
                horizontalAlign = 1;
                break;
            case 'left':
            case 'top-left':
            case 'bottom-left':
                horizontalAlign = 0;
                break;
        }
        switch (anchor) {
            case 'bottom':
            case 'bottom-right':
            case 'bottom-left':
                verticalAlign = 1;
                break;
            case 'top':
            case 'top-right':
            case 'top-left':
                verticalAlign = 0;
                break;
        }
        return { horizontalAlign, verticalAlign };
    }
    function shapeLines(shaping, glyphMap, glyphPositions, imagePositions, lines, lineHeight, textAnchor, textJustify, writingMode, spacing, allowVerticalPlacement, layoutTextSizeThisZoom) {
        let x = 0;
        let y = SHAPING_DEFAULT_OFFSET;
        let maxLineLength = 0;
        let maxLineHeight = 0;
        const justify = textJustify === 'right' ? 1 :
            textJustify === 'left' ? 0 : 0.5;
        let lineIndex = 0;
        for (const line of lines) {
            line.trim();
            const lineMaxScale = line.getMaxScale();
            const maxLineOffset = (lineMaxScale - 1) * ONE_EM;
            const positionedLine = { positionedGlyphs: [], lineOffset: 0 };
            shaping.positionedLines[lineIndex] = positionedLine;
            const positionedGlyphs = positionedLine.positionedGlyphs;
            let lineOffset = 0.0;
            if (!line.length()) {
                y += lineHeight; // Still need a line feed after empty line
                ++lineIndex;
                continue;
            }
            for (let i = 0; i < line.length(); i++) {
                const section = line.getSection(i);
                const sectionIndex = line.getSectionIndex(i);
                const codePoint = line.getCharCode(i);
                let baselineOffset = 0.0;
                let metrics = null;
                let rect = null;
                let imageName = null;
                let verticalAdvance = ONE_EM;
                const vertical = !(writingMode === WritingMode.horizontal ||
                    // Don't verticalize glyphs that have no upright orientation if vertical placement is disabled.
                    (!allowVerticalPlacement && !charHasUprightVerticalOrientation(codePoint)) ||
                    // If vertical placement is enabled, don't verticalize glyphs that
                    // are from complex text layout script, or whitespaces.
                    (allowVerticalPlacement && (whitespace[codePoint] || charInComplexShapingScript(codePoint))));
                if (!section.imageName) {
                    const positions = glyphPositions[section.fontStack];
                    const glyphPosition = positions && positions[codePoint];
                    if (glyphPosition && glyphPosition.rect) {
                        rect = glyphPosition.rect;
                        metrics = glyphPosition.metrics;
                    }
                    else {
                        const glyphs = glyphMap[section.fontStack];
                        const glyph = glyphs && glyphs[codePoint];
                        if (!glyph)
                            continue;
                        metrics = glyph.metrics;
                    }
                    // We don't know the baseline, but since we're laying out
                    // at 24 points, we can calculate how much it will move when
                    // we scale up or down.
                    baselineOffset = (lineMaxScale - section.scale) * ONE_EM;
                }
                else {
                    const imagePosition = imagePositions[section.imageName];
                    if (!imagePosition)
                        continue;
                    imageName = section.imageName;
                    shaping.iconsInText = shaping.iconsInText || true;
                    rect = imagePosition.paddedRect;
                    const size = imagePosition.displaySize;
                    // If needed, allow to set scale factor for an image using
                    // alias "image-scale" that could be alias for "font-scale"
                    // when FormattedSection is an image section.
                    section.scale = section.scale * ONE_EM / layoutTextSizeThisZoom;
                    metrics = { width: size[0],
                        height: size[1],
                        left: IMAGE_PADDING,
                        top: -GLYPH_PBF_BORDER,
                        advance: vertical ? size[1] : size[0] };
                    // Difference between one EM and an image size.
                    // Aligns bottom of an image to a baseline level.
                    const imageOffset = ONE_EM - size[1] * section.scale;
                    baselineOffset = maxLineOffset + imageOffset;
                    verticalAdvance = metrics.advance;
                    // Difference between height of an image and one EM at max line scale.
                    // Pushes current line down if an image size is over 1 EM at max line scale.
                    const offset = vertical ? size[0] * section.scale - ONE_EM * lineMaxScale :
                        size[1] * section.scale - ONE_EM * lineMaxScale;
                    if (offset > 0 && offset > lineOffset) {
                        lineOffset = offset;
                    }
                }
                if (!vertical) {
                    positionedGlyphs.push({ glyph: codePoint, imageName, x, y: y + baselineOffset, vertical, scale: section.scale, fontStack: section.fontStack, sectionIndex, metrics, rect });
                    x += metrics.advance * section.scale + spacing;
                }
                else {
                    shaping.verticalizable = true;
                    positionedGlyphs.push({ glyph: codePoint, imageName, x, y: y + baselineOffset, vertical, scale: section.scale, fontStack: section.fontStack, sectionIndex, metrics, rect });
                    x += verticalAdvance * section.scale + spacing;
                }
            }
            // Only justify if we placed at least one glyph
            if (positionedGlyphs.length !== 0) {
                const lineLength = x - spacing;
                maxLineLength = Math.max(lineLength, maxLineLength);
                justifyLine(positionedGlyphs, 0, positionedGlyphs.length - 1, justify, lineOffset);
            }
            x = 0;
            const currentLineHeight = lineHeight * lineMaxScale + lineOffset;
            positionedLine.lineOffset = Math.max(lineOffset, maxLineOffset);
            y += currentLineHeight;
            maxLineHeight = Math.max(currentLineHeight, maxLineHeight);
            ++lineIndex;
        }
        // Calculate the bounding box and justify / align text block.
        const height = y - SHAPING_DEFAULT_OFFSET;
        const { horizontalAlign, verticalAlign } = getAnchorAlignment(textAnchor);
        align(shaping.positionedLines, justify, horizontalAlign, verticalAlign, maxLineLength, maxLineHeight, lineHeight, height, lines.length);
        shaping.top += -verticalAlign * height;
        shaping.bottom = shaping.top + height;
        shaping.left += -horizontalAlign * maxLineLength;
        shaping.right = shaping.left + maxLineLength;
    }
    // justify right = 1, left = 0, center = 0.5
    function justifyLine(positionedGlyphs, start, end, justify, lineOffset) {
        if (!justify && !lineOffset)
            return;
        const lastPositionedGlyph = positionedGlyphs[end];
        const lastAdvance = lastPositionedGlyph.metrics.advance * lastPositionedGlyph.scale;
        const lineIndent = (positionedGlyphs[end].x + lastAdvance) * justify;
        for (let j = start; j <= end; j++) {
            positionedGlyphs[j].x -= lineIndent;
            positionedGlyphs[j].y += lineOffset;
        }
    }
    function align(positionedLines, justify, horizontalAlign, verticalAlign, maxLineLength, maxLineHeight, lineHeight, blockHeight, lineCount) {
        const shiftX = (justify - horizontalAlign) * maxLineLength;
        let shiftY = 0;
        if (maxLineHeight !== lineHeight) {
            shiftY = -blockHeight * verticalAlign - SHAPING_DEFAULT_OFFSET;
        }
        else {
            shiftY = (-verticalAlign * lineCount + 0.5) * lineHeight;
        }
        for (const line of positionedLines) {
            for (const positionedGlyph of line.positionedGlyphs) {
                positionedGlyph.x += shiftX;
                positionedGlyph.y += shiftY;
            }
        }
    }
    function shapeIcon(image, iconOffset, iconAnchor) {
        const { horizontalAlign, verticalAlign } = getAnchorAlignment(iconAnchor);
        const dx = iconOffset[0];
        const dy = iconOffset[1];
        const x1 = dx - image.displaySize[0] * horizontalAlign;
        const x2 = x1 + image.displaySize[0];
        const y1 = dy - image.displaySize[1] * verticalAlign;
        const y2 = y1 + image.displaySize[1];
        return { image, top: y1, bottom: y2, left: x1, right: x2 };
    }
    function fitIconToText(shapedIcon, shapedText, textFit, padding, iconOffset, fontScale) {
        const image = shapedIcon.image;
        let collisionPadding;
        if (image.content) {
            const content = image.content;
            const pixelRatio = image.pixelRatio || 1;
            collisionPadding = [
                content[0] / pixelRatio,
                content[1] / pixelRatio,
                image.displaySize[0] - content[2] / pixelRatio,
                image.displaySize[1] - content[3] / pixelRatio
            ];
        }
        // We don't respect the icon-anchor, because icon-text-fit is set. Instead,
        // the icon will be centered on the text, then stretched in the given
        // dimensions.
        const textLeft = shapedText.left * fontScale;
        const textRight = shapedText.right * fontScale;
        let top, right, bottom, left;
        if (textFit === 'width' || textFit === 'both') {
            // Stretched horizontally to the text width
            left = iconOffset[0] + textLeft - padding[3];
            right = iconOffset[0] + textRight + padding[1];
        }
        else {
            // Centered on the text
            left = iconOffset[0] + (textLeft + textRight - image.displaySize[0]) / 2;
            right = left + image.displaySize[0];
        }
        const textTop = shapedText.top * fontScale;
        const textBottom = shapedText.bottom * fontScale;
        if (textFit === 'height' || textFit === 'both') {
            // Stretched vertically to the text height
            top = iconOffset[1] + textTop - padding[0];
            bottom = iconOffset[1] + textBottom + padding[2];
        }
        else {
            // Centered on the text
            top = iconOffset[1] + (textTop + textBottom - image.displaySize[1]) / 2;
            bottom = top + image.displaySize[1];
        }
        return { image, top, right, bottom, left, collisionPadding };
    }

    const SIZE_PACK_FACTOR = 128;
    // For {text,icon}-size, get the bucket-level data that will be needed by
    // the painter to set symbol-size-related uniforms
    function getSizeData(tileZoom, value) {
        const { expression } = value;
        if (expression.kind === 'constant') {
            const layoutSize = expression.evaluate(new EvaluationParameters(tileZoom + 1));
            return { kind: 'constant', layoutSize };
        }
        else if (expression.kind === 'source') {
            return { kind: 'source' };
        }
        else {
            const { zoomStops, interpolationType } = expression;
            // calculate covering zoom stops for zoom-dependent values
            let lower = 0;
            while (lower < zoomStops.length && zoomStops[lower] <= tileZoom)
                lower++;
            lower = Math.max(0, lower - 1);
            let upper = lower;
            while (upper < zoomStops.length && zoomStops[upper] < tileZoom + 1)
                upper++;
            upper = Math.min(zoomStops.length - 1, upper);
            const minZoom = zoomStops[lower];
            const maxZoom = zoomStops[upper];
            // We'd like to be able to use CameraExpression or CompositeExpression in these
            // return types rather than ExpressionSpecification, but the former are not
            // transferrable across Web Worker boundaries.
            if (expression.kind === 'composite') {
                return { kind: 'composite', minZoom, maxZoom, interpolationType };
            }
            // for camera functions, also save off the function values
            // evaluated at the covering zoom levels
            const minSize = expression.evaluate(new EvaluationParameters(minZoom));
            const maxSize = expression.evaluate(new EvaluationParameters(maxZoom));
            return { kind: 'camera', minZoom, maxZoom, minSize, maxSize, interpolationType };
        }
    }

    class Anchor extends pointGeometry {
        constructor(x, y, angle, segment) {
            super(x, y);
            this.angle = angle;
            if (segment !== undefined) {
                this.segment = segment;
            }
        }
        clone() {
            return new Anchor(this.x, this.y, this.angle, this.segment);
        }
    }
    register('Anchor', Anchor);

    /**
     * Labels placed around really sharp angles aren't readable. Check if any
     * part of the potential label has a combined angle that is too big.
     *
     * @param line
     * @param anchor The point on the line around which the label is anchored.
     * @param labelLength The length of the label in geometry units.
     * @param windowSize The check fails if the combined angles within a part of the line that is `windowSize` long is too big.
     * @param maxAngle The maximum combined angle that any window along the label is allowed to have.
     *
     * @returns {boolean} whether the label should be placed
     * @private
     */
    function checkMaxAngle(line, anchor, labelLength, windowSize, maxAngle) {
        // horizontal labels always pass
        if (anchor.segment === undefined)
            return true;
        let p = anchor;
        let index = anchor.segment + 1;
        let anchorDistance = 0;
        // move backwards along the line to the first segment the label appears on
        while (anchorDistance > -labelLength / 2) {
            index--;
            // there isn't enough room for the label after the beginning of the line
            if (index < 0)
                return false;
            anchorDistance -= line[index].dist(p);
            p = line[index];
        }
        anchorDistance += line[index].dist(line[index + 1]);
        index++;
        // store recent corners and their total angle difference
        const recentCorners = [];
        let recentAngleDelta = 0;
        // move forwards by the length of the label and check angles along the way
        while (anchorDistance < labelLength / 2) {
            const prev = line[index - 1];
            const current = line[index];
            const next = line[index + 1];
            // there isn't enough room for the label before the end of the line
            if (!next)
                return false;
            let angleDelta = prev.angleTo(current) - current.angleTo(next);
            // restrict angle to -pi..pi range
            angleDelta = Math.abs(((angleDelta + 3 * Math.PI) % (Math.PI * 2)) - Math.PI);
            recentCorners.push({
                distance: anchorDistance,
                angleDelta
            });
            recentAngleDelta += angleDelta;
            // remove corners that are far enough away from the list of recent anchors
            while (anchorDistance - recentCorners[0].distance > windowSize) {
                recentAngleDelta -= recentCorners.shift().angleDelta;
            }
            // the sum of angles within the window area exceeds the maximum allowed value. check fails.
            if (recentAngleDelta > maxAngle)
                return false;
            index++;
            anchorDistance += current.dist(next);
        }
        // no part of the line had an angle greater than the maximum allowed. check passes.
        return true;
    }

    function getLineLength(line) {
        let lineLength = 0;
        for (let k = 0; k < line.length - 1; k++) {
            lineLength += line[k].dist(line[k + 1]);
        }
        return lineLength;
    }
    function getAngleWindowSize(shapedText, glyphSize, boxScale) {
        return shapedText ?
            3 / 5 * glyphSize * boxScale :
            0;
    }
    function getShapedLabelLength(shapedText, shapedIcon) {
        return Math.max(shapedText ? shapedText.right - shapedText.left : 0, shapedIcon ? shapedIcon.right - shapedIcon.left : 0);
    }
    function getCenterAnchor(line, maxAngle, shapedText, shapedIcon, glyphSize, boxScale) {
        const angleWindowSize = getAngleWindowSize(shapedText, glyphSize, boxScale);
        const labelLength = getShapedLabelLength(shapedText, shapedIcon) * boxScale;
        let prevDistance = 0;
        const centerDistance = getLineLength(line) / 2;
        for (let i = 0; i < line.length - 1; i++) {
            const a = line[i], b = line[i + 1];
            const segmentDistance = a.dist(b);
            if (prevDistance + segmentDistance > centerDistance) {
                // The center is on this segment
                const t = (centerDistance - prevDistance) / segmentDistance, x = number(a.x, b.x, t), y = number(a.y, b.y, t);
                const anchor = new Anchor(x, y, b.angleTo(a), i);
                anchor._round();
                if (!angleWindowSize || checkMaxAngle(line, anchor, labelLength, angleWindowSize, maxAngle)) {
                    return anchor;
                }
                else {
                    return;
                }
            }
            prevDistance += segmentDistance;
        }
    }
    function getAnchors(line, spacing, maxAngle, shapedText, shapedIcon, glyphSize, boxScale, overscaling, tileExtent) {
        // Resample a line to get anchor points for labels and check that each
        // potential label passes text-max-angle check and has enough froom to fit
        // on the line.
        const angleWindowSize = getAngleWindowSize(shapedText, glyphSize, boxScale);
        const shapedLabelLength = getShapedLabelLength(shapedText, shapedIcon);
        const labelLength = shapedLabelLength * boxScale;
        // Is the line continued from outside the tile boundary?
        const isLineContinued = line[0].x === 0 || line[0].x === tileExtent || line[0].y === 0 || line[0].y === tileExtent;
        // Is the label long, relative to the spacing?
        // If so, adjust the spacing so there is always a minimum space of `spacing / 4` between label edges.
        if (spacing - labelLength < spacing / 4) {
            spacing = labelLength + spacing / 4;
        }
        // Offset the first anchor by:
        // Either half the label length plus a fixed extra offset if the line is not continued
        // Or half the spacing if the line is continued.
        // For non-continued lines, add a bit of fixed extra offset to avoid collisions at T intersections.
        const fixedExtraOffset = glyphSize * 2;
        const offset = !isLineContinued ?
            ((shapedLabelLength / 2 + fixedExtraOffset) * boxScale * overscaling) % spacing :
            (spacing / 2 * overscaling) % spacing;
        return resample(line, offset, spacing, angleWindowSize, maxAngle, labelLength, isLineContinued, false, tileExtent);
    }
    function resample(line, offset, spacing, angleWindowSize, maxAngle, labelLength, isLineContinued, placeAtMiddle, tileExtent) {
        const halfLabelLength = labelLength / 2;
        const lineLength = getLineLength(line);
        let distance = 0, markedDistance = offset - spacing;
        let anchors = [];
        for (let i = 0; i < line.length - 1; i++) {
            const a = line[i], b = line[i + 1];
            const segmentDist = a.dist(b), angle = b.angleTo(a);
            while (markedDistance + spacing < distance + segmentDist) {
                markedDistance += spacing;
                const t = (markedDistance - distance) / segmentDist, x = number(a.x, b.x, t), y = number(a.y, b.y, t);
                // Check that the point is within the tile boundaries and that
                // the label would fit before the beginning and end of the line
                // if placed at this point.
                if (x >= 0 && x < tileExtent && y >= 0 && y < tileExtent &&
                    markedDistance - halfLabelLength >= 0 &&
                    markedDistance + halfLabelLength <= lineLength) {
                    const anchor = new Anchor(x, y, angle, i);
                    anchor._round();
                    if (!angleWindowSize || checkMaxAngle(line, anchor, labelLength, angleWindowSize, maxAngle)) {
                        anchors.push(anchor);
                    }
                }
            }
            distance += segmentDist;
        }
        if (!placeAtMiddle && !anchors.length && !isLineContinued) {
            // The first attempt at finding anchors at which labels can be placed failed.
            // Try again, but this time just try placing one anchor at the middle of the line.
            // This has the most effect for short lines in overscaled tiles, since the
            // initial offset used in overscaled tiles is calculated to align labels with positions in
            // parent tiles instead of placing the label as close to the beginning as possible.
            anchors = resample(line, distance / 2, spacing, angleWindowSize, maxAngle, labelLength, isLineContinued, true, tileExtent);
        }
        return anchors;
    }

    /**
     * Returns the part of a multiline that intersects with the provided rectangular box.
     *
     * @param lines
     * @param x1 the left edge of the box
     * @param y1 the top edge of the box
     * @param x2 the right edge of the box
     * @param y2 the bottom edge of the box
     * @returns lines
     * @private
     */
    function clipLine(lines, x1, y1, x2, y2) {
        const clippedLines = [];
        for (let l = 0; l < lines.length; l++) {
            const line = lines[l];
            let clippedLine;
            for (let i = 0; i < line.length - 1; i++) {
                let p0 = line[i];
                let p1 = line[i + 1];
                if (p0.x < x1 && p1.x < x1) {
                    continue;
                }
                else if (p0.x < x1) {
                    p0 = new pointGeometry(x1, p0.y + (p1.y - p0.y) * ((x1 - p0.x) / (p1.x - p0.x)))._round();
                }
                else if (p1.x < x1) {
                    p1 = new pointGeometry(x1, p0.y + (p1.y - p0.y) * ((x1 - p0.x) / (p1.x - p0.x)))._round();
                }
                if (p0.y < y1 && p1.y < y1) {
                    continue;
                }
                else if (p0.y < y1) {
                    p0 = new pointGeometry(p0.x + (p1.x - p0.x) * ((y1 - p0.y) / (p1.y - p0.y)), y1)._round();
                }
                else if (p1.y < y1) {
                    p1 = new pointGeometry(p0.x + (p1.x - p0.x) * ((y1 - p0.y) / (p1.y - p0.y)), y1)._round();
                }
                if (p0.x >= x2 && p1.x >= x2) {
                    continue;
                }
                else if (p0.x >= x2) {
                    p0 = new pointGeometry(x2, p0.y + (p1.y - p0.y) * ((x2 - p0.x) / (p1.x - p0.x)))._round();
                }
                else if (p1.x >= x2) {
                    p1 = new pointGeometry(x2, p0.y + (p1.y - p0.y) * ((x2 - p0.x) / (p1.x - p0.x)))._round();
                }
                if (p0.y >= y2 && p1.y >= y2) {
                    continue;
                }
                else if (p0.y >= y2) {
                    p0 = new pointGeometry(p0.x + (p1.x - p0.x) * ((y2 - p0.y) / (p1.y - p0.y)), y2)._round();
                }
                else if (p1.y >= y2) {
                    p1 = new pointGeometry(p0.x + (p1.x - p0.x) * ((y2 - p0.y) / (p1.y - p0.y)), y2)._round();
                }
                if (!clippedLine || !p0.equals(clippedLine[clippedLine.length - 1])) {
                    clippedLine = [p0];
                    clippedLines.push(clippedLine);
                }
                clippedLine.push(p1);
            }
        }
        return clippedLines;
    }

    // If you have a 10px icon that isn't perfectly aligned to the pixel grid it will cover 11 actual
    // pixels. The quad needs to be padded to account for this, otherwise they'll look slightly clipped
    // on one edge in some cases.
    const border = IMAGE_PADDING;
    /**
     * Create the quads used for rendering an icon.
     * @private
     */
    function getIconQuads(shapedIcon, iconRotate, isSDFIcon, hasIconTextFit) {
        const quads = [];
        const image = shapedIcon.image;
        const pixelRatio = image.pixelRatio;
        const imageWidth = image.paddedRect.w - 2 * border;
        const imageHeight = image.paddedRect.h - 2 * border;
        const iconWidth = shapedIcon.right - shapedIcon.left;
        const iconHeight = shapedIcon.bottom - shapedIcon.top;
        const stretchX = image.stretchX || [[0, imageWidth]];
        const stretchY = image.stretchY || [[0, imageHeight]];
        const reduceRanges = (sum, range) => sum + range[1] - range[0];
        const stretchWidth = stretchX.reduce(reduceRanges, 0);
        const stretchHeight = stretchY.reduce(reduceRanges, 0);
        const fixedWidth = imageWidth - stretchWidth;
        const fixedHeight = imageHeight - stretchHeight;
        let stretchOffsetX = 0;
        let stretchContentWidth = stretchWidth;
        let stretchOffsetY = 0;
        let stretchContentHeight = stretchHeight;
        let fixedOffsetX = 0;
        let fixedContentWidth = fixedWidth;
        let fixedOffsetY = 0;
        let fixedContentHeight = fixedHeight;
        if (image.content && hasIconTextFit) {
            const content = image.content;
            stretchOffsetX = sumWithinRange(stretchX, 0, content[0]);
            stretchOffsetY = sumWithinRange(stretchY, 0, content[1]);
            stretchContentWidth = sumWithinRange(stretchX, content[0], content[2]);
            stretchContentHeight = sumWithinRange(stretchY, content[1], content[3]);
            fixedOffsetX = content[0] - stretchOffsetX;
            fixedOffsetY = content[1] - stretchOffsetY;
            fixedContentWidth = content[2] - content[0] - stretchContentWidth;
            fixedContentHeight = content[3] - content[1] - stretchContentHeight;
        }
        const makeBox = (left, top, right, bottom) => {
            const leftEm = getEmOffset(left.stretch - stretchOffsetX, stretchContentWidth, iconWidth, shapedIcon.left);
            const leftPx = getPxOffset(left.fixed - fixedOffsetX, fixedContentWidth, left.stretch, stretchWidth);
            const topEm = getEmOffset(top.stretch - stretchOffsetY, stretchContentHeight, iconHeight, shapedIcon.top);
            const topPx = getPxOffset(top.fixed - fixedOffsetY, fixedContentHeight, top.stretch, stretchHeight);
            const rightEm = getEmOffset(right.stretch - stretchOffsetX, stretchContentWidth, iconWidth, shapedIcon.left);
            const rightPx = getPxOffset(right.fixed - fixedOffsetX, fixedContentWidth, right.stretch, stretchWidth);
            const bottomEm = getEmOffset(bottom.stretch - stretchOffsetY, stretchContentHeight, iconHeight, shapedIcon.top);
            const bottomPx = getPxOffset(bottom.fixed - fixedOffsetY, fixedContentHeight, bottom.stretch, stretchHeight);
            const tl = new pointGeometry(leftEm, topEm);
            const tr = new pointGeometry(rightEm, topEm);
            const br = new pointGeometry(rightEm, bottomEm);
            const bl = new pointGeometry(leftEm, bottomEm);
            const pixelOffsetTL = new pointGeometry(leftPx / pixelRatio, topPx / pixelRatio);
            const pixelOffsetBR = new pointGeometry(rightPx / pixelRatio, bottomPx / pixelRatio);
            const angle = iconRotate * Math.PI / 180;
            if (angle) {
                const sin = Math.sin(angle), cos = Math.cos(angle), matrix = [cos, -sin, sin, cos];
                tl._matMult(matrix);
                tr._matMult(matrix);
                bl._matMult(matrix);
                br._matMult(matrix);
            }
            const x1 = left.stretch + left.fixed;
            const x2 = right.stretch + right.fixed;
            const y1 = top.stretch + top.fixed;
            const y2 = bottom.stretch + bottom.fixed;
            const subRect = {
                x: image.paddedRect.x + border + x1,
                y: image.paddedRect.y + border + y1,
                w: x2 - x1,
                h: y2 - y1
            };
            const minFontScaleX = fixedContentWidth / pixelRatio / iconWidth;
            const minFontScaleY = fixedContentHeight / pixelRatio / iconHeight;
            // Icon quad is padded, so texture coordinates also need to be padded.
            return { tl, tr, bl, br, tex: subRect, writingMode: undefined, glyphOffset: [0, 0], sectionIndex: 0, pixelOffsetTL, pixelOffsetBR, minFontScaleX, minFontScaleY, isSDF: isSDFIcon };
        };
        if (!hasIconTextFit || (!image.stretchX && !image.stretchY)) {
            quads.push(makeBox({ fixed: 0, stretch: -1 }, { fixed: 0, stretch: -1 }, { fixed: 0, stretch: imageWidth + 1 }, { fixed: 0, stretch: imageHeight + 1 }));
        }
        else {
            const xCuts = stretchZonesToCuts(stretchX, fixedWidth, stretchWidth);
            const yCuts = stretchZonesToCuts(stretchY, fixedHeight, stretchHeight);
            for (let xi = 0; xi < xCuts.length - 1; xi++) {
                const x1 = xCuts[xi];
                const x2 = xCuts[xi + 1];
                for (let yi = 0; yi < yCuts.length - 1; yi++) {
                    const y1 = yCuts[yi];
                    const y2 = yCuts[yi + 1];
                    quads.push(makeBox(x1, y1, x2, y2));
                }
            }
        }
        return quads;
    }
    function sumWithinRange(ranges, min, max) {
        let sum = 0;
        for (const range of ranges) {
            sum += Math.max(min, Math.min(max, range[1])) - Math.max(min, Math.min(max, range[0]));
        }
        return sum;
    }
    function stretchZonesToCuts(stretchZones, fixedSize, stretchSize) {
        const cuts = [{ fixed: -border, stretch: 0 }];
        for (const [c1, c2] of stretchZones) {
            const last = cuts[cuts.length - 1];
            cuts.push({
                fixed: c1 - last.stretch,
                stretch: last.stretch
            });
            cuts.push({
                fixed: c1 - last.stretch,
                stretch: last.stretch + (c2 - c1)
            });
        }
        cuts.push({
            fixed: fixedSize + border,
            stretch: stretchSize
        });
        return cuts;
    }
    function getEmOffset(stretchOffset, stretchSize, iconSize, iconOffset) {
        return stretchOffset / stretchSize * iconSize + iconOffset;
    }
    function getPxOffset(fixedOffset, fixedSize, stretchOffset, stretchSize) {
        return fixedOffset - fixedSize * stretchOffset / stretchSize;
    }
    /**
     * Create the quads used for rendering a text label.
     * @private
     */
    function getGlyphQuads(anchor, shaping, textOffset, layer, alongLine, feature, imageMap, allowVerticalPlacement) {
        const textRotate = layer.layout.get('text-rotate').evaluate(feature, {}) * Math.PI / 180;
        const quads = [];
        for (const line of shaping.positionedLines) {
            for (const positionedGlyph of line.positionedGlyphs) {
                if (!positionedGlyph.rect)
                    continue;
                const textureRect = positionedGlyph.rect || {};
                // The rects have an additional buffer that is not included in their size.
                const glyphPadding = 1.0;
                let rectBuffer = GLYPH_PBF_BORDER + glyphPadding;
                let isSDF = true;
                let pixelRatio = 1.0;
                let lineOffset = 0.0;
                const rotateVerticalGlyph = (alongLine || allowVerticalPlacement) && positionedGlyph.vertical;
                const halfAdvance = positionedGlyph.metrics.advance * positionedGlyph.scale / 2;
                // Align images and scaled glyphs in the middle of a vertical line.
                if (allowVerticalPlacement && shaping.verticalizable) {
                    const scaledGlyphOffset = (positionedGlyph.scale - 1) * ONE_EM;
                    const imageOffset = (ONE_EM - positionedGlyph.metrics.width * positionedGlyph.scale) / 2;
                    lineOffset = line.lineOffset / 2 - (positionedGlyph.imageName ? -imageOffset : scaledGlyphOffset);
                }
                if (positionedGlyph.imageName) {
                    const image = imageMap[positionedGlyph.imageName];
                    isSDF = image.sdf;
                    pixelRatio = image.pixelRatio;
                    rectBuffer = IMAGE_PADDING / pixelRatio;
                }
                const glyphOffset = alongLine ?
                    [positionedGlyph.x + halfAdvance, positionedGlyph.y] :
                    [0, 0];
                let builtInOffset = alongLine ?
                    [0, 0] :
                    [positionedGlyph.x + halfAdvance + textOffset[0], positionedGlyph.y + textOffset[1] - lineOffset];
                let verticalizedLabelOffset = [0, 0];
                if (rotateVerticalGlyph) {
                    // Vertical POI labels that are rotated 90deg CW and whose glyphs must preserve upright orientation
                    // need to be rotated 90deg CCW. After a quad is rotated, it is translated to the original built-in offset.
                    verticalizedLabelOffset = builtInOffset;
                    builtInOffset = [0, 0];
                }
                const x1 = (positionedGlyph.metrics.left - rectBuffer) * positionedGlyph.scale - halfAdvance + builtInOffset[0];
                const y1 = (-positionedGlyph.metrics.top - rectBuffer) * positionedGlyph.scale + builtInOffset[1];
                const x2 = x1 + textureRect.w * positionedGlyph.scale / pixelRatio;
                const y2 = y1 + textureRect.h * positionedGlyph.scale / pixelRatio;
                const tl = new pointGeometry(x1, y1);
                const tr = new pointGeometry(x2, y1);
                const bl = new pointGeometry(x1, y2);
                const br = new pointGeometry(x2, y2);
                if (rotateVerticalGlyph) {
                    // Vertical-supporting glyphs are laid out in 24x24 point boxes (1 square em)
                    // In horizontal orientation, the y values for glyphs are below the midline
                    // and we use a "yOffset" of -17 to pull them up to the middle.
                    // By rotating counter-clockwise around the point at the center of the left
                    // edge of a 24x24 layout box centered below the midline, we align the center
                    // of the glyphs with the horizontal midline, so the yOffset is no longer
                    // necessary, but we also pull the glyph to the left along the x axis.
                    // The y coordinate includes baseline yOffset, thus needs to be accounted
                    // for when glyph is rotated and translated.
                    const center = new pointGeometry(-halfAdvance, halfAdvance - SHAPING_DEFAULT_OFFSET);
                    const verticalRotation = -Math.PI / 2;
                    // xHalfWidthOffsetCorrection is a difference between full-width and half-width
                    // advance, should be 0 for full-width glyphs and will pull up half-width glyphs.
                    const xHalfWidthOffsetCorrection = ONE_EM / 2 - halfAdvance;
                    const yImageOffsetCorrection = positionedGlyph.imageName ? xHalfWidthOffsetCorrection : 0.0;
                    const halfWidthOffsetCorrection = new pointGeometry(5 - SHAPING_DEFAULT_OFFSET - xHalfWidthOffsetCorrection, -yImageOffsetCorrection);
                    const verticalOffsetCorrection = new pointGeometry(...verticalizedLabelOffset);
                    tl._rotateAround(verticalRotation, center)._add(halfWidthOffsetCorrection)._add(verticalOffsetCorrection);
                    tr._rotateAround(verticalRotation, center)._add(halfWidthOffsetCorrection)._add(verticalOffsetCorrection);
                    bl._rotateAround(verticalRotation, center)._add(halfWidthOffsetCorrection)._add(verticalOffsetCorrection);
                    br._rotateAround(verticalRotation, center)._add(halfWidthOffsetCorrection)._add(verticalOffsetCorrection);
                }
                if (textRotate) {
                    const sin = Math.sin(textRotate), cos = Math.cos(textRotate), matrix = [cos, -sin, sin, cos];
                    tl._matMult(matrix);
                    tr._matMult(matrix);
                    bl._matMult(matrix);
                    br._matMult(matrix);
                }
                const pixelOffsetTL = new pointGeometry(0, 0);
                const pixelOffsetBR = new pointGeometry(0, 0);
                const minFontScaleX = 0;
                const minFontScaleY = 0;
                quads.push({ tl, tr, bl, br, tex: textureRect, writingMode: shaping.writingMode, glyphOffset, sectionIndex: positionedGlyph.sectionIndex, isSDF, pixelOffsetTL, pixelOffsetBR, minFontScaleX, minFontScaleY });
            }
        }
        return quads;
    }

    /**
     * A CollisionFeature represents the area of the tile covered by a single label.
     * It is used with CollisionIndex to check if the label overlaps with any
     * previous labels. A CollisionFeature is mostly just a set of CollisionBox
     * objects.
     *
     * @private
     */
    class CollisionFeature {
        /**
         * Create a CollisionFeature, adding its collision box data to the given collisionBoxArray in the process.
         * For line aligned labels a collision circle diameter is computed instead.
         *
         * @param anchor The point along the line around which the label is anchored.
         * @param shaped The text or icon shaping results.
         * @param boxScale A magic number used to convert from glyph metrics units to geometry units.
         * @param padding The amount of padding to add around the label edges.
         * @param alignLine Whether the label is aligned with the line or the viewport.
         * @private
         */
        constructor(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, shaped, boxScale, padding, alignLine, rotate) {
            this.boxStartIndex = collisionBoxArray.length;
            if (alignLine) {
                // Compute height of the shape in glyph metrics and apply collision padding.
                // Note that the pixel based 'text-padding' is applied at runtime
                let top = shaped.top;
                let bottom = shaped.bottom;
                const collisionPadding = shaped.collisionPadding;
                if (collisionPadding) {
                    top -= collisionPadding[1];
                    bottom += collisionPadding[3];
                }
                let height = bottom - top;
                if (height > 0) {
                    // set minimum box height to avoid very many small labels
                    height = Math.max(10, height);
                    this.circleDiameter = height;
                }
            }
            else {
                // margin is in CSS order: [top, right, bottom, left]
                let y1 = shaped.top * boxScale - padding[0];
                let y2 = shaped.bottom * boxScale + padding[2];
                let x1 = shaped.left * boxScale - padding[3];
                let x2 = shaped.right * boxScale + padding[1];
                const collisionPadding = shaped.collisionPadding;
                if (collisionPadding) {
                    x1 -= collisionPadding[0] * boxScale;
                    y1 -= collisionPadding[1] * boxScale;
                    x2 += collisionPadding[2] * boxScale;
                    y2 += collisionPadding[3] * boxScale;
                }
                if (rotate) {
                    // Account for *-rotate in point collision boxes
                    // See https://github.com/mapbox/mapbox-gl-js/issues/6075
                    // Doesn't account for icon-text-fit
                    const tl = new pointGeometry(x1, y1);
                    const tr = new pointGeometry(x2, y1);
                    const bl = new pointGeometry(x1, y2);
                    const br = new pointGeometry(x2, y2);
                    const rotateRadians = rotate * Math.PI / 180;
                    tl._rotate(rotateRadians);
                    tr._rotate(rotateRadians);
                    bl._rotate(rotateRadians);
                    br._rotate(rotateRadians);
                    // Collision features require an "on-axis" geometry,
                    // so take the envelope of the rotated geometry
                    // (may be quite large for wide labels rotated 45 degrees)
                    x1 = Math.min(tl.x, tr.x, bl.x, br.x);
                    x2 = Math.max(tl.x, tr.x, bl.x, br.x);
                    y1 = Math.min(tl.y, tr.y, bl.y, br.y);
                    y2 = Math.max(tl.y, tr.y, bl.y, br.y);
                }
                collisionBoxArray.emplaceBack(anchor.x, anchor.y, x1, y1, x2, y2, featureIndex, sourceLayerIndex, bucketIndex);
            }
            this.boxEndIndex = collisionBoxArray.length;
        }
    }

    class TinyQueue {
        constructor(data = [], compare = defaultCompare) {
            this.data = data;
            this.length = this.data.length;
            this.compare = compare;

            if (this.length > 0) {
                for (let i = (this.length >> 1) - 1; i >= 0; i--) this._down(i);
            }
        }

        push(item) {
            this.data.push(item);
            this.length++;
            this._up(this.length - 1);
        }

        pop() {
            if (this.length === 0) return undefined;

            const top = this.data[0];
            const bottom = this.data.pop();
            this.length--;

            if (this.length > 0) {
                this.data[0] = bottom;
                this._down(0);
            }

            return top;
        }

        peek() {
            return this.data[0];
        }

        _up(pos) {
            const {data, compare} = this;
            const item = data[pos];

            while (pos > 0) {
                const parent = (pos - 1) >> 1;
                const current = data[parent];
                if (compare(item, current) >= 0) break;
                data[pos] = current;
                pos = parent;
            }

            data[pos] = item;
        }

        _down(pos) {
            const {data, compare} = this;
            const halfLength = this.length >> 1;
            const item = data[pos];

            while (pos < halfLength) {
                let left = (pos << 1) + 1;
                let best = data[left];
                const right = left + 1;

                if (right < this.length && compare(data[right], best) < 0) {
                    left = right;
                    best = data[right];
                }
                if (compare(best, item) >= 0) break;

                data[pos] = best;
                pos = left;
            }

            data[pos] = item;
        }
    }

    function defaultCompare(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }

    /**
     * Finds an approximation of a polygon's Pole Of Inaccessibiliy https://en.wikipedia.org/wiki/Pole_of_inaccessibility
     * This is a copy of http://github.com/mapbox/polylabel adapted to use Points
     *
     * @param polygonRings first item in array is the outer ring followed optionally by the list of holes, should be an element of the result of util/classify_rings
     * @param precision Specified in input coordinate units. If 0 returns after first run, if > 0 repeatedly narrows the search space until the radius of the area searched for the best pole is less than precision
     * @param debug Print some statistics to the console during execution
     * @returns Pole of Inaccessibiliy.
     * @private
     */
    function findPoleOfInaccessibility(polygonRings, precision = 1, debug = false) {
        // find the bounding box of the outer ring
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const outerRing = polygonRings[0];
        for (let i = 0; i < outerRing.length; i++) {
            const p = outerRing[i];
            if (!i || p.x < minX)
                minX = p.x;
            if (!i || p.y < minY)
                minY = p.y;
            if (!i || p.x > maxX)
                maxX = p.x;
            if (!i || p.y > maxY)
                maxY = p.y;
        }
        const width = maxX - minX;
        const height = maxY - minY;
        const cellSize = Math.min(width, height);
        let h = cellSize / 2;
        // a priority queue of cells in order of their "potential" (max distance to polygon)
        const cellQueue = new TinyQueue([], compareMax);
        if (cellSize === 0)
            return new pointGeometry(minX, minY);
        // cover polygon with initial cells
        for (let x = minX; x < maxX; x += cellSize) {
            for (let y = minY; y < maxY; y += cellSize) {
                cellQueue.push(new Cell(x + h, y + h, h, polygonRings));
            }
        }
        // take centroid as the first best guess
        let bestCell = getCentroidCell(polygonRings);
        let numProbes = cellQueue.length;
        while (cellQueue.length) {
            // pick the most promising cell from the queue
            const cell = cellQueue.pop();
            // update the best cell if we found a better one
            if (cell.d > bestCell.d || !bestCell.d) {
                bestCell = cell;
                if (debug)
                    console.log('found best %d after %d probes', Math.round(1e4 * cell.d) / 1e4, numProbes);
            }
            // do not drill down further if there's no chance of a better solution
            if (cell.max - bestCell.d <= precision)
                continue;
            // split the cell into four cells
            h = cell.h / 2;
            cellQueue.push(new Cell(cell.p.x - h, cell.p.y - h, h, polygonRings));
            cellQueue.push(new Cell(cell.p.x + h, cell.p.y - h, h, polygonRings));
            cellQueue.push(new Cell(cell.p.x - h, cell.p.y + h, h, polygonRings));
            cellQueue.push(new Cell(cell.p.x + h, cell.p.y + h, h, polygonRings));
            numProbes += 4;
        }
        if (debug) {
            console.log(`num probes: ${numProbes}`);
            console.log(`best distance: ${bestCell.d}`);
        }
        return bestCell.p;
    }
    function compareMax(a, b) {
        return b.max - a.max;
    }
    function Cell(x, y, h, polygon) {
        this.p = new pointGeometry(x, y);
        this.h = h; // half the cell size
        this.d = pointToPolygonDist(this.p, polygon); // distance from cell center to polygon
        this.max = this.d + this.h * Math.SQRT2; // max distance to polygon within a cell
    }
    // signed distance from point to polygon outline (negative if point is outside)
    function pointToPolygonDist(p, polygon) {
        let inside = false;
        let minDistSq = Infinity;
        for (let k = 0; k < polygon.length; k++) {
            const ring = polygon[k];
            for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
                const a = ring[i];
                const b = ring[j];
                if ((a.y > p.y !== b.y > p.y) &&
                    (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x))
                    inside = !inside;
                minDistSq = Math.min(minDistSq, distToSegmentSquared(p, a, b));
            }
        }
        return (inside ? 1 : -1) * Math.sqrt(minDistSq);
    }
    // get polygon centroid
    function getCentroidCell(polygon) {
        let area = 0;
        let x = 0;
        let y = 0;
        const points = polygon[0];
        for (let i = 0, len = points.length, j = len - 1; i < len; j = i++) {
            const a = points[i];
            const b = points[j];
            const f = a.x * b.y - b.x * a.y;
            x += (a.x + b.x) * f;
            y += (a.y + b.y) * f;
            area += f * 3;
        }
        return new Cell(x / area, y / area, 0, polygon);
    }

    // The radial offset is to the edge of the text box
    // In the horizontal direction, the edge of the text box is where glyphs start
    // But in the vertical direction, the glyphs appear to "start" at the baseline
    // We don't actually load baseline data, but we assume an offset of ONE_EM - 17
    // (see "yOffset" in shaping.js)
    const baselineOffset = 7;
    const INVALID_TEXT_OFFSET = Number.POSITIVE_INFINITY;
    function evaluateVariableOffset(anchor, offset) {
        function fromRadialOffset(anchor, radialOffset) {
            let x = 0, y = 0;
            if (radialOffset < 0)
                radialOffset = 0; // Ignore negative offset.
            // solve for r where r^2 + r^2 = radialOffset^2
            const hypotenuse = radialOffset / Math.sqrt(2);
            switch (anchor) {
                case 'top-right':
                case 'top-left':
                    y = hypotenuse - baselineOffset;
                    break;
                case 'bottom-right':
                case 'bottom-left':
                    y = -hypotenuse + baselineOffset;
                    break;
                case 'bottom':
                    y = -radialOffset + baselineOffset;
                    break;
                case 'top':
                    y = radialOffset - baselineOffset;
                    break;
            }
            switch (anchor) {
                case 'top-right':
                case 'bottom-right':
                    x = -hypotenuse;
                    break;
                case 'top-left':
                case 'bottom-left':
                    x = hypotenuse;
                    break;
                case 'left':
                    x = radialOffset;
                    break;
                case 'right':
                    x = -radialOffset;
                    break;
            }
            return [x, y];
        }
        function fromTextOffset(anchor, offsetX, offsetY) {
            let x = 0, y = 0;
            // Use absolute offset values.
            offsetX = Math.abs(offsetX);
            offsetY = Math.abs(offsetY);
            switch (anchor) {
                case 'top-right':
                case 'top-left':
                case 'top':
                    y = offsetY - baselineOffset;
                    break;
                case 'bottom-right':
                case 'bottom-left':
                case 'bottom':
                    y = -offsetY + baselineOffset;
                    break;
            }
            switch (anchor) {
                case 'top-right':
                case 'bottom-right':
                case 'right':
                    x = -offsetX;
                    break;
                case 'top-left':
                case 'bottom-left':
                case 'left':
                    x = offsetX;
                    break;
            }
            return [x, y];
        }
        return (offset[1] !== INVALID_TEXT_OFFSET) ? fromTextOffset(anchor, offset[0], offset[1]) : fromRadialOffset(anchor, offset[0]);
    }
    function performSymbolLayout(args) {
        args.bucket.createArrays();
        const tileSize = 512 * args.bucket.overscaling;
        args.bucket.tilePixelRatio = EXTENT / tileSize;
        args.bucket.compareText = {};
        args.bucket.iconsNeedLinear = false;
        const layout = args.bucket.layers[0].layout;
        const unevaluatedLayoutValues = args.bucket.layers[0]._unevaluatedLayout._values;
        const sizes = {
            // Filled in below, if *SizeData.kind is 'composite'
            // compositeIconSizes: undefined,
            // compositeTextSizes: undefined,
            layoutIconSize: unevaluatedLayoutValues['icon-size'].possiblyEvaluate(new EvaluationParameters(args.bucket.zoom + 1), args.canonical),
            layoutTextSize: unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(args.bucket.zoom + 1), args.canonical),
            textMaxSize: unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(18))
        };
        if (args.bucket.textSizeData.kind === 'composite') {
            const { minZoom, maxZoom } = args.bucket.textSizeData;
            sizes.compositeTextSizes = [
                unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(minZoom), args.canonical),
                unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(maxZoom), args.canonical)
            ];
        }
        if (args.bucket.iconSizeData.kind === 'composite') {
            const { minZoom, maxZoom } = args.bucket.iconSizeData;
            sizes.compositeIconSizes = [
                unevaluatedLayoutValues['icon-size'].possiblyEvaluate(new EvaluationParameters(minZoom), args.canonical),
                unevaluatedLayoutValues['icon-size'].possiblyEvaluate(new EvaluationParameters(maxZoom), args.canonical)
            ];
        }
        const lineHeight = layout.get('text-line-height') * ONE_EM;
        const textAlongLine = layout.get('text-rotation-alignment') !== 'viewport' && layout.get('symbol-placement') !== 'point';
        const keepUpright = layout.get('text-keep-upright');
        const textSize = layout.get('text-size');
        for (const feature of args.bucket.features) {
            const fontstack = layout.get('text-font').evaluate(feature, {}, args.canonical).join(',');
            const layoutTextSizeThisZoom = textSize.evaluate(feature, {}, args.canonical);
            const layoutTextSize = sizes.layoutTextSize.evaluate(feature, {}, args.canonical);
            const layoutIconSize = sizes.layoutIconSize.evaluate(feature, {}, args.canonical);
            const shapedTextOrientations = {
                horizontal: {},
                vertical: undefined
            };
            const text = feature.text;
            let textOffset = [0, 0];
            if (text) {
                const unformattedText = text.toString();
                const spacing = layout.get('text-letter-spacing').evaluate(feature, {}, args.canonical) * ONE_EM;
                const spacingIfAllowed = allowsLetterSpacing(unformattedText) ? spacing : 0;
                const textAnchor = layout.get('text-anchor').evaluate(feature, {}, args.canonical);
                const variableTextAnchor = layout.get('text-variable-anchor');
                if (!variableTextAnchor) {
                    const radialOffset = layout.get('text-radial-offset').evaluate(feature, {}, args.canonical);
                    // Layers with variable anchors use the `text-radial-offset` property and the [x, y] offset vector
                    // is calculated at placement time instead of layout time
                    if (radialOffset) {
                        // The style spec says don't use `text-offset` and `text-radial-offset` together
                        // but doesn't actually specify what happens if you use both. We go with the radial offset.
                        textOffset = evaluateVariableOffset(textAnchor, [radialOffset * ONE_EM, INVALID_TEXT_OFFSET]);
                    }
                    else {
                        textOffset = layout.get('text-offset').evaluate(feature, {}, args.canonical).map(t => t * ONE_EM);
                    }
                }
                let textJustify = textAlongLine ?
                    'center' :
                    layout.get('text-justify').evaluate(feature, {}, args.canonical);
                const symbolPlacement = layout.get('symbol-placement');
                const maxWidth = symbolPlacement === 'point' ?
                    layout.get('text-max-width').evaluate(feature, {}, args.canonical) * ONE_EM :
                    0;
                const addVerticalShapingForPointLabelIfNeeded = () => {
                    if (args.bucket.allowVerticalPlacement && allowsVerticalWritingMode(unformattedText)) {
                        // Vertical POI label placement is meant to be used for scripts that support vertical
                        // writing mode, thus, default left justification is used. If Latin
                        // scripts would need to be supported, this should take into account other justifications.
                        shapedTextOrientations.vertical = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, textAnchor, 'left', spacingIfAllowed, textOffset, WritingMode.vertical, true, symbolPlacement, layoutTextSize, layoutTextSizeThisZoom);
                    }
                };
                // If this layer uses text-variable-anchor, generate shapings for all justification possibilities.
                if (!textAlongLine && variableTextAnchor) {
                    const justifications = textJustify === 'auto' ?
                        variableTextAnchor.map(a => getAnchorJustification(a)) :
                        [textJustify];
                    let singleLine = false;
                    for (let i = 0; i < justifications.length; i++) {
                        const justification = justifications[i];
                        if (shapedTextOrientations.horizontal[justification])
                            continue;
                        if (singleLine) {
                            // If the shaping for the first justification was only a single line, we
                            // can re-use it for the other justifications
                            shapedTextOrientations.horizontal[justification] = shapedTextOrientations.horizontal[0];
                        }
                        else {
                            // If using text-variable-anchor for the layer, we use a center anchor for all shapings and apply
                            // the offsets for the anchor in the placement step.
                            const shaping = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, 'center', justification, spacingIfAllowed, textOffset, WritingMode.horizontal, false, symbolPlacement, layoutTextSize, layoutTextSizeThisZoom);
                            if (shaping) {
                                shapedTextOrientations.horizontal[justification] = shaping;
                                singleLine = shaping.positionedLines.length === 1;
                            }
                        }
                    }
                    addVerticalShapingForPointLabelIfNeeded();
                }
                else {
                    if (textJustify === 'auto') {
                        textJustify = getAnchorJustification(textAnchor);
                    }
                    // Horizontal point or line label.
                    const shaping = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, textAnchor, textJustify, spacingIfAllowed, textOffset, WritingMode.horizontal, false, symbolPlacement, layoutTextSize, layoutTextSizeThisZoom);
                    if (shaping)
                        shapedTextOrientations.horizontal[textJustify] = shaping;
                    // Vertical point label (if allowVerticalPlacement is enabled).
                    addVerticalShapingForPointLabelIfNeeded();
                    // Verticalized line label.
                    if (allowsVerticalWritingMode(unformattedText) && textAlongLine && keepUpright) {
                        shapedTextOrientations.vertical = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, textAnchor, textJustify, spacingIfAllowed, textOffset, WritingMode.vertical, false, symbolPlacement, layoutTextSize, layoutTextSizeThisZoom);
                    }
                }
            }
            let shapedIcon;
            let isSDFIcon = false;
            if (feature.icon && feature.icon.name) {
                const image = args.imageMap[feature.icon.name];
                if (image) {
                    shapedIcon = shapeIcon(args.imagePositions[feature.icon.name], layout.get('icon-offset').evaluate(feature, {}, args.canonical), layout.get('icon-anchor').evaluate(feature, {}, args.canonical));
                    // null/undefined SDF property treated same as default (false)
                    isSDFIcon = !!image.sdf;
                    if (args.bucket.sdfIcons === undefined) {
                        args.bucket.sdfIcons = isSDFIcon;
                    }
                    else if (args.bucket.sdfIcons !== isSDFIcon) {
                        warnOnce('Style sheet warning: Cannot mix SDF and non-SDF icons in one buffer');
                    }
                    if (image.pixelRatio !== args.bucket.pixelRatio) {
                        args.bucket.iconsNeedLinear = true;
                    }
                    else if (layout.get('icon-rotate').constantOr(1) !== 0) {
                        args.bucket.iconsNeedLinear = true;
                    }
                }
            }
            const shapedText = getDefaultHorizontalShaping(shapedTextOrientations.horizontal) || shapedTextOrientations.vertical;
            args.bucket.iconsInText = shapedText ? shapedText.iconsInText : false;
            if (shapedText || shapedIcon) {
                addFeature(args.bucket, feature, shapedTextOrientations, shapedIcon, args.imageMap, sizes, layoutTextSize, layoutIconSize, textOffset, isSDFIcon, args.canonical);
            }
        }
        if (args.showCollisionBoxes) {
            args.bucket.generateCollisionDebugBuffers();
        }
    }
    // Choose the justification that matches the direction of the TextAnchor
    function getAnchorJustification(anchor) {
        switch (anchor) {
            case 'right':
            case 'top-right':
            case 'bottom-right':
                return 'right';
            case 'left':
            case 'top-left':
            case 'bottom-left':
                return 'left';
        }
        return 'center';
    }
    /**
     * Given a feature and its shaped text and icon data, add a 'symbol
     * instance' for each _possible_ placement of the symbol feature.
     * (At render timePlaceSymbols#place() selects which of these instances to
     * show or hide based on collisions with symbols in other layers.)
     * @private
     */
    function addFeature(bucket, feature, shapedTextOrientations, shapedIcon, imageMap, sizes, layoutTextSize, layoutIconSize, textOffset, isSDFIcon, canonical) {
        // To reduce the number of labels that jump around when zooming we need
        // to use a text-size value that is the same for all zoom levels.
        // bucket calculates text-size at a high zoom level so that all tiles can
        // use the same value when calculating anchor positions.
        let textMaxSize = sizes.textMaxSize.evaluate(feature, {});
        if (textMaxSize === undefined) {
            textMaxSize = layoutTextSize;
        }
        const layout = bucket.layers[0].layout;
        const iconOffset = layout.get('icon-offset').evaluate(feature, {}, canonical);
        const defaultHorizontalShaping = getDefaultHorizontalShaping(shapedTextOrientations.horizontal);
        const glyphSize = 24, fontScale = layoutTextSize / glyphSize, textBoxScale = bucket.tilePixelRatio * fontScale, textMaxBoxScale = bucket.tilePixelRatio * textMaxSize / glyphSize, iconBoxScale = bucket.tilePixelRatio * layoutIconSize, symbolMinDistance = bucket.tilePixelRatio * layout.get('symbol-spacing'), textPadding = layout.get('text-padding') * bucket.tilePixelRatio, iconPadding = getIconPadding(layout, feature, canonical, bucket.tilePixelRatio), textMaxAngle = layout.get('text-max-angle') / 180 * Math.PI, textAlongLine = layout.get('text-rotation-alignment') !== 'viewport' && layout.get('symbol-placement') !== 'point', iconAlongLine = layout.get('icon-rotation-alignment') === 'map' && layout.get('symbol-placement') !== 'point', symbolPlacement = layout.get('symbol-placement'), textRepeatDistance = symbolMinDistance / 2;
        const iconTextFit = layout.get('icon-text-fit');
        let verticallyShapedIcon;
        // Adjust shaped icon size when icon-text-fit is used.
        if (shapedIcon && iconTextFit !== 'none') {
            if (bucket.allowVerticalPlacement && shapedTextOrientations.vertical) {
                verticallyShapedIcon = fitIconToText(shapedIcon, shapedTextOrientations.vertical, iconTextFit, layout.get('icon-text-fit-padding'), iconOffset, fontScale);
            }
            if (defaultHorizontalShaping) {
                shapedIcon = fitIconToText(shapedIcon, defaultHorizontalShaping, iconTextFit, layout.get('icon-text-fit-padding'), iconOffset, fontScale);
            }
        }
        const addSymbolAtAnchor = (line, anchor) => {
            if (anchor.x < 0 || anchor.x >= EXTENT || anchor.y < 0 || anchor.y >= EXTENT) {
                // Symbol layers are drawn across tile boundaries, We filter out symbols
                // outside our tile boundaries (which may be included in vector tile buffers)
                // to prevent double-drawing symbols.
                return;
            }
            addSymbol(bucket, anchor, line, shapedTextOrientations, shapedIcon, imageMap, verticallyShapedIcon, bucket.layers[0], bucket.collisionBoxArray, feature.index, feature.sourceLayerIndex, bucket.index, textBoxScale, [textPadding, textPadding, textPadding, textPadding], textAlongLine, textOffset, iconBoxScale, iconPadding, iconAlongLine, iconOffset, feature, sizes, isSDFIcon, canonical, layoutTextSize);
        };
        if (symbolPlacement === 'line') {
            for (const line of clipLine(feature.geometry, 0, 0, EXTENT, EXTENT)) {
                const anchors = getAnchors(line, symbolMinDistance, textMaxAngle, shapedTextOrientations.vertical || defaultHorizontalShaping, shapedIcon, glyphSize, textMaxBoxScale, bucket.overscaling, EXTENT);
                for (const anchor of anchors) {
                    const shapedText = defaultHorizontalShaping;
                    if (!shapedText || !anchorIsTooClose(bucket, shapedText.text, textRepeatDistance, anchor)) {
                        addSymbolAtAnchor(line, anchor);
                    }
                }
            }
        }
        else if (symbolPlacement === 'line-center') {
            // No clipping, multiple lines per feature are allowed
            // "lines" with only one point are ignored as in clipLines
            for (const line of feature.geometry) {
                if (line.length > 1) {
                    const anchor = getCenterAnchor(line, textMaxAngle, shapedTextOrientations.vertical || defaultHorizontalShaping, shapedIcon, glyphSize, textMaxBoxScale);
                    if (anchor) {
                        addSymbolAtAnchor(line, anchor);
                    }
                }
            }
        }
        else if (feature.type === 'Polygon') {
            for (const polygon of classifyRings$1(feature.geometry, 0)) {
                // 16 here represents 2 pixels
                const poi = findPoleOfInaccessibility(polygon, 16);
                addSymbolAtAnchor(polygon[0], new Anchor(poi.x, poi.y, 0));
            }
        }
        else if (feature.type === 'LineString') {
            // https://github.com/mapbox/mapbox-gl-js/issues/3808
            for (const line of feature.geometry) {
                addSymbolAtAnchor(line, new Anchor(line[0].x, line[0].y, 0));
            }
        }
        else if (feature.type === 'Point') {
            for (const points of feature.geometry) {
                for (const point of points) {
                    addSymbolAtAnchor([point], new Anchor(point.x, point.y, 0));
                }
            }
        }
    }
    const MAX_GLYPH_ICON_SIZE = 255;
    const MAX_PACKED_SIZE = MAX_GLYPH_ICON_SIZE * SIZE_PACK_FACTOR;
    function addTextVertices(bucket, anchor, shapedText, imageMap, layer, textAlongLine, feature, textOffset, lineArray, writingMode, placementTypes, placedTextSymbolIndices, placedIconIndex, sizes, canonical) {
        const glyphQuads = getGlyphQuads(anchor, shapedText, textOffset, layer, textAlongLine, feature, imageMap, bucket.allowVerticalPlacement);
        const sizeData = bucket.textSizeData;
        let textSizeData = null;
        if (sizeData.kind === 'source') {
            textSizeData = [
                SIZE_PACK_FACTOR * layer.layout.get('text-size').evaluate(feature, {})
            ];
            if (textSizeData[0] > MAX_PACKED_SIZE) {
                warnOnce(`${bucket.layerIds[0]}: Value for "text-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "text-size".`);
            }
        }
        else if (sizeData.kind === 'composite') {
            textSizeData = [
                SIZE_PACK_FACTOR * sizes.compositeTextSizes[0].evaluate(feature, {}, canonical),
                SIZE_PACK_FACTOR * sizes.compositeTextSizes[1].evaluate(feature, {}, canonical)
            ];
            if (textSizeData[0] > MAX_PACKED_SIZE || textSizeData[1] > MAX_PACKED_SIZE) {
                warnOnce(`${bucket.layerIds[0]}: Value for "text-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "text-size".`);
            }
        }
        bucket.addSymbols(bucket.text, glyphQuads, textSizeData, textOffset, textAlongLine, feature, writingMode, anchor, lineArray.lineStartIndex, lineArray.lineLength, placedIconIndex, canonical);
        // The placedSymbolArray is used at render time in drawTileSymbols
        // These indices allow access to the array at collision detection time
        for (const placementType of placementTypes) {
            placedTextSymbolIndices[placementType] = bucket.text.placedSymbolArray.length - 1;
        }
        return glyphQuads.length * 4;
    }
    function getDefaultHorizontalShaping(horizontalShaping) {
        // We don't care which shaping we get because this is used for collision purposes
        // and all the justifications have the same collision box
        for (const justification in horizontalShaping) {
            return horizontalShaping[justification];
        }
        return null;
    }
    /**
     * Add a single label & icon placement.
     *
     * @private
     */
    function addSymbol(bucket, anchor, line, shapedTextOrientations, shapedIcon, imageMap, verticallyShapedIcon, layer, collisionBoxArray, featureIndex, sourceLayerIndex, bucketIndex, textBoxScale, textPadding, textAlongLine, textOffset, iconBoxScale, iconPadding, iconAlongLine, iconOffset, feature, sizes, isSDFIcon, canonical, layoutTextSize) {
        const lineArray = bucket.addToLineVertexArray(anchor, line);
        let textCollisionFeature, iconCollisionFeature, verticalTextCollisionFeature, verticalIconCollisionFeature;
        let numIconVertices = 0;
        let numVerticalIconVertices = 0;
        let numHorizontalGlyphVertices = 0;
        let numVerticalGlyphVertices = 0;
        let placedIconSymbolIndex = -1;
        let verticalPlacedIconSymbolIndex = -1;
        const placedTextSymbolIndices = {};
        let key = murmurhashJsExports('');
        let textOffset0 = 0;
        let textOffset1 = 0;
        if (layer._unevaluatedLayout.getValue('text-radial-offset') === undefined) {
            [textOffset0, textOffset1] = layer.layout.get('text-offset').evaluate(feature, {}, canonical).map(t => t * ONE_EM);
        }
        else {
            textOffset0 = layer.layout.get('text-radial-offset').evaluate(feature, {}, canonical) * ONE_EM;
            textOffset1 = INVALID_TEXT_OFFSET;
        }
        if (bucket.allowVerticalPlacement && shapedTextOrientations.vertical) {
            const textRotation = layer.layout.get('text-rotate').evaluate(feature, {}, canonical);
            const verticalTextRotation = textRotation + 90.0;
            const verticalShaping = shapedTextOrientations.vertical;
            verticalTextCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, verticalShaping, textBoxScale, textPadding, textAlongLine, verticalTextRotation);
            if (verticallyShapedIcon) {
                verticalIconCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, verticallyShapedIcon, iconBoxScale, iconPadding, textAlongLine, verticalTextRotation);
            }
        }
        //Place icon first, so text can have a reference to its index in the placed symbol array.
        //Text symbols can lazily shift at render-time because of variable anchor placement.
        //If the style specifies an `icon-text-fit` then the icon would have to shift along with it.
        // For more info check `updateVariableAnchors` in `draw_symbol.js` .
        if (shapedIcon) {
            const iconRotate = layer.layout.get('icon-rotate').evaluate(feature, {});
            const hasIconTextFit = layer.layout.get('icon-text-fit') !== 'none';
            const iconQuads = getIconQuads(shapedIcon, iconRotate, isSDFIcon, hasIconTextFit);
            const verticalIconQuads = verticallyShapedIcon ? getIconQuads(verticallyShapedIcon, iconRotate, isSDFIcon, hasIconTextFit) : undefined;
            iconCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, shapedIcon, iconBoxScale, iconPadding, /*align boxes to line*/ false, iconRotate);
            numIconVertices = iconQuads.length * 4;
            const sizeData = bucket.iconSizeData;
            let iconSizeData = null;
            if (sizeData.kind === 'source') {
                iconSizeData = [
                    SIZE_PACK_FACTOR * layer.layout.get('icon-size').evaluate(feature, {})
                ];
                if (iconSizeData[0] > MAX_PACKED_SIZE) {
                    warnOnce(`${bucket.layerIds[0]}: Value for "icon-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "icon-size".`);
                }
            }
            else if (sizeData.kind === 'composite') {
                iconSizeData = [
                    SIZE_PACK_FACTOR * sizes.compositeIconSizes[0].evaluate(feature, {}, canonical),
                    SIZE_PACK_FACTOR * sizes.compositeIconSizes[1].evaluate(feature, {}, canonical)
                ];
                if (iconSizeData[0] > MAX_PACKED_SIZE || iconSizeData[1] > MAX_PACKED_SIZE) {
                    warnOnce(`${bucket.layerIds[0]}: Value for "icon-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "icon-size".`);
                }
            }
            bucket.addSymbols(bucket.icon, iconQuads, iconSizeData, iconOffset, iconAlongLine, feature, WritingMode.none, anchor, lineArray.lineStartIndex, lineArray.lineLength, 
            // The icon itself does not have an associated symbol since the text isnt placed yet
            -1, canonical);
            placedIconSymbolIndex = bucket.icon.placedSymbolArray.length - 1;
            if (verticalIconQuads) {
                numVerticalIconVertices = verticalIconQuads.length * 4;
                bucket.addSymbols(bucket.icon, verticalIconQuads, iconSizeData, iconOffset, iconAlongLine, feature, WritingMode.vertical, anchor, lineArray.lineStartIndex, lineArray.lineLength, 
                // The icon itself does not have an associated symbol since the text isnt placed yet
                -1, canonical);
                verticalPlacedIconSymbolIndex = bucket.icon.placedSymbolArray.length - 1;
            }
        }
        const justifications = Object.keys(shapedTextOrientations.horizontal);
        for (const justification of justifications) {
            const shaping = shapedTextOrientations.horizontal[justification];
            if (!textCollisionFeature) {
                key = murmurhashJsExports(shaping.text);
                const textRotate = layer.layout.get('text-rotate').evaluate(feature, {}, canonical);
                // As a collision approximation, we can use either the vertical or any of the horizontal versions of the feature
                // We're counting on all versions having similar dimensions
                textCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, shaping, textBoxScale, textPadding, textAlongLine, textRotate);
            }
            const singleLine = shaping.positionedLines.length === 1;
            numHorizontalGlyphVertices += addTextVertices(bucket, anchor, shaping, imageMap, layer, textAlongLine, feature, textOffset, lineArray, shapedTextOrientations.vertical ? WritingMode.horizontal : WritingMode.horizontalOnly, singleLine ? justifications : [justification], placedTextSymbolIndices, placedIconSymbolIndex, sizes, canonical);
            if (singleLine) {
                break;
            }
        }
        if (shapedTextOrientations.vertical) {
            numVerticalGlyphVertices += addTextVertices(bucket, anchor, shapedTextOrientations.vertical, imageMap, layer, textAlongLine, feature, textOffset, lineArray, WritingMode.vertical, ['vertical'], placedTextSymbolIndices, verticalPlacedIconSymbolIndex, sizes, canonical);
        }
        const textBoxStartIndex = textCollisionFeature ? textCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
        const textBoxEndIndex = textCollisionFeature ? textCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;
        const verticalTextBoxStartIndex = verticalTextCollisionFeature ? verticalTextCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
        const verticalTextBoxEndIndex = verticalTextCollisionFeature ? verticalTextCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;
        const iconBoxStartIndex = iconCollisionFeature ? iconCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
        const iconBoxEndIndex = iconCollisionFeature ? iconCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;
        const verticalIconBoxStartIndex = verticalIconCollisionFeature ? verticalIconCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
        const verticalIconBoxEndIndex = verticalIconCollisionFeature ? verticalIconCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;
        // Check if runtime collision circles should be used for any of the collision features.
        // It is enough to choose the tallest feature shape as circles are always placed on a line.
        // All measurements are in glyph metrics and later converted into pixels using proper font size "layoutTextSize"
        let collisionCircleDiameter = -1;
        const getCollisionCircleHeight = (feature, prevHeight) => {
            if (feature && feature.circleDiameter)
                return Math.max(feature.circleDiameter, prevHeight);
            return prevHeight;
        };
        collisionCircleDiameter = getCollisionCircleHeight(textCollisionFeature, collisionCircleDiameter);
        collisionCircleDiameter = getCollisionCircleHeight(verticalTextCollisionFeature, collisionCircleDiameter);
        collisionCircleDiameter = getCollisionCircleHeight(iconCollisionFeature, collisionCircleDiameter);
        collisionCircleDiameter = getCollisionCircleHeight(verticalIconCollisionFeature, collisionCircleDiameter);
        const useRuntimeCollisionCircles = (collisionCircleDiameter > -1) ? 1 : 0;
        // Convert circle collision height into pixels
        if (useRuntimeCollisionCircles)
            collisionCircleDiameter *= layoutTextSize / ONE_EM;
        if (bucket.glyphOffsetArray.length >= SymbolBucket.MAX_GLYPHS)
            warnOnce('Too many glyphs being rendered in a tile. See https://github.com/mapbox/mapbox-gl-js/issues/2907');
        if (feature.sortKey !== undefined) {
            bucket.addToSortKeyRanges(bucket.symbolInstances.length, feature.sortKey);
        }
        bucket.symbolInstances.emplaceBack(anchor.x, anchor.y, placedTextSymbolIndices.right >= 0 ? placedTextSymbolIndices.right : -1, placedTextSymbolIndices.center >= 0 ? placedTextSymbolIndices.center : -1, placedTextSymbolIndices.left >= 0 ? placedTextSymbolIndices.left : -1, placedTextSymbolIndices.vertical || -1, placedIconSymbolIndex, verticalPlacedIconSymbolIndex, key, textBoxStartIndex, textBoxEndIndex, verticalTextBoxStartIndex, verticalTextBoxEndIndex, iconBoxStartIndex, iconBoxEndIndex, verticalIconBoxStartIndex, verticalIconBoxEndIndex, featureIndex, numHorizontalGlyphVertices, numVerticalGlyphVertices, numIconVertices, numVerticalIconVertices, useRuntimeCollisionCircles, 0, textBoxScale, textOffset0, textOffset1, collisionCircleDiameter);
    }
    function anchorIsTooClose(bucket, text, repeatDistance, anchor) {
        const compareText = bucket.compareText;
        if (!(text in compareText)) {
            compareText[text] = [];
        }
        else {
            const otherAnchors = compareText[text];
            for (let k = otherAnchors.length - 1; k >= 0; k--) {
                if (anchor.dist(otherAnchors[k]) < repeatDistance) {
                    // If it's within repeatDistance of one anchor, stop looking
                    return true;
                }
            }
        }
        // If anchor is not within repeatDistance of any other anchor, add to array
        compareText[text].push(anchor);
        return false;
    }

    const vectorTileFeatureTypes = vectorTile.VectorTileFeature.types;
    // Opacity arrays are frequently updated but don't contain a lot of information, so we pack them
    // tight. Each Uint32 is actually four duplicate Uint8s for the four corners of a glyph
    // 7 bits are for the current opacity, and the lowest bit is the target opacity
    // actually defined in symbol_attributes.js
    // const placementOpacityAttributes = [
    //     { name: 'a_fade_opacity', components: 1, type: 'Uint32' }
    // ];
    const shaderOpacityAttributes = [
        { name: 'a_fade_opacity', components: 1, type: 'Uint8', offset: 0 }
    ];
    function addVertex(array, anchorX, anchorY, ox, oy, tx, ty, sizeVertex, isSDF, pixelOffsetX, pixelOffsetY, minFontScaleX, minFontScaleY) {
        const aSizeX = sizeVertex ? Math.min(MAX_PACKED_SIZE, Math.round(sizeVertex[0])) : 0;
        const aSizeY = sizeVertex ? Math.min(MAX_PACKED_SIZE, Math.round(sizeVertex[1])) : 0;
        array.emplaceBack(
        // a_pos_offset
        anchorX, anchorY, Math.round(ox * 32), Math.round(oy * 32), 
        // a_data
        tx, // x coordinate of symbol on glyph atlas texture
        ty, // y coordinate of symbol on glyph atlas texture
        (aSizeX << 1) + (isSDF ? 1 : 0), aSizeY, pixelOffsetX * 16, pixelOffsetY * 16, minFontScaleX * 256, minFontScaleY * 256);
    }
    function addDynamicAttributes(dynamicLayoutVertexArray, p, angle) {
        dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
        dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
        dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
        dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
    }
    function containsRTLText(formattedText) {
        for (const section of formattedText.sections) {
            if (stringContainsRTLText(section.text)) {
                return true;
            }
        }
        return false;
    }
    class SymbolBuffers {
        constructor(programConfigurations) {
            this.layoutVertexArray = new SymbolLayoutArray();
            this.indexArray = new TriangleIndexArray();
            this.programConfigurations = programConfigurations;
            this.segments = new SegmentVector();
            this.dynamicLayoutVertexArray = new SymbolDynamicLayoutArray();
            this.opacityVertexArray = new SymbolOpacityArray();
            this.hasVisibleVertices = false;
            this.placedSymbolArray = new PlacedSymbolArray();
        }
        isEmpty() {
            return this.layoutVertexArray.length === 0 &&
                this.indexArray.length === 0 &&
                this.dynamicLayoutVertexArray.length === 0 &&
                this.opacityVertexArray.length === 0;
        }
        upload(context, dynamicIndexBuffer, upload, update) {
            if (this.isEmpty()) {
                return;
            }
            if (upload) {
                this.layoutVertexBuffer = context.createVertexBuffer(this.layoutVertexArray, symbolLayoutAttributes.members);
                this.indexBuffer = context.createIndexBuffer(this.indexArray, dynamicIndexBuffer);
                this.dynamicLayoutVertexBuffer = context.createVertexBuffer(this.dynamicLayoutVertexArray, dynamicLayoutAttributes.members, true);
                this.opacityVertexBuffer = context.createVertexBuffer(this.opacityVertexArray, shaderOpacityAttributes, true);
                // This is a performance hack so that we can write to opacityVertexArray with uint32s
                // even though the shaders read uint8s
                this.opacityVertexBuffer.itemSize = 1;
            }
            if (upload || update) {
                this.programConfigurations.upload(context);
            }
        }
        destroy() {
            if (!this.layoutVertexBuffer)
                return;
            this.layoutVertexBuffer.destroy();
            this.indexBuffer.destroy();
            this.programConfigurations.destroy();
            this.segments.destroy();
            this.dynamicLayoutVertexBuffer.destroy();
            this.opacityVertexBuffer.destroy();
        }
    }
    register('SymbolBuffers', SymbolBuffers);
    class CollisionBuffers {
        constructor(LayoutArray, layoutAttributes, IndexArray) {
            this.layoutVertexArray = new LayoutArray();
            this.layoutAttributes = layoutAttributes;
            this.indexArray = new IndexArray();
            this.segments = new SegmentVector();
            this.collisionVertexArray = new CollisionVertexArray();
        }
        upload(context) {
            this.layoutVertexBuffer = context.createVertexBuffer(this.layoutVertexArray, this.layoutAttributes);
            this.indexBuffer = context.createIndexBuffer(this.indexArray);
            this.collisionVertexBuffer = context.createVertexBuffer(this.collisionVertexArray, collisionVertexAttributes.members, true);
        }
        destroy() {
            if (!this.layoutVertexBuffer)
                return;
            this.layoutVertexBuffer.destroy();
            this.indexBuffer.destroy();
            this.segments.destroy();
            this.collisionVertexBuffer.destroy();
        }
    }
    register('CollisionBuffers', CollisionBuffers);
    /**
     * Unlike other buckets, which simply implement #addFeature with type-specific
     * logic for (essentially) triangulating feature geometries, SymbolBucket
     * requires specialized behavior:
     *
     * 1. WorkerTile#parse(), the logical owner of the bucket creation process,
     *    calls SymbolBucket#populate(), which resolves text and icon tokens on
     *    each feature, adds each glyphs and symbols needed to the passed-in
     *    collections options.glyphDependencies and options.iconDependencies, and
     *    stores the feature data for use in subsequent step (this.features).
     *
     * 2. WorkerTile asynchronously requests from the main thread all of the glyphs
     *    and icons needed (by this bucket and any others). When glyphs and icons
     *    have been received, the WorkerTile creates a CollisionIndex and invokes:
     *
     * 3. performSymbolLayout(bucket, stacks, icons) perform texts shaping and
     *    layout on a Symbol Bucket. This step populates:
     *      `this.symbolInstances`: metadata on generated symbols
     *      `this.collisionBoxArray`: collision data for use by foreground
     *      `this.text`: SymbolBuffers for text symbols
     *      `this.icons`: SymbolBuffers for icons
     *      `this.iconCollisionBox`: Debug SymbolBuffers for icon collision boxes
     *      `this.textCollisionBox`: Debug SymbolBuffers for text collision boxes
     *    The results are sent to the foreground for rendering
     *
     * 4. performSymbolPlacement(bucket, collisionIndex) is run on the foreground,
     *    and uses the CollisionIndex along with current camera settings to determine
     *    which symbols can actually show on the map. Collided symbols are hidden
     *    using a dynamic "OpacityVertexArray".
     *
     * @private
     */
    class SymbolBucket {
        constructor(options) {
            this.collisionBoxArray = options.collisionBoxArray;
            this.zoom = options.zoom;
            this.overscaling = options.overscaling;
            this.layers = options.layers;
            this.layerIds = this.layers.map(layer => layer.id);
            this.index = options.index;
            this.pixelRatio = options.pixelRatio;
            this.sourceLayerIndex = options.sourceLayerIndex;
            this.hasPattern = false;
            this.hasRTLText = false;
            this.sortKeyRanges = [];
            this.collisionCircleArray = [];
            this.placementInvProjMatrix = identity([]);
            this.placementViewportMatrix = identity([]);
            const layer = this.layers[0];
            const unevaluatedLayoutValues = layer._unevaluatedLayout._values;
            this.textSizeData = getSizeData(this.zoom, unevaluatedLayoutValues['text-size']);
            this.iconSizeData = getSizeData(this.zoom, unevaluatedLayoutValues['icon-size']);
            const layout = this.layers[0].layout;
            const sortKey = layout.get('symbol-sort-key');
            const zOrder = layout.get('symbol-z-order');
            this.canOverlap =
                getOverlapMode(layout, 'text-overlap', 'text-allow-overlap') !== 'never' ||
                    getOverlapMode(layout, 'icon-overlap', 'icon-allow-overlap') !== 'never' ||
                    layout.get('text-ignore-placement') ||
                    layout.get('icon-ignore-placement');
            this.sortFeaturesByKey = zOrder !== 'viewport-y' && !sortKey.isConstant();
            const zOrderByViewportY = zOrder === 'viewport-y' || (zOrder === 'auto' && !this.sortFeaturesByKey);
            this.sortFeaturesByY = zOrderByViewportY && this.canOverlap;
            if (layout.get('symbol-placement') === 'point') {
                this.writingModes = layout.get('text-writing-mode').map(wm => WritingMode[wm]);
            }
            this.stateDependentLayerIds = this.layers.filter((l) => l.isStateDependent()).map((l) => l.id);
            this.sourceID = options.sourceID;
        }
        createArrays() {
            this.text = new SymbolBuffers(new ProgramConfigurationSet(this.layers, this.zoom, property => /^text/.test(property)));
            this.icon = new SymbolBuffers(new ProgramConfigurationSet(this.layers, this.zoom, property => /^icon/.test(property)));
            this.glyphOffsetArray = new GlyphOffsetArray();
            this.lineVertexArray = new SymbolLineVertexArray();
            this.symbolInstances = new SymbolInstanceArray();
        }
        calculateGlyphDependencies(text, stack, textAlongLine, allowVerticalPlacement, doesAllowVerticalWritingMode) {
            for (let i = 0; i < text.length; i++) {
                stack[text.charCodeAt(i)] = true;
                if ((textAlongLine || allowVerticalPlacement) && doesAllowVerticalWritingMode) {
                    const verticalChar = verticalizedCharacterMap[text.charAt(i)];
                    if (verticalChar) {
                        stack[verticalChar.charCodeAt(0)] = true;
                    }
                }
            }
        }
        populate(features, options, canonical) {
            const layer = this.layers[0];
            const layout = layer.layout;
            const textFont = layout.get('text-font');
            const textField = layout.get('text-field');
            const iconImage = layout.get('icon-image');
            const hasText = (textField.value.kind !== 'constant' ||
                (textField.value.value instanceof Formatted && !textField.value.value.isEmpty()) ||
                textField.value.value.toString().length > 0) &&
                (textFont.value.kind !== 'constant' || textFont.value.value.length > 0);
            // we should always resolve the icon-image value if the property was defined in the style
            // this allows us to fire the styleimagemissing event if image evaluation returns null
            // the only way to distinguish between null returned from a coalesce statement with no valid images
            // and null returned because icon-image wasn't defined is to check whether or not iconImage.parameters is an empty object
            const hasIcon = iconImage.value.kind !== 'constant' || !!iconImage.value.value || Object.keys(iconImage.parameters).length > 0;
            const symbolSortKey = layout.get('symbol-sort-key');
            this.features = [];
            if (!hasText && !hasIcon) {
                return;
            }
            const icons = options.iconDependencies;
            const stacks = options.glyphDependencies;
            const availableImages = options.availableImages;
            const globalProperties = new EvaluationParameters(this.zoom);
            for (const { feature, id, index, sourceLayerIndex } of features) {
                const needGeometry = layer._featureFilter.needGeometry;
                const evaluationFeature = toEvaluationFeature(feature, needGeometry);
                if (!layer._featureFilter.filter(globalProperties, evaluationFeature, canonical)) {
                    continue;
                }
                if (!needGeometry)
                    evaluationFeature.geometry = loadGeometry(feature);
                let text;
                if (hasText) {
                    // Expression evaluation will automatically coerce to Formatted
                    // but plain string token evaluation skips that pathway so do the
                    // conversion here.
                    const resolvedTokens = layer.getValueAndResolveTokens('text-field', evaluationFeature, canonical, availableImages);
                    const formattedText = Formatted.factory(resolvedTokens);
                    if (containsRTLText(formattedText)) {
                        this.hasRTLText = true;
                    }
                    if (!this.hasRTLText || // non-rtl text so can proceed safely
                        getRTLTextPluginStatus() === 'unavailable' || // We don't intend to lazy-load the rtl text plugin, so proceed with incorrect shaping
                        this.hasRTLText && plugin.isParsed() // Use the rtlText plugin to shape text
                    ) {
                        text = transformText(formattedText, layer, evaluationFeature);
                    }
                }
                let icon;
                if (hasIcon) {
                    // Expression evaluation will automatically coerce to Image
                    // but plain string token evaluation skips that pathway so do the
                    // conversion here.
                    const resolvedTokens = layer.getValueAndResolveTokens('icon-image', evaluationFeature, canonical, availableImages);
                    if (resolvedTokens instanceof ResolvedImage) {
                        icon = resolvedTokens;
                    }
                    else {
                        icon = ResolvedImage.fromString(resolvedTokens);
                    }
                }
                if (!text && !icon) {
                    continue;
                }
                const sortKey = this.sortFeaturesByKey ?
                    symbolSortKey.evaluate(evaluationFeature, {}, canonical) :
                    undefined;
                const symbolFeature = {
                    id,
                    text,
                    icon,
                    index,
                    sourceLayerIndex,
                    geometry: evaluationFeature.geometry,
                    properties: feature.properties,
                    type: vectorTileFeatureTypes[feature.type],
                    sortKey
                };
                this.features.push(symbolFeature);
                if (icon) {
                    icons[icon.name] = true;
                }
                if (text) {
                    const fontStack = textFont.evaluate(evaluationFeature, {}, canonical).join(',');
                    const textAlongLine = layout.get('text-rotation-alignment') !== 'viewport' && layout.get('symbol-placement') !== 'point';
                    this.allowVerticalPlacement = this.writingModes && this.writingModes.indexOf(WritingMode.vertical) >= 0;
                    for (const section of text.sections) {
                        if (!section.image) {
                            const doesAllowVerticalWritingMode = allowsVerticalWritingMode(text.toString());
                            const sectionFont = section.fontStack || fontStack;
                            const sectionStack = stacks[sectionFont] = stacks[sectionFont] || {};
                            this.calculateGlyphDependencies(section.text, sectionStack, textAlongLine, this.allowVerticalPlacement, doesAllowVerticalWritingMode);
                        }
                        else {
                            // Add section image to the list of dependencies.
                            icons[section.image.name] = true;
                        }
                    }
                }
            }
            if (layout.get('symbol-placement') === 'line') {
                // Merge adjacent lines with the same text to improve labelling.
                // It's better to place labels on one long line than on many short segments.
                this.features = mergeLines(this.features);
            }
            if (this.sortFeaturesByKey) {
                this.features.sort((a, b) => {
                    // a.sortKey is always a number when sortFeaturesByKey is true
                    return a.sortKey - b.sortKey;
                });
            }
        }
        update(states, vtLayer, imagePositions) {
            if (!this.stateDependentLayers.length)
                return;
            this.text.programConfigurations.updatePaintArrays(states, vtLayer, this.layers, imagePositions);
            this.icon.programConfigurations.updatePaintArrays(states, vtLayer, this.layers, imagePositions);
        }
        isEmpty() {
            // When the bucket encounters only rtl-text but the plugin isnt loaded, no symbol instances will be created.
            // In order for the bucket to be serialized, and not discarded as an empty bucket both checks are necessary.
            return this.symbolInstances.length === 0 && !this.hasRTLText;
        }
        uploadPending() {
            return !this.uploaded || this.text.programConfigurations.needsUpload || this.icon.programConfigurations.needsUpload;
        }
        upload(context) {
            if (!this.uploaded && this.hasDebugData()) {
                this.textCollisionBox.upload(context);
                this.iconCollisionBox.upload(context);
            }
            this.text.upload(context, this.sortFeaturesByY, !this.uploaded, this.text.programConfigurations.needsUpload);
            this.icon.upload(context, this.sortFeaturesByY, !this.uploaded, this.icon.programConfigurations.needsUpload);
            this.uploaded = true;
        }
        destroyDebugData() {
            this.textCollisionBox.destroy();
            this.iconCollisionBox.destroy();
        }
        destroy() {
            this.text.destroy();
            this.icon.destroy();
            if (this.hasDebugData()) {
                this.destroyDebugData();
            }
        }
        addToLineVertexArray(anchor, line) {
            const lineStartIndex = this.lineVertexArray.length;
            if (anchor.segment !== undefined) {
                let sumForwardLength = anchor.dist(line[anchor.segment + 1]);
                let sumBackwardLength = anchor.dist(line[anchor.segment]);
                const vertices = {};
                for (let i = anchor.segment + 1; i < line.length; i++) {
                    vertices[i] = { x: line[i].x, y: line[i].y, tileUnitDistanceFromAnchor: sumForwardLength };
                    if (i < line.length - 1) {
                        sumForwardLength += line[i + 1].dist(line[i]);
                    }
                }
                for (let i = anchor.segment || 0; i >= 0; i--) {
                    vertices[i] = { x: line[i].x, y: line[i].y, tileUnitDistanceFromAnchor: sumBackwardLength };
                    if (i > 0) {
                        sumBackwardLength += line[i - 1].dist(line[i]);
                    }
                }
                for (let i = 0; i < line.length; i++) {
                    const vertex = vertices[i];
                    this.lineVertexArray.emplaceBack(vertex.x, vertex.y, vertex.tileUnitDistanceFromAnchor);
                }
            }
            return {
                lineStartIndex,
                lineLength: this.lineVertexArray.length - lineStartIndex
            };
        }
        addSymbols(arrays, quads, sizeVertex, lineOffset, alongLine, feature, writingMode, labelAnchor, lineStartIndex, lineLength, associatedIconIndex, canonical) {
            const indexArray = arrays.indexArray;
            const layoutVertexArray = arrays.layoutVertexArray;
            const segment = arrays.segments.prepareSegment(4 * quads.length, layoutVertexArray, indexArray, this.canOverlap ? feature.sortKey : undefined);
            const glyphOffsetArrayStart = this.glyphOffsetArray.length;
            const vertexStartIndex = segment.vertexLength;
            const angle = (this.allowVerticalPlacement && writingMode === WritingMode.vertical) ? Math.PI / 2 : 0;
            const sections = feature.text && feature.text.sections;
            for (let i = 0; i < quads.length; i++) {
                const { tl, tr, bl, br, tex, pixelOffsetTL, pixelOffsetBR, minFontScaleX, minFontScaleY, glyphOffset, isSDF, sectionIndex } = quads[i];
                const index = segment.vertexLength;
                const y = glyphOffset[1];
                addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, tl.x, y + tl.y, tex.x, tex.y, sizeVertex, isSDF, pixelOffsetTL.x, pixelOffsetTL.y, minFontScaleX, minFontScaleY);
                addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, tr.x, y + tr.y, tex.x + tex.w, tex.y, sizeVertex, isSDF, pixelOffsetBR.x, pixelOffsetTL.y, minFontScaleX, minFontScaleY);
                addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, bl.x, y + bl.y, tex.x, tex.y + tex.h, sizeVertex, isSDF, pixelOffsetTL.x, pixelOffsetBR.y, minFontScaleX, minFontScaleY);
                addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, br.x, y + br.y, tex.x + tex.w, tex.y + tex.h, sizeVertex, isSDF, pixelOffsetBR.x, pixelOffsetBR.y, minFontScaleX, minFontScaleY);
                addDynamicAttributes(arrays.dynamicLayoutVertexArray, labelAnchor, angle);
                indexArray.emplaceBack(index, index + 1, index + 2);
                indexArray.emplaceBack(index + 1, index + 2, index + 3);
                segment.vertexLength += 4;
                segment.primitiveLength += 2;
                this.glyphOffsetArray.emplaceBack(glyphOffset[0]);
                if (i === quads.length - 1 || sectionIndex !== quads[i + 1].sectionIndex) {
                    arrays.programConfigurations.populatePaintArrays(layoutVertexArray.length, feature, feature.index, {}, canonical, sections && sections[sectionIndex]);
                }
            }
            arrays.placedSymbolArray.emplaceBack(labelAnchor.x, labelAnchor.y, glyphOffsetArrayStart, this.glyphOffsetArray.length - glyphOffsetArrayStart, vertexStartIndex, lineStartIndex, lineLength, labelAnchor.segment, sizeVertex ? sizeVertex[0] : 0, sizeVertex ? sizeVertex[1] : 0, lineOffset[0], lineOffset[1], writingMode, 
            // placedOrientation is null initially; will be updated to horizontal(1)/vertical(2) if placed
            0, false, 
            // The crossTileID is only filled/used on the foreground for dynamic text anchors
            0, associatedIconIndex);
        }
        _addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, point, anchorX, anchorY, extrude) {
            collisionVertexArray.emplaceBack(0, 0);
            return layoutVertexArray.emplaceBack(
            // pos
            point.x, point.y, 
            // a_anchor_pos
            anchorX, anchorY, 
            // extrude
            Math.round(extrude.x), Math.round(extrude.y));
        }
        addCollisionDebugVertices(x1, y1, x2, y2, arrays, boxAnchorPoint, symbolInstance) {
            const segment = arrays.segments.prepareSegment(4, arrays.layoutVertexArray, arrays.indexArray);
            const index = segment.vertexLength;
            const layoutVertexArray = arrays.layoutVertexArray;
            const collisionVertexArray = arrays.collisionVertexArray;
            const anchorX = symbolInstance.anchorX;
            const anchorY = symbolInstance.anchorY;
            this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, anchorX, anchorY, new pointGeometry(x1, y1));
            this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, anchorX, anchorY, new pointGeometry(x2, y1));
            this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, anchorX, anchorY, new pointGeometry(x2, y2));
            this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, anchorX, anchorY, new pointGeometry(x1, y2));
            segment.vertexLength += 4;
            const indexArray = arrays.indexArray;
            indexArray.emplaceBack(index, index + 1);
            indexArray.emplaceBack(index + 1, index + 2);
            indexArray.emplaceBack(index + 2, index + 3);
            indexArray.emplaceBack(index + 3, index);
            segment.primitiveLength += 4;
        }
        addDebugCollisionBoxes(startIndex, endIndex, symbolInstance, isText) {
            for (let b = startIndex; b < endIndex; b++) {
                const box = this.collisionBoxArray.get(b);
                const x1 = box.x1;
                const y1 = box.y1;
                const x2 = box.x2;
                const y2 = box.y2;
                this.addCollisionDebugVertices(x1, y1, x2, y2, isText ? this.textCollisionBox : this.iconCollisionBox, box.anchorPoint, symbolInstance);
            }
        }
        generateCollisionDebugBuffers() {
            if (this.hasDebugData()) {
                this.destroyDebugData();
            }
            this.textCollisionBox = new CollisionBuffers(CollisionBoxLayoutArray, collisionBoxLayout.members, LineIndexArray);
            this.iconCollisionBox = new CollisionBuffers(CollisionBoxLayoutArray, collisionBoxLayout.members, LineIndexArray);
            for (let i = 0; i < this.symbolInstances.length; i++) {
                const symbolInstance = this.symbolInstances.get(i);
                this.addDebugCollisionBoxes(symbolInstance.textBoxStartIndex, symbolInstance.textBoxEndIndex, symbolInstance, true);
                this.addDebugCollisionBoxes(symbolInstance.verticalTextBoxStartIndex, symbolInstance.verticalTextBoxEndIndex, symbolInstance, true);
                this.addDebugCollisionBoxes(symbolInstance.iconBoxStartIndex, symbolInstance.iconBoxEndIndex, symbolInstance, false);
                this.addDebugCollisionBoxes(symbolInstance.verticalIconBoxStartIndex, symbolInstance.verticalIconBoxEndIndex, symbolInstance, false);
            }
        }
        // These flat arrays are meant to be quicker to iterate over than the source
        // CollisionBoxArray
        _deserializeCollisionBoxesForSymbol(collisionBoxArray, textStartIndex, textEndIndex, verticalTextStartIndex, verticalTextEndIndex, iconStartIndex, iconEndIndex, verticalIconStartIndex, verticalIconEndIndex) {
            const collisionArrays = {};
            for (let k = textStartIndex; k < textEndIndex; k++) {
                const box = collisionBoxArray.get(k);
                collisionArrays.textBox = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, anchorPointX: box.anchorPointX, anchorPointY: box.anchorPointY };
                collisionArrays.textFeatureIndex = box.featureIndex;
                break; // Only one box allowed per instance
            }
            for (let k = verticalTextStartIndex; k < verticalTextEndIndex; k++) {
                const box = collisionBoxArray.get(k);
                collisionArrays.verticalTextBox = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, anchorPointX: box.anchorPointX, anchorPointY: box.anchorPointY };
                collisionArrays.verticalTextFeatureIndex = box.featureIndex;
                break; // Only one box allowed per instance
            }
            for (let k = iconStartIndex; k < iconEndIndex; k++) {
                // An icon can only have one box now, so this indexing is a bit vestigial...
                const box = collisionBoxArray.get(k);
                collisionArrays.iconBox = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, anchorPointX: box.anchorPointX, anchorPointY: box.anchorPointY };
                collisionArrays.iconFeatureIndex = box.featureIndex;
                break; // Only one box allowed per instance
            }
            for (let k = verticalIconStartIndex; k < verticalIconEndIndex; k++) {
                // An icon can only have one box now, so this indexing is a bit vestigial...
                const box = collisionBoxArray.get(k);
                collisionArrays.verticalIconBox = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, anchorPointX: box.anchorPointX, anchorPointY: box.anchorPointY };
                collisionArrays.verticalIconFeatureIndex = box.featureIndex;
                break; // Only one box allowed per instance
            }
            return collisionArrays;
        }
        deserializeCollisionBoxes(collisionBoxArray) {
            this.collisionArrays = [];
            for (let i = 0; i < this.symbolInstances.length; i++) {
                const symbolInstance = this.symbolInstances.get(i);
                this.collisionArrays.push(this._deserializeCollisionBoxesForSymbol(collisionBoxArray, symbolInstance.textBoxStartIndex, symbolInstance.textBoxEndIndex, symbolInstance.verticalTextBoxStartIndex, symbolInstance.verticalTextBoxEndIndex, symbolInstance.iconBoxStartIndex, symbolInstance.iconBoxEndIndex, symbolInstance.verticalIconBoxStartIndex, symbolInstance.verticalIconBoxEndIndex));
            }
        }
        hasTextData() {
            return this.text.segments.get().length > 0;
        }
        hasIconData() {
            return this.icon.segments.get().length > 0;
        }
        hasDebugData() {
            return this.textCollisionBox && this.iconCollisionBox;
        }
        hasTextCollisionBoxData() {
            return this.hasDebugData() && this.textCollisionBox.segments.get().length > 0;
        }
        hasIconCollisionBoxData() {
            return this.hasDebugData() && this.iconCollisionBox.segments.get().length > 0;
        }
        addIndicesForPlacedSymbol(iconOrText, placedSymbolIndex) {
            const placedSymbol = iconOrText.placedSymbolArray.get(placedSymbolIndex);
            const endIndex = placedSymbol.vertexStartIndex + placedSymbol.numGlyphs * 4;
            for (let vertexIndex = placedSymbol.vertexStartIndex; vertexIndex < endIndex; vertexIndex += 4) {
                iconOrText.indexArray.emplaceBack(vertexIndex, vertexIndex + 1, vertexIndex + 2);
                iconOrText.indexArray.emplaceBack(vertexIndex + 1, vertexIndex + 2, vertexIndex + 3);
            }
        }
        getSortedSymbolIndexes(angle) {
            if (this.sortedAngle === angle && this.symbolInstanceIndexes !== undefined) {
                return this.symbolInstanceIndexes;
            }
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            const rotatedYs = [];
            const featureIndexes = [];
            const result = [];
            for (let i = 0; i < this.symbolInstances.length; ++i) {
                result.push(i);
                const symbolInstance = this.symbolInstances.get(i);
                rotatedYs.push(Math.round(sin * symbolInstance.anchorX + cos * symbolInstance.anchorY) | 0);
                featureIndexes.push(symbolInstance.featureIndex);
            }
            result.sort((aIndex, bIndex) => {
                return (rotatedYs[aIndex] - rotatedYs[bIndex]) ||
                    (featureIndexes[bIndex] - featureIndexes[aIndex]);
            });
            return result;
        }
        addToSortKeyRanges(symbolInstanceIndex, sortKey) {
            const last = this.sortKeyRanges[this.sortKeyRanges.length - 1];
            if (last && last.sortKey === sortKey) {
                last.symbolInstanceEnd = symbolInstanceIndex + 1;
            }
            else {
                this.sortKeyRanges.push({
                    sortKey,
                    symbolInstanceStart: symbolInstanceIndex,
                    symbolInstanceEnd: symbolInstanceIndex + 1
                });
            }
        }
        sortFeatures(angle) {
            if (!this.sortFeaturesByY)
                return;
            if (this.sortedAngle === angle)
                return;
            // The current approach to sorting doesn't sort across segments so don't try.
            // Sorting within segments separately seemed not to be worth the complexity.
            if (this.text.segments.get().length > 1 || this.icon.segments.get().length > 1)
                return;
            // If the symbols are allowed to overlap sort them by their vertical screen position.
            // The index array buffer is rewritten to reference the (unchanged) vertices in the
            // sorted order.
            // To avoid sorting the actual symbolInstance array we sort an array of indexes.
            this.symbolInstanceIndexes = this.getSortedSymbolIndexes(angle);
            this.sortedAngle = angle;
            this.text.indexArray.clear();
            this.icon.indexArray.clear();
            this.featureSortOrder = [];
            for (const i of this.symbolInstanceIndexes) {
                const symbolInstance = this.symbolInstances.get(i);
                this.featureSortOrder.push(symbolInstance.featureIndex);
                [
                    symbolInstance.rightJustifiedTextSymbolIndex,
                    symbolInstance.centerJustifiedTextSymbolIndex,
                    symbolInstance.leftJustifiedTextSymbolIndex
                ].forEach((index, i, array) => {
                    // Only add a given index the first time it shows up,
                    // to avoid duplicate opacity entries when multiple justifications
                    // share the same glyphs.
                    if (index >= 0 && array.indexOf(index) === i) {
                        this.addIndicesForPlacedSymbol(this.text, index);
                    }
                });
                if (symbolInstance.verticalPlacedTextSymbolIndex >= 0) {
                    this.addIndicesForPlacedSymbol(this.text, symbolInstance.verticalPlacedTextSymbolIndex);
                }
                if (symbolInstance.placedIconSymbolIndex >= 0) {
                    this.addIndicesForPlacedSymbol(this.icon, symbolInstance.placedIconSymbolIndex);
                }
                if (symbolInstance.verticalPlacedIconSymbolIndex >= 0) {
                    this.addIndicesForPlacedSymbol(this.icon, symbolInstance.verticalPlacedIconSymbolIndex);
                }
            }
            if (this.text.indexBuffer)
                this.text.indexBuffer.updateData(this.text.indexArray);
            if (this.icon.indexBuffer)
                this.icon.indexBuffer.updateData(this.icon.indexArray);
        }
    }
    register('SymbolBucket', SymbolBucket, {
        omit: ['layers', 'collisionBoxArray', 'features', 'compareText']
    });
    // this constant is based on the size of StructArray indexes used in a symbol
    // bucket--namely, glyphOffsetArrayStart
    // eg the max valid UInt16 is 65,535
    // See https://github.com/mapbox/mapbox-gl-js/issues/2907 for motivation
    // lineStartIndex and textBoxStartIndex could potentially be concerns
    // but we expect there to be many fewer boxes/lines than glyphs
    SymbolBucket.MAX_GLYPHS = 65535;
    SymbolBucket.addDynamicAttributes = addDynamicAttributes;

    /**
     * Replace tokens in a string template with values in an object
     *
     * @param properties a key/value relationship between tokens and replacements
     * @param text the template string
     * @returns the template with tokens replaced
     * @private
     */
    function resolveTokens(properties, text) {
        return text.replace(/{([^{}]+)}/g, (match, key) => {
            return key in properties ? String(properties[key]) : '';
        });
    }

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const layout = new Properties({
        "symbol-placement": new DataConstantProperty(spec["layout_symbol"]["symbol-placement"]),
        "symbol-spacing": new DataConstantProperty(spec["layout_symbol"]["symbol-spacing"]),
        "symbol-avoid-edges": new DataConstantProperty(spec["layout_symbol"]["symbol-avoid-edges"]),
        "symbol-sort-key": new DataDrivenProperty(spec["layout_symbol"]["symbol-sort-key"]),
        "symbol-z-order": new DataConstantProperty(spec["layout_symbol"]["symbol-z-order"]),
        "icon-allow-overlap": new DataConstantProperty(spec["layout_symbol"]["icon-allow-overlap"]),
        "icon-overlap": new DataConstantProperty(spec["layout_symbol"]["icon-overlap"]),
        "icon-ignore-placement": new DataConstantProperty(spec["layout_symbol"]["icon-ignore-placement"]),
        "icon-optional": new DataConstantProperty(spec["layout_symbol"]["icon-optional"]),
        "icon-rotation-alignment": new DataConstantProperty(spec["layout_symbol"]["icon-rotation-alignment"]),
        "icon-size": new DataDrivenProperty(spec["layout_symbol"]["icon-size"]),
        "icon-text-fit": new DataConstantProperty(spec["layout_symbol"]["icon-text-fit"]),
        "icon-text-fit-padding": new DataConstantProperty(spec["layout_symbol"]["icon-text-fit-padding"]),
        "icon-image": new DataDrivenProperty(spec["layout_symbol"]["icon-image"]),
        "icon-rotate": new DataDrivenProperty(spec["layout_symbol"]["icon-rotate"]),
        "icon-padding": new DataDrivenProperty(spec["layout_symbol"]["icon-padding"]),
        "icon-keep-upright": new DataConstantProperty(spec["layout_symbol"]["icon-keep-upright"]),
        "icon-offset": new DataDrivenProperty(spec["layout_symbol"]["icon-offset"]),
        "icon-anchor": new DataDrivenProperty(spec["layout_symbol"]["icon-anchor"]),
        "icon-pitch-alignment": new DataConstantProperty(spec["layout_symbol"]["icon-pitch-alignment"]),
        "text-pitch-alignment": new DataConstantProperty(spec["layout_symbol"]["text-pitch-alignment"]),
        "text-rotation-alignment": new DataConstantProperty(spec["layout_symbol"]["text-rotation-alignment"]),
        "text-field": new DataDrivenProperty(spec["layout_symbol"]["text-field"]),
        "text-font": new DataDrivenProperty(spec["layout_symbol"]["text-font"]),
        "text-size": new DataDrivenProperty(spec["layout_symbol"]["text-size"]),
        "text-max-width": new DataDrivenProperty(spec["layout_symbol"]["text-max-width"]),
        "text-line-height": new DataConstantProperty(spec["layout_symbol"]["text-line-height"]),
        "text-letter-spacing": new DataDrivenProperty(spec["layout_symbol"]["text-letter-spacing"]),
        "text-justify": new DataDrivenProperty(spec["layout_symbol"]["text-justify"]),
        "text-radial-offset": new DataDrivenProperty(spec["layout_symbol"]["text-radial-offset"]),
        "text-variable-anchor": new DataConstantProperty(spec["layout_symbol"]["text-variable-anchor"]),
        "text-anchor": new DataDrivenProperty(spec["layout_symbol"]["text-anchor"]),
        "text-max-angle": new DataConstantProperty(spec["layout_symbol"]["text-max-angle"]),
        "text-writing-mode": new DataConstantProperty(spec["layout_symbol"]["text-writing-mode"]),
        "text-rotate": new DataDrivenProperty(spec["layout_symbol"]["text-rotate"]),
        "text-padding": new DataConstantProperty(spec["layout_symbol"]["text-padding"]),
        "text-keep-upright": new DataConstantProperty(spec["layout_symbol"]["text-keep-upright"]),
        "text-transform": new DataDrivenProperty(spec["layout_symbol"]["text-transform"]),
        "text-offset": new DataDrivenProperty(spec["layout_symbol"]["text-offset"]),
        "text-allow-overlap": new DataConstantProperty(spec["layout_symbol"]["text-allow-overlap"]),
        "text-overlap": new DataConstantProperty(spec["layout_symbol"]["text-overlap"]),
        "text-ignore-placement": new DataConstantProperty(spec["layout_symbol"]["text-ignore-placement"]),
        "text-optional": new DataConstantProperty(spec["layout_symbol"]["text-optional"]),
    });
    const paint$2 = new Properties({
        "icon-opacity": new DataDrivenProperty(spec["paint_symbol"]["icon-opacity"]),
        "icon-color": new DataDrivenProperty(spec["paint_symbol"]["icon-color"]),
        "icon-halo-color": new DataDrivenProperty(spec["paint_symbol"]["icon-halo-color"]),
        "icon-halo-width": new DataDrivenProperty(spec["paint_symbol"]["icon-halo-width"]),
        "icon-halo-blur": new DataDrivenProperty(spec["paint_symbol"]["icon-halo-blur"]),
        "icon-translate": new DataConstantProperty(spec["paint_symbol"]["icon-translate"]),
        "icon-translate-anchor": new DataConstantProperty(spec["paint_symbol"]["icon-translate-anchor"]),
        "text-opacity": new DataDrivenProperty(spec["paint_symbol"]["text-opacity"]),
        "text-color": new DataDrivenProperty(spec["paint_symbol"]["text-color"], { runtimeType: ColorType, getOverride: (o) => o.textColor, hasOverride: (o) => !!o.textColor }),
        "text-halo-color": new DataDrivenProperty(spec["paint_symbol"]["text-halo-color"]),
        "text-halo-width": new DataDrivenProperty(spec["paint_symbol"]["text-halo-width"]),
        "text-halo-blur": new DataDrivenProperty(spec["paint_symbol"]["text-halo-blur"]),
        "text-translate": new DataConstantProperty(spec["paint_symbol"]["text-translate"]),
        "text-translate-anchor": new DataConstantProperty(spec["paint_symbol"]["text-translate-anchor"]),
    });
    var properties$2 = { paint: paint$2, layout };

    // This is an internal expression class. It is only used in GL JS and
    // has GL JS dependencies which can break the standalone style-spec module
    class FormatSectionOverride {
        constructor(defaultValue) {
            if (defaultValue.property.overrides === undefined)
                throw new Error('overrides must be provided to instantiate FormatSectionOverride class');
            this.type = defaultValue.property.overrides ? defaultValue.property.overrides.runtimeType : NullType;
            this.defaultValue = defaultValue;
        }
        evaluate(ctx) {
            if (ctx.formattedSection) {
                const overrides = this.defaultValue.property.overrides;
                if (overrides && overrides.hasOverride(ctx.formattedSection)) {
                    return overrides.getOverride(ctx.formattedSection);
                }
            }
            if (ctx.feature && ctx.featureState) {
                return this.defaultValue.evaluate(ctx.feature, ctx.featureState);
            }
            return this.defaultValue.property.specification.default;
        }
        eachChild(fn) {
            if (!this.defaultValue.isConstant()) {
                const expr = this.defaultValue.value;
                fn(expr._styleExpression.expression);
            }
        }
        // Cannot be statically evaluated, as the output depends on the evaluation context.
        outputDefined() {
            return false;
        }
        serialize() {
            return null;
        }
    }
    register('FormatSectionOverride', FormatSectionOverride, { omit: ['defaultValue'] });

    class SymbolStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties$2);
        }
        recalculate(parameters, availableImages) {
            super.recalculate(parameters, availableImages);
            if (this.layout.get('icon-rotation-alignment') === 'auto') {
                if (this.layout.get('symbol-placement') !== 'point') {
                    this.layout._values['icon-rotation-alignment'] = 'map';
                }
                else {
                    this.layout._values['icon-rotation-alignment'] = 'viewport';
                }
            }
            if (this.layout.get('text-rotation-alignment') === 'auto') {
                if (this.layout.get('symbol-placement') !== 'point') {
                    this.layout._values['text-rotation-alignment'] = 'map';
                }
                else {
                    this.layout._values['text-rotation-alignment'] = 'viewport';
                }
            }
            // If unspecified, `*-pitch-alignment` inherits `*-rotation-alignment`
            if (this.layout.get('text-pitch-alignment') === 'auto') {
                this.layout._values['text-pitch-alignment'] = this.layout.get('text-rotation-alignment') === 'map' ? 'map' : 'viewport';
            }
            if (this.layout.get('icon-pitch-alignment') === 'auto') {
                this.layout._values['icon-pitch-alignment'] = this.layout.get('icon-rotation-alignment');
            }
            if (this.layout.get('symbol-placement') === 'point') {
                const writingModes = this.layout.get('text-writing-mode');
                if (writingModes) {
                    // remove duplicates, preserving order
                    const deduped = [];
                    for (const m of writingModes) {
                        if (deduped.indexOf(m) < 0)
                            deduped.push(m);
                    }
                    this.layout._values['text-writing-mode'] = deduped;
                }
                else {
                    this.layout._values['text-writing-mode'] = ['horizontal'];
                }
            }
            this._setPaintOverrides();
        }
        getValueAndResolveTokens(name, feature, canonical, availableImages) {
            const value = this.layout.get(name).evaluate(feature, {}, canonical, availableImages);
            const unevaluated = this._unevaluatedLayout._values[name];
            if (!unevaluated.isDataDriven() && !isExpression(unevaluated.value) && value) {
                return resolveTokens(feature.properties, value);
            }
            return value;
        }
        createBucket(parameters) {
            return new SymbolBucket(parameters);
        }
        queryRadius() {
            return 0;
        }
        queryIntersectsFeature() {
            throw new Error('Should take a different path in FeatureIndex');
        }
        _setPaintOverrides() {
            for (const overridable of properties$2.paint.overridableProperties) {
                if (!SymbolStyleLayer.hasPaintOverride(this.layout, overridable)) {
                    continue;
                }
                const overriden = this.paint.get(overridable);
                const override = new FormatSectionOverride(overriden);
                const styleExpression = new StyleExpression(override, overriden.property.specification);
                let expression = null;
                if (overriden.value.kind === 'constant' || overriden.value.kind === 'source') {
                    expression = new ZoomConstantExpression('source', styleExpression);
                }
                else {
                    expression = new ZoomDependentExpression('composite', styleExpression, overriden.value.zoomStops);
                }
                this.paint._values[overridable] = new PossiblyEvaluatedPropertyValue(overriden.property, expression, overriden.parameters);
            }
        }
        _handleOverridablePaintPropertyUpdate(name, oldValue, newValue) {
            if (!this.layout || oldValue.isDataDriven() || newValue.isDataDriven()) {
                return false;
            }
            return SymbolStyleLayer.hasPaintOverride(this.layout, name);
        }
        static hasPaintOverride(layout, propertyName) {
            const textField = layout.get('text-field');
            const property = properties$2.paint.properties[propertyName];
            let hasOverrides = false;
            const checkSections = (sections) => {
                for (const section of sections) {
                    if (property.overrides && property.overrides.hasOverride(section)) {
                        hasOverrides = true;
                        return;
                    }
                }
            };
            if (textField.value.kind === 'constant' && textField.value.value instanceof Formatted) {
                checkSections(textField.value.value.sections);
            }
            else if (textField.value.kind === 'source') {
                const checkExpression = (expression) => {
                    if (hasOverrides)
                        return;
                    if (expression instanceof Literal && typeOf(expression.value) === FormattedType) {
                        const formatted = expression.value;
                        checkSections(formatted.sections);
                    }
                    else if (expression instanceof FormatExpression) {
                        checkSections(expression.sections);
                    }
                    else {
                        expression.eachChild(checkExpression);
                    }
                };
                const expr = textField.value;
                if (expr._styleExpression) {
                    checkExpression(expr._styleExpression.expression);
                }
            }
            return hasOverrides;
        }
    }
    function getOverlapMode(layout, overlapProp, allowOverlapProp) {
        let result = 'never';
        const overlap = layout.get(overlapProp);
        if (overlap) {
            // if -overlap is set, use it
            result = overlap;
        }
        else if (layout.get(allowOverlapProp)) {
            // fall back to -allow-overlap, with false='never', true='always'
            result = 'always';
        }
        return result;
    }
    function getIconPadding(layout, feature, canonical, pixelRatio = 1) {
        // Support text-padding in addition to icon-padding? Unclear how to apply asymmetric text-padding to the radius for collision circles.
        const result = layout.get('icon-padding').evaluate(feature, {}, canonical);
        const values = result && result.values;
        return [
            values[0] * pixelRatio,
            values[1] * pixelRatio,
            values[2] * pixelRatio,
            values[3] * pixelRatio,
        ];
    }

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const paint$1 = new Properties({
        "background-color": new DataConstantProperty(spec["paint_background"]["background-color"]),
        "background-pattern": new CrossFadedProperty(spec["paint_background"]["background-pattern"]),
        "background-opacity": new DataConstantProperty(spec["paint_background"]["background-opacity"]),
    });
    var properties$1 = { paint: paint$1 };

    class BackgroundStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties$1);
        }
    }

    // This file is generated. Edit build/generate-style-code.ts, then run 'npm run codegen'.
    const paint = new Properties({
        "raster-opacity": new DataConstantProperty(spec["paint_raster"]["raster-opacity"]),
        "raster-hue-rotate": new DataConstantProperty(spec["paint_raster"]["raster-hue-rotate"]),
        "raster-brightness-min": new DataConstantProperty(spec["paint_raster"]["raster-brightness-min"]),
        "raster-brightness-max": new DataConstantProperty(spec["paint_raster"]["raster-brightness-max"]),
        "raster-saturation": new DataConstantProperty(spec["paint_raster"]["raster-saturation"]),
        "raster-contrast": new DataConstantProperty(spec["paint_raster"]["raster-contrast"]),
        "raster-resampling": new DataConstantProperty(spec["paint_raster"]["raster-resampling"]),
        "raster-fade-duration": new DataConstantProperty(spec["paint_raster"]["raster-fade-duration"]),
    });
    var properties = { paint };

    class RasterStyleLayer extends StyleLayer {
        constructor(layer) {
            super(layer, properties);
        }
    }

    class CustomStyleLayer extends StyleLayer {
        constructor(implementation) {
            super(implementation, {});
            this.onAdd = (map) => {
                if (this.implementation.onAdd) {
                    this.implementation.onAdd(map, map.painter.context.gl);
                }
            };
            this.onRemove = (map) => {
                if (this.implementation.onRemove) {
                    this.implementation.onRemove(map, map.painter.context.gl);
                }
            };
            this.implementation = implementation;
        }
        is3D() {
            return this.implementation.renderingMode === '3d';
        }
        hasOffscreenPass() {
            return this.implementation.prerender !== undefined;
        }
        recalculate() { }
        updateTransitions() { }
        hasTransition() { return false; }
        serialize() {
            throw new Error('Custom layers cannot be serialized');
        }
    }

    const subclasses = {
        circle: CircleStyleLayer,
        heatmap: HeatmapStyleLayer,
        hillshade: HillshadeStyleLayer,
        fill: FillStyleLayer,
        'fill-extrusion': FillExtrusionStyleLayer,
        line: LineStyleLayer,
        symbol: SymbolStyleLayer,
        background: BackgroundStyleLayer,
        raster: RasterStyleLayer
    };
    function createStyleLayer(layer) {
        if (layer.type === 'custom') {
            return new CustomStyleLayer(layer);
        }
        else {
            return new subclasses[layer.type](layer);
        }
    }

    const refProperties = ['type', 'source', 'source-layer', 'minzoom', 'maxzoom', 'filter', 'layout'];

    function stringify(obj) {
        const type = typeof obj;
        if (type === 'number' || type === 'boolean' || type === 'string' || obj === undefined || obj === null)
            return JSON.stringify(obj);
        if (Array.isArray(obj)) {
            let str = '[';
            for (const val of obj) {
                str += `${stringify(val)},`;
            }
            return `${str}]`;
        }
        const keys = Object.keys(obj).sort();
        let str = '{';
        for (let i = 0; i < keys.length; i++) {
            str += `${JSON.stringify(keys[i])}:${stringify(obj[keys[i]])},`;
        }
        return `${str}}`;
    }
    function getKey(layer) {
        let key = '';
        for (const k of refProperties) {
            key += `/${stringify(layer[k])}`;
        }
        return key;
    }
    /**
     * Given an array of layers, return an array of arrays of layers where all
     * layers in each group have identical layout-affecting properties. These
     * are the properties that were formerly used by explicit `ref` mechanism
     * for layers: 'type', 'source', 'source-layer', 'minzoom', 'maxzoom',
     * 'filter', and 'layout'.
     *
     * The input is not modified. The output layers are references to the
     * input layers.
     *
     * @private
     * @param {Array<Layer>} layers
     * @param {Object} [cachedKeys] - an object to keep already calculated keys.
     * @returns {Array<Array<Layer>>}
     */
    function groupByLayout(layers, cachedKeys) {
        const groups = {};
        for (let i = 0; i < layers.length; i++) {
            const k = (cachedKeys && cachedKeys[layers[i].id]) || getKey(layers[i]);
            // update the cache if there is one
            if (cachedKeys)
                cachedKeys[layers[i].id] = k;
            let group = groups[k];
            if (!group) {
                group = groups[k] = [];
            }
            group.push(layers[i]);
        }
        const result = [];
        for (const k in groups) {
            result.push(groups[k]);
        }
        return result;
    }

    class StyleLayerIndex {
        constructor(layerConfigs) {
            this.keyCache = {};
            if (layerConfigs) {
                this.replace(layerConfigs);
            }
        }
        replace(layerConfigs) {
            this._layerConfigs = {};
            this._layers = {};
            this.update(layerConfigs, []);
        }
        update(layerConfigs, removedIds) {
            for (const layerConfig of layerConfigs) {
                this._layerConfigs[layerConfig.id] = layerConfig;
                const layer = this._layers[layerConfig.id] = createStyleLayer(layerConfig);
                layer._featureFilter = createFilter(layer.filter);
                if (this.keyCache[layerConfig.id])
                    delete this.keyCache[layerConfig.id];
            }
            for (const id of removedIds) {
                delete this.keyCache[id];
                delete this._layerConfigs[id];
                delete this._layers[id];
            }
            this.familiesBySource = {};
            const groups = groupByLayout(Object.values(this._layerConfigs), this.keyCache);
            for (const layerConfigs of groups) {
                const layers = layerConfigs.map((layerConfig) => this._layers[layerConfig.id]);
                const layer = layers[0];
                if (layer.visibility === 'none') {
                    continue;
                }
                const sourceId = layer.source || '';
                let sourceGroup = this.familiesBySource[sourceId];
                if (!sourceGroup) {
                    sourceGroup = this.familiesBySource[sourceId] = {};
                }
                const sourceLayerId = layer.sourceLayer || '_geojsonTileLayer';
                let sourceLayerFamilies = sourceGroup[sourceLayerId];
                if (!sourceLayerFamilies) {
                    sourceLayerFamilies = sourceGroup[sourceLayerId] = [];
                }
                sourceLayerFamilies.push(layers);
            }
        }
    }

    class DictionaryCoder {
        constructor(strings) {
            this._stringToNumber = {};
            this._numberToString = [];
            for (let i = 0; i < strings.length; i++) {
                const string = strings[i];
                this._stringToNumber[string] = i;
                this._numberToString[i] = string;
            }
        }
        encode(string) {
            return this._stringToNumber[string];
        }
        decode(n) {
            if (n >= this._numberToString.length)
                throw new Error(`Out of bounds. Index requested n=${n} can't be >= this._numberToString.length ${this._numberToString.length}`);
            return this._numberToString[n];
        }
    }

    class GeoJSONFeature {
        constructor(vectorTileFeature, z, x, y, id) {
            this.type = 'Feature';
            this._vectorTileFeature = vectorTileFeature;
            vectorTileFeature._z = z;
            vectorTileFeature._x = x;
            vectorTileFeature._y = y;
            this.properties = vectorTileFeature.properties;
            this.id = id;
        }
        get geometry() {
            if (this._geometry === undefined) {
                this._geometry = this._vectorTileFeature.toGeoJSON(this._vectorTileFeature._x, this._vectorTileFeature._y, this._vectorTileFeature._z).geometry;
            }
            return this._geometry;
        }
        set geometry(g) {
            this._geometry = g;
        }
        toJSON() {
            const json = {
                geometry: this.geometry
            };
            for (const i in this) {
                if (i === '_geometry' || i === '_vectorTileFeature')
                    continue;
                json[i] = (this)[i];
            }
            return json;
        }
    }

    class FeatureIndex {
        constructor(tileID, promoteId) {
            this.tileID = tileID;
            this.x = tileID.canonical.x;
            this.y = tileID.canonical.y;
            this.z = tileID.canonical.z;
            this.grid = new TransferableGridIndex(EXTENT, 16, 0);
            this.grid3D = new TransferableGridIndex(EXTENT, 16, 0);
            this.featureIndexArray = new FeatureIndexArray();
            this.promoteId = promoteId;
        }
        insert(feature, geometry, featureIndex, sourceLayerIndex, bucketIndex, is3D) {
            const key = this.featureIndexArray.length;
            this.featureIndexArray.emplaceBack(featureIndex, sourceLayerIndex, bucketIndex);
            const grid = is3D ? this.grid3D : this.grid;
            for (let r = 0; r < geometry.length; r++) {
                const ring = geometry[r];
                const bbox = [Infinity, Infinity, -Infinity, -Infinity];
                for (let i = 0; i < ring.length; i++) {
                    const p = ring[i];
                    bbox[0] = Math.min(bbox[0], p.x);
                    bbox[1] = Math.min(bbox[1], p.y);
                    bbox[2] = Math.max(bbox[2], p.x);
                    bbox[3] = Math.max(bbox[3], p.y);
                }
                if (bbox[0] < EXTENT &&
                    bbox[1] < EXTENT &&
                    bbox[2] >= 0 &&
                    bbox[3] >= 0) {
                    grid.insert(key, bbox[0], bbox[1], bbox[2], bbox[3]);
                }
            }
        }
        loadVTLayers() {
            if (!this.vtLayers) {
                this.vtLayers = new vectorTile.VectorTile(new pbf(this.rawTileData)).layers;
                this.sourceLayerCoder = new DictionaryCoder(this.vtLayers ? Object.keys(this.vtLayers).sort() : ['_geojsonTileLayer']);
            }
            return this.vtLayers;
        }
        // Finds non-symbol features in this tile at a particular position.
        query(args, styleLayers, serializedLayers, sourceFeatureState) {
            this.loadVTLayers();
            const params = args.params || {}, pixelsToTileUnits = EXTENT / args.tileSize / args.scale, filter = createFilter(params.filter);
            const queryGeometry = args.queryGeometry;
            const queryPadding = args.queryPadding * pixelsToTileUnits;
            const bounds = getBounds(queryGeometry);
            const matching = this.grid.query(bounds.minX - queryPadding, bounds.minY - queryPadding, bounds.maxX + queryPadding, bounds.maxY + queryPadding);
            const cameraBounds = getBounds(args.cameraQueryGeometry);
            const matching3D = this.grid3D.query(cameraBounds.minX - queryPadding, cameraBounds.minY - queryPadding, cameraBounds.maxX + queryPadding, cameraBounds.maxY + queryPadding, (bx1, by1, bx2, by2) => {
                return polygonIntersectsBox(args.cameraQueryGeometry, bx1 - queryPadding, by1 - queryPadding, bx2 + queryPadding, by2 + queryPadding);
            });
            for (const key of matching3D) {
                matching.push(key);
            }
            matching.sort(topDownFeatureComparator);
            const result = {};
            let previousIndex;
            for (let k = 0; k < matching.length; k++) {
                const index = matching[k];
                // don't check the same feature more than once
                if (index === previousIndex)
                    continue;
                previousIndex = index;
                const match = this.featureIndexArray.get(index);
                let featureGeometry = null;
                this.loadMatchingFeature(result, match.bucketIndex, match.sourceLayerIndex, match.featureIndex, filter, params.layers, params.availableImages, styleLayers, serializedLayers, sourceFeatureState, (feature, styleLayer, featureState) => {
                    if (!featureGeometry) {
                        featureGeometry = loadGeometry(feature);
                    }
                    return styleLayer.queryIntersectsFeature(queryGeometry, feature, featureState, featureGeometry, this.z, args.transform, pixelsToTileUnits, args.pixelPosMatrix);
                });
            }
            return result;
        }
        loadMatchingFeature(result, bucketIndex, sourceLayerIndex, featureIndex, filter, filterLayerIDs, availableImages, styleLayers, serializedLayers, sourceFeatureState, intersectionTest) {
            const layerIDs = this.bucketLayerIDs[bucketIndex];
            if (filterLayerIDs && !arraysIntersect(filterLayerIDs, layerIDs))
                return;
            const sourceLayerName = this.sourceLayerCoder.decode(sourceLayerIndex);
            const sourceLayer = this.vtLayers[sourceLayerName];
            const feature = sourceLayer.feature(featureIndex);
            if (filter.needGeometry) {
                const evaluationFeature = toEvaluationFeature(feature, true);
                if (!filter.filter(new EvaluationParameters(this.tileID.overscaledZ), evaluationFeature, this.tileID.canonical)) {
                    return;
                }
            }
            else if (!filter.filter(new EvaluationParameters(this.tileID.overscaledZ), feature)) {
                return;
            }
            const id = this.getId(feature, sourceLayerName);
            for (let l = 0; l < layerIDs.length; l++) {
                const layerID = layerIDs[l];
                if (filterLayerIDs && filterLayerIDs.indexOf(layerID) < 0) {
                    continue;
                }
                const styleLayer = styleLayers[layerID];
                if (!styleLayer)
                    continue;
                let featureState = {};
                if (id && sourceFeatureState) {
                    // `feature-state` expression evaluation requires feature state to be available
                    featureState = sourceFeatureState.getState(styleLayer.sourceLayer || '_geojsonTileLayer', id);
                }
                const serializedLayer = extend$1({}, serializedLayers[layerID]);
                serializedLayer.paint = evaluateProperties(serializedLayer.paint, styleLayer.paint, feature, featureState, availableImages);
                serializedLayer.layout = evaluateProperties(serializedLayer.layout, styleLayer.layout, feature, featureState, availableImages);
                const intersectionZ = !intersectionTest || intersectionTest(feature, styleLayer, featureState);
                if (!intersectionZ) {
                    // Only applied for non-symbol features
                    continue;
                }
                const geojsonFeature = new GeoJSONFeature(feature, this.z, this.x, this.y, id);
                geojsonFeature.layer = serializedLayer;
                let layerResult = result[layerID];
                if (layerResult === undefined) {
                    layerResult = result[layerID] = [];
                }
                layerResult.push({ featureIndex, feature: geojsonFeature, intersectionZ });
            }
        }
        // Given a set of symbol indexes that have already been looked up,
        // return a matching set of GeoJSONFeatures
        lookupSymbolFeatures(symbolFeatureIndexes, serializedLayers, bucketIndex, sourceLayerIndex, filterSpec, filterLayerIDs, availableImages, styleLayers) {
            const result = {};
            this.loadVTLayers();
            const filter = createFilter(filterSpec);
            for (const symbolFeatureIndex of symbolFeatureIndexes) {
                this.loadMatchingFeature(result, bucketIndex, sourceLayerIndex, symbolFeatureIndex, filter, filterLayerIDs, availableImages, styleLayers, serializedLayers);
            }
            return result;
        }
        hasLayer(id) {
            for (const layerIDs of this.bucketLayerIDs) {
                for (const layerID of layerIDs) {
                    if (id === layerID)
                        return true;
                }
            }
            return false;
        }
        getId(feature, sourceLayerId) {
            let id = feature.id;
            if (this.promoteId) {
                const propName = typeof this.promoteId === 'string' ? this.promoteId : this.promoteId[sourceLayerId];
                id = feature.properties[propName];
                if (typeof id === 'boolean')
                    id = Number(id);
            }
            return id;
        }
    }
    register('FeatureIndex', FeatureIndex, { omit: ['rawTileData', 'sourceLayerCoder'] });
    function evaluateProperties(serializedProperties, styleLayerProperties, feature, featureState, availableImages) {
        return mapObject(serializedProperties, (property, key) => {
            const prop = styleLayerProperties instanceof PossiblyEvaluated ? styleLayerProperties.get(key) : null;
            return prop && prop.evaluate ? prop.evaluate(feature, featureState, availableImages) : prop;
        });
    }
    function getBounds(geometry) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of geometry) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        return { minX, minY, maxX, maxY };
    }
    function topDownFeatureComparator(a, b) {
        return b - a;
    }

    const padding = 1;
    class GlyphAtlas {
        constructor(stacks) {
            const positions = {};
            const bins = [];
            for (const stack in stacks) {
                const glyphs = stacks[stack];
                const stackPositions = positions[stack] = {};
                for (const id in glyphs) {
                    const src = glyphs[+id];
                    if (!src || src.bitmap.width === 0 || src.bitmap.height === 0)
                        continue;
                    const bin = {
                        x: 0,
                        y: 0,
                        w: src.bitmap.width + 2 * padding,
                        h: src.bitmap.height + 2 * padding
                    };
                    bins.push(bin);
                    stackPositions[id] = { rect: bin, metrics: src.metrics };
                }
            }
            const { w, h } = potpack(bins);
            const image = new AlphaImage({ width: w || 1, height: h || 1 });
            for (const stack in stacks) {
                const glyphs = stacks[stack];
                for (const id in glyphs) {
                    const src = glyphs[+id];
                    if (!src || src.bitmap.width === 0 || src.bitmap.height === 0)
                        continue;
                    const bin = positions[stack][id].rect;
                    AlphaImage.copy(src.bitmap, image, { x: 0, y: 0 }, { x: bin.x + padding, y: bin.y + padding }, src.bitmap);
                }
            }
            this.image = image;
            this.positions = positions;
        }
    }
    register('GlyphAtlas', GlyphAtlas);

    var whootsJsExports = {};
    var whootsJs = {
      get exports(){ return whootsJsExports; },
      set exports(v){ whootsJsExports = v; },
    };

    (function (module, exports) {
    	(function (global, factory) {
    	factory(exports) ;
    	}(this, (function (exports) {
    	/**
    	 * getURL
    	 *
    	 * @param    {String}  baseUrl  Base url of the WMS server
    	 * @param    {String}  layer    Layer name
    	 * @param    {Number}  x        Tile coordinate x
    	 * @param    {Number}  y        Tile coordinate y
    	 * @param    {Number}  z        Tile zoom
    	 * @param    {Object}  [options]
    	 * @param    {String}  [options.format='image/png']
    	 * @param    {String}  [options.service='WMS']
    	 * @param    {String}  [options.version='1.1.1']
    	 * @param    {String}  [options.request='GetMap']
    	 * @param    {String}  [options.srs='EPSG:3857']
    	 * @param    {Number}  [options.width='256']
    	 * @param    {Number}  [options.height='256']
    	 * @returns  {String}  url
    	 * @example
    	 * var baseUrl = 'http://geodata.state.nj.us/imagerywms/Natural2015';
    	 * var layer = 'Natural2015';
    	 * var url = whoots.getURL(baseUrl, layer, 154308, 197167, 19);
    	 */
    	function getURL(baseUrl, layer, x, y, z, options) {
    	    options = options || {};

    	    var url = baseUrl + '?' + [
    	        'bbox='    + getTileBBox(x, y, z),
    	        'format='  + (options.format || 'image/png'),
    	        'service=' + (options.service || 'WMS'),
    	        'version=' + (options.version || '1.1.1'),
    	        'request=' + (options.request || 'GetMap'),
    	        'srs='     + (options.srs || 'EPSG:3857'),
    	        'width='   + (options.width || 256),
    	        'height='  + (options.height || 256),
    	        'layers='  + layer
    	    ].join('&');

    	    return url;
    	}


    	/**
    	 * getTileBBox
    	 *
    	 * @param    {Number}  x  Tile coordinate x
    	 * @param    {Number}  y  Tile coordinate y
    	 * @param    {Number}  z  Tile zoom
    	 * @returns  {String}  String of the bounding box
    	 */
    	function getTileBBox(x, y, z) {
    	    // for Google/OSM tile scheme we need to alter the y
    	    y = (Math.pow(2, z) - y - 1);

    	    var min = getMercCoords(x * 256, y * 256, z),
    	        max = getMercCoords((x + 1) * 256, (y + 1) * 256, z);

    	    return min[0] + ',' + min[1] + ',' + max[0] + ',' + max[1];
    	}


    	/**
    	 * getMercCoords
    	 *
    	 * @param    {Number}  x  Pixel coordinate x
    	 * @param    {Number}  y  Pixel coordinate y
    	 * @param    {Number}  z  Tile zoom
    	 * @returns  {Array}   [x, y]
    	 */
    	function getMercCoords(x, y, z) {
    	    var resolution = (2 * Math.PI * 6378137 / 256) / Math.pow(2, z),
    	        merc_x = (x * resolution - 2 * Math.PI  * 6378137 / 2.0),
    	        merc_y = (y * resolution - 2 * Math.PI  * 6378137 / 2.0);

    	    return [merc_x, merc_y];
    	}

    	exports.getURL = getURL;
    	exports.getTileBBox = getTileBBox;
    	exports.getMercCoords = getMercCoords;

    	Object.defineProperty(exports, '__esModule', { value: true });

    	})));
    } (whootsJs, whootsJsExports));

    /**
     * A `LngLatBounds` object represents a geographical bounding box,
     * defined by its southwest and northeast points in longitude and latitude.
     *
     * If no arguments are provided to the constructor, a `null` bounding box is created.
     *
     * Note that any Mapbox GL method that accepts a `LngLatBounds` object as an argument or option
     * can also accept an `Array` of two {@link LngLatLike} constructs and will perform an implicit conversion.
     * This flexible type is documented as {@link LngLatBoundsLike}.
     *
     * @param {LngLatLike} [sw] The southwest corner of the bounding box.
     * @param {LngLatLike} [ne] The northeast corner of the bounding box.
     * @example
     * var sw = new maplibregl.LngLat(-73.9876, 40.7661);
     * var ne = new maplibregl.LngLat(-73.9397, 40.8002);
     * var llb = new maplibregl.LngLatBounds(sw, ne);
     */
    class LngLatBounds {
        // This constructor is too flexible to type. It should not be so flexible.
        constructor(sw, ne) {
            if (!sw) ;
            else if (ne) {
                this.setSouthWest(sw).setNorthEast(ne);
            }
            else if (sw.length === 4) {
                this.setSouthWest([sw[0], sw[1]]).setNorthEast([sw[2], sw[3]]);
            }
            else {
                this.setSouthWest(sw[0]).setNorthEast(sw[1]);
            }
        }
        /**
         * Set the northeast corner of the bounding box
         *
         * @param {LngLatLike} ne a {@link LngLatLike} object describing the northeast corner of the bounding box.
         * @returns {LngLatBounds} `this`
         */
        setNorthEast(ne) {
            this._ne = ne instanceof LngLat$1 ? new LngLat$1(ne.lng, ne.lat) : LngLat$1.convert(ne);
            return this;
        }
        /**
         * Set the southwest corner of the bounding box
         *
         * @param {LngLatLike} sw a {@link LngLatLike} object describing the southwest corner of the bounding box.
         * @returns {LngLatBounds} `this`
         */
        setSouthWest(sw) {
            this._sw = sw instanceof LngLat$1 ? new LngLat$1(sw.lng, sw.lat) : LngLat$1.convert(sw);
            return this;
        }
        /**
         * Extend the bounds to include a given LngLatLike or LngLatBoundsLike.
         *
         * @param {LngLatLike|LngLatBoundsLike} obj object to extend to
         * @returns {LngLatBounds} `this`
         */
        extend(obj) {
            const sw = this._sw, ne = this._ne;
            let sw2, ne2;
            if (obj instanceof LngLat$1) {
                sw2 = obj;
                ne2 = obj;
            }
            else if (obj instanceof LngLatBounds) {
                sw2 = obj._sw;
                ne2 = obj._ne;
                if (!sw2 || !ne2)
                    return this;
            }
            else {
                if (Array.isArray(obj)) {
                    if (obj.length === 4 || obj.every(Array.isArray)) {
                        const lngLatBoundsObj = obj;
                        return this.extend(LngLatBounds.convert(lngLatBoundsObj));
                    }
                    else {
                        const lngLatObj = obj;
                        return this.extend(LngLat$1.convert(lngLatObj));
                    }
                }
                return this;
            }
            if (!sw && !ne) {
                this._sw = new LngLat$1(sw2.lng, sw2.lat);
                this._ne = new LngLat$1(ne2.lng, ne2.lat);
            }
            else {
                sw.lng = Math.min(sw2.lng, sw.lng);
                sw.lat = Math.min(sw2.lat, sw.lat);
                ne.lng = Math.max(ne2.lng, ne.lng);
                ne.lat = Math.max(ne2.lat, ne.lat);
            }
            return this;
        }
        /**
         * Returns the geographical coordinate equidistant from the bounding box's corners.
         *
         * @returns {LngLat} The bounding box's center.
         * @example
         * var llb = new maplibregl.LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
         * llb.getCenter(); // = LngLat {lng: -73.96365, lat: 40.78315}
         */
        getCenter() {
            return new LngLat$1((this._sw.lng + this._ne.lng) / 2, (this._sw.lat + this._ne.lat) / 2);
        }
        /**
         * Returns the southwest corner of the bounding box.
         *
         * @returns {LngLat} The southwest corner of the bounding box.
         */
        getSouthWest() { return this._sw; }
        /**
         * Returns the northeast corner of the bounding box.
         *
         * @returns {LngLat} The northeast corner of the bounding box.
         */
        getNorthEast() { return this._ne; }
        /**
         * Returns the northwest corner of the bounding box.
         *
         * @returns {LngLat} The northwest corner of the bounding box.
         */
        getNorthWest() { return new LngLat$1(this.getWest(), this.getNorth()); }
        /**
         * Returns the southeast corner of the bounding box.
         *
         * @returns {LngLat} The southeast corner of the bounding box.
         */
        getSouthEast() { return new LngLat$1(this.getEast(), this.getSouth()); }
        /**
         * Returns the west edge of the bounding box.
         *
         * @returns {number} The west edge of the bounding box.
         */
        getWest() { return this._sw.lng; }
        /**
         * Returns the south edge of the bounding box.
         *
         * @returns {number} The south edge of the bounding box.
         */
        getSouth() { return this._sw.lat; }
        /**
         * Returns the east edge of the bounding box.
         *
         * @returns {number} The east edge of the bounding box.
         */
        getEast() { return this._ne.lng; }
        /**
         * Returns the north edge of the bounding box.
         *
         * @returns {number} The north edge of the bounding box.
         */
        getNorth() { return this._ne.lat; }
        /**
         * Returns the bounding box represented as an array.
         *
         * @returns {Array<Array<number>>} The bounding box represented as an array, consisting of the
         *   southwest and northeast coordinates of the bounding represented as arrays of numbers.
         * @example
         * var llb = new maplibregl.LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
         * llb.toArray(); // = [[-73.9876, 40.7661], [-73.9397, 40.8002]]
         */
        toArray() {
            return [this._sw.toArray(), this._ne.toArray()];
        }
        /**
         * Return the bounding box represented as a string.
         *
         * @returns {string} The bounding box represents as a string of the format
         *   `'LngLatBounds(LngLat(lng, lat), LngLat(lng, lat))'`.
         * @example
         * var llb = new maplibregl.LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
         * llb.toString(); // = "LngLatBounds(LngLat(-73.9876, 40.7661), LngLat(-73.9397, 40.8002))"
         */
        toString() {
            return `LngLatBounds(${this._sw.toString()}, ${this._ne.toString()})`;
        }
        /**
         * Check if the bounding box is an empty/`null`-type box.
         *
         * @returns {boolean} True if bounds have been defined, otherwise false.
         */
        isEmpty() {
            return !(this._sw && this._ne);
        }
        /**
         * Check if the point is within the bounding box.
         *
         * @param {LngLatLike} lnglat geographic point to check against.
         * @returns {boolean} True if the point is within the bounding box.
         * @example
         * var llb = new maplibregl.LngLatBounds(
         *   new maplibregl.LngLat(-73.9876, 40.7661),
         *   new maplibregl.LngLat(-73.9397, 40.8002)
         * );
         *
         * var ll = new maplibregl.LngLat(-73.9567, 40.7789);
         *
         * console.log(llb.contains(ll)); // = true
         */
        contains(lnglat) {
            const { lng, lat } = LngLat$1.convert(lnglat);
            const containsLatitude = this._sw.lat <= lat && lat <= this._ne.lat;
            let containsLongitude = this._sw.lng <= lng && lng <= this._ne.lng;
            if (this._sw.lng > this._ne.lng) { // wrapped coordinates
                containsLongitude = this._sw.lng >= lng && lng >= this._ne.lng;
            }
            return containsLatitude && containsLongitude;
        }
        /**
         * Converts an array to a `LngLatBounds` object.
         *
         * If a `LngLatBounds` object is passed in, the function returns it unchanged.
         *
         * Internally, the function calls `LngLat#convert` to convert arrays to `LngLat` values.
         *
         * @param {LngLatBoundsLike} input An array of two coordinates to convert, or a `LngLatBounds` object to return.
         * @returns {LngLatBounds} A new `LngLatBounds` object, if a conversion occurred, or the original `LngLatBounds` object.
         * @example
         * var arr = [[-73.9876, 40.7661], [-73.9397, 40.8002]];
         * var llb = maplibregl.LngLatBounds.convert(arr);
         * llb;   // = LngLatBounds {_sw: LngLat {lng: -73.9876, lat: 40.7661}, _ne: LngLat {lng: -73.9397, lat: 40.8002}}
         */
        static convert(input) {
            if (input instanceof LngLatBounds)
                return input;
            if (!input)
                return input;
            return new LngLatBounds(input);
        }
    }

    /*
    * Approximate radius of the earth in meters.
    * Uses the WGS-84 approximation. The radius at the equator is ~6378137 and at the poles is ~6356752. https://en.wikipedia.org/wiki/World_Geodetic_System#WGS84
    * 6371008.8 is one published "average radius" see https://en.wikipedia.org/wiki/Earth_radius#Mean_radius, or ftp://athena.fsv.cvut.cz/ZFG/grs80-Moritz.pdf p.4
    */
    const earthRadius = 6371008.8;
    /**
     * A `LngLat` object represents a given longitude and latitude coordinate, measured in degrees.
     * These coordinates are based on the [WGS84 (EPSG:4326) standard](https://en.wikipedia.org/wiki/World_Geodetic_System#WGS84).
     *
     * MapLibre GL uses longitude, latitude coordinate order (as opposed to latitude, longitude) to match the
     * [GeoJSON specification](https://tools.ietf.org/html/rfc7946).
     *
     * Note that any MapLibre GL method that accepts a `LngLat` object as an argument or option
     * can also accept an `Array` of two numbers and will perform an implicit conversion.
     * This flexible type is documented as {@link LngLatLike}.
     *
     * @param {number} lng Longitude, measured in degrees.
     * @param {number} lat Latitude, measured in degrees.
     * @example
     * var ll = new maplibregl.LngLat(-123.9749, 40.7736);
     * ll.lng; // = -123.9749
     * @see [Get coordinates of the mouse pointer](https://maplibre.org/maplibre-gl-js-docs/example/mouse-position/)
     * @see [Display a popup](https://maplibre.org/maplibre-gl-js-docs/example/popup/)
     * @see [Create a timeline animation](https://maplibre.org/maplibre-gl-js-docs/example/timeline-animation/)
     */
    class LngLat {
        constructor(lng, lat) {
            if (isNaN(lng) || isNaN(lat)) {
                throw new Error(`Invalid LngLat object: (${lng}, ${lat})`);
            }
            this.lng = +lng;
            this.lat = +lat;
            if (this.lat > 90 || this.lat < -90) {
                throw new Error('Invalid LngLat latitude value: must be between -90 and 90');
            }
        }
        /**
         * Returns a new `LngLat` object whose longitude is wrapped to the range (-180, 180).
         *
         * @returns {LngLat} The wrapped `LngLat` object.
         * @example
         * var ll = new maplibregl.LngLat(286.0251, 40.7736);
         * var wrapped = ll.wrap();
         * wrapped.lng; // = -73.9749
         */
        wrap() {
            return new LngLat(wrap(this.lng, -180, 180), this.lat);
        }
        /**
         * Returns the coordinates represented as an array of two numbers.
         *
         * @returns {Array<number>} The coordinates represeted as an array of longitude and latitude.
         * @example
         * var ll = new maplibregl.LngLat(-73.9749, 40.7736);
         * ll.toArray(); // = [-73.9749, 40.7736]
         */
        toArray() {
            return [this.lng, this.lat];
        }
        /**
         * Returns the coordinates represent as a string.
         *
         * @returns {string} The coordinates represented as a string of the format `'LngLat(lng, lat)'`.
         * @example
         * var ll = new maplibregl.LngLat(-73.9749, 40.7736);
         * ll.toString(); // = "LngLat(-73.9749, 40.7736)"
         */
        toString() {
            return `LngLat(${this.lng}, ${this.lat})`;
        }
        /**
         * Returns the approximate distance between a pair of coordinates in meters
         * Uses the Haversine Formula (from R.W. Sinnott, "Virtues of the Haversine", Sky and Telescope, vol. 68, no. 2, 1984, p. 159)
         *
         * @param {LngLat} lngLat coordinates to compute the distance to
         * @returns {number} Distance in meters between the two coordinates.
         * @example
         * var new_york = new maplibregl.LngLat(-74.0060, 40.7128);
         * var los_angeles = new maplibregl.LngLat(-118.2437, 34.0522);
         * new_york.distanceTo(los_angeles); // = 3935751.690893987, "true distance" using a non-spherical approximation is ~3966km
         */
        distanceTo(lngLat) {
            const rad = Math.PI / 180;
            const lat1 = this.lat * rad;
            const lat2 = lngLat.lat * rad;
            const a = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos((lngLat.lng - this.lng) * rad);
            const maxMeters = earthRadius * Math.acos(Math.min(a, 1));
            return maxMeters;
        }
        /**
         * Returns a `LngLatBounds` from the coordinates extended by a given `radius`. The returned `LngLatBounds` completely contains the `radius`.
         *
         * @param {number} [radius=0] Distance in meters from the coordinates to extend the bounds.
         * @returns {LngLatBounds} A new `LngLatBounds` object representing the coordinates extended by the `radius`.
         * @example
         * var ll = new maplibregl.LngLat(-73.9749, 40.7736);
         * ll.toBounds(100).toArray(); // = [[-73.97501862141328, 40.77351016847229], [-73.97478137858673, 40.77368983152771]]
         */
        toBounds(radius = 0) {
            const earthCircumferenceInMetersAtEquator = 40075017;
            const latAccuracy = 360 * radius / earthCircumferenceInMetersAtEquator, lngAccuracy = latAccuracy / Math.cos((Math.PI / 180) * this.lat);
            return new LngLatBounds(new LngLat(this.lng - lngAccuracy, this.lat - latAccuracy), new LngLat(this.lng + lngAccuracy, this.lat + latAccuracy));
        }
        /**
         * Converts an array of two numbers or an object with `lng` and `lat` or `lon` and `lat` properties
         * to a `LngLat` object.
         *
         * If a `LngLat` object is passed in, the function returns it unchanged.
         *
         * @param {LngLatLike} input An array of two numbers or object to convert, or a `LngLat` object to return.
         * @returns {LngLat} A new `LngLat` object, if a conversion occurred, or the original `LngLat` object.
         * @example
         * var arr = [-73.9749, 40.7736];
         * var ll = maplibregl.LngLat.convert(arr);
         * ll;   // = LngLat {lng: -73.9749, lat: 40.7736}
         */
        static convert(input) {
            if (input instanceof LngLat) {
                return input;
            }
            if (Array.isArray(input) && (input.length === 2 || input.length === 3)) {
                return new LngLat(Number(input[0]), Number(input[1]));
            }
            if (!Array.isArray(input) && typeof input === 'object' && input !== null) {
                return new LngLat(
                // flow can't refine this to have one of lng or lat, so we have to cast to any
                Number('lng' in input ? input.lng : input.lon), Number(input.lat));
            }
            throw new Error('`LngLatLike` argument must be specified as a LngLat instance, an object {lng: <lng>, lat: <lat>}, an object {lon: <lng>, lat: <lat>}, or an array of [<lng>, <lat>]');
        }
    }
    var LngLat$1 = LngLat;

    /*
     * The average circumference of the world in meters.
     */
    const earthCircumfrence = 2 * Math.PI * earthRadius; // meters
    /*
     * The circumference at a line of latitude in meters.
     */
    function circumferenceAtLatitude(latitude) {
        return earthCircumfrence * Math.cos(latitude * Math.PI / 180);
    }
    function mercatorXfromLng(lng) {
        return (180 + lng) / 360;
    }
    function mercatorYfromLat(lat) {
        return (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)))) / 360;
    }
    function mercatorZfromAltitude(altitude, lat) {
        return altitude / circumferenceAtLatitude(lat);
    }
    function lngFromMercatorX(x) {
        return x * 360 - 180;
    }
    function latFromMercatorY(y) {
        const y2 = 180 - y * 360;
        return 360 / Math.PI * Math.atan(Math.exp(y2 * Math.PI / 180)) - 90;
    }
    function altitudeFromMercatorZ(z, y) {
        return z * circumferenceAtLatitude(latFromMercatorY(y));
    }
    /**
     * Determine the Mercator scale factor for a given latitude, see
     * https://en.wikipedia.org/wiki/Mercator_projection#Scale_factor
     *
     * At the equator the scale factor will be 1, which increases at higher latitudes.
     *
     * @param {number} lat Latitude
     * @returns {number} scale factor
     * @private
     */
    function mercatorScale(lat) {
        return 1 / Math.cos(lat * Math.PI / 180);
    }
    /**
     * A `MercatorCoordinate` object represents a projected three dimensional position.
     *
     * `MercatorCoordinate` uses the web mercator projection ([EPSG:3857](https://epsg.io/3857)) with slightly different units:
     * - the size of 1 unit is the width of the projected world instead of the "mercator meter"
     * - the origin of the coordinate space is at the north-west corner instead of the middle
     *
     * For example, `MercatorCoordinate(0, 0, 0)` is the north-west corner of the mercator world and
     * `MercatorCoordinate(1, 1, 0)` is the south-east corner. If you are familiar with
     * [vector tiles](https://github.com/mapbox/vector-tile-spec) it may be helpful to think
     * of the coordinate space as the `0/0/0` tile with an extent of `1`.
     *
     * The `z` dimension of `MercatorCoordinate` is conformal. A cube in the mercator coordinate space would be rendered as a cube.
     *
     * @param {number} x The x component of the position.
     * @param {number} y The y component of the position.
     * @param {number} z The z component of the position.
     * @example
     * var nullIsland = new maplibregl.MercatorCoordinate(0.5, 0.5, 0);
     *
     * @see [Add a custom style layer](https://maplibre.org/maplibre-gl-js-docs/example/custom-style-layer/)
     */
    class MercatorCoordinate {
        constructor(x, y, z = 0) {
            this.x = +x;
            this.y = +y;
            this.z = +z;
        }
        /**
         * Project a `LngLat` to a `MercatorCoordinate`.
         *
         * @param {LngLatLike} lngLatLike The location to project.
         * @param {number} altitude The altitude in meters of the position.
         * @returns {MercatorCoordinate} The projected mercator coordinate.
         * @example
         * var coord = maplibregl.MercatorCoordinate.fromLngLat({ lng: 0, lat: 0}, 0);
         * coord; // MercatorCoordinate(0.5, 0.5, 0)
         */
        static fromLngLat(lngLatLike, altitude = 0) {
            const lngLat = LngLat$1.convert(lngLatLike);
            return new MercatorCoordinate(mercatorXfromLng(lngLat.lng), mercatorYfromLat(lngLat.lat), mercatorZfromAltitude(altitude, lngLat.lat));
        }
        /**
         * Returns the `LngLat` for the coordinate.
         *
         * @returns {LngLat} The `LngLat` object.
         * @example
         * var coord = new maplibregl.MercatorCoordinate(0.5, 0.5, 0);
         * var lngLat = coord.toLngLat(); // LngLat(0, 0)
         */
        toLngLat() {
            return new LngLat$1(lngFromMercatorX(this.x), latFromMercatorY(this.y));
        }
        /**
         * Returns the altitude in meters of the coordinate.
         *
         * @returns {number} The altitude in meters.
         * @example
         * var coord = new maplibregl.MercatorCoordinate(0, 0, 0.02);
         * coord.toAltitude(); // 6914.281956295339
         */
        toAltitude() {
            return altitudeFromMercatorZ(this.z, this.y);
        }
        /**
         * Returns the distance of 1 meter in `MercatorCoordinate` units at this latitude.
         *
         * For coordinates in real world units using meters, this naturally provides the scale
         * to transform into `MercatorCoordinate`s.
         *
         * @returns {number} Distance of 1 meter in `MercatorCoordinate` units.
         */
        meterInMercatorCoordinateUnits() {
            // 1 meter / circumference at equator in meters * Mercator projection scale factor at this latitude
            return 1 / earthCircumfrence * mercatorScale(latFromMercatorY(this.y));
        }
    }

    class CanonicalTileID {
        constructor(z, x, y) {
            if (z < 0 || z > 25 || y < 0 || y >= Math.pow(2, z) || x < 0 || x >= Math.pow(2, z)) {
                throw new Error(`x=${x}, y=${y}, z=${z} outside of bounds. 0<=x<${Math.pow(2, z)}, 0<=y<${Math.pow(2, z)} 0<=z<=25 `);
            }
            this.z = z;
            this.x = x;
            this.y = y;
            this.key = calculateKey(0, z, z, x, y);
        }
        equals(id) {
            return this.z === id.z && this.x === id.x && this.y === id.y;
        }
        // given a list of urls, choose a url template and return a tile URL
        url(urls, pixelRatio, scheme) {
            const bbox = whootsJsExports.getTileBBox(this.x, this.y, this.z);
            const quadkey = getQuadkey(this.z, this.x, this.y);
            return urls[(this.x + this.y) % urls.length]
                .replace(/{prefix}/g, (this.x % 16).toString(16) + (this.y % 16).toString(16))
                .replace(/{z}/g, String(this.z))
                .replace(/{x}/g, String(this.x))
                .replace(/{y}/g, String(scheme === 'tms' ? (Math.pow(2, this.z) - this.y - 1) : this.y))
                .replace(/{ratio}/g, pixelRatio > 1 ? '@2x' : '')
                .replace(/{quadkey}/g, quadkey)
                .replace(/{bbox-epsg-3857}/g, bbox);
        }
        isChildOf(parent) {
            const dz = this.z - parent.z;
            return dz > 0 && parent.x === (this.x >> dz) && parent.y === (this.y >> dz);
        }
        getTilePoint(coord) {
            const tilesAtZoom = Math.pow(2, this.z);
            return new pointGeometry((coord.x * tilesAtZoom - this.x) * EXTENT, (coord.y * tilesAtZoom - this.y) * EXTENT);
        }
        toString() {
            return `${this.z}/${this.x}/${this.y}`;
        }
    }
    class UnwrappedTileID {
        constructor(wrap, canonical) {
            this.wrap = wrap;
            this.canonical = canonical;
            this.key = calculateKey(wrap, canonical.z, canonical.z, canonical.x, canonical.y);
        }
    }
    class OverscaledTileID {
        constructor(overscaledZ, wrap, z, x, y) {
            if (overscaledZ < z)
                throw new Error(`overscaledZ should be >= z; overscaledZ = ${overscaledZ}; z = ${z}`);
            this.overscaledZ = overscaledZ;
            this.wrap = wrap;
            this.canonical = new CanonicalTileID(z, +x, +y);
            this.key = calculateKey(wrap, overscaledZ, z, x, y);
        }
        clone() {
            return new OverscaledTileID(this.overscaledZ, this.wrap, this.canonical.z, this.canonical.x, this.canonical.y);
        }
        equals(id) {
            return this.overscaledZ === id.overscaledZ && this.wrap === id.wrap && this.canonical.equals(id.canonical);
        }
        scaledTo(targetZ) {
            if (targetZ > this.overscaledZ)
                throw new Error(`targetZ > this.overscaledZ; targetZ = ${targetZ}; overscaledZ = ${this.overscaledZ}`);
            const zDifference = this.canonical.z - targetZ;
            if (targetZ > this.canonical.z) {
                return new OverscaledTileID(targetZ, this.wrap, this.canonical.z, this.canonical.x, this.canonical.y);
            }
            else {
                return new OverscaledTileID(targetZ, this.wrap, targetZ, this.canonical.x >> zDifference, this.canonical.y >> zDifference);
            }
        }
        /*
         * calculateScaledKey is an optimization:
         * when withWrap == true, implements the same as this.scaledTo(z).key,
         * when withWrap == false, implements the same as this.scaledTo(z).wrapped().key.
         */
        calculateScaledKey(targetZ, withWrap) {
            if (targetZ > this.overscaledZ)
                throw new Error(`targetZ > this.overscaledZ; targetZ = ${targetZ}; overscaledZ = ${this.overscaledZ}`);
            const zDifference = this.canonical.z - targetZ;
            if (targetZ > this.canonical.z) {
                return calculateKey(this.wrap * +withWrap, targetZ, this.canonical.z, this.canonical.x, this.canonical.y);
            }
            else {
                return calculateKey(this.wrap * +withWrap, targetZ, targetZ, this.canonical.x >> zDifference, this.canonical.y >> zDifference);
            }
        }
        isChildOf(parent) {
            if (parent.wrap !== this.wrap) {
                // We can't be a child if we're in a different world copy
                return false;
            }
            const zDifference = this.canonical.z - parent.canonical.z;
            // We're first testing for z == 0, to avoid a 32 bit shift, which is undefined.
            return parent.overscaledZ === 0 || (parent.overscaledZ < this.overscaledZ &&
                parent.canonical.x === (this.canonical.x >> zDifference) &&
                parent.canonical.y === (this.canonical.y >> zDifference));
        }
        children(sourceMaxZoom) {
            if (this.overscaledZ >= sourceMaxZoom) {
                // return a single tile coord representing a an overscaled tile
                return [new OverscaledTileID(this.overscaledZ + 1, this.wrap, this.canonical.z, this.canonical.x, this.canonical.y)];
            }
            const z = this.canonical.z + 1;
            const x = this.canonical.x * 2;
            const y = this.canonical.y * 2;
            return [
                new OverscaledTileID(z, this.wrap, z, x, y),
                new OverscaledTileID(z, this.wrap, z, x + 1, y),
                new OverscaledTileID(z, this.wrap, z, x, y + 1),
                new OverscaledTileID(z, this.wrap, z, x + 1, y + 1)
            ];
        }
        isLessThan(rhs) {
            if (this.wrap < rhs.wrap)
                return true;
            if (this.wrap > rhs.wrap)
                return false;
            if (this.overscaledZ < rhs.overscaledZ)
                return true;
            if (this.overscaledZ > rhs.overscaledZ)
                return false;
            if (this.canonical.x < rhs.canonical.x)
                return true;
            if (this.canonical.x > rhs.canonical.x)
                return false;
            if (this.canonical.y < rhs.canonical.y)
                return true;
            return false;
        }
        wrapped() {
            return new OverscaledTileID(this.overscaledZ, 0, this.canonical.z, this.canonical.x, this.canonical.y);
        }
        unwrapTo(wrap) {
            return new OverscaledTileID(this.overscaledZ, wrap, this.canonical.z, this.canonical.x, this.canonical.y);
        }
        overscaleFactor() {
            return Math.pow(2, this.overscaledZ - this.canonical.z);
        }
        toUnwrapped() {
            return new UnwrappedTileID(this.wrap, this.canonical);
        }
        toString() {
            return `${this.overscaledZ}/${this.canonical.x}/${this.canonical.y}`;
        }
        getTilePoint(coord) {
            return this.canonical.getTilePoint(new MercatorCoordinate(coord.x - this.wrap, coord.y));
        }
    }
    function calculateKey(wrap, overscaledZ, z, x, y) {
        wrap *= 2;
        if (wrap < 0)
            wrap = wrap * -1 - 1;
        const dim = 1 << z;
        return (dim * dim * wrap + dim * y + x).toString(36) + z.toString(36) + overscaledZ.toString(36);
    }
    function getQuadkey(z, x, y) {
        let quadkey = '', mask;
        for (let i = z; i > 0; i--) {
            mask = 1 << (i - 1);
            quadkey += ((x & mask ? 1 : 0) + (y & mask ? 2 : 0));
        }
        return quadkey;
    }
    register('CanonicalTileID', CanonicalTileID);
    register('OverscaledTileID', OverscaledTileID, { omit: ['posMatrix'] });

    class WorkerTile {
        constructor(params) {
            this.tileID = new OverscaledTileID(params.tileID.overscaledZ, params.tileID.wrap, params.tileID.canonical.z, params.tileID.canonical.x, params.tileID.canonical.y);
            this.uid = params.uid;
            this.zoom = params.zoom;
            this.pixelRatio = params.pixelRatio;
            this.tileSize = params.tileSize;
            this.source = params.source;
            this.overscaling = this.tileID.overscaleFactor();
            this.showCollisionBoxes = params.showCollisionBoxes;
            this.collectResourceTiming = !!params.collectResourceTiming;
            this.returnDependencies = !!params.returnDependencies;
            this.promoteId = params.promoteId;
        }
        parse(data, layerIndex, availableImages, actor, callback) {
            this.status = 'parsing';
            this.data = data;
            this.collisionBoxArray = new CollisionBoxArray();
            const sourceLayerCoder = new DictionaryCoder(Object.keys(data.layers).sort());
            const featureIndex = new FeatureIndex(this.tileID, this.promoteId);
            featureIndex.bucketLayerIDs = [];
            const buckets = {};
            const options = {
                featureIndex,
                iconDependencies: {},
                patternDependencies: {},
                glyphDependencies: {},
                availableImages
            };
            const layerFamilies = layerIndex.familiesBySource[this.source];
            for (const sourceLayerId in layerFamilies) {
                const sourceLayer = data.layers[sourceLayerId];
                if (!sourceLayer) {
                    continue;
                }
                if (sourceLayer.version === 1) {
                    warnOnce(`Vector tile source "${this.source}" layer "${sourceLayerId}" ` +
                        'does not use vector tile spec v2 and therefore may have some rendering errors.');
                }
                const sourceLayerIndex = sourceLayerCoder.encode(sourceLayerId);
                const features = [];
                for (let index = 0; index < sourceLayer.length; index++) {
                    const feature = sourceLayer.feature(index);
                    const id = featureIndex.getId(feature, sourceLayerId);
                    features.push({ feature, id, index, sourceLayerIndex });
                }
                for (const family of layerFamilies[sourceLayerId]) {
                    const layer = family[0];
                    if (layer.source !== this.source) {
                        warnOnce(`layer.source = ${layer.source} does not equal this.source = ${this.source}`);
                    }
                    if (layer.minzoom && this.zoom < Math.floor(layer.minzoom))
                        continue;
                    if (layer.maxzoom && this.zoom >= layer.maxzoom)
                        continue;
                    if (layer.visibility === 'none')
                        continue;
                    recalculateLayers(family, this.zoom, availableImages);
                    const bucket = buckets[layer.id] = layer.createBucket({
                        index: featureIndex.bucketLayerIDs.length,
                        layers: family,
                        zoom: this.zoom,
                        pixelRatio: this.pixelRatio,
                        overscaling: this.overscaling,
                        collisionBoxArray: this.collisionBoxArray,
                        sourceLayerIndex,
                        sourceID: this.source
                    });
                    bucket.populate(features, options, this.tileID.canonical);
                    featureIndex.bucketLayerIDs.push(family.map((l) => l.id));
                }
            }
            let error;
            let glyphMap;
            let iconMap;
            let patternMap;
            const stacks = mapObject(options.glyphDependencies, (glyphs) => Object.keys(glyphs).map(Number));
            if (Object.keys(stacks).length) {
                actor.send('getGlyphs', { uid: this.uid, stacks, source: this.source, tileID: this.tileID, type: 'glyphs' }, (err, result) => {
                    if (!error) {
                        error = err;
                        glyphMap = result;
                        maybePrepare.call(this);
                    }
                });
            }
            else {
                glyphMap = {};
            }
            const icons = Object.keys(options.iconDependencies);
            if (icons.length) {
                actor.send('getImages', { icons, source: this.source, tileID: this.tileID, type: 'icons' }, (err, result) => {
                    if (!error) {
                        error = err;
                        iconMap = result;
                        maybePrepare.call(this);
                    }
                });
            }
            else {
                iconMap = {};
            }
            const patterns = Object.keys(options.patternDependencies);
            if (patterns.length) {
                actor.send('getImages', { icons: patterns, source: this.source, tileID: this.tileID, type: 'patterns' }, (err, result) => {
                    if (!error) {
                        error = err;
                        patternMap = result;
                        maybePrepare.call(this);
                    }
                });
            }
            else {
                patternMap = {};
            }
            maybePrepare.call(this);
            function maybePrepare() {
                if (error) {
                    return callback(error);
                }
                else if (glyphMap && iconMap && patternMap) {
                    const glyphAtlas = new GlyphAtlas(glyphMap);
                    const imageAtlas = new ImageAtlas(iconMap, patternMap);
                    for (const key in buckets) {
                        const bucket = buckets[key];
                        if (bucket instanceof SymbolBucket) {
                            recalculateLayers(bucket.layers, this.zoom, availableImages);
                            performSymbolLayout({
                                bucket,
                                glyphMap,
                                glyphPositions: glyphAtlas.positions,
                                imageMap: iconMap,
                                imagePositions: imageAtlas.iconPositions,
                                showCollisionBoxes: this.showCollisionBoxes,
                                canonical: this.tileID.canonical
                            });
                        }
                        else if (bucket.hasPattern &&
                            (bucket instanceof LineBucket ||
                                bucket instanceof FillBucket ||
                                bucket instanceof FillExtrusionBucket)) {
                            recalculateLayers(bucket.layers, this.zoom, availableImages);
                            bucket.addFeatures(options, this.tileID.canonical, imageAtlas.patternPositions);
                        }
                    }
                    this.status = 'done';
                    callback(null, {
                        buckets: Object.values(buckets).filter(b => !b.isEmpty()),
                        featureIndex,
                        collisionBoxArray: this.collisionBoxArray,
                        glyphAtlasImage: glyphAtlas.image,
                        imageAtlas,
                        // Only used for benchmarking:
                        glyphMap: this.returnDependencies ? glyphMap : null,
                        iconMap: this.returnDependencies ? iconMap : null,
                        glyphPositions: this.returnDependencies ? glyphAtlas.positions : null
                    });
                }
            }
        }
    }
    function recalculateLayers(layers, zoom, availableImages) {
        // Layers are shared and may have been used by a WorkerTile with a different zoom.
        const parameters = new EvaluationParameters(zoom);
        for (const layer of layers) {
            layer.recalculate(parameters, availableImages);
        }
    }

    var PerformanceMarkers;
    (function (PerformanceMarkers) {
        PerformanceMarkers["create"] = "create";
        PerformanceMarkers["load"] = "load";
        PerformanceMarkers["fullLoad"] = "fullLoad";
    })(PerformanceMarkers || (PerformanceMarkers = {}));
    /**
     * Safe wrapper for the performance resource timing API in web workers with graceful degradation
     *
     * @param {RequestParameters} request
     * @private
     */
    class RequestPerformance {
        constructor(request) {
            this._marks = {
                start: [request.url, 'start'].join('#'),
                end: [request.url, 'end'].join('#'),
                measure: request.url.toString()
            };
            performance.mark(this._marks.start);
        }
        finish() {
            performance.mark(this._marks.end);
            let resourceTimingData = performance.getEntriesByName(this._marks.measure);
            // fallback if web worker implementation of perf.getEntriesByName returns empty
            if (resourceTimingData.length === 0) {
                performance.measure(this._marks.measure, this._marks.start, this._marks.end);
                resourceTimingData = performance.getEntriesByName(this._marks.measure);
                // cleanup
                performance.clearMarks(this._marks.start);
                performance.clearMarks(this._marks.end);
                performance.clearMeasures(this._marks.measure);
            }
            return resourceTimingData;
        }
    }

    /**
     * @private
     */
    function loadVectorTile(params, callback) {
        const request = getArrayBuffer(params.request, (err, data, cacheControl, expires) => {
            if (err) {
                callback(err);
            }
            else if (data) {
                callback(null, {
                    vectorTile: new vectorTile.VectorTile(new pbf(data)),
                    rawData: data,
                    cacheControl,
                    expires
                });
            }
        });
        return () => {
            request.cancel();
            callback();
        };
    }
    /**
     * The {@link WorkerSource} implementation that supports {@link VectorTileSource}.
     * This class is designed to be easily reused to support custom source types
     * for data formats that can be parsed/converted into an in-memory VectorTile
     * representation.  To do so, create it with
     * `new VectorTileWorkerSource(actor, styleLayers, customLoadVectorDataFunction)`.
     *
     * @private
     */
    class VectorTileWorkerSource {
        /**
         * @param [loadVectorData] Optional method for custom loading of a VectorTile
         * object based on parameters passed from the main-thread Source. See
         * {@link VectorTileWorkerSource#loadTile}. The default implementation simply
         * loads the pbf at `params.url`.
         * @private
         */
        constructor(actor, layerIndex, availableImages, loadVectorData) {
            this.actor = actor;
            this.layerIndex = layerIndex;
            this.availableImages = availableImages;
            this.loadVectorData = loadVectorData || loadVectorTile;
            this.loading = {};
            this.loaded = {};
        }
        /**
         * Implements {@link WorkerSource#loadTile}. Delegates to
         * {@link VectorTileWorkerSource#loadVectorData} (which by default expects
         * a `params.url` property) for fetching and producing a VectorTile object.
         * @private
         */
        loadTile(params, callback) {
            const uid = params.uid;
            if (!this.loading)
                this.loading = {};
            const perf = (params && params.request && params.request.collectResourceTiming) ?
                new RequestPerformance(params.request) : false;
            const workerTile = this.loading[uid] = new WorkerTile(params);
            workerTile.abort = this.loadVectorData(params, (err, response) => {
                delete this.loading[uid];
                if (err || !response) {
                    workerTile.status = 'done';
                    this.loaded[uid] = workerTile;
                    return callback(err);
                }
                const rawTileData = response.rawData;
                const cacheControl = {};
                if (response.expires)
                    cacheControl.expires = response.expires;
                if (response.cacheControl)
                    cacheControl.cacheControl = response.cacheControl;
                const resourceTiming = {};
                if (perf) {
                    const resourceTimingData = perf.finish();
                    // it's necessary to eval the result of getEntriesByName() here via parse/stringify
                    // late evaluation in the main thread causes TypeError: illegal invocation
                    if (resourceTimingData)
                        resourceTiming.resourceTiming = JSON.parse(JSON.stringify(resourceTimingData));
                }
                workerTile.vectorTile = response.vectorTile;
                workerTile.parse(response.vectorTile, this.layerIndex, this.availableImages, this.actor, (err, result) => {
                    if (err || !result)
                        return callback(err);
                    // Transferring a copy of rawTileData because the worker needs to retain its copy.
                    callback(null, extend$1({ rawTileData: rawTileData.slice(0) }, result, cacheControl, resourceTiming));
                });
                this.loaded = this.loaded || {};
                this.loaded[uid] = workerTile;
            });
        }
        /**
         * Implements {@link WorkerSource#reloadTile}.
         * @private
         */
        reloadTile(params, callback) {
            const loaded = this.loaded, uid = params.uid, vtSource = this;
            if (loaded && loaded[uid]) {
                const workerTile = loaded[uid];
                workerTile.showCollisionBoxes = params.showCollisionBoxes;
                const done = (err, data) => {
                    const reloadCallback = workerTile.reloadCallback;
                    if (reloadCallback) {
                        delete workerTile.reloadCallback;
                        workerTile.parse(workerTile.vectorTile, vtSource.layerIndex, this.availableImages, vtSource.actor, reloadCallback);
                    }
                    callback(err, data);
                };
                if (workerTile.status === 'parsing') {
                    workerTile.reloadCallback = done;
                }
                else if (workerTile.status === 'done') {
                    // if there was no vector tile data on the initial load, don't try and re-parse tile
                    if (workerTile.vectorTile) {
                        workerTile.parse(workerTile.vectorTile, this.layerIndex, this.availableImages, this.actor, done);
                    }
                    else {
                        done();
                    }
                }
            }
        }
        /**
         * Implements {@link WorkerSource#abortTile}.
         *
         * @param params
         * @param params.uid The UID for this tile.
         * @private
         */
        abortTile(params, callback) {
            const loading = this.loading, uid = params.uid;
            if (loading && loading[uid] && loading[uid].abort) {
                loading[uid].abort();
                delete loading[uid];
            }
            callback();
        }
        /**
         * Implements {@link WorkerSource#removeTile}.
         *
         * @param params
         * @param params.uid The UID for this tile.
         * @private
         */
        removeTile(params, callback) {
            const loaded = this.loaded, uid = params.uid;
            if (loaded && loaded[uid]) {
                delete loaded[uid];
            }
            callback();
        }
    }

    // DEMData is a data structure for decoding, backfilling, and storing elevation data for processing in the hillshade shaders
    // data can be populated either from a pngraw image tile or from serliazed data sent back from a worker. When data is initially
    // loaded from a image tile, we decode the pixel values using the appropriate decoding formula, but we store the
    // elevation data as an Int32 value. we add 65536 (2^16) to eliminate negative values and enable the use of
    // integer overflow when creating the texture used in the hillshadePrepare step.
    // DEMData also handles the backfilling of data from a tile's neighboring tiles. This is necessary because we use a pixel's 8
    // surrounding pixel values to compute the slope at that pixel, and we cannot accurately calculate the slope at pixels on a
    // tile's edge without backfilling from neighboring tiles.
    class DEMData {
        // RGBAImage data has uniform 1px padding on all sides: square tile edge size defines stride
        // and dim is calculated as stride - 2.
        constructor(uid, data, encoding) {
            this.uid = uid;
            if (data.height !== data.width)
                throw new RangeError('DEM tiles must be square');
            if (encoding && encoding !== 'mapbox' && encoding !== 'terrarium') {
                warnOnce(`"${encoding}" is not a valid encoding type. Valid types include "mapbox" and "terrarium".`);
                return;
            }
            this.stride = data.height;
            const dim = this.dim = data.height - 2;
            this.data = new Uint32Array(data.data.buffer);
            this.encoding = encoding || 'mapbox';
            // in order to avoid flashing seams between tiles, here we are initially populating a 1px border of pixels around the image
            // with the data of the nearest pixel from the image. this data is eventually replaced when the tile's neighboring
            // tiles are loaded and the accurate data can be backfilled using DEMData#backfillBorder
            for (let x = 0; x < dim; x++) {
                // left vertical border
                this.data[this._idx(-1, x)] = this.data[this._idx(0, x)];
                // right vertical border
                this.data[this._idx(dim, x)] = this.data[this._idx(dim - 1, x)];
                // left horizontal border
                this.data[this._idx(x, -1)] = this.data[this._idx(x, 0)];
                // right horizontal border
                this.data[this._idx(x, dim)] = this.data[this._idx(x, dim - 1)];
            }
            // corners
            this.data[this._idx(-1, -1)] = this.data[this._idx(0, 0)];
            this.data[this._idx(dim, -1)] = this.data[this._idx(dim - 1, 0)];
            this.data[this._idx(-1, dim)] = this.data[this._idx(0, dim - 1)];
            this.data[this._idx(dim, dim)] = this.data[this._idx(dim - 1, dim - 1)];
            // calculate min/max values
            this.min = Number.MAX_SAFE_INTEGER;
            this.max = Number.MIN_SAFE_INTEGER;
            for (let x = 0; x < dim; x++) {
                for (let y = 0; y < dim; y++) {
                    const ele = this.get(x, y);
                    if (ele > this.max)
                        this.max = ele;
                    if (ele < this.min)
                        this.min = ele;
                }
            }
        }
        get(x, y) {
            const pixels = new Uint8Array(this.data.buffer);
            const index = this._idx(x, y) * 4;
            const unpack = this.encoding === 'terrarium' ? this._unpackTerrarium : this._unpackMapbox;
            return unpack(pixels[index], pixels[index + 1], pixels[index + 2]);
        }
        getUnpackVector() {
            return this.encoding === 'terrarium' ? [256.0, 1.0, 1.0 / 256.0, 32768.0] : [6553.6, 25.6, 0.1, 10000.0];
        }
        _idx(x, y) {
            if (x < -1 || x >= this.dim + 1 || y < -1 || y >= this.dim + 1)
                throw new RangeError('out of range source coordinates for DEM data');
            return (y + 1) * this.stride + (x + 1);
        }
        _unpackMapbox(r, g, b) {
            // unpacking formula for mapbox.terrain-rgb:
            // https://www.mapbox.com/help/access-elevation-data/#mapbox-terrain-rgb
            return ((r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0);
        }
        _unpackTerrarium(r, g, b) {
            // unpacking formula for mapzen terrarium:
            // https://aws.amazon.com/public-datasets/terrain/
            return ((r * 256 + g + b / 256) - 32768.0);
        }
        getPixels() {
            return new RGBAImage({ width: this.stride, height: this.stride }, new Uint8Array(this.data.buffer));
        }
        backfillBorder(borderTile, dx, dy) {
            if (this.dim !== borderTile.dim)
                throw new Error('dem dimension mismatch');
            let xMin = dx * this.dim, xMax = dx * this.dim + this.dim, yMin = dy * this.dim, yMax = dy * this.dim + this.dim;
            switch (dx) {
                case -1:
                    xMin = xMax - 1;
                    break;
                case 1:
                    xMax = xMin + 1;
                    break;
            }
            switch (dy) {
                case -1:
                    yMin = yMax - 1;
                    break;
                case 1:
                    yMax = yMin + 1;
                    break;
            }
            const ox = -dx * this.dim;
            const oy = -dy * this.dim;
            for (let y = yMin; y < yMax; y++) {
                for (let x = xMin; x < xMax; x++) {
                    this.data[this._idx(x, y)] = borderTile.data[this._idx(x + ox, y + oy)];
                }
            }
        }
    }
    register('DEMData', DEMData);

    class RasterDEMTileWorkerSource {
        constructor() {
            this.loaded = {};
        }
        loadTile(params, callback) {
            const { uid, encoding, rawImageData } = params;
            // Main thread will transfer ImageBitmap if offscreen decode with OffscreenCanvas is supported, else it will transfer an already decoded image.
            const imagePixels = isImageBitmap(rawImageData) ? this.getImageData(rawImageData) : rawImageData;
            const dem = new DEMData(uid, imagePixels, encoding);
            this.loaded = this.loaded || {};
            this.loaded[uid] = dem;
            callback(null, dem);
        }
        getImageData(imgBitmap) {
            // Lazily initialize OffscreenCanvas
            if (!this.offscreenCanvas || !this.offscreenCanvasContext) {
                // Dem tiles are typically 256x256
                this.offscreenCanvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
                this.offscreenCanvasContext = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
            }
            this.offscreenCanvas.width = imgBitmap.width;
            this.offscreenCanvas.height = imgBitmap.height;
            this.offscreenCanvasContext.drawImage(imgBitmap, 0, 0, imgBitmap.width, imgBitmap.height);
            // Insert an additional 1px padding around the image to allow backfilling for neighboring data.
            const imgData = this.offscreenCanvasContext.getImageData(-1, -1, imgBitmap.width + 2, imgBitmap.height + 2);
            this.offscreenCanvasContext.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
            return new RGBAImage({ width: imgData.width, height: imgData.height }, imgData.data);
        }
        removeTile(params) {
            const loaded = this.loaded, uid = params.uid;
            if (loaded && loaded[uid]) {
                delete loaded[uid];
            }
        }
    }

    var geojsonRewind = rewind;

    function rewind(gj, outer) {
        var type = gj && gj.type, i;

        if (type === 'FeatureCollection') {
            for (i = 0; i < gj.features.length; i++) rewind(gj.features[i], outer);

        } else if (type === 'GeometryCollection') {
            for (i = 0; i < gj.geometries.length; i++) rewind(gj.geometries[i], outer);

        } else if (type === 'Feature') {
            rewind(gj.geometry, outer);

        } else if (type === 'Polygon') {
            rewindRings(gj.coordinates, outer);

        } else if (type === 'MultiPolygon') {
            for (i = 0; i < gj.coordinates.length; i++) rewindRings(gj.coordinates[i], outer);
        }

        return gj;
    }

    function rewindRings(rings, outer) {
        if (rings.length === 0) return;

        rewindRing(rings[0], outer);
        for (var i = 1; i < rings.length; i++) {
            rewindRing(rings[i], !outer);
        }
    }

    function rewindRing(ring, dir) {
        var area = 0, err = 0;
        for (var i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
            var k = (ring[i][0] - ring[j][0]) * (ring[j][1] + ring[i][1]);
            var m = area + k;
            err += Math.abs(area) >= Math.abs(k) ? area - m + k : k - m + area;
            area = m;
        }
        if (area + err >= 0 !== !!dir) ring.reverse();
    }

    const toGeoJSON = vectorTile.VectorTileFeature.prototype.toGeoJSON;
    let FeatureWrapper$1 = class FeatureWrapper {
        constructor(feature) {
            this._feature = feature;
            this.extent = EXTENT;
            this.type = feature.type;
            this.properties = feature.tags;
            // If the feature has a top-level `id` property, copy it over, but only
            // if it can be coerced to an integer, because this wrapper is used for
            // serializing geojson feature data into vector tile PBF data, and the
            // vector tile spec only supports integer values for feature ids --
            // allowing non-integer values here results in a non-compliant PBF
            // that causes an exception when it is parsed with vector-tile-js
            if ('id' in feature && !isNaN(feature.id)) {
                this.id = parseInt(feature.id, 10);
            }
        }
        loadGeometry() {
            if (this._feature.type === 1) {
                const geometry = [];
                for (const point of this._feature.geometry) {
                    geometry.push([new pointGeometry(point[0], point[1])]);
                }
                return geometry;
            }
            else {
                const geometry = [];
                for (const ring of this._feature.geometry) {
                    const newRing = [];
                    for (const point of ring) {
                        newRing.push(new pointGeometry(point[0], point[1]));
                    }
                    geometry.push(newRing);
                }
                return geometry;
            }
        }
        toGeoJSON(x, y, z) {
            return toGeoJSON.call(this, x, y, z);
        }
    };
    let GeoJSONWrapper$2 = class GeoJSONWrapper {
        constructor(features) {
            this.layers = { '_geojsonTileLayer': this };
            this.name = '_geojsonTileLayer';
            this.extent = EXTENT;
            this.length = features.length;
            this._features = features;
        }
        feature(i) {
            return new FeatureWrapper$1(this._features[i]);
        }
    };

    var vtPbfExports = {};
    var vtPbf = {
      get exports(){ return vtPbfExports; },
      set exports(v){ vtPbfExports = v; },
    };

    var Point = pointGeometry;
    var VectorTileFeature = vectorTile.VectorTileFeature;

    var geojson_wrapper = GeoJSONWrapper$1;

    // conform to vectortile api
    function GeoJSONWrapper$1 (features, options) {
      this.options = options || {};
      this.features = features;
      this.length = features.length;
    }

    GeoJSONWrapper$1.prototype.feature = function (i) {
      return new FeatureWrapper(this.features[i], this.options.extent)
    };

    function FeatureWrapper (feature, extent) {
      this.id = typeof feature.id === 'number' ? feature.id : undefined;
      this.type = feature.type;
      this.rawGeometry = feature.type === 1 ? [feature.geometry] : feature.geometry;
      this.properties = feature.tags;
      this.extent = extent || 4096;
    }

    FeatureWrapper.prototype.loadGeometry = function () {
      var rings = this.rawGeometry;
      this.geometry = [];

      for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];
        var newRing = [];
        for (var j = 0; j < ring.length; j++) {
          newRing.push(new Point(ring[j][0], ring[j][1]));
        }
        this.geometry.push(newRing);
      }
      return this.geometry
    };

    FeatureWrapper.prototype.bbox = function () {
      if (!this.geometry) this.loadGeometry();

      var rings = this.geometry;
      var x1 = Infinity;
      var x2 = -Infinity;
      var y1 = Infinity;
      var y2 = -Infinity;

      for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];

        for (var j = 0; j < ring.length; j++) {
          var coord = ring[j];

          x1 = Math.min(x1, coord.x);
          x2 = Math.max(x2, coord.x);
          y1 = Math.min(y1, coord.y);
          y2 = Math.max(y2, coord.y);
        }
      }

      return [x1, y1, x2, y2]
    };

    FeatureWrapper.prototype.toGeoJSON = VectorTileFeature.prototype.toGeoJSON;

    var Pbf = pbf;
    var GeoJSONWrapper = geojson_wrapper;

    vtPbf.exports = fromVectorTileJs;
    vtPbfExports.fromVectorTileJs = fromVectorTileJs;
    vtPbfExports.fromGeojsonVt = fromGeojsonVt;
    vtPbfExports.GeoJSONWrapper = GeoJSONWrapper;

    /**
     * Serialize a vector-tile-js-created tile to pbf
     *
     * @param {Object} tile
     * @return {Buffer} uncompressed, pbf-serialized tile data
     */
    function fromVectorTileJs (tile) {
      var out = new Pbf();
      writeTile(tile, out);
      return out.finish()
    }

    /**
     * Serialized a geojson-vt-created tile to pbf.
     *
     * @param {Object} layers - An object mapping layer names to geojson-vt-created vector tile objects
     * @param {Object} [options] - An object specifying the vector-tile specification version and extent that were used to create `layers`.
     * @param {Number} [options.version=1] - Version of vector-tile spec used
     * @param {Number} [options.extent=4096] - Extent of the vector tile
     * @return {Buffer} uncompressed, pbf-serialized tile data
     */
    function fromGeojsonVt (layers, options) {
      options = options || {};
      var l = {};
      for (var k in layers) {
        l[k] = new GeoJSONWrapper(layers[k].features, options);
        l[k].name = k;
        l[k].version = options.version;
        l[k].extent = options.extent;
      }
      return fromVectorTileJs({ layers: l })
    }

    function writeTile (tile, pbf) {
      for (var key in tile.layers) {
        pbf.writeMessage(3, writeLayer, tile.layers[key]);
      }
    }

    function writeLayer (layer, pbf) {
      pbf.writeVarintField(15, layer.version || 1);
      pbf.writeStringField(1, layer.name || '');
      pbf.writeVarintField(5, layer.extent || 4096);

      var i;
      var context = {
        keys: [],
        values: [],
        keycache: {},
        valuecache: {}
      };

      for (i = 0; i < layer.length; i++) {
        context.feature = layer.feature(i);
        pbf.writeMessage(2, writeFeature, context);
      }

      var keys = context.keys;
      for (i = 0; i < keys.length; i++) {
        pbf.writeStringField(3, keys[i]);
      }

      var values = context.values;
      for (i = 0; i < values.length; i++) {
        pbf.writeMessage(4, writeValue, values[i]);
      }
    }

    function writeFeature (context, pbf) {
      var feature = context.feature;

      if (feature.id !== undefined) {
        pbf.writeVarintField(1, feature.id);
      }

      pbf.writeMessage(2, writeProperties, context);
      pbf.writeVarintField(3, feature.type);
      pbf.writeMessage(4, writeGeometry, feature);
    }

    function writeProperties (context, pbf) {
      var feature = context.feature;
      var keys = context.keys;
      var values = context.values;
      var keycache = context.keycache;
      var valuecache = context.valuecache;

      for (var key in feature.properties) {
        var value = feature.properties[key];

        var keyIndex = keycache[key];
        if (value === null) continue // don't encode null value properties

        if (typeof keyIndex === 'undefined') {
          keys.push(key);
          keyIndex = keys.length - 1;
          keycache[key] = keyIndex;
        }
        pbf.writeVarint(keyIndex);

        var type = typeof value;
        if (type !== 'string' && type !== 'boolean' && type !== 'number') {
          value = JSON.stringify(value);
        }
        var valueKey = type + ':' + value;
        var valueIndex = valuecache[valueKey];
        if (typeof valueIndex === 'undefined') {
          values.push(value);
          valueIndex = values.length - 1;
          valuecache[valueKey] = valueIndex;
        }
        pbf.writeVarint(valueIndex);
      }
    }

    function command (cmd, length) {
      return (length << 3) + (cmd & 0x7)
    }

    function zigzag (num) {
      return (num << 1) ^ (num >> 31)
    }

    function writeGeometry (feature, pbf) {
      var geometry = feature.loadGeometry();
      var type = feature.type;
      var x = 0;
      var y = 0;
      var rings = geometry.length;
      for (var r = 0; r < rings; r++) {
        var ring = geometry[r];
        var count = 1;
        if (type === 1) {
          count = ring.length;
        }
        pbf.writeVarint(command(1, count)); // moveto
        // do not write polygon closing path as lineto
        var lineCount = type === 3 ? ring.length - 1 : ring.length;
        for (var i = 0; i < lineCount; i++) {
          if (i === 1 && type !== 1) {
            pbf.writeVarint(command(2, lineCount - 1)); // lineto
          }
          var dx = ring[i].x - x;
          var dy = ring[i].y - y;
          pbf.writeVarint(zigzag(dx));
          pbf.writeVarint(zigzag(dy));
          x += dx;
          y += dy;
        }
        if (type === 3) {
          pbf.writeVarint(command(7, 1)); // closepath
        }
      }
    }

    function writeValue (value, pbf) {
      var type = typeof value;
      if (type === 'string') {
        pbf.writeStringField(1, value);
      } else if (type === 'boolean') {
        pbf.writeBooleanField(7, value);
      } else if (type === 'number') {
        if (value % 1 !== 0) {
          pbf.writeDoubleField(3, value);
        } else if (value < 0) {
          pbf.writeSVarintField(6, value);
        } else {
          pbf.writeVarintField(5, value);
        }
      }
    }

    function sortKD(ids, coords, nodeSize, left, right, depth) {
        if (right - left <= nodeSize) return;

        const m = (left + right) >> 1;

        select(ids, coords, m, left, right, depth % 2);

        sortKD(ids, coords, nodeSize, left, m - 1, depth + 1);
        sortKD(ids, coords, nodeSize, m + 1, right, depth + 1);
    }

    function select(ids, coords, k, left, right, inc) {

        while (right > left) {
            if (right - left > 600) {
                const n = right - left + 1;
                const m = k - left + 1;
                const z = Math.log(n);
                const s = 0.5 * Math.exp(2 * z / 3);
                const sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
                const newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
                const newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
                select(ids, coords, k, newLeft, newRight, inc);
            }

            const t = coords[2 * k + inc];
            let i = left;
            let j = right;

            swapItem(ids, coords, left, k);
            if (coords[2 * right + inc] > t) swapItem(ids, coords, left, right);

            while (i < j) {
                swapItem(ids, coords, i, j);
                i++;
                j--;
                while (coords[2 * i + inc] < t) i++;
                while (coords[2 * j + inc] > t) j--;
            }

            if (coords[2 * left + inc] === t) swapItem(ids, coords, left, j);
            else {
                j++;
                swapItem(ids, coords, j, right);
            }

            if (j <= k) left = j + 1;
            if (k <= j) right = j - 1;
        }
    }

    function swapItem(ids, coords, i, j) {
        swap(ids, i, j);
        swap(coords, 2 * i, 2 * j);
        swap(coords, 2 * i + 1, 2 * j + 1);
    }

    function swap(arr, i, j) {
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }

    function range(ids, coords, minX, minY, maxX, maxY, nodeSize) {
        const stack = [0, ids.length - 1, 0];
        const result = [];
        let x, y;

        while (stack.length) {
            const axis = stack.pop();
            const right = stack.pop();
            const left = stack.pop();

            if (right - left <= nodeSize) {
                for (let i = left; i <= right; i++) {
                    x = coords[2 * i];
                    y = coords[2 * i + 1];
                    if (x >= minX && x <= maxX && y >= minY && y <= maxY) result.push(ids[i]);
                }
                continue;
            }

            const m = Math.floor((left + right) / 2);

            x = coords[2 * m];
            y = coords[2 * m + 1];

            if (x >= minX && x <= maxX && y >= minY && y <= maxY) result.push(ids[m]);

            const nextAxis = (axis + 1) % 2;

            if (axis === 0 ? minX <= x : minY <= y) {
                stack.push(left);
                stack.push(m - 1);
                stack.push(nextAxis);
            }
            if (axis === 0 ? maxX >= x : maxY >= y) {
                stack.push(m + 1);
                stack.push(right);
                stack.push(nextAxis);
            }
        }

        return result;
    }

    function within(ids, coords, qx, qy, r, nodeSize) {
        const stack = [0, ids.length - 1, 0];
        const result = [];
        const r2 = r * r;

        while (stack.length) {
            const axis = stack.pop();
            const right = stack.pop();
            const left = stack.pop();

            if (right - left <= nodeSize) {
                for (let i = left; i <= right; i++) {
                    if (sqDist(coords[2 * i], coords[2 * i + 1], qx, qy) <= r2) result.push(ids[i]);
                }
                continue;
            }

            const m = Math.floor((left + right) / 2);

            const x = coords[2 * m];
            const y = coords[2 * m + 1];

            if (sqDist(x, y, qx, qy) <= r2) result.push(ids[m]);

            const nextAxis = (axis + 1) % 2;

            if (axis === 0 ? qx - r <= x : qy - r <= y) {
                stack.push(left);
                stack.push(m - 1);
                stack.push(nextAxis);
            }
            if (axis === 0 ? qx + r >= x : qy + r >= y) {
                stack.push(m + 1);
                stack.push(right);
                stack.push(nextAxis);
            }
        }

        return result;
    }

    function sqDist(ax, ay, bx, by) {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
    }

    const defaultGetX = p => p[0];
    const defaultGetY = p => p[1];

    class KDBush {
        constructor(points, getX = defaultGetX, getY = defaultGetY, nodeSize = 64, ArrayType = Float64Array) {
            this.nodeSize = nodeSize;
            this.points = points;

            const IndexArrayType = points.length < 65536 ? Uint16Array : Uint32Array;

            const ids = this.ids = new IndexArrayType(points.length);
            const coords = this.coords = new ArrayType(points.length * 2);

            for (let i = 0; i < points.length; i++) {
                ids[i] = i;
                coords[2 * i] = getX(points[i]);
                coords[2 * i + 1] = getY(points[i]);
            }

            sortKD(ids, coords, nodeSize, 0, ids.length - 1, 0);
        }

        range(minX, minY, maxX, maxY) {
            return range(this.ids, this.coords, minX, minY, maxX, maxY, this.nodeSize);
        }

        within(x, y, r) {
            return within(this.ids, this.coords, x, y, r, this.nodeSize);
        }
    }

    const defaultOptions = {
        minZoom: 0,   // min zoom to generate clusters on
        maxZoom: 16,  // max zoom level to cluster the points on
        minPoints: 2, // minimum points to form a cluster
        radius: 40,   // cluster radius in pixels
        extent: 512,  // tile extent (radius is calculated relative to it)
        nodeSize: 64, // size of the KD-tree leaf node, affects performance
        log: false,   // whether to log timing info

        // whether to generate numeric ids for input features (in vector tiles)
        generateId: false,

        // a reduce function for calculating custom cluster properties
        reduce: null, // (accumulated, props) => { accumulated.sum += props.sum; }

        // properties to use for individual points when running the reducer
        map: props => props // props => ({sum: props.my_value})
    };

    const fround = Math.fround || (tmp => ((x) => { tmp[0] = +x; return tmp[0]; }))(new Float32Array(1));

    class Supercluster {
        constructor(options) {
            this.options = extend(Object.create(defaultOptions), options);
            this.trees = new Array(this.options.maxZoom + 1);
        }

        load(points) {
            const {log, minZoom, maxZoom, nodeSize} = this.options;

            if (log) console.time('total time');

            const timerId = `prepare ${  points.length  } points`;
            if (log) console.time(timerId);

            this.points = points;

            // generate a cluster object for each point and index input points into a KD-tree
            let clusters = [];
            for (let i = 0; i < points.length; i++) {
                if (!points[i].geometry) continue;
                clusters.push(createPointCluster(points[i], i));
            }
            this.trees[maxZoom + 1] = new KDBush(clusters, getX, getY, nodeSize, Float32Array);

            if (log) console.timeEnd(timerId);

            // cluster points on max zoom, then cluster the results on previous zoom, etc.;
            // results in a cluster hierarchy across zoom levels
            for (let z = maxZoom; z >= minZoom; z--) {
                const now = +Date.now();

                // create a new set of clusters for the zoom and index them with a KD-tree
                clusters = this._cluster(clusters, z);
                this.trees[z] = new KDBush(clusters, getX, getY, nodeSize, Float32Array);

                if (log) console.log('z%d: %d clusters in %dms', z, clusters.length, +Date.now() - now);
            }

            if (log) console.timeEnd('total time');

            return this;
        }

        getClusters(bbox, zoom) {
            let minLng = ((bbox[0] + 180) % 360 + 360) % 360 - 180;
            const minLat = Math.max(-90, Math.min(90, bbox[1]));
            let maxLng = bbox[2] === 180 ? 180 : ((bbox[2] + 180) % 360 + 360) % 360 - 180;
            const maxLat = Math.max(-90, Math.min(90, bbox[3]));

            if (bbox[2] - bbox[0] >= 360) {
                minLng = -180;
                maxLng = 180;
            } else if (minLng > maxLng) {
                const easternHem = this.getClusters([minLng, minLat, 180, maxLat], zoom);
                const westernHem = this.getClusters([-180, minLat, maxLng, maxLat], zoom);
                return easternHem.concat(westernHem);
            }

            const tree = this.trees[this._limitZoom(zoom)];
            const ids = tree.range(lngX(minLng), latY(maxLat), lngX(maxLng), latY(minLat));
            const clusters = [];
            for (const id of ids) {
                const c = tree.points[id];
                clusters.push(c.numPoints ? getClusterJSON(c) : this.points[c.index]);
            }
            return clusters;
        }

        getChildren(clusterId) {
            const originId = this._getOriginId(clusterId);
            const originZoom = this._getOriginZoom(clusterId);
            const errorMsg = 'No cluster with the specified id.';

            const index = this.trees[originZoom];
            if (!index) throw new Error(errorMsg);

            const origin = index.points[originId];
            if (!origin) throw new Error(errorMsg);

            const r = this.options.radius / (this.options.extent * Math.pow(2, originZoom - 1));
            const ids = index.within(origin.x, origin.y, r);
            const children = [];
            for (const id of ids) {
                const c = index.points[id];
                if (c.parentId === clusterId) {
                    children.push(c.numPoints ? getClusterJSON(c) : this.points[c.index]);
                }
            }

            if (children.length === 0) throw new Error(errorMsg);

            return children;
        }

        getLeaves(clusterId, limit, offset) {
            limit = limit || 10;
            offset = offset || 0;

            const leaves = [];
            this._appendLeaves(leaves, clusterId, limit, offset, 0);

            return leaves;
        }

        getTile(z, x, y) {
            const tree = this.trees[this._limitZoom(z)];
            const z2 = Math.pow(2, z);
            const {extent, radius} = this.options;
            const p = radius / extent;
            const top = (y - p) / z2;
            const bottom = (y + 1 + p) / z2;

            const tile = {
                features: []
            };

            this._addTileFeatures(
                tree.range((x - p) / z2, top, (x + 1 + p) / z2, bottom),
                tree.points, x, y, z2, tile);

            if (x === 0) {
                this._addTileFeatures(
                    tree.range(1 - p / z2, top, 1, bottom),
                    tree.points, z2, y, z2, tile);
            }
            if (x === z2 - 1) {
                this._addTileFeatures(
                    tree.range(0, top, p / z2, bottom),
                    tree.points, -1, y, z2, tile);
            }

            return tile.features.length ? tile : null;
        }

        getClusterExpansionZoom(clusterId) {
            let expansionZoom = this._getOriginZoom(clusterId) - 1;
            while (expansionZoom <= this.options.maxZoom) {
                const children = this.getChildren(clusterId);
                expansionZoom++;
                if (children.length !== 1) break;
                clusterId = children[0].properties.cluster_id;
            }
            return expansionZoom;
        }

        _appendLeaves(result, clusterId, limit, offset, skipped) {
            const children = this.getChildren(clusterId);

            for (const child of children) {
                const props = child.properties;

                if (props && props.cluster) {
                    if (skipped + props.point_count <= offset) {
                        // skip the whole cluster
                        skipped += props.point_count;
                    } else {
                        // enter the cluster
                        skipped = this._appendLeaves(result, props.cluster_id, limit, offset, skipped);
                        // exit the cluster
                    }
                } else if (skipped < offset) {
                    // skip a single point
                    skipped++;
                } else {
                    // add a single point
                    result.push(child);
                }
                if (result.length === limit) break;
            }

            return skipped;
        }

        _addTileFeatures(ids, points, x, y, z2, tile) {
            for (const i of ids) {
                const c = points[i];
                const isCluster = c.numPoints;

                let tags, px, py;
                if (isCluster) {
                    tags = getClusterProperties(c);
                    px = c.x;
                    py = c.y;
                } else {
                    const p = this.points[c.index];
                    tags = p.properties;
                    px = lngX(p.geometry.coordinates[0]);
                    py = latY(p.geometry.coordinates[1]);
                }

                const f = {
                    type: 1,
                    geometry: [[
                        Math.round(this.options.extent * (px * z2 - x)),
                        Math.round(this.options.extent * (py * z2 - y))
                    ]],
                    tags
                };

                // assign id
                let id;
                if (isCluster) {
                    id = c.id;
                } else if (this.options.generateId) {
                    // optionally generate id
                    id = c.index;
                } else if (this.points[c.index].id) {
                    // keep id if already assigned
                    id = this.points[c.index].id;
                }

                if (id !== undefined) f.id = id;

                tile.features.push(f);
            }
        }

        _limitZoom(z) {
            return Math.max(this.options.minZoom, Math.min(Math.floor(+z), this.options.maxZoom + 1));
        }

        _cluster(points, zoom) {
            const clusters = [];
            const {radius, extent, reduce, minPoints} = this.options;
            const r = radius / (extent * Math.pow(2, zoom));

            // loop through each point
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                // if we've already visited the point at this zoom level, skip it
                if (p.zoom <= zoom) continue;
                p.zoom = zoom;

                // find all nearby points
                const tree = this.trees[zoom + 1];
                const neighborIds = tree.within(p.x, p.y, r);

                const numPointsOrigin = p.numPoints || 1;
                let numPoints = numPointsOrigin;

                // count the number of points in a potential cluster
                for (const neighborId of neighborIds) {
                    const b = tree.points[neighborId];
                    // filter out neighbors that are already processed
                    if (b.zoom > zoom) numPoints += b.numPoints || 1;
                }

                // if there were neighbors to merge, and there are enough points to form a cluster
                if (numPoints > numPointsOrigin && numPoints >= minPoints) {
                    let wx = p.x * numPointsOrigin;
                    let wy = p.y * numPointsOrigin;

                    let clusterProperties = reduce && numPointsOrigin > 1 ? this._map(p, true) : null;

                    // encode both zoom and point index on which the cluster originated -- offset by total length of features
                    const id = (i << 5) + (zoom + 1) + this.points.length;

                    for (const neighborId of neighborIds) {
                        const b = tree.points[neighborId];

                        if (b.zoom <= zoom) continue;
                        b.zoom = zoom; // save the zoom (so it doesn't get processed twice)

                        const numPoints2 = b.numPoints || 1;
                        wx += b.x * numPoints2; // accumulate coordinates for calculating weighted center
                        wy += b.y * numPoints2;

                        b.parentId = id;

                        if (reduce) {
                            if (!clusterProperties) clusterProperties = this._map(p, true);
                            reduce(clusterProperties, this._map(b));
                        }
                    }

                    p.parentId = id;
                    clusters.push(createCluster(wx / numPoints, wy / numPoints, id, numPoints, clusterProperties));

                } else { // left points as unclustered
                    clusters.push(p);

                    if (numPoints > 1) {
                        for (const neighborId of neighborIds) {
                            const b = tree.points[neighborId];
                            if (b.zoom <= zoom) continue;
                            b.zoom = zoom;
                            clusters.push(b);
                        }
                    }
                }
            }

            return clusters;
        }

        // get index of the point from which the cluster originated
        _getOriginId(clusterId) {
            return (clusterId - this.points.length) >> 5;
        }

        // get zoom of the point from which the cluster originated
        _getOriginZoom(clusterId) {
            return (clusterId - this.points.length) % 32;
        }

        _map(point, clone) {
            if (point.numPoints) {
                return clone ? extend({}, point.properties) : point.properties;
            }
            const original = this.points[point.index].properties;
            const result = this.options.map(original);
            return clone && result === original ? extend({}, result) : result;
        }
    }

    function createCluster(x, y, id, numPoints, properties) {
        return {
            x: fround(x), // weighted cluster center; round for consistency with Float32Array index
            y: fround(y),
            zoom: Infinity, // the last zoom the cluster was processed at
            id, // encodes index of the first child of the cluster and its zoom level
            parentId: -1, // parent cluster id
            numPoints,
            properties
        };
    }

    function createPointCluster(p, id) {
        const [x, y] = p.geometry.coordinates;
        return {
            x: fround(lngX(x)), // projected point coordinates
            y: fround(latY(y)),
            zoom: Infinity, // the last zoom the point was processed at
            index: id, // index of the source feature in the original input array,
            parentId: -1 // parent cluster id
        };
    }

    function getClusterJSON(cluster) {
        return {
            type: 'Feature',
            id: cluster.id,
            properties: getClusterProperties(cluster),
            geometry: {
                type: 'Point',
                coordinates: [xLng(cluster.x), yLat(cluster.y)]
            }
        };
    }

    function getClusterProperties(cluster) {
        const count = cluster.numPoints;
        const abbrev =
            count >= 10000 ? `${Math.round(count / 1000)  }k` :
            count >= 1000 ? `${Math.round(count / 100) / 10  }k` : count;
        return extend(extend({}, cluster.properties), {
            cluster: true,
            cluster_id: cluster.id,
            point_count: count,
            point_count_abbreviated: abbrev
        });
    }

    // longitude/latitude to spherical mercator in [0..1] range
    function lngX(lng) {
        return lng / 360 + 0.5;
    }
    function latY(lat) {
        const sin = Math.sin(lat * Math.PI / 180);
        const y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
        return y < 0 ? 0 : y > 1 ? 1 : y;
    }

    // spherical mercator to longitude/latitude
    function xLng(x) {
        return (x - 0.5) * 360;
    }
    function yLat(y) {
        const y2 = (180 - y * 360) * Math.PI / 180;
        return 360 * Math.atan(Math.exp(y2)) / Math.PI - 90;
    }

    function extend(dest, src) {
        for (const id in src) dest[id] = src[id];
        return dest;
    }

    function getX(p) {
        return p.x;
    }
    function getY(p) {
        return p.y;
    }

    var geojsonVtDevExports = {};
    var geojsonVtDev = {
      get exports(){ return geojsonVtDevExports; },
      set exports(v){ geojsonVtDevExports = v; },
    };

    (function (module, exports) {
    	(function (global, factory) {
    	module.exports = factory() ;
    	}(this, (function () {
    	// calculate simplification data using optimized Douglas-Peucker algorithm

    	function simplify(coords, first, last, sqTolerance) {
    	    var maxSqDist = sqTolerance;
    	    var mid = (last - first) >> 1;
    	    var minPosToMid = last - first;
    	    var index;

    	    var ax = coords[first];
    	    var ay = coords[first + 1];
    	    var bx = coords[last];
    	    var by = coords[last + 1];

    	    for (var i = first + 3; i < last; i += 3) {
    	        var d = getSqSegDist(coords[i], coords[i + 1], ax, ay, bx, by);

    	        if (d > maxSqDist) {
    	            index = i;
    	            maxSqDist = d;

    	        } else if (d === maxSqDist) {
    	            // a workaround to ensure we choose a pivot close to the middle of the list,
    	            // reducing recursion depth, for certain degenerate inputs
    	            // https://github.com/mapbox/geojson-vt/issues/104
    	            var posToMid = Math.abs(i - mid);
    	            if (posToMid < minPosToMid) {
    	                index = i;
    	                minPosToMid = posToMid;
    	            }
    	        }
    	    }

    	    if (maxSqDist > sqTolerance) {
    	        if (index - first > 3) simplify(coords, first, index, sqTolerance);
    	        coords[index + 2] = maxSqDist;
    	        if (last - index > 3) simplify(coords, index, last, sqTolerance);
    	    }
    	}

    	// square distance from a point to a segment
    	function getSqSegDist(px, py, x, y, bx, by) {

    	    var dx = bx - x;
    	    var dy = by - y;

    	    if (dx !== 0 || dy !== 0) {

    	        var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

    	        if (t > 1) {
    	            x = bx;
    	            y = by;

    	        } else if (t > 0) {
    	            x += dx * t;
    	            y += dy * t;
    	        }
    	    }

    	    dx = px - x;
    	    dy = py - y;

    	    return dx * dx + dy * dy;
    	}

    	function createFeature(id, type, geom, tags) {
    	    var feature = {
    	        id: typeof id === 'undefined' ? null : id,
    	        type: type,
    	        geometry: geom,
    	        tags: tags,
    	        minX: Infinity,
    	        minY: Infinity,
    	        maxX: -Infinity,
    	        maxY: -Infinity
    	    };
    	    calcBBox(feature);
    	    return feature;
    	}

    	function calcBBox(feature) {
    	    var geom = feature.geometry;
    	    var type = feature.type;

    	    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
    	        calcLineBBox(feature, geom);

    	    } else if (type === 'Polygon' || type === 'MultiLineString') {
    	        for (var i = 0; i < geom.length; i++) {
    	            calcLineBBox(feature, geom[i]);
    	        }

    	    } else if (type === 'MultiPolygon') {
    	        for (i = 0; i < geom.length; i++) {
    	            for (var j = 0; j < geom[i].length; j++) {
    	                calcLineBBox(feature, geom[i][j]);
    	            }
    	        }
    	    }
    	}

    	function calcLineBBox(feature, geom) {
    	    for (var i = 0; i < geom.length; i += 3) {
    	        feature.minX = Math.min(feature.minX, geom[i]);
    	        feature.minY = Math.min(feature.minY, geom[i + 1]);
    	        feature.maxX = Math.max(feature.maxX, geom[i]);
    	        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
    	    }
    	}

    	// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

    	function convert(data, options) {
    	    var features = [];
    	    if (data.type === 'FeatureCollection') {
    	        for (var i = 0; i < data.features.length; i++) {
    	            convertFeature(features, data.features[i], options, i);
    	        }

    	    } else if (data.type === 'Feature') {
    	        convertFeature(features, data, options);

    	    } else {
    	        // single geometry or a geometry collection
    	        convertFeature(features, {geometry: data}, options);
    	    }

    	    return features;
    	}

    	function convertFeature(features, geojson, options, index) {
    	    if (!geojson.geometry) return;

    	    var coords = geojson.geometry.coordinates;
    	    var type = geojson.geometry.type;
    	    var tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    	    var geometry = [];
    	    var id = geojson.id;
    	    if (options.promoteId) {
    	        id = geojson.properties[options.promoteId];
    	    } else if (options.generateId) {
    	        id = index || 0;
    	    }
    	    if (type === 'Point') {
    	        convertPoint(coords, geometry);

    	    } else if (type === 'MultiPoint') {
    	        for (var i = 0; i < coords.length; i++) {
    	            convertPoint(coords[i], geometry);
    	        }

    	    } else if (type === 'LineString') {
    	        convertLine(coords, geometry, tolerance, false);

    	    } else if (type === 'MultiLineString') {
    	        if (options.lineMetrics) {
    	            // explode into linestrings to be able to track metrics
    	            for (i = 0; i < coords.length; i++) {
    	                geometry = [];
    	                convertLine(coords[i], geometry, tolerance, false);
    	                features.push(createFeature(id, 'LineString', geometry, geojson.properties));
    	            }
    	            return;
    	        } else {
    	            convertLines(coords, geometry, tolerance, false);
    	        }

    	    } else if (type === 'Polygon') {
    	        convertLines(coords, geometry, tolerance, true);

    	    } else if (type === 'MultiPolygon') {
    	        for (i = 0; i < coords.length; i++) {
    	            var polygon = [];
    	            convertLines(coords[i], polygon, tolerance, true);
    	            geometry.push(polygon);
    	        }
    	    } else if (type === 'GeometryCollection') {
    	        for (i = 0; i < geojson.geometry.geometries.length; i++) {
    	            convertFeature(features, {
    	                id: id,
    	                geometry: geojson.geometry.geometries[i],
    	                properties: geojson.properties
    	            }, options, index);
    	        }
    	        return;
    	    } else {
    	        throw new Error('Input data is not a valid GeoJSON object.');
    	    }

    	    features.push(createFeature(id, type, geometry, geojson.properties));
    	}

    	function convertPoint(coords, out) {
    	    out.push(projectX(coords[0]));
    	    out.push(projectY(coords[1]));
    	    out.push(0);
    	}

    	function convertLine(ring, out, tolerance, isPolygon) {
    	    var x0, y0;
    	    var size = 0;

    	    for (var j = 0; j < ring.length; j++) {
    	        var x = projectX(ring[j][0]);
    	        var y = projectY(ring[j][1]);

    	        out.push(x);
    	        out.push(y);
    	        out.push(0);

    	        if (j > 0) {
    	            if (isPolygon) {
    	                size += (x0 * y - x * y0) / 2; // area
    	            } else {
    	                size += Math.sqrt(Math.pow(x - x0, 2) + Math.pow(y - y0, 2)); // length
    	            }
    	        }
    	        x0 = x;
    	        y0 = y;
    	    }

    	    var last = out.length - 3;
    	    out[2] = 1;
    	    simplify(out, 0, last, tolerance);
    	    out[last + 2] = 1;

    	    out.size = Math.abs(size);
    	    out.start = 0;
    	    out.end = out.size;
    	}

    	function convertLines(rings, out, tolerance, isPolygon) {
    	    for (var i = 0; i < rings.length; i++) {
    	        var geom = [];
    	        convertLine(rings[i], geom, tolerance, isPolygon);
    	        out.push(geom);
    	    }
    	}

    	function projectX(x) {
    	    return x / 360 + 0.5;
    	}

    	function projectY(y) {
    	    var sin = Math.sin(y * Math.PI / 180);
    	    var y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    	    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
    	}

    	/* clip features between two axis-parallel lines:
    	 *     |        |
    	 *  ___|___     |     /
    	 * /   |   \____|____/
    	 *     |        |
    	 */

    	function clip(features, scale, k1, k2, axis, minAll, maxAll, options) {

    	    k1 /= scale;
    	    k2 /= scale;

    	    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    	    else if (maxAll < k1 || minAll >= k2) return null; // trivial reject

    	    var clipped = [];

    	    for (var i = 0; i < features.length; i++) {

    	        var feature = features[i];
    	        var geometry = feature.geometry;
    	        var type = feature.type;

    	        var min = axis === 0 ? feature.minX : feature.minY;
    	        var max = axis === 0 ? feature.maxX : feature.maxY;

    	        if (min >= k1 && max < k2) { // trivial accept
    	            clipped.push(feature);
    	            continue;
    	        } else if (max < k1 || min >= k2) { // trivial reject
    	            continue;
    	        }

    	        var newGeometry = [];

    	        if (type === 'Point' || type === 'MultiPoint') {
    	            clipPoints(geometry, newGeometry, k1, k2, axis);

    	        } else if (type === 'LineString') {
    	            clipLine(geometry, newGeometry, k1, k2, axis, false, options.lineMetrics);

    	        } else if (type === 'MultiLineString') {
    	            clipLines(geometry, newGeometry, k1, k2, axis, false);

    	        } else if (type === 'Polygon') {
    	            clipLines(geometry, newGeometry, k1, k2, axis, true);

    	        } else if (type === 'MultiPolygon') {
    	            for (var j = 0; j < geometry.length; j++) {
    	                var polygon = [];
    	                clipLines(geometry[j], polygon, k1, k2, axis, true);
    	                if (polygon.length) {
    	                    newGeometry.push(polygon);
    	                }
    	            }
    	        }

    	        if (newGeometry.length) {
    	            if (options.lineMetrics && type === 'LineString') {
    	                for (j = 0; j < newGeometry.length; j++) {
    	                    clipped.push(createFeature(feature.id, type, newGeometry[j], feature.tags));
    	                }
    	                continue;
    	            }

    	            if (type === 'LineString' || type === 'MultiLineString') {
    	                if (newGeometry.length === 1) {
    	                    type = 'LineString';
    	                    newGeometry = newGeometry[0];
    	                } else {
    	                    type = 'MultiLineString';
    	                }
    	            }
    	            if (type === 'Point' || type === 'MultiPoint') {
    	                type = newGeometry.length === 3 ? 'Point' : 'MultiPoint';
    	            }

    	            clipped.push(createFeature(feature.id, type, newGeometry, feature.tags));
    	        }
    	    }

    	    return clipped.length ? clipped : null;
    	}

    	function clipPoints(geom, newGeom, k1, k2, axis) {
    	    for (var i = 0; i < geom.length; i += 3) {
    	        var a = geom[i + axis];

    	        if (a >= k1 && a <= k2) {
    	            newGeom.push(geom[i]);
    	            newGeom.push(geom[i + 1]);
    	            newGeom.push(geom[i + 2]);
    	        }
    	    }
    	}

    	function clipLine(geom, newGeom, k1, k2, axis, isPolygon, trackMetrics) {

    	    var slice = newSlice(geom);
    	    var intersect = axis === 0 ? intersectX : intersectY;
    	    var len = geom.start;
    	    var segLen, t;

    	    for (var i = 0; i < geom.length - 3; i += 3) {
    	        var ax = geom[i];
    	        var ay = geom[i + 1];
    	        var az = geom[i + 2];
    	        var bx = geom[i + 3];
    	        var by = geom[i + 4];
    	        var a = axis === 0 ? ax : ay;
    	        var b = axis === 0 ? bx : by;
    	        var exited = false;

    	        if (trackMetrics) segLen = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));

    	        if (a < k1) {
    	            // ---|-->  | (line enters the clip region from the left)
    	            if (b > k1) {
    	                t = intersect(slice, ax, ay, bx, by, k1);
    	                if (trackMetrics) slice.start = len + segLen * t;
    	            }
    	        } else if (a > k2) {
    	            // |  <--|--- (line enters the clip region from the right)
    	            if (b < k2) {
    	                t = intersect(slice, ax, ay, bx, by, k2);
    	                if (trackMetrics) slice.start = len + segLen * t;
    	            }
    	        } else {
    	            addPoint(slice, ax, ay, az);
    	        }
    	        if (b < k1 && a >= k1) {
    	            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
    	            t = intersect(slice, ax, ay, bx, by, k1);
    	            exited = true;
    	        }
    	        if (b > k2 && a <= k2) {
    	            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
    	            t = intersect(slice, ax, ay, bx, by, k2);
    	            exited = true;
    	        }

    	        if (!isPolygon && exited) {
    	            if (trackMetrics) slice.end = len + segLen * t;
    	            newGeom.push(slice);
    	            slice = newSlice(geom);
    	        }

    	        if (trackMetrics) len += segLen;
    	    }

    	    // add the last point
    	    var last = geom.length - 3;
    	    ax = geom[last];
    	    ay = geom[last + 1];
    	    az = geom[last + 2];
    	    a = axis === 0 ? ax : ay;
    	    if (a >= k1 && a <= k2) addPoint(slice, ax, ay, az);

    	    // close the polygon if its endpoints are not the same after clipping
    	    last = slice.length - 3;
    	    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
    	        addPoint(slice, slice[0], slice[1], slice[2]);
    	    }

    	    // add the final slice
    	    if (slice.length) {
    	        newGeom.push(slice);
    	    }
    	}

    	function newSlice(line) {
    	    var slice = [];
    	    slice.size = line.size;
    	    slice.start = line.start;
    	    slice.end = line.end;
    	    return slice;
    	}

    	function clipLines(geom, newGeom, k1, k2, axis, isPolygon) {
    	    for (var i = 0; i < geom.length; i++) {
    	        clipLine(geom[i], newGeom, k1, k2, axis, isPolygon, false);
    	    }
    	}

    	function addPoint(out, x, y, z) {
    	    out.push(x);
    	    out.push(y);
    	    out.push(z);
    	}

    	function intersectX(out, ax, ay, bx, by, x) {
    	    var t = (x - ax) / (bx - ax);
    	    out.push(x);
    	    out.push(ay + (by - ay) * t);
    	    out.push(1);
    	    return t;
    	}

    	function intersectY(out, ax, ay, bx, by, y) {
    	    var t = (y - ay) / (by - ay);
    	    out.push(ax + (bx - ax) * t);
    	    out.push(y);
    	    out.push(1);
    	    return t;
    	}

    	function wrap(features, options) {
    	    var buffer = options.buffer / options.extent;
    	    var merged = features;
    	    var left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2, options); // left world copy
    	    var right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2, options); // right world copy

    	    if (left || right) {
    	        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2, options) || []; // center world copy

    	        if (left) merged = shiftFeatureCoords(left, 1).concat(merged); // merge left into center
    	        if (right) merged = merged.concat(shiftFeatureCoords(right, -1)); // merge right into center
    	    }

    	    return merged;
    	}

    	function shiftFeatureCoords(features, offset) {
    	    var newFeatures = [];

    	    for (var i = 0; i < features.length; i++) {
    	        var feature = features[i],
    	            type = feature.type;

    	        var newGeometry;

    	        if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
    	            newGeometry = shiftCoords(feature.geometry, offset);

    	        } else if (type === 'MultiLineString' || type === 'Polygon') {
    	            newGeometry = [];
    	            for (var j = 0; j < feature.geometry.length; j++) {
    	                newGeometry.push(shiftCoords(feature.geometry[j], offset));
    	            }
    	        } else if (type === 'MultiPolygon') {
    	            newGeometry = [];
    	            for (j = 0; j < feature.geometry.length; j++) {
    	                var newPolygon = [];
    	                for (var k = 0; k < feature.geometry[j].length; k++) {
    	                    newPolygon.push(shiftCoords(feature.geometry[j][k], offset));
    	                }
    	                newGeometry.push(newPolygon);
    	            }
    	        }

    	        newFeatures.push(createFeature(feature.id, type, newGeometry, feature.tags));
    	    }

    	    return newFeatures;
    	}

    	function shiftCoords(points, offset) {
    	    var newPoints = [];
    	    newPoints.size = points.size;

    	    if (points.start !== undefined) {
    	        newPoints.start = points.start;
    	        newPoints.end = points.end;
    	    }

    	    for (var i = 0; i < points.length; i += 3) {
    	        newPoints.push(points[i] + offset, points[i + 1], points[i + 2]);
    	    }
    	    return newPoints;
    	}

    	// Transforms the coordinates of each feature in the given tile from
    	// mercator-projected space into (extent x extent) tile space.
    	function transformTile(tile, extent) {
    	    if (tile.transformed) return tile;

    	    var z2 = 1 << tile.z,
    	        tx = tile.x,
    	        ty = tile.y,
    	        i, j, k;

    	    for (i = 0; i < tile.features.length; i++) {
    	        var feature = tile.features[i],
    	            geom = feature.geometry,
    	            type = feature.type;

    	        feature.geometry = [];

    	        if (type === 1) {
    	            for (j = 0; j < geom.length; j += 2) {
    	                feature.geometry.push(transformPoint(geom[j], geom[j + 1], extent, z2, tx, ty));
    	            }
    	        } else {
    	            for (j = 0; j < geom.length; j++) {
    	                var ring = [];
    	                for (k = 0; k < geom[j].length; k += 2) {
    	                    ring.push(transformPoint(geom[j][k], geom[j][k + 1], extent, z2, tx, ty));
    	                }
    	                feature.geometry.push(ring);
    	            }
    	        }
    	    }

    	    tile.transformed = true;

    	    return tile;
    	}

    	function transformPoint(x, y, extent, z2, tx, ty) {
    	    return [
    	        Math.round(extent * (x * z2 - tx)),
    	        Math.round(extent * (y * z2 - ty))];
    	}

    	function createTile(features, z, tx, ty, options) {
    	    var tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    	    var tile = {
    	        features: [],
    	        numPoints: 0,
    	        numSimplified: 0,
    	        numFeatures: 0,
    	        source: null,
    	        x: tx,
    	        y: ty,
    	        z: z,
    	        transformed: false,
    	        minX: 2,
    	        minY: 1,
    	        maxX: -1,
    	        maxY: 0
    	    };
    	    for (var i = 0; i < features.length; i++) {
    	        tile.numFeatures++;
    	        addFeature(tile, features[i], tolerance, options);

    	        var minX = features[i].minX;
    	        var minY = features[i].minY;
    	        var maxX = features[i].maxX;
    	        var maxY = features[i].maxY;

    	        if (minX < tile.minX) tile.minX = minX;
    	        if (minY < tile.minY) tile.minY = minY;
    	        if (maxX > tile.maxX) tile.maxX = maxX;
    	        if (maxY > tile.maxY) tile.maxY = maxY;
    	    }
    	    return tile;
    	}

    	function addFeature(tile, feature, tolerance, options) {

    	    var geom = feature.geometry,
    	        type = feature.type,
    	        simplified = [];

    	    if (type === 'Point' || type === 'MultiPoint') {
    	        for (var i = 0; i < geom.length; i += 3) {
    	            simplified.push(geom[i]);
    	            simplified.push(geom[i + 1]);
    	            tile.numPoints++;
    	            tile.numSimplified++;
    	        }

    	    } else if (type === 'LineString') {
    	        addLine(simplified, geom, tile, tolerance, false, false);

    	    } else if (type === 'MultiLineString' || type === 'Polygon') {
    	        for (i = 0; i < geom.length; i++) {
    	            addLine(simplified, geom[i], tile, tolerance, type === 'Polygon', i === 0);
    	        }

    	    } else if (type === 'MultiPolygon') {

    	        for (var k = 0; k < geom.length; k++) {
    	            var polygon = geom[k];
    	            for (i = 0; i < polygon.length; i++) {
    	                addLine(simplified, polygon[i], tile, tolerance, true, i === 0);
    	            }
    	        }
    	    }

    	    if (simplified.length) {
    	        var tags = feature.tags || null;
    	        if (type === 'LineString' && options.lineMetrics) {
    	            tags = {};
    	            for (var key in feature.tags) tags[key] = feature.tags[key];
    	            tags['mapbox_clip_start'] = geom.start / geom.size;
    	            tags['mapbox_clip_end'] = geom.end / geom.size;
    	        }
    	        var tileFeature = {
    	            geometry: simplified,
    	            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
    	                type === 'LineString' || type === 'MultiLineString' ? 2 : 1,
    	            tags: tags
    	        };
    	        if (feature.id !== null) {
    	            tileFeature.id = feature.id;
    	        }
    	        tile.features.push(tileFeature);
    	    }
    	}

    	function addLine(result, geom, tile, tolerance, isPolygon, isOuter) {
    	    var sqTolerance = tolerance * tolerance;

    	    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
    	        tile.numPoints += geom.length / 3;
    	        return;
    	    }

    	    var ring = [];

    	    for (var i = 0; i < geom.length; i += 3) {
    	        if (tolerance === 0 || geom[i + 2] > sqTolerance) {
    	            tile.numSimplified++;
    	            ring.push(geom[i]);
    	            ring.push(geom[i + 1]);
    	        }
    	        tile.numPoints++;
    	    }

    	    if (isPolygon) rewind(ring, isOuter);

    	    result.push(ring);
    	}

    	function rewind(ring, clockwise) {
    	    var area = 0;
    	    for (var i = 0, len = ring.length, j = len - 2; i < len; j = i, i += 2) {
    	        area += (ring[i] - ring[j]) * (ring[i + 1] + ring[j + 1]);
    	    }
    	    if (area > 0 === clockwise) {
    	        for (i = 0, len = ring.length; i < len / 2; i += 2) {
    	            var x = ring[i];
    	            var y = ring[i + 1];
    	            ring[i] = ring[len - 2 - i];
    	            ring[i + 1] = ring[len - 1 - i];
    	            ring[len - 2 - i] = x;
    	            ring[len - 1 - i] = y;
    	        }
    	    }
    	}

    	function geojsonvt(data, options) {
    	    return new GeoJSONVT(data, options);
    	}

    	function GeoJSONVT(data, options) {
    	    options = this.options = extend(Object.create(this.options), options);

    	    var debug = options.debug;

    	    if (debug) console.time('preprocess data');

    	    if (options.maxZoom < 0 || options.maxZoom > 24) throw new Error('maxZoom should be in the 0-24 range');
    	    if (options.promoteId && options.generateId) throw new Error('promoteId and generateId cannot be used together.');

    	    var features = convert(data, options);

    	    this.tiles = {};
    	    this.tileCoords = [];

    	    if (debug) {
    	        console.timeEnd('preprocess data');
    	        console.log('index: maxZoom: %d, maxPoints: %d', options.indexMaxZoom, options.indexMaxPoints);
    	        console.time('generate tiles');
    	        this.stats = {};
    	        this.total = 0;
    	    }

    	    features = wrap(features, options);

    	    // start slicing from the top tile down
    	    if (features.length) this.splitTile(features, 0, 0, 0);

    	    if (debug) {
    	        if (features.length) console.log('features: %d, points: %d', this.tiles[0].numFeatures, this.tiles[0].numPoints);
    	        console.timeEnd('generate tiles');
    	        console.log('tiles generated:', this.total, JSON.stringify(this.stats));
    	    }
    	}

    	GeoJSONVT.prototype.options = {
    	    maxZoom: 14,            // max zoom to preserve detail on
    	    indexMaxZoom: 5,        // max zoom in the tile index
    	    indexMaxPoints: 100000, // max number of points per tile in the tile index
    	    tolerance: 3,           // simplification tolerance (higher means simpler)
    	    extent: 4096,           // tile extent
    	    buffer: 64,             // tile buffer on each side
    	    lineMetrics: false,     // whether to calculate line metrics
    	    promoteId: null,        // name of a feature property to be promoted to feature.id
    	    generateId: false,      // whether to generate feature ids. Cannot be used with promoteId
    	    debug: 0                // logging level (0, 1 or 2)
    	};

    	GeoJSONVT.prototype.splitTile = function (features, z, x, y, cz, cx, cy) {

    	    var stack = [features, z, x, y],
    	        options = this.options,
    	        debug = options.debug;

    	    // avoid recursion by using a processing queue
    	    while (stack.length) {
    	        y = stack.pop();
    	        x = stack.pop();
    	        z = stack.pop();
    	        features = stack.pop();

    	        var z2 = 1 << z,
    	            id = toID(z, x, y),
    	            tile = this.tiles[id];

    	        if (!tile) {
    	            if (debug > 1) console.time('creation');

    	            tile = this.tiles[id] = createTile(features, z, x, y, options);
    	            this.tileCoords.push({z: z, x: x, y: y});

    	            if (debug) {
    	                if (debug > 1) {
    	                    console.log('tile z%d-%d-%d (features: %d, points: %d, simplified: %d)',
    	                        z, x, y, tile.numFeatures, tile.numPoints, tile.numSimplified);
    	                    console.timeEnd('creation');
    	                }
    	                var key = 'z' + z;
    	                this.stats[key] = (this.stats[key] || 0) + 1;
    	                this.total++;
    	            }
    	        }

    	        // save reference to original geometry in tile so that we can drill down later if we stop now
    	        tile.source = features;

    	        // if it's the first-pass tiling
    	        if (!cz) {
    	            // stop tiling if we reached max zoom, or if the tile is too simple
    	            if (z === options.indexMaxZoom || tile.numPoints <= options.indexMaxPoints) continue;

    	        // if a drilldown to a specific tile
    	        } else {
    	            // stop tiling if we reached base zoom or our target tile zoom
    	            if (z === options.maxZoom || z === cz) continue;

    	            // stop tiling if it's not an ancestor of the target tile
    	            var m = 1 << (cz - z);
    	            if (x !== Math.floor(cx / m) || y !== Math.floor(cy / m)) continue;
    	        }

    	        // if we slice further down, no need to keep source geometry
    	        tile.source = null;

    	        if (features.length === 0) continue;

    	        if (debug > 1) console.time('clipping');

    	        // values we'll use for clipping
    	        var k1 = 0.5 * options.buffer / options.extent,
    	            k2 = 0.5 - k1,
    	            k3 = 0.5 + k1,
    	            k4 = 1 + k1,
    	            tl, bl, tr, br, left, right;

    	        tl = bl = tr = br = null;

    	        left  = clip(features, z2, x - k1, x + k3, 0, tile.minX, tile.maxX, options);
    	        right = clip(features, z2, x + k2, x + k4, 0, tile.minX, tile.maxX, options);
    	        features = null;

    	        if (left) {
    	            tl = clip(left, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
    	            bl = clip(left, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
    	            left = null;
    	        }

    	        if (right) {
    	            tr = clip(right, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
    	            br = clip(right, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
    	            right = null;
    	        }

    	        if (debug > 1) console.timeEnd('clipping');

    	        stack.push(tl || [], z + 1, x * 2,     y * 2);
    	        stack.push(bl || [], z + 1, x * 2,     y * 2 + 1);
    	        stack.push(tr || [], z + 1, x * 2 + 1, y * 2);
    	        stack.push(br || [], z + 1, x * 2 + 1, y * 2 + 1);
    	    }
    	};

    	GeoJSONVT.prototype.getTile = function (z, x, y) {
    	    var options = this.options,
    	        extent = options.extent,
    	        debug = options.debug;

    	    if (z < 0 || z > 24) return null;

    	    var z2 = 1 << z;
    	    x = ((x % z2) + z2) % z2; // wrap tile x coordinate

    	    var id = toID(z, x, y);
    	    if (this.tiles[id]) return transformTile(this.tiles[id], extent);

    	    if (debug > 1) console.log('drilling down to z%d-%d-%d', z, x, y);

    	    var z0 = z,
    	        x0 = x,
    	        y0 = y,
    	        parent;

    	    while (!parent && z0 > 0) {
    	        z0--;
    	        x0 = Math.floor(x0 / 2);
    	        y0 = Math.floor(y0 / 2);
    	        parent = this.tiles[toID(z0, x0, y0)];
    	    }

    	    if (!parent || !parent.source) return null;

    	    // if we found a parent tile containing the original geometry, we can drill down from it
    	    if (debug > 1) console.log('found parent tile z%d-%d-%d', z0, x0, y0);

    	    if (debug > 1) console.time('drilling down');
    	    this.splitTile(parent.source, z0, x0, y0, z, x, y);
    	    if (debug > 1) console.timeEnd('drilling down');

    	    return this.tiles[id] ? transformTile(this.tiles[id], extent) : null;
    	};

    	function toID(z, x, y) {
    	    return (((1 << z) * y + x) * 32) + z;
    	}

    	function extend(dest, src) {
    	    for (var i in src) dest[i] = src[i];
    	    return dest;
    	}

    	return geojsonvt;

    	})));
    } (geojsonVtDev));

    function getFeatureId(feature, promoteId) {
        return promoteId ? feature.properties[promoteId] : feature.id;
    }
    function isUpdateableGeoJSON(data, promoteId) {
        // null can be updated
        if (data == null) {
            return true;
        }
        // a single feature with an id can be updated, need to explicitly check against null because 0 is a valid feature id that is falsy
        if (data.type === 'Feature') {
            return getFeatureId(data, promoteId) != null;
        }
        // a feature collection can be updated if every feature has an id, and the ids are all unique
        // this prevents us from silently dropping features if ids get reused
        if (data.type === 'FeatureCollection') {
            const seenIds = new Set();
            for (const feature of data.features) {
                const id = getFeatureId(feature, promoteId);
                if (id == null) {
                    return false;
                }
                if (seenIds.has(id)) {
                    return false;
                }
                seenIds.add(id);
            }
            return true;
        }
        return false;
    }
    function toUpdateable(data, promoteId) {
        const result = new Map();
        if (data == null) ;
        else if (data.type === 'Feature') {
            result.set(getFeatureId(data, promoteId), data);
        }
        else {
            for (const feature of data.features) {
                result.set(getFeatureId(feature, promoteId), feature);
            }
        }
        return result;
    }
    // mutates updateable
    function applySourceDiff(updateable, diff, promoteId) {
        var _a, _b, _c, _d;
        if (diff.removeAll) {
            updateable.clear();
        }
        if (diff.remove) {
            for (const id of diff.remove) {
                updateable.delete(id);
            }
        }
        if (diff.add) {
            for (const feature of diff.add) {
                const id = getFeatureId(feature, promoteId);
                if (id != null) {
                    updateable.set(id, feature);
                }
            }
        }
        if (diff.update) {
            for (const update of diff.update) {
                let feature = updateable.get(update.id);
                if (feature == null) {
                    continue;
                }
                // be careful to clone the feature and/or properties objects to avoid mutating our input
                const cloneFeature = update.newGeometry || update.removeAllProperties;
                // note: removeAllProperties gives us a new properties object, so we can skip the clone step
                const cloneProperties = !update.removeAllProperties && (((_a = update.removeProperties) === null || _a === void 0 ? void 0 : _a.length) > 0 || ((_b = update.addOrUpdateProperties) === null || _b === void 0 ? void 0 : _b.length) > 0);
                if (cloneFeature || cloneProperties) {
                    feature = { ...feature };
                    updateable.set(update.id, feature);
                    if (cloneProperties) {
                        feature.properties = { ...feature.properties };
                    }
                }
                if (update.newGeometry) {
                    feature.geometry = update.newGeometry;
                }
                if (update.removeAllProperties) {
                    feature.properties = {};
                }
                else if (((_c = update.removeProperties) === null || _c === void 0 ? void 0 : _c.length) > 0) {
                    for (const prop of update.removeProperties) {
                        if (Object.prototype.hasOwnProperty.call(feature.properties, prop)) {
                            delete feature.properties[prop];
                        }
                    }
                }
                if (((_d = update.addOrUpdateProperties) === null || _d === void 0 ? void 0 : _d.length) > 0) {
                    for (const { key, value } of update.addOrUpdateProperties) {
                        feature.properties[key] = value;
                    }
                }
            }
        }
    }

    function loadGeoJSONTile(params, callback) {
        const canonical = params.tileID.canonical;
        if (!this._geoJSONIndex) {
            return callback(null, null); // we couldn't load the file
        }
        const geoJSONTile = this._geoJSONIndex.getTile(canonical.z, canonical.x, canonical.y);
        if (!geoJSONTile) {
            return callback(null, null); // nothing in the given tile
        }
        const geojsonWrapper = new GeoJSONWrapper$2(geoJSONTile.features);
        // Encode the geojson-vt tile into binary vector tile form.  This
        // is a convenience that allows `FeatureIndex` to operate the same way
        // across `VectorTileSource` and `GeoJSONSource` data.
        let pbf = vtPbfExports(geojsonWrapper);
        if (pbf.byteOffset !== 0 || pbf.byteLength !== pbf.buffer.byteLength) {
            // Compatibility with node Buffer (https://github.com/mapbox/pbf/issues/35)
            pbf = new Uint8Array(pbf);
        }
        callback(null, {
            vectorTile: geojsonWrapper,
            rawData: pbf.buffer
        });
    }
    /**
     * The {@link WorkerSource} implementation that supports {@link GeoJSONSource}.
     * This class is designed to be easily reused to support custom source types
     * for data formats that can be parsed/converted into an in-memory GeoJSON
     * representation.  To do so, create it with
     * `new GeoJSONWorkerSource(actor, layerIndex, customLoadGeoJSONFunction)`.
     * For a full example, see [mapbox-gl-topojson](https://github.com/developmentseed/mapbox-gl-topojson).
     *
     * @private
     */
    class GeoJSONWorkerSource extends VectorTileWorkerSource {
        /**
         * @param [loadGeoJSON] Optional method for custom loading/parsing of
         * GeoJSON based on parameters passed from the main-thread Source.
         * See {@link GeoJSONWorkerSource#loadGeoJSON}.
         * @private
         */
        constructor(actor, layerIndex, availableImages, loadGeoJSON) {
            super(actor, layerIndex, availableImages, loadGeoJSONTile);
            this._dataUpdateable = new Map();
            /**
             * Fetch and parse GeoJSON according to the given params.  Calls `callback`
             * with `(err, data)`, where `data` is a parsed GeoJSON object.
             *
             * GeoJSON is loaded and parsed from `params.url` if it exists, or else
             * expected as a literal (string or object) `params.data`.
             *
             * @param params
             * @param [params.url] A URL to the remote GeoJSON data.
             * @param [params.data] Literal GeoJSON data. Must be provided if `params.url` is not.
             * @returns {Cancelable} A Cancelable object.
             * @private
             */
            this.loadGeoJSON = (params, callback) => {
                const { promoteId } = params;
                // Because of same origin issues, urls must either include an explicit
                // origin or absolute path.
                // ie: /foo/bar.json or http://example.com/bar.json
                // but not ../foo/bar.json
                if (params.request) {
                    return getJSON(params.request, (error, data, cacheControl, expires) => {
                        this._dataUpdateable = isUpdateableGeoJSON(data, promoteId) ? toUpdateable(data, promoteId) : undefined;
                        callback(error, data, cacheControl, expires);
                    });
                }
                else if (typeof params.data === 'string') {
                    try {
                        const parsed = JSON.parse(params.data);
                        this._dataUpdateable = isUpdateableGeoJSON(parsed, promoteId) ? toUpdateable(parsed, promoteId) : undefined;
                        callback(null, parsed);
                    }
                    catch (e) {
                        callback(new Error(`Input data given to '${params.source}' is not a valid GeoJSON object.`));
                    }
                }
                else if (params.dataDiff) {
                    if (this._dataUpdateable) {
                        applySourceDiff(this._dataUpdateable, params.dataDiff, promoteId);
                        callback(null, { type: 'FeatureCollection', features: Array.from(this._dataUpdateable.values()) });
                    }
                    else {
                        callback(new Error(`Cannot update existing geojson data in ${params.source}`));
                    }
                }
                else {
                    callback(new Error(`Input data given to '${params.source}' is not a valid GeoJSON object.`));
                }
                return { cancel: () => { } };
            };
            if (loadGeoJSON) {
                this.loadGeoJSON = loadGeoJSON;
            }
        }
        /**
         * Fetches (if appropriate), parses, and index geojson data into tiles. This
         * preparatory method must be called before {@link GeoJSONWorkerSource#loadTile}
         * can correctly serve up tiles.
         *
         * Defers to {@link GeoJSONWorkerSource#loadGeoJSON} for the fetching/parsing,
         * expecting `callback(error, data)` to be called with either an error or a
         * parsed GeoJSON object.
         *
         * When a `loadData` request comes in while a previous one is being processed,
         * the previous one is aborted.
         *
         * @param params
         * @param callback
         * @private
         */
        loadData(params, callback) {
            var _a;
            (_a = this._pendingRequest) === null || _a === void 0 ? void 0 : _a.cancel();
            if (this._pendingCallback) {
                // Tell the foreground the previous call has been abandoned
                this._pendingCallback(null, { abandoned: true });
            }
            const perf = (params && params.request && params.request.collectResourceTiming) ?
                new RequestPerformance(params.request) : false;
            this._pendingCallback = callback;
            this._pendingRequest = this.loadGeoJSON(params, (err, data) => {
                delete this._pendingCallback;
                delete this._pendingRequest;
                if (err || !data) {
                    return callback(err);
                }
                else if (typeof data !== 'object') {
                    return callback(new Error(`Input data given to '${params.source}' is not a valid GeoJSON object.`));
                }
                else {
                    geojsonRewind(data, true);
                    try {
                        if (params.filter) {
                            const compiled = createExpression(params.filter, { type: 'boolean', 'property-type': 'data-driven', overridable: false, transition: false });
                            if (compiled.result === 'error')
                                throw new Error(compiled.value.map(err => `${err.key}: ${err.message}`).join(', '));
                            const features = data.features.filter(feature => compiled.value.evaluate({ zoom: 0 }, feature));
                            data = { type: 'FeatureCollection', features };
                        }
                        this._geoJSONIndex = params.cluster ?
                            new Supercluster(getSuperclusterOptions(params)).load(data.features) :
                            geojsonVtDevExports(data, params.geojsonVtOptions);
                    }
                    catch (err) {
                        return callback(err);
                    }
                    this.loaded = {};
                    const result = {};
                    if (perf) {
                        const resourceTimingData = perf.finish();
                        // it's necessary to eval the result of getEntriesByName() here via parse/stringify
                        // late evaluation in the main thread causes TypeError: illegal invocation
                        if (resourceTimingData) {
                            result.resourceTiming = {};
                            result.resourceTiming[params.source] = JSON.parse(JSON.stringify(resourceTimingData));
                        }
                    }
                    callback(null, result);
                }
            });
        }
        /**
        * Implements {@link WorkerSource#reloadTile}.
        *
        * If the tile is loaded, uses the implementation in VectorTileWorkerSource.
        * Otherwise, such as after a setData() call, we load the tile fresh.
        *
        * @param params
        * @param params.uid The UID for this tile.
        * @private
        */
        reloadTile(params, callback) {
            const loaded = this.loaded, uid = params.uid;
            if (loaded && loaded[uid]) {
                return super.reloadTile(params, callback);
            }
            else {
                return this.loadTile(params, callback);
            }
        }
        removeSource(params, callback) {
            if (this._pendingCallback) {
                // Don't leak callbacks
                this._pendingCallback(null, { abandoned: true });
            }
            callback();
        }
        getClusterExpansionZoom(params, callback) {
            try {
                callback(null, this._geoJSONIndex.getClusterExpansionZoom(params.clusterId));
            }
            catch (e) {
                callback(e);
            }
        }
        getClusterChildren(params, callback) {
            try {
                callback(null, this._geoJSONIndex.getChildren(params.clusterId));
            }
            catch (e) {
                callback(e);
            }
        }
        getClusterLeaves(params, callback) {
            try {
                callback(null, this._geoJSONIndex.getLeaves(params.clusterId, params.limit, params.offset));
            }
            catch (e) {
                callback(e);
            }
        }
    }
    function getSuperclusterOptions({ superclusterOptions, clusterProperties }) {
        if (!clusterProperties || !superclusterOptions)
            return superclusterOptions;
        const mapExpressions = {};
        const reduceExpressions = {};
        const globals = { accumulated: null, zoom: 0 };
        const feature = { properties: null };
        const propertyNames = Object.keys(clusterProperties);
        for (const key of propertyNames) {
            const [operator, mapExpression] = clusterProperties[key];
            const mapExpressionParsed = createExpression(mapExpression);
            const reduceExpressionParsed = createExpression(typeof operator === 'string' ? [operator, ['accumulated'], ['get', key]] : operator);
            mapExpressions[key] = mapExpressionParsed.value;
            reduceExpressions[key] = reduceExpressionParsed.value;
        }
        superclusterOptions.map = (pointProperties) => {
            feature.properties = pointProperties;
            const properties = {};
            for (const key of propertyNames) {
                properties[key] = mapExpressions[key].evaluate(globals, feature);
            }
            return properties;
        };
        superclusterOptions.reduce = (accumulated, clusterProperties) => {
            feature.properties = clusterProperties;
            for (const key of propertyNames) {
                globals.accumulated = accumulated[key];
                accumulated[key] = reduceExpressions[key].evaluate(globals, feature);
            }
        };
        return superclusterOptions;
    }

    /**
     * @private
     */
    class Worker {
        constructor(self) {
            this.self = self;
            this.actor = new Actor(self, this);
            this.layerIndexes = {};
            this.availableImages = {};
            this.workerSourceTypes = {
                vector: VectorTileWorkerSource,
                geojson: GeoJSONWorkerSource
            };
            // [mapId][sourceType][sourceName] => worker source instance
            this.workerSources = {};
            this.demWorkerSources = {};
            this.self.registerWorkerSource = (name, WorkerSource) => {
                if (this.workerSourceTypes[name]) {
                    throw new Error(`Worker source with name "${name}" already registered.`);
                }
                this.workerSourceTypes[name] = WorkerSource;
            };
            // This is invoked by the RTL text plugin when the download via the `importScripts` call has finished, and the code has been parsed.
            this.self.registerRTLTextPlugin = (rtlTextPlugin) => {
                if (plugin.isParsed()) {
                    throw new Error('RTL text plugin already registered.');
                }
                plugin['applyArabicShaping'] = rtlTextPlugin.applyArabicShaping;
                plugin['processBidirectionalText'] = rtlTextPlugin.processBidirectionalText;
                plugin['processStyledBidirectionalText'] = rtlTextPlugin.processStyledBidirectionalText;
            };
        }
        setReferrer(mapID, referrer) {
            this.referrer = referrer;
        }
        setImages(mapId, images, callback) {
            this.availableImages[mapId] = images;
            for (const workerSource in this.workerSources[mapId]) {
                const ws = this.workerSources[mapId][workerSource];
                for (const source in ws) {
                    ws[source].availableImages = images;
                }
            }
            callback();
        }
        setLayers(mapId, layers, callback) {
            this.getLayerIndex(mapId).replace(layers);
            callback();
        }
        updateLayers(mapId, params, callback) {
            this.getLayerIndex(mapId).update(params.layers, params.removedIds);
            callback();
        }
        loadTile(mapId, params, callback) {
            this.getWorkerSource(mapId, params.type, params.source).loadTile(params, callback);
        }
        loadDEMTile(mapId, params, callback) {
            this.getDEMWorkerSource(mapId, params.source).loadTile(params, callback);
        }
        reloadTile(mapId, params, callback) {
            this.getWorkerSource(mapId, params.type, params.source).reloadTile(params, callback);
        }
        abortTile(mapId, params, callback) {
            this.getWorkerSource(mapId, params.type, params.source).abortTile(params, callback);
        }
        removeTile(mapId, params, callback) {
            this.getWorkerSource(mapId, params.type, params.source).removeTile(params, callback);
        }
        removeDEMTile(mapId, params) {
            this.getDEMWorkerSource(mapId, params.source).removeTile(params);
        }
        removeSource(mapId, params, callback) {
            if (!this.workerSources[mapId] ||
                !this.workerSources[mapId][params.type] ||
                !this.workerSources[mapId][params.type][params.source]) {
                return;
            }
            const worker = this.workerSources[mapId][params.type][params.source];
            delete this.workerSources[mapId][params.type][params.source];
            if (worker.removeSource !== undefined) {
                worker.removeSource(params, callback);
            }
            else {
                callback();
            }
        }
        /**
         * Load a {@link WorkerSource} script at params.url.  The script is run
         * (using importScripts) with `registerWorkerSource` in scope, which is a
         * function taking `(name, workerSourceObject)`.
         *  @private
         */
        loadWorkerSource(map, params, callback) {
            try {
                this.self.importScripts(params.url);
                callback();
            }
            catch (e) {
                callback(e.toString());
            }
        }
        syncRTLPluginState(map, state, callback) {
            try {
                plugin.setState(state);
                const pluginURL = plugin.getPluginURL();
                if (plugin.isLoaded() &&
                    !plugin.isParsed() &&
                    pluginURL != null // Not possible when `isLoaded` is true, but keeps flow happy
                ) {
                    this.self.importScripts(pluginURL);
                    const complete = plugin.isParsed();
                    const error = complete ? undefined : new Error(`RTL Text Plugin failed to import scripts from ${pluginURL}`);
                    callback(error, complete);
                }
            }
            catch (e) {
                callback(e.toString());
            }
        }
        getAvailableImages(mapId) {
            let availableImages = this.availableImages[mapId];
            if (!availableImages) {
                availableImages = [];
            }
            return availableImages;
        }
        getLayerIndex(mapId) {
            let layerIndexes = this.layerIndexes[mapId];
            if (!layerIndexes) {
                layerIndexes = this.layerIndexes[mapId] = new StyleLayerIndex();
            }
            return layerIndexes;
        }
        getWorkerSource(mapId, type, source) {
            if (!this.workerSources[mapId])
                this.workerSources[mapId] = {};
            if (!this.workerSources[mapId][type])
                this.workerSources[mapId][type] = {};
            if (!this.workerSources[mapId][type][source]) {
                // use a wrapped actor so that we can attach a target mapId param
                // to any messages invoked by the WorkerSource
                const actor = {
                    send: (type, data, callback) => {
                        this.actor.send(type, data, callback, mapId);
                    }
                };
                this.workerSources[mapId][type][source] = new this.workerSourceTypes[type](actor, this.getLayerIndex(mapId), this.getAvailableImages(mapId));
            }
            return this.workerSources[mapId][type][source];
        }
        getDEMWorkerSource(mapId, source) {
            if (!this.demWorkerSources[mapId])
                this.demWorkerSources[mapId] = {};
            if (!this.demWorkerSources[mapId][source]) {
                this.demWorkerSources[mapId][source] = new RasterDEMTileWorkerSource();
            }
            return this.demWorkerSources[mapId][source];
        }
        enforceCacheSizeLimit(mapId, limit) {
            enforceCacheSizeLimit(limit);
        }
    }
    if (isWorker()) {
        self.worker = new Worker(self);
    }

    return Worker;

})();
//# sourceMappingURL=worker.js.map
