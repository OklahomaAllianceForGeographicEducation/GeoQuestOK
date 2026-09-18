// app/(kids-tabs)/leaderboard.tsx
// "Ranks" -- the elementary-student leaderboard, driven by the exact same
// classmates-only RPC and class-tab logic as `(tabs)/leaderboard.tsx` (see
// `hooks/useLeaderboardData.ts`), rendered as a big trophy podium and
// chunky ranked rows instead of the adult gold/silver/bronze plinth.
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import GlobeMascot from '../../components/kids/GlobeMascot';
import { KidsCard } from '../../components/kids/KidsPrimitives';
import { useLeaderboardData } from '../../hooks/useLeaderboardData';
import { kidsColors, kidsFonts, kidsRadius, kidsSpacing } from '../../styles/kidsTheme';

const MEDAL_BG = [kidsColors.sun, kidsColors.skyBright, kidsColors.berryBright];
const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];

export default function KidsLeaderboardScreen() {
    const { classTabs, activeGroup, setActiveGroup, entries, loading, groupsError } = useLeaderboardData();

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: kidsColors.bg }]}>
                <ActivityIndicator size="large" color={kidsColors.grass} />
                <Text style={styles.loadingText}>Counting up everyone's miles...</Text>
            </View>
        );
    }

    const top3 = entries.slice(0, 3);
    const rest = entries.slice(3);
    // 2nd-1st-3rd visual order, same podium convention as the adult screen.
    const podiumOrder = top3.length === 3
        ? [top3[1], top3[0], top3[2]]
        : top3.length === 2
            ? [top3[1], top3[0]]
            : top3;
    const podiumHeights = top3.length === 3 ? [86, 118, 68] : top3.length === 2 ? [86, 118] : [118];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: kidsColors.bg }} contentContainerStyle={{ paddingBottom: 90, paddingTop: kidsSpacing.lg }} showsVerticalScrollIndicator={false}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <GlobeMascot pose="cheer" size={70} />
                <View style={{ marginLeft: kidsSpacing.md }}>
                    <Text style={styles.title}>Ranks</Text>
                    <Text style={styles.subtitle}>See how you're doing!</Text>
                </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
                {classTabs.map((group) => {
                    const active = activeGroup === group.id;
                    return (
                        <Pressable
                            key={group.id}
                            onPress={() => setActiveGroup(group.id)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                            style={[styles.tab, active && styles.tabActive]}
                        >
                            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{group.label}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {groupsError && <Text style={styles.errorText}>Couldn&apos;t load your classes: {groupsError}</Text>}

            {top3.length > 0 && (
                <View style={styles.podiumRow}>
                    {podiumOrder.map((entry, i) => (
                        <View key={entry.id} style={styles.podiumSlot}>
                            <Text style={styles.podiumName} numberOfLines={1}>{entry.name}</Text>
                            <View style={[styles.avatarRing, { borderColor: MEDAL_BG[entry.rank - 1] }]}>
                                <Image source={entry.profilePicture} style={styles.avatar} contentFit="cover" />
                            </View>
                            <View style={[styles.podiumBase, { backgroundColor: MEDAL_BG[entry.rank - 1], height: podiumHeights[i] }]}>
                                <Text style={styles.podiumEmoji}>{MEDAL_EMOJI[entry.rank - 1] ?? `#${entry.rank}`}</Text>
                                <Text style={styles.podiumScore}>{entry.score.toLocaleString()} mi</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {rest.length > 0 && (
                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.lg }}>
                    {rest.map((entry) => (
                        <View key={entry.id} style={[styles.row, entry.isCurrentUser && styles.rowHighlighted]}>
                            <Text style={styles.rowRank}>#{entry.rank}</Text>
                            <View style={styles.rowAvatarRing}>
                                <Image source={entry.profilePicture} style={styles.rowAvatar} contentFit="cover" />
                            </View>
                            <Text style={styles.rowName} numberOfLines={1}>{entry.name}{entry.isCurrentUser ? ' (You!)' : ''}</Text>
                            <Text style={styles.rowScore}>{entry.score.toLocaleString()} mi</Text>
                        </View>
                    ))}
                </View>
            )}

            {entries.length === 0 && (
                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.lg }}>
                    <KidsCard>
                        <View style={{ alignItems: 'center', paddingVertical: kidsSpacing.md }}>
                            <GlobeMascot pose="think" size={64} />
                            <Text style={styles.emptyText}>Nobody here yet — join a class to see your friends!</Text>
                        </View>
                    </KidsCard>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.subink, marginTop: kidsSpacing.sm },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: kidsSpacing.lg },
    title: { fontFamily: kidsFonts.display, fontSize: 24, color: kidsColors.ink },
    subtitle: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.subink, marginTop: 2 },
    tabsRow: { paddingHorizontal: kidsSpacing.lg, gap: kidsSpacing.sm, marginTop: kidsSpacing.lg },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: kidsRadius.pill,
        backgroundColor: kidsColors.surface,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
    },
    tabActive: { backgroundColor: kidsColors.grass, borderColor: kidsColors.grassDeep },
    tabLabel: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.subink },
    tabLabelActive: { color: kidsColors.white },
    errorText: { fontFamily: kidsFonts.bodyRegular, fontSize: 12, color: kidsColors.subink, textAlign: 'center', marginTop: kidsSpacing.sm, paddingHorizontal: kidsSpacing.lg },
    podiumRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: kidsSpacing.md,
        marginTop: kidsSpacing.xl,
        paddingHorizontal: kidsSpacing.lg,
    },
    podiumSlot: { alignItems: 'center', width: 92 },
    podiumName: { fontFamily: kidsFonts.body, fontSize: 12, color: kidsColors.ink, marginBottom: kidsSpacing.sm },
    avatarRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 4, padding: 2, backgroundColor: kidsColors.surface, marginBottom: -18, zIndex: 2 },
    avatar: { width: '100%', height: '100%', borderRadius: 24 },
    podiumBase: {
        width: '100%',
        borderTopLeftRadius: kidsRadius.md,
        borderTopRightRadius: kidsRadius.md,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: kidsSpacing.sm,
        paddingTop: 22,
    },
    podiumEmoji: { fontSize: 24 },
    podiumScore: { fontFamily: kidsFonts.display, fontSize: 12, color: kidsColors.ink, marginTop: 2 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: kidsColors.surface,
        borderRadius: kidsRadius.lg,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
        padding: kidsSpacing.sm,
        marginBottom: kidsSpacing.sm,
    },
    rowHighlighted: { borderColor: kidsColors.grass, backgroundColor: kidsColors.grassBright + '22' },
    rowRank: { fontFamily: kidsFonts.display, fontSize: 13, color: kidsColors.subink, width: 30, textAlign: 'center' },
    rowAvatarRing: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: kidsColors.bg, marginRight: kidsSpacing.sm },
    rowAvatar: { width: '100%', height: '100%' },
    rowName: { flex: 1, fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.ink },
    rowScore: { fontFamily: kidsFonts.display, fontSize: 13, color: kidsColors.grass },
    emptyText: { fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.subink, textAlign: 'center', marginTop: kidsSpacing.md },
});
