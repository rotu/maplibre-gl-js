'use strict';

const container = document.createElement('div');

container.setAttribute('id', 'map');
var map = window.map = new maplibregl.Map({
    container,
    zoom: 12.5,
    center: [-77.01866, 38.888],
    style: 'https://demotiles.maplibre.org/style.json',
    hash: true
});

map.addControl(new maplibregl.NavigationControl());
map.addControl(new maplibregl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true
    },
    trackUserLocation: true,
    showUserLocation: true,
    fitBoundsOptions: {
        maxZoom: 20
    }
}));
map.addControl(new maplibregl.ScaleControl());
map.addControl(new maplibregl.FullscreenControl());

map.on('load', function () {
    map.addSource('geojson', {
        'type': 'geojson',
        'data': '../integration/assets/data/linestring.geojson',
        'attribution': 'GeoJSON Attribution'
    });
    map.addLayer({
        'id': 'route',
        'type': 'line',
        'source': 'geojson',
        'paint': {
            'line-color': '#EC8D8D',
            'line-width': {'base': 1.5, 'stops': [[5, 0.75], [18, 32]]}
        }
    });
    map.on('mouseenter', 'marker', function (e) {
        map.setFilter('marker-hover', ['==', 'name', e.features[0].properties.name]);
    });
    map.on('mouseleave', 'marker', function (_) {
        map.setFilter('marker-hover', ['==', 'name', '']);
    });

});

map.on('click', function (e) {
    if (e.originalEvent.shiftKey) return;
    (new maplibregl.Popup())
        .setLngLat(map.unproject(e.point))
        .setHTML('<h1>Hello World!</h1>')
        .addTo(map);
});

document.addEventListener('DOMContentLoaded', (e) => {
    document.body.prepend(container);
    document.getElementById('show-tile-boundaries-checkbox').onclick = function () {
        map.showTileBoundaries = !!this.checked;
    };

    document.getElementById('show-symbol-collision-boxes-checkbox').onclick = function () {
        map.showCollisionBoxes = !!this.checked;
    };

    document.getElementById('show-overdraw-checkbox').onclick = function () {
        map.showOverdrawInspector = !!this.checked;
    };

    document.getElementById('pitch-checkbox').onclick = function () {
        map.dragRotate._pitchWithRotate = !!this.checked;
    };
});

