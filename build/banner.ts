import packageJSON from '../package.json' assert {type: 'json'};

const version = packageJSON.version;
export default `/* MapLibre GL JS is licensed under the 3-Clause BSD License. Full text of license: https://github.com/maplibre/maplibre-gl-js/blob/v${version}/LICENSE.txt */`;
