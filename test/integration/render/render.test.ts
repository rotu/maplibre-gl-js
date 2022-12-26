import {assert, afterAll, beforeAll, describe, test} from 'vitest';
import {preview, createServer} from 'vite';
import type {PreviewServer, ViteDevServer} from 'vite';
import {JSHandle, chromium} from 'playwright';
import type {Browser, Page} from 'playwright';
import {createRequire} from 'module';

import path, {dirname} from 'path';
import fs from 'fs';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';
import {fileURLToPath} from 'url';
import glob from 'glob';
import nise, {FakeXMLHttpRequest} from 'nise';
import rtlText from '@mapbox/mapbox-gl-rtl-text';
import localizeURLs from '../lib/localize-urls';
// import maplibregl from '../../../src/index';
import browser from '../../../src/util/browser';
import * as rtlTextPluginModule from '../../../src/source/rtl_text_plugin';
import {StyleWithTestData, TestData} from './render_test_case';
import {runTestDataInBrowser} from './browser_test_driver';

// import CanvasSource from '../../../src/source/canvas_source';
// import customLayerImplementations from './custom_layer_implementations';
// import type Map from '../../../src/ui/map';
// import type {PointLike} from '../../../src/ui/camera';
// import DOM from '../../../src/util/dom';
// import {strict} from 'assert';

const {fakeXhr} = nise;
const {plugin: rtlTextPlugin} = rtlTextPluginModule;

const thisDir = fileURLToPath(new URL('.', import.meta.url));

rtlTextPlugin['applyArabicShaping'] = rtlText.applyArabicShaping;
rtlTextPlugin['processBidirectionalText'] = rtlText.processBidirectionalText;
rtlTextPlugin['processStyledBidirectionalText'] = rtlText.processStyledBidirectionalText;

const now = 0;

type RenderOptions = {
    tests: any[];
    recycleMap: boolean;
    report: boolean;
    seed: string;
}

// https://stackoverflow.com/a/1349426/229714
function makeHash(): string {
    const array = [];
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < 10; ++i)
        array.push(possible.charAt(Math.floor(Math.random() * possible.length)));

    // join array elements without commas.
    return array.join('');
}

function checkParameter(options: RenderOptions, param: string): boolean {
    const index = options.tests.indexOf(param);
    if (index === -1)
        return false;
    options.tests.splice(index, 1);
    return true;
}

function checkValueParameter(options: RenderOptions, defaultValue: any, param: string) {
    const index = options.tests.findIndex((elem) => { return String(elem).startsWith(param); });
    if (index === -1)
        return defaultValue;

    const split = String(options.tests.splice(index, 1)).split('=');
    if (split.length !== 2)
        return defaultValue;

    return split[1];
}
/**
 * Compares the Unit8Array that was created to the expected file in the file system.
 * It updates testData with the results.
 *
 * @param directory The base directory of the data
 * @param testData The test data
 * @param data The actual image data to compare the expected to
 * @returns nothing as it updates the testData object
 */
function compareRenderResults(directory: string, testData: TestData, data: Uint8Array) {
    let stats;
    const dir = path.join(directory, testData.id);
    try {
        // @ts-ignore
        stats = fs.statSync(dir, fs.R_OK | fs.W_OK);
        if (!stats.isDirectory()) throw new Error();
    } catch (e) {
        fs.mkdirSync(dir);
    }

    const expectedPath = path.join(dir, 'expected.png');
    const actualPath = path.join(dir, 'actual.png');
    const diffPath = path.join(dir, 'diff.png');

    const width = Math.floor(testData.width * testData.pixelRatio);
    const height = Math.floor(testData.height * testData.pixelRatio);
    const actualImg = new PNG({width, height});

    // PNG data must be unassociated (not premultiplied)
    for (let i = 0; i < data.length; i++) {
        const a = data[i * 4 + 3] / 255;
        if (a !== 0) {
            data[i * 4 + 0] /= a;
            data[i * 4 + 1] /= a;
            data[i * 4 + 2] /= a;
        }
    }
    actualImg.data = data as any;

    // there may be multiple expected images, covering different platforms
    let globPattern = path.join(dir, 'expected*.png');
    globPattern = globPattern.replace(/\\/g, '/'); // ensure a Windows path is converted to a glob compatible pattern.
    const expectedPaths = glob.sync(globPattern);

    if (!process.env.UPDATE && expectedPaths.length === 0) {
        throw new Error('No expected*.png files found; did you mean to run tests with UPDATE=true?');
    }

    if (process.env.UPDATE) {
        fs.writeFileSync(expectedPath, PNG.sync.write(actualImg));
        return;
    }

    // if we have multiple expected images, we'll compare against each one and pick the one with
    // the least amount of difference; this is useful for covering features that render differently
    // depending on platform, i.e. heatmaps use half-float textures for improved rendering where supported
    let minDiff = Infinity;
    let minDiffImg: PNG;
    let minExpectedBuf: Buffer;

    for (const path of expectedPaths) {
        const expectedBuf = fs.readFileSync(path);
        const expectedImg = PNG.sync.read(expectedBuf);
        const diffImg = new PNG({width, height});

        const diff = pixelmatch(
            actualImg.data, expectedImg.data, diffImg.data,
            width, height, {threshold: 0.1285}) / (width * height);

        if (diff < minDiff) {
            minDiff = diff;
            minDiffImg = diffImg;
            minExpectedBuf = expectedBuf;
        }
    }

    const diffBuf = PNG.sync.write(minDiffImg, {filterType: 4});
    const actualBuf = PNG.sync.write(actualImg, {filterType: 4});

    fs.writeFileSync(diffPath, diffBuf);
    fs.writeFileSync(actualPath, actualBuf);

    testData.difference = minDiff;
    testData.ok = minDiff <= testData.allowed;

    testData.actual = actualBuf.toString('base64');
    testData.expected = minExpectedBuf.toString('base64');
    testData.diff = diffBuf.toString('base64');
}

// /**
//  * Mocks XHR request and simply pulls file from the file system.
//  */
// function mockXhr() {
//     global.XMLHttpRequest = fakeXhr.useFakeXMLHttpRequest() as any;
//     // @ts-ignore
//     XMLHttpRequest.onCreate = (req: FakeXMLHttpRequest & XMLHttpRequest & { response: any }) => {
//         setTimeout(() => {
//             if (req.readyState === 0) return; // aborted...
//             const relativePath = req.url.replace(/^http:\/\/localhost:(\d+)\//, '').replace(/\?.*/, '');

//             let body: Buffer | null = null;
//             try {
//                 if (relativePath.startsWith('mvt-fixtures')) {
//                     const body = createRequire('@mapbox/mvt-fixtures').resolve(path.join('..', relativePath));
//                 } else {
//                     body = fs.readFileSync(path.join(thisDir, '../assets', relativePath));
//                 }
//                 if (req.responseType !== 'arraybuffer') {
//                     req.response = body.toString('utf8');
//                 } else {
//                     req.response = body;
//                 }
//                 req.setStatus(req.response.length > 0 ? 200 : 204);
//                 req.onload(undefined as any);
//             } catch (ex) {
//                 req.status = 404; // file not found
//                 req.onload(undefined as any);
//             }
//         }, 0);
//     };
// }

/**
 * Gets all the tests from the file system looking for style.json files.
 *
 * @param options The options
 * @param directory The base directory
 * @returns The tests data structure and the styles that were loaded
 */
function getTestStyles(options: RenderOptions, directory: string): StyleWithTestData[] {
    const tests = options.tests || [];

    const globCwd = directory.replace(/\\/g, '/'); // ensure a Windows path is converted to a glob compatible pattern.
    const sequence = glob.sync('**/style.json', {cwd: globCwd})
        .map(fixture => {
            const id = path.dirname(fixture);
            const style = JSON.parse(fs.readFileSync(path.join(directory, fixture), 'utf8')) as StyleWithTestData;
            style.metadata = style.metadata || {} as any;

            style.metadata.test = Object.assign({
                id,
                width: 512,
                height: 512,
                pixelRatio: 1,
                recycleMap: options.recycleMap || false,
                allowed: 0.00025
            }, style.metadata.test);

            return style;
        })
        .filter(style => {
            const test = style.metadata.test;

            if (tests.length !== 0 && !tests.some(t => test.id.indexOf(t) !== -1)) {
                return false;
            }

            if (process.env.BUILDTYPE !== 'Debug' && test.id.match(/^debug\//)) {
                console.log(`* skipped ${test.id}`);
                return false;
            }
            localizeURLs(style, 2900, path.join(thisDir, '../'));
            return true;
        });
    return sequence;
}

/**
 * Prints the progress to the console
 *
 * @param test The current test
 * @param total The total number of tests
 * @param index The current test index
 */
function printProgress(test: TestData, total: number, index: number) {
    if (test.error) {
        console.log('\x1b[31m', `${index}/${total}: errored ${test.id} ${test.error.message}`, '\x1b[0m');
    } else if (!test.ok) {
        console.log('\x1b[31m', `${index}/${total}: failed ${test.id} ${test.difference}`, '\x1b[0m');
    } else {
        console.log(`${index}/${total}: passed ${test.id}`);
    }
}

type TestStats = {
    total: number;
    errored: TestData[];
    failed: TestData[];
    passed: TestData[];
};

/**
 * Prints the summary at the end of the run
 *
 * @param tests all the tests with their resutls
 * @returns
 */
function printStatistics(stats: TestStats): boolean {
    const erroredCount = stats.errored.length;
    const failedCount = stats.failed.length;
    const passedCount = stats.passed.length;

    function printStat(status: string, statusCount: number) {
        if (statusCount > 0) {
            console.log(`${statusCount} ${status} (${(100 * statusCount / stats.total).toFixed(1)}%)`);
        }
    }

    printStat('passed', passedCount);
    printStat('failed', failedCount);
    printStat('errored', erroredCount);

    return (failedCount + erroredCount) === 0;
}

/**
 * Run the render test suite, compute differences to expected values (making exceptions based on
 * implementation vagaries), print results to standard output, write test artifacts to the
 * filesystem (optionally updating expected results), and exit the process with a success or
 * failure code.
 *
 * If all the tests are successful, this function exits the process with exit code 0. Otherwise
 * it exits with 1.
 */
const options: RenderOptions = {
    tests: [],
    recycleMap: false,
    report: false,
    seed: makeHash()
};

if (process.argv.length > 2) {
    options.tests = process.argv.slice(2).filter((value, index, self) => { return self.indexOf(value) === index; }) || [];
    options.recycleMap = checkParameter(options, '--recycle-map');
    options.report = checkParameter(options, '--report');
    options.seed = checkValueParameter(options, options.seed, '--seed');
}

describe('render tests', async () => {
    let server: PreviewServer;
    // let server: ViteDevServer | PreviewServer;
    let browser: Browser | null = null;

    beforeAll(async (ct) => {
        server = await preview({
            mode: 'development',
            publicDir: path.join(thisDir, '../assets'),
            root: thisDir,
            appType: 'custom',
        });
        // server = await createServer({
        //     mode: 'development',
        //     publicDir: path.join(thisDir, '../assets'),
        //     root: thisDir
        // });
        // await server.listen();
        browser = await chromium.launch({headless: false, devtools: true});
    });

    afterAll(async () => {
        await browser?.close();
        await new Promise<void>((resolve, reject) => {
            server.httpServer?.close(error => error ? reject(error) : resolve());
        });
    });

    //todo: only first 10
    for (const style of getTestStyles(options, directory).slice(0, 10)) {
        const testinfo = style.metadata.test;

        test(testinfo.id, async () => {
            const b2 = browser!;
            const s2 = server!;
            const serverUrl = s2.resolvedUrls.local[0];

            if (!b2) {
                throw new Error();
            }
            let data;
            const cxt = await b2.newContext({viewport: {width: style.metadata.test.width, height: style.metadata.test.height}});
            try {
                const page = await cxt.newPage();
                const address = new URL('render_test_page.html', serverUrl).toString();
                await page.goto(address);

                await page.evaluate((style) => { debugger; }, style);

                data =  await page.screenshot();
            } finally {
                cxt.close();
            }
            compareRenderResults(directory, style.metadata.test, data);
        }, {
            timeout: 60000

            //testinfo.timeout ?? 20000
        }
        );
    }

    // test('should change count when button clicked', async () => {
    //     const baseUrl = server.resolvedUrls.local[0];
    //     await page.goto('http://localhost:3000');
    //     const button = page.getByRole('button', {name: /Clicked/});
    //     await expect(button).toBeVisible();

    //     await expect(button).toHaveText('Clicked 0 time(s)');

    //     await button.click();
    //     await expect(button).toHaveText('Clicked 1 time(s)');
    // }, 60_000);
});

const directory = path.join(thisDir);

// const tests = testStyles.map(s => s.metadata.test).filter(t => !!t);
// const testStats: TestStats = {
//     total: tests.length,
//     errored: tests.filter(t => t.error),
//     failed: tests.filter(t => !t.error && !t.ok),
//     passed: tests.filter(t => !t.error && t.ok)
// };

// if (process.env.UPDATE) {
//     console.log(`Updated ${testStyles.length} tests.`);
//     process.exit(0);
// }

// const success = printStatistics(testStats);

// function getReportItem(test: TestData) {
//     let status: 'errored' | 'failed';

//     if (test.error) {
//         status = 'errored';
//     } else {
//         status = 'failed';
//     }

//     return `<div class="test">
//     <h2>${test.id}</h2>
//     ${status !== 'errored' ? `
//         <img width="${test.width}" height="${test.height}" src="data:image/png;base64,${test.actual}" data-alt-src="data:image/png;base64,${test.expected}">
//         <img style="width: ${test.width}; height: ${test.height}" src="data:image/png;base64,${test.diff}">` : ''
// }
//     ${test.error ? `<p style="color: red"><strong>Error:</strong> ${test.error.message}</p>` : ''}
//     ${test.difference ? `<p class="diff"><strong>Diff:</strong> ${test.difference}</p>` : ''}
// </div>`;
// }

// if (options.report) {
//     const erroredItems = testStats.errored.map(t => getReportItem(t));
//     const failedItems = testStats.failed.map(t => getReportItem(t));

//     // write HTML reports
//     let resultData: string;
//     if (erroredItems.length || failedItems.length) {
//         const resultItemTemplate = fs.readFileSync(path.join(thisDir, 'result_item_template.html')).toString();
//         resultData = resultItemTemplate
//             .replace('${failedItemsLength}', failedItems.length.toString())
//             .replace('${failedItems}', failedItems.join('\n'))
//             .replace('${erroredItemsLength}', failedItems.length.toString())
//             .replace('${erroredItems}', erroredItems.join('\n'));
//     } else {
//         resultData = '<h1 style="color: green">All tests passed!</h1>';
//     }

//     const reportTemplate = fs.readFileSync(path.join(thisDir, 'report_template.html')).toString();
//     const resultsContent = reportTemplate.replace('${resultData}', resultData);

//     const p = path.join(thisDir, options.recycleMap ? 'results-recycle-map.html' : 'results.html');
//     fs.writeFileSync(p, resultsContent, 'utf8');
//     console.log(`\nFull html report is logged to '${p}'`);

//     // write text report of just the error/failed id
//     if (testStats.errored?.length > 0) {
//         const erroredItemIds = testStats.errored.map(t => t.id);
//         const caseIdFileName = path.join(thisDir, 'results-errored-caseIds.txt');
//         fs.writeFileSync(caseIdFileName, erroredItemIds.join('\n'), 'utf8');

//         console.log(`\n${testStats.errored?.length} errored test case IDs are logged to '${caseIdFileName}'`);
//     }

//     if (testStats.failed?.length > 0) {
//         const failedItemIds = testStats.failed.map(t => t.id);
//         const caseIdFileName = path.join(thisDir, 'results-failed-caseIds.txt');
//         fs.writeFileSync(caseIdFileName, failedItemIds.join('\n'), 'utf8');

//         console.log(`\n${testStats.failed?.length} failed test case IDs are logged to '${caseIdFileName}'`);
//     }
// }

// process.exit(success ? 0 : 1);
