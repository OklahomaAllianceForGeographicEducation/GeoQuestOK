// components/TrailLandmarksEditor.tsx
// OKAGE-facing editor for a trail's landmark points and (as a raw-JSON
// fallback) its route line. Sits inside app/(okage-tabs)/content.tsx's
// per-trail editing view, right below the Trail Description card.
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

function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

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

type FeatureCollection = { type: 'FeatureCollection'; features: any[] };

const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

function isFeatureCollection(value: any): value is FeatureCollection {
    return value && value.type === 'FeatureCollection' && Array.isArray(value.features);
}

function nextFeatureId(features: any[]): number {
    const numericIds = features.map((f) => Number(f?.id)).filter((n) => Number.isFinite(n));
    return (numericIds.length > 0 ? Math.max(...numericIds) : 0) + 1;
}

export default function TrailLandmarksEditor({ trailId, theme }: { trailId: string; theme: Theme }) {
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [landmarksGeojson, setLandmarksGeojson] = useState<FeatureCollection>(EMPTY_COLLECTION);
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

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                const details = await fetchTrailDetails(trailId);
                if (!mounted) return;
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

    const canAddLandmark = title.trim().length > 0 && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && latitude.trim() !== '' && longitude.trim() !== '';

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

            <Pressable
                style={[styles.saveButton, { backgroundColor: canAddLandmark ? theme.accent : theme.border }]}
                disabled={!canAddLandmark || saving}
                onPress={() => void handleAddLandmark()}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddLandmark || saving, busy: saving }}
            >
                {saving ? <ActivityIndicator color={theme.accentText} /> : <Text style={[styles.saveButtonText, { color: theme.accentText }]}>Add Landmark</Text>}
            </Pressable>

            <Pressable style={styles.advancedToggle} onPress={() => setAdvancedOpen((v) => !v)} accessibilityRole="button">
                <Ionicons name={advancedOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.subtext} />
                <Text style={[styles.advancedToggleText, { color: theme.subtext }]}>Advanced: edit raw GeoJSON</Text>
            </Pressable>

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
