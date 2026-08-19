// components/LeafletMap.tsx
// This file is ONLY ever loaded via dynamic import() from TrailMap.web.tsx.
// It is never statically imported, so Leaflet's `window` references never
// run during Metro's SSR pass.

import { View } from 'react-native';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

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

    return (
        <View style={dStyles.mapContainer}>
            <MapContainer
                center={center}
                zoom={14}
                style={{ width: '100%', height: '100%' }}
                zoomControl
                scrollWheelZoom
            >
                <BoundsUpdater trailCoords={trailCoords} />
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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
            </MapContainer>
        </View>
    );
}
