// app/(admin-tabs)/schools.tsx
//
// ============================================================================
// FILE-LEVEL OVERVIEW (read this first if you're new to the codebase)
// ============================================================================
// WHAT IS A "ROUTE GROUP" / WHAT DOES `_layout.tsx` DO?
//   This file lives inside `app/(admin-tabs)/` -- a folder name wrapped in
//   parentheses. In Expo Router (the file-based navigation system this
//   whole `app/` directory uses), that parenthesized folder is a "route
//   group": it groups files together on disk without the folder name
//   becoming part of the actual URL, so this screen is reachable at
//   `/schools`, not `/(admin-tabs)/schools`. The sibling file
//   `app/(admin-tabs)/_layout.tsx` is a special file Expo Router renders as
//   a shared wrapper around every screen in this folder -- it draws the
//   bottom tab bar and registers this file as the "Schools" tab. See that
//   file for the fuller explanation of both concepts.
//
// WHAT SCREEN IS THIS?
//   District Admin drill-down: every school in the district (including ones
//   with zero participants yet, pulled from schools_registry — same
//   "recruit" signal as the teacher Reports screen's District Map tab), each
//   expandable to its own classes. Class is the finest granularity shown —
//   no student names, ids, or per-student rows anywhere on this screen.
// ============================================================================

// `useFocusEffect` (expo-router, re-exported from React Navigation) re-runs
// its callback every time this tab becomes the active/focused screen, not
// just once on first mount -- so switching back to this tab always shows
// fresh data.
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    // RefreshControl wires up the classic native "pull down to refresh"
    // gesture on a ScrollView.
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native';
import { colors, Theme } from '../../commonStyles';
import TourTarget from '../../components/tour/TourTarget';
import { fetchDistrictAdminClassReport, groupBySchool, type SchoolReportGroup } from '../../lib/districtAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// Small formatting helper: turns a numerator/denominator pair into a rounded
// whole-number percentage string (e.g. pct(3, 4) => "75%"), returning "0%"
// instead of dividing by zero when there's no denominator yet (e.g. a school
// with no students).
function pct(numerator: number, denominator: number): string {
    if (denominator <= 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

// The "Schools" tab's screen component for District Admins: lists every
// school in this admin's district (real ones with active classes, plus
// "invitation" placeholders for schools in the district registry that have
// no app usage yet), each expandable to show its individual classes. Takes
// no props (rendered directly by the tab navigator); renders a loading
// spinner, then the expandable school list.
export default function AdminSchools() {
    // `useColorScheme()` reads the OS's light/dark preference (can briefly
    // be `null` before the OS reports one, hence `?? 'light'`). `theme` is
    // the resulting color palette, baked into `styles` below.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // `loading`: true until the very first fetch finishes -- blocks the
    // whole screen behind a spinner.
    const [loading, setLoading] = useState(true);
    // `refreshing`: true only while a pull-to-refresh is in progress --
    // drives the native RefreshControl spinner without hiding the already-
    // loaded list the way `loading` does.
    const [refreshing, setRefreshing] = useState(false);
    const [districtName, setDistrictName] = useState('Your District');
    // `schoolGroups`: the merged list of every school in the district (see
    // loadSchools below for how "real" schools with class data and "empty
    // invitation" registry-only schools get combined into one list).
    const [schoolGroups, setSchoolGroups] = useState<SchoolReportGroup[]>([]);
    // `expandedSchools`: a Set of school names whose class list is currently
    // expanded/visible. A `Set` (rather than an array) makes "is this school
    // expanded?" and "toggle this school" cheap membership checks/updates,
    // and naturally prevents the same name from being stored twice.
    const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Loads this admin's district id, then fetches BOTH the real class-
    // report data and the full registry of known schools for that district,
    // merging the two into one combined list. Wrapped in `useCallback` with
    // an empty dependency array so its identity never changes -- required
    // so `useFocusEffect` below doesn't re-run this on every render.
    const loadSchools = useCallback(async () => {
        try {
            setErrorMessage(null);
            // Ask Supabase Auth who is currently signed in.
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Look up this admin's district id + human-readable district
            // name from their own `profiles` row. `.maybeSingle()` returns
            // `null` (rather than throwing) if no row is found.
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setDistrictName(profile?.school_district_name || 'Your District');
            const districtId = profile?.district_id || '';
            if (!districtId) {
                // No district on file -- nothing to show, so clear the list
                // rather than fetching with an empty district id.
                setSchoolGroups([]);
                return;
            }

            // Fetch two independent things AT THE SAME TIME with
            // Promise.all (rather than one `await` after another): (1) the
            // pre-aggregated class report for this district (one row per
            // class, containing only class-level totals -- never a student
            // row), and (2) every school NAME registered in this district's
            // `schools_registry` table, sorted alphabetically. These two
            // requests don't depend on each other, so running them
            // concurrently is faster than awaiting them sequentially.
            const [rows, registryResult] = await Promise.all([
                fetchDistrictAdminClassReport(districtId),
                supabase
                    .from('schools_registry')
                    .select('school_name')
                    .eq('district_id', districtId)
                    .order('school_name', { ascending: true }),
            ]);

            if (registryResult.error) throw registryResult.error;

            // Bucket the raw class rows by school (one SchoolReportGroup per
            // school that actually has class data), then build a lookup Map
            // keyed by a NORMALIZED school name (trimmed + lowercased) so
            // matching against the registry below isn't thrown off by
            // capitalization or stray whitespace differences between how a
            // teacher typed a school name and how it's spelled in the
            // registry.
            const activeGroups = groupBySchool(rows);
            const groupsByNormalizedName = new Map(activeGroups.map((g) => [g.schoolName.trim().toLowerCase(), g]));

            // Same merge pattern as reports.tsx's District Map tab: start
            // from the FULL registry of known schools (so a school with
            // zero app usage still shows up, as an invitation to recruit
            // it), then attach whatever real class/fitness data matched.
            const registryRows = registryResult.data || [];
            const merged: SchoolReportGroup[] = registryRows.map((r) => {
                const match = groupsByNormalizedName.get((r.school_name || '').trim().toLowerCase());
                if (match) {
                    // Found real class data for this registry school --
                    // remove it from the lookup Map (so the leftover-values
                    // step below doesn't add it a second time) and use the
                    // real data instead of a placeholder.
                    groupsByNormalizedName.delete((r.school_name || '').trim().toLowerCase());
                    return match;
                }
                // No matching class data -- this school is registered but
                // has zero students/classes using the app yet. Build a
                // zeroed-out placeholder row flagged with
                // `isEmptyInvitation: true`, which the render below uses to
                // show a distinct "recruit this school" message instead of
                // normal stats.
                return {
                    schoolName: r.school_name,
                    classes: [],
                    memberCount: 0,
                    totalMiles: 0,
                    fitnessEntries: 0,
                    fitnessTargetsMet: 0,
                    fitnessParticipants: 0,
                    walkLogEntries: 0,
                    isEmptyInvitation: true,
                };
            });
            // Any school with real class data that never matched a
            // registry entry (a school_name typed on a class that doesn't
            // exactly match the registry) still needs to show up.
            merged.push(...groupsByNormalizedName.values());

            // Sort the combined list: schools with the most students first;
            // for a tie (most commonly two zero-student "invitation"
            // schools), fall back to alphabetical order by school name so
            // the list has a stable, predictable ordering.
            merged.sort((a, b) => b.memberCount - a.memberCount || a.schoolName.localeCompare(b.schoolName));
            setSchoolGroups(merged);
        } catch (err: any) {
            setErrorMessage(err?.message || 'Could not load school data.');
        } finally {
            // Clear both loading flags regardless of outcome, so neither
            // the first-load spinner nor a pull-to-refresh spinner gets
            // stuck showing.
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Re-fetch every time this tab gains focus (e.g. switching back from
    // another tab), so the school list stays current.
    useFocusEffect(
        useCallback(() => {
            void loadSchools();
        }, [loadSchools])
    );

    // Event handler wired to the ScrollView's RefreshControl below: fired
    // when the user pulls down on the list. Shows the refresh spinner, then
    // re-runs the same load function used on focus.
    const onRefresh = () => {
        setRefreshing(true);
        void loadSchools();
    };

    // Event handler for tapping a school row: expands or collapses that
    // school's class list. Uses the "copy the Set, mutate the copy, return
    // the copy" pattern -- React state should never be mutated directly, so
    // a new `Set` is created each time (`new Set(prev)`) even though `Set`
    // itself has in-place `add`/`delete` methods.
    const toggleSchool = (schoolName: string) => {
        setExpandedSchools((prev) => {
            const next = new Set(prev);
            if (next.has(schoolName)) next.delete(schoolName);
            else next.add(schoolName);
            return next;
        });
    };

    // Conditional render: block the whole screen behind a spinner until the
    // very first fetch (via loadSchools/useFocusEffect above) completes.
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
                // Wiring up RefreshControl on the ScrollView adds the native
                // "pull down to refresh" gesture. `refreshing` controls
                // whether its spinner is currently showing; `onRefresh` is
                // called when the user performs the pull gesture.
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>SCHOOLS &amp; CLASSES</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    Tap a school to see its classes. Every total here is a class or school aggregate — never an individual student.
                </Text>

                {/* Conditional render: only shown if a fetch failed and set
                    an error message. */}
                {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                {/* Conditional render: an empty-state message when the
                    district genuinely has zero schools registered, vs. the
                    normal case of mapping over `schoolGroups` below. */}
                {schoolGroups.length === 0 ? (
                    <Text style={styles.emptyText}>No schools found for your district yet.</Text>
                ) : (
                    schoolGroups.map((school, schoolIndex) => {
                        // Whether THIS specific school's row is currently
                        // expanded to show its classes -- looked up fresh on
                        // every render from the `expandedSchools` Set.
                        const isExpanded = expandedSchools.has(school.schoolName);
                        // The tappable header row for one school: name (with
                        // a expand/collapse triangle prefix), a meta line
                        // (or a special "recruit" message for schools with
                        // no data yet), and the total miles walked. Built as
                        // a local variable (rather than inline JSX) so it
                        // can be conditionally wrapped in a TourTarget below
                        // without duplicating this whole block.
                        const headerRow = (
                            <Pressable
                                style={[styles.schoolRow, { borderBottomColor: theme.border }]}
                                onPress={() => toggleSchool(school.schoolName)}
                                accessibilityRole="button"
                                // `accessibilityState`/`aria-expanded` tell
                                // screen readers whether this expandable row
                                // is currently open or closed -- important
                                // for accessibility since the only other
                                // signal is the small ▾/▸ glyph.
                                accessibilityState={{ expanded: isExpanded }}
                                aria-expanded={isExpanded}
                            >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                    {/* The ▾ (expanded) / ▸ (collapsed)
                                        triangle glyph gives a quick visual
                                        cue about this row's current state,
                                        in addition to the accessibility
                                        state set above. */}
                                    <Text style={[styles.schoolName, { color: theme.text }]}>
                                        {isExpanded ? '▾' : '▸'} {school.schoolName}
                                    </Text>
                                    {/* Conditional render: a school that
                                        matched nothing in the real class
                                        report (isEmptyInvitation, set in
                                        loadSchools above) shows a distinct
                                        "recruit this school" message instead
                                        of the normal student/class/fitness
                                        summary line. */}
                                    {school.isEmptyInvitation ? (
                                        <Text style={styles.invitationText}>No active classes yet 🚀 A great candidate for outreach</Text>
                                    ) : (
                                        <Text style={[styles.schoolMeta, { color: theme.subtext }]}>
                                            {school.memberCount} student{school.memberCount === 1 ? '' : 's'} · {school.classes.length} class{school.classes.length === 1 ? '' : 'es'} · {pct(school.fitnessParticipants, school.memberCount)} fitness participation
                                        </Text>
                                    )}
                                </View>
                                {/* Empty-invitation schools show their (zero)
                                    mileage in a muted border color instead of
                                    the accent color, so the number doesn't
                                    look like a meaningful, worth-celebrating
                                    stat for a school with no real data. */}
                                <Text style={[styles.schoolMiles, { color: school.isEmptyInvitation ? theme.border : theme.accent }]}>
                                    {formatMiles(school.totalMiles)} mi
                                </Text>
                            </Pressable>
                        );
                        return (
                            <View key={school.schoolName} style={{ marginBottom: 4 }}>
                                {/* Only the very FIRST school row in the
                                    list is wrapped in a TourTarget, so the
                                    onboarding tour has exactly one row to
                                    point at (highlighting every row would be
                                    both meaningless and visually broken). */}
                                {schoolIndex === 0 ? <TourTarget id="admin.schoolRow">{headerRow}</TourTarget> : headerRow}

                                {/* Conditional render: the class list for
                                    this school only renders at all while
                                    `isExpanded` is true -- collapsed schools
                                    render nothing below their header row. */}
                                {isExpanded && (
                                    <View style={{ paddingLeft: 12, paddingBottom: 12 }}>
                                        {school.classes.length === 0 ? (
                                            <Text style={styles.emptyText}>No classes reporting at this school yet.</Text>
                                        ) : (
                                            school.classes
                                                // `.slice()` copies the array
                                                // before `.sort()` mutates
                                                // it, so the original
                                                // `school.classes` array
                                                // (part of React state)
                                                // isn't reordered in place.
                                                .slice()
                                                .sort((a, b) => b.memberCount - a.memberCount)
                                                .map((c) => (
                                                    <View key={c.classId} style={[styles.classCard, { borderColor: theme.border, backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
                                                        <View style={styles.classHeader}>
                                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                                <Text style={[styles.className, { color: theme.text }]}>{c.className}</Text>
                                                                <Text style={[styles.classMeta, { color: theme.subtext }]}>Taught by {c.teacherName}</Text>
                                                            </View>
                                                            <Text style={[styles.classMiles, { color: theme.accent }]}>{formatMiles(c.totalMiles)} mi</Text>
                                                        </View>
                                                        <View style={[styles.classStatsRow, { borderTopColor: theme.border }]}>
                                                            <Text style={[styles.classStat, { color: theme.subtext }]}>{c.memberCount} student{c.memberCount === 1 ? '' : 's'}</Text>
                                                            {/* Ternary: a class with zero recorded fitness
                                                                entries shows a plain "No fitness results yet"
                                                                message instead of a "0/0 targets met" fraction,
                                                                which would read as confusing/alarming rather
                                                                than simply "not started". */}
                                                            <Text style={[styles.classStat, { color: theme.subtext }]}>
                                                                {c.fitnessEntries > 0 ? `${c.fitnessTargetsMet}/${c.fitnessEntries} fitness targets met` : 'No fitness results yet'}
                                                            </Text>
                                                            <Text style={[styles.classStat, { color: theme.subtext }]}>{pct(c.fitnessParticipants, c.memberCount)} fitness participation</Text>
                                                        </View>
                                                    </View>
                                                ))
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

// `getStyles` bakes the current theme's colors into the returned
// StyleSheet -- called once per render near the top of the component.
// -- layout style: centers the loading spinner --
// -- header text styles: accent "kicker" label, big district title, subtitle --
const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
    errorText: { color: theme.error, fontSize: 13, marginBottom: 16 },
    emptyText: { color: theme.subtext, fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    // -- school row styles (the tappable header showing each school's name/summary/miles) --
    schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    schoolName: { fontSize: 15, fontWeight: '700' },
    schoolMeta: { fontSize: 12, marginTop: 2 },
    // Same shared "recruit" color as (teacher-tabs)/reports.tsx and
    // (site-admin-tabs)/district.tsx -- see that file for the contrast fix
    // rationale (#E07A5F darkened to #A34E36).
    invitationText: { fontSize: 12, color: '#A34E36', fontWeight: '600', marginTop: 2 },
    schoolMiles: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia' },
    // -- expanded class-card styles (shown per class when a school is expanded) --
    classCard: {
        padding: 14,
        borderWidth: 1,
        borderRadius: 14,
        marginBottom: 10,
        // Matches the ambient shadow already used on this shell's other
        // cards (overview.tsx's statTile/card, this screen's own PDF
        // preview card) -- this one was the odd one out with none at all.
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    classHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    className: { fontSize: 14, fontWeight: '700' },
    classMeta: { fontSize: 12, marginTop: 2 },
    classMiles: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    classStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
    classStat: { fontSize: 11, fontWeight: '600' },
});
