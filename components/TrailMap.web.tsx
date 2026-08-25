// components/TrailMap.web.tsx
//
// FILE OVERVIEW
// -------------
// Component: TrailMap (default export)
// Platform: WEB only. This is the browser half of a platform-split pair --
//   see components/TrailMap.native.tsx for the iOS/Android implementation
//   (built on react-native-maps) and components/TrailMap.d.ts for the
//   shared, loosely-typed contract both sides implement. Metro (the
//   bundler) automatically loads THIS file whenever some other file writes
//   a plain `import TrailMap from '../../components/TrailMap'` (no
//   extension) and the app is running in a web browser; the exact same
//   import resolves to TrailMap.native.tsx instead on iOS/Android.
// Responsibility: this file itself does NOT draw the map. It is a thin
//   loading wrapper: the actual Leaflet-based map (components/LeafletMap.tsx)
//   is loaded lazily, client-side only, after the component mounts. This
//   file's job is just to (1) trigger that lazy load, (2) show a loading
//   spinner while it's in flight, (3) show a graceful fallback if it fails,
//   and (4) once loaded, render the real map component and forward every
//   prop straight through to it unchanged.
//
// Why lazy-load instead of a normal top-level `import`? Leaflet (the
// mapping library) reads from the global `window` object as soon as it is
// imported. Expo Router web supports server-side rendering (SSR) / static
// generation, where the module graph is evaluated in Node.js -- an
// environment with no `window` at all. A normal static `import Leaflet from
// 'leaflet'` at the top of this file would crash during that SSR pass.
// Using a dynamic `import()` inside a useEffect defers loading Leaflet
// until code is actually running in the browser (after mount), sidestepping
// SSR entirely.

import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

// LeafletMap is defined below and only ever imported client-side via useState + useEffect.
// It is never statically imported at the top level, so Metro's SSR pass never evaluates it.

// TrailMap (web)
// --------------
// Purpose: act as a client-only loading gate in front of the real Leaflet
// trail map, so Leaflet's `window`-dependent code never runs during
// server-side rendering.
//
// Props: accepts the exact same prop bag as TrailMap.native.tsx (typed
// loosely as `props: any`, matching the shared TrailMap.d.ts contract) --
// walkedCoords, remainingCoords, allLandmarks, trailCoords, trailRegion,
// userPosition, milesWalked, mapRef, dStyles, theme, onLandmarkPress,
// onRecenter, etc. This component doesn't need to know what most of them
// mean; it only reads `dStyles` and `theme` directly (for the loading/error
// placeholder UI) and forwards the entire `props` object untouched to the
// real map once it's loaded.
//
// Returns: while loading, a spinner placeholder; if the dynamic import
// fails, a "Map unavailable" placeholder; otherwise, the real
// <LeafletMap {...props} /> component.
export default function TrailMap(props: any) {
    // Pull out just the two props this wrapper itself needs directly, to
    // style its own loading/error placeholders consistently with the rest
    // of the app's theme.
    const { dStyles, theme } = props;

    // LeafletMap: holds the actual map component function once the dynamic
    // import resolves. Starts out `null`, meaning "not loaded yet."
    // loading: true until the dynamic import settles (success OR failure).
    // Start with no map component and show a placeholder while loading.
    const [LeafletMap, setLeafletMap] = useState<React.ComponentType<any> | null>(null);
    const [loading, setLoading] = useState(true);

    // Runs exactly once, right after this component first mounts in the
    // browser (empty dependency array `[]`). By the time a useEffect body
    // runs, React guarantees we're in a real browser environment (never
    // during SSR), which is exactly why the Leaflet import is placed here
    // rather than at the top of the file.
    useEffect(() => {
        // Dynamic import keeps Leaflet out of the SSR bundle entirely.
        import('./LeafletMap')
            .then(mod => {
                // ES module dynamic imports resolve to a module namespace
                // object; `.default` is this file's `export default`.
                // Wrapping it in `() => mod.default` (a function that
                // RETURNS the component) is important: passing the
                // component directly to setState would make React think
                // you're using the "updater function" form of setState and
                // try to CALL it as `LeafletMap(prevState)` instead of
                // storing it.
                setLeafletMap(() => mod.default);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    // While the dynamic import is still in flight: show a full-size
    // spinner over a subtle tinted background (theme.border), matching the
    // map's eventual footprint (dStyles.mapContainer) so nothing jumps
    // around layout-wise once the real map swaps in.
    if (loading) {
        return (
            <View style={[dStyles.mapContainer, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.border }]}>
                <ActivityIndicator color={theme.accent} size="large" />
                <Text style={{ fontFamily: 'Georgia', fontSize: 13, color: theme.subtext, marginTop: 12 }}>
                    Loading map…
                </Text>
            </View>
        );
    }

    // Loading finished but the import still failed (e.g. a network hiccup
    // fetching the chunk, or an environment where Leaflet genuinely can't
    // run) -- LeafletMap stayed null. Rather than crashing, show a friendly
    // "unavailable" placeholder instead of the map.
    if (!LeafletMap) {
        return (
            <View style={[dStyles.mapContainer, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.border }]}>
                <Text style={{ fontSize: 36, marginBottom: 10 }}>🗺️</Text>
                <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: theme.subtext }}>
                    Map unavailable
                </Text>
            </View>
        );
    }

    // Success: render the real Leaflet-based map, spreading every prop this
    // wrapper received straight through unchanged (walkedCoords, theme,
    // onLandmarkPress, mapRef, etc.) -- LeafletMap.tsx is the component that
    // actually knows what to do with each of them.
    return <LeafletMap {...props} />;
}
