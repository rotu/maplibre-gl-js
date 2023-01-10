import Benchmark from '../lib/benchmark';

import createFilter from '@maplibre/maplibre-gl-style-spec/feature_filter/feature_filter';
import filters from '../data/filters.json' assert {type: 'json'};

export default class FilterCreate extends Benchmark {
    bench() {
        for (const filter of filters) {
            createFilter(filter.filter);
        }
    }
}
