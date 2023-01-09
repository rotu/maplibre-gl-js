import {readdir} from 'fs/promises';

describe('@maplibre/maplibre-gl-style-spec npm package', () => {
    test('files build', async () => {
        expect(await readdir('dist/style-spec')).toMatchInlineSnapshot(`
[
  "index.cjs",
  "index.cjs.map",
  "index.mjs",
  "index.mjs.map",
]
`);
    });

    test('exports components directly, not behind `default` - https://github.com/mapbox/mapbox-gl-js/issues/6601', async  () => {
        // eslint-disable-next-line import/no-relative-packages
        expect(await import('../../dist/style-spec/index.cjs')).toHaveProperty('validate');
    });
});
