// components/RoutePreviewLeaflet.tsx
// Leaflet version of the route preview map used on web.

import { useEffect } from 'react';
import { View, Text } from 'react-native';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type LatLng = [number, number];

type Props = {
    coords: LatLng[];
    accentColor: string;
    subtextColor: string;
};

function FitBounds({ coords }: { coords: LatLng[] }) {
    const map = useMap();

    // Keep the preview zoomed to the route geometry.
    useEffect(() => {
        if (!coords.length) return;
        map.fitBounds(L.latLngBounds(coords), { padding: [24, 24] });
    }, [coords, map]);

    return null;
}

export default function RoutePreviewLeaflet({ coords, accentColor, subtextColor }: Props) {
    if (coords.length < 2) {
        return (
            <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: subtextColor, fontSize: 13 }}>Route preview unavailable</Text>
            </View>
        );
    }

    const start = coords[0];
    const end = coords[coords.length - 1];

    return (
        <MapContainer
            center={start}
            zoom={11}
            style={{ width: '100%', height: '100%' }}
            zoomControl
            scrollWheelZoom
        >
            <FitBounds coords={coords} />
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            />
            <Polyline
                positions={coords}
                pathOptions={{ color: accentColor, weight: 4, opacity: 0.95 }}
            />
            <CircleMarker
                center={start}
                radius={6}
                pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: '#34A853', fillOpacity: 1 }}
            />
            <CircleMarker
                center={end}
                radius={6}
                pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: '#EA4335', fillOpacity: 1 }}
            />
        </MapContainer>
    );
}
