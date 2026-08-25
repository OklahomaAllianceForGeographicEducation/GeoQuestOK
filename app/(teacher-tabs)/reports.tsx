// app/(teacher-tabs)/reports.tsx
// Teacher-facing reports screen with 3 tabs: "My Students" (per-class
// rosters that drill down into per-question quiz grades, fitness-test
// results, and a day-by-day activity log for any student, plus PDF
// export), "My School" (aggregated totals for the teacher's building),
// and "District Map" (every school in the district, including ones with
// zero participants, to encourage recruitment). This is the single home
// for all student-facing data/grading — there is deliberately no separate
// "Grades" tab; it used to be one, and got folded in here to cut down on
// screens that all showed overlapping slices of the same roster.

// expo-print gives access to the device's native print/PDF generation
// dialog — used to turn an HTML string into a real, shareable/printable PDF.
import * as Print from 'expo-print';

// useFocusEffect runs its callback every time this SCREEN becomes focused
// (visible) again — including returning to it via tab navigation — unlike
// a plain useEffect, which would only run once on mount and never again
// just from switching tabs back and forth.
import { useFocusEffect } from 'expo-router';

// useCallback memoizes a function so it keeps the same identity across
// renders unless its dependencies change — required here because
// useFocusEffect expects a stable callback reference to avoid re-running
// unnecessarily.
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextStyle,
    useColorScheme,
    View
} from 'react-native';
import { colors, Theme } from '../../commonStyles';
import TourTarget from '../../components/tour/TourTarget';
import {
    ActivityLogEntry,
    fetchClassFitnessSummary,
    fetchStudentActivityLogs,
    FitnessResultEntry,
} from '../../lib/activity';
import { formatActivitySummary } from '../../lib/activityTypes';
import { showAlert } from '../../lib/confirmAlert';
import { escapeHtml } from '../../lib/htmlExport';
import { fetchClassQuizGradeMatrix, QuizGradeMatrix } from '../../lib/quizzes';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// Friendly labels for the 6 fixed exercises tracked by the student-facing
// Presidential Fitness Journal (app/(tabs)/fitness.tsx) — duplicated here
// as just a label lookup (not the full age/gender benchmark table, which
// stays student-side) since that file is a route, not a shared module.
const EXERCISE_LABELS: Record<string, string> = {
    curl_ups: 'Curl-Ups (1 min)',
    plank: 'Plank Hold',
    mile_run: 'One Mile Run',
    beep_test: '20m Beep Test',
    push_ups: 'Right-Angle Push-Ups',
    pull_ups: 'Pull-Ups',
};

// A collapsed-by-default sub-section within a student's expanded detail —
// shows just a one-line summary until tapped open. Without this, a
// student with a full semester of quizzes/fitness entries/activity logs
// would dump everything on screen the moment you expand them at all,
// which gets unmanageable fast for a teacher running 100+ students
// through this app.
function CollapsibleSection({
    title,
    summary,
    expanded,
    onToggle,
    theme,
    detailHeadingStyle,
    children,
}: {
    title: string;
    summary: string;
    expanded: boolean;
    onToggle: () => void;
    theme: typeof colors.light;
    // The parent screen already has its own `getStyles(theme)` computed
    // once per render — CollapsibleSection is instantiated 3x per expanded
    // student row (quiz/fitness/activity), so recomputing the whole ~20+
    // key page stylesheet from scratch in here just to read this one
    // property would be wasteful. Passed down instead.
    detailHeadingStyle: TextStyle;
    children: React.ReactNode;
}) {
    return (
        <View style={{ marginTop: 14 }}>
            <Pressable style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} aria-expanded={expanded}>
                <Text style={[detailHeadingStyle, { color: theme.subtext }]}>{expanded ? '▾' : '▸'} {title}</Text>
                {!expanded && <Text style={{ fontSize: 11, color: theme.subtext }}>{summary}</Text>}
            </Pressable>
            {expanded && <View style={{ marginTop: 6 }}>{children}</View>}
        </View>
    );
}

// One row in the "My Students" individual roster list. Derived from
// class_memberships (a student who joined one of this teacher's classes),
// not from district/school matching — students only ever get tied to a
// class via join code, never to a school/district on their own profile.
type StudentRow = {
    id: string;
    display_name: string;
    username: string;
    total_miles_walked: number | null;
};

// A generic aggregated summary row, reused for both the "Our School" tab
// (just one row, the teacher's own building) and the "District Map" tab
// (one row per school in the district).
type AggregatedRow = {
    label: string;          // school name shown as the row's title
    total_miles: number;    // summed miles across every member
    member_count: number;   // how many student accounts contributed
    // Marks a school in the district that has ZERO participating students
    // yet — used to show a distinct "recruit a friend" message instead of
    // just "0 mi".
    isEmptyInvitation?: boolean;
    // Marks this teacher's own school in the District Map tab, so it can
    // be bolded and pinned to the top as the fixed comparison point.
    isHomeSchool?: boolean;
};

// Another teacher (or admin) profile in this teacher's own district, shown
// in the "Our School" tab's staff directory.
type ColleagueRow = {
    id: string;
    display_name: string | null;
    username: string | null;
    school_name: string | null;
    app_role: string | null;
};

// One of this teacher's own classes (from the `classes` table they manage
// in the Classes tab), with mileage/participation rolled up from its
// class_memberships. Carries its own roster (`members`) so the Reports
// screen can show/hide each class's students independently — with 100+
// students across a full course load, one flat combined list stops being
// readable fast.
type ClassBreakdownRow = {
    id: string;
    class_name: string;
    join_code: string | null;
    member_count: number;
    total_miles: number;
    avg_miles: number;
    members: StudentRow[];
};

export default function SchoolReportsScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    // Whether the pull-to-refresh gesture is currently active.
    const [refreshing, setRefreshing] = useState(false);
    // Whether a PDF export is currently being generated.
    const [exporting, setExporting] = useState(false);

    // Core structural labels
    const [districtName, setDistrictName] = useState('');
    const [schoolName, setSchoolName] = useState('');
    // Whether this teacher's profile actually has a school_name set. When
    // it doesn't, the school/district-scoped queries below (Our School,
    // Teaching Staff) can't run — there's no campus to scope them to.
    const [schoolAssigned, setSchoolAssigned] = useState(true);

    // Active navigation tab
    // Which of the three tabs is currently selected.
    const [activeTab, setActiveTab] = useState<'classes' | 'school' | 'district'>('classes');

    // Real Data Stores
    const [schoolAggregates, setSchoolAggregates] = useState<AggregatedRow[]>([]);
    const [districtAggregates, setDistrictAggregates] = useState<AggregatedRow[]>([]);
    // Other teachers/admins in this teacher's district, same-school
    // colleagues sorted first (see loadReportsData below).
    const [colleagueRows, setColleagueRows] = useState<ColleagueRow[]>([]);
    const [classBreakdown, setClassBreakdown] = useState<ClassBreakdownRow[]>([]);
    // Which class cards currently have their roster expanded — collapsed
    // by default so a full course load (6 classes x ~30 students) stays
    // scannable instead of dumping 180 rows on screen at once.
    const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(new Set());
    const [loadingClassDetailFor, setLoadingClassDetailFor] = useState<Set<string>>(new Set());

    // Per-class quiz grade matrix (which assigned question, which student,
    // correct/incorrect) and fitness-test results — fetched lazily the
    // first time a class card is expanded, not for every class up front,
    // since a full 6-class course load doesn't need all of that in memory
    // just to show the collapsed summary rows.
    const [quizMatrixByClass, setQuizMatrixByClass] = useState<Map<string, QuizGradeMatrix>>(new Map());
    const [fitnessByClassStudent, setFitnessByClassStudent] = useState<Map<string, Map<string, FitnessResultEntry[]>>>(new Map());

    // Which individual student rows (within an expanded class) are
    // further expanded into their full detail view, and their lazily
    // fetched day-by-day activity log.
    const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(new Set());
    const [activityByStudent, setActivityByStudent] = useState<Map<string, ActivityLogEntry[]>>(new Map());
    const [loadingActivityFor, setLoadingActivityFor] = useState<Set<string>>(new Set());

    // Which of a student's 3 detail sub-sections (quiz/fitness/activity)
    // are open — collapsed by default, keyed "studentId:section", so
    // expanding one student doesn't dump every quiz grade + fitness entry
    // + activity log all at once.
    const [expandedDetailKeys, setExpandedDetailKeys] = useState<Set<string>>(new Set());

    function toggleDetailKey(key: string) {
        setExpandedDetailKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    async function toggleClassExpanded(classId: string) {
        const isExpanded = expandedClassIds.has(classId);
        setExpandedClassIds((prev) => {
            const next = new Set(prev);
            if (isExpanded) next.delete(classId);
            else next.add(classId);
            return next;
        });

        if (!isExpanded && !quizMatrixByClass.has(classId)) {
            setLoadingClassDetailFor((prev) => new Set(prev).add(classId));
            try {
                const [matrix, fitnessRows] = await Promise.all([
                    fetchClassQuizGradeMatrix(classId),
                    fetchClassFitnessSummary(classId).catch(() => [] as FitnessResultEntry[]),
                ]);
                setQuizMatrixByClass((prev) => new Map(prev).set(classId, matrix));

                const fitnessMap = new Map<string, FitnessResultEntry[]>();
                for (const row of fitnessRows) {
                    const list = fitnessMap.get(row.studentId) || [];
                    list.push(row);
                    fitnessMap.set(row.studentId, list);
                }
                for (const list of fitnessMap.values()) {
                    list.sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
                }
                setFitnessByClassStudent((prev) => new Map(prev).set(classId, fitnessMap));
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load quiz/fitness detail for this class.');
            } finally {
                setLoadingClassDetailFor((prev) => {
                    const next = new Set(prev);
                    next.delete(classId);
                    return next;
                });
            }
        }
    }

    async function toggleStudentExpanded(studentId: string) {
        const isExpanded = expandedStudentIds.has(studentId);
        setExpandedStudentIds((prev) => {
            const next = new Set(prev);
            if (isExpanded) next.delete(studentId);
            else next.add(studentId);
            return next;
        });

        if (!isExpanded && !activityByStudent.has(studentId)) {
            setLoadingActivityFor((prev) => new Set(prev).add(studentId));
            try {
                const logs = await fetchStudentActivityLogs(studentId);
                setActivityByStudent((prev) => new Map(prev).set(studentId, logs));
            } catch (err: any) {
                showAlert('Load Error', err.message || 'Could not load this student’s activity log.');
            } finally {
                setLoadingActivityFor((prev) => {
                    const next = new Set(prev);
                    next.delete(studentId);
                    return next;
                });
            }
        }
    }

    // Groups a student's raw activity_logs rows by calendar day (from
    // created_at), for the "broken down by day and activity" view rather
    // than one flat list.
    function groupActivityByDay(entries: ActivityLogEntry[]): { day: string; entries: ActivityLogEntry[] }[] {
        const byDay = new Map<string, ActivityLogEntry[]>();
        for (const entry of entries) {
            const day = new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            const list = byDay.get(day) || [];
            list.push(entry);
            byDay.set(day, list);
        }
        return [...byDay.entries()].map(([day, dayEntries]) => ({ day, entries: dayEntries }));
    }

    // The main data-loading function, used for both the initial load and
    // pull-to-refresh. Not wrapped in useCallback itself — it's recreated
    // fresh each render, but that's fine here since it's only referenced
    // inside the useCallback below at the moment it's actually needed.
    const loadReportsData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Fetch current teacher profile values
            const { data: teacherProfile, error: profileError } = await supabase
                .from('profiles')
                .select('district_id, school_district_name, school_name, app_role')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            // resolvedSchoolName is for DISPLAY only (the page header) —
            // rawSchoolName is the actual profile value (or null), used for
            // querying, so a query never matches against the placeholder
            // text itself.
            const resolvedDistrictId = teacherProfile?.district_id || '';
            const resolvedDistrictName = teacherProfile?.school_district_name || 'Unassigned District';
            const rawSchoolName: string | null = teacherProfile?.school_name || null;
            // A "school building" only exists as a concept for K-12
            // classroom teachers (district_id + an individual building) --
            // youth/scout leaders and professors are organization-based
            // accounts (their org name already lives in
            // school_district_name, with no district_id at all) and
            // admins operate at the whole-district level by design. Only
            // flag the school as genuinely "unassigned" for the K-12
            // teacher case; everyone else just shows their organization
            // name instead of a misleading "missing" label.
            const isSchoolBasedTeacher = teacherProfile?.app_role === 'teacher' && !!resolvedDistrictId;
            const resolvedSchoolName = rawSchoolName || (isSchoolBasedTeacher ? 'Unassigned School Building' : resolvedDistrictName);

            setDistrictName(resolvedDistrictName);
            setSchoolName(resolvedSchoolName);
            setSchoolAssigned(!!rawSchoolName || !isSchoolBasedTeacher);

            // =========================================================================
            // MY CLASSES + INDIVIDUAL ROSTER: per-class mileage/participation
            // and the flattened list of every student across those classes.
            // Both come from class_memberships, independent of district/
            // school assignment (a class belongs to a teacher, not a
            // district) — students here only ever get tied to a class via
            // join code, never to a school on their own profile.
            // =========================================================================
            const { data: myClasses, error: myClassesError } = await supabase
                .from('classes')
                .select('id, class_name, join_code')
                .eq('teacher_id', user.id)
                .order('created_at', { ascending: false });

            if (myClassesError) throw myClassesError;

            const classIds = (myClasses || []).map((c) => c.id);
            if (classIds.length === 0) {
                setClassBreakdown([]);
            } else {
                // No FK between class_memberships and classes/profiles, so
                // this is a manual two-step join, same pattern used
                // elsewhere in this file.
                const { data: allMemberships, error: membershipsError } = await supabase
                    .from('class_memberships')
                    .select('class_id, user_id')
                    .in('class_id', classIds);

                if (membershipsError) throw membershipsError;

                const memberUserIds = [...new Set((allMemberships || []).map((m) => m.user_id))];
                const { data: memberProfiles, error: memberProfilesError } = memberUserIds.length
                    ? await supabase.from('profiles').select('id, display_name, username, total_miles_walked').in('id', memberUserIds)
                    : { data: [], error: null };

                if (memberProfilesError) throw memberProfilesError;

                const profilesById = new Map((memberProfiles || []).map((p) => [p.id, p]));
                const milesByUserId = new Map((memberProfiles || []).map((p) => [p.id, Number(p.total_miles_walked || 0)]));

                const breakdown: ClassBreakdownRow[] = (myClasses || []).map((c) => {
                    const classMemberIds = (allMemberships || [])
                        .filter((m) => m.class_id === c.id)
                        .map((m) => m.user_id);
                    const totalMiles = classMemberIds.reduce((sum, id) => sum + (milesByUserId.get(id) || 0), 0);
                    const members: StudentRow[] = classMemberIds
                        .map((id) => profilesById.get(id))
                        .filter((p): p is NonNullable<typeof p> => p != null)
                        .map((p) => ({
                            id: p.id,
                            display_name: p.display_name || '',
                            username: p.username || '',
                            total_miles_walked: p.total_miles_walked,
                        }))
                        .sort((a, b) => Number(b.total_miles_walked || 0) - Number(a.total_miles_walked || 0));
                    return {
                        id: c.id,
                        class_name: c.class_name,
                        join_code: c.join_code,
                        member_count: classMemberIds.length,
                        total_miles: totalMiles,
                        avg_miles: classMemberIds.length > 0 ? totalMiles / classMemberIds.length : 0,
                        members,
                    };
                });
                setClassBreakdown(breakdown);
            }

            // If this teacher has no district assigned at all, there's
            // nothing meaningful to query for the school/district tabs —
            // clear those data sets and stop early rather than running
            // queries that would return nothing useful. My Classes/
            // Individual Roster above are unaffected by this.
            if (!resolvedDistrictId) {
                setSchoolAggregates([]);
                setDistrictAggregates([]);
                setColleagueRows([]);
                setLoading(false);
                return;
            }

            // =========================================================================
            // Per-school totals across this teacher's DISTRICT (any
            // teacher, any school) — the shared basis for both VIEW B (My
            // School) and VIEW C (District Map) below. Computed entirely
            // server-side by get_district_school_totals (a SECURITY
            // DEFINER function): it aggregates through
            // classes.school_name/district_id -- since students are only
            // ever tied to the app via class_memberships, never a
            // school_name on their own profile -- and returns ONLY
            // (school_name, total_miles, member_count) per school. No
            // individual student id/name/row for another school ever
            // reaches this client at all, unlike an equivalent client-side
            // aggregation over raw rows would. See
            // supabase/tighten-district-aggregate-privacy.sql.
            // =========================================================================
            const { data: schoolTotalsRows, error: schoolTotalsError } = await supabase.rpc(
                'get_district_school_totals',
                { target_district_id: resolvedDistrictId }
            );

            if (schoolTotalsError) throw schoolTotalsError;

            const totalsBySchool = new Map<string, { total_miles: number; member_count: number }>(
                (schoolTotalsRows || []).map((row: any) => [
                    row.school_name as string,
                    { total_miles: Number(row.total_miles || 0), member_count: Number(row.member_count || 0) }
                ])
            );

            // =========================================================================
            // VIEW B: MY SCHOOL (Privacy-Compliant Totals For Teacher's Building)
            // =========================================================================
            // Only runs once this teacher's own profile actually has a
            // school_name set — without one, there's no campus to scope
            // this to (matching against the "Unassigned..." display
            // placeholder would just silently return nothing).
            if (rawSchoolName) {
                const mine = totalsBySchool.get(rawSchoolName) || { total_miles: 0, member_count: 0 };

                // Only ever one entry in this array — the teacher's own
                // school — but it's shaped as an AggregatedRow[] so the
                // same rendering code/styles can be reused for both this
                // tab and the multi-school district tab below.
                setSchoolAggregates([
                    {
                        label: resolvedSchoolName,
                        total_miles: mine.total_miles,
                        member_count: mine.member_count
                    }
                ]);

                // Other teachers/admins at this teacher's own school
                // specifically (not the whole district). Sourced from a
                // SECURITY DEFINER RPC (not a direct `.from('profiles')`
                // select) that returns only public-directory columns,
                // pre-scoped server-side to the caller's own district — see
                // supabase/fix-profiles-same-district-column-leak.sql.
                type DistrictProfileRow = {
                    id: string;
                    username: string | null;
                    display_name: string | null;
                    school_name: string | null;
                    app_role: string | null;
                };
                const { data: districtProfiles, error: colleaguesError } = await supabase.rpc('get_district_profiles_public');

                if (colleaguesError) throw colleaguesError;

                const colleaguesData: DistrictProfileRow[] = (districtProfiles || []).filter((row: DistrictProfileRow) =>
                    row.school_name === rawSchoolName &&
                    ['teacher', 'admin'].includes(row.app_role || '') &&
                    row.id !== user.id
                );

                const sortedColleagues = (colleaguesData || []).slice().sort((a, b) => {
                    const aName = a.display_name || a.username || '';
                    const bName = b.display_name || b.username || '';
                    return aName.localeCompare(bName);
                });
                setColleagueRows(sortedColleagues);
            } else {
                setSchoolAggregates([]);
                setColleagueRows([]);
            }

            // =========================================================================
            // VIEW C: DISTRICT STANDINGS (Cross-referencing Schools Registry for Recruitment)
            // =========================================================================
            // "schools_registry" is presumably a master list of every
            // known school in a district, INCLUDING ones that don't have
            // any app users yet — used so the district tab can show
            // schools with zero participation (an "invite/recruit" state)
            // rather than only showing schools that already have data.
            const { data: formalDistrictSchools, error: registryError } = await supabase
                .from('schools_registry')
                .select('school_name')
                .eq('district_id', resolvedDistrictId)
                .order('school_name', { ascending: true });

            if (registryError) throw registryError;

            const processedDistrictStandings: AggregatedRow[] = (formalDistrictSchools || []).map((registrySchool) => {
                // .trim().toLowerCase() on both sides makes the name
                // comparison forgiving of stray whitespace or inconsistent
                // capitalization between how a school name was typed in
                // the registry vs. on a class's school_name.
                const normalizedTarget = registrySchool.school_name?.trim().toLowerCase();
                const matchingSchoolKey = [...totalsBySchool.keys()].find(
                    (key) => key.trim().toLowerCase() === normalizedTarget
                );
                const totals = matchingSchoolKey ? totalsBySchool.get(matchingSchoolKey)! : { total_miles: 0, member_count: 0 };

                return {
                    label: registrySchool.school_name,
                    total_miles: totals.total_miles,
                    member_count: totals.member_count,
                    // A school with literally zero matching students gets
                    // flagged so the UI can show a distinct "recruit"
                    // message instead of a plain "0 mi" row.
                    isEmptyInvitation: totals.member_count === 0
                };
            });

            // Sort by total miles descending, then pull this teacher's own
            // school to the very top regardless of rank — it's always the
            // thing being compared FROM, so it should be the fixed
            // reference point at the top rather than wherever it happens
            // to rank.
            processedDistrictStandings.sort((a, b) => b.total_miles - a.total_miles);
            if (rawSchoolName) {
                const homeIndex = processedDistrictStandings.findIndex(
                    (s) => s.label.trim().toLowerCase() === rawSchoolName.trim().toLowerCase()
                );
                if (homeIndex !== -1) {
                    processedDistrictStandings[homeIndex].isHomeSchool = true;
                    if (homeIndex > 0) {
                        const [home] = processedDistrictStandings.splice(homeIndex, 1);
                        processedDistrictStandings.unshift(home);
                    }
                }
            }
            setDistrictAggregates(processedDistrictStandings);

        } catch (error: any) {
            console.error("Error synchronizing reports data:", error);
            showAlert('Could Not Load Reports', error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // useFocusEffect + useCallback together mean: "run loadReportsData
    // every time this screen comes into focus" (e.g. switching to this tab
    // from another one), not just on the very first mount. The empty `[]`
    // dependency array inside useCallback keeps the wrapped function
    // stable across renders, which useFocusEffect requires to avoid
    // re-triggering itself unnecessarily.
    useFocusEffect(
        useCallback(() => {
            loadReportsData();
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadReportsData();
    };

    // Builds a gradebook-ready HTML report — one table per class, a
    // column per assigned quiz question, a fitness-test summary column —
    // and hands it to the device's native print/PDF system, so a teacher
    // can save it or transcribe it straight into another gradebook.
    // Fetches quiz/fitness data fresh for EVERY class (not just ones the
    // teacher happened to expand on screen), so the export is always
    // complete regardless of what's currently expanded.
    const handleExportPDF = async () => {
        if (classBreakdown.length === 0) return;
        try {
            setExporting(true);

            const classSections = await Promise.all(
                classBreakdown.map(async (c) => {
                    const [matrix, fitnessRows] = await Promise.all([
                        quizMatrixByClass.get(c.id) ?? fetchClassQuizGradeMatrix(c.id),
                        fetchClassFitnessSummary(c.id).catch(() => [] as FitnessResultEntry[]),
                    ]);

                    const fitnessByStudent = new Map<string, FitnessResultEntry[]>();
                    for (const row of fitnessRows) {
                        const list = fitnessByStudent.get(row.studentId) || [];
                        list.push(row);
                        fitnessByStudent.set(row.studentId, list);
                    }

                    return { classInfo: c, matrix, fitnessByStudent };
                })
            );

            // One row per class, summarizing participation/mileage, ahead
            // of the detailed per-class tables below.
            const classRowsHtml = classBreakdown.map((c) => `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 10px; font-weight: bold;">${escapeHtml(c.class_name)}</td>
                    <td style="padding: 10px; color:#666;">${escapeHtml(c.join_code || c.id)}</td>
                    <td style="padding: 10px; text-align: center;">${c.member_count}</td>
                    <td style="padding: 10px; text-align: right;">${formatMiles(c.avg_miles)} mi</td>
                    <td style="padding: 10px; text-align: right; font-weight: bold; color: #DE9027;">${formatMiles(c.total_miles)} mi</td>
                </tr>
            `).join('');

            // One full gradebook-style table per class: a column per
            // assigned quiz question (✓ correct / ✗ incorrect / — not
            // attempted), plus miles and a fitness-test summary.
            const classSectionsHtml = classSections.map(({ classInfo: c, matrix, fitnessByStudent }) => {
                const quizHeaderCells = matrix.assignments
                    .map((a) => `<th style="text-align:center; font-size:11px;">${escapeHtml(a.landmarkTitle)}</th>`)
                    .join('');

                const studentRowsHtml = c.members.map((student) => {
                    const studentGrades = matrix.grades.get(student.id);
                    const quizCells = matrix.assignments.map((a) => {
                        const status = studentGrades?.get(a.assignmentId) ?? 'not_attempted';
                        const symbol = status === 'correct' ? '✓' : status === 'incorrect' ? '✗' : '—';
                        const color = status === 'correct' ? '#3A8F52' : status === 'incorrect' ? '#C1443A' : '#999';
                        return `<td style="text-align:center; color:${color}; font-weight:bold;">${symbol}</td>`;
                    }).join('');

                    const fitnessEntries = fitnessByStudent.get(student.id) || [];
                    const targetsMet = fitnessEntries.filter((f) => f.isTargetMet).length;
                    const fitnessCell = fitnessEntries.length > 0 ? `${targetsMet}/${fitnessEntries.length} targets met` : '—';

                    return `
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px; font-weight: bold;">${escapeHtml(student.display_name || student.username || 'Anonymous')}</td>
                            <td style="padding: 8px; text-align: right;">${formatMiles(Number(student.total_miles_walked || 0))} mi</td>
                            ${quizCells}
                            <td style="padding: 8px; text-align: center;">${fitnessCell}</td>
                        </tr>
                    `;
                }).join('');

                return `
                    <h3>${escapeHtml(c.class_name)} <span style="font-size:12px; font-weight:normal; color:#666;">(Code: ${escapeHtml(c.join_code || c.id)})</span></h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th style="text-align:right;">Miles</th>
                                ${quizHeaderCells}
                                <th style="text-align:center;">Fitness Test</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${studentRowsHtml || `<tr><td colspan="${3 + matrix.assignments.length}" style="padding:10px; color:#999; font-style:italic;">No students have joined this class yet.</td></tr>`}
                        </tbody>
                    </table>
                `;
            }).join('');

            // A full, self-contained HTML document (complete with its own
            // <style> block) that Print.printAsync will render into a PDF
            // or send to a printer. new Date().toLocaleDateString() prints
            // today's date formatted for the user's locale.
            const htmlContent = `
                <html>
                    <head><style>body{font-family:sans-serif; padding:20px;} table{width:100%; border-collapse:collapse; margin-bottom: 20px;} th{background:#f4f4f4; padding:8px; text-align:left; font-size:12px;} h2{margin-bottom:4px;} h3{margin-top:24px; margin-bottom:8px; color:#4E3629;}</style></head>
                    <body>
                        <h2>Grade Summary Report</h2>
                        <p><b>Teacher's School:</b> ${escapeHtml(schoolName)} &middot; <b>Date:</b> ${new Date().toLocaleDateString()}</p>
                        <p style="font-size:12px; color:#666;">✓ = correct &middot; ✗ = incorrect &middot; — = not attempted. Fitness column shows targets met out of exercises logged.</p>

                        <h3 style="margin-top:0;">My Classes Overview</h3>
                        <table>
                            <thead><tr><th>Class</th><th>Join Code</th><th style="text-align:center;">Students</th><th style="text-align:right;">Avg / Student</th><th style="text-align:right;">Total Miles</th></tr></thead>
                            <tbody>${classRowsHtml}</tbody>
                        </table>

                        ${classSectionsHtml}
                    </body>
                </html>
            `;
            if (Platform.OS === 'web') {
                // expo-print's web implementation doesn't actually render
                // the `html` we hand it at all -- it just calls the
                // browser's own window.print(), which prints whatever's
                // currently on screen (this whole app, tab bar included).
                // Opening the report HTML in its own window and printing
                // THAT window instead is what actually scopes the PDF to
                // just the report.
                const printWindow = window.open('', '_blank');
                if (!printWindow) {
                    throw new Error('Could not open the print window. Check if your browser is blocking pop-ups for this site.');
                }
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                printWindow.focus();
                // A brief delay lets the new window finish laying out the
                // content before the print dialog captures it -- printing
                // immediately after document.write can occasionally race
                // ahead of layout in some browsers.
                setTimeout(() => printWindow.print(), 250);
            } else {
                // Hands the HTML off to Expo's print module, which opens
                // the native print/share/save-as-PDF dialog on the device.
                await Print.printAsync({ html: htmlContent });
            }
        } catch (error: any) {
            showAlert('Export Failed', error.message);
        } finally {
            setExporting(false);
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
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                // colors={[theme.accent]} tints the pull-to-refresh
                // spinner itself with the accent color (Android-specific
                // prop; iOS uses its own default spinner look regardless).
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>MY REPORTS</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{schoolName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>{districtName}</Text>

                {/* Segmented Controls */}
                {/* `(['classes', 'school', 'district'] as const)` creates
                    a readonly tuple of exactly these 3 string literals
                    (rather than a generic string[]), which lets
                    TypeScript verify each `tab` value below is one of the
                    exact three options `activeTab` is allowed to be. */}
                <View style={styles.tabContainer}>
                    {(['classes', 'school', 'district'] as const).map((tab) => (
                        <Pressable
                            key={tab}
                            style={[styles.tabButton, activeTab === tab && { backgroundColor: theme.accent }]}
                            onPress={() => setActiveTab(tab)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: activeTab === tab }}
                            aria-selected={activeTab === tab}
                        >
                            <Text style={[styles.tabButtonText, activeTab === tab ? { color: theme.accentText, fontWeight: '700' } : { color: theme.text }]}>
                                {/* Each of these three lines only renders
                                    if `tab` matches — since JSX renders
                                    `false` as nothing, only exactly one of
                                    these three expressions ever actually
                                    shows text for any given tab button. A
                                    slightly unusual way to write a 3-way
                                    branch, but equivalent to a chained
                                    ternary or switch statement. */}
                                {tab === 'classes' && '📋 My Students'}
                                {tab === 'school' && '🏫 My School'}
                                {tab === 'district' && '🗺️ District Map'}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {/* TAB VIEW A: MY STUDENTS */}
                {activeTab === 'classes' && (
                    <View>
                        <Text style={styles.sectionHeading} accessibilityRole="header">MY CLASSES</Text>
                        {classBreakdown.length === 0 ? (
                            <Text style={styles.emptyText}>You haven&apos;t created any classes yet — set one up from the Classes tab.</Text>
                        ) : (
                            classBreakdown.map((c) => {
                                const isExpanded = expandedClassIds.has(c.id);
                                return (
                                    <View key={c.id} style={{ marginBottom: 4 }}>
                                        <Pressable
                                            style={[styles.aggregateRow, { borderBottomColor: theme.border }]}
                                            onPress={() => void toggleClassExpanded(c.id)}
                                            accessibilityRole="button"
                                            accessibilityState={{ expanded: isExpanded }}
                                            aria-expanded={isExpanded}
                                        >
                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                <Text style={[styles.rowTitle, { color: theme.text }]}>
                                                    {isExpanded ? '▾' : '▸'} {c.class_name}
                                                </Text>
                                                <Text style={{ fontSize: 12, color: theme.subtext }}>
                                                    {c.member_count} student{c.member_count === 1 ? '' : 's'} · Code: {c.join_code || c.id} · Avg {formatMiles(c.avg_miles)} mi/student
                                                </Text>
                                            </View>
                                            <Text style={styles.rowStat}>{formatMiles(c.total_miles)} mi</Text>
                                        </Pressable>

                                        {isExpanded && (
                                            <View style={{ paddingLeft: 12, paddingBottom: 12 }}>
                                                {c.members.length === 0 ? (
                                                    <Text style={styles.emptyText}>No students have joined this class yet.</Text>
                                                ) : loadingClassDetailFor.has(c.id) ? (
                                                    <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 8 }} />
                                                ) : (
                                                    c.members.map((student) => {
                                                        const isStudentExpanded = expandedStudentIds.has(student.id);
                                                        const matrix = quizMatrixByClass.get(c.id);
                                                        const studentGrades = matrix?.grades.get(student.id);
                                                        const correctCount = (matrix?.assignments || []).filter((a) => studentGrades?.get(a.assignmentId) === 'correct').length;
                                                        const fitnessEntries = fitnessByClassStudent.get(c.id)?.get(student.id) || [];

                                                        return (
                                                            <View key={student.id} style={[styles.studentCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                                                                <Pressable style={styles.studentHeader} onPress={() => void toggleStudentExpanded(student.id)} accessibilityRole="button" accessibilityState={{ expanded: isStudentExpanded }} aria-expanded={isStudentExpanded}>
                                                                    <View>
                                                                        <Text style={[styles.studentName, { color: theme.text }]}>
                                                                            {isStudentExpanded ? '▾' : '▸'} {student.display_name || student.username || 'Anonymous'}
                                                                        </Text>
                                                                        <Text style={{ fontSize: 12, color: theme.subtext }}>
                                                                            @{student.username || 'unknown'}
                                                                            {matrix && matrix.assignments.length > 0 ? ` · ${correctCount}/${matrix.assignments.length} quizzes correct` : ''}
                                                                        </Text>
                                                                    </View>
                                                                    <Text style={[styles.studentMiles, { color: theme.accent }]}>{formatMiles(Number(student.total_miles_walked || 0))} mi</Text>
                                                                </Pressable>

                                                                {isStudentExpanded && (() => {
                                                                    const quizKey = `${student.id}:quiz`;
                                                                    const fitnessKey = `${student.id}:fitness`;
                                                                    const activityKey = `${student.id}:activity`;
                                                                    const activityEntries = activityByStudent.get(student.id) || [];
                                                                    const targetsMet = fitnessEntries.filter((f) => f.isTargetMet).length;

                                                                    return (
                                                                        <View style={{ marginTop: 4 }}>
                                                                            <CollapsibleSection
                                                                                title="QUIZ GRADES"
                                                                                summary={matrix && matrix.assignments.length > 0 ? `${correctCount}/${matrix.assignments.length} correct` : 'None assigned'}
                                                                                expanded={expandedDetailKeys.has(quizKey)}
                                                                                onToggle={() => toggleDetailKey(quizKey)}
                                                                                theme={theme}
                                                                                detailHeadingStyle={styles.detailHeading}
                                                                            >
                                                                                {!matrix || matrix.assignments.length === 0 ? (
                                                                                    <Text style={styles.detailEmptyText}>No quizzes assigned to this class yet.</Text>
                                                                                ) : (
                                                                                    matrix.assignments.map((a) => {
                                                                                        const status = studentGrades?.get(a.assignmentId) ?? 'not_attempted';
                                                                                        const statusLabel = status === 'correct' ? '✅ Correct' : status === 'incorrect' ? '❌ Incorrect' : '⏳ Not attempted';
                                                                                        const statusColor = status === 'correct' ? theme.secondary : status === 'incorrect' ? theme.error : theme.subtext;
                                                                                        return (
                                                                                            <View key={a.assignmentId} style={styles.detailRow}>
                                                                                                <Text style={{ fontSize: 13, color: theme.text, flex: 1, paddingRight: 8 }}>{a.landmarkTitle}</Text>
                                                                                                <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                                                                                            </View>
                                                                                        );
                                                                                    })
                                                                                )}
                                                                            </CollapsibleSection>

                                                                            <CollapsibleSection
                                                                                title="PRESIDENTIAL FITNESS TEST"
                                                                                summary={fitnessEntries.length > 0 ? `${targetsMet}/${fitnessEntries.length} targets met` : 'No results yet'}
                                                                                expanded={expandedDetailKeys.has(fitnessKey)}
                                                                                onToggle={() => toggleDetailKey(fitnessKey)}
                                                                                theme={theme}
                                                                                detailHeadingStyle={styles.detailHeading}
                                                                            >
                                                                                {fitnessEntries.length === 0 ? (
                                                                                    <Text style={styles.detailEmptyText}>No fitness test results logged yet.</Text>
                                                                                ) : (
                                                                                    fitnessEntries.map((entry, idx) => (
                                                                                        <View key={idx} style={styles.detailRow}>
                                                                                            <Text style={{ fontSize: 13, color: theme.text, flex: 1, paddingRight: 8 }}>
                                                                                                {EXERCISE_LABELS[entry.exerciseLogged] || entry.exerciseLogged}
                                                                                                {'  '}
                                                                                                <Text style={{ color: theme.subtext, fontSize: 12 }}>
                                                                                                    {new Date(entry.loggedAt).toLocaleDateString()}
                                                                                                </Text>
                                                                                            </Text>
                                                                                            <Text style={{ fontSize: 12, fontWeight: '700', color: entry.isTargetMet ? theme.secondary : theme.error }}>
                                                                                                {entry.exerciseScore ?? '—'} {entry.isTargetMet ? '✅ Target Met' : '❌ Below Target'}
                                                                                            </Text>
                                                                                        </View>
                                                                                    ))
                                                                                )}
                                                                            </CollapsibleSection>

                                                                            <CollapsibleSection
                                                                                title="ACTIVITY LOG BY DAY"
                                                                                summary={loadingActivityFor.has(student.id) ? 'Loading…' : activityEntries.length > 0 ? `${activityEntries.length} entries` : 'None logged'}
                                                                                expanded={expandedDetailKeys.has(activityKey)}
                                                                                onToggle={() => toggleDetailKey(activityKey)}
                                                                                theme={theme}
                                                                                detailHeadingStyle={styles.detailHeading}
                                                                            >
                                                                                {loadingActivityFor.has(student.id) ? (
                                                                                    <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 8 }} />
                                                                                ) : activityEntries.length === 0 ? (
                                                                                    <Text style={styles.detailEmptyText}>No activity logged yet.</Text>
                                                                                ) : (
                                                                                    groupActivityByDay(activityEntries).map(({ day, entries }) => (
                                                                                        <View key={day} style={{ marginBottom: 8 }}>
                                                                                            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 2 }}>{day}</Text>
                                                                                            {entries.map((entry) => (
                                                                                                <Text key={entry.id} style={{ fontSize: 12, color: theme.subtext, marginLeft: 8 }}>
                                                                                                    • {formatActivitySummary(entry.activityType, entry.inputAmount, entry.inputUnit) || `${formatMiles(entry.miles)} mi logged`}
                                                                                                    {' — '}{formatMiles(entry.miles)} mi
                                                                                                </Text>
                                                                                            ))}
                                                                                        </View>
                                                                                    ))
                                                                                )}
                                                                            </CollapsibleSection>
                                                                        </View>
                                                                    );
                                                                })()}
                                                            </View>
                                                        );
                                                    })
                                                )}
                                            </View>
                                        )}
                                    </View>
                                );
                            })
                        )}

                        <TourTarget id="teacher.exportButton">
                            <Pressable
                                style={({ pressed }) => [styles.exportButton, { backgroundColor: theme.accent, opacity: pressed || exporting ? 0.8 : 1, marginTop: 24 }]}
                                onPress={() => void handleExportPDF()}
                                disabled={exporting}
                                accessibilityRole="button"
                            >
                                <Text style={styles.exportButtonText}>{exporting ? 'Generating Print File...' : 'Export Grade Summary PDF'}</Text>
                            </Pressable>
                        </TourTarget>
                    </View>
                )}

                {/* TAB VIEW B: OUR SCHOOL */}
                {activeTab === 'school' && (
                    <View>
                        <Text style={styles.sectionHeading} accessibilityRole="header">MY SCHOOL&apos;S ACTIVITY</Text>
                        {!schoolAssigned ? (
                            <Text style={styles.emptyText}>
                                Your profile doesn&apos;t have a school building set yet — add one from Account Settings to see campus-wide totals.
                            </Text>
                        ) : schoolAggregates.map((group, idx) => (
                            // Using the array index as `key` here (rather
                            // than a stable id) is generally discouraged in
                            // React, but is low-risk in this specific case
                            // since schoolAggregates only ever contains
                            // exactly one static entry that doesn't get
                            // reordered.
                            <View key={idx} style={[styles.aggregateRow, { borderBottomColor: theme.border }]}>
                                <View>
                                    <Text style={[styles.rowTitle, { color: theme.text }]}>{group.label}</Text>
                                    <Text style={{ fontSize: 12, color: theme.subtext }}>{group.member_count} student account{group.member_count === 1 ? '' : 's'} linked</Text>
                                </View>
                                <Text style={styles.rowStat}>{formatMiles(group.total_miles)} mi</Text>
                            </View>
                        ))}

                        <Text style={[styles.sectionHeading, { marginTop: 28 }]} accessibilityRole="header">TEACHING STAFF AT YOUR SCHOOL</Text>
                        {!schoolAssigned ? null : colleagueRows.length === 0 ? (
                            <Text style={styles.emptyText}>No other teachers or admins registered at your school yet.</Text>
                        ) : (
                            colleagueRows.map((colleague) => (
                                <View key={colleague.id} style={[styles.aggregateRow, { borderBottomColor: theme.border }]}>
                                    <View>
                                        <Text style={[styles.rowTitle, { color: theme.text }]}>{colleague.display_name || colleague.username || 'Unnamed Staff'}</Text>
                                        {colleague.app_role === 'admin' ? (
                                            <Text style={{ fontSize: 12, color: theme.subtext }}>District Admin</Text>
                                        ) : null}
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {/* TAB VIEW C: DISTRICT MAP */}
                {activeTab === 'district' && (
                    <View>
                        <Text style={styles.sectionHeading} accessibilityRole="header">DISTRICT SCHOOLS</Text>
                        {districtAggregates.length === 0 ? (
                            <Text style={styles.emptyText}>No schools found for your district yet.</Text>
                        ) : (
                            districtAggregates.map((school, idx) => (
                                <View
                                    key={idx}
                                    style={[
                                        styles.aggregateRow,
                                        { borderBottomColor: theme.border },
                                        // marginHorizontal cancels out the paddingHorizontal below --
                                        // otherwise this row's highlighted "card" background would be
                                        // visibly narrower than every other school's row, since none of
                                        // the other rows have any horizontal padding at all.
                                        school.isHomeSchool && { backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 10, marginHorizontal: -10, borderBottomWidth: 0 }
                                    ]}
                                >
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                        <Text style={[styles.rowTitle, { color: theme.text }, school.isHomeSchool && { fontWeight: '800' }]}>
                                            {school.isHomeSchool ? '⭐ ' : ''}{school.label}
                                        </Text>
                                        {/* Schools with zero participants
                                            show an orange/red "recruit"
                                            call-to-action message instead
                                            of the normal member-count line.
                                            The same color/copy pattern is
                                            reused in (admin-tabs)/schools.tsx
                                            and (site-admin-tabs)/district.tsx.
                                            Color darkened from the original
                                            #E07A5F (2.95:1 on white, failing
                                            AA) to #A34E36 (5.68:1) -- caught
                                            during a pre-alpha /impeccable
                                            audit; fixed in all three places
                                            at once since it's one shared,
                                            deliberate token, not drift. */}
                                        {school.isEmptyInvitation ? (
                                            <Text style={{ fontSize: 12, color: '#A34E36', fontWeight: '600' }}>
                                                No active users yet 🚀 Recruit a friend!
                                            </Text>
                                        ) : (
                                            <Text style={{ fontSize: 12, color: theme.subtext }}>
                                                {school.member_count} active trackers participating
                                            </Text>
                                        )}
                                    </View>
                                    {/* When isEmptyInvitation is true, the
                                        mileage number is de-emphasized
                                        (colored to match the border, i.e.
                                        very faint) and hardcoded to show
                                        "0.0 mi" rather than the actual
                                        (zero) total_miles value — same end
                                        result either way, just written
                                        explicitly. */}
                                    <Text style={[styles.rowStat, school.isEmptyInvitation && { color: theme.border }, school.isHomeSchool && { fontWeight: '800' }]}>
                                        {school.isEmptyInvitation ? '0.0 mi' : `${school.total_miles.toFixed(1)} mi`}
                                    </Text>
                                </View>
                            ))
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1 },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    subtitle: { fontSize: 14, marginBottom: 20 },
    // The classic iOS "segmented control" look: a pill-shaped background
    // container, with individual buttons inside it that get a solid
    // accent-color background when active.
    tabContainer: { flexDirection: 'row', gap: 6, backgroundColor: theme.border, padding: 4, borderRadius: 12, marginBottom: 20 },
    // flex: 1 on each tab button makes the 3 tabs split the row evenly.
    tabButton: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    tabButtonText: { fontSize: 12, fontWeight: '600' },
    sectionHeading: { fontSize: 11, letterSpacing: 1, fontWeight: '800', color: theme.subtext, marginBottom: 12, marginTop: 4 },
    // A light-blue callout box styling for the "🔒 privacy" disclaimer
    // text — background/text colors chosen to look like an informational
    // banner rather than a warning.
    exportButton: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 20 },
    exportButtonText: { color: theme.accentText, fontSize: 15, fontWeight: '700' },
    emptyText: { color: theme.subtext, fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    studentCard: { padding: 16, borderWidth: 1, borderRadius: 14, marginBottom: 10 },
    studentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    studentName: { fontSize: 16, fontWeight: '600' },
    studentMiles: { fontSize: 18, fontWeight: '700', fontFamily: 'Georgia' },
    aggregateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    rowTitle: { fontSize: 15, fontWeight: '600' },
    rowStat: { fontSize: 16, fontWeight: '700', color: theme.text },
    detailHeading: { fontSize: 10, letterSpacing: 1, fontWeight: '800', color: theme.subtext, marginBottom: 6 },
    detailEmptyText: { fontSize: 12, color: theme.subtext, fontStyle: 'italic' },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
});
