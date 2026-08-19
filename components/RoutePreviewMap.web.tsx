// components/RoutePreviewMap.web.tsx
// Web wrapper that lazy-loads the Leaflet preview to avoid SSR issues.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

type Coordinate = { latitude: number; longitude: number };

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
};

export default function RoutePreviewMap({ coords, accentColor, subtextColor, borderColor }: Props) {
    const [LeafletPreview, setLeafletPreview] = useState<React.ComponentType<any> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        import('./RoutePreviewLeaflet')
            .then((mod) => {
                setLeafletPreview(() => mod.default);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: borderColor + '33' }}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={{ color: subtextColor, fontSize: 13, marginTop: 8 }}>Loading map preview…</Text>
            </View>
        );
    }

    if (!LeafletPreview) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: subtextColor, fontSize: 13 }}>Route preview unavailable</Text>
            </View>
        );
    }

    const latLngs = coords.map((coord) => [coord.latitude, coord.longitude] as [number, number]);

    return (
        <LeafletPreview
            coords={latLngs}
            accentColor={accentColor}
            subtextColor={subtextColor}
        />
    );
}
