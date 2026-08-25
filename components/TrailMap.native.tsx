// components/TrailMap.native.tsx
//
// FILE OVERVIEW
// -------------
// Component: TrailMap (default export)
// Platform: NATIVE (iOS and Android only). This is one half of a
//   platform-split pair -- see components/TrailMap.web.tsx for the browser
//   implementation and components/TrailMap.d.ts for the shared type
//   contract both sides answer to. Metro (the bundler) automatically picks
//   THIS file whenever some other file does a plain
//   `import TrailMap from '../../components/TrailMap'` (no extension) and
//   the app is running on iOS/Android; the exact same import statement
//   resolves to TrailMap.web.tsx instead when running in a browser. Both
//   files are meant to look and behave the same to the student, just built
//   with different underlying map libraries.
// Responsibility: renders the interactive trail map on the student
//   Dashboard screen (see app/(tabs)/dashboard.tsx) using
//   `react-native-maps`, which wraps Apple Maps (iOS) / Google Maps
//   (Android) native map views. It draws the trail route (split into an
//   already-walked segment and a remaining segment), the trailhead/finish
//   flags, landmark pins (locked vs. unlocked based on progress), the
//   student's live position with a pulsing ring, and a manual "recenter"
//   button.
//
// This version uses react-native-maps and is only loaded on iOS and Android.

import { View, Pressable, Text } from 'react-native';
import { useEffect, useRef } from 'react';
import MapView, { Polyline, Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';

// TrailMap (native)
// -----------------
// Purpose: draw the full native trail map -- route line (walked/remaining),
// start/end flags, landmark markers (locked/unlocked), the student's current
// position, and a recenter button -- for iOS/Android.
//
// Props (all passed in from app/(tabs)/dashboard.tsx; typed as `any` here
// because this file shares its loose contract with TrailMap.d.ts):
// - walkedCoords: array of {latitude, longitude} points describing the
//   portion of the trail the student has already walked. Drawn as a
//   highlighted line.
// - remainingCoords: array of {latitude, longitude} points describing the
//   portion of the trail still ahead. Drawn in a different color.
// - allLandmarks: array of landmark objects (each with at least `id`,
//   `coordinate`, `title`, and `mileMarker`) to render as pins along the
//   route.
// - trailCoords: the full trail route as an ordered array of
//   {latitude, longitude} points (used for the start/end flags and for
//   fitting the camera to the whole route).
// - trailRegion: an optional {latitude, longitude, latitudeDelta,
//   longitudeDelta} region describing the camera's initial framing; if not
//   provided, the camera instead centers tightly on the student's current
//   position.
// - userPosition: the student's current {latitude, longitude}, used to
//   place the "you are here" marker and pulse ring.
// - milesWalked: a precise (non-rounded) number of miles the student has
//   walked so far along this trail -- used to decide which landmarks count
//   as "passed" (unlocked).
// - mapRef: a ref (created by the parent) attached to the underlying
//   MapView so the parent (or this component) can imperatively call
//   methods like `fitToCoordinates` / `animateToRegion` on it.
// - dStyles: a StyleSheet object (created by the parent, likely
//   theme-dependent) providing style objects like `mapContainer`, `map`,
//   `flagMarker`, `landmarkDot`, `landmarkDotPassed`, `landmarkDotFuture`,
//   `userMarkerOuter`, `userMarkerInner`, `recenterButton`, `recenterIcon`.
// - theme: the active color theme object (see commonStyles.ts), used here
//   for route/marker colors (`theme.accent`, `theme.secondary`).
// - onLandmarkPress: callback invoked with a landmark object when the
//   student taps an unlocked landmark's pin (opens that landmark's
//   detail/quiz popup elsewhere in the parent).
// - onRecenter: callback invoked when the student taps the recenter
//   button; the parent handles actually moving the camera back to the
//   student's position.
//
// Returns: a <View> containing the native <MapView> (with its child
// Polylines, Markers, and a Circle) plus a floating recenter button
// overlaid on top.
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
                accessibilityLabel="Trail map showing your progress and nearby landmarks"
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
                // Fires every time the user finishes panning/zooming (not on
                // every intermediate frame). This is how lastRegionRef stays
                // up to date with "wherever the student currently is looking"
                // so a later Android remount (see onMapReady above) can
                // restore that exact view instead of re-fitting to the whole
                // trail.
                onRegionChangeComplete={(region) => { lastRegionRef.current = region; }}
                // The camera's starting framing. `Region` (from
                // react-native-maps) is {latitude, longitude, latitudeDelta,
                // longitudeDelta}: a center point plus how many degrees of
                // latitude/longitude are visible top-to-bottom and
                // left-to-right -- smaller deltas = more zoomed in.
                // Prefer the caller-provided trailRegion (usually a region
                // that already frames the whole trail) when available;
                // otherwise fall back to a region centered tightly on the
                // student's current GPS position with a fixed 0.25-degree
                // span (roughly a ~25km-wide view, used only when no proper
                // trail region was computed upstream).
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
                    // Simple numeric comparison: a landmark counts as
                    // "passed"/unlocked once the student's cumulative miles
                    // walked reaches (or exceeds) that landmark's own mile
                    // marker along the trail.
                    const isPassed = landmark.mileMarker <= milesWalked;
                    return (
                        // Marker's `title` doubles as the locked/unlocked
                        // signal shown in the native map's callout bubble --
                        // showing "🔒 Locked" instead of the real name is a
                        // simple way to avoid spoiling a landmark's title
                        // before the student has actually reached it.
                        <Marker
                            key={landmark.id}
                            coordinate={landmark.coordinate}
                            title={isPassed ? landmark.title : '🔒 Locked'}
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
                    fix as the flags above. `anchor={{x: 0.5, y: 0.5}}` means
                    the marker's own CENTER point sits exactly on the given
                    coordinate (as opposed to the flags above, which use
                    {x: 0.5, y: 1} so the BOTTOM-center of the flag -- like a
                    pin's tip -- sits on the coordinate instead). */}
                <Marker coordinate={userPosition} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <View style={dStyles.userMarkerOuter}>
                        <View style={dStyles.userMarkerInner} />
                    </View>
                </Marker>

                {/* Subtle pulse ring around the user marker: a translucent
                    filled circle, 80 meters in radius (react-native-maps'
                    Circle radius is in meters, not pixels or degrees -- it
                    scales with real-world distance as you zoom). The
                    trailing two-character hex suffixes on theme.accent
                    ('22' and '66') are alpha (opacity) channels appended to
                    the hex color -- '22' is a low ~13% opacity fill, '66' is
                    a slightly stronger ~40% opacity for the outline, giving
                    a soft "glow" look rather than a hard-edged circle. */}
                <Circle
                    center={userPosition}
                    radius={80}
                    fillColor={theme.accent + '22'}
                    strokeColor={theme.accent + '66'}
                    strokeWidth={1}
                />
            </MapView>

            {/* Manual recenter control -- a floating button (styled via
                dStyles.recenterButton, presumably absolutely positioned over
                a corner of the map) that just forwards the tap to the
                parent's onRecenter callback. This component doesn't move
                the camera itself here; the parent (dashboard.tsx) owns
                mapRef and does the actual animateToRegion call. */}
            <Pressable style={dStyles.recenterButton} onPress={onRecenter}>
                <Text style={dStyles.recenterIcon}>◎</Text>
            </Pressable>
        </View>
    );
}
