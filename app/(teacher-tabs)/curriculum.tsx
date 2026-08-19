// app/(teacher-tabs)/curriculum.tsx
// Merged curriculum + quiz bank: teachers pick a trail to see its
// cross-curricular lesson guide and, on the same screen, browse/assign that
// trail's quiz questions to a class.
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { colors } from '../../commonStyles';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import FullLessonPlanModal from '../../components/FullLessonPlanModal';
import { confirmAlert } from '../../lib/confirmAlert';
import { fetchLessonPlansForTrail, GRADE_TIERS, LESSON_SUBJECTS, resolveLessonPlans, type GradeTier } from '../../lib/curriculum';
import { fetchFullLessonsForTrail, type FullLessonPlan } from '../../lib/fullLessons';
import {
    assignQuestionToClass,
    fetchAssignedQuestionIdsForClass,
    fetchQuizQuestionsForTrail,
    fetchTeacherClasses,
    unassignQuestionFromClass,
    type GradeBand,
    type QuizQuestion,
    type TeacherClass,
} from '../../lib/quizzes';
import { fetchTrailList, formatMiles, type TrailSummary } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// Same 3-band grade options seen in the OKAGE quizzes editor.
const GRADE_BANDS: { value: GradeBand; label: string }[] = [
    { value: 'elementary', label: 'Elementary' },
    { value: 'middle', label: 'Middle' },
    { value: 'high', label: 'High' },
];

// Maps a teacher's signup-time grade selection (profiles.generic_grades_taught,
// a GradeRangeMetric from app/signup.tsx) to the matching quiz-bank GradeBand
// so the "Filter by Grade" row can default to it. Anything ambiguous (split
// campus, not applicable, a non-teacher value like community_youth/higher_ed,
// or simply missing) maps to null, which leaves the filter unset — the
// existing gated "pick a filter" prompt.
function mapSignupGradeToBand(genericGradesTaught: string | null | undefined): GradeBand | null {
    switch (genericGradesTaught) {
        case 'elementary':
            return 'elementary';
        case 'middle_school':
            return 'middle';
        case 'high_school':
            return 'high';
        default:
            return null;
    }
}

// React Native's Alert.alert() renders nothing on web (same gap other
// screens in this app already work around, see app/login.tsx) -- a
// missing-class or failed-save alert would previously fail completely
// silently on the web teacher app, looking exactly like a broken button.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

export default function CurriculumHub() {
    const theme = colors.light;

    // Trail catalog + selection
    const [trails, setTrails] = useState<TrailSummary[]>([]);
    // Which trail is currently drilled into (null = showing the trail list).
    const [selectedTrail, setSelectedTrail] = useState<TrailSummary | null>(null);
    const [gradeTier, setGradeTier] = useState<GradeTier>('elementary');
    // Teachers with the special 'super_admin' role get an extra "Modify
    // Framework Fields" button that regular teachers don't see.
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    // The teacher's own grade band, derived from their signup selection —
    // used to auto-select the "Filter by Grade" chip when a trail is
    // opened, while still leaving it freely changeable afterward.
    const [teacherGradeBand, setTeacherGradeBand] = useState<GradeBand | null>(null);

    const [lessonPlans, setLessonPlans] = useState<ReturnType<typeof resolveLessonPlans> | null>(null);
    const [lessonPlansLoading, setLessonPlansLoading] = useState(false);

    // Full lesson plans (objectives/materials/procedures/etc.) for the open
    // trail, keyed by "gradeTier:subject" — the in-app "go deeper" layer
    // opened on purpose from a subject card, distinct from the short blurb
    // in lessonPlans above.
    const [fullLessons, setFullLessons] = useState<Map<string, FullLessonPlan>>(new Map());
    const [activeFullLesson, setActiveFullLesson] = useState<FullLessonPlan | null>(null);
    const [fullLessonModalOpen, setFullLessonModalOpen] = useState(false);

    // Quiz bank state (scoped to selectedTrail once a trail is opened)
    const [teacherId, setTeacherId] = useState<string | null>(null);
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    // Which of the teacher's classes questions are currently being
    // assigned to/unassigned from.
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    // The set of question ids that are ALREADY assigned to the currently
    // selected class. A Set (rather than an array) is used here because
    // membership checks (`.has(id)`) need to happen very frequently while
    // rendering the question list, and Sets do that in constant time
    // rather than scanning an array each time.
    const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
    // Which single question is currently being toggled (assign/unassign).
    const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
    // Whether a bulk assign/unassign-all operation is currently running.
    const [bulkBusy, setBulkBusy] = useState(false);

    // Which grade bands and subjects are currently checked as filters.
    // Empty sets mean "no filter applied yet" — unlike most filter UIs,
    // an empty filter here means the question list stays HIDDEN (see
    // hasActiveFilter below) rather than showing everything at once, since
    // a trail's full question bank is too long to usefully scroll through
    // unsorted.
    const [gradeFilter, setGradeFilter] = useState<Set<GradeBand>>(new Set());
    const [subjectFilter, setSubjectFilter] = useState<Set<string>>(new Set());
    // Escape hatch for a teacher who genuinely wants to skim every question
    // at once despite no filter being picked.
    const [showAllOverride, setShowAllOverride] = useState(false);
    // Which landmark groups are expanded — collapsed by default so a long
    // filtered result set is still scannable at a glance (titles + counts)
    // rather than one continuous scroll of question cards.
    const [expandedLandmarks, setExpandedLandmarks] = useState<Set<string>>(new Set());

    // Bootstrap: teacher identity/permissions, real trail catalog, and classes.
    useEffect(() => {
        async function bootstrap() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                setTeacherId(user.id);

                // Fetch the teacher's role, the trail catalog, and their
                // classes all AT ONCE via Promise.all, since none of them
                // depend on each other — faster than fetching them one at
                // a time in sequence.
                const [profileResult, trailList, classList] = await Promise.all([
                    supabase.from('profiles').select('app_role, generic_grades_taught').eq('id', user.id).maybeSingle(),
                    fetchTrailList(),
                    fetchTeacherClasses(user.id),
                ]);

                if (profileResult.data?.app_role === 'super_admin') {
                    setIsSuperAdmin(true);
                }
                setTeacherGradeBand(mapSignupGradeToBand(profileResult.data?.generic_grades_taught));
                setTrails(trailList);
                setClasses(classList);
                // Auto-select the first class so the quiz-assignment UI
                // has something selected by default rather than showing
                // "no class selected" immediately.
                if (classList.length > 0) setSelectedClassId(classList[0].id);
            } catch (err) {
                console.error("Curriculum bootstrap exception:", err);
            } finally {
                setLoading(false);
            }
        }
        void bootstrap();
    }, []);

    // Reload the quiz bank whenever the opened trail changes.
    useEffect(() => {
        if (!selectedTrail) {
            setQuestions([]);
            return;
        }
        async function loadQuestions() {
            setQuestionsLoading(true);
            try {
                const list = await fetchQuizQuestionsForTrail(selectedTrail!.id);
                setQuestions(list);
                // Reset filter/expand state whenever a NEW trail is opened,
                // so leftover filters or expanded groups from a previously
                // viewed trail don't carry over to this one. Grade defaults
                // to the teacher's own signup grade band when known (they
                // can still change or clear it via the filter chips), and
                // falls back to unset otherwise.
                setGradeFilter(teacherGradeBand ? new Set([teacherGradeBand]) : new Set());
                setSubjectFilter(new Set());
                setShowAllOverride(false);
                setExpandedLandmarks(new Set());
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load questions for this trail.');
            } finally {
                setQuestionsLoading(false);
            }
        }
        void loadQuestions();
    }, [selectedTrail, teacherGradeBand]);

    // Reload lesson guide content (DB-authored, falling back to built-in copy)
    // whenever the opened trail changes.
    useEffect(() => {
        if (!selectedTrail) {
            setLessonPlans(null);
            return;
        }
        async function loadLessonPlans() {
            setLessonPlansLoading(true);
            try {
                const dbRows = await fetchLessonPlansForTrail(selectedTrail!.id);
                setLessonPlans(resolveLessonPlans(selectedTrail!.id, selectedTrail!.name, dbRows));
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load the lesson guide for this trail.');
            } finally {
                setLessonPlansLoading(false);
            }
        }
        void loadLessonPlans();
        // Always reset back to the elementary tier when opening a
        // (possibly different) trail.
        setGradeTier('elementary');
    }, [selectedTrail]);

    // Reload full lesson plans (the "View Full Lesson Plan" content) for
    // the opened trail — a separate table/fetch from the short lessonPlans
    // blurbs above, so a missing full lesson never blocks the quick-glance
    // cards from loading.
    useEffect(() => {
        if (!selectedTrail) {
            setFullLessons(new Map());
            return;
        }
        async function loadFullLessons() {
            try {
                const map = await fetchFullLessonsForTrail(selectedTrail!.id);
                setFullLessons(map);
            } catch (err) {
                // Non-fatal: the "View Full Lesson Plan" button simply
                // won't appear for this trail if this fails.
                console.error('Failed to load full lesson plans:', err);
            }
        }
        void loadFullLessons();
    }, [selectedTrail]);

    // Reload assignment state whenever the selected class changes.
    useEffect(() => {
        if (!selectedClassId) {
            setAssignedIds(new Set());
            return;
        }
        async function loadAssignments() {
            try {
                const ids = await fetchAssignedQuestionIdsForClass(selectedClassId!);
                setAssignedIds(ids);
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load current assignments.');
            }
        }
        void loadAssignments();
    }, [selectedClassId]);

    // The distinct set of subjects present among this trail's questions,
    // used to build the "Filter by Subject" chip row — computed from
    // whatever subjects actually appear, rather than a fixed hardcoded
    // list, so it always matches the real data.
    const subjects = useMemo(() => {
        // `new Set(...)` de-duplicates the subject values, then spreading
        // it back into an array with `[...]` and sorting alphabetically.
        return [...new Set(questions.map((q) => q.subject))].sort();
    }, [questions]);

    // Applies both the grade and subject filters together (a question must
    // pass BOTH to be included, i.e. AND logic between the two filter
    // types). Within each filter type, having ANY of the selected values
    // counts as a match (OR logic) — e.g. selecting both "Elementary" and
    // "Middle" shows questions from either band.
    const filteredQuestions = useMemo(() => {
        return questions.filter((q) => {
            // If gradeFilter is empty (nothing checked), treat it as "no
            // filter" and let everything through; otherwise, only keep
            // questions whose gradeBand is one of the checked values.
            const gradeOk = gradeFilter.size === 0 || gradeFilter.has(q.gradeBand);
            const subjectOk = subjectFilter.size === 0 || subjectFilter.has(q.subject);
            return gradeOk && subjectOk;
        });
    }, [questions, gradeFilter, subjectFilter]);

    // Same landmark-grouping logic seen in the OKAGE quizzes screen,
    // applied here to the FILTERED question list rather than the full list.
    const groupedByLandmark = useMemo(() => {
        const groups: { landmarkTitle: string; items: QuizQuestion[] }[] = [];
        const index = new Map<string, number>();
        for (const q of filteredQuestions) {
            if (!index.has(q.landmarkTitle)) {
                index.set(q.landmarkTitle, groups.length);
                groups.push({ landmarkTitle: q.landmarkTitle, items: [] });
            }
            groups[index.get(q.landmarkTitle)!].items.push(q);
        }
        return groups;
    }, [filteredQuestions]);

    // A small generic helper: given a Set and a value, returns a NEW Set
    // with that value's membership flipped (added if absent, removed if
    // present). Returning a new Set (rather than mutating the one passed
    // in) is important for React state — React only re-renders when it
    // sees a genuinely different object reference, and mutating the same
    // Set in place wouldn't trigger that. `<T>` makes this function work
    // generically for a Set of any type (GradeBand, string, etc.), used
    // for both gradeFilter and subjectFilter below.
    function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
        const next = new Set(set);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
    }

    // Whether the question list should render at all. A teacher must pick
    // at least one grade or subject filter first — or explicitly choose to
    // browse everything — before the (potentially very long) question list
    // appears, so opening a trail doesn't immediately dump dozens of
    // questions into one continuous scroll.
    const hasActiveFilter = gradeFilter.size > 0 || subjectFilter.size > 0;
    const showQuestionList = hasActiveFilter || showAllOverride;

    function toggleLandmarkExpanded(landmarkTitle: string) {
        setExpandedLandmarks((prev) => toggleInSet(prev, landmarkTitle));
    }

    const allLandmarksExpanded = groupedByLandmark.length > 0 &&
        groupedByLandmark.every((g) => expandedLandmarks.has(g.landmarkTitle));

    function toggleExpandAll() {
        if (allLandmarksExpanded) {
            setExpandedLandmarks(new Set());
        } else {
            setExpandedLandmarks(new Set(groupedByLandmark.map((g) => g.landmarkTitle)));
        }
    }

    // Opens the full-lesson-plan modal for whichever subject card was
    // tapped, using the tier currently selected in the segmented control.
    function handleOpenFullLesson(subjectValue: string) {
        const lesson = fullLessons.get(`${gradeTier}:${subjectValue}`);
        if (!lesson) return;
        setActiveFullLesson(lesson);
        setFullLessonModalOpen(true);
    }

    // Toggles a single question's assignment to the currently selected class.
    async function handleToggleAssignment(question: QuizQuestion) {
        if (!selectedClassId || !teacherId) {
            showAlert('Select a Class', 'Choose a class below before assigning questions.');
            return;
        }
        const isAssigned = assignedIds.has(question.id);
        setBusyQuestionId(question.id);
        try {
            if (isAssigned) {
                await unassignQuestionFromClass(selectedClassId, question.id);
                setAssignedIds((prev) => toggleInSet(prev, question.id));
            } else {
                await assignQuestionToClass(selectedClassId, question.id, teacherId);
                setAssignedIds((prev) => toggleInSet(prev, question.id));
            }
        } catch (err: any) {
            showAlert('Update Failed', err.message || 'Could not update this assignment.');
        } finally {
            setBusyQuestionId(null);
        }
    }

    // Assigns (or unassigns) EVERY question currently matching the active
    // filters, in one action — a bulk version of handleToggleAssignment.
    async function handleBulkAssign(assign: boolean) {
        if (!selectedClassId || !teacherId) {
            showAlert('Select a Class', 'Choose a class below before assigning questions.');
            return;
        }
        setBulkBusy(true);
        try {
            // Only touch questions whose CURRENT assignment state doesn't
            // already match the target — e.g. if "assign" is true, only
            // process questions that aren't already assigned (no point
            // re-assigning something already assigned).
            // `assignedIds.has(q.id) !== assign` is true exactly when the
            // current state differs from the desired state.
            const targets = filteredQuestions.filter((q) => assignedIds.has(q.id) !== assign);
            // Sequentially await each individual assign/unassign call —
            // NOT run in parallel via Promise.all, likely to avoid
            // overwhelming the database with many simultaneous writes at
            // once, though this does mean a large filtered set could take
            // a while to fully process.
            for (const q of targets) {
                if (assign) {
                    await assignQuestionToClass(selectedClassId, q.id, teacherId);
                } else {
                    await unassignQuestionFromClass(selectedClassId, q.id);
                }
            }
            // Once every individual write succeeds, update local state
            // once at the end to reflect all the changes together.
            setAssignedIds((prev) => {
                const next = new Set(prev);
                for (const q of targets) {
                    if (assign) next.add(q.id);
                    else next.delete(q.id);
                }
                return next;
            });
        } catch (err: any) {
            showAlert('Bulk Update Failed', err.message || 'Some assignments may not have saved.');
        } finally {
            setBulkBusy(false);
        }
    }

    // A super-admin-only placeholder action — currently just shows an
    // informational alert rather than opening a real editor, with a
    // "Cancel" and stubbed "Open Builder Form" button (the latter just
    // logs to the console rather than doing anything yet). This is
    // clearly a work-in-progress feature, not a finished one.
    const handleEditFrameworkMessage = (trailName: string) => {
        confirmAlert(
            "Curriculum Live Editor",
            `You are authorized as a Super-Admin. Would you like to check out the layout files or alter fields for: "${trailName}"? Your team updates sync effortlessly.`,
            [{ text: "Cancel", style: "cancel" }, { text: "Open Builder Form", onPress: () => console.log("Launch builder layout tool modal") }]
        );
    };

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    // Detail / Sub-page View Block
    if (selectedTrail) {
        // Look up the resolved lesson content for whichever grade tier is
        // currently selected. Optional chaining + `?? null` guards against
        // lessonPlans still being null (e.g. mid-load).
        const curriculumData = lessonPlans?.[gradeTier] ?? null;

        return (
            <View style={{ flex: 1, backgroundColor: theme.background }}>
                <EdgeSwipeBack onSwipeBack={() => setSelectedTrail(null)} />
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Pressable style={styles.backLink} onPress={() => setSelectedTrail(null)}>
                        <Ionicons name="arrow-back" size={16} color={theme.accent} />
                        <Text style={[styles.backLinkText, { color: theme.accent }]}>Back to Trail Matrix</Text>
                    </Pressable>

                    <View style={[styles.detailHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.detailTitle, { color: theme.text }]}>{selectedTrail.name}</Text>

                        <View style={styles.badgeRow}>
                            <View style={[styles.tierBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800' }}>{formatMiles(selectedTrail.miles)} MILES</Text>
                            </View>
                            <View style={[styles.tierBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{selectedTrail.difficulty.toUpperCase()} LEVEL</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.border }]} />

                        {/* `!!selectedTrail.route` converts a possibly
                            empty string into a strict boolean — an empty
                            string is falsy, so this only renders the
                            section when there's actually route text to
                            show. Same pattern repeats for highlights and
                            historicalFocus below. */}
                        {!!selectedTrail.route && (
                            <>
                                <Text style={styles.metaLabel}>ROUTE STRAND</Text>
                                <Text style={[styles.metaBody, { color: theme.text }]}>{selectedTrail.route}</Text>
                            </>
                        )}

                        {selectedTrail.highlights.length > 0 && (
                            <>
                                <Text style={styles.metaLabel}>EDUCATIONAL HIGHLIGHTS</Text>
                                <Text style={[styles.metaBody, { color: theme.text }]}>{selectedTrail.highlights.join(', ')}</Text>
                            </>
                        )}

                        {!!selectedTrail.historicalFocus && (
                            <>
                                <Text style={styles.metaLabel}>HISTORICAL ANCHOR CORE</Text>
                                <Text style={[styles.metaBody, { color: theme.text }]}>{selectedTrail.historicalFocus}</Text>
                            </>
                        )}

                        {isSuperAdmin && (
                            <Pressable
                                style={[styles.adminEditChip, { borderColor: theme.accent }]}
                                onPress={() => handleEditFrameworkMessage(selectedTrail.name)}
                            >
                                <Ionicons name="create-outline" size={14} color={theme.accent} />
                                <Text style={[styles.adminEditText, { color: theme.accent }]}>Modify Framework Fields</Text>
                            </Pressable>
                        )}
                    </View>

                    {/* Styled Segmented Filter Controls */}
                    <View style={[styles.segmentContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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

                    <Text style={[styles.sectionHeading, { color: theme.text }]}>Lesson Guide Integrations</Text>

                    {lessonPlansLoading ? (
                        <ActivityIndicator size="small" color={theme.accent} style={{ marginBottom: 12 }} />
                    ) : (
                        LESSON_SUBJECTS.map((subject) => {
                            const plan = curriculumData?.[subject.value];
                            const fullLesson = fullLessons.get(`${gradeTier}:${subject.value}`);
                            return (
                                <View key={subject.value} style={[styles.subjectCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={styles.subjectHeader}>
                                        <Ionicons name={subject.icon as any} size={18} color={theme.accent} />
                                        <Text style={[styles.subjectTitle, { color: theme.text }]}>{subject.label}</Text>
                                        {/* Only show a small standard-code
                                            badge if this subject has one
                                            saved. `marginLeft: 'auto'`
                                            pushes this badge all the way to
                                            the far right of the row,
                                            regardless of how long the
                                            subject title/icon before it are. */}
                                        {plan?.standardCode ? (
                                            <View style={[styles.inlineBadge, { backgroundColor: theme.background, borderColor: theme.border, marginLeft: 'auto', marginRight: 0 }]}>
                                                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.accent }}>{plan.standardCode}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                    {plan?.content ? (
                                        <Text style={[styles.subjectTextContent, { color: theme.text }]}>{plan.content}</Text>
                                    ) : (
                                        <Text style={[styles.subjectTextContent, { color: theme.subtext, fontStyle: 'italic' }]}>
                                            No lesson guide written for this subject yet.
                                        </Text>
                                    )}
                                    {fullLesson ? (
                                        <Pressable
                                            style={[styles.fullLessonLink, { borderColor: theme.accent }]}
                                            onPress={() => handleOpenFullLesson(subject.value)}
                                        >
                                            <Ionicons name="document-text-outline" size={14} color={theme.accent} />
                                            <Text style={[styles.fullLessonLinkText, { color: theme.accent }]}>View Full Lesson Plan</Text>
                                            <Ionicons name="chevron-forward" size={14} color={theme.accent} />
                                        </Pressable>
                                    ) : null}
                                </View>
                            );
                        })
                    )}

                    {/* QUIZ BANK — scoped to this trail */}
                    <View style={[styles.divider, { backgroundColor: theme.border, marginTop: 8 }]} />
                    <View style={styles.quizSectionHeader}>
                        <Ionicons name="help-circle-outline" size={18} color={theme.accent} />
                        <Text style={[styles.sectionHeading, { color: theme.text, marginBottom: 0 }]}>Quiz Bank</Text>
                    </View>
                    <Text style={[styles.subTextDescription, { color: theme.subtext }]}>
                        Browse this trail's quiz questions and assign them to a class. Students in that class will see the
                        quiz pop up once they have walked past the landmark it is tied to.
                    </Text>

                    <Text style={[styles.sectionHeading, { color: theme.text }]}>Class</Text>
                    {classes.length === 0 ? (
                        <Text style={[styles.emptyText, { color: theme.subtext }]}>
                            You do not have any classes yet — create one in the Classes tab first.
                        </Text>
                    ) : (
                        <View style={styles.chipRow}>
                            {classes.map((cls) => {
                                const active = cls.id === selectedClassId;
                                return (
                                    <Pressable
                                        key={cls.id}
                                        style={[
                                            styles.chip,
                                            { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.surface },
                                        ]}
                                        onPress={() => setSelectedClassId(cls.id)}
                                    >
                                        <Text style={[styles.chipText, { color: active ? '#FFF' : theme.text }]}>{cls.className}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}

                    <Text style={[styles.sectionHeading, { color: theme.text }]}>Filter by Grade</Text>
                    <View style={styles.chipRow}>
                        {GRADE_BANDS.map((band) => {
                            const active = gradeFilter.has(band.value);
                            return (
                                <Pressable
                                    key={band.value}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: theme.accent, backgroundColor: active ? theme.accent : 'transparent' },
                                    ]}
                                    onPress={() => setGradeFilter((prev) => toggleInSet(prev, band.value))}
                                >
                                    <Text style={[styles.filterChipText, { color: active ? '#FFF' : theme.accent }]}>{band.label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Only shows a subject filter row at all if there ARE
                        subjects present among this trail's questions
                        (i.e. there's at least one question, since
                        `subjects` is derived from the question list). */}
                    {subjects.length > 0 ? (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Filter by Subject</Text>
                            <View style={styles.chipRow}>
                                {subjects.map((subject) => {
                                    const active = subjectFilter.has(subject);
                                    return (
                                        <Pressable
                                            key={subject}
                                            style={[
                                                styles.filterChip,
                                                { borderColor: theme.accent, backgroundColor: active ? theme.accent : 'transparent' },
                                            ]}
                                            onPress={() => setSubjectFilter((prev) => toggleInSet(prev, subject))}
                                        >
                                            {/* Capitalizes just the first
                                                letter of the raw subject
                                                value for display (e.g.
                                                "math" → "Math"). */}
                                            <Text style={[styles.filterChipText, { color: active ? '#FFF' : theme.accent }]}>
                                                {subject.charAt(0).toUpperCase() + subject.slice(1)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    ) : null}

                    {/* Bulk actions only appear once the question list
                        itself is showing (see showQuestionList) — otherwise
                        "Assign All Filtered" with no filter picked would
                        silently act on every question in the trail without
                        the teacher ever having seen the list. */}
                    {showQuestionList && (
                        <View style={styles.bulkRow}>
                            <Pressable
                                style={[styles.bulkButton, { borderColor: theme.accent }]}
                                // Disabled while a bulk action is already
                                // running, OR when there are no filtered
                                // questions to act on at all.
                                disabled={bulkBusy || filteredQuestions.length === 0}
                                onPress={() => void handleBulkAssign(true)}
                            >
                                <Text style={[styles.bulkButtonText, { color: theme.accent }]}>Assign All Filtered</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.bulkButton, { borderColor: theme.border }]}
                                disabled={bulkBusy || filteredQuestions.length === 0}
                                onPress={() => void handleBulkAssign(false)}
                            >
                                <Text style={[styles.bulkButtonText, { color: theme.subtext }]}>Unassign All Filtered</Text>
                            </Pressable>
                            {bulkBusy ? <ActivityIndicator size="small" color={theme.accent} /> : null}
                        </View>
                    )}

                    <View style={styles.questionsHeaderRow}>
                        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 0 }]}>
                            Questions ({filteredQuestions.length})
                        </Text>
                        {showQuestionList && groupedByLandmark.length > 0 && (
                            <Pressable onPress={toggleExpandAll}>
                                <Text style={[styles.expandAllText, { color: theme.accent }]}>
                                    {allLandmarksExpanded ? 'Collapse All' : 'Expand All'}
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    {questionsLoading ? (
                        <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
                    ) : !showQuestionList ? (
                        // Gated state: nothing renders until the teacher
                        // picks at least one grade/subject filter above, or
                        // explicitly opts into browsing everything — a
                        // trail's full question bank is too long to dump
                        // into one scroll by default.
                        <View style={[styles.filterPrompt, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <Ionicons name="funnel-outline" size={20} color={theme.subtext} />
                            <Text style={[styles.filterPromptText, { color: theme.text }]}>
                                Pick a grade and/or subject above to see matching questions.
                            </Text>
                            <Pressable onPress={() => setShowAllOverride(true)}>
                                <Text style={[styles.filterPromptLink, { color: theme.accent }]}>
                                    Or browse all {questions.length} questions at once
                                </Text>
                            </Pressable>
                        </View>
                    ) : groupedByLandmark.length === 0 ? (
                        <Text style={[styles.emptyText, { color: theme.subtext }]}>
                            No questions match these filters yet.
                        </Text>
                    ) : (
                        groupedByLandmark.map((group) => {
                            const isExpanded = expandedLandmarks.has(group.landmarkTitle);
                            return (
                                <View key={group.landmarkTitle} style={{ marginBottom: 10 }}>
                                    <Pressable
                                        style={[styles.landmarkHeaderRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                        onPress={() => toggleLandmarkExpanded(group.landmarkTitle)}
                                    >
                                        <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.subtext} />
                                        <Text style={[styles.landmarkHeading, { color: theme.text, flex: 1, marginBottom: 0 }]}>{group.landmarkTitle}</Text>
                                        <View style={[styles.countPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.subtext }}>{group.items.length}</Text>
                                        </View>
                                    </Pressable>

                                    {isExpanded && (
                                        <View style={{ marginTop: 8 }}>
                                            {group.items.map((question) => {
                                                const isAssigned = assignedIds.has(question.id);
                                                const isBusy = busyQuestionId === question.id;
                                                return (
                                                    <View
                                                        key={question.id}
                                                        style={[styles.questionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                                    >
                                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                                            <Text style={[styles.questionMeta, { color: theme.subtext }]}>
                                                                {question.gradeBand.toUpperCase()} • {question.subject}
                                                                {question.standardCode ? ` • ${question.standardCode}` : ''}
                                                            </Text>
                                                            <Text style={[styles.questionText, { color: theme.text }]}>{question.question}</Text>
                                                            {/* So a teacher can review what's actually
                                                                correct before assigning a question --
                                                                the correct answer is checked/green, the
                                                                distractors just listed underneath it. */}
                                                            <View style={{ marginTop: 6, gap: 2 }}>
                                                                <Text style={[styles.answerChoice, styles.answerChoiceCorrect]}>✓ {question.correctAnswer}</Text>
                                                                {question.wrongAnswers.map((wrong, i) => (
                                                                    <Text key={i} style={[styles.answerChoice, { color: theme.subtext }]}>{wrong}</Text>
                                                                ))}
                                                            </View>
                                                        </View>
                                                        {/* This button doubles as both
                                                            the toggle control AND the
                                                            current status indicator —
                                                            its fill color, icon, and
                                                            label text all change based
                                                            on isAssigned. */}
                                                        <Pressable
                                                            style={[
                                                                styles.assignToggle,
                                                                { backgroundColor: isAssigned ? theme.accent : 'transparent', borderColor: theme.accent },
                                                            ]}
                                                            disabled={isBusy}
                                                            onPress={() => void handleToggleAssignment(question)}
                                                        >
                                                            {isBusy ? (
                                                                <ActivityIndicator size="small" color={isAssigned ? '#FFF' : theme.accent} />
                                                            ) : (
                                                                <>
                                                                    <Ionicons
                                                                        name={isAssigned ? 'checkmark-circle' : 'add-circle-outline'}
                                                                        size={16}
                                                                        color={isAssigned ? '#FFF' : theme.accent}
                                                                    />
                                                                    <Text style={[styles.assignToggleText, { color: isAssigned ? '#FFF' : theme.accent }]}>
                                                                        {isAssigned ? 'Assigned' : 'Assign'}
                                                                    </Text>
                                                                </>
                                                            )}
                                                        </Pressable>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </ScrollView>

                <FullLessonPlanModal
                    visible={fullLessonModalOpen}
                    lesson={activeFullLesson}
                    trailName={selectedTrail.name}
                    onClose={() => setFullLessonModalOpen(false)}
                />
            </View>
        );
    }

    // Top-Level Matrix Board Workspace
    // The default view when no trail is selected: the full trail list.
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                style={styles.mainScroll}
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>CURRICULUM & QUIZ RESOURCE MANUAL</Text>
                <Text style={[styles.mainHeading, { color: theme.text }]}>Oklahoma History Trails</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Select a trail below to see its cross-curricular lesson modules and assign its quiz questions to a class.
                </Text>

                <Text style={[styles.sectionHeading, { color: theme.text, marginTop: 12 }]}>Available Trails</Text>

                {trails.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>No trails available yet.</Text>
                ) : (
                    trails.map((trail) => (
                        <Pressable
                            key={trail.id}
                            style={({ pressed }) => [
                                styles.trailRowCard,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                                pressed && { opacity: 0.8 }
                            ]}
                            onPress={() => setSelectedTrail(trail)}
                        >
                            <View style={{ flex: 1, paddingRight: 12 }}>
                                <Text style={[styles.trailRowName, { color: theme.text }]}>{trail.name}</Text>
                                {!!trail.route && <Text style={[styles.trailRowMeta, { color: theme.subtext }]}>{trail.route}</Text>}
                                <View style={styles.badgeRow}>
                                    <View style={[styles.inlineBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.accent }}>{formatMiles(trail.miles)} MI</Text>
                                    </View>
                                    <View style={[styles.inlineBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.text }}>{trail.difficulty.toUpperCase()}</Text>
                                    </View>
                                </View>
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
    mainScroll: { flex: 1 },
    container: { flex: 1 },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    mainHeading: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    introText: { fontSize: 14, lineHeight: 19, marginBottom: 16 },

    trailRowCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        padding: 18,
        borderRadius: 16,
        marginBottom: 12
    },
    trailRowName: { fontSize: 16, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 4 },
    trailRowMeta: { fontSize: 13, marginBottom: 10 },
    inlineBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, marginRight: 6 },

    // Sub-Page Details Layout Styles
    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    backLinkText: { fontSize: 14, fontWeight: '600', marginLeft: 6 },
    detailHero: { borderWidth: 1, padding: 18, borderRadius: 16, marginBottom: 20 },
    detailTitle: { fontSize: 22, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 8 },
    badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    tierBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
    divider: { height: 1, marginVertical: 14 },
    metaLabel: { fontSize: 11, fontWeight: '800', color: '#666', letterSpacing: 1, marginTop: 12, marginBottom: 4 },
    metaBody: { fontSize: 14, lineHeight: 19, marginBottom: 4 },

    // The dashed border here visually signals "special/admin-only action"
    // — distinct from the app's usual solid-border buttons — a subtle way
    // of marking this as a less "official" or more experimental control.
    adminEditChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderStyle: 'dashed',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        marginTop: 16
    },
    adminEditText: { fontSize: 12, fontWeight: '700', marginLeft: 6 },

    // Segmented Controls Style Match
    segmentContainer: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 4, marginBottom: 24 },
    segmentItem: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    segmentText: { fontSize: 13, fontWeight: '700' },

    sectionHeading: { fontSize: 11, fontWeight: '800', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#666' },
    subjectCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
    subjectHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    subjectTitle: { fontSize: 15, fontWeight: '700' },
    subjectTextContent: { fontSize: 14, lineHeight: 20 },
    fullLessonLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        marginTop: 12,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    fullLessonLinkText: { fontSize: 12, fontWeight: '700' },

    // Quiz Bank section (merged from the former Quizzes tab)
    quizSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    subTextDescription: { fontSize: 14, marginBottom: 16, lineHeight: 18 },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        color: '#666',
        marginBottom: 10,
        marginTop: 18,
        textTransform: 'uppercase',
    },
    emptyText: { fontSize: 13, fontStyle: 'italic' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
    chipText: { fontSize: 13, fontWeight: '700' },
    // A thicker border (1.5px) than the class-picker chips above, giving
    // these filter chips a slightly bolder/more "toggle switch" look
    // since they represent an active/inactive filter state rather than a
    // single selection.
    filterChip: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
    filterChipText: { fontSize: 12, fontWeight: '700' },
    bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
    bulkButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
    bulkButtonText: { fontSize: 12, fontWeight: '700' },
    questionsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
    expandAllText: { fontSize: 12, fontWeight: '700' },
    filterPrompt: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 20, alignItems: 'center', gap: 8 },
    filterPromptText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
    filterPromptLink: { fontSize: 12, fontWeight: '700', marginTop: 4, textDecorationLine: 'underline' },
    landmarkHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    countPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    landmarkHeading: { fontSize: 15, fontWeight: '800', fontFamily: 'Georgia' },
    questionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    questionMeta: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase' },
    questionText: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
    answerChoice: { fontSize: 12, lineHeight: 17 },
    answerChoiceCorrect: { fontWeight: '700', color: '#3A8F52' },
    assignToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1.5,
        borderRadius: 14,
        paddingVertical: 7,
        paddingHorizontal: 12,
    },
    assignToggleText: { fontSize: 12, fontWeight: '700' },
});
