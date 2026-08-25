// components/TrailLandmarksEditor.tsx
//
// FILE OVERVIEW
// -------------
// Component: TrailLandmarksEditor (default export)
// Platform: SHARED -- built entirely from react-native primitives (View,
//   TextInput, Pressable, etc.), plus one `Platform.OS` check (for the web
//   `alert()` vs. native `Alert.alert()` split inside showAlert below and
//   for a monospace font choice in the styles), so it runs the same on iOS,
//   Android, and web without a `.native.tsx` / `.web.tsx` file split.
// Responsibility: OKAGE-facing editor for a trail's landmark points and (as
//   a raw-JSON fallback) its route line. Sits inside
//   app/(okage-tabs)/content.tsx's per-trail editing view, right below the
//   Trail Description card. Lets staff (1) see the existing landmarks
//   sorted by mile marker, (2) delete one, (3) add a new one through a
//   guided form (title/description/fun-fact/lat/lng/mile marker), and (4),
//   behind a collapsed "Advanced" toggle, directly edit the trail's raw
//   GeoJSON for both landmarks and the route line as text.
//
// This intentionally does NOT attempt to re-route the trail line when a
// landmark is added -- automatically recalculating a walkable path through
// a new point is a real pathfinding problem, not a form-editing one.
// Adding a landmark only adds a point near the trail; if the route itself
// needs to change, staff can edit its raw GeoJSON directly in the Advanced
// section below. Both landmarks_geojson and route_geojson drive the
// mileage-unlock math students rely on, so every save here is explicit and
// warns about that before it happens (see supabase/okage-role.sql's note
// on why these columns were originally left out of the app-facing form).
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Theme } from '../commonStyles';
import { confirmAlert } from '../lib/confirmAlert';
import { fetchTrailDetails, updateTrailGeojson } from '../lib/trails';

// showAlert
// ---------
// Purpose: a tiny cross-platform "show the user a message" helper. React
// Native's Alert.alert works on iOS/Android, but has no effect in a web
// browser, so this branches on Platform.OS to use the browser's native
// alert() there instead. Every call also console.warns first, so the
// message is visible in dev tools/logs even in headless test runs where no
// dialog is actually shown.
// Params: title (short heading) and message (body text).
// Returns: nothing (void) -- purely a side-effecting helper.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

// The shape of one landmark as a GeoJSON Point Feature -- the format these
// are stored in within the trail's landmarks_geojson column. `id` can be a
// number or string (existing data may use either); `geometry.coordinates`
// follows GeoJSON's [longitude, latitude] order (note: longitude FIRST,
// which is the opposite order from the {latitude, longitude} objects used
// elsewhere in this app -- easy to trip over). `properties` holds the
// human-facing fields (title, description, etc.) plus an open-ended
// `[key: string]: any` so unrecognized/legacy properties survive round-trips
// through this editor untouched.
type LandmarkFeature = {
    type: 'Feature';
    id: number | string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
        title?: string;
        description?: string;
        funFact?: string;
        NearestMile?: number;
        category?: string;
        [key: string]: any;
    };
};

// A standard GeoJSON FeatureCollection: a wrapper object holding an array
// of features (here, LandmarkFeature-shaped Points, though typed loosely as
// `any[]` since raw-JSON edits could technically contain other feature
// types).
type FeatureCollection = { type: 'FeatureCollection'; features: any[] };

// A reusable "empty" collection constant, used both as the initial state
// value and as a fallback whenever loaded data turns out not to actually be
// a valid FeatureCollection.
const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

// Type guard: checks that an arbitrary value has the minimal shape of a
// GeoJSON FeatureCollection (right `type` string, and a `features` array).
// Used both to validate data loaded from the server and to validate
// raw-JSON pasted into the Advanced editor before saving it.
function isFeatureCollection(value: any): value is FeatureCollection {
    return value && value.type === 'FeatureCollection' && Array.isArray(value.features);
}

// Computes a new unique numeric id for a landmark being added, one higher
// than the current highest existing numeric id (falls back to 0 + 1 = 1 if
// there are no existing numeric ids, e.g. an empty list or one where all
// ids happen to be non-numeric strings). This is a simple
// "max-plus-one" id scheme -- fine for a low-volume, staff-only editing
// tool, though it does mean re-adding after deleting the highest-id
// landmark reuses that same id rather than ever skipping backward.
function nextFeatureId(features: any[]): number {
    const numericIds = features.map((f) => Number(f?.id)).filter((n) => Number.isFinite(n));
    return (numericIds.length > 0 ? Math.max(...numericIds) : 0) + 1;
}

// TrailLandmarksEditor
// ---------------------
// Purpose: the full landmark-management UI described in the file overview
// above -- view/delete existing landmarks, add a new one via a guided form,
// and (behind an Advanced toggle) hand-edit the raw GeoJSON for both
// landmarks and the route line.
//
// Props:
// - trailId: which trail's landmark/route data to load and save.
// - theme: the active color theme object (see commonStyles.ts) driving
//   every themed color via getStyles below.
//
// Returns: a card-styled <View> containing (in order) the landmark list, a
// guided "Add Landmark" form, an "Advanced" toggle, and -- when that toggle
// is open -- raw GeoJSON text editors for landmarks and route with their
// own Save button. While the initial trail data is still loading, just a
// spinner is shown instead.
export default function TrailLandmarksEditor({ trailId, theme }: { trailId: string; theme: Theme }) {
    const styles = getStyles(theme);

    // True until the initial fetchTrailDetails call resolves; shows a
    // spinner card in place of the whole editor while true.
    const [loading, setLoading] = useState(true);
    // True while a guided-form add/delete save is in flight (persistLandmarks).
    // Disables the Add Landmark button and swaps it for a spinner.
    const [saving, setSaving] = useState(false);
    // The current landmarks FeatureCollection, as loaded from (or saved
    // back to) the server. This is the "source of truth" the landmark list
    // renders from.
    const [landmarksGeojson, setLandmarksGeojson] = useState<FeatureCollection>(EMPTY_COLLECTION);
    // The current route GeoJSON (a Feature or FeatureCollection, or null).
    // This component never edits the route through the guided form -- only
    // through the raw JSON textarea -- but it still needs to hold onto the
    // current value so persistLandmarks can pass it back through
    // unchanged when only the landmarks are being saved.
    const [routeGeojson, setRouteGeojson] = useState<any>(null);

    // "Add Landmark" mini-form fields.
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [funFact, setFunFact] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [nearestMile, setNearestMile] = useState('');

    // Advanced raw-JSON editor: hidden by default so most staff never see
    // it, since landmark deletion + the guided add-form above cover the
    // common case.
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [landmarksRawText, setLandmarksRawText] = useState('');
    const [routeRawText, setRouteRawText] = useState('');
    const [savingRaw, setSavingRaw] = useState(false);

    // Loads this trail's landmark and route data whenever `trailId` changes
    // (including on first mount). Populates both the "live" state
    // (landmarksGeojson/routeGeojson, which the guided list/form use) and
    // the raw-text mirrors (landmarksRawText/routeRawText, pretty-printed
    // with 2-space indentation) that back the Advanced textareas -- so
    // opening Advanced always starts from an accurate up-to-date snapshot.
    // The `mounted` flag is the standard guard against calling setState
    // after this component has already unmounted (e.g. staff navigates away
    // while the fetch is still in flight) -- without it, React would warn
    // about (or in some versions, silently ignore) a state update on an
    // unmounted component.
    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                const details = await fetchTrailDetails(trailId);
                if (!mounted) return;
                // Defensive validation: if the server ever returns something
                // that isn't a proper FeatureCollection (missing/malformed
                // data), fall back to an empty one rather than crashing the
                // list-rendering logic below.
                const landmarks = isFeatureCollection(details.landmarksGeojson) ? details.landmarksGeojson : EMPTY_COLLECTION;
                setLandmarksGeojson(landmarks);
                setRouteGeojson(details.routeGeojson ?? null);
                setLandmarksRawText(JSON.stringify(landmarks, null, 2));
                setRouteRawText(JSON.stringify(details.routeGeojson ?? null, null, 2));
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load this trail’s landmark data.');
            } finally {
                if (mounted) setLoading(false);
            }
        }

        void load();
        return () => {
            mounted = false;
        };
    }, [trailId]);

    // Derived (not stateful) flag: the guided "Add Landmark" form is only
    // submittable once a non-blank title AND valid numeric latitude AND
    // valid numeric longitude have all been entered. The `.trim() !== ''`
    // checks matter because `Number('')` evaluates to 0, which
    // Number.isFinite would otherwise accept as "valid" even though the
    // field is actually empty.
    const canAddLandmark = title.trim().length > 0 && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && latitude.trim() !== '' && longitude.trim() !== '';

    // Saves an updated landmarks FeatureCollection to the server (via
    // updateTrailGeojson), sending the current routeGeojson back through
    // unchanged alongside it since the update API call saves both fields
    // together. On success, updates both the live state and the raw-text
    // mirror so the Advanced textarea stays in sync with whatever the
    // guided list/form just did. Used by both handleAddLandmark and
    // handleDeleteLandmark below.
    async function persistLandmarks(next: FeatureCollection) {
        try {
            setSaving(true);
            await updateTrailGeojson(trailId, { routeGeojson, landmarksGeojson: next });
            setLandmarksGeojson(next);
            setLandmarksRawText(JSON.stringify(next, null, 2));
        } catch (err: any) {
            showAlert('Save Failed', err.message || 'Could not save the landmark change.');
        } finally {
            setSaving(false);
        }
    }

    // Handles the "Add Landmark" button. Re-checks canAddLandmark (in case
    // this were ever called from somewhere the button's `disabled` prop
    // didn't already guard) and bails with an explanatory alert if the form
    // isn't actually fillable. Builds a new GeoJSON Point Feature from the
    // form fields -- note coordinates are written as [longitude, latitude],
    // matching GeoJSON's convention even though the form itself is labeled
    // "Latitude" first for a more natural user-facing order. Optional
    // fields (description, funFact, NearestMile) are stored as `undefined`
    // rather than empty strings/0 when left blank, so they're omitted
    // entirely from the saved JSON instead of persisting as empty noise.
    // After a successful save, clears every form field back to blank and
    // shows a confirming alert that reiterates the "this doesn't move the
    // route line" caveat from the file-level comment.
    async function handleAddLandmark() {
        if (!canAddLandmark) {
            showAlert('Missing Information', 'A landmark needs at least a title, latitude, and longitude.');
            return;
        }

        const feature: LandmarkFeature = {
            type: 'Feature',
            id: nextFeatureId(landmarksGeojson.features),
            geometry: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] },
            properties: {
                title: title.trim(),
                description: description.trim() || undefined,
                funFact: funFact.trim() || undefined,
                NearestMile: nearestMile.trim() === '' ? undefined : Number(nearestMile),
                category: 'landmark',
            },
        };

        const next: FeatureCollection = { ...landmarksGeojson, features: [...landmarksGeojson.features, feature] };
        await persistLandmarks(next);
        setTitle('');
        setDescription('');
        setFunFact('');
        setLatitude('');
        setLongitude('');
        setNearestMile('');
        showAlert('Landmark Added', 'The new landmark point was saved. Remember: this only places a point -- it does not move the trail route line itself.');
    }

    // Handles tapping the trash icon next to a landmark row. Shows a
    // confirm dialog (confirmAlert -- a cross-platform yes/no prompt helper,
    // see lib/confirmAlert.ts) before actually removing anything, since
    // deletion is destructive. On confirmation, filters that exact feature
    // object out of the array by reference equality (`f !== feature`) and
    // persists the resulting collection. Not async itself (persistLandmarks
    // is fire-and-forget here via `void`), since there's no follow-up UI
    // step after the confirm dialog closes.
    function handleDeleteLandmark(feature: any) {
        confirmAlert('Remove Landmark', `Remove "${feature.properties?.title ?? 'this landmark'}" from the trail?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: () => {
                    const next: FeatureCollection = {
                        ...landmarksGeojson,
                        features: landmarksGeojson.features.filter((f) => f !== feature),
                    };
                    void persistLandmarks(next);
                },
            },
        ]);
    }

    // Handles the Advanced section's "Save Raw GeoJSON" button. Validates
    // both textareas' contents in three stages before ever touching the
    // network: (1) landmarks text must be parseable JSON, (2) route text
    // must be parseable JSON too (or blank, which is treated as `null`),
    // and (3) the parsed landmarks must actually look like a
    // FeatureCollection, and the parsed route (if not null) must be a
    // GeoJSON Feature or FeatureCollection. Any failure shows a specific
    // alert and returns early without saving. If everything validates, it
    // shows one more confirm dialog (since this direct-JSON path can
    // corrupt the trail's mileage math if done carelessly) before actually
    // calling updateTrailGeojson and updating local state on success.
    async function handleSaveRawJson() {
        let parsedLandmarks: any;
        let parsedRoute: any;
        try {
            parsedLandmarks = JSON.parse(landmarksRawText);
        } catch {
            showAlert('Invalid JSON', 'The Landmarks JSON isn’t valid JSON -- check for a missing comma or bracket.');
            return;
        }
        try {
            parsedRoute = routeRawText.trim() === '' ? null : JSON.parse(routeRawText);
        } catch {
            showAlert('Invalid JSON', 'The Route JSON isn’t valid JSON -- check for a missing comma or bracket.');
            return;
        }
        if (!isFeatureCollection(parsedLandmarks)) {
            showAlert('Invalid Shape', 'Landmarks JSON must be a GeoJSON FeatureCollection (an object with "type": "FeatureCollection" and a "features" array).');
            return;
        }
        if (parsedRoute !== null && parsedRoute.type !== 'Feature' && parsedRoute.type !== 'FeatureCollection') {
            showAlert('Invalid Shape', 'Route JSON must be a GeoJSON Feature or FeatureCollection.');
            return;
        }

        confirmAlert(
            'Save Raw GeoJSON',
            'This overwrites the trail’s raw geometry directly, which drives mileage-unlock math for students on this trail. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    style: 'destructive',
                    onPress: () => void (async () => {
                        try {
                            setSavingRaw(true);
                            await updateTrailGeojson(trailId, { routeGeojson: parsedRoute, landmarksGeojson: parsedLandmarks });
                            setLandmarksGeojson(parsedLandmarks);
                            setRouteGeojson(parsedRoute);
                            showAlert('Saved', 'Raw GeoJSON saved.');
                        } catch (err: any) {
                            showAlert('Save Failed', err.message || 'Could not save the raw GeoJSON.');
                        } finally {
                            setSavingRaw(false);
                        }
                    })(),
                },
            ]
        );
    }

    // Still loading the trail's data: show just a spinner in place of the
    // whole card rather than a half-populated form.
    if (loading) {
        return (
            <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, alignItems: 'center' }]}>
                <ActivityIndicator color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">Landmarks & Route</Text>
            <Text style={[styles.helperText, { color: theme.subtext }]}>
                Add a new landmark point below. This does not move the trail route line itself -- GeoQuestOK doesn’t automatically re-route a
                path to hit a new point. If the route line needs to change too, use the Advanced section to edit its raw GeoJSON directly.
            </Text>

            {/* Landmark list: shows a plain "no landmarks yet" message when
                empty, otherwise every existing landmark sorted by its
                NearestMile property (ascending, treating a missing value as
                0) so they read in the same order a student would encounter
                them while walking the trail. `.slice()` before `.sort()`
                copies the array first since Array.prototype.sort mutates
                in place -- without the copy this would directly reorder
                (and re-render-trigger on) the landmarksGeojson state array
                itself, which React expects to treat as immutable. */}
            {landmarksGeojson.features.length === 0 ? (
                <Text style={[styles.helperText, { color: theme.subtext, fontStyle: 'italic' }]}>No landmarks yet.</Text>
            ) : (
                landmarksGeojson.features
                    .slice()
                    .sort((a, b) => (a.properties?.NearestMile ?? 0) - (b.properties?.NearestMile ?? 0))
                    .map((feature, idx) => (
                        <View key={feature.id ?? idx} style={[styles.landmarkRow, { borderColor: theme.border }]}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                                <Text style={[styles.landmarkTitle, { color: theme.text }]}>{feature.properties?.title ?? 'Untitled'}</Text>
                                {/* Coordinates are stored as GeoJSON
                                    [longitude, latitude] (index 0, index 1)
                                    but displayed here in the more familiar
                                    "latitude, longitude" reading order, so
                                    index [1] (latitude) is printed first and
                                    index [0] (longitude) second. Each is
                                    rounded to 5 decimal places (~1 meter of
                                    precision) purely for readable display --
                                    the underlying stored value keeps full
                                    precision. */}
                                <Text style={[styles.landmarkMeta, { color: theme.subtext }]}>
                                    Mile {feature.properties?.NearestMile ?? '?'} · {feature.geometry?.coordinates?.[1]?.toFixed(5)}, {feature.geometry?.coordinates?.[0]?.toFixed(5)}
                                </Text>
                            </View>
                            <Pressable onPress={() => handleDeleteLandmark(feature)} disabled={saving} accessibilityRole="button" accessibilityLabel={`Remove ${feature.properties?.title ?? 'landmark'}`}>
                                <Ionicons name="trash-outline" size={18} color={theme.error} />
                            </Pressable>
                        </View>
                    ))
            )}

            {/* Guided "Add Landmark" form: each TextInput is a plain
                controlled input bound directly to its own piece of state
                (title/description/funFact/latitude/longitude/nearestMile).
                Latitude and longitude sit side-by-side in a row (styles.row
                + styles.halfInput) since they're naturally a paired
                lat/lng entry. keyboardType hints ("numbers-and-punctuation"
                for lat/lng so a leading "-" is easy to type;
                "decimal-pad" for the mile marker) just improve the on-screen
                keyboard shown on mobile -- they don't restrict/validate
                what can actually be typed. */}
            <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 14 }]}>ADD LANDMARK</Text>

            <TextInput
                style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={theme.subtext}
            />
            <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor={theme.subtext}
                multiline
                numberOfLines={2}
            />
            <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={funFact}
                onChangeText={setFunFact}
                placeholder="Fun fact (optional)"
                placeholderTextColor={theme.subtext}
                multiline
                numberOfLines={2}
            />
            <View style={styles.row}>
                <TextInput
                    style={[styles.textInput, styles.halfInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={latitude}
                    onChangeText={setLatitude}
                    placeholder="Latitude (e.g. 35.4676)"
                    placeholderTextColor={theme.subtext}
                    keyboardType="numbers-and-punctuation"
                />
                <TextInput
                    style={[styles.textInput, styles.halfInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={longitude}
                    onChangeText={setLongitude}
                    placeholder="Longitude (e.g. -97.5164)"
                    placeholderTextColor={theme.subtext}
                    keyboardType="numbers-and-punctuation"
                />
            </View>
            <TextInput
                style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={nearestMile}
                onChangeText={setNearestMile}
                placeholder="Nearest mile marker (optional, e.g. 4.2)"
                placeholderTextColor={theme.subtext}
                keyboardType="decimal-pad"
            />

            {/* Save button for the guided form: greyed out (theme.border
                background) and disabled whenever canAddLandmark is false or
                a save is already underway; swaps its label for a spinner
                while saving. */}
            <Pressable
                style={[styles.saveButton, { backgroundColor: canAddLandmark ? theme.accent : theme.border }]}
                disabled={!canAddLandmark || saving}
                onPress={() => void handleAddLandmark()}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddLandmark || saving, busy: saving }}
            >
                {saving ? <ActivityIndicator color={theme.accentText} /> : <Text style={[styles.saveButtonText, { color: theme.accentText }]}>Add Landmark</Text>}
            </Pressable>

            {/* Collapsed-by-default toggle for the raw-JSON editors below --
                keeps the common case (guided add/delete) uncluttered, since
                most staff never need direct GeoJSON access. The chevron
                icon flips direction (right when closed, down when open) as
                a visual affordance for "this expands." */}
            <Pressable style={styles.advancedToggle} onPress={() => setAdvancedOpen((v) => !v)} accessibilityRole="button">
                <Ionicons name={advancedOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.subtext} />
                <Text style={[styles.advancedToggleText, { color: theme.subtext }]}>Advanced: edit raw GeoJSON</Text>
            </Pressable>

            {/* Advanced section: two plain multiline TextInputs acting as
                raw JSON textareas (autoCapitalize/autoCorrect disabled since
                this is code, not prose), each bound to its own raw-text
                state (landmarksRawText/routeRawText) and validated/saved
                together by handleSaveRawJson when the button below is
                pressed. A prominent warning is shown above them since this
                path bypasses all the guided form's structure and safety. */}
            {advancedOpen && (
                <View>
                    <Text style={[styles.warningText, { color: theme.error }]}>
                        Editing raw GeoJSON directly changes the trail’s route line and mileage-unlock math for students. Double-check
                        coordinates before saving -- an invalid or wildly wrong path here is easy to save by accident.
                    </Text>

                    <Text style={[styles.fieldLabel, { color: theme.subtext }]}>LANDMARKS GEOJSON</Text>
                    <TextInput
                        style={[styles.codeArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                        value={landmarksRawText}
                        onChangeText={setLandmarksRawText}
                        multiline
                        numberOfLines={10}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ROUTE GEOJSON</Text>
                    <TextInput
                        style={[styles.codeArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                        value={routeRawText}
                        onChangeText={setRouteRawText}
                        multiline
                        numberOfLines={10}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    {/* This save button is styled with theme.error (red)
                        rather than the normal accent color, reinforcing
                        that this is the higher-risk, direct-overwrite save
                        path compared to the guided form's Add Landmark
                        button above. */}
                    <Pressable
                        style={[styles.saveButton, { backgroundColor: theme.error }]}
                        disabled={savingRaw}
                        onPress={() => void handleSaveRawJson()}
                        accessibilityRole="button"
                        accessibilityState={{ busy: savingRaw }}
                    >
                        {savingRaw ? <ActivityIndicator color="#fff" /> : <Text style={[styles.saveButtonText, { color: '#fff' }]}>Save Raw GeoJSON</Text>}
                    </Pressable>
                </View>
            )}
        </View>
    );
}

// Theme-aware style factory. Groups: the outer card shell/title/helper
// text, form field styles (plain text input, multiline text area, and the
// monospace-font "codeArea" used for the raw JSON textareas), the
// side-by-side lat/lng row layout, save-button styles, the existing-
// landmark row layout, and the Advanced toggle/warning text.
const getStyles = (theme: Theme) => StyleSheet.create({
    sectionCard: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 20 },
    sectionTitle: { fontSize: 17, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 8 },
    helperText: { fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
    fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6 },
    textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
    textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10, textAlignVertical: 'top' },
    codeArea: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 12,
        marginBottom: 12,
        textAlignVertical: 'top',
        minHeight: 160,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    row: { flexDirection: 'row', gap: 10 },
    halfInput: { flex: 1 },
    saveButton: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    saveButtonText: { fontSize: 14, fontWeight: '800' },
    landmarkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
    landmarkTitle: { fontSize: 13.5, fontWeight: '700' },
    landmarkMeta: { fontSize: 11.5, marginTop: 2 },
    advancedToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 6 },
    advancedToggleText: { fontSize: 12.5, fontWeight: '700' },
    warningText: { fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 12, fontWeight: '600' },
});
