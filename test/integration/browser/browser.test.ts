import pw, {BrowserType, chromium, firefox, webkit} from 'playwright';
import st from 'st';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
expect.extend({toMatchImageSnapshot});
declare global {
    namespace jest {
        interface Matchers<R> {
            toMatchImageSnapshot(): R;
        }
    }
}

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const browserTypes = [{
    name: 'Chromium', browserType: pw.chromium
}, {
    name: 'Firefox', browserType: pw.firefox
}, {
    name: 'WebKit', browserType: pw.webkit
}];

describe.each(browserTypes)('browser = $name', ({browserType}) => {
    describe('browser tests', () => {
        let port: number;
        let browser;
        let server;
        let page;
        let map;
        let canvas;

        // const thisDir = path.resolve(import.meta.url);
        // start server
        beforeAll(async () => {
            port = await new Promise((resolve) => {
                server = http.createServer(
                    st(projectRoot)
                ).listen(() => {
                    resolve(server.address().port);
                });
            });
            browser = await browserType.launch();

        });

        afterAll(async () => {
            await Promise.allSettled([
                new Promise((resolve) => server.close(resolve)),
                () => browser?.close()]);

        });

        beforeEach(async () => {
            page = await browser.newPage({});
            await page.goto(`http://localhost:${port}/test/integration/browser/fixtures/land.html`);
            canvas = await page.evaluateHandle(() => new Promise((resolve, reject) => {
                setTimeout(reject, 1000);
                if (map.loaded()) {
                    resolve(map.getCanvas());
                } else {
                    map.once('load', () => resolve(map.getCanvas()));
                }
            }));
        });

        test('Drag to the left', async () => {
            const canvasBB = await canvas.boundingBox();

            // Perform drag action, wait a bit the end to avoid the momentum mode.
            await page.mouse.move(canvasBB.x, canvasBB.y);
            await page.mouse.down();
            await page.mouse.move(100, 0);
            await new Promise(r => setTimeout(r, 200));
            await page.mouse.up();

            const center = await page.evaluate(() => {
                return map.getCenter();
            });

            expect(center.lng).toBeCloseTo(-35.15625, 4);
            expect(center.lat).toBeCloseTo(0, 7);
            expect(await page.screenshot()).toMatchImageSnapshot();
        }, 20000);

        test('Zoom: Double click at the center', async () => {
            expect(await page.screenshot()).toMatchImageSnapshot();

            const canvasBB = await canvas.boundingBox();

            await page.mouse.dblclick(canvasBB.x, canvasBB.y);

            // Wait until the map has settled, then report the zoom level back.
            const zoom = await page.evaluate(() => {
                return new Promise((resolve, _reject) => {
                    map.once('idle', () => resolve(map.getZoom()));
                });
            });

            expect(zoom).toBe(2);
            expect(await page.screenshot()).toMatchImageSnapshot();

        }, 20000);

        test('CJK Characters', async () => {
            await page.evaluate(() => {
                map.setStyle({
                    version: 8,
                    glyphs: 'https://mierune.github.io/fonts/{fontstack}/{range}.pbf',
                    sources: {
                        sample: {
                            type: 'geojson',
                            data: {
                                type: 'Feature',
                                geometry: {
                                    type: 'Point',
                                    coordinates: [0, 0]
                                },
                                properties: {
                                    'name_en': 'abcde',
                                    'name_ja': 'あいうえお',
                                    'name_ch': '阿衣乌唉哦',
                                    'name_kr': '아이우'
                                }
                            }
                        },
                    },
                    'layers': [
                        {
                            'id': 'sample-text-left',
                            'type': 'symbol',
                            'source': 'sample',
                            'layout': {
                                'text-anchor': 'top',
                                'text-field': '{name_ja}{name_en}',
                                'text-font': ['Open Sans Regular'],
                                'text-offset': [-10, 0],
                            }
                        },
                        {
                            'id': 'sample-text-center',
                            'type': 'symbol',
                            'source': 'sample',
                            'layout': {
                                'text-anchor': 'top',
                                'text-field': '{name_ch}{name_kr}',
                                'text-font': ['Open Sans Regular'],
                                'text-offset': [0, 0],
                            }
                        },
                        {
                            'id': 'sample-text-right',
                            'type': 'symbol',
                            'source': 'sample',
                            'layout': {
                                'text-anchor': 'top',
                                'text-field': '{name_en}{name_ja}',
                                'text-font': ['Open Sans Regular'],
                                'text-offset': [10, 0],
                            }
                        },
                    ]
                });
                return new Promise((resolve, _) => {
                    map.once('idle', resolve);
                });
            });
            expect(await page.screenshot()).toMatchImageSnapshot();
        });
    });

});
