// components/RoutePreviewLeaflet.tsx
//
// FILE OVERVIEW
// -------------
// Component: RoutePreviewLeaflet (default export), plus a small internal
//   helper component FitBounds.
// Platform: WEB only. This file imports `leaflet` and `react-leaflet`
//   directly at the top level, which only works in a browser (Leaflet reads
//   from the global `window`/DOM). It is loaded lazily, client-side only, by
//   components/RoutePreviewMap.web.tsx (via a dynamic `import()` inside a
//   useEffect) specifically to avoid ever being evaluated during
//   server-side rendering.
// Responsibility: does the actual Leaflet map rendering for the trail
//   preview thumbnail on web -- a small, non-interactive-feeling map showing
//   the route as a colored line with a start marker and an end marker,
//   automatically framed (panned + zoomed) to fit the whole route. This is
//   the web sibling of RoutePreviewMap.native.tsx, which does the same job
//   with react-native-maps on iOS/Android.

import { useEffect } from 'react';
import { View, Text } from 'react-native';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Theme } from '../commonStyles';

// A single point as a plain [latitude, longitude] tuple -- the coordinate
// shape Leaflet itself expects (as opposed to react-native-maps' {latitude,
// longitude} object shape used in the native version of this component).
type LatLng = [number, number];

// Props for RoutePreviewLeaflet:
// - coords: the ordered list of [lat, lng] points making up the route to
//   draw. Needs at least 2 points to draw a line; fewer than that shows an
//   "unavailable" message instead.
// - accentColor: hex color used for the route polyline.
// - subtextColor: color used for the "unavailable" fallback text.
// - theme: the active color theme object (see commonStyles.ts), used here
//   to color the start/finish circle markers (`theme.secondary`,
//   `theme.error`).
type Props = {
    coords: LatLng[];
    accentColor: string;
    subtextColor: string;
    theme: Theme;
};

// FitBounds
// ---------
// Purpose: a tiny helper component whose only job is to pan/zoom the
// enclosing Leaflet map so the entire route is visible. It renders no
// visible UI of its own (`return null`) -- it exists purely to run an
// effect in a context where the `useMap()` hook (which only works inside a
// react-leaflet <MapContainer>) is available.
//
// Props: `coords`, the same [lat, lng] list as above.
// Returns: null (no DOM/markup output).
function FitBounds({ coords }: { coords: LatLng[] }) {
    // useMap() (from react-leaflet) returns the actual Leaflet map instance
    // created by the nearest ancestor <MapContainer>, so imperative Leaflet
    // methods like fitBounds can be called on it directly.
    const map = useMap();

    // Keep the preview zoomed to the route geometry. Runs whenever `coords`
    // (a new route) or `map` (should be stable, but included since it's
    // used inside the effect) changes. Guards against an empty coords array,
    // since you can't compute meaningful bounds with zero points.
    // L.latLngBounds(coords) computes the smallest rectangular
    // latitude/longitude box containing every point in the route; fitBounds
    // then pans and zooms the map so that whole box is visible, with 24px
    // of padding on every edge so the line doesn't touch the map's borders.
    useEffect(() => {
        if (!coords.length) return;
        map.fitBounds(L.latLngBounds(coords), { padding: [24, 24] });
    }, [coords, map]);

    return null;
}

// RoutePreviewLeaflet
// -------------------
// Purpose: render the Leaflet map itself -- tile background, the fitted
// viewport (via FitBounds), the route polyline, and start/end circle
// markers.
//
// Props: see the `Props` type above.
// Returns: either a centered "Route preview unavailable" message (fewer
// than 2 coordinates) or a Leaflet <MapContainer> with a tile layer, the
// FitBounds helper, the route Polyline, and two CircleMarkers.
export default function RoutePreviewLeaflet({ coords, accentColor, subtextColor, theme }: Props) {
    // Not enough points to draw a route: bail out to a simple centered
    // message rather than rendering an empty or broken-looking map.
    if (coords.length < 2) {
        return (
            <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: subtextColor, fontSize: 13 }}>Route preview unavailable</Text>
            </View>
        );
    }

    // The first and last points in the route are used to place the start
    // and end circle markers.
    const start = coords[0];
    const end = coords[coords.length - 1];

    return (
        // center/zoom here are just the INITIAL camera position -- FitBounds
        // below immediately overrides it once mounted, so these values only
        // matter for the very first frame before that effect runs.
        // zoomControl/scrollWheelZoom enable the +/- zoom buttons and mouse
        // wheel zooming respectively (this preview is still a real
        // interactive Leaflet map, just a small one).
        <MapContainer
            center={start}
            zoom={11}
            style={{ width: '100%', height: '100%' }}
            zoomControl
            scrollWheelZoom
        >
            {/* Runs the fit-to-route logic described above. */}
            <FitBounds coords={coords} />
            {/* The visual map background: a light-themed CARTO basemap
                tile layer (rather than the default OpenStreetMap style),
                chosen to look clean/muted behind the colored route line. */}
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            />
            {/* The route line itself, drawn through every coordinate in
                order, in the caller-supplied accent color. */}
            <Polyline
                positions={coords}
                pathOptions={{ color: accentColor, weight: 4, opacity: 0.95 }}
            />
            {/* Start marker: a small filled circle with a white ring,
                colored with the theme's "secondary" color. */}
            <CircleMarker
                center={start}
                radius={6}
                pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: theme.secondary, fillOpacity: 1 }}
            />
            {/* End marker: same white-ring circle style, but colored with
                the theme's "error" color to visually distinguish it from
                the start marker. */}
            <CircleMarker
                center={end}
                radius={6}
                pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: theme.error, fillOpacity: 1 }}
            />
        </MapContainer>
    );
}
