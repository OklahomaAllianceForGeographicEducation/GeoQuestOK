// components/LeafletMap.tsx
// This file is ONLY ever loaded via dynamic import() from TrailMap.web.tsx.
// It is never statically imported, so Leaflet's `window` references never
// run during Metro's SSR pass.

import { View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// CARTO's raster basemap tiles now require a (free) API key -- see
// EXPO_PUBLIC_CARTO_API_KEY in .env.example. Without one, tiles render with
// an "API KEY REQUIRED" watermark rather than failing outright.
const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_API_KEY;
const CARTO_TILE_URL = `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : ''}`;

// Emoji-based divIcons for the start/end flags -- avoids needing Leaflet's
// default marker image assets (which commonly 404 under bundlers unless
// separately configured).
const flagIcon = (emoji: string) => L.divIcon({
    html: `<div style="font-size:26px;line-height:1;">${emoji}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
});

// ─── Re-center button ─────────────────────────────────────────────────────────

// RecenterButton
// A small floating circular button (rendered as a raw HTML <div> since this
// file only ever runs on web -- see the file-level comment above) pinned to
// the bottom-right corner of the map. Tapping/clicking it smoothly flies
// the Leaflet map's camera back to `position`, in case the student has
// panned/zoomed away from their current location.
// Props:
// - position: the [latitude, longitude] pair to fly the camera back to
//   (this is always the student's current position -- see how it's called
//   below).
// - theme: the active light/dark theme colors, used for the button's
//   background/border/icon color.
// Returns: a plain HTML <div> styled as a circular button (this file is
// web-only, so plain DOM elements + inline CSS are used directly instead of
// React Native View/StyleSheet).
function RecenterButton({ position, theme }: { position: [number, number]; theme: any }) {
    const map = useMap();
    return (
        <div
            style={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                zIndex: 1000,
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: theme.surface,
                border: `1px solid ${theme.border}`,
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 18,
                color: theme.accent,
                userSelect: 'none',
            }}
            onClick={() => map.flyTo(position, 14, { animate: true, duration: 0.6 })}
        >
            ◎
        </div>
    );
}

// ─── Fullscreen toggle button ──────────────────────────────────────────────

// FullscreenToggleButton
// A small floating square button pinned to the top-right corner of the
// map, letting the student expand it to fill the whole viewport (and
// collapse it back). Mirrors RecenterButton's styling/positioning above,
// just at top-right instead of bottom-right so the two never overlap.
// Must live INSIDE <MapContainer> (like RecenterButton) so useMap() can
// find the Leaflet map instance -- it needs that instance to force a
// re-measure after the container's size changes (see the effect below).
function FullscreenToggleButton({
    isFullscreen,
    onToggle,
    theme,
}: {
    isFullscreen: boolean;
    onToggle: () => void;
    theme: any;
}) {
    const map = useMap();

    // Leaflet caches the pixel size of its container the last time it
    // measured it, and won't redraw tiles correctly for a container that's
    // since changed size out from under it. Toggling fullscreen swaps the
    // outer <View>'s style (see LeafletMap below) instead of resizing this
    // component itself, so Leaflet never sees that change on its own --
    // this tells it to re-measure once the new layout has actually applied.
    useEffect(() => {
        const id = setTimeout(() => map.invalidateSize(), 0);
        return () => clearTimeout(id);
    }, [isFullscreen, map]);

    return (
        <div
            style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 1000,
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: theme.surface,
                border: `1px solid ${theme.border}`,
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 18,
                color: theme.accent,
                userSelect: 'none',
            }}
            onClick={onToggle}
            role="button"
            aria-label={isFullscreen ? 'Exit fullscreen map' : 'View map fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        >
            {isFullscreen ? '✕' : '⛶'}
        </div>
    );
}

// The style applied on top of the caller's normal dStyles.mapContainer
// (via a style array, so these keys simply override the matching ones)
// while fullscreen is active -- pins the map to the whole viewport above
// everything else on the page. `position: 'fixed'` isn't part of React
// Native's ViewStyle type (only 'absolute'/'relative' are), but this file
// only ever renders on web (see the file-level comment up top), where
// react-native-web passes it straight through to the underlying <div>.
const FULLSCREEN_MAP_STYLE: any = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    margin: 0,
    borderRadius: 0,
    zIndex: 9999,
};

const toLatLng = (c: { latitude: number; longitude: number }): [number, number] =>
    [c.latitude, c.longitude];

// Fits the map to the trail's full bounds the first time trailCoords
// arrives. MUST be a module-level component, not one defined inside
// LeafletMap's render body: a function declared inside another component's
// render is a NEW component type on every render, so React unmounts and
// remounts it every time LeafletMap re-renders -- re-running this effect
// and re-fitting the camera to the ENTIRE trail on every single parent
// re-render, including just opening a landmark's popup. Hoisting it here
// means its own props are what decide whether the effect re-runs, not
// whether the parent happened to re-render.
function BoundsUpdater({ trailCoords }: { trailCoords: any[] }) {
    const map = useMap();
    // Tracks whether we've already auto-fit once. Without this, trailCoords
    // legitimately re-computing (e.g. routeGeojson re-fetching on a focus
    // event) fires this effect again, undoing wherever the student has
    // since panned/zoomed to -- same reasoning as the native map's
    // equivalent guard.
    const hasFitRef = useRef(false);

    useEffect(() => {
        if (!trailCoords?.length || hasFitRef.current) return;

        const container = map.getContainer();
        const latLngs = trailCoords.map(toLatLng);

        // On web, the MapContainer's actual DOM size isn't always settled
        // the moment this effect runs (a flexbox/dynamic-import layout
        // race) -- calling fitBounds against a container that's genuinely
        // 0px wide made Leaflet clamp to its max zoom level (18) instead of
        // a sane trail-overview zoom. The walked line and every landmark
        // were still there, just packed into a single zoomed-way-in tile
        // the student would have to scroll to ever find, and since it only
        // ever ran once (see hasFitRef above), there was no second chance
        // to recover. A ResizeObserver lets us wait for the container to
        // actually have a real size before ever attempting the fit, rather
        // than guessing at a timeout.
        const attemptFit = () => {
            if (hasFitRef.current) return false;
            if (container.offsetWidth === 0 || container.offsetHeight === 0) return false;
            map.invalidateSize();
            map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
            hasFitRef.current = true;
            return true;
        };

        if (attemptFit()) return;

        const observer = new ResizeObserver(() => {
            if (attemptFit()) observer.disconnect();
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [map, trailCoords]);

    return null;
}

// ─── Main Leaflet map ─────────────────────────────────────────────────────────

// LeafletMap
// The exported component itself -- the web implementation of the trail map
// (its native counterpart is TrailMap.native.tsx; this file is only ever
// reached via TrailMap.web.tsx's dynamic import, see the file-level comment
// above). Renders a Leaflet map showing the trail route (split into
// "walked" and "remaining" colored segments), the start/end flags, every
// landmark along the trail (locked or unlocked depending on progress), and
// the student's current position, plus a re-center button.
// Props (all typed `any` here -- this component receives whatever
// TrailMap.web.tsx passes through from the shared native/web trail-map
// props):
// - walkedCoords / remainingCoords: arrays of {latitude, longitude} points
//   for the portion of the route already walked vs. not yet walked.
// - allLandmarks: every landmark on this trail, each with a `mileMarker`
//   used to decide whether it's been "passed" yet.
// - trailCoords: the full ordered route (every vertex), used for the
//   start/end flags and the initial camera fit (see BoundsUpdater above).
// - trailRegion: an optional {latitude, longitude} used as the map's
//   initial center when provided (falls back to the user's position).
// - userPosition: the student's current {latitude, longitude}, shown as a
//   "you are here" marker and used to close the walked/remaining line gap
//   (see the comment on passedMile/walkedLatLngs below).
// - milesWalked: how far the student has walked so far, in miles --
//   determines which landmarks count as "passed" (unlocked).
// - dStyles: dashboard-provided styles applied to the map's outer
//   container.
// - theme: the active light/dark theme colors.
// - onLandmarkPress: called with a landmark when its marker is tapped,
//   but only if that landmark has already been passed (locked landmarks
//   ignore taps -- see the CircleMarker eventHandlers below).
// Returns: a React Native <View> (sized via dStyles.mapContainer) wrapping
// a react-leaflet <MapContainer> with all the trail's visual layers.
export default function LeafletMap({
    walkedCoords,
    remainingCoords,
    allLandmarks,
    trailCoords,
    trailRegion,
    userPosition,
    milesWalked,
    dStyles,
    theme,
    onLandmarkPress,
}: any) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    // While fullscreen, stop the page itself from scrolling behind the
    // map, and let Escape close it -- both standard behavior for
    // fullscreen-style overlays, and without the scroll lock the page
    // underneath a `position: fixed` map is still scrollable, which reads
    // as broken.
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

    const center: [number, number] = trailRegion
        ? [trailRegion.latitude, trailRegion.longitude]
        : toLatLng(userPosition);
    const walkedLatLngs = walkedCoords.map(toLatLng);
    const remainingLatLngs = remainingCoords.map(toLatLng);
    const userLatLng = toLatLng(userPosition);
    // dashboard.tsx splits walkedCoords/remainingCoords at a whole route
    // VERTEX index (splitIndex), but userPosition is the true arc-length
    // INTERPOLATED point somewhere between that vertex and the next one --
    // so the orange line was always ending, and the grey line starting,
    // one vertex short of the student's actual position. Leaflet renders
    // that gap crisply: the whole in-between stretch drew as grey, with
    // the "you are here" dot sitting in the middle of it looking stranded.
    // Extending the walked line to (and starting the remaining line from)
    // the exact same interpolated point the dot itself is drawn at closes
    // that gap without touching the shared arc-length math both platforms
    // rely on.
    if (walkedLatLngs.length > 0) {
        walkedLatLngs.push(userLatLng);
    }
    if (remainingLatLngs.length > 0) {
        remainingLatLngs[0] = userLatLng;
    }
    // The exact (not rounded-up) milesWalked -- the walked/orange portion
    // of the route line above is drawn from this same precise value, so
    // rounding UP here (the old Math.ceil) let a landmark flip to "passed"
    // and unlock before the orange line had actually reached it on the map.
    const passedMile = milesWalked;

    const mapView = (
        <View
            style={[dStyles.mapContainer, isFullscreen && FULLSCREEN_MAP_STYLE]}
            accessibilityLabel="Trail map showing your progress and nearby landmarks"
        >
            <MapContainer
                center={center}
                zoom={14}
                style={{ width: '100%', height: '100%' }}
                zoomControl
                scrollWheelZoom
            >
                <BoundsUpdater trailCoords={trailCoords} />
                <TileLayer
                    url={CARTO_TILE_URL}
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />



                {/* Walked portion — a wider white halo underneath the
                    colored line keeps it visible regardless of what color
                    the basemap tile underneath happens to be. */}
                {walkedLatLngs.length > 1 && (
                    <>
                        <Polyline positions={walkedLatLngs} pathOptions={{ color: '#FFFFFF', weight: 8, opacity: 0.9 }} />
                        <Polyline positions={walkedLatLngs} pathOptions={{ color: theme.accent, weight: 5, opacity: 1 }} />
                    </>
                )}

                {/* Remaining portion — same halo treatment. Pine green
                    rather than a flat grey: it reads as "the trail ahead"
                    instead of just an inactive/disabled state. */}
                {remainingLatLngs.length > 1 && (
                    <>
                        <Polyline positions={remainingLatLngs} pathOptions={{ color: '#FFFFFF', weight: 8, opacity: 0.9 }} />
                        <Polyline positions={remainingLatLngs} pathOptions={{ color: theme.secondary, weight: 5, opacity: 0.9 }} />
                    </>
                )}

                {/* Start flag */}
                {trailCoords.length > 0 && (
                    <Marker position={toLatLng(trailCoords[0])} icon={flagIcon('🚩')}>
                        <Popup>Trailhead</Popup>
                    </Marker>
                )}

                {/* End flag */}
                {trailCoords.length > 1 && (
                    <Marker position={toLatLng(trailCoords[trailCoords.length - 1])} icon={flagIcon('🏁')}>
                        <Popup>Trail End</Popup>
                    </Marker>
                )}

                {/* Landmark markers. A landmark the student hasn't walked far
                    enough to reach yet is locked -- clicking its pin must
                    not open its detail/quiz popup (onLandmarkPress), and the
                    Leaflet popup itself shouldn't leak its exact mile marker
                    either, same rule the landmark strip and "All Landmarks"
                    list already enforce. */}
                {allLandmarks.map((landmark: any) => {
                    const passed = landmark.mileMarker <= passedMile;
                    return (
                        <CircleMarker
                            key={landmark.id}
                            center={toLatLng(landmark.coordinate)}
                            radius={6}
                            pathOptions={{
                                fillColor: passed ? theme.accent : theme.subtext,
                                fillOpacity: 0.9,
                                color: '#fff',
                                weight: 2,
                            }}
                            eventHandlers={{ click: () => { if (passed) onLandmarkPress(landmark); } }}
                        >
                            <Popup>
                                {passed ? (
                                    <>
                                        <strong style={{ fontFamily: 'Georgia' }}>{landmark.title}</strong>
                                        <br />
                                        <span style={{ fontSize: 12, color: '#888' }}>Mile ~{landmark.mileMarker}</span>
                                    </>
                                ) : (
                                    <>
                                        <strong style={{ fontFamily: 'Georgia' }}>🔒 Locked</strong>
                                        <br />
                                        <span style={{ fontSize: 12, color: '#888' }}>
                                            {Math.max(0, landmark.mileMarker - milesWalked).toFixed(2)} mi to go
                                        </span>
                                    </>
                                )}
                            </Popup>
                        </CircleMarker>
                    );
                })}

                {/* User position */}
                <CircleMarker
                    center={toLatLng(userPosition)}
                    radius={9}
                    pathOptions={{ fillColor: theme.accent, fillOpacity: 1, color: '#fff', weight: 3 }}
                >
                    <Popup>
                        <strong style={{ fontFamily: 'Georgia' }}>You are here</strong>
                    </Popup>
                </CircleMarker>

                <RecenterButton position={toLatLng(userPosition)} theme={theme} />
                <FullscreenToggleButton
                    isFullscreen={isFullscreen}
                    onToggle={() => setIsFullscreen((current) => !current)}
                    theme={theme}
                />
            </MapContainer>
        </View>
    );

    // `position: fixed` (see FULLSCREEN_MAP_STYLE above) only escapes the
    // dashboard's own `overflow: hidden` map frame -- it does NOT escape an
    // ancestor with a CSS `transform` set, which becomes a fresh containing
    // block for any fixed-position descendant per the CSS spec. The
    // dashboard's surrounding ScrollView (like most React Native Web
    // scroll containers) sets an identity `transform` on its host div,
    // which silently confined "fullscreen" to that scroll container's box
    // instead of the real viewport. Portaling straight to `document.body`
    // while fullscreen sidesteps that ancestor chain entirely.
    return isFullscreen ? createPortal(mapView, document.body) : mapView;
}
