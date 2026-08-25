// app/(site-admin-tabs)/school.tsx
//
// FILE-LEVEL OVERVIEW:
// -------------------------------------------------------------------------
// The "My School" tab screen inside the `(site-admin-tabs)` route group
// (see this folder's `_layout.tsx` for what an Expo Router route group and
// `_layout.tsx` are). Screen/role: Site Administrator (building principal).
// This is the most detailed screen in the site-admin shell: it shows every
// class at the admin's own school as a collapsible card with roll-up stats,
// and lets the admin expand a class to see individual students' miles
// walked and fitness targets met.
//
// Site Administrator's own school: district-admin-style class rollups
// (member count, total miles, fitness targets met) PLUS a per-student
// drill-down inside each class -- exactly two numbers per student (miles
// walked, Presidential Fitness Test targets met). Never a quiz score, a
// raw activity-log entry, or anything else about an individual student.

import { Ionicons } from '@expo/vector-icons';
// `useFocusEffect`: re-run a callback every time this tab screen regains
// focus (not just on first mount) -- see the detailed note in district.tsx
// in this same folder for why that matters for tab screens.
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, type Theme } from '../../commonStyles';
import TourTarget from '../../components/tour/TourTarget';
import { fetchSiteAdminSchoolReport, groupByClass, type SiteAdminClassGroup } from '../../lib/siteAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// react-native-web's Alert.alert() is a complete no-op (see
// lib/confirmAlert.ts) -- a plain info/error Alert.alert(...) call here
// would silently do nothing on web.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

/**
 * pct
 * ---------------------------------------------------------------------
 * Small formatting helper: turns a numerator/denominator pair into a
 * rounded whole-number percentage string like "75%". Guards against
 * dividing by zero (returns "0%" if `denominator` is zero or negative)
 * so a class/school with no fitness entries yet doesn't render "NaN%".
 * Params: `numerator`, `denominator` -- both plain numbers.
 * Returns: a percentage string.
 */
function pct(numerator: number, denominator: number): string {
    if (denominator <= 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

/**
 * StatTile
 * ---------------------------------------------------------------------
 * A small reusable presentational component: one "stat card" showing a
 * big value (e.g. "42") over a small label (e.g. "Students"). Used in the
 * stat grid near the top of this screen.
 * Props:
 *   - label: the caption text under the value.
 *   - value: the big headline text (already formatted as a string by
 *     the caller, e.g. via `formatMiles` or `pct`).
 *   - theme: the current color theme object, used for background/border/
 *     text colors.
 *   - accentValue: optional -- when true, renders the value in the theme's
 *     accent color instead of the default text color, to visually
 *     highlight especially important stats (miles, fitness %).
 * Returns: a themed card `<View>` containing the value and label `<Text>`s.
 */
function StatTile({ label, value, theme, accentValue }: { label: string; value: string; theme: Theme; accentValue?: boolean }) {
    const styles = getStyles(theme);
    return (
        <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
            <Text style={[styles.statValue, { color: accentValue ? theme.accent : theme.text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: theme.subtext }]}>{label}</Text>
        </View>
    );
}

/**
 * SiteAdminSchool
 * ---------------------------------------------------------------------
 * The default-exported "My School" tab screen. No props (Expo Router tab
 * screens receive none). Manages its own loading/refresh state, the list
 * of classes at this admin's school, and which class cards are currently
 * expanded to show student detail.
 *
 * Returns: a loading spinner on first load; otherwise a scrollable page
 * with school-wide stat tiles up top and one collapsible card per class.
 */
export default function SiteAdminSchool() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // `loading` -- true only during the very first fetch (drives the
    // full-screen spinner). `refreshing` -- true only during a
    // pull-to-refresh (drives the ScrollView's small refresh spinner).
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    // Display names for the header text; replaced with real values once
    // the profile query below resolves.
    const [schoolName, setSchoolName] = useState('Your School');
    const [districtName, setDistrictName] = useState('Your District');
    // The loaded, already-grouped-by-class data to render.
    const [classes, setClasses] = useState<SiteAdminClassGroup[]>([]);
    // Tracks which class cards are expanded, as a `Set` of class IDs. Using
    // a Set (rather than e.g. one boolean per class) makes it cheap to
    // toggle membership and to check "is this one expanded?" for any class,
    // without needing a separate state variable per row.
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

    // Data-loading function, memoized with `useCallback` (empty deps) so
    // its identity is stable across renders -- used below as a dependency
    // of the focus-effect callback.
    const loadSchool = useCallback(async () => {
        try {
            // Who is signed in right now?
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Pull this admin's own school + district from their profile
            // row. `.maybeSingle()` tolerates zero matching rows (returns
            // null) instead of throwing, unlike `.single()`.
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('school_name, district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setSchoolName(profile?.school_name || 'Your School');
            setDistrictName(profile?.school_district_name || 'Your District');

            const districtId = profile?.district_id || '';
            const school = profile?.school_name || '';
            if (!districtId || !school) {
                // Profile is missing school/district info -- nothing to
                // report on.
                setClasses([]);
                return;
            }

            // `fetchSiteAdminSchoolReport` (lib/siteAdmin.ts) does the
            // heavy lifting of querying Supabase for every student's stats
            // at this school/district and returns flat rows; `groupByClass`
            // (same file) then buckets those rows by class into the
            // `SiteAdminClassGroup[]` shape this screen renders.
            const rows = await fetchSiteAdminSchoolReport(school, districtId);
            setClasses(groupByClass(rows));
        } catch (err: any) {
            showAlert('Load Error', err.message || 'Could not load your school.');
        } finally {
            // Always clear both spinners, success or failure.
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Re-fetch every time this tab becomes focused, so switching back to
    // "My School" after visiting another tab shows current data.
    useFocusEffect(
        useCallback(() => {
            void loadSchool();
        }, [loadSchool])
    );

    // Pull-to-refresh handler: show the refresh spinner, then reload.
    const onRefresh = () => {
        setRefreshing(true);
        void loadSchool();
    };

    // Event handler for tapping a class header row. Flips that class's
    // membership in the `expandedClasses` Set: if it's already expanded,
    // collapse it (delete from the set); otherwise expand it (add to the
    // set). Uses the functional form of `setExpandedClasses` (a callback
    // receiving the previous value) because the new state depends on the
    // previous state -- the safe way to update state based on itself.
    // A brand-new Set is created each time (`new Set(prev)`) instead of
    // mutating `prev` directly, since React expects state updates to
    // produce a new reference so it can detect the change.
    function toggleClass(classId: string) {
        setExpandedClasses((prev) => {
            const next = new Set(prev);
            if (next.has(classId)) next.delete(classId);
            else next.add(classId);
            return next;
        });
    }

    // Derived (computed-on-every-render) school-wide totals, built by
    // summing across all loaded classes with `Array.reduce`. These aren't
    // stored in state because they're cheap to recompute and always kept
    // in sync with `classes` automatically -- no risk of stale totals.
    const totalStudents = classes.reduce((sum, c) => sum + c.memberCount, 0);
    const totalMiles = classes.reduce((sum, c) => sum + c.totalMiles, 0);
    const totalFitnessEntries = classes.reduce((sum, c) => sum + c.fitnessEntries, 0);
    const totalFitnessTargetsMet = classes.reduce((sum, c) => sum + c.fitnessTargetsMet, 0);

    // Conditional render #1: full-screen spinner during the first load.
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
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>MY SCHOOL</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{schoolName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    {districtName} · Tap a class to see each student’s miles walked and Presidential Fitness Test targets met.
                </Text>

                {classes.length === 0 ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.emptyTitle, { color: theme.text }]}>No participating classes yet</Text>
                        <Text style={[styles.emptyBody, { color: theme.subtext }]}>
                            Once teachers at {schoolName} create classes and students join, your school’s totals will appear here automatically.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.statGrid}>
                            <StatTile label="Classes" value={String(classes.length)} theme={theme} />
                            <StatTile label="Students" value={String(totalStudents)} theme={theme} />
                            <StatTile label="Total Miles Walked" value={formatMiles(totalMiles)} theme={theme} accentValue />
                            <StatTile label="Fitness Targets Met" value={pct(totalFitnessTargetsMet, totalFitnessEntries)} theme={theme} accentValue />
                        </View>

                        <Text style={[styles.sectionHeading, { color: theme.subtext }]} accessibilityRole="header">CLASSES</Text>

                        {classes.map((cls, classIndex) => {
                            const isExpanded = expandedClasses.has(cls.classId);
                            const headerRow = (
                                <Pressable
                                    style={styles.classHeaderRow}
                                    onPress={() => toggleClass(cls.classId)}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: isExpanded }}
                                    aria-expanded={isExpanded}
                                >
                                    <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.subtext} />
                                    <View style={{ flex: 1, paddingHorizontal: 10 }}>
                                        <Text style={[styles.className, { color: theme.text }]}>{cls.className}</Text>
                                        <Text style={[styles.classMeta, { color: theme.subtext }]}>
                                            Taught by {cls.teacherName} · {cls.memberCount} student{cls.memberCount === 1 ? '' : 's'} · {pct(cls.fitnessTargetsMet, cls.fitnessEntries)} fitness targets met
                                        </Text>
                                    </View>
                                    <Text style={[styles.classMiles, { color: theme.accent }]}>{formatMiles(cls.totalMiles)} mi</Text>
                                </Pressable>
                            );
                            return (
                                <View key={cls.classId} style={[styles.classCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                                    {classIndex === 0 ? <TourTarget id="site_admin.classRow">{headerRow}</TourTarget> : headerRow}

                                    {isExpanded && (
                                        <View style={[styles.studentList, { borderTopColor: theme.border }]}>
                                            {cls.students
                                                .slice()
                                                .sort((a, b) => a.studentName.localeCompare(b.studentName))
                                                .map((student) => (
                                                    <View key={student.studentId} style={[styles.studentRow, { borderBottomColor: theme.border }]}>
                                                        <Text style={[styles.studentName, { color: theme.text }]}>{student.studentName}</Text>
                                                        <View style={styles.studentStats}>
                                                            <Text style={[styles.studentStat, { color: theme.text }]}>{formatMiles(student.totalMiles)} mi</Text>
                                                            <Text style={[styles.studentStat, { color: theme.subtext }]}>
                                                                {student.fitnessTargetsMet}/{student.fitnessEntries} fitness targets met
                                                            </Text>
                                                        </View>
                                                    </View>
                                                ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    statTile: { flexGrow: 1, minWidth: '30%', borderWidth: 1, borderRadius: 16, padding: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
    statValue: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '800' },
    statLabel: { fontSize: 11, fontWeight: '600', marginTop: 4, lineHeight: 14 },
    sectionHeading: { fontSize: 11, letterSpacing: 1, fontWeight: '800', marginBottom: 12, textTransform: 'uppercase' },
    classCard: {
        borderWidth: 1,
        borderRadius: 16,
        marginBottom: 10,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    classHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    className: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    classMeta: { fontSize: 12, marginTop: 2 },
    classMiles: { fontSize: 15, fontWeight: '800', fontFamily: 'Georgia' },
    studentList: { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 6 },
    studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
    studentName: { fontSize: 13.5, fontWeight: '600', flex: 1, paddingRight: 8 },
    studentStats: { alignItems: 'flex-end' },
    studentStat: { fontSize: 12, fontWeight: '600' },
    emptyCard: { borderWidth: 1, borderRadius: 16, padding: 20 },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6, fontFamily: 'Georgia' },
    emptyBody: { fontSize: 13, lineHeight: 19 },
});
