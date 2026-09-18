// app/(admin-tabs)/overview.tsx
//
// FILE-LEVEL OVERVIEW:
// Lives inside the `(admin-tabs)` route group -- a parenthesized folder
// name that Expo Router excludes from the actual URL, letting every screen
// a District Admin can see live together while still resolving to clean
// paths like `/overview`. That folder's `_layout.tsx` renders the bottom
// tab bar and registers this file as the "Overview" tab (see
// app/(admin-tabs)/_layout.tsx for the fuller explanation of route groups
// and what a `_layout.tsx` file is).
//
// District Admin landing screen: district-wide KPI cards (schools, classes,
// students, miles walked, Presidential Fitness Test participation/pass
// rate) plus a "Top Schools" leaderboard, all aggregated server-side by
// get_district_admin_class_report (lib/districtAdmin.ts) — never a single
// student name or row. Same aggregate-only contract as the teacher Reports
// screen's "District Map" tab, one level up: a district admin sees every
// school in their own district, a teacher only ever sees their own.

// `useFocusEffect`: re-runs its callback every time this tab regains focus
// (not just on first mount), so KPI numbers refresh whenever the admin
// switches back to this tab.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native';
import { colors, type Theme } from '../../commonStyles';
import {
    computeDistrictTotals,
    fetchDistrictAdminClassReport,
    fetchDistrictAdminSchoolTotals,
    fetchDistrictAdminTotals,
    groupBySchool,
    type SchoolReportGroup
} from '../../lib/districtAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// Small formatting helper: turns a 0-1 fraction (e.g. 0.734) into a rounded
// whole-number percentage string (e.g. "73%") for display.
function pct(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
}

// A single KPI tile — the district-level equivalent of a stat card. Reused
// 6 times below, so its own small component rather than repeated JSX.
// Props: `label` (caption under the number), `value` (the already-
// formatted display string, e.g. "42%" or "1,203"), `theme` (current color
// palette, since this isn't rendered inside AdminOverview so it can't just
// close over that component's `theme`), and optional `emphasis`.
//
// `emphasis: 'trail'` paints the number in Pine Trail green instead of the
// default text color -- reserved specifically for actual trail-mileage
// figures (DESIGN.md: Pine Trail is "the trail itself"). This used to be a
// plain `accentValue` boolean painting Prairie Sunset orange instead, but
// that color is documented as meaning "act here / this is yours" and
// nothing else -- an /impeccable critique caught these tiles (aggregate
// numbers belonging to other people's schools, not an action the viewer
// takes) diluting that single-accent rule across every KPI tile and both
// data screens in this shell. Only Total Miles Walked is genuine trail
// mileage; the other tiles now render in the plain text color, same as
// every other non-mileage stat.
function StatTile({ label, value, theme, emphasis }: { label: string; value: string; theme: Theme; emphasis?: 'trail' }) {
    const styles = getStyles(theme);
    return (
        // accessibilityLabel combines value+label into one announcement
        // ("73%, Fitness Test Participation") instead of leaving a screen
        // reader to hit two separate Text nodes, value before label --
        // backward from how a sighted reader takes in the tile. Caught by
        // an /impeccable audit.
        <View
            style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}
            accessible
            accessibilityLabel={`${label}: ${value}`}
        >
            <Text style={[styles.statValue, { color: emphasis === 'trail' ? theme.secondary : theme.text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: theme.subtext }]}>{label}</Text>
        </View>
    );
}

// The "Overview" tab's screen component: fetches and displays district-wide
// aggregate stats for the signed-in District Admin. No props (rendered
// directly by the tab navigator); renders either a loading spinner, an
// empty state, or the full KPI dashboard depending on state below.
export default function AdminOverview() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // `loading`: true until the very first data load finishes -- shows a
    // full-screen spinner instead of a dashboard with zeroed-out stats.
    const [loading, setLoading] = useState(true);
    // `refreshing`: true only while a pull-to-refresh is in progress; drives
    // the native RefreshControl spinner without hiding the whole screen the
    // way `loading` does.
    const [refreshing, setRefreshing] = useState(false);
    const [districtName, setDistrictName] = useState('Your District');
    // `schoolGroups`: the per-school rollups (each school's classes, miles,
    // fitness stats) computed from the raw report rows. Used both to render
    // the "Top Schools" list and to compute `topSchools` below.
    const [schoolGroups, setSchoolGroups] = useState<SchoolReportGroup[]>([]);
    // `totals`: district-wide totals (schools/classes/students/miles/
    // fitness rates) derived from the same report rows. Initialized by
    // calling `computeDistrictTotals([])` so the shape always matches what
    // a real result looks like, just zeroed out, avoiding extra null checks
    // in the JSX below.
    const [totals, setTotals] = useState(computeDistrictTotals([]));
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Loads everything this screen needs: the admin's own profile (for
    // their district id and display name) and then, if they have a
    // district assigned, the full aggregated class report for that
    // district. `useCallback` with an empty dependency array means this
    // function reference never changes, which matters for the
    // `useFocusEffect` below (its own inner `useCallback` depends on this).
    const loadOverview = useCallback(async () => {
        try {
            setErrorMessage(null);
            // Who is signed in right now?
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Look up this admin's own profile row to find their district
            // id and the human-readable district name to show in the
            // header. `.maybeSingle()` tolerates zero rows (returns null)
            // instead of throwing, in case the profile is somehow missing.
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setDistrictName(profile?.school_district_name || 'Your District');

            const districtId = profile?.district_id || '';
            if (!districtId) {
                // No district on file for this admin -- show the empty
                // state rather than attempting a report fetch with a blank
                // district id.
                setSchoolGroups([]);
                setTotals(computeDistrictTotals([]));
                return;
            }

            // `fetchDistrictAdminClassReport` (lib/districtAdmin.ts) calls a
            // Supabase RPC/function that returns one row per class in the
            // district, pre-aggregated server-side so this client never
            // receives individual student rows. `groupBySchool` buckets
            // those class rows by school, and `computeDistrictTotals` sums
            // them into the district-wide KPI numbers shown in the stat
            // tiles. `schoolTotals`/`districtTotals` are separate, already-
            // deduped-across-classes student count + total miles (fetched
            // in parallel) that correct for a student enrolled in more than
            // one class, which the per-class sums above would otherwise
            // double-count (both the membership AND the student's whole
            // lifetime total_miles_walked, once per class).
            const [rows, schoolTotals, districtTotals] = await Promise.all([
                fetchDistrictAdminClassReport(districtId),
                fetchDistrictAdminSchoolTotals(districtId),
                fetchDistrictAdminTotals(districtId),
            ]);
            setSchoolGroups(groupBySchool(rows, schoolTotals));
            setTotals(computeDistrictTotals(rows, districtTotals));
        } catch (err: any) {
            // The raw `err.message` (a Postgres/Supabase-shaped string)
            // used to be shown directly to whoever's signed in -- a
            // principal or superintendent with no technical context, or a
            // screen-reader user who'd hear the whole thing read aloud
            // verbatim. Logged for debugging, but the user-facing message
            // always stays plain-language. Caught by an /impeccable
            // critique.
            console.error('Failed to load district overview:', err);
            setErrorMessage('Could not load district data. Please try again.');
        } finally {
            // Clear both loading flags regardless of success/failure so
            // neither the initial spinner nor a pull-to-refresh spinner
            // gets stuck on screen.
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Re-fetch every time this tab gains focus, e.g. switching from
    // another tab back to Overview, so the numbers don't go stale while the
    // admin is looking at other screens.
    useFocusEffect(
        useCallback(() => {
            void loadOverview();
        }, [loadOverview])
    );

    // Event handler wired to the ScrollView's `RefreshControl` below: fired
    // when the user pulls down on the scroll view. Flips on the refresh
    // spinner, then re-runs the same load function used on focus.
    const onRefresh = () => {
        setRefreshing(true);
        void loadOverview();
    };

    // Derived (not stored in state) list: take the school groups, sort a
    // shallow copy by total miles walked descending, and keep only the top
    // 5 for the "Top Schools" leaderboard. Recomputed on every render, which
    // is fine since `schoolGroups` is usually small (one entry per school in
    // a district).
    const topSchools = [...schoolGroups].sort((a, b) => b.totalMiles - a.totalMiles).slice(0, 5);

    // Conditional render: only the very first load blocks the whole screen
    // behind a spinner. Subsequent refreshes use `refreshing` +
    // RefreshControl instead, so the dashboard stays visible while updating.
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
                {/* No kicker/eyebrow label above the title -- "DISTRICT
                    OVERVIEW" here added nothing the tab bar icon and label
                    didn't already say, the classic redundant-caption-above-
                    a-heading pattern. Replaced with a small icon matched to
                    this tab's own tab-bar icon (stats-chart), giving the
                    screen a real, legible identity marker instead of
                    decorative all-caps text. No subtitle line below it
                    either -- an intermediate version here restated a KPI
                    number in small gray text under the title, which read
                    as the same kind of filler commentary as the disclaimer
                    it replaced, just with a number in it. The title stands
                    alone; the KPI tiles below are where the numbers
                    actually belong. Caught by user feedback. */}
                <View style={styles.titleRow}>
                    <View style={[styles.titleIconBadge, { backgroundColor: theme.accent + '18' }]}>
                        <Ionicons name="stats-chart" size={18} color={theme.accent} />
                    </View>
                    <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                </View>

                {/* Error and "genuinely empty" are mutually exclusive, not
                    stacked: a real fetch failure used to render this error
                    text directly above the reassuring "not started yet,
                    will appear automatically" empty-state copy below,
                    telling an admin to just wait when something was
                    actually broken. Caught by an /impeccable critique. */}
                {errorMessage ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                        <Text style={[styles.emptyTitle, { color: theme.error }]}>Could not load district data</Text>
                        <Text style={[styles.emptyBody, { color: theme.subtext }]}>{errorMessage}</Text>
                        <Pressable
                            onPress={() => void loadOverview()}
                            style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.accent }}
                            accessibilityRole="button"
                        >
                            <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14, fontFamily: 'Georgia' }}>Try Again</Text>
                        </Pressable>
                    </View>
                ) : totals.studentCount === 0 ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                        <Text style={[styles.emptyTitle, { color: theme.text }]}>No participating classes yet</Text>
                        <Text style={[styles.emptyBody, { color: theme.subtext }]}>
                            Once teachers in {districtName} create classes and students join, district-wide totals will appear here automatically.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Split from one flat 6-tile grid into two labeled
                            groups of 3 -- the original ungrouped grid put 6
                            equal-weight numbers in front of the admin at
                            once with no stated reason 2 of the 6 were
                            accent-colored (Prairie Sunset) and the other 4
                            weren't. Grouping by what the number is ABOUT
                            (who's enrolled vs. how they're doing on
                            fitness) clears the 4-item chunking guideline.
                            Caught by an /impeccable critique. A LATER
                            critique caught the accent-coloring itself as a
                            separate problem: Prairie Sunset means "act
                            here / this is yours" and nothing else, and
                            these are aggregate numbers belonging to other
                            people's schools -- painting any of them orange
                            (Schools Reporting originally was) diluted that
                            single-accent rule. Only Total Miles Walked
                            keeps a color emphasis now, and it's Pine Trail
                            green (StatTile's `emphasis="trail"`), the
                            system's color for actual trail mileage, not
                            Prairie Sunset. */}
                        {/* Section labels moved off the uppercase, tracked
                            "Eyebrow" role (ENROLLMENT / FITNESS / TOP
                            SCHOOLS BY MILES WALKED) onto DESIGN.md's
                            Label Caption role instead -- italic Georgia,
                            mixed case, already documented for exactly this
                            "section-level divider grouping several things
                            together" job. A small matched Ionicon replaces
                            the eyebrow's all-caps shouting as the visual
                            "this is a distinct group" signal. Two reasons:
                            (1) craft-floor.md bans a kicker/eyebrow label
                            outright as a generic-AI-dashboard tell, and (2)
                            "TOP SCHOOLS BY MILES WALKED" specifically was
                            long enough to wrap to two shouting-caps lines
                            on a narrow phone -- the exact pattern flagged
                            as reading like generated boilerplate rather
                            than an authored heading. */}
                        <View style={styles.groupHeaderRow}>
                            <Ionicons name="people" size={15} color={theme.subtext} />
                            <Text style={[styles.groupLabel, { color: theme.text }]} accessibilityRole="header">Enrollment</Text>
                        </View>
                        <View style={styles.statGrid}>
                            <StatTile label="Schools Reporting" value={String(totals.schoolCount)} theme={theme} />
                            <StatTile label="Active Classes" value={String(totals.classCount)} theme={theme} />
                            <StatTile label="Students Participating" value={String(totals.studentCount)} theme={theme} />
                        </View>

                        <View style={styles.groupHeaderRow}>
                            <Ionicons name="walk" size={15} color={theme.subtext} />
                            <Text style={[styles.groupLabel, { color: theme.text }]} accessibilityRole="header">Fitness</Text>
                        </View>
                        <View style={[styles.statGrid, { marginBottom: 28 }]}>
                            <StatTile label="Total Miles Walked" value={formatMiles(totals.totalMiles)} theme={theme} emphasis="trail" />
                            <StatTile label="Fitness Test Participation" value={pct(totals.fitnessParticipationRate)} theme={theme} />
                            <StatTile label="Fitness Targets Met" value={pct(totals.fitnessPassRate)} theme={theme} />
                        </View>

                        {/* Was "TOP SCHOOLS BY PARTICIPATION" -- but
                            `topSchools` (below) is sorted by totalMiles,
                            not any participation metric, so the heading
                            didn't match the ranking it labeled. Relabeled
                            to match the app's actual sort rather than
                            changing the sort itself, since Total Miles
                            Walked is this program's core "Walk Across
                            Oklahoma" metric. Caught by an /impeccable
                            critique. */}
                        <View style={styles.groupHeaderRow}>
                            <Ionicons name="trophy" size={15} color={theme.subtext} />
                            <Text style={[styles.groupLabel, { color: theme.text }]} accessibilityRole="header">
                                Top Schools by Miles Walked
                            </Text>
                        </View>
                        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                            {topSchools.map((school, idx) => (
                                <View
                                    key={school.schoolName}
                                    style={[styles.schoolRow, idx < topSchools.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                                >
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                        <Text style={[styles.schoolName, { color: theme.text }]}>{school.schoolName}</Text>
                                        <Text style={[styles.schoolMeta, { color: theme.subtext }]}>
                                            {school.memberCount} student{school.memberCount === 1 ? '' : 's'} · {school.classes.length} class{school.classes.length === 1 ? '' : 'es'} · {school.fitnessParticipants > 0 ? pct(school.fitnessParticipants / Math.max(school.memberCount, 1)) : '0%'} fitness participation
                                        </Text>
                                    </View>
                                    {/* Pine Trail green, not Prairie Sunset -- this is a
                                        mileage figure (trail data), and Prairie Sunset is
                                        reserved for "act here / yours," not "here's another
                                        school's aggregate." Caught by an /impeccable critique. */}
                                    <Text style={[styles.schoolMiles, { color: theme.secondary }]}>{formatMiles(school.totalMiles)} mi</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // Replaces the old standalone "kicker" eyebrow label above the title --
    // an icon matched to this tab's own tab-bar icon now sits beside the
    // title instead, a real identity marker rather than a redundant
    // all-caps restatement of "you are on the Overview tab." Caught by
    // user feedback (craft-floor.md bans the kicker-above-heading pattern
    // outright).
    // marginBottom: 24 replaces the spacing a subtitle line used to
    // provide beneath the title -- there's no subtitle anymore (see the
    // JSX comment above), just the title row followed directly by content.
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
    // Accent-tinted circular badge behind the title icon -- same low-
    // opacity-fill-over-accent-color pattern already used elsewhere in the
    // app (e.g. teacher-account.tsx's grade-tier picker) for a "selected/
    // themed" chip, reused here to give this screen's identity marker real
    // color presence rather than a bare gray-on-nothing icon.
    titleIconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 26, fontWeight: '800', fontFamily: 'Georgia' },
    // Base marginBottom (16) is the gap between a group's grid and the
    // NEXT group's label -- the second (last) grid overrides this to the
    // wider 28 needed before the Top Schools card below.
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    // minWidth: '31%' with a 12px gap fits 3 tiles per row on a typical
    // phone width while wrapping cleanly to 2 on narrower screens — same
    // flexWrap-based grid trick signup.tsx's grade-tier picker uses.
    statTile: { flexGrow: 1, minWidth: '30%', borderWidth: 1, borderRadius: 16, padding: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
    statValue: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '800' },
    // fontSize bumped 11->13 -- DESIGN.md's smallest defined body-text role
    // is Label at 13px; only the uppercase Eyebrow role goes to 11px, and
    // this is a sentence-case data caption, not an Eyebrow. Caught by an
    // /impeccable audit.
    statLabel: { fontSize: 13, fontWeight: '600', marginTop: 4, lineHeight: 16 },
    // groupHeaderRow/groupLabel replace the old all-caps, tracked
    // "Eyebrow"-role section labels (ENROLLMENT / FITNESS / the Top
    // Schools heading) with DESIGN.md's Label Caption role instead --
    // italic Georgia, mixed case, already documented for exactly this
    // "section-level divider" job -- paired with a small matched icon.
    // Mixed case reads more compact and doesn't demand the defensive
    // brevity all-caps needs, which is what let "TOP SCHOOLS BY MILES
    // WALKED" wrap to two shouting lines on a narrow phone. Caught by
    // user feedback (craft-floor.md bans the eyebrow pattern outright).
    groupHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    groupLabel: { fontSize: 15, fontWeight: '700', fontStyle: 'italic', fontFamily: 'Georgia' },
    card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
    schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    // fontFamily: 'Georgia' added -- a row/item title (DESIGN.md's Title
    // role explicitly covers "item/row titles (list rows...)"), missed by
    // both prior Georgia passes since those targeted headings, not row
    // titles. Caught by an /impeccable audit.
    schoolName: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    // fontSize bumped 12->13 to clear DESIGN.md's Label floor, same
    // reasoning as statLabel above.
    schoolMeta: { fontSize: 13, marginTop: 2 },
    schoolMiles: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia' },
    // shadowColor/Offset/Opacity/Radius/elevation added -- was the one
    // card in this shell with a border but no ambient shadow, unlike every
    // sibling card (statTile, card). Caught by an /impeccable audit.
    emptyCard: { borderWidth: 1, borderRadius: 16, padding: 20, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6, fontFamily: 'Georgia' },
    emptyBody: { fontSize: 13, lineHeight: 19 },
});
