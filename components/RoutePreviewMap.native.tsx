// components/RoutePreviewMap.native.tsx
// Native route preview map for iOS and Android.

import { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

type Coordinate = { latitude: number; longitude: number };

type Props = {
    coords: Coordinate[];
    region: Region;
    accentColor: string;
    subtextColor?: string;
    borderColor: string;
};

export default function RoutePreviewMap({ coords, region, accentColor, subtextColor, borderColor }: Props) {
    const mapRef = useRef<MapView | null>(null);

    // Fit the preview map to the route once the coordinates are available.
    useEffect(() => {
        if (!mapRef.current || coords.length < 2) return;

        mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
            animated: false,
        });
    }, [coords]);

    if (coords.length < 2) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: subtextColor ?? borderColor, fontSize: 13 }}>Route preview unavailable</Text>
            </View>
        );
    }

    const start = coords[0];
    const end = coords[coords.length - 1];

    return (
        <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_DEFAULT}
            initialRegion={region}
            onMapReady={() => {
                if (!mapRef.current || coords.length < 2) return;
                mapRef.current.fitToCoordinates(coords, {
                    edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
                    animated: false,
                });
            }}
        >
            <Polyline
                coordinates={coords}
                strokeColor={accentColor}
                strokeWidth={4}
            />
            <Marker coordinate={start} title="Start" pinColor="#34A853" />
            <Marker coordinate={end} title="Finish" pinColor="#EA4335" />
        </MapView>
    );
}
