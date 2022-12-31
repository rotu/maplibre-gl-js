/// <reference lib="dom" />
import type MapLibre from '../../../src/ui/map';
import type {StyleWithTestData, TestData} from './render_test_case';

export async function runTestDataInBrowser (style:StyleWithTestData) {
    const options = style.metadata.test;

    async function createFakeCanvas(document: Document, id: string, imagePath: string) {
        const fakeCanvas = document.createElement('canvas');
        fakeCanvas.id = id;

        const image = new Image();
        image.src = imagePath;

        await new Promise(resolve => { image.onload = resolve; });
        fakeCanvas.getContext('2d')?.drawImage(image, 0, 0);
        fakeCanvas.width = image.width;
        fakeCanvas.height = image.height;
    }

    async function updateFakeCanvas(document: Document, id: string, imagePath: string) {
        const fakeCanvas = document.getElementById(id) as HTMLCanvasElement;
        const image = new Image();
        image.src = imagePath;
        await new Promise(resolve => { image.onload = resolve; });
        fakeCanvas.getContext('2d')?.drawImage(image, 0, 0);
    }

    /**
     * Executes the operations in the test data
     *
     * @param testData The test data to operate upon
     * @param map The Map
     * @param operations The operations
     * @param callback The callback to use when all the operations are executed
     */
    function applyOperations(testData: TestData, map: MapLibre & { _render: () => void}, operations: any[], callback: Function) {
        const operation = operations && operations[0];
        if (!operations || operations.length === 0) {
            callback();

        } else if (operation[0] === 'wait') {
            if (operation.length > 1) {
                // now += operation[1];
                map._render();
                applyOperations(testData, map, operations.slice(1), callback);
            } else {
                const wait = function() {
                    if (map.loaded()) {
                        applyOperations(testData, map, operations.slice(1), callback);
                    } else {
                        map.once('render', wait);
                    }
                };
                wait();
            }

        } else if (operation[0] === 'sleep') {
            // Prefer "wait", which renders until the map is loaded
            // Use "sleep" when you need to test something that sidesteps the "loaded" logic
            setTimeout(() => {
                applyOperations(testData, map, operations.slice(1), callback);
            }, operation[1]);
        } else if (operation[0] === 'addImage') {
            const image = new Image();
            image.src = operation[2];
            map.addImage(operation[1], image, operation[3] || {});
            applyOperations(testData, map, operations.slice(1), callback);
        } else if (operation[0] === 'addCustomLayer') {
            map.addLayer(new customLayerImplementations[operation[1]](), operation[2]);
            map._render();
            applyOperations(testData, map, operations.slice(1), callback);
        } else if (operation[0] === 'updateFakeCanvas') {
            const canvasSource = map.getSource(operation[1]) as CanvasSource;
            canvasSource.play();
            // update before pause should be rendered
            updateFakeCanvas(window.document, testData.addFakeCanvas.id, operation[2]);
            canvasSource.pause();
            // update after pause should not be rendered
            updateFakeCanvas(window.document, testData.addFakeCanvas.id, operation[3]);
            map._render();
            applyOperations(testData, map, operations.slice(1), callback);
        } else if (operation[0] === 'setStyle') {
            // Disable local ideograph generation (enabled by default) for
            // consistent local ideograph rendering using fixtures in all runs of the test suite.
            map.setStyle(operation[1], {localIdeographFontFamily: false as any});
            applyOperations(testData, map, operations.slice(1), callback);
        } else if (operation[0] === 'pauseSource') {
            map.style.sourceCaches[operation[1]].pause();
            applyOperations(testData, map, operations.slice(1), callback);
        } else {
            if (typeof map[operation[0]] === 'function') {
                map[operation[0]](...operation.slice(1));
            }
            applyOperations(testData, map, operations.slice(1), callback);
        }
    }
    if (options.addFakeCanvas) {
        createFakeCanvas(document, options.addFakeCanvas.id, options.addFakeCanvas.image);
    }

    const map = new maplibregl.Map({
        container: document.body,
        style,

        // @ts-ignore
        classes: options.classes,
        interactive: false,
        attributionControl: false,
        maxPitch: options.maxPitch,
        pixelRatio: options.pixelRatio,
        preserveDrawingBuffer: true,
        axonometric: options.axonometric || false,
        skew: options.skew || [0, 0],
        fadeDuration: options.fadeDuration || 0,
        localIdeographFontFamily: options.localIdeographFontFamily || false as any,
        crossSourceCollisions: typeof options.crossSourceCollisions === 'undefined' ? true : options.crossSourceCollisions
    });

    // Configure the map to never stop the render loop
    map.repaint = true;

    if (options.debug) map.showTileBoundaries = true;
    if (options.showOverdrawInspector) map.showOverdrawInspector = true;
    if (options.showPadding) map.showPadding = true;

    return new Promise(resolve => {
        map.once('load', () => {
            if (options.collisionDebug) {
                map.showCollisionBoxes = true;
                if (options.operations) {
                    options.operations.push(['wait']);
                } else {
                    options.operations = [['wait']];
                }
            }
            applyOperations(options, map as any, options.operations, resolve
            );
        });
    });
}
