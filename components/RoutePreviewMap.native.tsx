// components/RoutePreviewMap.native.tsx
//
// FILE OVERVIEW
// -------------
// Component: RoutePreviewMap (default export)
// Platform: NATIVE (iOS and Android). Selected at runtime by
//   components/RoutePreviewMap.tsx's `Platform.OS` check (see that file for
//   the web counterpart, RoutePreviewMap.web.tsx, and how the two are
//   switched between).
// Responsibility: renders a small, non-interactive-feeling preview map of a
//   single trail route using react-native-maps -- a route line plus a
//   "Start" and "Finish" pin -- automatically zoomed/framed to fit the whole
//   route. Used for trail-preview thumbnails (e.g. on the Trails list),
//   distinct from the full interactive TrailMap used while actively walking
//   a trail.

import { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import type { Theme } from '../commonStyles';

// A single lat/lng point, in the shape react-native-maps expects.
type Coordinate = { latitude: number; longitude: number };

// Props for RoutePreviewMap:
// - coords: the full ordered list of {latitude, longitude} points making up
//   the route to preview. Needs at least 2 points to draw a line; fewer
//   than that and the component shows an "unavailable" message instead.
// - region: a react-native-maps `Region` ({latitude, longitude,
//   latitudeDelta, longitudeDelta}) used as the map's very first camera
//   framing, before the fit-to-route logic below has a chance to run.
// - accentColor: hex color used for the route polyline.
// - subtextColor: optional color for the "unavailable" fallback text;
//   falls back to `borderColor` if not given.
// - borderColor: fallback text color (see subtextColor above); also part of
//   this component's props even though it isn't used for any border here.
// - theme: the active color theme object (see commonStyles.ts), used here
//   to color the start/finish pins (`theme.secondary`, `theme.error`).
type Props = {
    coords: Coordinate[];
    region: Region;
    accentColor: string;
    subtextColor?: string;
    borderColor: string;
    theme: Theme;
};

// RoutePreviewMap (native)
// ------------------------
// Purpose: show a small native map snapshot of one trail's route, fitted so
// the entire path is visible, with clearly marked start/finish points.
//
// Props: see the `Props` type above.
// Returns: either a centered "Route preview unavailable" message (when
// there are fewer than 2 coordinates to draw a line between) or a
// <MapView> containing the route Polyline and two Markers.
export default function RoutePreviewMap({ coords, region, accentColor, subtextColor, borderColor, theme }: Props) {
    // Holds the underlying native MapView instance so we can imperatively
    // call `fitToCoordinates` on it (a method, not a prop -- there's no
    // declarative way to say "zoom to fit these points" in react-native-maps,
    // so an imperative ref call is the standard way to do it).
    const mapRef = useRef<MapView | null>(null);

    // Fit the preview map to the route once the coordinates are available.
    // Runs whenever `coords` changes (including on mount). Guards against
    // the ref not being attached yet, and against having too few points to
    // meaningfully "fit" a bounding box around (a single point or an empty
    // array can't define a useful zoom level this way).
    useEffect(() => {
        if (!mapRef.current || coords.length < 2) return;

        // fitToCoordinates pans/zooms the camera so every given coordinate
        // is visible on screen, with a fixed pixel padding on each edge so
        // the route doesn't touch the very edges of the map view.
        // animated: false means this happens instantly rather than with a
        // camera-pan animation -- appropriate for a small preview thumbnail
        // where the user doesn't need to watch it fly in.
        mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
            animated: false,
        });
    }, [coords]);

    // Not enough points to draw a route: bail out to a simple centered
    // message instead of rendering an empty/broken-looking map.
    if (coords.length < 2) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: subtextColor ?? borderColor, fontSize: 13 }}>Route preview unavailable</Text>
            </View>
        );
    }

    // The first and last points in the route are used to place the
    // "Start" and "Finish" pins.
    const start = coords[0];
    const end = coords[coords.length - 1];

    return (
        <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_DEFAULT}
            // Camera framing to use before onMapReady/fitToCoordinates has
            // had a chance to run -- avoids a flash of some default
            // worldwide/zero,zero view on first paint.
            initialRegion={region}
            // onMapReady fires once the native map surface has actually
            // finished initializing. `fitToCoordinates` calls made before
            // this point can silently no-op on some platforms/timings, so
            // this is a second, more reliable place to trigger the same fit
            // logic as the useEffect above (which may run before the map
            // is truly ready, e.g. on first mount).
            onMapReady={() => {
                if (!mapRef.current || coords.length < 2) return;
                mapRef.current.fitToCoordinates(coords, {
                    edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
                    animated: false,
                });
            }}
        >
            {/* The route line itself, drawn in the caller-supplied accent color. */}
            <Polyline
                coordinates={coords}
                strokeColor={accentColor}
                strokeWidth={4}
            />
            {/* Start/finish pins use react-native-maps' default pin marker
                style (no custom child view), just recolored via pinColor. */}
            <Marker coordinate={start} title="Start" pinColor={theme.secondary} />
            <Marker coordinate={end} title="Finish" pinColor={theme.error} />
        </MapView>
    );
}
