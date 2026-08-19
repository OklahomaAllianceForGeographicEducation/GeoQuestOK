// app/(okage-tabs)/content.tsx
// OKAGE content editor: pick a trail, then edit its description and its
// cross-curricular lesson guide. Every field here is a plain text box or a
// dropdown-style picker — nothing that looks like code or a database table.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { colors } from '../../commonStyles';

// A reusable modal component (own file: components/StandardPickerModal.tsx)
// that lets staff search/browse the Oklahoma Academic Standards library and
// pick one to attach to a lesson plan — the same underlying data as
// (okage-tabs)/standards.tsx, but presented as a pop-up picker here.
import StandardPickerModal from '../../components/StandardPickerModal';
import {
    fetchLessonPlansForTrail,
    // GRADE_TIERS and LESSON_SUBJECTS are constant lists (e.g.
    // elementary/secondary; math/reading/science/etc.) used to build the
    // tier-switcher and the subject sections below.
    GRADE_TIERS,
    LESSON_SUBJECTS,
    resolveLessonPlans,
    upsertLessonPlan,
    type GradeTier,
    type LessonSubject,
} from '../../lib/curriculum';

// A lookup table mapping a lesson-plan "subject" value (e.g. 'reading') to
// the corresponding "subject" name used by the standards library (which
// may use slightly different terminology) — needed so opening the standard
// picker for a given lesson subject pre-filters to the right standards
// subject.
import { LESSON_SUBJECT_TO_STANDARDS_SUBJECT } from '../../lib/standards';
import { fetchTrailList, formatMiles, updateTrailInfo, type TrailSummary } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

export default function OkageContentScreen() {
    const theme = colors.light;

    const [loading, setLoading] = useState(true);
    // The logged-in staff member's user id, used to record who last
    // updated a lesson plan (see upsertLessonPlan's `updatedBy` field
    // below).
    const [staffId, setStaffId] = useState<string | null>(null);
    // The full list of trails shown as the initial picker list.
    const [trails, setTrails] = useState<TrailSummary[]>([]);
    // Which trail is currently being edited. `null` means we're still on
    // the trail-picker list screen; a non-null value switches this
    // component into the "editing" view (see the big `if (selectedTrail)`
    // branch below).
    const [selectedTrail, setSelectedTrail] = useState<TrailSummary | null>(null);

    // Trail info form
    const [route, setRoute] = useState('');
    // Highlights are edited as one big multi-line text block (one
    // highlight per line) rather than individual fields, then split back
    // into an array on save.
    const [highlightsText, setHighlightsText] = useState('');
    const [historicalFocus, setHistoricalFocus] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [savingInfo, setSavingInfo] = useState(false);

    // Lesson guide form
    // Which grade tier's lesson content is currently being edited
    // (elementary vs. secondary) — each trail has a SEPARATE lesson guide
    // per tier.
    const [gradeTier, setGradeTier] = useState<GradeTier>('elementary');
    // The full resolved lesson-plan data for the selected trail across
    // both tiers and all subjects. `ReturnType<typeof resolveLessonPlans>`
    // means "whatever shape resolveLessonPlans() returns" — again avoiding
    // manually re-describing that shape here.
    const [lessonPlans, setLessonPlans] = useState<ReturnType<typeof resolveLessonPlans> | null>(null);
    // The DRAFT (in-progress edit) text for every tier+subject combination,
    // keyed by a string like "elementary:reading". Editing a TextInput
    // updates only its own entry in this object, leaving the rest
    // untouched — this is what lets each subject's textbox be edited
    // independently without them all sharing one variable.
    const [lessonDrafts, setLessonDrafts] = useState<Record<string, { content: string; standardCode: string }>>({});
    const [lessonPlansLoading, setLessonPlansLoading] = useState(false);
    // Tracks which SPECIFIC subject is currently being saved (not just a
    // generic boolean), so only that one subject's save button shows a
    // spinner while the others remain interactive.
    const [savingSubject, setSavingSubject] = useState<LessonSubject | null>(null);
    // Which subject's "browse standards" picker modal is currently open
    // (null = closed).
    const [pickerOpenFor, setPickerOpenFor] = useState<LessonSubject | null>(null);

    useEffect(() => {
        async function bootstrap() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) setStaffId(user.id);
                const list = await fetchTrailList();
                setTrails(list);
            } catch (err: any) {
                Alert.alert('Load Error', err.message || 'Could not load trails.');
            } finally {
                setLoading(false);
            }
        }
        void bootstrap();
    }, []);

    // Switches from the trail-list view into the editing view for a
    // specific trail, pre-filling every form field with that trail's
    // current saved values.
    function openTrail(trail: TrailSummary) {
        setSelectedTrail(trail);
        setRoute(trail.route);
        // Highlights are stored as an array in the database but edited as
        // one text block here — join them with newlines so each highlight
        // appears on its own line in the textarea.
        setHighlightsText(trail.highlights.join('\n'));
        setHistoricalFocus(trail.historicalFocus);
        // `?? ''` converts a null/undefined image_url into an empty string
        // so the TextInput always has a defined string value to control.
        setImageUrl(trail.image_url ?? '');
        // Always reset back to the elementary tier whenever a (possibly
        // different) trail is opened, rather than remembering whatever
        // tier was selected last time.
        setGradeTier('elementary');
    }

    // Loads the lesson plans for whichever trail is currently selected.
    // Re-runs whenever `selectedTrail` changes (a new trail opened, or the
    // user goes back to the list, setting it to null).
    useEffect(() => {
        if (!selectedTrail) {
            setLessonPlans(null);
            setLessonDrafts({});
            return;
        }
        async function loadLessonPlans() {
            setLessonPlansLoading(true);
            try {
                // Fetch whatever lesson plan rows already exist in the
                // database for this trail...
                const dbRows = await fetchLessonPlansForTrail(selectedTrail!.id);
                // ...then "resolve" them: fill in sensible defaults/empty
                // placeholders for any tier+subject combination that
                // doesn't have a saved row yet, so every subject always has
                // SOMETHING to display and edit, even brand new ones.
                // (The `!` after selectedTrail asserts to TypeScript "I
                // know this isn't null here" — safe because we already
                // returned early above if it were.)
                const resolved = resolveLessonPlans(selectedTrail!.id, selectedTrail!.name, dbRows);
                setLessonPlans(resolved);

                // Build the initial lessonDrafts object by walking every
                // combination of grade tier × subject and copying its
                // resolved content/standardCode into a draft entry keyed
                // by "tier:subject".
                const drafts: Record<string, { content: string; standardCode: string }> = {};
                for (const tier of ['elementary', 'secondary'] as GradeTier[]) {
                    for (const subject of LESSON_SUBJECTS) {
                        const plan = resolved[tier][subject.value];
                        drafts[`${tier}:${subject.value}`] = {
                            content: plan.content,
                            // `?? ''` again normalizes a missing standard
                            // code to an empty editable string.
                            standardCode: plan.standardCode ?? '',
                        };
                    }
                }
                setLessonDrafts(drafts);
            } catch (err: any) {
                Alert.alert('Load Error', err.message || 'Could not load the lesson guide.');
            } finally {
                setLessonPlansLoading(false);
            }
        }
        void loadLessonPlans();
    }, [selectedTrail]);

    // Saves the "Trail Description" section (route, highlights,
    // historical focus, image URL) — separate from saving lesson plans.
    async function handleSaveTrailInfo() {
        if (!selectedTrail) return;
        setSavingInfo(true);
        try {
            // Convert the multi-line highlightsText back into a clean
            // array: split on newlines, trim each line, then drop any
            // resulting empty lines (e.g. from extra blank lines the user
            // left in the textarea).
            const highlights = highlightsText
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0);

            await updateTrailInfo(selectedTrail.id, { route, highlights, historicalFocus, imageUrl });

            // Update the local `trails` list in place so the trail-list
            // screen (if the user navigates back to it) immediately
            // reflects the just-saved changes, without needing to
            // re-fetch the whole list from the server.
            setTrails((prev) =>
                prev.map((t) => (t.id === selectedTrail.id ? { ...t, route, highlights, historicalFocus, image_url: imageUrl } : t))
            );
            Alert.alert('Saved', 'Trail description updated.');
        } catch (err: any) {
            Alert.alert('Save Failed', err.message || 'Could not save trail info.');
        } finally {
            setSavingInfo(false);
        }
    }

    // Saves just ONE subject's lesson plan for the currently selected
    // grade tier — each subject has its own independent "Save" button, so
    // editors don't have to save everything at once.
    async function handleSaveSubject(subject: LessonSubject) {
        if (!selectedTrail || !staffId) return;
        const draft = lessonDrafts[`${gradeTier}:${subject}`];
        if (!draft) return;

        setSavingSubject(subject);
        try {
            // "upsert" = insert if this trail+tier+subject combination
            // doesn't have a row yet, or update the existing row if it does.
            await upsertLessonPlan({
                trailId: selectedTrail.id,
                gradeTier,
                subject,
                content: draft.content,
                // An empty/whitespace-only standard code is saved as null
                // rather than an empty string.
                standardCode: draft.standardCode.trim() || null,
                updatedBy: staffId,
            });
            Alert.alert('Saved', 'Lesson guide updated.');
        } catch (err: any) {
            Alert.alert('Save Failed', err.message || 'Could not save this lesson guide.');
        } finally {
            setSavingSubject(null);
        }
    }

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    // When a trail IS selected, render the full editing view instead of
    // the trail-picker list — this function has two entirely different
    // "screens" it can return depending on state, rather than using
    // separate route files.
    if (selectedTrail) {
        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
                    <Pressable style={styles.backLink} onPress={() => setSelectedTrail(null)}>
                        <Ionicons name="arrow-back" size={16} color={theme.accent} />
                        <Text style={[styles.backLinkText, { color: theme.accent }]}>Back to Trail List</Text>
                    </Pressable>

                    <Text style={[styles.mainHeading, { color: theme.text }]}>{selectedTrail.name}</Text>
                    <Text style={[styles.introText, { color: theme.subtext }]}>
                        {formatMiles(selectedTrail.miles)} miles · {selectedTrail.difficulty}
                    </Text>

                    {/* TRAIL INFO */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Trail Description</Text>

                        <Text style={styles.fieldLabel}>ROUTE (e.g. "Guymon → Boise City → Kenton")</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={route}
                            onChangeText={setRoute}
                            placeholder="Start → Stop → End"
                            placeholderTextColor={theme.subtext}
                        />

                        <Text style={styles.fieldLabel}>HIGHLIGHTS (one per line)</Text>
                        <TextInput
                            style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={highlightsText}
                            onChangeText={setHighlightsText}
                            // The placeholder itself demonstrates the
                            // expected multi-line format using an actual
                            // '\n' newline character inside the string.
                            placeholder={'State Capitol\nFrontier City\n...'}
                            placeholderTextColor={theme.subtext}
                            multiline
                            numberOfLines={4}
                        />

                        <Text style={styles.fieldLabel}>HISTORICAL FOCUS</Text>
                        <TextInput
                            style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={historicalFocus}
                            onChangeText={setHistoricalFocus}
                            placeholder="What historical era or theme does this trail cover?"
                            placeholderTextColor={theme.subtext}
                            multiline
                            numberOfLines={3}
                        />

                        <Text style={styles.fieldLabel}>IMAGE URL (optional)</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={imageUrl}
                            onChangeText={setImageUrl}
                            placeholder="https://..."
                            placeholderTextColor={theme.subtext}
                            autoCapitalize="none"
                        />

                        <Pressable
                            style={[styles.saveButton, { backgroundColor: theme.accent }]}
                            disabled={savingInfo}
                            onPress={() => void handleSaveTrailInfo()}
                        >
                            {savingInfo ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Trail Description</Text>}
                        </Pressable>
                    </View>

                    {/* LESSON GUIDES */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Lesson Guides</Text>

                        {/* A 2-way segmented switch (Elementary /
                            Secondary), same visual pattern as the
                            segmented tab controls seen in other screens. */}
                        <View style={[styles.segmentContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                            {GRADE_TIERS.map((tier) => (
                                <Pressable
                                    key={tier.value}
                                    style={[styles.segmentItem, gradeTier === tier.value && { backgroundColor: theme.accent }]}
                                    onPress={() => setGradeTier(tier.value)}
                                >
                                    <Text style={[styles.segmentText, gradeTier === tier.value ? { color: '#FFF' } : { color: theme.text }]}>
                                        {tier.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        {lessonPlansLoading ? (
                            <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 12 }} />
                        ) : (
                            // One editable block per subject (Reading,
                            // Math, Science, etc. — whatever LESSON_SUBJECTS
                            // defines), all for the currently selected
                            // grade tier.
                            LESSON_SUBJECTS.map((subject) => {
                                const key = `${gradeTier}:${subject.value}`;
                                // Fallback empty draft in case this exact
                                // key somehow isn't populated yet (e.g.
                                // during the brief moment before
                                // loadLessonPlans finishes).
                                const draft = lessonDrafts[key] ?? { content: '', standardCode: '' };
                                const isSaving = savingSubject === subject.value;
                                return (
                                    <View key={subject.value} style={[styles.subjectBlock, { borderColor: theme.border }]}>
                                        <View style={styles.subjectHeader}>
                                            <Ionicons name={subject.icon as any} size={16} color={theme.accent} />
                                            <Text style={[styles.subjectTitle, { color: theme.text }]}>{subject.label}</Text>
                                        </View>

                                        <TextInput
                                            style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                                            value={draft.content}
                                            // Updates only THIS subject's
                                            // draft entry, spreading the
                                            // rest of the drafts object
                                            // (`...prev`) unchanged and only
                                            // overwriting the one key that
                                            // changed.
                                            onChangeText={(text) =>
                                                setLessonDrafts((prev) => ({ ...prev, [key]: { ...draft, content: text } }))
                                            }
                                            placeholder="What should students do for this subject on this trail?"
                                            placeholderTextColor={theme.subtext}
                                            multiline
                                            numberOfLines={3}
                                        />

                                        <Text style={styles.fieldLabel}>STANDARD CODE (optional)</Text>
                                        <View style={styles.standardRow}>
                                            <TextInput
                                                style={[styles.textInput, { flex: 1, backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                                                value={draft.standardCode}
                                                onChangeText={(text) =>
                                                    setLessonDrafts((prev) => ({ ...prev, [key]: { ...draft, standardCode: text } }))
                                                }
                                                placeholder="e.g. 3.RL.2"
                                                placeholderTextColor={theme.subtext}
                                                autoCapitalize="characters"
                                            />
                                            {/* A small icon-only button
                                                that opens the standards
                                                picker modal for THIS
                                                subject, as an alternative
                                                to typing the code manually. */}
                                            <Pressable
                                                style={[styles.browseButton, { borderColor: theme.accent }]}
                                                onPress={() => setPickerOpenFor(subject.value)}
                                            >
                                                <Ionicons name="search" size={16} color={theme.accent} />
                                            </Pressable>
                                        </View>

                                        <Pressable
                                            style={[styles.saveButtonSmall, { borderColor: theme.accent }]}
                                            disabled={isSaving}
                                            onPress={() => void handleSaveSubject(subject.value)}
                                        >
                                            {isSaving ? (
                                                <ActivityIndicator size="small" color={theme.accent} />
                                            ) : (
                                                // subject.label.split(' ')[0]
                                                // grabs just the FIRST word
                                                // of a possibly multi-word
                                                // label (e.g. "Social
                                                // Studies" → "Social"), so
                                                // the button text stays
                                                // short: "Save Social"
                                                // instead of "Save Social
                                                // Studies".
                                                <Text style={[styles.saveButtonSmallText, { color: theme.accent }]}>Save {subject.label.split(' ')[0]}</Text>
                                            )}
                                        </Pressable>
                                    </View>
                                );
                            })
                        )}
                    </View>
                </ScrollView>
                {/* The standards-picker modal lives OUTSIDE the ScrollView
                    (as a sibling), so it overlays the entire screen rather
                    than being confined to/scrolling with the form content. */}
                <StandardPickerModal
                    visible={pickerOpenFor !== null}
                    onClose={() => setPickerOpenFor(null)}
                    accentColor={theme.accent}
                    // Pre-filter the picker to the standards subject that
                    // corresponds to whichever lesson subject's "browse"
                    // button was tapped, via the lookup table imported
                    // above. `undefined` if no picker is open (falls back
                    // to showing all subjects, though the modal itself is
                    // hidden in that case anyway via `visible`).
                    initialSubject={pickerOpenFor ? LESSON_SUBJECT_TO_STANDARDS_SUBJECT[pickerOpenFor] : undefined}
                    onSelect={(standard) => {
                        if (!pickerOpenFor) return;
                        const key = `${gradeTier}:${pickerOpenFor}`;
                        // When the user picks a standard from the modal,
                        // write its code into the matching draft entry's
                        // standardCode field. `prev[key] ?? { content: '' }`
                        // guards against that draft entry not existing yet
                        // for some reason.
                        setLessonDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { content: '' }), standardCode: standard.code } }));
                    }}
                />
            </KeyboardAvoidingView>
        );
    }

    // The default view: no trail selected yet, show the picker list.
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.kicker, { color: theme.accent }]}>CONTENT EDITOR</Text>
                <Text style={[styles.mainHeading, { color: theme.text }]}>Trails & Lesson Guides</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Pick a trail to edit its description or its cross-curricular lesson guide.
                </Text>

                {trails.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>No trails available yet.</Text>
                ) : (
                    trails.map((trail) => (
                        <Pressable
                            key={trail.id}
                            style={({ pressed }) => [
                                styles.trailRowCard,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                                pressed && { opacity: 0.8 },
                            ]}
                            onPress={() => openTrail(trail)}
                        >
                            <View style={{ flex: 1, paddingRight: 12 }}>
                                <Text style={[styles.trailRowName, { color: theme.text }]}>{trail.name}</Text>
                                <Text style={[styles.trailRowMeta, { color: theme.subtext }]}>
                                    {formatMiles(trail.miles)} mi · {trail.difficulty}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
                        </Pressable>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    mainHeading: { fontSize: 24, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    introText: { fontSize: 14, lineHeight: 19, marginBottom: 16 },
    emptyText: { fontSize: 13, fontStyle: 'italic' },

    trailRowCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        padding: 16,
        borderRadius: 14,
        marginBottom: 10,
    },
    trailRowName: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 3 },
    trailRowMeta: { fontSize: 12.5 },

    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    backLinkText: { fontSize: 14, fontWeight: '600', marginLeft: 6 },

    sectionCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 14 },
    fieldLabel: { fontSize: 10, fontWeight: '800', color: '#666', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },
    textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    standardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    browseButton: { borderWidth: 1.5, borderRadius: 10, padding: 10 },
    textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },

    saveButton: { marginTop: 16, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    saveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

    segmentContainer: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, marginBottom: 12 },
    // flex: 1 makes the Elementary/Secondary segments split the container
    // evenly.
    segmentItem: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
    segmentText: { fontSize: 12, fontWeight: '700' },

    // borderTopWidth (instead of a bottom border, or a full box border)
    // draws a divider line above each subject block, visually separating
    // consecutive subjects within the Lesson Guides card.
    subjectBlock: { borderTopWidth: 1, paddingTop: 14, marginTop: 4 },
    subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    subjectTitle: { fontSize: 13, fontWeight: '700' },

    saveButtonSmall: { marginTop: 10, borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 16 },
    saveButtonSmallText: { fontSize: 12, fontWeight: '700' },
});
