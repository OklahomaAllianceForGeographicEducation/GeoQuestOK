// app/trails.tsx
// NOTE: The header comment inside this file says "app/(tabs)/trails.tsx",
// but the file actually lives at app/trails.tsx (outside the tab group),
// so its real route is "/trails" — same stale-comment situation seen in
// data-hub.tsx and trail-builder.tsx.
// Trail catalog screen. It lists all available trails and opens a detail modal
// with route preview, highlights, and historical context.

import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    // StatusBar lets us control the phone's actual system status bar
    // (the strip at the very top with the clock, battery, signal icons) —
    // here just its text color.
    StatusBar,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { colors, DIFFICULTY_COLORS, getTrailStyles } from '../commonStyles';
import ModalBackdrop from '../components/ModalBackdrop';
import RoutePreviewMap from '../components/RoutePreviewMap';
import WebContainer from '../components/WebContainer';
import { fetchTrailDetails, fetchTrailList, formatMiles, type TrailSummary as Trail } from '../lib/trails';
import { showAlert } from '../lib/confirmAlert';
import { isTourActive } from '../lib/onboarding';

// DIFFICULTY_COLORS now imported from commonStyles.ts (the shared design-
// system source of truth) rather than duplicated here — this file used to
// redeclare its own identical copy, which meant an AA-contrast fix to one
// copy could silently drift from the other. Found by an /impeccable audit.

// Small card used in the scrollable trail catalog.
// This is a separate, smaller component (rather than inline JSX in the
// main screen below) so it can be reused cleanly for every trail in the
// list via .map(), and so its own props are clearly typed.
function TrailCard({ trail, onPress, tStyles }: {
    trail: Trail;
    onPress: () => void;
    // ReturnType<typeof getTrailStyles> is a TypeScript trick: instead of
    // manually writing out the whole shape of the styles object, this
    // just says "whatever type getTrailStyles() returns" — so if that
    // function's returned styles ever change, this prop type
    // automatically stays in sync without needing manual updates.
    tStyles: ReturnType<typeof getTrailStyles>;
}) {
    const diffColor = DIFFICULTY_COLORS[trail.difficulty];
    // Optional chaining + .trim(): if image_url is null/undefined, this
    // becomes undefined; otherwise it's the URL with whitespace trimmed.
    const imageUri = trail.image_url?.trim();
    return (
        <Pressable
            style={({ pressed }) => [tStyles.card, pressed && tStyles.cardPressed]}
            onPress={onPress}
        >
            {/* Hero image */}
            {/* Only render a real <Image> if there's an actual image URL;
                otherwise show a placeholder map emoji in a colored box, so
                trails without a photo still look intentional rather than
                broken. */}
            {imageUri ? (
                <Image
                    source={{ uri: imageUri }}
                    style={tStyles.cardImage}
                    contentFit="cover"
                    // Fades the image in over 200 milliseconds once it
                    // finishes loading, rather than popping in abruptly.
                    transition={200}
                />
            ) : (
                <View
                    style={[
                        tStyles.cardImage,
                        {
                            alignItems: 'center',
                            justifyContent: 'center',
                        },
                    ]}
                >
                    <Text style={{ color: '#FFFFFF', fontSize: 28 }}>
                        🗺️
                    </Text>
                </View>
            )}

            {/* Difficulty badge — floats over image */}
            {/* diffColor + 'EE' appends the hex string "EE" to the end of
                the 6-digit hex color, turning it into an 8-digit hex color
                with an alpha (transparency) channel. "EE" in hex is
                roughly 93% opacity — so the badge is a solid, but very
                slightly see-through, version of the difficulty color. */}
            <View style={[tStyles.difficultyBadge, { backgroundColor: diffColor + 'EE' }]}>
                <Text style={tStyles.difficultyBadgeText}>{trail.difficulty}</Text>
            </View>

            {/* Info row below image */}
            <View style={tStyles.cardBody}>
                <Text style={tStyles.cardTitle} numberOfLines={1}>{trail.name}</Text>
                <View style={tStyles.cardMeta}>
                    <Text style={tStyles.cardDistance}>📍 {formatMiles(trail.miles)} miles</Text>
                </View>
                <Text style={tStyles.cardRoute} numberOfLines={1}>{trail.route}</Text>
            </View>
        </Pressable>
    );
}

// Detail sheet that shows the selected trail and a route preview.
function TrailModal({ trail, routeGeojson, routePreviewLoading, onClose, scheme, tStyles }: {
    trail: Trail;
    // `any` here means the exact shape of the GeoJSON data isn't strictly
    // typed — GeoJSON has a fairly complex/nested structure, so it's
    // treated loosely rather than fully modeled with TypeScript types.
    routeGeojson: any;
    routePreviewLoading: boolean;
    onClose: () => void;
    scheme: 'light' | 'dark';
    tStyles: ReturnType<typeof getTrailStyles>;
}) {
    const diffColor = DIFFICULTY_COLORS[trail.difficulty];
    const imageUri = trail.image_url?.trim();
    // Convert the raw GeoJSON route data into a flat array of
    // {latitude, longitude} points the map component can actually draw.
    // useMemo avoids re-parsing the GeoJSON on every re-render — only
    // recalculates when `routeGeojson` itself changes.
    const trailCoords = useMemo(() => geojsonLineToCoords(routeGeojson), [routeGeojson]);
    // Compute a sensible map viewport (center point + zoom level) that
    // frames the whole trail route, recalculated only when the coordinate
    // list changes.
    const previewRegion = useMemo(() => getTrailRegion(trailCoords), [trailCoords]);

    return (
        <Modal
            // `visible` with no value is shorthand for `visible={true}` —
            // this Modal is only ever rendered at all when a trail is
            // selected (see the `{selected && (...)}` check in the main
            // screen below), so it's always meant to display immediately
            // once mounted.
            visible
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            {/* Tapping the dimmed backdrop closes the modal; the sheet
                below is a Pressable that stops that tap from bubbling back
                up to this one, so tapping inside it doesn't close it. */}
            <ModalBackdrop style={tStyles.modalOverlay} onPress={onClose}>
                <Pressable style={tStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
                    {/* Hero */}
                    {imageUri ? (
                        <Image
                            source={{ uri: imageUri }}
                            style={tStyles.modalImage}
                            contentFit="cover"
                        />
                    ) : (
                        <View style={[tStyles.modalImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors[scheme].border }]}>
                            <Text style={{ color: colors[scheme].subtext, fontSize: 34 }}>🗺️</Text>
                        </View>
                    )}

                    {/* Close pill */}
                    <Pressable style={tStyles.closeButton} onPress={onClose}>
                        <Text style={tStyles.closeButtonText}>✕</Text>
                    </Pressable>

                    {/* Difficulty badge */}
                    <View style={[tStyles.modalDiffBadge, { backgroundColor: diffColor }]}>
                        <Text style={tStyles.difficultyBadgeText}>{trail.difficulty}</Text>
                    </View>

                    {/* Content */}
                    <ScrollView
                        style={tStyles.modalScroll}
                        contentContainerStyle={tStyles.modalContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={tStyles.modalTitle}>{trail.name}</Text>
                        <Text style={tStyles.modalDistance}>{formatMiles(trail.miles)} miles</Text>

                        <View style={tStyles.modalDivider} />

                        <Text style={tStyles.modalSectionLabel}>ROUTE</Text>
                        <Text style={tStyles.modalBodyText}>{trail.route}</Text>

                        <Text style={tStyles.modalSectionLabel}>HIGHLIGHTS</Text>
                        {/* Each highlight becomes its own bulleted line,
                            using a plain "· " character as the bullet
                            glyph rather than a native list component
                            (React Native has no built-in <ul>/<li>). */}
                        {trail.highlights.map((h, i) => (
                            <Text key={i} style={tStyles.modalBullet}>· {h}</Text>
                        ))}

                        <Text style={tStyles.modalSectionLabel}>HISTORICAL FOCUS</Text>
                        <Text style={tStyles.modalBodyText}>{trail.historicalFocus}</Text>

                        <Text style={tStyles.modalSectionLabel}>ROUTE PREVIEW</Text>
                        <View style={tStyles.previewMapFrame}>
                            {/* While the full route GeoJSON is still being
                                fetched (see the useEffect in the main
                                screen below), show a spinner instead of an
                                empty/broken map. */}
                            {routePreviewLoading ? (
                                <View style={tStyles.previewLoading}>
                                    <ActivityIndicator size="small" color={colors[scheme].accent} />
                                    <Text style={tStyles.previewLoadingText}>Loading route preview…</Text>
                                </View>
                            ) : (
                                <RoutePreviewMap
                                    coords={trailCoords}
                                    region={previewRegion}
                                    accentColor={colors[scheme].secondary}
                                    subtextColor={colors[scheme].subtext}
                                    borderColor={colors[scheme].border}
                                    theme={colors[scheme]}
                                />
                            )}
                        </View>
                    </ScrollView>
                </Pressable>
            </ModalBackdrop>
        </Modal>
    );
}

// Main trails screen component.
export default function TrailsScreen() {
    // useColorScheme() can return 'light', 'dark', or null. This line
    // normalizes anything that ISN'T exactly 'dark' down to 'light',
    // guaranteeing `scheme` is always one of the two valid theme keys
    // (slightly different, more explicit approach than the `?? 'light'`
    // pattern used in other files).
    const rawScheme = useColorScheme();
    const scheme: 'light' | 'dark' = rawScheme === 'dark' ? 'dark' : 'light';
    const theme = colors[scheme];
    const tStyles = getTrailStyles(theme);

    // Which trail (if any) is currently open in the detail modal. `null`
    // means the modal is closed.
    const [selected, setSelected] = useState<Trail | null>(null);
    // The detailed GeoJSON route data for whichever trail is currently
    // selected — fetched lazily (only once a trail is actually opened),
    // not as part of the initial trail list.
    const [selectedRouteGeojson, setSelectedRouteGeojson] = useState<any>(null);
    const [routePreviewLoading, setRoutePreviewLoading] = useState(false);
    // The full catalog of trails shown in the scrollable list.
    const [trails, setTrails] = useState<Trail[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch the active trail list when the screen mounts.
    useEffect(() => {
        let isMounted = true;

        async function loadTrails() {
            try {
                const data = await fetchTrailList();

                if (isMounted) {
                    setTrails(data);
                }
            } catch (error) {
                console.error('Failed to load trails:', error);

                if (isMounted) {
                    showAlert(
                        'Error',
                        'Unable to load trails right now.'
                    );
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        loadTrails();

        return () => {
            isMounted = false;
        };
    }, []);

    // Fetch the full GeoJSON route only when the user opens a trail modal.
    // Re-runs every time `selected` changes — i.e. every time a different
    // trail card is tapped (or the modal is closed, setting selected back
    // to null).
    useEffect(() => {
        let isMounted = true;

        async function loadSelectedRouteGeojson() {
            if (!selected) {
                // No trail is selected (modal closed) — clear out any
                // previously loaded route data and make sure the loading
                // spinner isn't stuck on.
                setSelectedRouteGeojson(null);
                setRoutePreviewLoading(false);
                return;
            }

            setRoutePreviewLoading(true);
            try {
                // Only the lightweight trail summary (name, miles,
                // difficulty, etc.) is loaded up front for the whole list;
                // the full route line (which can be a large amount of
                // GeoJSON coordinate data) is only fetched once a specific
                // trail is opened — this keeps the initial trail list fast
                // to load.
                const detail = await fetchTrailDetails(String(selected.id));
                if (isMounted) {
                    // `?? null` normalizes a missing routeGeojson field to
                    // an explicit null rather than undefined.
                    setSelectedRouteGeojson(detail?.routeGeojson ?? null);
                }
            } catch {
                // No error variable captured here (an empty `catch {}`
                // block) — any failure just silently falls back to no
                // route data, rather than showing an alert; the map
                // component itself likely just renders empty/blank in
                // that case.
                if (isMounted) {
                    setSelectedRouteGeojson(null);
                }
            } finally {
                if (isMounted) {
                    setRoutePreviewLoading(false);
                }
            }
        }

        loadSelectedRouteGeojson();

        return () => {
            isMounted = false;
        };
    }, [selected]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* barStyle controls whether the status bar's TEXT/icons
                (clock, battery, etc.) are drawn light or dark, so they
                stay legible against whichever background color this
                screen is currently using. */}
            <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />

            {/* On a wide browser window, cap this single-column card list to
                a comfortable reading width and center it, instead of
                stretching short, wide cards across the whole screen. */}
            <WebContainer maxWidth={720} style={{ flex: 1, width: '100%' }}>
                {/* Header */}
                <View style={tStyles.header}>
                    <Text style={tStyles.headerTitle}>Trails</Text>
                    <Text style={tStyles.headerSubtitle}>{trails.length} routes to explore</Text>
                </View>

                {/* Card list */}
                <ScrollView
                    contentContainerStyle={tStyles.list}
                    showsVerticalScrollIndicator={false}
                >
                    {loading && (
                        <ActivityIndicator
                            size="large"
                            color={theme.accent}
                            style={{ marginVertical: 24 }}
                        />
                    )}
                    {trails.map(trail => (
                        <TrailCard
                            key={trail.id}
                            trail={trail}
                            // Skip opening the detail modal while a guided
                            // tour is active -- see lib/onboarding.ts's
                            // isTourActive(): two Modals racing for top
                            // stacking on web is what let this modal cover
                            // the tour's own tooltip.
                            onPress={() => { if (!isTourActive()) setSelected(trail); }}
                            tStyles={tStyles}
                        />
                    ))}
                </ScrollView>
            </WebContainer>

            {/* Detail modal */}
            {/* Only mount the (fairly heavy) TrailModal component at all
                when a trail is actually selected — when `selected` is
                null, this whole block evaluates to false/nothing, so the
                modal doesn't exist in the tree at all until needed. */}
            {selected && (
                <TrailModal
                    trail={selected}
                    routeGeojson={selectedRouteGeojson}
                    routePreviewLoading={routePreviewLoading}
                    onClose={() => setSelected(null)}
                    scheme={scheme}
                    tStyles={tStyles}
                />
            )}
        </View>
    );
}

// Coordinate shape used by the route preview helpers below.
type Coordinate = { latitude: number; longitude: number };

// Convert route GeoJSON into MapView-friendly coordinates.
// GeoJSON coordinates are famously stored as [longitude, latitude] (NOT
// latitude-first, unlike most everyday map APIs) and can be nested at
// different depths depending on the geometry type (a single LineString vs.
// a MultiLineString made of several separate line segments, etc.). This
// function recursively digs through whatever nesting it finds and flattens
// everything into one simple list of {latitude, longitude} points.
function geojsonLineToCoords(geojson: any): Coordinate[] {
    // If there's no valid `features` array at all, there's nothing to
    // extract — bail out with an empty list.
    if (!Array.isArray(geojson?.features)) return [];

    const coords: Coordinate[] = [];

    // A recursive helper: given some nested array structure, either treat
    // it as one raw [lng, lat] coordinate pair (base case) or dig one
    // level deeper into each of its own array entries (recursive case).
    const pushCoords = (value: any) => {
        if (!Array.isArray(value)) return;

        // Base case: this array looks like exactly one coordinate pair —
        // at least 2 elements, and the first two are both numbers (a raw
        // [longitude, latitude], possibly with an optional 3rd elevation
        // value that we ignore). Push it as a properly-shaped Coordinate,
        // swapping the order since GeoJSON stores longitude first.
        if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
            coords.push({ latitude: value[1], longitude: value[0] });
            return;
        }

        // Recursive case: this array isn't a single coordinate pair
        // itself — it must be a list of MORE arrays (e.g. a list of
        // coordinate pairs, or a list of line segments each containing
        // their own coordinate pairs). Recurse into each item until we
        // eventually hit the base case above.
        for (const item of value) {
            pushCoords(item);
        }
    };

    // Every "feature" in the GeoJSON FeatureCollection has its own
    // geometry.coordinates — process each one.
    for (const feature of geojson.features) {
        pushCoords(feature?.geometry?.coordinates);
    }

    return coords;
}

// Build a sensible preview region for the selected trail.
// A "region" here means the map's initial center point + zoom level
// (expressed as latitude/longitude "deltas" — smaller delta = more zoomed
// in), sized to comfortably fit the entire trail route on screen.
function getTrailRegion(coords: Coordinate[]) {
    if (!coords.length) {
        // No coordinates at all (e.g. this trail has no route data yet) —
        // fall back to a fixed default region centered on Oklahoma City
        // (35.4676° N, -97.5164° W) at a moderately zoomed-out view.
        return {
            latitude: 35.4676,
            longitude: -97.5164,
            latitudeDelta: 0.25,
            longitudeDelta: 0.25,
        };
    }

    // Walk every coordinate to find the bounding box (the smallest
    // rectangle that contains every point on the route) — the min/max
    // latitude and longitude across the whole route.
    const bounds = coords.reduce(
        (acc, coord) => ({
            minLat: Math.min(acc.minLat, coord.latitude),
            maxLat: Math.max(acc.maxLat, coord.latitude),
            minLng: Math.min(acc.minLng, coord.longitude),
            maxLng: Math.max(acc.maxLng, coord.longitude),
        }),
        // Seed the accumulator with the very first coordinate as both the
        // initial min AND max, so the very first comparison in the
        // reduce loop has something valid to compare against.
        {
            minLat: coords[0].latitude,
            maxLat: coords[0].latitude,
            minLng: coords[0].longitude,
            maxLng: coords[0].longitude,
        }
    );

    // The "delta" is how much latitude/longitude range the map view
    // should show — essentially the zoom level. Multiplying the actual
    // route's span by 1.35 adds roughly 35% padding around the route so
    // it isn't cropped right at the screen edges. Math.max(..., 0.08)
    // enforces a MINIMUM zoom-out level, so an extremely short/straight
    // trail (where the bounding box might be nearly zero-sized) doesn't
    // zoom in so far that the map becomes meaningless or the route
    // disappears entirely.
    const latitudeDelta = Math.max((bounds.maxLat - bounds.minLat) * 1.35, 0.08);
    const longitudeDelta = Math.max((bounds.maxLng - bounds.minLng) * 1.35, 0.08);

    return {
        // Center point is simply the midpoint between the min and max on
        // each axis.
        latitude: (bounds.minLat + bounds.maxLat) / 2,
        longitude: (bounds.minLng + bounds.maxLng) / 2,
        latitudeDelta,
        longitudeDelta,
    };
}
