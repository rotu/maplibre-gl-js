import type {StyleSpecification} from '../../../src/style-spec/types.g';
import type { PointLike } from '../../../src/ui/camera';
import maplibregl from '../../../src/index';

type StyleWithTestData = StyleSpecification & {
    metadata : {
        test: TestData;
    };
}

type TestData = {
    id: string;
    width: number;
    height: number;
    pixelRatio: number;
    recycleMap: boolean;
    allowed: number;
    ok: boolean;
    difference: number;
    timeout: number;
    addFakeCanvas: {
        id: string;
        image: string;
    };
    axonometric: boolean;
    skew: [number, number];
    fadeDuration: number;
    debug: boolean;
    showOverdrawInspector: boolean;
    showPadding: boolean;
    collisionDebug: boolean;
    localIdeographFontFamily: string;
    crossSourceCollisions: boolean;
    operations: any[];
    queryGeometry: PointLike;
    queryOptions: any;
    error: Error;
    maxPitch: number;

    // base64-encoded content of the PNG results
    actual: string;
    diff: string;
    expected: string;
}
