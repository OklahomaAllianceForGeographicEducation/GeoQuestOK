// components/TrailMap.web.tsx
// Web trail map wrapper. Leaflet touches `window` on import, so we lazy-load
// the real map only after the browser has mounted.

import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

// LeafletMap is defined below and only ever imported client-side via useState + useEffect.
// It is never statically imported at the top level, so Metro's SSR pass never evaluates it.

export default function TrailMap(props: any) {
    const { dStyles, theme } = props;

    // Start with no map component and show a placeholder while loading.
    const [LeafletMap, setLeafletMap] = useState<React.ComponentType<any> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Dynamic import keeps Leaflet out of the SSR bundle entirely.
        import('./LeafletMap')
            .then(mod => {
                setLeafletMap(() => mod.default);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

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

    return <LeafletMap {...props} />;
}
