// app/(teacher-tabs)/classes.tsx
// Teacher's classroom management screen: a directory of classes they own,
// a drill-down roster view per class (with anonymity toggle and student
// removal), and a "create new class" bottom sheet — very similar to the
// classroom-creation flow on the teacher dashboard (index.tsx), but this
// is the fuller management screen.

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    // Switch is React Native's native on/off toggle control (like an iOS
    // switch or Android toggle), used here for the anonymity setting.
    Switch,
    Text,
    TextInput,
    View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, Theme } from '../../commonStyles';
import AdaptiveBlur from '../../components/AdaptiveBlur';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import TourTarget from '../../components/tour/TourTarget';
import { confirmAlert, showAlert } from '../../lib/confirmAlert';
import { fetchClassQuizParticipation, type QuizParticipation } from '../../lib/quizzes';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';
import { containsProfanity } from '../../utils/profanity';

// One row from the "classes" table.
type ClassRow = {
    id: string; // Alphanumeric Join Code
    class_name: string;
    is_anonymous_required: boolean;
    created_at: string;
    // These three fields use `?:` (optional property) rather than
    // `| null`, meaning TypeScript treats them as possibly entirely absent
    // from the object, not just present-but-null — a subtly different
    // guarantee, though in practice both get handled the same way with
    // `|| ''` fallbacks throughout this file.
    school_name?: string | null;
    school_district_name?: string | null;
    district_id?: string | null;
};

// One student row within a class roster, joined from class_memberships +
// profiles.
type StudentProfile = {
    membership_id: number; // Row unique key in junction model
    id: string;
    username: string;
    display_name: string;
    total_miles_walked: number;
};

export default function ClassManagementHub() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // Core Screen Indicators
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // Every class this teacher owns.
    const [classes, setClasses] = useState<ClassRow[]>([]);
    // Which class is currently drilled into (null = showing the directory
    // list instead of a specific class's roster).
    const [selectedClass, setSelectedClass] = useState<ClassRow | null>(null);
    const [roster, setRoster] = useState<StudentProfile[]>([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    // A Map from student id → their quiz participation stats (correct
    // count / total count) for the currently viewed class. Using a Map
    // (rather than a plain object) here is a reasonable choice since keys
    // are dynamic student ids being looked up by exact match.
    const [quizParticipation, setQuizParticipation] = useState<Map<string, QuizParticipation>>(new Map());

    // Context Cache
    // The logged-in teacher's own school/district info, fetched once and
    // cached in state so it doesn't need to be re-queried every time
    // loadTeacherClasses() runs (e.g. on pull-to-refresh).
    const [teacherProfile, setTeacherProfile] = useState<{
        id: string;
        district_id: string;
        district_name: string;
        school_name: string;
    } | null>(null);

    // Modal Control States
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [customCodeInput, setCustomCodeInput] = useState('');
    const [overrideSchool, setOverrideSchool] = useState('');
    const [overrideDistrict, setOverrideDistrict] = useState('');

    // Fetch Classes Managed by Logged-in Teacher
    async function loadTeacherClasses() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Cache home building metrics if not pulled yet
            // Only fetch the teacher's own profile info ONCE — if
            // teacherProfile is already populated (e.g. this function is
            // being re-run via pull-to-refresh), skip re-fetching it,
            // since it's unlikely to change frequently.
            if (!teacherProfile) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, district_id, school_district_name, school_name')
                    .eq('id', user.id)
                    .maybeSingle();

                if (profile) {
                    const cache = {
                        id: user.id,
                        district_id: profile.district_id || '',
                        district_name: profile.school_district_name || '',
                        school_name: profile.school_name || ''
                    };
                    setTeacherProfile(cache);
                    // Pre-fill the "create new class" form's school/
                    // district override fields with the teacher's own
                    // values as sensible defaults.
                    setOverrideSchool(cache.school_name);
                    setOverrideDistrict(cache.district_name);
                }
            }

            const { data, error } = await supabase
                .from('classes')
                .select('id, class_name, is_anonymous_required, created_at, school_name, school_district_name, district_id')
                .eq('teacher_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setClasses(data || []);

            // Refresh deep-dive state reference live if currently active
            // If the user is CURRENTLY viewing a specific class's detail
            // screen while this refresh happens (e.g. pull-to-refresh from
            // within a class), find that same class in the freshly fetched
            // data and update `selectedClass` too — otherwise the detail
            // view would keep showing stale data even after the underlying
            // `classes` list refreshed.
            if (selectedClass) {
                const updatedMatch = (data || []).find(c => c.id === selectedClass.id);
                if (updatedMatch) setSelectedClass(updatedMatch);
            }
        } catch (err: any) {
            showAlert("Data Error", err.message || "Could not load your classes. Please try again.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        void loadTeacherClasses();
    }, []);

    // Leaving this tab and coming back always lands on the class
    // directory, never wherever you'd drilled into before — it was too
    // easy to switch tabs, come back, forget you were still inside a
    // specific class's roster, and be confused why the screen "looked
    // different than expected." The manual back button above still works
    // for going back without leaving the tab at all.
    useFocusEffect(
        useCallback(() => {
            setSelectedClass(null);
            setRoster([]);
        }, [])
    );

    // Fetch Student Roster when selecting a class track
    async function loadClassRoster(classId: string) {
        try {
            setRosterLoading(true);
            // This query embeds a related "profiles" record directly
            // inside each class_memberships row using Supabase/PostgREST's
            // relationship syntax: `profiles(id, username, display_name,
            // total_miles_walked)`. This works (unlike the leaderboard
            // screen's manual two-query workaround) because there IS a
            // proper foreign key relationship set up between
            // class_memberships and profiles.
            const { data, error } = await supabase
                .from('class_memberships')
                .select('id, user_id, profiles(id, username, display_name, total_miles_walked)')
                .eq('class_id', classId);

            if (error) throw error;

            const mappedStudents: StudentProfile[] = (data || [])
                // Defensive filter: drop any membership row whose linked
                // profile somehow came back null (e.g. an orphaned
                // membership row pointing at a deleted user).
                .filter((row: any) => row.profiles != null)
                .map((row: any) => ({
                    membership_id: row.id,
                    id: row.profiles.id,
                    username: row.profiles.username || 'Anonymous',
                    display_name: row.profiles.display_name || 'Not Provided',
                    total_miles_walked: row.profiles.total_miles_walked || 0
                }));

            setRoster(mappedStudents);

            // Fetching quiz participation is wrapped in its own nested
            // try/catch so that if IT fails (e.g. the underlying database
            // view/column doesn't exist in some environments), the roster
            // itself still successfully loads and displays — this failure
            // is treated as non-critical/optional data.
            try {
                const participation = await fetchClassQuizParticipation(classId);
                setQuizParticipation(participation);
            } catch {
                // Non-fatal: roster still loads without the quiz participation column.
                setQuizParticipation(new Map());
            }
        } catch {
            showAlert("Roster Error", "Could not load the class roster. Please try again.");
        } finally {
            setRosterLoading(false);
        }
    }

    // Same random 6-character join code generator seen in
    // (teacher-tabs)/index.tsx — duplicated here rather than shared from a
    // common utility file.
    function generateRandomJoinCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Save a new Class Challenge Room to the database
    async function handleCreateClass() {
        const cleanName = newClassName.trim();
        if (!cleanName) {
            showAlert("Missing Name", "Please enter an identifying class title.");
            return;
        }

        // The moderation filter used at signup/student-account was never
        // wired up here, so a teacher could set a profane class name that
        // then renders to every student in the roster. Found by an
        // /impeccable audit.
        if (containsProfanity(cleanName)) {
            showAlert("Inappropriate Name", "Please choose a school-appropriate class title.");
            return;
        }

        try {
            setSubmitting(true);
            let assignedJoinCode = customCodeInput.trim().toUpperCase();
            if (!assignedJoinCode) {
                assignedJoinCode = generateRandomJoinCode();
            }

            // Existence-only RPC rather than a direct select — a teacher
            // has no SELECT access to a class they don't own or belong to
            // (classes.id doubles as the join code, and that table's RLS
            // no longer allows browsing it wholesale). See
            // supabase/fix-classes-join-code-enumeration.sql.
            const { data: codeTaken } = await supabase.rpc('is_class_code_taken', { code: assignedJoinCode });

            if (codeTaken) {
                assignedJoinCode += `-${Math.floor(10 + Math.random() * 90)}`;
                showAlert('Code Adjusted', `Requested code taken. Assigned unique variant: ${assignedJoinCode}`);
            }

            const { error } = await supabase
                .from('classes')
                .insert({
                    id: assignedJoinCode,
                    join_code: assignedJoinCode,
                    class_name: cleanName,
                    teacher_id: teacherProfile?.id,
                    is_anonymous_required: false,
                    district_id: teacherProfile?.district_id || null,
                    school_district_name: overrideDistrict.trim() || null,
                    school_name: overrideSchool.trim() || null
                });

            if (error) throw error;

            setNewClassName('');
            setCustomCodeInput('');
            setIsSheetOpen(false);
            showAlert("Class Generated! ✨", `Give your students Join Code: ${assignedJoinCode}`);
            await loadTeacherClasses();
        } catch (err: any) {
            showAlert("Creation Failure", err.message || "Something went wrong creating the class. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    // Toggle classroom anonymity safety switches live on the backend
    // Flips whether this class requires anonymous nicknames on
    // leaderboards, both in the database and in local state.
    async function toggleAnonymityRule(currentClass: ClassRow, value: boolean) {
        try {
            const { error } = await supabase
                .from('classes')
                .update({ is_anonymous_required: value })
                .eq('id', currentClass.id);

            if (error) throw error;

            // Update both the currently-viewed selectedClass AND the
            // broader `classes` list, so the change is reflected
            // immediately no matter which screen the user navigates to
            // next (detail view or directory list).
            setSelectedClass({ ...currentClass, is_anonymous_required: value });
            setClasses(prev => prev.map(c => c.id === currentClass.id ? { ...c, is_anonymous_required: value } : c));
        } catch {
            showAlert("Sync Error", "Could not save that setting. Please try again.");
        }
    }

    // Evict a student from this specific classroom membership
    // Shows a confirmation dialog before actually removing a student —
    // this deletes the class_memberships row, NOT the student's account
    // itself, so they simply lose access to this one class's roster/
    // leaderboard, nothing more destructive than that.
    const handleRemoveStudent = (student: StudentProfile) => {
        confirmAlert(
            "Remove Student",
            `Remove ${student.display_name || student.username} from this class? They'll lose access to this class's roster and leaderboard right away.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('class_memberships')
                                .delete()
                                .eq('id', student.membership_id);

                            if (error) throw error;

                            // Locally pop item out of view array instantly
                            setRoster(prev => prev.filter(s => s.membership_id !== student.membership_id));
                        } catch (err: any) {
                            showAlert("Error", "Could not remove that student. Please try again.");
                        }
                    }
                }
            ]
        );
    };

    // Renders one roster row for the FlatList below. Pulled out of the
    // JSX into its own useCallback (rather than an inline .map()) so the
    // list can actually virtualize -- with a full course load (100+
    // students), rendering every row up front regardless of what's
    // on-screen was a real, unmitigated performance risk on lower-end
    // Chromebooks. Found by an /impeccable audit.
    const renderRosterItem = useCallback(({ item: student }: { item: StudentProfile }) => (
        <View style={[styles.rosterCardRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.rosterRealName, { color: theme.text }]}>{student.display_name}</Text>
                <Text style={[styles.rosterNickname, { color: theme.subtext }]}>Handle: @{student.username}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.rosterMilesValue, { color: theme.accent }]}>
                        {formatMiles(student.total_miles_walked)}
                    </Text>
                    <Text style={styles.rosterMilesUnit}>mi total</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    {/* An "Immediately Invoked Function Expression" (IIFE)
                        — `(() => { ... })()` — used here purely to let a
                        local variable (`p`) be computed and reused across
                        multiple lines of JSX below, since JSX expressions
                        can't normally contain multi-statement logic like a
                        `const` declaration directly inline. */}
                    {(() => {
                        const p = quizParticipation.get(student.id);
                        return (
                            <>
                                {/* Shows "correct/attempted" (e.g. "7/10")
                                    if this student has quiz data, or an
                                    em-dash "—" placeholder if they haven't
                                    attempted any quizzes yet. Labeled
                                    explicitly as "correct" (not just
                                    "quizzes") since a student can complete
                                    every assigned question and still have
                                    gotten some of them wrong. */}
                                <Text style={[styles.rosterMilesValue, { color: theme.text, fontSize: 15 }]}>
                                    {p ? `${p.correct}/${p.total}` : '—'}
                                </Text>
                                <Text style={styles.rosterMilesUnit}>correct</Text>
                            </>
                        );
                    })()}
                </View>
                <Pressable
                    onPress={() => handleRemoveStudent(student)}
                    style={styles.removeCircleButton}
                    // The icon + padding only add up to roughly a 26x26 tappable
                    // area — too small for a destructive "remove student" action.
                    // hitSlop extends the touch target without changing the visible
                    // circle, closer to the ~44x44 minimum recommended target size.
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${student.display_name || student.username} from this class`}
                >
                    <Ionicons name="trash-outline" size={18} color={theme.error} />
                </Pressable>
            </View>
        </View>
    ), [theme, quizParticipation, handleRemoveStudent]);

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    // Drill-Down Roster Profile Management View Layout Controller
    // Same "two entirely different screens from one component" pattern
    // seen in the OKAGE content/quizzes editors — this branch renders the
    // per-class roster detail view instead of the directory list whenever
    // a class has been selected.
    if (selectedClass) {
        return (
            <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
                {/* Pinned above the ScrollView (not the first thing inside
                    it) so it's always on screen no matter how far down the
                    roster you've scrolled — the old version was just the
                    first line of scrollable content, easy to scroll past
                    and forget about. */}
                <View style={[styles.detailHeaderBar, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
                    <Pressable style={styles.backButton} onPress={() => { setSelectedClass(null); setRoster([]); }} hitSlop={8} accessibilityRole="button">
                        <Ionicons name="arrow-back" size={20} color={theme.accent} />
                        <Text style={[styles.backButtonText, { color: theme.accent }]}>All Classes</Text>
                    </Pressable>
                    <Text style={[styles.detailHeaderTitle, { color: theme.text }]} numberOfLines={1} accessibilityRole="header">{selectedClass.class_name}</Text>
                </View>
                {/* EdgeSwipeBack only spans the content area below the
                    header bar (not the header itself), so it never
                    competes with the back button for touches in that top
                    strip. */}
                <View style={{ flex: 1 }}>
                <EdgeSwipeBack onSwipeBack={() => { setSelectedClass(null); setRoster([]); }} />
                {/* FlatList instead of a ScrollView + .map() -- with a full
                    course load (100+ students) this is a real virtualized
                    list now (only the rows actually on screen get mounted)
                    rather than rendering the entire roster up front. The
                    class hero card + section title move into
                    ListHeaderComponent so they still scroll away with the
                    roster, matching the original layout exactly; the
                    loading spinner / "no students" message move into
                    ListEmptyComponent, since `roster` is always `[]` while
                    rosterLoading is true (see loadRoster above) so exactly
                    one of the two ever needs to render. Found by an
                    /impeccable audit. */}
                <FlatList
                    style={[styles.container, { backgroundColor: theme.background }]}
                    contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                    data={roster}
                    keyExtractor={(student) => String(student.membership_id)}
                    renderItem={renderRosterItem}
                    ListHeaderComponent={
                        <>
                            <View style={[styles.classHeroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <Text style={[styles.heroClassName, { color: theme.text }]}>{selectedClass.class_name}</Text>
                                <Text style={styles.heroJoinCodeLabel}>
                                    STUDENT JOIN CODE: <Text style={{ color: theme.accent, fontWeight: '800' }}>{selectedClass.id}</Text>
                                </Text>

                                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                                <View style={styles.toggleSettingRow}>
                                    <View style={{ flex: 1, paddingRight: 12 }}>
                                        <Text style={[styles.toggleSettingTitle, { color: theme.text }]}>Enforce Anonymous Nicknames</Text>
                                        <Text style={styles.toggleSettingSub}>
                                            Automatically hides real names on school leaderboards, replacing profiles with safe generated animal handles if desired.
                                        </Text>
                                    </View>
                                    <Switch
                                        value={selectedClass.is_anonymous_required}
                                        onValueChange={(val) => void toggleAnonymityRule(selectedClass, val)}
                                        // trackColor customizes the color of the
                                        // switch's background "track" for its two
                                        // states: light gray when off, the app's
                                        // accent color when on (the little circular
                                        // "thumb" itself uses the platform default
                                        // look, unstyled here).
                                        trackColor={{ false: '#D1D1D6', true: theme.accent }}
                                    />
                                </View>
                            </View>

                            <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">Enrolled Students ({roster.length})</Text>
                        </>
                    }
                    ListEmptyComponent={
                        rosterLoading ? (
                            <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Text style={[styles.emptyText, { color: theme.subtext }]}>No students have entered this join code yet.</Text>
                            </View>
                        )
                    }
                />
                </View>
            </SafeAreaView>
        );
    }

    // Main Directory Selection Workspace
    // The default view: the list of all classes this teacher owns.
    return (
        <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTeacherClasses(); }} colors={[theme.accent]} />}
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>MY CLASSES</Text>
                <Text style={[styles.mainHeading, { color: theme.text }]} accessibilityRole="header">My Classes</Text>
                <Text style={[styles.subTextDescription, { color: theme.subtext }]}>
                    See your classes, manage join codes, and keep student rosters up to date.
                </Text>

                <TourTarget id="teacher.createClassButton">
                    <Pressable
                        style={({ pressed }) => [styles.launchSheetButton, { backgroundColor: theme.accent, opacity: pressed ? 0.9 : 1 }]}
                        onPress={() => setIsSheetOpen(true)}
                        accessibilityRole="button"
                    >
                        <Text style={styles.launchButtonText}>+ Create a New Class</Text>
                    </Pressable>
                </TourTarget>

                <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">Your Classes</Text>

                {classes.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={[styles.emptyText, { color: theme.subtext }]}>You haven&apos;t created any classes yet.</Text>
                    </View>
                ) : (
                    classes.map((cls) => (
                        <Pressable
                            key={cls.id}
                            style={({ pressed }) => [
                                styles.classMatrixSelectorRow,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                                pressed && { opacity: 0.8 }
                            ]}
                            onPress={() => {
                                setSelectedClass(cls);
                                void loadClassRoster(cls.id);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${cls.class_name}, join code ${cls.id}${cls.is_anonymous_required ? ', anonymous nicknames enforced' : ''}`}
                        >
                            <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text style={[styles.classSelectorTitleText, { color: theme.text }]}>{cls.class_name}</Text>
                                <Text style={[styles.classSelectorMetaSub, { color: theme.subtext }]}>
                                    Join Code: <Text style={{ fontWeight: '700', color: theme.text }}>{cls.id}</Text>
                                    {/* Appends a lock icon + label only for
                                        classes that have anonymity
                                        enforcement turned on. */}
                                    {cls.is_anonymous_required ? '  •  🔒 Anon Enforced' : ''}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
                        </Pressable>
                    ))
                )}
            </ScrollView>

            {/* Creation Blueprint bottom-sheet element */}
            {/* Nearly identical modal structure/styling to the
                "Create Classroom" sheet in (teacher-tabs)/index.tsx — see
                that file's comments for a detailed breakdown of each part
                (overlay, backdrop-tap-to-dismiss, sheet, keyboard
                handling, etc.), since this is effectively the same
                pattern duplicated here. */}
            <Modal visible={isSheetOpen} animationType="slide" transparent onRequestClose={() => setIsSheetOpen(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
                    <AdaptiveBlur />
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIsSheetOpen(false)} />

                    <View style={[styles.sheet, { backgroundColor: theme.background }]}>
                        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <View style={styles.sheetHeaderRow}>
                                <Text style={[styles.sheetTitle, { color: theme.text }]} accessibilityRole="header">Create New Class</Text>
                                <Pressable onPress={() => setIsSheetOpen(false)} accessibilityRole="button" accessibilityLabel="Close">
                                    <Ionicons name="close-circle" size={24} color={theme.subtext} />
                                </Pressable>
                            </View>
                            <View style={[styles.sheetDivider, { backgroundColor: theme.border }]} />

                            <Text style={styles.label}>CLASS NAME</Text>
                            <TextInput
                                value={newClassName}
                                onChangeText={setNewClassName}
                                style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                placeholder="e.g., Mrs. Williams' 4th Hour Geography"
                                placeholderTextColor={theme.subtext}
                            />

                            <Text style={styles.label}>CUSTOM JOIN CODE (OPTIONAL)</Text>
                            <TextInput
                                value={customCodeInput}
                                onChangeText={setCustomCodeInput}
                                autoCapitalize="characters"
                                maxLength={12}
                                style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                placeholder="Leaves blank to auto-generate (e.g. GEOG4)"
                                placeholderTextColor={theme.subtext}
                            />
                            <Text style={styles.helperText}>Alphanumeric codes are easiest for student keyboard configurations.</Text>

                            <Text style={[styles.label, { marginTop: 14 }]}>SCHOOL</Text>
                            <TextInput
                                value={overrideSchool}
                                onChangeText={setOverrideSchool}
                                style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                placeholder="e.g., Lincoln Elementary"
                            />

                            <Text style={styles.label}>DISTRICT</Text>
                            <TextInput
                                value={overrideDistrict}
                                onChangeText={setOverrideDistrict}
                                style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                                placeholder="e.g., Norman Public Schools"
                            />
                            <Text style={styles.helperText}>💡 Pre-filled from your profile. Adjust anytime for scouting or other tracking events.</Text>

                            <View style={styles.sheetActions}>
                                <Pressable style={[styles.actionButton, styles.cancelButton, { borderColor: theme.border }]} onPress={() => setIsSheetOpen(false)} accessibilityRole="button">
                                    <Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text>
                                </Pressable>
                                <Pressable style={[styles.actionButton, styles.saveButton, { backgroundColor: theme.accent }]} onPress={() => void handleCreateClass()} disabled={submitting} accessibilityRole="button">
                                    {submitting ? <ActivityIndicator color={theme.accentText} size="small" /> : <Text style={styles.saveText}>Create Class</Text>}
                                </Pressable>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1 },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    mainHeading: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    subTextDescription: { fontSize: 14, marginBottom: 16, lineHeight: 18 },
    launchSheetButton: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 24 },
    launchButtonText: { color: theme.accentText, fontWeight: '700', fontSize: 15 },
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: theme.subtext, marginBottom: 12, marginTop: 4, textTransform: 'uppercase' },
    emptyContainer: { padding: 32, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

    classMatrixSelectorRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 16, borderRadius: 14, marginBottom: 10 },
    classSelectorTitleText: { fontSize: 16, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 2 },
    classSelectorMetaSub: { fontSize: 13 },

    // Detail Panel
    detailHeaderBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
    detailHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
    backButton: { flexDirection: 'row', alignItems: 'center' },
    backButtonText: { fontSize: 15, fontWeight: '700', marginLeft: 4 },
    classHeroCard: { borderWidth: 1, padding: 16, borderRadius: 18, marginBottom: 20 },
    heroClassName: { fontSize: 22, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 4 },
    heroJoinCodeLabel: { fontSize: 13, color: theme.subtext, fontWeight: '600', letterSpacing: 0.5 },
    divider: { height: 1, marginVertical: 16 },
    toggleSettingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleSettingTitle: { fontSize: 15, fontWeight: '700' },
    toggleSettingSub: { fontSize: 12, color: theme.subtext, marginTop: 3, lineHeight: 16 },

    rosterCardRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 14, borderRadius: 12, marginBottom: 8 },
    rosterRealName: { fontSize: 15, fontWeight: '700' },
    rosterNickname: { fontSize: 12, marginTop: 2 },
    rosterMilesValue: { fontSize: 18, fontWeight: '800', fontFamily: 'Georgia' },
    rosterMilesUnit: { fontSize: 11, color: theme.subtext, fontWeight: '600', marginTop: 1 },
    removeCircleButton: { padding: 4, marginLeft: 4 },

    // Sheet Styles
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 22, maxHeight: '88%' },
    sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sheetTitle: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '700' },
    sheetDivider: { height: 1, marginVertical: 14 },
    label: { fontSize: 11, fontWeight: '700', color: theme.subtext, letterSpacing: 1, marginBottom: 6, marginTop: 10 },
    input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    helperText: { fontSize: 12, color: theme.subtext, marginTop: 4, lineHeight: 16 },
    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
    actionButton: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { borderWidth: 1 },
    saveButton: {},
    cancelText: { fontWeight: '600', fontSize: 15 },
    saveText: { color: theme.accentText, fontWeight: '700', fontSize: 15 }
});
