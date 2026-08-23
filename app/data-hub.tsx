// app/data-hub.tsx
// NOTE: The header comment inside this file previously said
// "app/(teacher-tabs)/data-hub.tsx", but the file actually lives directly
// at app/data-hub.tsx (outside any tab group), so its real route is
// "/data-hub", not a tab within (teacher-tabs). Screen for internal staff
// to see raw/aggregated data across every profile in the database.

// React + three hooks:
// - useEffect: run side effects (like fetching data) after render.
// - useMemo: cache ("memoize") a computed value so it's only recalculated
//   when its listed dependencies change, instead of on every render.
// - useState: component-local state.
import React, { useEffect, useMemo, useState } from 'react';

// A grab-bag of React Native UI primitives used on this screen:
// - ActivityIndicator: the spinning "loading..." wheel.
// - Alert: native popup dialogs.
// - Pressable: tappable element.
// - ScrollView: a scrollable container (needed because this screen's
//   content can be taller than the visible screen).
// - StyleSheet: builds style objects.
// - Text / View: text and layout containers.
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

// Shared color palette (light/dark theme colors) defined once for the
// whole app so screens stay visually consistent.
import { useRouter } from 'expo-router';
import { colors } from '../commonStyles';
import WebContainer from '../components/WebContainer';
import { getResolvedRole, resolveAppShellPath } from '../lib/access';

// A helper function that formats a raw mileage number into a nicely
// displayed string (e.g. rounding, adding "mi", etc.) — defined once in
// lib/trails.ts so every screen formats miles the same way.
import { formatMiles } from '../lib/trails';

// Supabase client for querying the database.
import { supabase } from '../utils/supabase';

// TypeScript "type" describing the shape of each row this screen expects
// back from the "profiles" table query below. Declaring this means
// TypeScript will flag it if we try to use a field that doesn't exist, or
// use a field as the wrong type (e.g. treating `id` as a number).
type HubRow = {
    id: string;
    display_name: string;
    username: string;
    // "string | null" means this field might legitimately be missing/empty
    // in the database (a nullable column), so code that reads it must
    // handle the null case.
    app_role: string | null;
    school_district_name: string | null;
    total_miles_walked: number | null;
};

export default function DataHubScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const router = useRouter();

    // Whether we've confirmed this viewer is actually OKAGE staff. Starts
    // false so the real content (a district-wide roster with names and
    // roles) never even flashes on screen before the check resolves.
    const [roleChecked, setRoleChecked] = useState(false);

    // Whether we're still waiting for the initial data fetch to complete.
    // Starts as `true` because we haven't loaded anything yet.
    const [loading, setLoading] = useState(true);

    // The list of profile rows fetched from Supabase. Starts as an empty
    // array. "<HubRow[]>" tells TypeScript this state will always hold an
    // array of HubRow objects.
    const [rows, setRows] = useState<HubRow[]>([]);

    // Access guard, same pattern as app/(okage-tabs)/_layout.tsx's: this
    // screen must never render its real content for anyone who isn't
    // OKAGE staff. Unlike the OKAGE tab group, this route has no shared
    // layout of its own to hold that check -- it sits directly under
    // app/, unwrapped by any group -- so previously it had none at all.
    // The RLS policy backing the query below (profiles_select_same_district
    // in supabase/fix-teacher-profile-read-access.sql) is intentionally
    // broad -- built for the leaderboard feature, it lets ANY authenticated
    // user, including a student, read every profile in their own district.
    // With no route-level check, any signed-in user who found this URL
    // could see a real district-wide roster (names, roles, mileage) meant
    // for internal staff. Confirmed live during an /impeccable audit.
    useEffect(() => {
        let isMounted = true;

        async function checkAccess() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!isMounted) return;
                if (!user) {
                    router.replace('/' as any);
                    return;
                }

                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('role, app_role, active_view')
                    .eq('id', user.id)
                    .single();

                if (!isMounted) return;
                if (error || !profile || getResolvedRole(profile) !== 'okage') {
                    // Not OKAGE staff (or couldn't confirm) -- send them to
                    // whichever shell they actually belong in rather than
                    // rendering this on an unverified guess.
                    router.replace((profile ? resolveAppShellPath(profile) : '/') as any);
                    return;
                }

                setRoleChecked(true);
            } catch (err) {
                console.error('Error verifying data-hub access:', err);
                if (isMounted) router.replace('/' as any);
            }
        }

        checkAccess();

        return () => {
            isMounted = false;
        };
    }, [router]);

    // Runs once access is confirmed to kick off the actual data fetch --
    // gated on roleChecked so the broad query never fires for anyone who
    // isn't verified OKAGE staff, not even for an instant.
    useEffect(() => {
        if (!roleChecked) return;

        // `mounted` is a manual guard flag. If the user navigates away
        // from this screen before the network request finishes, we don't
        // want to call setRows/setLoading on a component that no longer
        // exists (React would warn about "state update on an unmounted
        // component"). We check `mounted` before each state update below.
        let mounted = true;

        async function loadData() {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    // Only fetch the specific columns this screen needs
                    // (more efficient than pulling every column).
                    .select('id, display_name, username, app_role, school_district_name, total_miles_walked')
                    // Sort so the highest-mileage walkers come first.
                    // ascending: false = descending order (biggest first).
                    .order('total_miles_walked', { ascending: false });

                // If Supabase returned an error object, throw it so it's
                // caught by the catch block below instead of silently
                // continuing with bad/missing data.
                if (error) throw error;

                // Only update state if the component is still mounted.
                // `data || []` guards against `data` being null/undefined
                // by falling back to an empty array. `as HubRow[]` tells
                // TypeScript to trust that the returned rows match our
                // HubRow shape (a type assertion, not a runtime check).
                if (mounted) setRows((data || []) as HubRow[]);
            } catch (err: any) {
                // Any failure (network issue, bad query, thrown error
                // above) ends up here. Show the user a native alert with
                // whatever message is available, or a generic fallback.
                Alert.alert('Data Hub Error', err.message || 'Could not load full dataset.');
            } finally {
                // "finally" runs whether the try succeeded or failed —
                // guarantees the loading spinner goes away either way.
                if (mounted) setLoading(false);
            }
        }

        // "void" here just tells TypeScript/linters "yes, I know this
        // returns a Promise and I'm intentionally not awaiting or handling
        // it here" (we can't make the useEffect callback itself async).
        void loadData();

        // Cleanup function: runs when the screen unmounts, flips the guard
        // flag off so any in-flight request's callbacks become no-ops.
        return () => {
            mounted = false;
        };
    }, [roleChecked]);

    // useMemo recomputes this `summary` object only when `rows` changes
    // (not on every single re-render), which is a small performance
    // optimization since these are simple aggregate calculations over the
    // full row list.
    const summary = useMemo(() => {
        return {
            // Total number of profiles loaded.
            profiles: rows.length,
            // Count how many rows have app_role exactly equal to 'teacher'.
            teachers: rows.filter((row) => row.app_role === 'teacher').length,
            admins: rows.filter((row) => row.app_role === 'admin').length,
            professors: rows.filter((row) => row.app_role === 'professor').length,
            // .reduce() walks the array accumulating a running total.
            // `sum` starts at 0 (the second argument to reduce), and for
            // each row we add its miles walked, treating null/undefined as
            // 0 via `|| 0`, and running it through Number() in case the
            // database ever returns it as a string.
            totalMiles: rows.reduce((sum, row) => sum + Number(row.total_miles_walked || 0), 0),
        };
    }, [rows]);

    // While the access check or the initial fetch is still running, show a
    // full-screen loading spinner instead of the (currently empty) data.
    if (!roleChecked || loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                {/* size="large" makes a bigger spinner than the default
                    "small". color ties it to the current theme's accent
                    color so it matches the rest of the UI. */}
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        // ScrollView instead of View because the list of profile summary
        // cards + up to 12 individual rows can be taller than the screen.
        // contentContainerStyle (as opposed to `style`) applies padding to
        // the *scrollable content* rather than the outer scroll frame.
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={{ padding: 20 }}>
          <WebContainer maxWidth={720} style={{ width: '100%' }}>
            {/* Small all-caps label above the title, styled with the
                theme's accent color to make it pop. */}
            <Text style={[styles.kicker, { color: theme.accent }]}>SECRET DATA HUB</Text>
            <Text style={[styles.title, { color: theme.text }]}>Full system access</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>
                This view is reserved for internal staff and pulls every profile in the database.
            </Text>

            {/* Five near-identical summary "cards", each showing one
                aggregate stat from `summary` above. Every card reuses the
                same styles.card / styles.label / styles.value styles, just
                with different label text and value. */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.label, { color: theme.subtext }]}>Total Profiles</Text>
                <Text style={[styles.value, { color: theme.text }]}>{summary.profiles}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.label, { color: theme.subtext }]}>Teachers</Text>
                <Text style={[styles.value, { color: theme.text }]}>{summary.teachers}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.label, { color: theme.subtext }]}>Admins</Text>
                <Text style={[styles.value, { color: theme.text }]}>{summary.admins}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.label, { color: theme.subtext }]}>Professors</Text>
                <Text style={[styles.value, { color: theme.text }]}>{summary.professors}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.label, { color: theme.subtext }]}>Total Miles</Text>
                {/* formatMiles() turns the raw number into a display-ready
                    string (e.g. "1,234.5 mi" style formatting lives in
                    lib/trails.ts). */}
                <Text style={[styles.value, { color: theme.text }]}>{formatMiles(summary.totalMiles)}</Text>
            </View>

            {/* A button that, for now, just shows a placeholder alert
                explaining that a real CSV/PDF export isn't wired up yet.
                This is a TODO/stub, not a finished feature. */}
            <Pressable style={[styles.button, { backgroundColor: theme.accent }]} onPress={() => Alert.alert('Export', 'This is where a private CSV/PDF export can be wired to Supabase or server-side reporting.')}>
                <Text style={styles.buttonText}>Export Internal Report</Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { color: theme.text }]}>All profiles</Text>
            {/* .slice(0, 12) takes only the first 12 rows (already sorted
                by miles walked, descending) so this screen doesn't try to
                render a potentially huge list all at once — a simple form
                of pagination/truncation.
                .map() transforms each row object into a <View> element.
                `key={row.id}` is required by React whenever you render a
                list — it lets React efficiently track which item is which
                across re-renders instead of re-rendering the whole list
                from scratch. */}
            {rows.slice(0, 12).map((row) => (
                <View key={row.id} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {/* Prefer display_name; if it's empty/falsy, fall back
                        to username via the `||` operator. */}
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{row.display_name || row.username}</Text>
                    {/* Builds a single "meta" line combining role, district,
                        and miles, separated by " · " (a middle-dot
                        character used as a visual separator). Falls back to
                        'student' / 'No district' when those fields are
                        empty. */}
                    <Text style={[styles.rowMeta, { color: theme.subtext }]}>{row.app_role || 'student'} · {row.school_district_name || 'No district'} · {formatMiles(Number(row.total_miles_walked || 0))} mi</Text>
                </View>
            ))}
          </WebContainer>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    // Used for the full-screen loading state: fills the screen and centers
    // its single child (the spinner) both horizontally and vertically.
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // The ScrollView's outer style — just needs to fill available space.
    container: { flex: 1 },
    // "SECRET DATA HUB" label styling.
    kicker: {
        fontSize: 11,        // small text
        fontWeight: '800',   // extra bold
        letterSpacing: 1.2,  // extra horizontal spacing between letters,
                              // 1.2px — gives all-caps text a more
                              // "designed" spaced-out look
        marginBottom: 6
    },
    title: {
        fontSize: 28,             // large heading
        fontWeight: '800',        // extra bold
        fontFamily: 'Georgia',    // a serif font, for a more "editorial"
                                    // look than the default system sans-serif
        marginBottom: 6
    },
    subtitle: {
        fontSize: 14,
        lineHeight: 20, // vertical space each line of text occupies —
                         // larger than fontSize so multi-line text isn't
                         // cramped together
        marginBottom: 18
    },
    card: {
        borderWidth: 1,
        borderRadius: 18, // fairly rounded corners for a soft "card" look
        padding: 18,
        marginBottom: 12  // gap between stacked cards
    },
    label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    value: { fontSize: 28, fontWeight: '800', fontFamily: 'Georgia' },
    button: {
        marginTop: 10,
        borderRadius: 14,
        alignItems: 'center',   // center the button's text horizontally
        paddingVertical: 14,    // 14px of padding on just the top & bottom
                                  // (as opposed to `padding`, which would
                                  // also add horizontal padding)
        marginBottom: 24
    },
    buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    sectionTitle: { fontSize: 18, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 12 },
    row: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
    rowTitle: { fontSize: 15, fontWeight: '700' },
    rowMeta: { fontSize: 12, marginTop: 4, lineHeight: 18 },
});
