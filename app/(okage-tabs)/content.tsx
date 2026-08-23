// app/(okage-tabs)/content.tsx
// OKAGE content editor: pick a trail, then edit its description, its
// cross-curricular lesson guide, and (per subject) the deeper "Full Lesson
// Plan" a teacher can open from the curriculum tab. Every field here is a
// plain text box, a dropdown-style picker, or a one-per-line textarea —
// nothing that looks like code or a database table.
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
    View, useColorScheme } from 'react-native';
import { colors, Theme } from '../../commonStyles';

// A reusable modal component (own file: components/StandardPickerModal.tsx)
// that lets staff search/browse the Oklahoma Academic Standards library and
// pick one to attach to a lesson plan — the same underlying data as
// (okage-tabs)/standards.tsx, but presented as a pop-up picker here.
import StandardPickerModal from '../../components/StandardPickerModal';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
// Renders a full lesson plan exactly the way a teacher sees it (see
// app/(teacher-tabs)/curriculum.tsx) — reused here as a live "Preview"
// button so OKAGE staff can check their work without leaving this screen.
import FullLessonPlanModal from '../../components/FullLessonPlanModal';
import TourTarget from '../../components/tour/TourTarget';
// Lets OKAGE staff add/remove trail landmark points (and, as an advanced
// fallback, edit the trail's raw route/landmark GeoJSON directly).
import TrailLandmarksEditor from '../../components/TrailLandmarksEditor';
import { confirmAlert } from '../../lib/confirmAlert';
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
import {
    deleteFullLessonPlan,
    fetchFullLessonsForTrail,
    upsertFullLessonPlan,
    type FullLessonPlan,
    type LessonStandard,
} from '../../lib/fullLessons';

// A lookup table mapping a lesson-plan "subject" value (e.g. 'reading') to
// the corresponding "subject" name used by the standards library (which
// may use slightly different terminology) — needed so opening the standard
// picker for a given lesson subject pre-filters to the right standards
// subject.
import { LESSON_SUBJECT_TO_STANDARDS_SUBJECT, type StandardRow } from '../../lib/standards';
import { fetchTrailList, formatMiles, updateTrailInfo, type TrailSummary } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// react-native-web's Alert.alert() is a complete no-op (see
// lib/confirmAlert.ts) — every plain info/error Alert.alert(...) call on
// this screen would otherwise silently do nothing on web, leaving staff
// with zero feedback about whether a save actually worked. Same pattern
// used in app/(teacher-tabs)/curriculum.tsx and several other screens.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

// The in-progress edit state for one subject's "Full Lesson Plan" — the
// deeper, printable-depth layer beyond the short lesson-guide blurb.
// objectives/materials/procedures/extension are edited as one-per-line
// textareas (same convention as the trail's "highlights" field below), then
// split back into arrays on save.
type FullLessonDraft = {
    title: string;
    subtitle: string;
    timeFrame: string;
    appConnection: string;
    purpose: string;
    standards: LessonStandard[];
    standardsNote: string;
    objectivesText: string;
    materialsText: string;
    proceduresText: string;
    extensionText: string;
    assessment: string;
};

const EMPTY_FULL_LESSON_DRAFT: FullLessonDraft = {
    title: '',
    subtitle: '',
    timeFrame: '',
    appConnection: '',
    purpose: '',
    standards: [],
    standardsNote: '',
    objectivesText: '',
    materialsText: '',
    proceduresText: '',
    extensionText: '',
    assessment: '',
};

// Splits a one-per-line textarea's text back into a clean string array:
// trims each line, then drops any resulting empty lines.
function splitLines(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

export default function OkageContentScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

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
    // (null = closed) — this is the short blurb's single standard code.
    const [pickerOpenFor, setPickerOpenFor] = useState<LessonSubject | null>(null);

    // Full Lesson Plan editing state — a separate, deeper layer per
    // tier+subject beyond the short blurb above.
    const [fullLessons, setFullLessons] = useState<Map<string, FullLessonPlan>>(new Map());
    const [fullLessonDrafts, setFullLessonDrafts] = useState<Record<string, FullLessonDraft>>({});
    // Which tier+subject's full-lesson EDITOR panel is currently expanded
    // (only one open at a time — the key is "tier:subject", or null).
    const [expandedFullLessonKey, setExpandedFullLessonKey] = useState<string | null>(null);
    const [savingFullLesson, setSavingFullLesson] = useState<LessonSubject | null>(null);
    // Which subject's full-lesson "Add Standard" picker is currently open —
    // separate from `pickerOpenFor` above, since a full lesson can carry
    // several standards, not just one code.
    const [fullLessonPickerOpenFor, setFullLessonPickerOpenFor] = useState<LessonSubject | null>(null);
    // The lesson currently shown in the read-only "Preview" modal — built
    // live from the in-progress draft, not necessarily saved yet.
    const [previewLesson, setPreviewLesson] = useState<FullLessonPlan | null>(null);
    const [previewModalOpen, setPreviewModalOpen] = useState(false);

    useEffect(() => {
        async function bootstrap() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) setStaffId(user.id);
                const list = await fetchTrailList();
                setTrails(list);
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load trails.');
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
        setExpandedFullLessonKey(null);
    }

    // Loads the lesson plans (both the short blurb and the full lesson
    // plans) for whichever trail is currently selected. Re-runs whenever
    // `selectedTrail` changes (a new trail opened, or the user goes back to
    // the list, setting it to null).
    useEffect(() => {
        if (!selectedTrail) {
            setLessonDrafts({});
            setFullLessons(new Map());
            setFullLessonDrafts({});
            return;
        }
        async function loadLessonPlans() {
            setLessonPlansLoading(true);
            try {
                // Fetch whatever lesson plan rows already exist in the
                // database for this trail, and every full lesson plan row,
                // AT ONCE — the two tables are independent of each other.
                const [dbRows, fullRows] = await Promise.all([
                    fetchLessonPlansForTrail(selectedTrail!.id),
                    fetchFullLessonsForTrail(selectedTrail!.id),
                ]);
                // ...then "resolve" the short blurbs: fill in sensible
                // defaults/empty placeholders for any tier+subject
                // combination that doesn't have a saved row yet, so every
                // subject always has SOMETHING to display and edit, even
                // brand new ones.
                // (The `!` after selectedTrail asserts to TypeScript "I
                // know this isn't null here" — safe because we already
                // returned early above if it were.)
                const resolved = resolveLessonPlans(selectedTrail!.id, selectedTrail!.name, dbRows);
                setFullLessons(fullRows);

                // Build the initial lessonDrafts and fullLessonDrafts
                // objects by walking every combination of grade tier ×
                // subject and copying its resolved content into a draft
                // entry keyed by "tier:subject".
                const drafts: Record<string, { content: string; standardCode: string }> = {};
                const fullDrafts: Record<string, FullLessonDraft> = {};
                for (const tier of ['elementary', 'secondary'] as GradeTier[]) {
                    for (const subject of LESSON_SUBJECTS) {
                        const key = `${tier}:${subject.value}`;
                        const plan = resolved[tier][subject.value];
                        drafts[key] = {
                            content: plan.content,
                            // `?? ''` again normalizes a missing standard
                            // code to an empty editable string.
                            standardCode: plan.standardCode ?? '',
                        };

                        const fullLesson = fullRows.get(key);
                        fullDrafts[key] = fullLesson
                            ? {
                                  title: fullLesson.title,
                                  subtitle: fullLesson.subtitle ?? '',
                                  timeFrame: fullLesson.timeFrame ?? '',
                                  appConnection: fullLesson.appConnection,
                                  purpose: fullLesson.purpose,
                                  standards: fullLesson.standards,
                                  standardsNote: fullLesson.standardsNote ?? '',
                                  objectivesText: fullLesson.objectives.join('\n'),
                                  materialsText: fullLesson.materials.join('\n'),
                                  proceduresText: fullLesson.procedures.join('\n'),
                                  extensionText: fullLesson.extension.join('\n'),
                                  assessment: fullLesson.assessment ?? '',
                              }
                            : { ...EMPTY_FULL_LESSON_DRAFT };
                    }
                }
                setLessonDrafts(drafts);
                setFullLessonDrafts(fullDrafts);
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load the lesson guide.');
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
            const highlights = splitLines(highlightsText);

            await updateTrailInfo(selectedTrail.id, { route, highlights, historicalFocus, imageUrl });

            // Update the local `trails` list in place so the trail-list
            // screen (if the user navigates back to it) immediately
            // reflects the just-saved changes, without needing to
            // re-fetch the whole list from the server.
            setTrails((prev) =>
                prev.map((t) => (t.id === selectedTrail.id ? { ...t, route, highlights, historicalFocus, image_url: imageUrl } : t))
            );
            showAlert('Saved', 'Trail description updated.');
        } catch (err: any) {
            showAlert('Save Failed', err.message || 'Could not save trail info.');
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
            showAlert('Saved', 'Lesson guide updated.');
        } catch (err: any) {
            showAlert('Save Failed', err.message || 'Could not save this lesson guide.');
        } finally {
            setSavingSubject(null);
        }
    }

    // Opens/closes the Full Lesson Plan editor panel for one subject —
    // only one panel is ever expanded at a time.
    function toggleFullLessonEditor(subject: LessonSubject) {
        const key = `${gradeTier}:${subject}`;
        setExpandedFullLessonKey((prev) => (prev === key ? null : key));
    }

    // Saves the currently-open subject's Full Lesson Plan.
    async function handleSaveFullLesson(subject: LessonSubject) {
        if (!selectedTrail) return;
        const key = `${gradeTier}:${subject}`;
        const draft = fullLessonDrafts[key];
        if (!draft) return;

        // Matches the database's NOT NULL columns — title, "connection to
        // the app," and "purpose" are the only truly required fields.
        if (!draft.title.trim() || !draft.appConnection.trim() || !draft.purpose.trim()) {
            showAlert('Missing Info', 'Title, "Connection to the App," and "Purpose" are required.');
            return;
        }

        setSavingFullLesson(subject);
        try {
            await upsertFullLessonPlan({
                trailId: selectedTrail.id,
                gradeTier,
                subject,
                title: draft.title.trim(),
                subtitle: draft.subtitle.trim() || null,
                timeFrame: draft.timeFrame.trim() || null,
                appConnection: draft.appConnection.trim(),
                purpose: draft.purpose.trim(),
                standards: draft.standards,
                standardsNote: draft.standardsNote.trim() || null,
                objectives: splitLines(draft.objectivesText),
                materials: splitLines(draft.materialsText),
                procedures: splitLines(draft.proceduresText),
                extension: splitLines(draft.extensionText),
                assessment: draft.assessment.trim() || null,
            });
            const refreshed = await fetchFullLessonsForTrail(selectedTrail.id);
            setFullLessons(refreshed);
            showAlert('Saved', 'Full lesson plan saved.');
        } catch (err: any) {
            showAlert('Save Failed', err.message || 'Could not save this full lesson plan.');
        } finally {
            setSavingFullLesson(null);
        }
    }

    // Permanently removes the currently-open subject's Full Lesson Plan —
    // confirmAlert (not showAlert) because this is destructive and needs a
    // real Cancel/Remove choice, which also works correctly on web.
    function handleDeleteFullLesson(subject: LessonSubject) {
        if (!selectedTrail) return;
        const key = `${gradeTier}:${subject}`;
        confirmAlert(
            'Remove Full Lesson Plan',
            'Teachers will no longer see a "View Full Lesson Plan" link for this subject. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setSavingFullLesson(subject);
                            try {
                                await deleteFullLessonPlan(selectedTrail.id, gradeTier, subject);
                                const refreshed = await fetchFullLessonsForTrail(selectedTrail.id);
                                setFullLessons(refreshed);
                                setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...EMPTY_FULL_LESSON_DRAFT } }));
                                showAlert('Removed', 'Full lesson plan removed.');
                            } catch (err: any) {
                                showAlert('Remove Failed', err.message || 'Could not remove this lesson plan.');
                            } finally {
                                setSavingFullLesson(null);
                            }
                        })();
                    },
                },
            ]
        );
    }

    // Opens the read-only preview modal built live from the in-progress
    // draft (so staff can check formatting before saving).
    function handlePreviewFullLesson(subject: LessonSubject) {
        if (!selectedTrail) return;
        const draft = fullLessonDrafts[`${gradeTier}:${subject}`];
        if (!draft) return;
        setPreviewLesson({
            trailId: selectedTrail.id,
            gradeTier,
            subject,
            title: draft.title.trim() || '(untitled)',
            subtitle: draft.subtitle.trim() || null,
            timeFrame: draft.timeFrame.trim() || null,
            appConnection: draft.appConnection,
            purpose: draft.purpose,
            standards: draft.standards,
            standardsNote: draft.standardsNote.trim() || null,
            objectives: splitLines(draft.objectivesText),
            materials: splitLines(draft.materialsText),
            procedures: splitLines(draft.proceduresText),
            extension: splitLines(draft.extensionText),
            assessment: draft.assessment.trim() || null,
        });
        setPreviewModalOpen(true);
    }

    // Appends a standard (picked from the library) to a full lesson's
    // standards array, skipping it if that exact code is already listed.
    function handleAddStandardToFullLesson(subject: LessonSubject, standard: StandardRow) {
        const key = `${gradeTier}:${subject}`;
        setFullLessonDrafts((prev) => {
            const draft = prev[key] ?? { ...EMPTY_FULL_LESSON_DRAFT };
            if (draft.standards.some((s) => s.code === standard.code)) return prev;
            const entry: LessonStandard = {
                code: standard.code,
                subjectLabel: standard.subject,
                gradeLevel: standard.gradeLevel,
                description: standard.description,
            };
            return { ...prev, [key]: { ...draft, standards: [...draft.standards, entry] } };
        });
    }

    function handleRemoveStandardFromFullLesson(subject: LessonSubject, code: string) {
        const key = `${gradeTier}:${subject}`;
        setFullLessonDrafts((prev) => {
            const draft = prev[key];
            if (!draft) return prev;
            return { ...prev, [key]: { ...draft, standards: draft.standards.filter((s) => s.code !== code) } };
        });
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
                <EdgeSwipeBack onSwipeBack={() => setSelectedTrail(null)} />
                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
                    <Pressable style={styles.backLink} onPress={() => setSelectedTrail(null)} accessibilityRole="button">
                        <Ionicons name="arrow-back" size={16} color={theme.accent} />
                        <Text style={[styles.backLinkText, { color: theme.accent }]}>Back to Trail List</Text>
                    </Pressable>

                    <Text style={[styles.mainHeading, { color: theme.text }]} accessibilityRole="header">{selectedTrail.name}</Text>
                    <Text style={[styles.introText, { color: theme.subtext }]}>
                        {formatMiles(selectedTrail.miles)} miles · {selectedTrail.difficulty}
                    </Text>

                    {/* TRAIL INFO */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">Trail Description</Text>

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ROUTE (e.g. “Guymon → Boise City → Kenton”)</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={route}
                            onChangeText={setRoute}
                            placeholder="Start → Stop → End"
                            placeholderTextColor={theme.subtext}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>HIGHLIGHTS (one per line)</Text>
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

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>HISTORICAL FOCUS</Text>
                        <TextInput
                            style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={historicalFocus}
                            onChangeText={setHistoricalFocus}
                            placeholder="What historical era or theme does this trail cover?"
                            placeholderTextColor={theme.subtext}
                            multiline
                            numberOfLines={3}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>IMAGE URL (optional)</Text>
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
                            accessibilityRole="button"
                            accessibilityState={{ disabled: savingInfo, busy: savingInfo }}
                        >
                            {savingInfo ? <ActivityIndicator color={theme.accentText} /> : <Text style={[styles.saveButtonText, { color: theme.accentText }]}>Save Trail Description</Text>}
                        </Pressable>
                    </View>

                    {/* LANDMARKS & ROUTE */}
                    <TrailLandmarksEditor trailId={selectedTrail.id} theme={theme} />

                    {/* LESSON GUIDES */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">Lesson Guides</Text>

                        {/* A 2-way segmented switch (Elementary /
                            Secondary), same visual pattern as the
                            segmented tab controls seen in other screens. */}
                        <View style={[styles.segmentContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                            {GRADE_TIERS.map((tier) => (
                                <Pressable
                                    key={tier.value}
                                    style={[styles.segmentItem, gradeTier === tier.value && { backgroundColor: theme.accent }]}
                                    onPress={() => setGradeTier(tier.value)}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: gradeTier === tier.value }}
                                >
                                    <Text style={[styles.segmentText, gradeTier === tier.value ? { color: theme.accentText } : { color: theme.text }]}>
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
                                const fullDraft = fullLessonDrafts[key] ?? EMPTY_FULL_LESSON_DRAFT;
                                const isSaving = savingSubject === subject.value;
                                const hasFullLesson = fullLessons.has(key);
                                const isFullLessonSaving = savingFullLesson === subject.value;
                                const isFullLessonOpen = expandedFullLessonKey === key;
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

                                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>STANDARD CODE (optional)</Text>
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
                                                accessibilityRole="button"
                                                accessibilityLabel="Browse standards library"
                                            >
                                                <Ionicons name="search" size={16} color={theme.accent} />
                                            </Pressable>
                                        </View>

                                        <Pressable
                                            style={[styles.saveButtonSmall, { borderColor: theme.accent }]}
                                            disabled={isSaving}
                                            onPress={() => void handleSaveSubject(subject.value)}
                                            accessibilityRole="button"
                                            accessibilityState={{ disabled: isSaving, busy: isSaving }}
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

                                        {/* FULL LESSON PLAN — a deeper,
                                            printable-depth layer beyond the
                                            blurb above. Collapsed by
                                            default so the common case
                                            (just editing the short blurb)
                                            isn't buried under a long form. */}
                                        <View style={[styles.fullLessonDivider, { borderColor: theme.border }]} />
                                        <View style={styles.fullLessonHeaderRow}>
                                            <Text style={[styles.fullLessonLabel, { color: theme.subtext }]}>
                                                FULL LESSON PLAN {hasFullLesson ? '· saved' : '· not written yet'}
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 14 }}>
                                                {hasFullLesson && !isFullLessonOpen && (
                                                    <Pressable onPress={() => handlePreviewFullLesson(subject.value)} accessibilityRole="button">
                                                        <Text style={[styles.fullLessonLinkText, { color: theme.accent }]}>Preview</Text>
                                                    </Pressable>
                                                )}
                                                <Pressable onPress={() => toggleFullLessonEditor(subject.value)} accessibilityRole="button">
                                                    <Text style={[styles.fullLessonLinkText, { color: theme.accent }]}>
                                                        {isFullLessonOpen ? 'Close' : hasFullLesson ? 'Edit' : '+ Write'}
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        </View>

                                        {isFullLessonOpen && (
                                            <View style={[styles.fullLessonForm, { borderColor: theme.border, backgroundColor: theme.background }]}>
                                                <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 0 }]}>TITLE</Text>
                                                <TextInput
                                                    style={[styles.textInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.title}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, title: text } }))}
                                                    placeholder="Lesson plan title"
                                                    placeholderTextColor={theme.subtext}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SUBTITLE (optional)</Text>
                                                <TextInput
                                                    style={[styles.textInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.subtitle}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, subtitle: text } }))}
                                                    placeholder="A short supporting line under the title"
                                                    placeholderTextColor={theme.subtext}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TIME FRAME (optional)</Text>
                                                <TextInput
                                                    style={[styles.textInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.timeFrame}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, timeFrame: text } }))}
                                                    placeholder="e.g. 45 minutes"
                                                    placeholderTextColor={theme.subtext}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>CONNECTION TO THE APP</Text>
                                                <TextInput
                                                    style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.appConnection}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, appConnection: text } }))}
                                                    placeholder="How does this lesson tie back to what students do in the app?"
                                                    placeholderTextColor={theme.subtext}
                                                    multiline
                                                    numberOfLines={2}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>PURPOSE</Text>
                                                <TextInput
                                                    style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.purpose}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, purpose: text } }))}
                                                    placeholder="What is this lesson meant to accomplish?"
                                                    placeholderTextColor={theme.subtext}
                                                    multiline
                                                    numberOfLines={2}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>STANDARDS</Text>
                                                {fullDraft.standards.length > 0 && (
                                                    <View style={styles.standardChipList}>
                                                        {fullDraft.standards.map((std) => (
                                                            <View key={std.code} style={[styles.standardChip, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                                                                <Text style={[styles.standardChipText, { color: theme.text }]}>{std.code}</Text>
                                                                <Pressable
                                                                    onPress={() => handleRemoveStandardFromFullLesson(subject.value, std.code)}
                                                                    accessibilityRole="button"
                                                                    accessibilityLabel={`Remove standard ${std.code}`}
                                                                    hitSlop={6}
                                                                >
                                                                    <Ionicons name="close-circle" size={16} color={theme.subtext} />
                                                                </Pressable>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                                <Pressable
                                                    style={[styles.addStandardButton, { borderColor: theme.accent }]}
                                                    onPress={() => setFullLessonPickerOpenFor(subject.value)}
                                                    accessibilityRole="button"
                                                >
                                                    <Ionicons name="add" size={14} color={theme.accent} />
                                                    <Text style={[styles.addStandardButtonText, { color: theme.accent }]}>Add Standard</Text>
                                                </Pressable>

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>STANDARDS NOTE (optional)</Text>
                                                <TextInput
                                                    style={[styles.textInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.standardsNote}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, standardsNote: text } }))}
                                                    placeholder="A short note shown under the standards list"
                                                    placeholderTextColor={theme.subtext}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>OBJECTIVES (one per line)</Text>
                                                <TextInput
                                                    style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.objectivesText}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, objectivesText: text } }))}
                                                    placeholder={'Students will be able to...\n...'}
                                                    placeholderTextColor={theme.subtext}
                                                    multiline
                                                    numberOfLines={3}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>MATERIALS (one per line)</Text>
                                                <TextInput
                                                    style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.materialsText}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, materialsText: text } }))}
                                                    placeholder={'Printed map handout\n...'}
                                                    placeholderTextColor={theme.subtext}
                                                    multiline
                                                    numberOfLines={2}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>PROCEDURES (one step per line, in order)</Text>
                                                <TextInput
                                                    style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.proceduresText}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, proceduresText: text } }))}
                                                    placeholder={'Introduce the landmark...\nHave students...'}
                                                    placeholderTextColor={theme.subtext}
                                                    multiline
                                                    numberOfLines={4}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>EXTENSION / ENRICHMENT (optional, one per line)</Text>
                                                <TextInput
                                                    style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.extensionText}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, extensionText: text } }))}
                                                    placeholder="Optional enrichment activities for early finishers"
                                                    placeholderTextColor={theme.subtext}
                                                    multiline
                                                    numberOfLines={2}
                                                />

                                                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ASSESSMENT (optional)</Text>
                                                <TextInput
                                                    style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                                    value={fullDraft.assessment}
                                                    onChangeText={(text) => setFullLessonDrafts((prev) => ({ ...prev, [key]: { ...fullDraft, assessment: text } }))}
                                                    placeholder="How is student understanding checked?"
                                                    placeholderTextColor={theme.subtext}
                                                    multiline
                                                    numberOfLines={2}
                                                />

                                                <View style={styles.fullLessonActionRow}>
                                                    <Pressable
                                                        style={[styles.saveButtonSmall, { borderColor: theme.accent, backgroundColor: theme.accent }]}
                                                        disabled={isFullLessonSaving}
                                                        onPress={() => void handleSaveFullLesson(subject.value)}
                                                        accessibilityRole="button"
                                                        accessibilityState={{ disabled: isFullLessonSaving, busy: isFullLessonSaving }}
                                                    >
                                                        {isFullLessonSaving ? (
                                                            <ActivityIndicator size="small" color={theme.accentText} />
                                                        ) : (
                                                            <Text style={[styles.saveButtonSmallText, { color: theme.accentText }]}>Save Full Lesson</Text>
                                                        )}
                                                    </Pressable>
                                                    <Pressable
                                                        style={[styles.saveButtonSmall, { borderColor: theme.border }]}
                                                        onPress={() => handlePreviewFullLesson(subject.value)}
                                                        accessibilityRole="button"
                                                    >
                                                        <Text style={[styles.saveButtonSmallText, { color: theme.text }]}>Preview</Text>
                                                    </Pressable>
                                                    {hasFullLesson && (
                                                        <Pressable
                                                            onPress={() => handleDeleteFullLesson(subject.value)}
                                                            accessibilityRole="button"
                                                            style={styles.removeFullLessonLink}
                                                        >
                                                            <Text style={[styles.removeFullLessonText, { color: theme.error }]}>Remove</Text>
                                                        </Pressable>
                                                    )}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                );
                            })
                        )}
                    </View>
                </ScrollView>
                {/* The standards-picker modals live OUTSIDE the ScrollView
                    (as siblings), so they overlay the entire screen rather
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
                <StandardPickerModal
                    visible={fullLessonPickerOpenFor !== null}
                    onClose={() => setFullLessonPickerOpenFor(null)}
                    accentColor={theme.accent}
                    initialSubject={fullLessonPickerOpenFor ? LESSON_SUBJECT_TO_STANDARDS_SUBJECT[fullLessonPickerOpenFor] : undefined}
                    onSelect={(standard) => {
                        if (!fullLessonPickerOpenFor) return;
                        handleAddStandardToFullLesson(fullLessonPickerOpenFor, standard);
                    }}
                />
                <FullLessonPlanModal
                    visible={previewModalOpen}
                    lesson={previewLesson}
                    trailName={selectedTrail.name}
                    onClose={() => setPreviewModalOpen(false)}
                />
            </KeyboardAvoidingView>
        );
    }

    // The default view: no trail selected yet, show the picker list.
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.kicker, { color: theme.accent }]}>CONTENT EDITOR</Text>
                <Text style={[styles.mainHeading, { color: theme.text }]} accessibilityRole="header">Trails & Lesson Guides</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Pick a trail to edit its description, its cross-curricular lesson guide, or its full lesson plans.
                </Text>

                {trails.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>No trails available yet.</Text>
                ) : (
                    trails.map((trail, trailIndex) => {
                        const card = (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.trailRowCard,
                                    { backgroundColor: theme.surface, borderColor: theme.border },
                                    pressed && { opacity: 0.8 },
                                ]}
                                onPress={() => openTrail(trail)}
                                accessibilityRole="button"
                                accessibilityLabel={`${trail.name}, ${trail.difficulty}, ${formatMiles(trail.miles)} miles`}
                            >
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text style={[styles.trailRowName, { color: theme.text }]}>{trail.name}</Text>
                                    <Text style={[styles.trailRowMeta, { color: theme.subtext }]}>
                                        {formatMiles(trail.miles)} mi · {trail.difficulty}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
                            </Pressable>
                        );
                        return trailIndex === 0 ? (
                            <TourTarget key={trail.id} id="okage.contentTrailCard">{card}</TourTarget>
                        ) : (
                            <View key={trail.id}>{card}</View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
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
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    trailRowName: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 3 },
    trailRowMeta: { fontSize: 12.5 },

    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    backLinkText: { fontSize: 14, fontWeight: '600', marginLeft: 6 },

    sectionCard: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    sectionTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 14 },
    fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },
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

    fullLessonDivider: { borderTopWidth: 1, marginTop: 16, borderStyle: 'dashed' },
    fullLessonHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
    fullLessonLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    fullLessonLinkText: { fontSize: 12, fontWeight: '700' },
    fullLessonForm: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
    fullLessonActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
    removeFullLessonLink: { marginLeft: 'auto', paddingVertical: 9 },
    removeFullLessonText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },

    standardChipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    standardChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 },
    standardChipText: { fontSize: 11.5, fontWeight: '700' },
    addStandardButton: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
    addStandardButtonText: { fontSize: 12, fontWeight: '700' },
});
