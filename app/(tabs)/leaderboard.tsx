// app/(tabs)/leaderboard.tsx
// Shows a ranked leaderboard of students by total miles walked, with a
// "podium" for the top 3 and a scrollable list for everyone else. Supports
// filtering by "My Network" (everyone) or by a specific class the student
// belongs to.
import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, Alert, ActivityIndicator, useColorScheme } from 'react-native';

// Expo's optimized Image component (better caching/performance for remote
// images than React Native's built-in <Image>), used here for avatar
// pictures.
import { Image } from 'expo-image';
import { supabase } from '../../utils/supabase';

// Unlike most other screens (which use StyleSheet.create locally), this
// screen pulls its style OBJECT from a shared factory function,
// getLeaderboardStyles(theme), defined in commonStyles.ts — it likely
// generates a large, leaderboard-specific style object based on the
// current color theme.
import { colors, getLeaderboardStyles } from '../../commonStyles';

// Describes one row on the leaderboard.
export type LeaderboardEntry = {
    id: string;
    name: string;
    // A URL (or generated avatar URL) used as the image source for this
    // person's picture.
    profilePicture: string;
    score: number;
    // 1-based position on the leaderboard (1 = first place).
    rank: number;
    // Optional flag marking "this row is the person currently using the
    // app" so it can be visually highlighted.
    isCurrentUser?: boolean;
};

// Describes one tab in the horizontal class-filter row at the top
// ("My Network", plus one tab per class the student is enrolled in).
type ClassTab = {
    id: string;
    label: string;
};

// Colors used for the top-3 podium bases and medal-colored avatar rings:
// gold-ish orange for 1st, silver gray for 2nd, bronze for 3rd. Index 0 =
// rank 1, index 1 = rank 2, index 2 = rank 3 (matched up via `rank - 1`
// further down).
const MEDAL_COLORS = ['#DE9027', '#9E9E9E', '#C07B3A'];

export default function LeaderboardScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    // Generate the full style object for this screen based on the current
    // theme colors.
    const lStyles = getLeaderboardStyles(theme);

    // The list of filter tabs shown at the top. Starts with just "My
    // Network" (the default, all-encompassing view) until any class-
    // specific tabs are loaded in.
    const [classTabs, setClassTabs] = useState<ClassTab[]>([{ id: 'all', label: 'My Network' }]);
    // Which tab's id is currently selected — 'all' means no class filter.
    const [activeGroup, setActiveGroup] = useState<string>('all');
    // The actual ranked list of people currently being displayed.
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    // Holds an error message if fetching the student's classes fails —
    // kept separate from the ranking-load errors (which use a plain
    // Alert.alert instead) so the class-loading failure can be shown
    // inline without blocking the rest of the screen.
    const [groupsError, setGroupsError] = useState<string | null>(null);

    // ── STEP 1: Fetch all specialized groups this student belongs to ──
    useEffect(() => {
        async function fetchJoinedGroups() {
            try {
                // getSession() (rather than getUser()) is used here since
                // we only need the user id from the local session token,
                // not a fresh network round-trip to verify the user.
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user?.id) return;

                // There's no foreign key between class_memberships and classes,
                // so PostgREST can't resolve an embedded classes(...) join --
                // fetch memberships and class names separately and merge here.
                const { data: memberships, error: membershipsError } = await supabase
                    .from('class_memberships')
                    .select('class_id')
                    .eq('user_id', session.user.id);

                if (membershipsError) throw membershipsError;

                // Clear out any previous error now that this fetch has
                // succeeded so far.
                setGroupsError(null);

                if (!memberships || memberships.length === 0) {
                    // This student isn't in any classes — reset to just
                    // the default "My Network" tab.
                    setClassTabs([{ id: 'all', label: 'My Network' }]);
                    return;
                }

                // Build a de-duplicated list of class ids. `new Set(...)`
                // automatically drops duplicate values, and spreading it
                // back into an array (`[...new Set(...)]`) converts it
                // back to a plain array — a common one-liner for
                // "unique-ify this array".
                const classIds = [...new Set(memberships.map((m) => m.class_id))];
                const { data: classRows, error: classesError } = await supabase
                    .from('classes')
                    .select('id, class_name')
                    .in('id', classIds);

                if (classesError) throw classesError;

                // Build a lookup Map from class id → class name, so each
                // tab can quickly find its display label. `new Map(...)`
                // is built directly from an array of [key, value] pairs
                // produced by .map() below.
                const classNameById = new Map((classRows || []).map((c) => [c.id, c.class_name]));
                const dynamicTabs = classIds.map((classId) => ({
                    id: classId,
                    // Fall back to a generic "Active Group" label in the
                    // rare case a class id has no matching name.
                    label: classNameById.get(classId) || 'Active Group',
                }));
                // "My Network" always stays as the first tab, with the
                // student's actual classes appended after it via the
                // spread operator.
                setClassTabs([{ id: 'all', label: 'My Network' }, ...dynamicTabs]);
            } catch (err: any) {
                console.log("Error sourcing group navigation channels:", err);
                setGroupsError(err.message || 'Could not load your classes.');
            }
        }
        fetchJoinedGroups();
    }, []);

    // ── STEP 2: Query Standings relative to active tab filter ──
    // Re-runs any time `activeGroup` changes (i.e. whenever the user taps
    // a different filter tab).
    useEffect(() => {
        async function fetchRealRankings() {
            try {
                setLoading(true);

                const { data: { session } } = await supabase.auth.getSession();
                // `|| null` normalizes a missing user id to `null` rather
                // than `undefined`, for a consistent comparison later.
                const uid = session?.user?.id || null;

                // Setup baseline query targeting profiles sorted by mileage
                // NOTE: this doesn't call .then()/await yet — Supabase
                // query builders let you keep chaining .eq()/.in() calls
                // onto the same `query` variable before finally executing
                // it, which is exactly what happens conditionally below.
                let query = supabase
                    .from('profiles')
                    .select('id, username, display_name, total_miles_walked, avatar_seed')
                    .order('total_miles_walked', { ascending: false });

                if (activeGroup !== 'all') {
                    // Filter down rows to only include profiles associated with the active group channel
                    const { data: userIdsInGroup } = await supabase
                        .from('class_memberships')
                        .select('user_id')
                        .eq('class_id', activeGroup);

                    const targetIds = (userIdsInGroup || []).map(row => row.user_id);
                    if (targetIds.length === 0) {
                        // Nobody is in this class — show an empty
                        // leaderboard rather than querying with an empty
                        // id list (which could behave unpredictably).
                        setEntries([]);
                        return;
                    }
                    // .in('id', targetIds) narrows the profiles query down
                    // to WHERE id IN (targetIds) — only members of this
                    // specific class.
                    query = query.in('id', targetIds);
                }

                // Now actually execute the (possibly filtered) query.
                const { data, error } = await query;
                if (error) throw error;

                // Transform each raw database row into the LeaderboardEntry
                // shape the UI expects. `(data || [])` guards against
                // `data` being null. `.map((row, index) => ...)` gives
                // access to each row's position in the array via `index`.
                const mappedEntries: LeaderboardEntry[] = (data || []).map((row, index) => ({
                    id: row.id,
                    name: row.display_name || row.username || 'Explorer',
                    // New accounts default avatar_seed to their own raw user id (not a URL)
                    // until they visit "Customize Avatar & Profile" -- only treat it as an
                    // image source once it actually looks like one, otherwise generate one.
                    profilePicture: row.avatar_seed?.startsWith('http')
                        // If the stored avatar_seed already looks like a
                        // real image URL, swap its "/svg?" segment for
                        // "/png?" so the app always loads a PNG (rather
                        // than an SVG, which Image components sometimes
                        // handle less reliably).
                        ? row.avatar_seed.replace('/svg?', '/png?')
                        // Otherwise, generate a placeholder "robot" avatar
                        // from the free Dicebear API, seeded with this
                        // user's id so the same user always gets the same
                        // generated avatar. encodeURIComponent() escapes
                        // any characters in the id that aren't safe to put
                        // directly into a URL.
                        : `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(row.id)}`,
                    score: row.total_miles_walked || 0,
                    // Since the query is already sorted highest-miles-
                    // first, the array index directly gives us the rank —
                    // index 0 is 1st place, so we add 1.
                    rank: index + 1,
                    isCurrentUser: row.id === uid
                }));

                setEntries(mappedEntries);
            } catch (err: any) {
                Alert.alert('Error loading rankings', err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchRealRankings();
    }, [activeGroup]);

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={{ marginTop: 12, color: theme.subtext, fontFamily: 'Georgia' }}>Loading Rankings...</Text>
            </View>
        );
    }

    // Split the ranked list into the top 3 (shown as a podium) and
    // everyone else (shown as a plain list below it).
    const top3 = entries.slice(0, 3);
    const rest = entries.slice(3);

    // The podium is displayed in a "2nd, 1st, 3rd" left-to-right visual
    // order (like an Olympic medal podium), even though the underlying
    // rank order is 1st, 2nd, 3rd — this rearranges top3 for DISPLAY only.
    // `baseHeight` controls how tall each podium "step" is drawn: the 1st
    // place base (110) is tallest, 2nd (80) shorter, 3rd (60) shortest.
    const podiumVisualOrder = top3.length === 3
        ? [
            { entry: top3[1], baseHeight: 80 },   // 2nd place, left
            { entry: top3[0], baseHeight: 110 },  // 1st place, center (tallest)
            { entry: top3[2], baseHeight: 60 },   // 3rd place, right (shortest)
        ]
        : top3.length === 2
            // With only 2 entries total, there's no 3rd place to show —
            // just arrange 2nd-then-1st, both still get a base height.
            ? [
                { entry: top3[1], baseHeight: 80 },
                { entry: top3[0], baseHeight: 110 },
            ]
            // With 0 or 1 entries, there's nothing meaningful to reorder —
            // just map whatever's there straight through, all using the
            // "1st place" tall base height.
            : top3.map((e) => ({ entry: e, baseHeight: 110 }));

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <View style={lStyles.header}>
                <Text style={lStyles.headerTitle} accessibilityRole="header">Leaderboard</Text>
                <Text style={lStyles.headerSubtitle}>See how you rank</Text>
            </View>

            {/* Dynamic Segment Navigation Filters */}
            {/* A horizontally-scrolling row of filter tabs (rather than
                the more common vertical ScrollView) — `horizontal` flips
                its scroll direction. Nested inside the outer vertical
                ScrollView, this is a common pattern for horizontal
                carousels/tab-strips within a vertically scrolling page. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lStyles.tabsContainer} style={lStyles.tabsScroll}>
                {classTabs.map(group => (
                    <Pressable
                        key={group.id}
                        // Combine the base tab style with an "active"
                        // override style only for whichever tab currently
                        // matches activeGroup.
                        style={[lStyles.tab, activeGroup === group.id && lStyles.tabActive]}
                        onPress={() => setActiveGroup(group.id)}
                        accessibilityRole="tab"
                        // Both accessibilityState and the flat aria-selected
                        // prop are set: real React Native reads
                        // accessibilityState, but this project's React
                        // Native Web build only derives aria-* attributes
                        // from the flat props, not from accessibilityState
                        // (confirmed earlier this session -- see WebNav.tsx).
                        accessibilityState={{ selected: activeGroup === group.id }}
                        aria-selected={activeGroup === group.id}
                    >
                        <Text style={[lStyles.tabLabel, activeGroup === group.id && lStyles.tabLabelActive]}>
                            {group.label}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            {/* Only rendered if the class-loading step above failed —
                shown as small inline text rather than a blocking alert, so
                the rest of the leaderboard (which still works with just
                "My Network") stays usable. */}
            {groupsError && (
                <Text style={{ color: theme.subtext, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 }}>
                    Couldn't load your classes: {groupsError}
                </Text>
            )}

            {/* The podium only renders if there's at least 1 entry to show. */}
            {top3.length > 0 && (
                <View style={lStyles.podiumContainer}>
                    {podiumVisualOrder.map(({ entry, baseHeight }) => (
                        <View key={entry.id} style={lStyles.podiumSlot}>
                            {/* numberOfLines={1} truncates (with an
                                ellipsis "…") any name too long to fit on
                                one line, instead of wrapping to a second
                                line and breaking the podium's layout. */}
                            <Text style={lStyles.podiumName} numberOfLines={1}>{entry.name}</Text>
                            {/* .toLocaleString() adds thousands
                                separators appropriate to the user's locale
                                (e.g. 1234 → "1,234"), making large numbers
                                easier to read at a glance. */}
                            <Text style={lStyles.podiumScore}>{entry.score.toLocaleString()} mi</Text>
                            {/* MEDAL_COLORS[entry.rank - 1] converts the
                                1-based rank back to a 0-based array index.
                                The `?? '#EAE0D5'` fallback (a neutral tan/
                                beige) would only matter if rank were
                                somehow outside 1-3, which shouldn't happen
                                here since this loop only ever covers top3. */}
                            <View style={[lStyles.podiumAvatarRing, { borderColor: MEDAL_COLORS[entry.rank - 1] ?? '#EAE0D5' }]}>
                                <Image source={entry.profilePicture} style={lStyles.podiumAvatar} contentFit="cover" />
                            </View>
                            <View style={[lStyles.podiumBase, { backgroundColor: MEDAL_COLORS[entry.rank - 1] ?? '#EAE0D5', height: baseHeight }]}>
                                {/* Shows an actual medal emoji for ranks
                                    1-3, or a plain "#4", "#5", etc. text
                                    fallback for anything else (though in
                                    practice this podium block never
                                    receives ranks beyond 3). Nested
                                    ternaries: rank===1 ? gold : (rank===2 ?
                                    silver : (rank===3 ? bronze : "#N")). */}
                                <Text style={lStyles.podiumRankLabel}>{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* The remaining ranked list (position 4 onward), only shown
                if there's anything beyond the top 3. */}
            {rest.length > 0 && (
                <View style={lStyles.listContainer}>
                    {rest.map(entry => (
                        <View key={entry.id} style={[lStyles.row, entry.isCurrentUser && lStyles.rowHighlighted]}>
                            <Text style={lStyles.rowRank}>#{entry.rank}</Text>
                            <View style={lStyles.rowAvatarRing}>
                                <Image source={entry.profilePicture} style={lStyles.rowAvatar} contentFit="cover" />
                            </View>
                            <Text style={[lStyles.rowName, entry.isCurrentUser && lStyles.rowNameHighlighted]}>
                                {entry.name}{entry.isCurrentUser ? ' (You)' : ''}
                            </Text>
                            <Text style={lStyles.rowScore}>{entry.score.toLocaleString()} mi</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Shown only when there are zero entries at all (e.g. an
                empty class was selected) — replaces both the podium and
                list sections entirely. */}
            {entries.length === 0 && (
                <View style={lStyles.emptyState}>
                    <Text style={lStyles.emptyText}>No members in this network group yet.</Text>
                </View>
            )}
        </ScrollView>
    );
}
