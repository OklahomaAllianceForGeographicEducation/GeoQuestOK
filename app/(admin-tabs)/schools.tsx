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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    // FlatList (in place of a plain ScrollView + .map()) only mounts the
    // rows currently on/near screen -- some Oklahoma districts have 50-90+
    // schools, and every expanded school adds a further nested list of
    // classes, so an unvirtualized ScrollView could mount a large number
    // of rows/cards at once. Caught by an /impeccable audit.
    FlatList,
    Pressable,
    // RefreshControl wires up the classic native "pull down to refresh"
    // gesture -- FlatList accepts it directly via its own `refreshControl`
    // prop, same as a ScrollView.
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    useColorScheme,
    View
} from 'react-native';
import { colors, Theme } from '../../commonStyles';
import TourTarget from '../../components/tour/TourTarget';
import { fetchDistrictAdminClassReport, fetchDistrictAdminSchoolTotals, fetchDistrictSchoolRegistry, groupBySchool, mergeWithSchoolRegistry, type SchoolReportGroup } from '../../lib/districtAdmin';
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
    // `searchQuery`: free-text filter typed into the search box above the
    // list. Filtering happens client-side against the already-loaded
    // `schoolGroups` (see `filteredSchoolGroups` below) rather than a
    // fresh fetch per keystroke, since the full district's school list is
    // small enough to already be in memory. Added because some Oklahoma
    // districts have 50-90+ schools with no other way to jump to one.
    // Caught by an /impeccable critique.
    const [searchQuery, setSearchQuery] = useState('');

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
            // `schools_registry` table. These two requests don't depend on
            // each other, so running them concurrently is faster than
            // awaiting them sequentially.
            const [rows, registryNames, schoolTotals] = await Promise.all([
                fetchDistrictAdminClassReport(districtId),
                fetchDistrictSchoolRegistry(districtId),
                fetchDistrictAdminSchoolTotals(districtId),
            ]);

            // Merge the full registry (so a school with zero app usage
            // still shows up, as an invitation to recruit it) with whatever
            // real class/fitness data matched -- shared with reports.tsx's
            // PDF export via lib/districtAdmin.ts's mergeWithSchoolRegistry,
            // after an /impeccable critique caught the PDF quietly omitting
            // every school this screen already showed, because this merge
            // used to live only here. `schoolTotals` corrects each school's
            // student count and total miles for students enrolled in more
            // than one class (groupBySchool would otherwise double-count
            // them by summing per-class values).
            setSchoolGroups(mergeWithSchoolRegistry(groupBySchool(rows, schoolTotals), registryNames));
        } catch (err: any) {
            // Plain-language message only -- the raw err.message (Postgres/
            // Supabase-shaped) used to be shown verbatim to a principal or
            // superintendent with no technical context, and read aloud in
            // full to a screen-reader user. Logged for debugging instead.
            // Caught by an /impeccable critique.
            console.error('Failed to load schools:', err);
            setErrorMessage('Could not load school data. Please try again.');
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

    // Derived (not stored in state) list: `schoolGroups` filtered down to
    // whatever the admin has typed into the search box, case-insensitively
    // matched against the school name. An empty query short-circuits to
    // the full list so nothing else needs to branch on "no search active".
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const filteredSchoolGroups = trimmedQuery
        ? schoolGroups.filter((school) => school.schoolName.toLowerCase().includes(trimmedQuery))
        : schoolGroups;

    // Conditional render: block the whole screen behind a spinner until the
    // very first fetch (via loadSchools/useFocusEffect above) completes.
    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    // Renders one school's header row (name/meta/miles) plus, when
    // expanded, its class cards below. Pulled out of the inline .map()
    // that used to live directly in the ScrollView JSX so FlatList's
    // `renderItem` can call it per-row instead -- same JSX and behavior as
    // before, just invoked per visible row rather than for the whole list
    // up front.
    const renderSchoolRow = ({ item: school, index: schoolIndex }: { item: SchoolReportGroup; index: number }) => {
        // Whether THIS specific school's row is currently expanded to show
        // its classes -- looked up fresh on every render from the
        // `expandedSchools` Set.
        const isExpanded = expandedSchools.has(school.schoolName);
        // The tappable header row for one school: name (with a expand/
        // collapse triangle prefix), a meta line (or a special "recruit"
        // message for schools with no data yet), and the total miles
        // walked. Built as a local variable (rather than inline JSX) so it
        // can be conditionally wrapped in a TourTarget below without
        // duplicating this whole block.
        // A complete, translatable sentence for screen readers, built
        // separately from the visual children rather than left to whatever
        // VoiceOver/TalkBack would otherwise compose from them -- without
        // this, the ▾/▸ glyph below (decorative for sighted users) got
        // read aloud as literal text on every row, on top of the "no
        // active classes"/miles figures being announced as disconnected
        // fragments rather than one sentence. `accessibilityState.expanded`
        // still carries the actual expand/collapse state via the platform's
        // own "expanded"/"collapsed" trait, so it isn't repeated here.
        // Caught by an /impeccable audit + clarify pass.
        const accessibleSummary = school.isEmptyInvitation
            ? `${school.schoolName}, no active classes yet, a candidate for outreach`
            : `${school.schoolName}, ${school.memberCount} student${school.memberCount === 1 ? '' : 's'}, ${school.classes.length} class${school.classes.length === 1 ? '' : 'es'}, ${pct(school.fitnessParticipants, school.memberCount)} fitness participation, ${formatMiles(school.totalMiles)} miles`;
        const headerRow = (
            <Pressable
                style={[styles.schoolRow, { borderBottomColor: theme.border }]}
                onPress={() => toggleSchool(school.schoolName)}
                accessibilityRole="button"
                accessibilityLabel={accessibleSummary}
                // `accessibilityState`/`aria-expanded` tell screen readers
                // whether this expandable row is currently open or closed.
                accessibilityState={{ expanded: isExpanded }}
                aria-expanded={isExpanded}
            >
                <View style={{ flex: 1, paddingRight: 8 }}>
                    {/* The ▾ (expanded) / ▸ (collapsed) triangle glyph is a
                        sighted-only visual cue -- the accessible name comes
                        entirely from `accessibleSummary` above, not from
                        this text, so the glyph is never announced. */}
                    <Text style={[styles.schoolName, { color: theme.text }]}>
                        {isExpanded ? '▾' : '▸'} {school.schoolName}
                    </Text>
                    {/* Conditional render: a school that matched nothing in
                        the real class report (isEmptyInvitation, set in
                        loadSchools above) shows a distinct "recruit this
                        school" message instead of the normal student/class/
                        fitness summary line. */}
                    {school.isEmptyInvitation ? (
                        <Text style={styles.invitationText}>No active classes yet 🚀 A great candidate for outreach</Text>
                    ) : (
                        <Text style={[styles.schoolMeta, { color: theme.subtext }]}>
                            {school.memberCount} student{school.memberCount === 1 ? '' : 's'} · {school.classes.length} class{school.classes.length === 1 ? '' : 'es'} · {pct(school.fitnessParticipants, school.memberCount)} fitness participation
                        </Text>
                    )}
                </View>
                {/* Empty-invitation schools show their (zero) mileage in
                    Subtext instead of Pine Trail green, so the number
                    doesn't look like a meaningful, worth-celebrating stat
                    for a school with no real data. This used to be
                    `theme.border` -- a hairline/divider color, not a text
                    color -- which measured ~1.29:1 contrast against the
                    surface background, dramatically below the 4.5:1 WCAG
                    AA floor and effectively invisible. Subtext is the
                    system's actual "de-emphasized but legible" token.
                    Caught by an /impeccable audit. Pine Trail (not Prairie
                    Sunset, which means "act here / yours") is this mileage
                    figure's normal color, same reasoning as overview.tsx's
                    Top Schools list -- caught by an earlier /impeccable
                    critique. */}
                <Text style={[styles.schoolMiles, { color: school.isEmptyInvitation ? theme.subtext : theme.secondary }]}>
                    {formatMiles(school.totalMiles)} mi
                </Text>
            </Pressable>
        );
        return (
            <View style={{ marginBottom: 4 }}>
                {/* Only the very FIRST school row in the list is wrapped in
                    a TourTarget, so the onboarding tour has exactly one row
                    to point at (highlighting every row would be both
                    meaningless and visually broken). */}
                {schoolIndex === 0 ? <TourTarget id="admin.schoolRow">{headerRow}</TourTarget> : headerRow}

                {/* Conditional render: the class list for this school only
                    renders at all while `isExpanded` is true -- collapsed
                    schools render nothing below their header row. */}
                {isExpanded && (
                    <View style={{ paddingLeft: 12, paddingBottom: 12 }}>
                        {school.classes.length === 0 ? (
                            <Text style={styles.emptyText}>No classes reporting at this school yet.</Text>
                        ) : (
                            school.classes
                                // `.slice()` copies the array before
                                // `.sort()` mutates it, so the original
                                // `school.classes` array (part of React
                                // state) isn't reordered in place.
                                .slice()
                                .sort((a, b) => b.memberCount - a.memberCount)
                                .map((c) => (
                                    // `accessible` + `accessibilityLabel` group this card into
                                    // one screen-reader stop with a complete sentence, the same
                                    // pattern already used one level up on the school row
                                    // (`accessibleSummary`) -- without it, a screen reader hit
                                    // 5+ independent, ungrouped Text nodes per class instead of
                                    // one coherent announcement. Caught by an /impeccable audit.
                                    <View
                                        key={c.classId}
                                        style={[styles.classCard, { borderColor: theme.border, backgroundColor: theme.surface, shadowColor: theme.shadow }]}
                                        accessible
                                        accessibilityLabel={`${c.className}, taught by ${c.teacherName}, ${c.memberCount} student${c.memberCount === 1 ? '' : 's'}, ${c.fitnessEntries > 0 ? `${c.fitnessTargetsMet} of ${c.fitnessEntries} fitness targets met` : 'no fitness results yet'}, ${pct(c.fitnessParticipants, c.memberCount)} fitness participation, ${formatMiles(c.totalMiles)} miles`}
                                    >
                                        <View style={styles.classHeader}>
                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                <Text style={[styles.className, { color: theme.text }]}>{c.className}</Text>
                                                <Text style={[styles.classMeta, { color: theme.subtext }]}>Taught by {c.teacherName}</Text>
                                            </View>
                                            <Text style={[styles.classMiles, { color: theme.secondary }]}>{formatMiles(c.totalMiles)} mi</Text>
                                        </View>
                                        <View style={[styles.classStatsRow, { borderTopColor: theme.border }]}>
                                            <Text style={[styles.classStat, { color: theme.subtext }]}>{c.memberCount} student{c.memberCount === 1 ? '' : 's'}</Text>
                                            {/* Ternary: a class with zero recorded fitness entries
                                                shows a plain "No fitness results yet" message instead
                                                of a "0/0 targets met" fraction, which would read as
                                                confusing/alarming rather than simply "not started". */}
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
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* Client-side filter -- some Oklahoma districts have 50-90+
                schools with no other way to jump to one besides scrolling
                and reading every row. Rendered OUTSIDE the FlatList (not in
                ListHeaderComponent) so it stays reachable regardless of
                scroll position -- it used to scroll away with the rest of
                the header, defeating its own purpose for exactly the large
                districts it was built for. Only shown once there's more
                than a handful of schools to search through; below that a
                filter box is just noise above a list you can already see
                in full. Caught by an /impeccable critique. */}
            {schoolGroups.length > 5 && (
                <View style={{ paddingHorizontal: 24, paddingTop: 24 }}>
                    <View style={styles.searchInputWrapper}>
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Search schools by name..."
                            placeholderTextColor={theme.subtext}
                            // "none" rather than "words" -- matching is
                            // already case-insensitive, and auto-
                            // capitalizing every word as typed reads oddly
                            // in a search field. Caught by an /impeccable
                            // critique.
                            autoCapitalize="none"
                            accessibilityLabel="Search schools by name"
                            style={[styles.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                        />
                        {/* Clear button -- only shown once there's actually
                            something to clear. No cross-platform built-in
                            clear affordance exists (iOS's clearButtonMode
                            has no Android/web equivalent), so this is a
                            small manual "x". */}
                        {searchQuery.length > 0 && (
                            <Pressable
                                onPress={() => setSearchQuery('')}
                                style={styles.searchClearButton}
                                accessibilityRole="button"
                                accessibilityLabel="Clear search"
                            >
                                <Text style={[styles.searchClearGlyph, { color: theme.subtext }]}>✕</Text>
                            </Pressable>
                        )}
                    </View>
                    {/* Announces the filtered count to screen readers as the
                        admin types -- without this, filtering the list gave
                        a screen-reader user no confirmation anything
                        changed (the FlatList itself doesn't announce
                        re-renders). `accessibilityLiveRegion` is the
                        Android/RN-native prop; `aria-live` is the web
                        equivalent -- both point at the same "polite"
                        behavior (announce when idle, don't interrupt).
                        Visually hidden from sighted users (redundant with
                        the row count they can already see) via
                        `importantForAccessibility`/screen-reader-only
                        sizing would be the next refinement; kept visible
                        for now since it's also useful sighted feedback.
                        Caught by an /impeccable critique. */}
                    {trimmedQuery.length > 0 && (
                        <Text
                            style={[styles.searchResultCount, { color: theme.subtext }]}
                            accessibilityLiveRegion="polite"
                            aria-live="polite"
                        >
                            {filteredSchoolGroups.length} school{filteredSchoolGroups.length === 1 ? '' : 's'} match{filteredSchoolGroups.length === 1 ? 'es' : ''}
                        </Text>
                    )}
                </View>
            )}
            <FlatList
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                data={filteredSchoolGroups}
                keyExtractor={(school) => school.schoolName}
                renderItem={renderSchoolRow}
                // Wiring up RefreshControl on the FlatList adds the native
                // "pull down to refresh" gesture, same as it did on the
                // ScrollView this replaced. `refreshing` controls whether
                // its spinner is currently showing; `onRefresh` is called
                // when the user performs the pull gesture.
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
                showsVerticalScrollIndicator={false}
                // Header block (title/error) always renders, same as
                // before -- FlatList renders this regardless of whether
                // `data` is empty. The search box
                // itself now lives outside the FlatList (see above), so it
                // isn't part of this header anymore.
                ListHeaderComponent={
                    <>
                        {/* No kicker/eyebrow above the title -- see
                            overview.tsx's title row for the full reasoning
                            (craft-floor.md bans the pattern; an icon
                            matched to this tab's own tab-bar icon replaces
                            it as a real identity marker). No subtitle line
                            below it either -- an intermediate version here
                            restated the school count in small gray text,
                            which read as the same kind of filler commentary
                            as the disclaimer it replaced. The row count is
                            visible directly in the list below, and the
                            ▾/▸ glyph on each row already signals it's
                            expandable. Caught by user feedback. */}
                        <View style={styles.titleRow}>
                            <View style={[styles.titleIconBadge, { backgroundColor: theme.accent + '18' }]}>
                                <Ionicons name="business" size={18} color={theme.accent} />
                            </View>
                            <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                        </View>
                        {/* Conditional render: only shown if a fetch failed
                            and set an error message. */}
                        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
                    </>
                }
                // Replaces the old `schoolGroups.length === 0` ternary --
                // FlatList renders this in place of `renderItem` output
                // whenever `data` is empty. Branches on `errorMessage` now
                // too: a real fetch failure used to render this same "No
                // schools found for your district yet." message right
                // below the error text above, implying nothing was wrong
                // when something actually was. Caught by an /impeccable
                // critique.
                ListEmptyComponent={
                    errorMessage ? (
                        <Pressable
                            onPress={() => void loadSchools()}
                            style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.accent }}
                            accessibilityRole="button"
                        >
                            <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14, fontFamily: 'Georgia' }}>Try Again</Text>
                        </Pressable>
                    ) : trimmedQuery ? (
                        // A THIRD empty-state case, distinct from "genuinely
                        // no schools": the search box has real schools to
                        // show but none matched this query -- a different
                        // message (and no "recruit this district" framing)
                        // from either the error or true-empty cases above.
                        <Text style={styles.emptyText}>No schools match "{searchQuery.trim()}".</Text>
                    ) : (
                        <Text style={styles.emptyText}>No schools found for your district yet.</Text>
                    )
                }
            />
        </View>
    );
}

// `getStyles` bakes the current theme's colors into the returned
// StyleSheet -- called once per render near the top of the component.
// -- layout style: centers the loading spinner --
// -- header text styles: title icon badge, big district title --
const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // Replaces the old standalone "kicker" eyebrow label above the title --
    // see overview.tsx's identical titleRow for the full reasoning.
    // marginBottom: 24 replaces the spacing a subtitle line used to
    // provide -- there's no subtitle anymore, just this row followed
    // directly by content.
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
    // Same accent-tinted circular badge as overview.tsx/reports.tsx.
    titleIconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 26, fontWeight: '800', fontFamily: 'Georgia' },
    errorText: { color: theme.error, fontSize: 13, marginBottom: 16 },
    // Canonical input pattern used elsewhere in the app (dashboard's
    // custom-mileage input, login/signup fields): Surface background,
    // hairline Border outline, 12px radius, Georgia 16px body text.
    // position: 'relative' lets searchClearButton position itself
    // (absolute) against this wrapper rather than the whole screen.
    searchInputWrapper: { position: 'relative', marginBottom: 16 },
    // paddingRight: 40 leaves room for the clear button so typed text
    // never runs underneath it.
    searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingRight: 40, paddingVertical: 13, fontSize: 16, fontFamily: 'Georgia' },
    // 44x44 hit area (centered on the glyph) clears the touch-target floor
    // even though the visible "x" itself is small.
    searchClearButton: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
    searchClearGlyph: { fontSize: 15, fontWeight: '700' },
    searchResultCount: { fontSize: 13, fontStyle: 'italic', marginTop: 8 },
    emptyText: { color: theme.subtext, fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    // -- school row styles (the tappable header showing each school's name/summary/miles) --
    schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    // fontFamily: 'Georgia' added to schoolName/className below -- both are
    // row/item titles (DESIGN.md's Title role explicitly covers "item/row
    // titles (list rows...)"), missed by the earlier kicker-focused Georgia
    // pass. Caught by an /impeccable audit.
    schoolName: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    // fontSize bumped 12->13 -- DESIGN.md's smallest defined body-text
    // role is Label at 13px. Caught by an /impeccable audit.
    schoolMeta: { fontSize: 13, marginTop: 2 },
    // Same shared "recruit" color as (teacher-tabs)/reports.tsx and
    // (site-admin-tabs)/district.tsx -- see that file for the contrast fix
    // rationale (#E07A5F darkened to #A34E36).
    invitationText: { fontSize: 13, color: '#A34E36', fontWeight: '600', marginTop: 2 },
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
    // fontSize bumped 14->15 -- DESIGN.md's Title role (row/item titles)
    // is documented 15-17px; this was one pixel under, while its sibling
    // schoolName correctly uses 15px. Caught by an /impeccable critique.
    className: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    classMeta: { fontSize: 13, marginTop: 2 },
    classMiles: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    classStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
    classStat: { fontSize: 13, fontWeight: '600' },
});
