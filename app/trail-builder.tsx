// app/trail-builder.tsx
// NOTE: The header comment inside this file says
// "app/(teacher-tabs)/trail-builder.tsx", but the file actually lives at
// app/trail-builder.tsx (outside any tab group), so its real route is
// "/trail-builder" — same stale-comment situation as data-hub.tsx.
// A form for building/saving a brand-new custom trail (e.g. for a
// professor's own class) directly into the "trails" table in Supabase.

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../commonStyles';
import WebContainer from '../components/WebContainer';

// TrailDifficulty is a union type of the allowed difficulty strings (e.g.
// 'Easy' | 'Moderate' | ...) defined in lib/trails.ts. TrailSummary
// describes the shape of each row in the "existing trails" list this
// screen displays.
import { fetchTrailList, type TrailDifficulty, type TrailSummary } from '../lib/trails';
import { supabase } from '../utils/supabase';

// The fixed list of difficulty options shown as selectable pills, ordered
// from easiest to hardest. Declared outside the component so it's a
// stable constant, not recreated every render.
const DIFFICULTIES: TrailDifficulty[] = [
    'Easiest',
    'Easy',
    'Easy-Moderate',
    'Moderate',
    'Moderate-Difficult',
    'Difficult',
    'Very Difficult',
    'Most Difficult',
];

// Turns a human-typed trail name into a URL/database-friendly "slug" id —
// e.g. "Physical Geography Field Lab!" becomes "physical-geography-field-lab".
// This is used as the primary key when saving the trail to Supabase.
function slugifyTrailName(name: string) {
    const slug = name
        .trim()                        // remove leading/trailing whitespace
        .toLowerCase()                 // normalize to lowercase
        // Replace any run of one-or-more characters that ISN'T a lowercase
        // letter or digit (the ^ inside [^...] means "not") with a single
        // hyphen. E.g. "Field Lab!!" → "field-lab-" (spaces and "!!" both
        // collapse into one "-").
        .replace(/[^a-z0-9]+/g, '-')
        // Trim away any hyphens that ended up at the very start or very
        // end of the string (e.g. turns "-field-lab-" into "field-lab").
        .replace(/^-+|-+$/g, '');
    // If, after all that, the slug ended up completely empty (e.g. the
    // user typed only punctuation/spaces), fall back to a guaranteed-
    // unique id using the current timestamp in milliseconds, so two blank-
    // named trails never collide.
    return slug || `custom-trail-${Date.now()}`;
}

export default function TrailBuilderScreen() {
    const theme = colors.light;

    // Whether the initial list of existing trails is still loading.
    const [loading, setLoading] = useState(true);
    // Whether a "Save Trail" request is currently in flight.
    const [saving, setSaving] = useState(false);
    // The list of already-saved trails, shown at the bottom of the screen
    // for reference (and refreshed after a successful save).
    const [existingTrails, setExistingTrails] = useState<TrailSummary[]>([]);

    // One piece of state per form field:
    const [trailName, setTrailName] = useState('');
    // Kept as a string (not a number) because TextInput always deals in
    // strings — it gets converted to a real Number() only when needed
    // (validation, saving).
    const [miles, setMiles] = useState('');
    // Defaults to 'Moderate' as a sensible starting difficulty.
    const [difficulty, setDifficulty] = useState<TrailDifficulty>('Moderate');
    const [route, setRoute] = useState('');
    // Free-text, comma-separated list the user types (e.g. "Overlook,
    // Museum, Bridge") — split into an actual array only at save time.
    const [highlights, setHighlights] = useState('');
    const [historical, setHistorical] = useState('');

    useEffect(() => {
        let mounted = true;

        async function loadTrails() {
            try {
                const list = await fetchTrailList();
                if (mounted) setExistingTrails(list);
            } catch (err) {
                console.error('Failed to load trail drafts:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        void loadTrails();

        return () => {
            mounted = false;
        };
    }, []);

    // useMemo recalculates `canSave` only when `miles` or `trailName`
    // change, rather than on every render — a boolean that's true only
    // when there's a real trail name (more than 2 characters after
    // trimming) AND a positive mileage value. Number("") is 0 and
    // Number("abc") is NaN, both of which fail the `> 0` check, so this
    // also guards against empty/non-numeric mileage input.
    const canSave = useMemo(() => trailName.trim().length > 2 && Number(miles) > 0, [miles, trailName]);

    const handleSave = async () => {
        if (!canSave) {
            Alert.alert('Missing Information', 'Please add a trail name and miles before saving.');
            return;
        }

        try {
            setSaving(true);
            // Generate the database id from the trail name up front, so
            // both the initial insert and any later re-save of the same
            // name land on the same row (see upsert below).
            const id = slugifyTrailName(trailName);
            const payload = {
                id,
                name: trailName.trim(),
                // Convert the string input into a real number for storage.
                miles: Number(miles),
                difficulty,
                route: route.trim(),
                // Turn the comma-separated highlights text into a clean
                // array: split on commas, trim whitespace off each piece,
                // then filter out any empty strings (Boolean as a filter
                // function removes falsy values — "" is falsy, so this
                // drops entries like "" left behind by trailing commas or
                // "a,,b").
                highlights: highlights
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean),
                historical_focus: historical.trim(),
                // These three fields aren't collected by this simple form,
                // so they're saved as explicit nulls — presumably filled
                // in later through a different, more advanced editing tool.
                map_url: null,
                image_url: null,
                route_geojson: null,
                landmarks_geojson: null,
                // New custom trails are immediately marked active/visible
                // in the app.
                is_active: true,
            };

            // .upsert() means "insert a new row, OR update the existing
            // row if one with a matching id already exists" — a single
            // call that handles both "create" and "edit" cases.
            // { onConflict: 'id' } tells Supabase which column to check for
            // an existing match.
            const { error } = await supabase.from('trails').upsert(payload, { onConflict: 'id' });
            if (error) throw error;

            Alert.alert('Saved', 'Custom trail saved to Supabase.');
            // Clear the form back to empty so the user can immediately
            // start building another trail without manually erasing
            // everything.
            setTrailName('');
            setMiles('');
            setRoute('');
            setHighlights('');
            setHistorical('');

            // Re-fetch the trail list so the newly saved trail
            // immediately shows up in the "Active Trails" list below.
            const list = await fetchTrailList();
            setExistingTrails(list);
        } catch (err: any) {
            Alert.alert('Save Failed', err.message || 'Could not save the custom trail.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={{ padding: 20 }}>
          <WebContainer maxWidth={720} style={{ width: '100%' }}>
            <Text style={[styles.kicker, { color: theme.accent }]}>CUSTOM TRAIL STUDIO</Text>
            <Text style={[styles.title, { color: theme.text }]}>Build a professor trail or a special class path</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>
                This is the starting point for unique routes, activities, and custom geography modules.
            </Text>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.label, { color: theme.subtext }]}>Trail Name</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={trailName} onChangeText={setTrailName} placeholder="e.g. Physical Geography Field Lab" />

                <Text style={[styles.label, { color: theme.subtext }]}>Miles</Text>
                {/* "decimal-pad" shows a numeric keyboard that includes a
                    decimal point key (as opposed to "numeric", which is
                    whole numbers only), since trail mileage can be
                    fractional (e.g. 24.5). */}
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={miles} onChangeText={setMiles} keyboardType="decimal-pad" placeholder="e.g. 24" />

                <Text style={[styles.label, { color: theme.subtext }]}>Difficulty</Text>
                <View style={styles.pillWrap}>
                    {DIFFICULTIES.map((item) => (
                        <Pressable
                            key={item}
                            // `difficulty === item && {...}` only applies the
                            // highlighted (accent-colored) style to whichever
                            // single pill currently matches the selected
                            // difficulty; every other pill keeps its default
                            // white/gray look.
                            style={[styles.pill, difficulty === item && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                            onPress={() => setDifficulty(item)}
                        >
                            <Text style={[styles.pillText, difficulty === item && { color: '#fff' }]}>{item}</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={[styles.label, { color: theme.subtext }]}>Route Notes</Text>
                {/* multiline lets this TextInput grow to hold several
                    lines of text instead of scrolling horizontally like a
                    single-line field. */}
                <TextInput style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.border }]} value={route} onChangeText={setRoute} placeholder="Guymon → Boise City → Kenton" multiline />

                <Text style={[styles.label, { color: theme.subtext }]}>Highlights</Text>
                <TextInput style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.border }]} value={highlights} onChangeText={setHighlights} placeholder="Comma-separated landmarks or learning stops" multiline />

                <Text style={[styles.label, { color: theme.subtext }]}>Historical Focus</Text>
                <TextInput style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.border }]} value={historical} onChangeText={setHistorical} placeholder="Dust Bowl, geology, statehood..." multiline />

                <Pressable
                    // Grey background (#A5B4C7) when the form isn't valid
                    // yet, accent color once it is — a visual cue that the
                    // button isn't ready to tap, in addition to the actual
                    // `disabled` prop below.
                    style={[styles.saveButton, { backgroundColor: canSave ? theme.accent : '#A5B4C7' }]}
                    // Disabled both when the form is incomplete AND while a
                    // save is already in progress (prevents double-submits).
                    disabled={!canSave || saving}
                    onPress={handleSave}
                >
                    <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Trail to Supabase'}</Text>
                </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text }]}>Active Trails</Text>
            {/* Show only the first 8 existing trails, to keep this
                reference list short rather than dumping potentially dozens
                of trails onto the screen. */}
            {existingTrails.slice(0, 8).map((trail) => (
                <View key={trail.id} style={[styles.trailRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.trailName, { color: theme.text }]}>{trail.name}</Text>
                    {/* .toFixed(1) formats the number to exactly one digit
                        after the decimal point (e.g. 24 → "24.0",
                        24.567 → "24.6" — it also rounds). */}
                    <Text style={[styles.trailMeta, { color: theme.subtext }]}>{trail.miles.toFixed(1)} miles · {trail.difficulty}</Text>
                </View>
            ))}
          </WebContainer>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1 },
    kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
    title: { fontSize: 28, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 6 },
    subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
    card: { borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 20 },
    label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6, marginTop: 6 },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        // Note: this background is hardcoded to white rather than pulled
        // from `theme`, unlike most other colors on this screen — so these
        // inputs would stay white even if this screen were ever switched
        // to follow dark mode.
        backgroundColor: '#fff',
        fontSize: 15,
        marginBottom: 10
    },
    multiline: {
        // Forces the input to be at least 70px tall even when empty, so
        // there's visibly room for multiple lines of text right away.
        minHeight: 70,
        // On Android in particular, multiline TextInputs vertically center
        // their text by default; 'top' anchors typed text to the top of
        // the box instead, which reads more naturally for a growing
        // paragraph of notes.
        textAlignVertical: 'top'
    },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    pill: {
        borderWidth: 1,
        borderColor: '#D1D1D6', // hardcoded light gray, not theme-driven
        // 999 is a common trick for "as rounded as possible" — since the
        // pill's actual height is much less than 999px, the corners end up
        // fully rounded into a capsule/pill shape rather than a rounded
        // rectangle.
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#fff'
    },
    pillText: { fontSize: 12, fontWeight: '700', color: '#1C1C1E' },
    saveButton: { marginTop: 8, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    sectionTitle: { fontSize: 18, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 12 },
    trailRow: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
    trailName: { fontSize: 15, fontWeight: '700' },
    trailMeta: { fontSize: 12, marginTop: 4 },
});
