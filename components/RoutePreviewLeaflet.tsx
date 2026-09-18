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

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { View, Text } from 'react-native';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Theme } from '../commonStyles';

// CARTO's raster basemap tiles now require a (free) API key -- see
// EXPO_PUBLIC_CARTO_API_KEY in .env.example. Without one, tiles render with
// an "API KEY REQUIRED" watermark rather than failing outright.
const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_API_KEY;
const CARTO_TILE_URL = `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : ''}`;

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

// FullscreenToggleButton
// -----------------------
// Same idea as the dashboard trail map's fullscreen button (see
// components/LeafletMap.tsx): a small floating square button pinned to the
// top-right corner that expands this preview to fill the viewport. Must
// live inside <MapContainer> so useMap() can reach the Leaflet instance --
// it's needed to force Leaflet to re-measure its container after the
// fullscreen toggle changes that container's actual pixel size.
function FullscreenToggleButton({
    isFullscreen,
    onToggle,
    theme,
}: {
    isFullscreen: boolean;
    onToggle: () => void;
    theme: Theme;
}) {
    const map = useMap();

    useEffect(() => {
        const id = setTimeout(() => map.invalidateSize(), 0);
        return () => clearTimeout(id);
    }, [isFullscreen, map]);

    return (
        <div
            style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 1000,
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.15)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 17,
                color: theme.text,
                userSelect: 'none',
            }}
            onClick={onToggle}
            role="button"
            aria-label={isFullscreen ? 'Exit fullscreen preview' : 'View route preview fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        >
            {isFullscreen ? '✕' : '⛶'}
        </div>
    );
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
    // Hooks must run unconditionally on every render (React's rules of
    // hooks), so these live above the "not enough points" early return
    // below rather than after it, even though they're only meaningful once
    // there's an actual map to show fullscreen.
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Same scroll-lock + Escape-to-close behavior as the dashboard trail
    // map's fullscreen mode -- see components/LeafletMap.tsx for the fuller
    // explanation of why the lock is needed.
    useEffect(() => {
        if (!isFullscreen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsFullscreen(false);
        };
        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [isFullscreen]);

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

    // center/zoom here are just the INITIAL camera position -- FitBounds
    // below immediately overrides it once mounted, so these values only
    // matter for the very first frame before that effect runs.
    // zoomControl/scrollWheelZoom enable the +/- zoom buttons and mouse
    // wheel zooming respectively (this preview is still a real interactive
    // Leaflet map, just a small one).
    const map = (
        <MapContainer
            center={start}
            zoom={11}
            style={
                isFullscreen
                    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', zIndex: 9999 }
                    : { width: '100%', height: '100%' }
            }
            zoomControl
            scrollWheelZoom
        >
            {/* Runs the fit-to-route logic described above. */}
            <FitBounds coords={coords} />
            <FullscreenToggleButton
                isFullscreen={isFullscreen}
                onToggle={() => setIsFullscreen((current) => !current)}
                theme={theme}
            />
            {/* The visual map background: a light-themed CARTO basemap
                tile layer (rather than the default OpenStreetMap style),
                chosen to look clean/muted behind the colored route line. */}
            <TileLayer
                url={CARTO_TILE_URL}
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

    // `position: fixed` above only escapes the parent preview frame's
    // `overflow: hidden` clipping -- it does NOT escape an ancestor with a
    // CSS `transform` set, which becomes the new containing block for any
    // fixed-position descendant per the CSS spec. This preview always
    // renders inside a Modal (see the TrailModal in app/trails.tsx), and
    // both React Native Web's ScrollView and its Modal's own animation
    // wrapper set a (identity) `transform` on their host divs, which
    // silently confined the "fullscreen" map to that Modal's box instead of
    // the real viewport. Portaling straight to `document.body` while
    // fullscreen sidesteps the whole ancestor chain rather than trying to
    // out-z-index or un-transform anything upstream.
    return isFullscreen ? createPortal(map, document.body) : map;
}
