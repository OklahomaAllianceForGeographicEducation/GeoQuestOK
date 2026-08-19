// components/TrailMap.native.tsx
// Native trail map implementation. This version uses react-native-maps and is
// only loaded on iOS and Android.

import { View, Pressable, Text } from 'react-native';
import { useEffect, useRef } from 'react';
import MapView, { Polyline, Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';

export default function TrailMap({
    walkedCoords,
    remainingCoords,
    allLandmarks,
    trailCoords,
    trailRegion,
    userPosition,
    milesWalked,
    mapRef,
    dStyles,
    theme,
    onLandmarkPress,
    onRecenter,
}: any) {
    // Remembers wherever the student last panned/zoomed to. Opening a
    // landmark's popup renders a full-screen native <Modal> (QuizModal) on
    // top of this map -- on Android that tears down and recreates the
    // MapView's underlying GL surface while the modal is up, which fires
    // onMapReady again once it closes. Without tracking this, that second
    // onMapReady re-fit the camera to the ENTIRE trail's bounding box,
    // zooming all the way out and discarding whatever zoom level the
    // student was actually looking at.
    const lastRegionRef = useRef<any>(null);

    // Keep the map framed around the trail whenever the coordinates change
    // -- but only for the very first load; once the student has actually
    // navigated the map themselves, later trailCoords updates (e.g. a new
    // walked/remaining split from logging miles) shouldn't yank their view
    // back out to the whole route.
    useEffect(() => {
        if (!mapRef?.current || trailCoords?.length < 2) return;
        if (lastRegionRef.current) return;

        mapRef.current.fitToCoordinates(trailCoords, {
            edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
            animated: true,
        });
    }, [mapRef, trailCoords]);

    return (
        <View style={dStyles.mapContainer}>
            <MapView
                // Keying on whether the route has loaded yet forces a clean
                // remount of the whole native map view the moment real
                // trailCoords first arrive, instead of relying on
                // react-native-maps to redraw children (Polyline/Marker)
                // added after the map already mounted -- on iOS that
                // update doesn't always visually take, which is why the
                // trail line and landmark markers could stay invisible
                // until some unrelated prop change (like logging miles)
                // forced a re-render.
                key={trailCoords?.length > 0 ? 'route-loaded' : 'route-empty'}
                ref={mapRef}
                style={dStyles.map}
                provider={PROVIDER_DEFAULT}
                onMapReady={() => {
                    if (!mapRef?.current) return;
                    // If the map view got recreated after the student had
                    // already navigated somewhere (see lastRegionRef above),
                    // restore that instead of re-fitting to the whole trail.
                    if (lastRegionRef.current) {
                        mapRef.current.animateToRegion(lastRegionRef.current, 0);
                        return;
                    }
                    if (trailCoords?.length < 2) return;
                    mapRef.current.fitToCoordinates(trailCoords, {
                        edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
                        animated: true,
                    });
                }}
                onRegionChangeComplete={(region) => { lastRegionRef.current = region; }}
                initialRegion={
                    trailRegion
                        ? trailRegion
                        : {
                            latitude: userPosition.latitude,
                            longitude: userPosition.longitude,
                            latitudeDelta: 0.25,
                            longitudeDelta: 0.25,
                        }
                }
            >
                {/* Walked portion -- a wider white halo underneath the
                    colored line keeps it visible regardless of what color
                    the basemap tile underneath happens to be. */}
                {walkedCoords.length > 1 && (
                    <>
                        <Polyline coordinates={walkedCoords} strokeColor="#FFFFFF" strokeWidth={8} />
                        <Polyline coordinates={walkedCoords} strokeColor={theme.accent} strokeWidth={5} />
                    </>
                )}

                {/* Remaining portion -- same halo treatment. Pine green
                    rather than a flat grey: it reads as "the trail ahead"
                    instead of just an inactive/disabled state. */}
                {remainingCoords.length > 1 && (
                    <>
                        <Polyline coordinates={remainingCoords} strokeColor="#FFFFFF" strokeWidth={8} />
                        <Polyline coordinates={remainingCoords} strokeColor={theme.secondary} strokeWidth={5} />
                    </>
                )}

                {/* Start flag. tracksViewChanges={false}: this marker's
                    content (a static emoji) never changes after its first
                    paint, but react-native-maps defaults custom-view
                    markers to continuously re-snapshotting themselves to a
                    bitmap on Android any time the map re-renders (e.g. on
                    every miles/location update) -- that constant
                    re-snapshotting is what shows up as flickering flags on
                    Android specifically (iOS doesn't need the bitmap
                    snapshot approach at all). Locking it to false after the
                    first render fixes the flicker since there's nothing
                    about this marker that ever needs to be redrawn. */}
                {trailCoords.length > 0 && (
                    <Marker coordinate={trailCoords[0]} anchor={{ x: 0.5, y: 1 }} title="Trailhead" zIndex={5} tracksViewChanges={false}>
                        <Text style={dStyles.flagMarker}>🚩</Text>
                    </Marker>
                )}

                {/* End flag. Same tracksViewChanges={false} reasoning as
                    the start flag above. */}
                {trailCoords.length > 1 && (
                    <Marker coordinate={trailCoords[trailCoords.length - 1]} anchor={{ x: 0.5, y: 1 }} title="Trail End" zIndex={5} tracksViewChanges={false}>
                        <Text style={dStyles.flagMarker}>🏁</Text>
                    </Marker>
                )}

                {/* Landmark markers. A landmark the student hasn't walked far
                    enough to reach yet is locked -- tapping its pin must not
                    open its detail/quiz popup, same rule the landmark strip
                    and "All Landmarks" list already enforce. */}
                {allLandmarks.map((landmark: any) => {
                    // Uses the exact (not rounded-up) milesWalked -- the
                    // walked/orange portion of the route line below is
                    // drawn from this same precise value, so rounding UP
                    // here (the old Math.ceil) let a landmark flip to
                    // "passed" and unlock before the orange line had
                    // actually reached it on the map.
                    const isPassed = landmark.mileMarker <= milesWalked;
                    return (
                        <Marker
                            key={landmark.id}
                            coordinate={landmark.coordinate}
                            title={landmark.title}
                            onPress={() => { if (isPassed) onLandmarkPress(landmark); }}
                        >
                            <View style={[
                                dStyles.landmarkDot,
                                isPassed ? dStyles.landmarkDotPassed : dStyles.landmarkDotFuture,
                            ]} />
                        </Marker>
                    );
                })}

                {/* Current user position. Content is static (position
                    updates are handled natively via the `coordinate` prop,
                    not by redrawing this view), so same tracksViewChanges
                    fix as the flags above. */}
                <Marker coordinate={userPosition} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <View style={dStyles.userMarkerOuter}>
                        <View style={dStyles.userMarkerInner} />
                    </View>
                </Marker>

                {/* Subtle pulse ring around the user marker. */}
                <Circle
                    center={userPosition}
                    radius={80}
                    fillColor={theme.accent + '22'}
                    strokeColor={theme.accent + '66'}
                    strokeWidth={1}
                />
            </MapView>

            {/* Manual recenter control. */}
            <Pressable style={dStyles.recenterButton} onPress={onRecenter}>
                <Text style={dStyles.recenterIcon}>◎</Text>
            </Pressable>
        </View>
    );
}
