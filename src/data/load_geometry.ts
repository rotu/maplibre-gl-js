import {warnOnce, clamp} from '../util/util';

import EXTENT from './extent';

import {Point} from "#src/geo/point";
import type {VectorTileFeature} from '@mapbox/vector-tile';

// These bounds define the minimum and maximum supported coordinate values.
// While visible coordinates are within [0, EXTENT], tiles may theoretically
// contain coordinates within [-Infinity, Infinity]. Our range is limited by the
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
export default function loadGeometry(feature: VectorTileFeature): Array<Array<Point>> {
    const scale = EXTENT / feature.extent;
    const geometry = feature.loadGeometry();

    // round a given point and convert from @mapbox/point-geometry Point object to local Point object.
    function convertPoint(point) {
        // round here because mapbox-gl-native uses integers to represent
        // points and we need to do the same to avoid renering differences.
        let x = clamp(Math.round(point.x * scale), MIN, MAX)
        let y = clamp(Math.round(point.y * scale), MIN, MAX)
        if (x < point.x || x > point.x + 1 || y < point.y || y > point.y + 1) {
            // warn when exceeding allowed extent except for the 1-px-off case
            // https://github.com/mapbox/mapbox-gl-js/issues/8992
            warnOnce('Geometry exceeds allowed extent, reduce your vector tile buffer size');
        }
        return new Point(x, y)
    }

    return geometry.map(ar=>ar.map(convertPoint));
}
