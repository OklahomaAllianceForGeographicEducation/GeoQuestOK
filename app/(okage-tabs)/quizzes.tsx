// app/(okage-tabs)/quizzes.tsx
// OKAGE quiz editor: pick a trail and a landmark, then add or edit the
// multiple-choice questions tied to it. Every field is a dropdown chip or a
// text box — no JSON, no raw ids to type by hand.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
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
    useColorScheme,
    View,
} from 'react-native';
import { colors, Theme } from '../../commonStyles';
import StandardPickerModal from '../../components/StandardPickerModal';
import TourTarget from '../../components/tour/TourTarget';
import { LESSON_SUBJECTS } from '../../lib/curriculum';

// geojsonPointsToLandmarks converts a trail's raw GeoJSON "point" features
// (used for map pins) into a simpler Landmark[] list ({id, title, ...})
// that's easier to work with for building UI chips.
import { geojsonPointsToLandmarks, type Landmark } from '../../lib/landmarks';
import {
    createQuizQuestion,
    fetchAllQuizQuestionsForTrail,
    setQuizQuestionActive,
    updateQuizQuestion,
    type GradeBand,
    type QuizQuestion,
} from '../../lib/quizzes';
import { LESSON_SUBJECT_TO_STANDARDS_SUBJECT } from '../../lib/standards';
import { fetchTrailDetails, fetchTrailList, type TrailSummary } from '../../lib/trails';

// The 3 quiz-specific grade bands (note: these are DIFFERENT from the
// GRADE_TIERS used on the content.tsx screen — that one only has 2 tiers,
// elementary/secondary, while quizzes get a finer 3-way split).
const GRADE_BANDS: { value: GradeBand; label: string }[] = [
    { value: 'elementary', label: 'Elementary' },
    { value: 'middle', label: 'Middle' },
    { value: 'high', label: 'High' },
];

// A blank starting point for the "Add/Edit Question" form. Defined once as
// a constant, then spread (`{ ...EMPTY_FORM }`) into state whenever the
// form needs to be reset — spreading creates a fresh independent copy each
// time rather than reusing (and potentially accidentally mutating) the
// same object.
// react-native-web's Alert.alert() is a complete no-op (see
// lib/confirmAlert.ts) — a plain info/error Alert.alert(...) call here
// would silently do nothing on web. Same pattern used across the other
// OKAGE tabs and app/(teacher-tabs)/curriculum.tsx.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

const EMPTY_FORM = {
    landmarkId: '',
    landmarkTitle: '',
    gradeBand: 'elementary' as GradeBand,
    subject: 'math' as string,
    standardCode: '',
    question: '',
    correctAnswer: '',
    // Up to 3 wrong answer choices, as 3 separate fields rather than an
    // array — simpler to bind directly to 3 separate TextInputs.
    wrongAnswer1: '',
    wrongAnswer2: '',
    wrongAnswer3: '',
};

export default function OkageQuizzesScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    const [trails, setTrails] = useState<TrailSummary[]>([]);
    // Which trail's quizzes are currently being viewed/edited.
    const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);

    // The landmarks belonging to the selected trail — used to populate the
    // "which landmark is this question about" chip picker.
    const [landmarks, setLandmarks] = useState<Landmark[]>([]);
    const [landmarksLoading, setLandmarksLoading] = useState(false);

    // Every quiz question (active or hidden) for the selected trail.
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    // Which specific question is currently being toggled active/inactive
    // (so only that one row shows a spinner).
    const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);

    // Whether the add/edit form panel is expanded.
    const [formOpen, setFormOpen] = useState(false);
    const [standardPickerOpen, setStandardPickerOpen] = useState(false);
    // If editing an existing question, holds its id; null means the form
    // is in "create a new question" mode.
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        async function bootstrap() {
            try {
                const list = await fetchTrailList();
                setTrails(list);
                // Auto-select the very first trail in the list so the
                // screen isn't blank/empty on first load — the user
                // doesn't have to manually pick a trail just to see
                // something.
                if (list.length > 0) setSelectedTrailId(list[0].id);
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load trails.');
            } finally {
                setLoading(false);
            }
        }
        void bootstrap();
    }, []);

    // Reloads landmarks + questions any time a different trail is
    // selected.
    useEffect(() => {
        if (!selectedTrailId) {
            setLandmarks([]);
            setQuestions([]);
            return;
        }
        async function loadTrailData() {
            setLandmarksLoading(true);
            setQuestionsLoading(true);
            // Close the add/edit form whenever switching trails, since any
            // in-progress edit no longer applies to the newly selected trail.
            setFormOpen(false);
            try {
                // Promise.all runs both fetches CONCURRENTLY (at the same
                // time) rather than one after another, since they're
                // independent of each other — this is faster than
                // `await fetchTrailDetails(); await fetchAllQuizQuestionsForTrail();`
                // done sequentially.
                const [details, questionList] = await Promise.all([
                    fetchTrailDetails(selectedTrailId!),
                    fetchAllQuizQuestionsForTrail(selectedTrailId!),
                ]);
                // `(details as any)?.landmarksGeojson` — cast to `any`
                // because the exact shape of fetchTrailDetails' return
                // type apparently doesn't strictly include this field in
                // its TypeScript type, so this bypasses that check.
                setLandmarks(geojsonPointsToLandmarks((details as any)?.landmarksGeojson));
                setQuestions(questionList);
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load this trail.');
            } finally {
                setLandmarksLoading(false);
                setQuestionsLoading(false);
            }
        }
        void loadTrailData();
    }, [selectedTrailId]);

    // Groups the flat `questions` array into landmark-based sections for
    // display (e.g. all questions about "State Capitol" together, then all
    // questions about "Frontier City", etc.), recalculated only when
    // `questions` itself changes.
    const groupedByLandmark = useMemo(() => {
        const groups: { landmarkTitle: string; items: QuizQuestion[] }[] = [];
        // A Map from landmark title → that group's index in the `groups`
        // array, so we can quickly find (or create) the right group for
        // each question as we walk through the list once.
        const index = new Map<string, number>();
        for (const q of questions) {
            if (!index.has(q.landmarkTitle)) {
                // First time seeing this landmark — create a new empty
                // group for it and remember its position.
                index.set(q.landmarkTitle, groups.length);
                groups.push({ landmarkTitle: q.landmarkTitle, items: [] });
            }
            // The `!` asserts the Map lookup definitely found something
            // (safe, since we just ensured it exists on the line above).
            groups[index.get(q.landmarkTitle)!].items.push(q);
        }
        return groups;
    }, [questions]);

    // Resets and opens the form in "create new question" mode, pre-
    // selecting the first available landmark as a sensible default.
    function openAddForm() {
        setEditingQuestionId(null);
        setForm({ ...EMPTY_FORM, landmarkId: landmarks[0]?.id ?? '', landmarkTitle: landmarks[0]?.title ?? '' });
        setFormOpen(true);
    }

    // Opens the form pre-filled with an EXISTING question's data, so the
    // user can modify it.
    function openEditForm(question: QuizQuestion) {
        setEditingQuestionId(question.id);
        setForm({
            landmarkId: question.landmarkId,
            landmarkTitle: question.landmarkTitle,
            gradeBand: question.gradeBand,
            subject: question.subject,
            standardCode: question.standardCode ?? '',
            question: question.question,
            correctAnswer: question.correctAnswer,
            // wrongAnswers is stored as an array on the question object,
            // but split back out into 3 individual fields for editing.
            // `?? ''` handles a question that has fewer than 3 wrong
            // answers saved.
            wrongAnswer1: question.wrongAnswers[0] ?? '',
            wrongAnswer2: question.wrongAnswers[1] ?? '',
            wrongAnswer3: question.wrongAnswers[2] ?? '',
        });
        setFormOpen(true);
    }

    async function handleSubmitForm() {
        if (!selectedTrailId) return;
        if (!form.landmarkId) {
            showAlert('Pick a Landmark', 'Choose which landmark this question is tied to.');
            return;
        }
        if (!form.question.trim() || !form.correctAnswer.trim()) {
            showAlert('Missing Info', 'Enter both the question and its correct answer.');
            return;
        }
        // Collapse the 3 separate wrong-answer fields back into one array,
        // trimming whitespace and dropping any that were left blank
        // (since only wrongAnswer1 is strictly required — 2 and 3 are
        // optional).
        const wrongAnswers = [form.wrongAnswer1, form.wrongAnswer2, form.wrongAnswer3]
            .map((a) => a.trim())
            .filter((a) => a.length > 0);
        if (wrongAnswers.length === 0) {
            showAlert('Missing Info', 'Enter at least one wrong answer choice.');
            return;
        }

        setSaving(true);
        try {
            const input = {
                trailId: selectedTrailId,
                landmarkId: form.landmarkId,
                landmarkTitle: form.landmarkTitle,
                gradeBand: form.gradeBand,
                subject: form.subject,
                standardCode: form.standardCode.trim() || null,
                question: form.question.trim(),
                correctAnswer: form.correctAnswer.trim(),
                wrongAnswers,
            };

            // Branch between updating an existing question vs. creating a
            // brand new one, based on whether editingQuestionId is set.
            if (editingQuestionId) {
                await updateQuizQuestion(editingQuestionId, input);
            } else {
                await createQuizQuestion(input);
            }

            // Re-fetch the full question list so the newly saved/edited
            // question (and its correct grouping/order) shows up
            // immediately.
            const refreshed = await fetchAllQuizQuestionsForTrail(selectedTrailId);
            setQuestions(refreshed);
            setFormOpen(false);
        } catch (err: any) {
            showAlert('Save Failed', err.message || 'Could not save this question.');
        } finally {
            setSaving(false);
        }
    }

    // Flips a question between visible (active) and hidden (inactive) —
    // used to temporarily pull a bad/wrong question out of rotation
    // without deleting it entirely.
    async function handleToggleActive(question: QuizQuestion) {
        setBusyQuestionId(question.id);
        try {
            await setQuizQuestionActive(question.id, !question.isActive);
            // Optimistic-ish local update: flip just this one question's
            // isActive flag in local state to match what was just saved,
            // rather than re-fetching the entire question list again.
            setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, isActive: !q.isActive } : q)));
        } catch (err: any) {
            showAlert('Update Failed', err.message || 'Could not update this question.');
        } finally {
            setBusyQuestionId(null);
        }
    }

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
                <Text style={[styles.kicker, { color: theme.accent }]}>QUIZ EDITOR</Text>
                <Text style={[styles.mainHeading, { color: theme.text }]} accessibilityRole="header">Trail Quiz Questions</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Pick a trail, then add or edit the questions tied to each landmark.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>Trail</Text>
                {/* Trail-picker chip row. */}
                <View style={styles.chipRow}>
                    {trails.map((trail, trailIndex) => {
                        const active = trail.id === selectedTrailId;
                        const chip = (
                            <Pressable
                                style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.surface }]}
                                onPress={() => setSelectedTrailId(trail.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: active }}
                            >
                                <Text style={[styles.chipText, { color: active ? theme.accentText : theme.text }]}>{trail.name}</Text>
                            </Pressable>
                        );
                        return trailIndex === 0 ? (
                            <TourTarget key={trail.id} id="okage.quizzesTrailChip">{chip}</TourTarget>
                        ) : (
                            <View key={trail.id}>{chip}</View>
                        );
                    })}
                </View>

                {/* Three possible states for the landmark section: still
                    loading, no landmarks at all (this trail has no map
                    data so quizzes can't be tied to a location), or the
                    normal add-question + list-of-questions UI. */}
                {landmarksLoading ? (
                    <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
                ) : landmarks.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext, marginTop: 16 }]}>
                        This trail doesn’t have landmark data yet, so questions can’t be added here.
                    </Text>
                ) : (
                    <>
                        <Pressable
                            style={[styles.addButton, { borderColor: theme.accent, backgroundColor: formOpen ? theme.accent : 'transparent' }]}
                            // Toggles the form: if it's already open,
                            // tapping this button closes it (acting as a
                            // Cancel button); if closed, it opens a fresh
                            // blank "add" form.
                            onPress={() => (formOpen ? setFormOpen(false) : openAddForm())}
                            accessibilityRole="button"
                        >
                            <Ionicons name={formOpen ? 'close' : 'add'} size={16} color={formOpen ? theme.accentText : theme.accent} />
                            <Text style={[styles.addButtonText, { color: formOpen ? theme.accentText : theme.accent }]}>
                                {formOpen ? 'Cancel' : 'Add Question'}
                            </Text>
                        </Pressable>

                        {formOpen && (
                            <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <Text style={[styles.formTitle, { color: theme.text }]}>
                                    {editingQuestionId ? 'Edit Question' : 'New Question'}
                                </Text>

                                <Text style={styles.fieldLabel}>LANDMARK</Text>
                                <View style={styles.chipRow}>
                                    {landmarks.map((l) => {
                                        const active = l.id === form.landmarkId;
                                        return (
                                            <Pressable
                                                key={l.id}
                                                style={[styles.chipSmall, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.background }]}
                                                onPress={() => setForm((prev) => ({ ...prev, landmarkId: l.id, landmarkTitle: l.title }))}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: active }}
                                            >
                                                <Text style={[styles.chipTextSmall, { color: active ? theme.accentText : theme.text }]}>{l.title}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <Text style={styles.fieldLabel}>GRADE BAND</Text>
                                <View style={styles.chipRow}>
                                    {GRADE_BANDS.map((band) => {
                                        const active = band.value === form.gradeBand;
                                        return (
                                            <Pressable
                                                key={band.value}
                                                style={[styles.chipSmall, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.background }]}
                                                onPress={() => setForm((prev) => ({ ...prev, gradeBand: band.value }))}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: active }}
                                            >
                                                <Text style={[styles.chipTextSmall, { color: active ? theme.accentText : theme.text }]}>{band.label}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <Text style={styles.fieldLabel}>SUBJECT</Text>
                                <View style={styles.chipRow}>
                                    {LESSON_SUBJECTS.map((subject) => {
                                        const active = subject.value === form.subject;
                                        return (
                                            <Pressable
                                                key={subject.value}
                                                style={[styles.chipSmall, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.background }]}
                                                onPress={() => setForm((prev) => ({ ...prev, subject: subject.value }))}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: active }}
                                            >
                                                {/* Same "first word only"
                                                    trick seen in content.tsx,
                                                    to keep these subject
                                                    chips compact. */}
                                                <Text style={[styles.chipTextSmall, { color: active ? theme.accentText : theme.text }]}>
                                                    {subject.label.split(' ')[0]}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <Text style={styles.fieldLabel}>STANDARD CODE (optional)</Text>
                                <View style={styles.standardRow}>
                                    <TextInput
                                        style={[styles.textInput, { flex: 1, backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                                        value={form.standardCode}
                                        onChangeText={(text) => setForm((prev) => ({ ...prev, standardCode: text }))}
                                        placeholder="e.g. 3.RL.2"
                                        placeholderTextColor={theme.subtext}
                                        autoCapitalize="characters"
                                    />
                                    <Pressable
                                        style={[styles.browseButton, { borderColor: theme.accent }]}
                                        onPress={() => setStandardPickerOpen(true)}
                                        accessibilityRole="button"
                                        accessibilityLabel="Browse standards library"
                                    >
                                        <Ionicons name="search" size={16} color={theme.accent} />
                                    </Pressable>
                                </View>

                                <Text style={styles.fieldLabel}>QUESTION</Text>
                                <TextInput
                                    style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                                    value={form.question}
                                    onChangeText={(text) => setForm((prev) => ({ ...prev, question: text }))}
                                    placeholder="What question should students answer here?"
                                    placeholderTextColor={theme.subtext}
                                    multiline
                                    numberOfLines={2}
                                />

                                <Text style={styles.fieldLabel}>CORRECT ANSWER</Text>
                                <TextInput
                                    style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                                    value={form.correctAnswer}
                                    onChangeText={(text) => setForm((prev) => ({ ...prev, correctAnswer: text }))}
                                    placeholder="The right answer"
                                    placeholderTextColor={theme.subtext}
                                />

                                <Text style={styles.fieldLabel}>WRONG ANSWER CHOICES (at least one)</Text>
                                <TextInput
                                    style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginBottom: 8 }]}
                                    value={form.wrongAnswer1}
                                    onChangeText={(text) => setForm((prev) => ({ ...prev, wrongAnswer1: text }))}
                                    placeholder="Wrong choice 1"
                                    placeholderTextColor={theme.subtext}
                                />
                                <TextInput
                                    style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginBottom: 8 }]}
                                    value={form.wrongAnswer2}
                                    onChangeText={(text) => setForm((prev) => ({ ...prev, wrongAnswer2: text }))}
                                    placeholder="Wrong choice 2 (optional)"
                                    placeholderTextColor={theme.subtext}
                                />
                                <TextInput
                                    style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                                    value={form.wrongAnswer3}
                                    onChangeText={(text) => setForm((prev) => ({ ...prev, wrongAnswer3: text }))}
                                    placeholder="Wrong choice 3 (optional)"
                                    placeholderTextColor={theme.subtext}
                                />

                                <Pressable
                                    style={[styles.saveButton, { backgroundColor: theme.accent }]}
                                    disabled={saving}
                                    onPress={() => void handleSubmitForm()}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: saving, busy: saving }}
                                >
                                    {saving ? <ActivityIndicator color={theme.accentText} /> : (
                                        <Text style={[styles.saveButtonText, { color: theme.accentText }]}>{editingQuestionId ? 'Save Changes' : 'Add Question'}</Text>
                                    )}
                                </Pressable>
                            </View>
                        )}
                    </>
                )}

                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>
                    Questions ({questions.length})
                </Text>

                {questionsLoading ? (
                    <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
                ) : groupedByLandmark.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>No questions written for this trail yet.</Text>
                ) : (
                    groupedByLandmark.map((group) => (
                        <View key={group.landmarkTitle} style={{ marginBottom: 18 }}>
                            <Text style={[styles.landmarkHeading, { color: theme.text }]}>{group.landmarkTitle}</Text>
                            {group.items.map((question) => {
                                const isBusy = busyQuestionId === question.id;
                                return (
                                    <View
                                        key={question.id}
                                        style={[
                                            styles.questionCard,
                                            { backgroundColor: theme.surface, borderColor: theme.border },
                                            // Hidden (inactive) questions
                                            // are visually faded (55%
                                            // opacity) so it's obvious at a
                                            // glance they're not currently
                                            // live for students.
                                            !question.isActive && { opacity: 0.55 },
                                        ]}
                                    >
                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                            {/* Builds a single meta line
                                                like "ELEMENTARY • math •
                                                3.RL.2 • HIDDEN" by
                                                conditionally appending each
                                                extra piece only if it
                                                applies — the standard code
                                                segment only shows if one is
                                                set, and "HIDDEN" only shows
                                                for inactive questions. */}
                                            <Text style={[styles.questionMeta, { color: theme.subtext }]}>
                                                {question.gradeBand.toUpperCase()} • {question.subject}
                                                {question.standardCode ? ` • ${question.standardCode}` : ''}
                                                {!question.isActive ? ' • HIDDEN' : ''}
                                            </Text>
                                            <Text style={[styles.questionText, { color: theme.text }]}>{question.question}</Text>
                                        </View>
                                        <View style={{ gap: 8, alignItems: 'flex-end' }}>
                                            <Pressable
                                                style={[styles.iconButton, { borderColor: theme.border }]}
                                                onPress={() => openEditForm(question)}
                                                accessibilityRole="button"
                                                accessibilityLabel="Edit question"
                                            >
                                                <Ionicons name="create-outline" size={16} color={theme.accent} />
                                            </Pressable>
                                            <Pressable
                                                style={[styles.iconButton, { borderColor: theme.border }]}
                                                disabled={isBusy}
                                                onPress={() => void handleToggleActive(question)}
                                                accessibilityRole="switch"
                                                accessibilityState={{ checked: question.isActive, busy: isBusy }}
                                                accessibilityLabel={question.isActive ? 'Hide question from students' : 'Show question to students'}
                                            >
                                                {isBusy ? (
                                                    <ActivityIndicator size="small" color={theme.accent} />
                                                ) : (
                                                    // The eye icon itself
                                                    // flips between "open
                                                    // eye" (currently
                                                    // active — tap to hide)
                                                    // and "eye with slash"
                                                    // (currently hidden —
                                                    // tap to show), a
                                                    // common visibility-
                                                    // toggle convention.
                                                    <Ionicons name={question.isActive ? 'eye-off-outline' : 'eye-outline'} size={16} color={theme.accent} />
                                                )}
                                            </Pressable>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ))
                )}
            </ScrollView>
            <StandardPickerModal
                visible={standardPickerOpen}
                onClose={() => setStandardPickerOpen(false)}
                accentColor={theme.accent}
                initialSubject={LESSON_SUBJECT_TO_STANDARDS_SUBJECT[form.subject]}
                onSelect={(standard) => setForm((prev) => ({ ...prev, standardCode: standard.code }))}
            />
        </KeyboardAvoidingView>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    mainHeading: { fontSize: 24, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    introText: { fontSize: 14, lineHeight: 19, marginBottom: 16 },
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10, marginTop: 10, textTransform: 'uppercase' },
    emptyText: { fontSize: 13, fontStyle: 'italic' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: { borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
    chipText: { fontSize: 13, fontWeight: '700' },
    chipSmall: { borderWidth: 1, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
    chipTextSmall: { fontSize: 12, fontWeight: '700' },

    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginTop: 16 },
    addButtonText: { fontSize: 13, fontWeight: '700' },

    formCard: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginTop: 12,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    formTitle: { fontSize: 15, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 10 },
    fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },
    textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    standardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    browseButton: { borderWidth: 1.5, borderRadius: 10, padding: 10 },
    textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
    saveButton: { marginTop: 16, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    saveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

    landmarkHeading: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 8 },
    questionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    questionMeta: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase' },
    questionText: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
    iconButton: { borderWidth: 1, borderRadius: 10, padding: 8 },
});
