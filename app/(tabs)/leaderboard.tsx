// app/(tabs)/leaderboard.tsx
// Shows a ranked leaderboard of students by total miles walked, with a
// "podium" for the top 3 and a scrollable list for everyone else. Supports
// filtering by "My Network" (everyone the student shares a class with) or
// by one specific class the student belongs to. All the data-fetching
// (classes, RPC-scoped rankings) lives in `hooks/useLeaderboardData.ts`,
// shared verbatim with the cartoony elementary shell's own leaderboard
// screen -- this file owns only the "classic" podium/list rendering.
import { Text, View, ScrollView, Pressable, ActivityIndicator, useColorScheme } from 'react-native';

// Expo's optimized Image component (better caching/performance for remote
// images than React Native's built-in <Image>), used here for avatar
// pictures.
import { Image } from 'expo-image';

// Unlike most other screens (which use StyleSheet.create locally), this
// screen pulls its style OBJECT from a shared factory function,
// getLeaderboardStyles(theme), defined in commonStyles.ts — it likely
// generates a large, leaderboard-specific style object based on the
// current color theme.
import { colors, getLeaderboardStyles } from '../../commonStyles';
import { useLeaderboardData } from '../../hooks/useLeaderboardData';

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

    const { classTabs, activeGroup, setActiveGroup, entries, loading, groupsError } = useLeaderboardData();

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
                    Couldn&apos;t load your classes: {groupsError}
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
