import type {StyleSpecification} from '@maplibre/maplibre-gl-style-spec/types.g';

export default function fetchStyle(value: string | StyleSpecification): Promise<StyleSpecification> {
    return typeof value === 'string' ?
        fetch(value).then(response => response.json()) :
        Promise.resolve(value);
}
