// components/RoutePreviewMap.web.tsx
//
// FILE OVERVIEW
// -------------
// Component: RoutePreviewMap (default export)
// Platform: WEB. This is the browser implementation selected by
//   components/RoutePreviewMap.tsx's `Platform.OS === 'web'` runtime check
//   (see that file for how the native/web versions get switched between,
//   and RoutePreviewMap.native.tsx for the iOS/Android counterpart).
// Responsibility: this file itself does NOT draw a map. Like
//   TrailMap.web.tsx elsewhere in this codebase, it's a thin client-only
//   loading wrapper: it dynamically `import()`s components/RoutePreviewLeaflet
//   (the file that actually uses Leaflet) after mount, shows a spinner while
//   that import is in flight, shows a graceful fallback if it fails, and
//   otherwise converts this component's {latitude, longitude}-shaped coords
//   into the [lat, lng] tuples Leaflet expects and renders the real preview.
//
// Why lazy-load instead of a normal top-level import? Leaflet reads from the
// global `window` object as soon as it's imported, and Expo Router web
// supports server-side rendering (SSR), where there is no `window` at all. A
// static `import` of anything Leaflet-related at the top of this file would
// crash during SSR. Doing the import inside a useEffect defers it until
// code is actually running in the browser, after mount -- sidestepping SSR
// entirely.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Theme } from '../commonStyles';

// A single lat/lng point, in the shape used elsewhere in this app's route
// data (as opposed to Leaflet's own [lat, lng] tuple shape, which this file
// converts to right before rendering the real map).
type Coordinate = { latitude: number; longitude: number };

// Props for RoutePreviewMap (web):
// - coords: the full ordered list of {latitude, longitude} points making up
//   the route to preview.
// - region: accepted for interface parity with the native version's Region
//   prop, but unused here -- Leaflet's FitBounds logic (in
//   RoutePreviewLeaflet.tsx) computes its own framing directly from
//   `coords`, so no initial region needs to be passed through.
// - accentColor: hex color used for the route polyline and the loading
//   spinner.
// - subtextColor: color for the "loading" and "unavailable" fallback text.
// - borderColor: used (with transparency appended) as the loading-state
//   background tint.
// - theme: the active color theme object (see commonStyles.ts), forwarded
//   to RoutePreviewLeaflet for its start/finish marker colors.
type Props = {
    coords: Coordinate[];
    region?: {
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    };
    accentColor: string;
    subtextColor: string;
    borderColor: string;
    theme: Theme;
};

// RoutePreviewMap (web)
// ---------------------
// Purpose: act as a client-only loading gate in front of the real Leaflet
// route preview, so Leaflet's `window`-dependent code never runs during
// server-side rendering, and convert this component's coordinate shape into
// the one Leaflet expects.
//
// Props: see the `Props` type above. Note `region` is destructured out
// implicitly by not being listed below -- it's accepted by the type but
// simply not used in this implementation.
// Returns: while loading, a spinner placeholder; if the dynamic import
// fails, a "Route preview unavailable" placeholder; otherwise, the real
// <LeafletPreview> component with coordinates converted to [lat, lng] tuples.
export default function RoutePreviewMap({ coords, accentColor, subtextColor, borderColor, theme }: Props) {
    // Holds the actual preview map component once the dynamic import
    // resolves. Starts null, meaning "not loaded yet."
    const [LeafletPreview, setLeafletPreview] = useState<React.ComponentType<any> | null>(null);
    // True until the dynamic import settles (success OR failure).
    const [loading, setLoading] = useState(true);

    // Runs exactly once, right after this component first mounts (empty
    // dependency array). By the time a useEffect body runs, we're guaranteed
    // to be in a real browser environment (never during SSR), which is why
    // the Leaflet-dependent import lives here instead of at the top of the
    // file.
    useEffect(() => {
        import('./RoutePreviewLeaflet')
            .then((mod) => {
                // Wrapping the component in `() => mod.default` (a function
                // that RETURNS the component) rather than passing it
                // directly avoids React treating it as the "updater
                // function" form of setState and trying to CALL it.
                setLeafletPreview(() => mod.default);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    // While the dynamic import is still in flight: show a spinner over a
    // lightly tinted background (borderColor + '33', where '33' is a hex
    // alpha suffix for roughly 20% opacity).
    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: borderColor + '33' }}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={{ color: subtextColor, fontSize: 13, marginTop: 8 }}>Loading map preview…</Text>
            </View>
        );
    }

    // Loading finished but the import still failed (e.g. a network hiccup)
    // -- LeafletPreview stayed null. Show a friendly fallback instead of
    // crashing or rendering nothing.
    if (!LeafletPreview) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: subtextColor, fontSize: 13 }}>Route preview unavailable</Text>
            </View>
        );
    }

    // Convert this component's {latitude, longitude} coordinate objects into
    // the [latitude, longitude] tuples Leaflet/react-leaflet expect.
    const latLngs = coords.map((coord) => [coord.latitude, coord.longitude] as [number, number]);

    return (
        <LeafletPreview
            coords={latLngs}
            accentColor={accentColor}
            subtextColor={subtextColor}
            theme={theme}
        />
    );
}
