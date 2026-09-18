// app/(kids-tabs)/fitness.tsx
// "My Walk" -- the elementary-student mileage log. The adult Fitness tab
// (`(tabs)/fitness.tsx`) is a much bigger "Advanced Student Journal":
// Presidential Fitness Test benchmark scoring against age/gender tables,
// multiple activity types/unit conversions, written reflections. None of
// that is age-appropriate or necessary for a K-5 audience walking real
// miles toward a trail -- this screen keeps exactly the one loop that
// matters here: log how far you walked, see it added to your trail, feel
// good about it. It shares the same `activity_logs` table and
// `logMilesActivity`/`fetchStudentActivityLogs` functions as the adult
// screen, so every mile logged here counts identically toward the trail
// progress `(kids-tabs)/dashboard.tsx` and `(tabs)/dashboard.tsx` both show.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useBadgeUnlocks } from '../../components/BadgeUnlockProvider';
import ConfettiBurst from '../../components/ConfettiBurst';
import GlobeMascot, { type GlobeMascotPose } from '../../components/kids/GlobeMascot';
import { KidsButton, KidsCard, KidsIconBubble } from '../../components/kids/KidsPrimitives';
import MileageLogModal from '../../components/MileageLogModal';
import { fetchStudentActivityLogs, logMilesActivity, type ActivityLogEntry } from '../../lib/activity';
import { formatMiles } from '../../lib/trails';
import { kidsColors, kidsFonts, kidsModalTheme, kidsRadius, kidsSpacing } from '../../styles/kidsTheme';
import { supabase } from '../../utils/supabase';

function formatDay(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function KidsFitnessScreen() {
    const { refreshBadgeInbox } = useBadgeUnlocks();
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [activeTrailId, setActiveTrailId] = useState<string | null>(null);
    const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [celebrating, setCelebrating] = useState(false);
    const [mascotPose, setMascotPose] = useState<GlobeMascotPose>('idle');

    const loadData = useCallback(async () => {
        try {
            const { data: authData } = await supabase.auth.getUser();
            if (!authData?.user) return;
            setUserId(authData.user.id);

            const { data: profile } = await supabase
                .from('profiles')
                .select('active_trail_id')
                .eq('id', authData.user.id)
                .single();
            setActiveTrailId(profile?.active_trail_id ?? null);

            const entries = await fetchStudentActivityLogs(authData.user.id);
            setLogs(entries.slice(0, 12));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadData();
        }, [loadData])
    );

    const weekMiles = logs
        .filter((l) => Date.now() - new Date(l.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000)
        .reduce((sum, l) => sum + l.miles, 0);

    const handleSubmit = async (miles: number) => {
        if (!userId || !activeTrailId) return;
        await logMilesActivity({ userId, miles, trailId: activeTrailId });
        await refreshBadgeInbox();
        setMascotPose('cheer');
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 2200);
        setTimeout(() => setMascotPose('idle'), 3000);
        await loadData();
    };

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: kidsColors.bg }]}>
                <ActivityIndicator size="large" color={kidsColors.grass} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: kidsColors.bg }}>
            <StatusBar barStyle="dark-content" />
            {celebrating ? <ConfettiBurst key="fitness-celebrate" /> : null}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90, paddingTop: kidsSpacing.lg }}>
                <View style={styles.header}>
                    <GlobeMascot pose={mascotPose} size={72} />
                    <View style={{ flex: 1, marginLeft: kidsSpacing.md }}>
                        <Text style={styles.title}>My Walk</Text>
                        <Text style={styles.subtitle}>Every mile counts toward your trail!</Text>
                    </View>
                </View>

                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.lg }}>
                    <KidsCard>
                        <Text style={styles.statLabel}>Miles This Week</Text>
                        <Text style={styles.statValue}>{formatMiles(weekMiles)}</Text>
                    </KidsCard>
                </View>

                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.lg }}>
                    {activeTrailId ? (
                        <KidsButton label="Log My Walk" icon="🥾" variant="grass" onPress={() => setLogModalOpen(true)} />
                    ) : (
                        <KidsCard>
                            <Text style={styles.emptyText}>Pick a trail on the Home tab first, then come back to log your miles!</Text>
                        </KidsCard>
                    )}
                </View>

                <View style={{ marginTop: kidsSpacing.xl, paddingHorizontal: kidsSpacing.lg }}>
                    <Text style={styles.sectionTitle}>My Recent Walks</Text>
                    {logs.length === 0 ? (
                        <KidsCard>
                            <View style={{ alignItems: 'center', paddingVertical: kidsSpacing.md }}>
                                <GlobeMascot pose="point" size={64} />
                                <Text style={[styles.emptyText, { marginTop: kidsSpacing.md }]}>No walks logged yet — tap the big green button to add your first one!</Text>
                            </View>
                        </KidsCard>
                    ) : (
                        logs.map((log) => (
                            <View key={log.id} style={styles.logRow}>
                                <KidsIconBubble icon="🥾" variant="grass" size={40} />
                                <View style={{ flex: 1, marginLeft: kidsSpacing.md }}>
                                    <Text style={styles.logDay}>{formatDay(log.createdAt)}</Text>
                                </View>
                                <Text style={styles.logMiles}>+{formatMiles(log.miles)} mi</Text>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <MileageLogModal
                visible={logModalOpen}
                onSubmit={handleSubmit}
                onClose={() => setLogModalOpen(false)}
                accentColor={kidsColors.grass}
                title="How Far Did You Walk?"
                theme={kidsModalTheme}
                fontFamily={kidsFonts.display}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: kidsSpacing.lg },
    title: { fontFamily: kidsFonts.display, fontSize: 24, color: kidsColors.ink },
    subtitle: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.subink, marginTop: 2 },
    statLabel: { fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.subink },
    statValue: { fontFamily: kidsFonts.display, fontSize: 36, color: kidsColors.grass, marginTop: 4 },
    sectionTitle: { fontFamily: kidsFonts.display, fontSize: 16, color: kidsColors.ink, marginBottom: kidsSpacing.sm },
    emptyText: { fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.subink, textAlign: 'center', lineHeight: 20 },
    logRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: kidsColors.surface,
        borderRadius: kidsRadius.lg,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
        padding: kidsSpacing.md,
        marginBottom: kidsSpacing.sm,
    },
    logDay: { fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.ink },
    logMiles: { fontFamily: kidsFonts.display, fontSize: 15, color: kidsColors.grass },
});
