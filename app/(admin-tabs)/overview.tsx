// app/(admin-tabs)/overview.tsx
// District Admin landing screen: district-wide KPI cards (schools, classes,
// students, miles walked, Presidential Fitness Test participation/pass
// rate) plus a "Top Schools" leaderboard, all aggregated server-side by
// get_district_admin_class_report (lib/districtAdmin.ts) — never a single
// student name or row. Same aggregate-only contract as the teacher Reports
// screen's "District Map" tab, one level up: a district admin sees every
// school in their own district, a teacher only ever sees their own.

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
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
    groupBySchool,
    type SchoolReportGroup
} from '../../lib/districtAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

function pct(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
}

// A single KPI tile — the district-level equivalent of a stat card. Reused
// 6 times below, so its own small component rather than repeated JSX.
function StatTile({ label, value, theme, accentValue }: { label: string; value: string; theme: Theme; accentValue?: boolean }) {
    const styles = getStyles(theme);
    return (
        <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
            <Text style={[styles.statValue, { color: accentValue ? theme.accent : theme.text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: theme.subtext }]}>{label}</Text>
        </View>
    );
}

export default function AdminOverview() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [districtName, setDistrictName] = useState('Your District');
    const [adminName, setAdminName] = useState('');
    const [schoolGroups, setSchoolGroups] = useState<SchoolReportGroup[]>([]);
    const [totals, setTotals] = useState(computeDistrictTotals([]));
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadOverview = useCallback(async () => {
        try {
            setErrorMessage(null);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('display_name, username, district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setAdminName(profile?.display_name || profile?.username || '');
            setDistrictName(profile?.school_district_name || 'Your District');

            const districtId = profile?.district_id || '';
            if (!districtId) {
                setSchoolGroups([]);
                setTotals(computeDistrictTotals([]));
                return;
            }

            const rows = await fetchDistrictAdminClassReport(districtId);
            setSchoolGroups(groupBySchool(rows));
            setTotals(computeDistrictTotals(rows));
        } catch (err: any) {
            setErrorMessage(err?.message || 'Could not load district data.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadOverview();
        }, [loadOverview])
    );

    const onRefresh = () => {
        setRefreshing(true);
        void loadOverview();
    };

    const topSchools = [...schoolGroups].sort((a, b) => b.totalMiles - a.totalMiles).slice(0, 5);

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
                <Text style={[styles.kicker, { color: theme.accent }]}>DISTRICT OVERVIEW</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    {adminName ? `Signed in as ${adminName} · ` : ''}District/school/class-level totals only — no individual student data.
                </Text>

                {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                {totals.studentCount === 0 ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.emptyTitle, { color: theme.text }]}>No participating classes yet</Text>
                        <Text style={[styles.emptyBody, { color: theme.subtext }]}>
                            Once teachers in {districtName} create classes and students join, district-wide totals will appear here automatically.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.statGrid}>
                            <StatTile label="Schools Reporting" value={String(totals.schoolCount)} theme={theme} />
                            <StatTile label="Active Classes" value={String(totals.classCount)} theme={theme} />
                            <StatTile label="Students Participating" value={String(totals.studentCount)} theme={theme} />
                            <StatTile label="Total Miles Walked" value={formatMiles(totals.totalMiles)} theme={theme} accentValue />
                            <StatTile label="Fitness Test Participation" value={pct(totals.fitnessParticipationRate)} theme={theme} accentValue />
                            <StatTile label="Fitness Targets Met" value={pct(totals.fitnessPassRate)} theme={theme} />
                        </View>

                        <Text style={[styles.sectionHeading, { color: theme.subtext }]} accessibilityRole="header">
                            TOP SCHOOLS BY PARTICIPATION
                        </Text>
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
                                    <Text style={[styles.schoolMiles, { color: theme.accent }]}>{formatMiles(school.totalMiles)} mi</Text>
                                </View>
                            ))}
                        </View>
                        <Text style={[styles.hintText, { color: theme.subtext }]}>
                            See every school in the district — including ones with no participants yet — on the Schools tab.
                        </Text>
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
    errorText: { color: theme.error, fontSize: 13, marginBottom: 16 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
    // minWidth: '31%' with a 12px gap fits 3 tiles per row on a typical
    // phone width while wrapping cleanly to 2 on narrower screens — same
    // flexWrap-based grid trick signup.tsx's grade-tier picker uses.
    statTile: { flexGrow: 1, minWidth: '30%', borderWidth: 1, borderRadius: 16, padding: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
    statValue: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '800' },
    statLabel: { fontSize: 11, fontWeight: '600', marginTop: 4, lineHeight: 14 },
    sectionHeading: { fontSize: 11, letterSpacing: 1, fontWeight: '800', marginBottom: 12 },
    card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
    schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    schoolName: { fontSize: 15, fontWeight: '700' },
    schoolMeta: { fontSize: 12, marginTop: 2 },
    schoolMiles: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia' },
    hintText: { fontSize: 12, fontStyle: 'italic', marginTop: 12, textAlign: 'center' },
    emptyCard: { borderWidth: 1, borderRadius: 16, padding: 20 },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6, fontFamily: 'Georgia' },
    emptyBody: { fontSize: 13, lineHeight: 19 },
});
