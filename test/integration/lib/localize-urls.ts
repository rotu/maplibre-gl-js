import path from 'path';
import fs from 'fs';
import {StyleSpecification} from '../../../src/style-spec/types.g';

export default function localizeURLs(style: any, baseTestsDir: string) {
    localizeStyleURLs(style);
    if (style.metadata && style.metadata.test && style.metadata.test.operations) {
        style.metadata.test.operations.forEach((op) => {
            if (op[0] === 'addSource') {
                localizeSourceURLs(op[2]);
            } else if (op[0] === 'setStyle') {
                if (typeof op[1] === 'object') {
                    localizeStyleURLs(op[1]);
                    return;
                }

                let styleJSON;
                try {
                    const relativePath = op[1].replace(/^local:\/\//, '');
                    styleJSON = fs.readFileSync(path.join(baseTestsDir, 'assets', relativePath));
                } catch (error) {
                    console.log(`* ${error}`);
                    return;
                }

                try {
                    styleJSON = JSON.parse(styleJSON);
                } catch (error) {
                    console.log(`* Error while parsing ${op[1]}: ${error}`);
                    return;
                }

                localizeStyleURLs(styleJSON);

                op[1] = styleJSON;
                op[2] = {diff: false};
            }
        });
    }
}

function localizeURL(url: string) {
    return url.replace(/^local:\/\//, '/');
}

function localizeMapboxSpriteURL(url: string) {
    return url.replace(/^mapbox:\/\//, '/');
}

function localizeMapboxFontsURL(url: string) {
    return url.replace(/^mapbox:\/\/fonts/, '/glyphs');
}

function localizeMapboxTilesURL(url: string) {
    return url.replace(/^mapbox:\/\//, '/tiles/');
}

function localizeMapboxTilesetURL(url: string) {
    return url.replace(/^mapbox:\/\//, '/tilesets/');
}

function localizeSourceURLs(source: any) {
    for (const tile in source.tiles) {
        source.tiles[tile] = localizeMapboxTilesURL(source.tiles[tile]);
        source.tiles[tile] = localizeURL(source.tiles[tile]);
    }

    if (source.urls) {
        source.urls = source.urls.map((url) => localizeMapboxTilesetURL(url));
        source.urls = source.urls.map((url) => localizeURL(url));
    }

    if (source.url) {
        source.url = localizeMapboxTilesetURL(source.url);
        source.url = localizeURL(source.url);
    }

    if (source.data && typeof source.data == 'string') {
        source.data = localizeURL(source.data);
    }
}

function localizeStyleURLs(style: StyleSpecification) {
    for (const source in style.sources) {
        localizeSourceURLs(style.sources[source]);
    }

    if (style.sprite) {
        if (typeof style.sprite === 'string') {
            style.sprite = localizeMapboxSpriteURL(style.sprite);
            style.sprite = localizeURL(style.sprite);
        } else if (Array.isArray(style.sprite)) {
            for (const sprite of style.sprite) {
                sprite.url = localizeMapboxSpriteURL(sprite.url);
                sprite.url = localizeURL(sprite.url);
            }
        }
    }

    if (style.glyphs) {
        style.glyphs = localizeMapboxFontsURL(style.glyphs);
        style.glyphs = localizeURL(style.glyphs);
    }
}
