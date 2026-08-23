// app/(admin-tabs)/schools.tsx
// District Admin drill-down: every school in the district (including ones
// with zero participants yet, pulled from schools_registry — same
// "recruit" signal as the teacher Reports screen's District Map tab), each
// expandable to its own classes. Class is the finest granularity shown —
// no student names, ids, or per-student rows anywhere on this screen.

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
import { colors, Theme } from '../../commonStyles';
import TourTarget from '../../components/tour/TourTarget';
import { fetchDistrictAdminClassReport, groupBySchool, type SchoolReportGroup } from '../../lib/districtAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

function pct(numerator: number, denominator: number): string {
    if (denominator <= 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

export default function AdminSchools() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [districtName, setDistrictName] = useState('Your District');
    const [schoolGroups, setSchoolGroups] = useState<SchoolReportGroup[]>([]);
    const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadSchools = useCallback(async () => {
        try {
            setErrorMessage(null);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setDistrictName(profile?.school_district_name || 'Your District');
            const districtId = profile?.district_id || '';
            if (!districtId) {
                setSchoolGroups([]);
                return;
            }

            const [rows, registryResult] = await Promise.all([
                fetchDistrictAdminClassReport(districtId),
                supabase
                    .from('schools_registry')
                    .select('school_name')
                    .eq('district_id', districtId)
                    .order('school_name', { ascending: true }),
            ]);

            if (registryResult.error) throw registryResult.error;

            const activeGroups = groupBySchool(rows);
            const groupsByNormalizedName = new Map(activeGroups.map((g) => [g.schoolName.trim().toLowerCase(), g]));

            // Same merge pattern as reports.tsx's District Map tab: start
            // from the FULL registry of known schools (so a school with
            // zero app usage still shows up, as an invitation to recruit
            // it), then attach whatever real class/fitness data matched.
            const registryRows = registryResult.data || [];
            const merged: SchoolReportGroup[] = registryRows.map((r) => {
                const match = groupsByNormalizedName.get((r.school_name || '').trim().toLowerCase());
                if (match) {
                    groupsByNormalizedName.delete((r.school_name || '').trim().toLowerCase());
                    return match;
                }
                return {
                    schoolName: r.school_name,
                    classes: [],
                    memberCount: 0,
                    totalMiles: 0,
                    fitnessEntries: 0,
                    fitnessTargetsMet: 0,
                    fitnessParticipants: 0,
                    walkLogEntries: 0,
                    isEmptyInvitation: true,
                };
            });
            // Any school with real class data that never matched a
            // registry entry (a school_name typed on a class that doesn't
            // exactly match the registry) still needs to show up.
            merged.push(...groupsByNormalizedName.values());

            merged.sort((a, b) => b.memberCount - a.memberCount || a.schoolName.localeCompare(b.schoolName));
            setSchoolGroups(merged);
        } catch (err: any) {
            setErrorMessage(err?.message || 'Could not load school data.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadSchools();
        }, [loadSchools])
    );

    const onRefresh = () => {
        setRefreshing(true);
        void loadSchools();
    };

    const toggleSchool = (schoolName: string) => {
        setExpandedSchools((prev) => {
            const next = new Set(prev);
            if (next.has(schoolName)) next.delete(schoolName);
            else next.add(schoolName);
            return next;
        });
    };

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
                <Text style={[styles.kicker, { color: theme.accent }]}>SCHOOLS &amp; CLASSES</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    Tap a school to see its classes. Every total here is a class or school aggregate — never an individual student.
                </Text>

                {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                {schoolGroups.length === 0 ? (
                    <Text style={styles.emptyText}>No schools found for your district yet.</Text>
                ) : (
                    schoolGroups.map((school, schoolIndex) => {
                        const isExpanded = expandedSchools.has(school.schoolName);
                        const headerRow = (
                            <Pressable
                                style={[styles.schoolRow, { borderBottomColor: theme.border }]}
                                onPress={() => toggleSchool(school.schoolName)}
                                accessibilityRole="button"
                                accessibilityState={{ expanded: isExpanded }}
                                aria-expanded={isExpanded}
                            >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                    <Text style={[styles.schoolName, { color: theme.text }]}>
                                        {isExpanded ? '▾' : '▸'} {school.schoolName}
                                    </Text>
                                    {school.isEmptyInvitation ? (
                                        <Text style={styles.invitationText}>No active classes yet 🚀 A great candidate for outreach</Text>
                                    ) : (
                                        <Text style={[styles.schoolMeta, { color: theme.subtext }]}>
                                            {school.memberCount} student{school.memberCount === 1 ? '' : 's'} · {school.classes.length} class{school.classes.length === 1 ? '' : 'es'} · {pct(school.fitnessParticipants, school.memberCount)} fitness participation
                                        </Text>
                                    )}
                                </View>
                                <Text style={[styles.schoolMiles, { color: school.isEmptyInvitation ? theme.border : theme.accent }]}>
                                    {formatMiles(school.totalMiles)} mi
                                </Text>
                            </Pressable>
                        );
                        return (
                            <View key={school.schoolName} style={{ marginBottom: 4 }}>
                                {schoolIndex === 0 ? <TourTarget id="admin.schoolRow">{headerRow}</TourTarget> : headerRow}

                                {isExpanded && (
                                    <View style={{ paddingLeft: 12, paddingBottom: 12 }}>
                                        {school.classes.length === 0 ? (
                                            <Text style={styles.emptyText}>No classes reporting at this school yet.</Text>
                                        ) : (
                                            school.classes
                                                .slice()
                                                .sort((a, b) => b.memberCount - a.memberCount)
                                                .map((c) => (
                                                    <View key={c.classId} style={[styles.classCard, { borderColor: theme.border, backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
                                                        <View style={styles.classHeader}>
                                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                                <Text style={[styles.className, { color: theme.text }]}>{c.className}</Text>
                                                                <Text style={[styles.classMeta, { color: theme.subtext }]}>Taught by {c.teacherName}</Text>
                                                            </View>
                                                            <Text style={[styles.classMiles, { color: theme.accent }]}>{formatMiles(c.totalMiles)} mi</Text>
                                                        </View>
                                                        <View style={[styles.classStatsRow, { borderTopColor: theme.border }]}>
                                                            <Text style={[styles.classStat, { color: theme.subtext }]}>{c.memberCount} student{c.memberCount === 1 ? '' : 's'}</Text>
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
                    })
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
    emptyText: { color: theme.subtext, fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    schoolName: { fontSize: 15, fontWeight: '700' },
    schoolMeta: { fontSize: 12, marginTop: 2 },
    invitationText: { fontSize: 12, color: '#E07A5F', fontWeight: '600', marginTop: 2 },
    schoolMiles: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia' },
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
    className: { fontSize: 14, fontWeight: '700' },
    classMeta: { fontSize: 12, marginTop: 2 },
    classMiles: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia' },
    classStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
    classStat: { fontSize: 11, fontWeight: '600' },
});
