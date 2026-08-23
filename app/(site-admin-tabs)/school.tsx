// app/(site-admin-tabs)/school.tsx
// Site Administrator's own school: district-admin-style class rollups
// (member count, total miles, fitness targets met) PLUS a per-student
// drill-down inside each class -- exactly two numbers per student (miles
// walked, Presidential Fitness Test targets met). Never a quiz score, a
// raw activity-log entry, or anything else about an individual student.

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, type Theme } from '../../commonStyles';
import TourTarget from '../../components/tour/TourTarget';
import { fetchSiteAdminSchoolReport, groupByClass, type SiteAdminClassGroup } from '../../lib/siteAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// react-native-web's Alert.alert() is a complete no-op (see
// lib/confirmAlert.ts) -- a plain info/error Alert.alert(...) call here
// would silently do nothing on web.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

function pct(numerator: number, denominator: number): string {
    if (denominator <= 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

function StatTile({ label, value, theme, accentValue }: { label: string; value: string; theme: Theme; accentValue?: boolean }) {
    const styles = getStyles(theme);
    return (
        <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
            <Text style={[styles.statValue, { color: accentValue ? theme.accent : theme.text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: theme.subtext }]}>{label}</Text>
        </View>
    );
}

export default function SiteAdminSchool() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [schoolName, setSchoolName] = useState('Your School');
    const [districtName, setDistrictName] = useState('Your District');
    const [classes, setClasses] = useState<SiteAdminClassGroup[]>([]);
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

    const loadSchool = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('school_name, district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setSchoolName(profile?.school_name || 'Your School');
            setDistrictName(profile?.school_district_name || 'Your District');

            const districtId = profile?.district_id || '';
            const school = profile?.school_name || '';
            if (!districtId || !school) {
                setClasses([]);
                return;
            }

            const rows = await fetchSiteAdminSchoolReport(school, districtId);
            setClasses(groupByClass(rows));
        } catch (err: any) {
            showAlert('Load Error', err.message || 'Could not load your school.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadSchool();
        }, [loadSchool])
    );

    const onRefresh = () => {
        setRefreshing(true);
        void loadSchool();
    };

    function toggleClass(classId: string) {
        setExpandedClasses((prev) => {
            const next = new Set(prev);
            if (next.has(classId)) next.delete(classId);
            else next.add(classId);
            return next;
        });
    }

    const totalStudents = classes.reduce((sum, c) => sum + c.memberCount, 0);
    const totalMiles = classes.reduce((sum, c) => sum + c.totalMiles, 0);
    const totalFitnessEntries = classes.reduce((sum, c) => sum + c.fitnessEntries, 0);
    const totalFitnessTargetsMet = classes.reduce((sum, c) => sum + c.fitnessTargetsMet, 0);

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
                <Text style={[styles.kicker, { color: theme.accent }]}>MY SCHOOL</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{schoolName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    {districtName} · Tap a class to see each student’s miles walked and Presidential Fitness Test targets met.
                </Text>

                {classes.length === 0 ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.emptyTitle, { color: theme.text }]}>No participating classes yet</Text>
                        <Text style={[styles.emptyBody, { color: theme.subtext }]}>
                            Once teachers at {schoolName} create classes and students join, your school’s totals will appear here automatically.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.statGrid}>
                            <StatTile label="Classes" value={String(classes.length)} theme={theme} />
                            <StatTile label="Students" value={String(totalStudents)} theme={theme} />
                            <StatTile label="Total Miles Walked" value={formatMiles(totalMiles)} theme={theme} accentValue />
                            <StatTile label="Fitness Targets Met" value={pct(totalFitnessTargetsMet, totalFitnessEntries)} theme={theme} accentValue />
                        </View>

                        <Text style={[styles.sectionHeading, { color: theme.subtext }]} accessibilityRole="header">CLASSES</Text>

                        {classes.map((cls, classIndex) => {
                            const isExpanded = expandedClasses.has(cls.classId);
                            const headerRow = (
                                <Pressable
                                    style={styles.classHeaderRow}
                                    onPress={() => toggleClass(cls.classId)}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: isExpanded }}
                                    aria-expanded={isExpanded}
                                >
                                    <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.subtext} />
                                    <View style={{ flex: 1, paddingHorizontal: 10 }}>
                                        <Text style={[styles.className, { color: theme.text }]}>{cls.className}</Text>
                                        <Text style={[styles.classMeta, { color: theme.subtext }]}>
                                            Taught by {cls.teacherName} · {cls.memberCount} student{cls.memberCount === 1 ? '' : 's'} · {pct(cls.fitnessTargetsMet, cls.fitnessEntries)} fitness targets met
                                        </Text>
                                    </View>
                                    <Text style={[styles.classMiles, { color: theme.accent }]}>{formatMiles(cls.totalMiles)} mi</Text>
                                </Pressable>
                            );
                            return (
                                <View key={cls.classId} style={[styles.classCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                                    {classIndex === 0 ? <TourTarget id="site_admin.classRow">{headerRow}</TourTarget> : headerRow}

                                    {isExpanded && (
                                        <View style={[styles.studentList, { borderTopColor: theme.border }]}>
                                            {cls.students
                                                .slice()
                                                .sort((a, b) => a.studentName.localeCompare(b.studentName))
                                                .map((student) => (
                                                    <View key={student.studentId} style={[styles.studentRow, { borderBottomColor: theme.border }]}>
                                                        <Text style={[styles.studentName, { color: theme.text }]}>{student.studentName}</Text>
                                                        <View style={styles.studentStats}>
                                                            <Text style={[styles.studentStat, { color: theme.text }]}>{formatMiles(student.totalMiles)} mi</Text>
                                                            <Text style={[styles.studentStat, { color: theme.subtext }]}>
                                                                {student.fitnessTargetsMet}/{student.fitnessEntries} fitness targets met
                                                            </Text>
                                                        </View>
                                                    </View>
                                                ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
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
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    statTile: { flexGrow: 1, minWidth: '30%', borderWidth: 1, borderRadius: 16, padding: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
    statValue: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '800' },
    statLabel: { fontSize: 11, fontWeight: '600', marginTop: 4, lineHeight: 14 },
    sectionHeading: { fontSize: 11, letterSpacing: 1, fontWeight: '800', marginBottom: 12, textTransform: 'uppercase' },
    classCard: {
        borderWidth: 1,
        borderRadius: 16,
        marginBottom: 10,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    classHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    className: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    classMeta: { fontSize: 12, marginTop: 2 },
    classMiles: { fontSize: 15, fontWeight: '800', fontFamily: 'Georgia' },
    studentList: { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 6 },
    studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
    studentName: { fontSize: 13.5, fontWeight: '600', flex: 1, paddingRight: 8 },
    studentStats: { alignItems: 'flex-end' },
    studentStat: { fontSize: 12, fontWeight: '600' },
    emptyCard: { borderWidth: 1, borderRadius: 16, padding: 20 },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6, fontFamily: 'Georgia' },
    emptyBody: { fontSize: 13, lineHeight: 19 },
});
