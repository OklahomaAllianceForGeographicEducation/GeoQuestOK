// app/(site-admin-tabs)/district.tsx
//
// FILE-LEVEL OVERVIEW:
// -------------------------------------------------------------------------
// This is the "District" tab screen inside the `(site-admin-tabs)` route
// group (an Expo Router route group -- see _layout.tsx in this same folder
// for what that means and how `_layout.tsx` wires this file in as one tab).
// Screen/role: Site Administrator (building-level principal). Purpose:
// show every OTHER school in this admin's district as a one-line summary
// (student count + total miles), so the admin can compare their own school
// against the rest of the district at a glance.
//
// Every OTHER school in the Site Administrator's district, one aggregate
// summary row each -- the exact same one-line total a teacher already sees
// for schools that aren't their own (app/(teacher-tabs)/reports.tsx's
// District Map tab). Never a class or student breakdown here -- that level
// of detail is reserved for the admin's own school (the My School tab).

// `useFocusEffect` is an Expo Router / React Navigation hook that runs a
// callback every time this screen becomes focused (visible), not just on
// first mount -- important for a tab screen, since switching tabs doesn't
// unmount/remount them by default, but you still want fresh data each time
// the user comes back to this tab.
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, type Theme } from '../../commonStyles';
import { fetchDistrictSchoolTotals, type DistrictSchoolTotal } from '../../lib/siteAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// Small cross-platform alert helper. React Native's `Alert.alert` pops a
// native dialog on iOS/Android, but on web (react-native-web) it's a
// no-op, so this falls back to the browser's built-in `alert()` there. It
// also always logs a warning so failures are visible in dev tools/console
// even when a dialog does show.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

// One row in the rendered list: either a real DistrictSchoolTotal, or a
// zero-participation invitation pulled from schools_registry when nothing
// in the district totals matched that school's name yet.
type DistrictRow = DistrictSchoolTotal & { isEmptyInvitation?: boolean };

/**
 * SiteAdminDistrict
 * ---------------------------------------------------------------------
 * The default-exported screen component for the "District" tab. No props
 * (Expo Router renders tab screens with no props). Internally manages its
 * own loading/refresh/data state and fetches from Supabase whenever the
 * screen gains focus.
 *
 * Returns: a loading spinner while data is first loading, otherwise a
 * scrollable list of every other school in the district with its student
 * count and total miles walked.
 */
export default function SiteAdminDistrict() {
    // Theme setup: read the OS-level color scheme (light/dark), fall back
    // to 'light', then look up the matching color palette and build a
    // `styles` object from it (see getStyles below -- it's a function
    // instead of a plain StyleSheet.create result because it needs to bake
    // in theme colors that change at runtime).
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // `loading` -- true only for the very first load, so we can show a
    // full-screen spinner before there's anything to render at all.
    const [loading, setLoading] = useState(true);
    // `refreshing` -- true only while a pull-to-refresh is in progress, so
    // the ScrollView's built-in refresh spinner can be shown independent of
    // the full-screen `loading` spinner.
    const [refreshing, setRefreshing] = useState(false);
    // `districtName` -- display label for the district, defaults to a
    // generic placeholder until the profile query below fills in the real
    // name.
    const [districtName, setDistrictName] = useState('Your District');
    // `rows` -- the actual list of schools (and their totals) to render.
    const [rows, setRows] = useState<DistrictRow[]>([]);

    // `loadDistrict` is wrapped in `useCallback` with an empty dependency
    // array, meaning the function itself is created once and its identity
    // never changes across re-renders. That matters because it's used as a
    // dependency of the `useFocusEffect` callback below -- a stable
    // reference avoids re-running the effect on every render for no reason.
    const loadDistrict = useCallback(async () => {
        try {
            // Step 1: find out who's logged in. `supabase.auth.getUser()`
            // reads the current session (no network round trip needed in
            // the common case) and returns the Supabase Auth user object.
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Step 2: read this user's row from the `profiles` table to get
            // their school and district. `.maybeSingle()` is like
            // `.single()` but returns `null` instead of throwing when no
            // row matches, which is useful here since we handle a missing
            // profile gracefully below rather than crashing.
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('school_name, district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setDistrictName(profile?.school_district_name || 'Your District');
            const districtId = profile?.district_id || '';
            const mySchool = (profile?.school_name || '').trim().toLowerCase();
            if (!districtId) {
                // No district on file for this profile -- nothing to show.
                setRows([]);
                return;
            }

            // Step 3: fetch two things in parallel with Promise.all (faster
            // than awaiting them one after another since neither depends on
            // the other):
            //   - `fetchDistrictSchoolTotals`: a helper (lib/siteAdmin.ts)
            //     that aggregates real usage data (miles, member counts)
            //     per school in this district.
            //   - a direct query against `schools_registry`: the full list
            //     of known school names in the district, regardless of
            //     whether they have any app usage yet.
            const [totals, registryResult] = await Promise.all([
                fetchDistrictSchoolTotals(districtId),
                supabase
                    .from('schools_registry')
                    .select('school_name')
                    .eq('district_id', districtId)
                    .order('school_name', { ascending: true }),
            ]);

            if (registryResult.error) throw registryResult.error;

            // Build a lookup Map keyed by normalized (trimmed, lowercased)
            // school name -> its real totals, so we can efficiently match
            // registry entries to totals regardless of casing/whitespace
            // differences in how the name was typed in different places.
            const totalsByName = new Map(totals.map((t) => [t.schoolName.trim().toLowerCase(), t]));

            // Same merge pattern as (teacher-tabs)/reports.tsx's District
            // Map and (admin-tabs)/schools.tsx: start from the FULL
            // registry of known schools (so a school with zero app usage
            // still shows up, as an invitation to recruit it), then attach
            // whatever real totals matched -- excluding this admin's own
            // school, which lives on the My School tab instead.
            const registryRows = registryResult.data || [];
            const merged: DistrictRow[] = registryRows
                .filter((r) => (r.school_name || '').trim().toLowerCase() !== mySchool)
                .map((r) => {
                    const key = (r.school_name || '').trim().toLowerCase();
                    const match = totalsByName.get(key);
                    if (match) {
                        totalsByName.delete(key);
                        return match;
                    }
                    return { schoolName: r.school_name, totalMiles: 0, memberCount: 0, isEmptyInvitation: true };
                });

            // Any school with real totals that never matched a registry
            // entry (a school_name typed on a class that doesn't exactly
            // match the registry) still needs to show up, unless it's this
            // admin's own school.
            for (const [key, total] of totalsByName) {
                if (key !== mySchool) merged.push(total);
            }

            // Sort: most participating schools first (by student count),
            // ties broken alphabetically by school name.
            merged.sort((a, b) => b.memberCount - a.memberCount || a.schoolName.localeCompare(b.schoolName));
            setRows(merged);
        } catch (err: any) {
            // Any failure anywhere above (auth, profile query, the two
            // parallel queries) lands here and surfaces a user-visible
            // alert instead of a silent blank screen.
            showAlert('Load Error', err.message || 'Could not load district data.');
        } finally {
            // Runs whether the try succeeded or failed -- always clear both
            // loading indicators so the UI doesn't get stuck spinning.
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // `useFocusEffect` (wrapping a `useCallback`'d function) re-runs
    // `loadDistrict()` every time this tab screen becomes focused -- e.g.
    // the first time the user opens it, and again every time they switch
    // back to it from another tab. This keeps the district totals fresh
    // without needing a manual refresh, since tab screens normally stay
    // mounted in the background rather than unmounting when you leave them.
    useFocusEffect(
        useCallback(() => {
            // `void` here just tells TypeScript/linters "yes, I'm
            // intentionally not awaiting or otherwise handling this
            // Promise" -- `loadDistrict` manages its own try/catch/finally
            // internally.
            void loadDistrict();
        }, [loadDistrict])
    );

    // Handler for the pull-to-refresh gesture (wired into the
    // `RefreshControl` below). Flips on the `refreshing` spinner, then
    // kicks off the same load function used for the initial fetch.
    const onRefresh = () => {
        setRefreshing(true);
        void loadDistrict();
    };

    // Conditional render #1: while the very first load is in flight, show
    // nothing but a centered spinner -- avoids flashing an empty list.
    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* ScrollView makes the content scrollable if it overflows the
                screen. `refreshControl` wires up the standard "pull down to
                refresh" gesture on iOS/Android (and a spinner on web) --
                dragging down triggers `onRefresh`, and `refreshing` controls
                whether the spinner is currently shown. */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>DISTRICT MAP</Text>
                {/* accessibilityRole="header" tells screen readers this
                    text acts as a heading, improving navigation for
                    assistive technology users. */}
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    Every other school in your district, as an aggregate — the same summary a teacher sees for a school that isn’t their own. Your own school’s detail lives on the My School tab.
                </Text>

                {/* Conditional render #2: if there are no rows to show
                    (e.g. brand new district, or no other schools in the
                    registry), show a friendly empty-state message instead
                    of an empty card. */}
                {rows.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>No other schools found in your district yet.</Text>
                ) : (
                    <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                        {/* .map over the loaded rows renders one row per
                            school. `idx < rows.length - 1` conditionally
                            adds a bottom border to every row except the
                            last one, so the list looks like a divided table
                            without a trailing line under the final row. */}
                        {rows.map((school, idx) => (
                            <View
                                key={school.schoolName}
                                style={[styles.schoolRow, idx < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                            >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                    <Text style={[styles.schoolName, { color: theme.text }]}>{school.schoolName}</Text>
                                    {/* Conditional render #3: an "empty invitation" row (a
                                        registry school with zero matched usage) shows an
                                        outreach-flavored message; a real row shows its
                                        student count, with a singular/plural "student(s)"
                                        tweak based on the count. */}
                                    {school.isEmptyInvitation ? (
                                        <Text style={styles.invitationText}>No active users yet 🚀 A great candidate for outreach</Text>
                                    ) : (
                                        <Text style={[styles.schoolMeta, { color: theme.subtext }]}>
                                            {school.memberCount} student{school.memberCount === 1 ? '' : 's'} participating
                                        </Text>
                                    )}
                                </View>
                                <Text style={[styles.schoolMiles, { color: school.isEmptyInvitation ? theme.border : theme.accent }]}>
                                    {formatMiles(school.totalMiles)} mi
                                </Text>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// `getStyles` is a function (not a plain StyleSheet.create call) because
// several colors depend on the current theme, which can only be known at
// render time -- this pattern recomputes the stylesheet each render with
// the right colors baked in.
// -- layout/container styles --
const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // -- text styles (kicker/title/subtitle/empty state) --
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
    emptyText: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    // -- list card / row styles --
    listCard: {
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 16,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 2,
    },
    schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    schoolName: { fontSize: 15, fontWeight: '700' },
    schoolMeta: { fontSize: 12, marginTop: 2 },
    // Matches the exact "recruit" tone/color already used for this
    // situation in (teacher-tabs)/reports.tsx and (admin-tabs)/schools.tsx.
    invitationText: { fontSize: 12, color: '#A34E36', fontWeight: '600', marginTop: 2 },
    schoolMiles: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia' },
});
