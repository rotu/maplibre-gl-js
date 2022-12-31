import {assert, afterAll, beforeAll, describe, test} from 'vitest';
import {JSHandle, chromium} from 'playwright';
import st from 'st';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {preview, createServer} from 'vite';

import path, {dirname} from 'path';
import fs from 'fs';
import glob from 'glob';
import rtlText from '@mapbox/mapbox-gl-rtl-text';
import localizeURLs from '../lib/localize-urls';
// import maplibregl from '../../../src/index';
import * as rtlTextPluginModule from '../../../src/source/rtl_text_plugin';
import {StyleWithTestData, TestData} from './render_test_case';
import {runTestDataInBrowser} from './browser_test_driver';

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
            localizeURLs(style, path.join(thisDir, '../'));
            return true;
        });
    return sequence;
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
    let serverUrl;
    let browser;
    let server;
    let page;

    beforeAll(async () => {
        await new Promise<void>((resolve) => {
            server = http.createServer(
                st(projectRoot)
            ).listen(() => {
                const address = server.address();
                serverUrl = `http://localhost:${address.port}`;
                resolve();
            });
        });

        browser = await chromium.launch({
            // headless: true, devtools: true
        });
    });

    afterAll(async () => {
        await browser?.close();
        server.close();
    });
    const testStyles = getTestStyles(options, thisDir).slice(0, 15);

    for (const style of testStyles) {
        const testinfo = style.metadata.test;

        test(testinfo.id, async () => {
            let data;
            let page;
            const testDir = path.join(thisDir, style.metadata.test.id);
            try {
                page = await browser.newPage({viewport: {width: style.metadata.test.width, height: style.metadata.test.height}});
                // await page.addInitScript({ path: "./browser_test_driver.ts" })
                await page.goto('about:blank');

                await page.addStyleTag({content: '* {margin:0; padding:0}'});
                await page.addScriptTag({path: `${projectRoot}/dist/maplibre-gl-dev.js`});
                await page.addStyleTag({path: `${projectRoot}/dist/maplibre-gl.css`});

                await page.evaluate(runTestDataInBrowser, style);

                const screenshotFile = path.join(testDir, 'actual.png');
                data = await page.screenshot({path: screenshotFile});
            } finally {
                page?.close();
            }
            expect(data).toMatchImageSnapshot({
                customSnapshotsDir: testDir,
                customSnapshotIdentifier: 'expected',
            });
        }, {
            timeout: 60000

            //testinfo.timeout ?? 20000
        }
        );
    }
});
