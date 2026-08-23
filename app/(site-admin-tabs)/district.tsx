// app/(site-admin-tabs)/district.tsx
// Every OTHER school in the Site Administrator's district, one aggregate
// summary row each -- the exact same one-line total a teacher already sees
// for schools that aren't their own (app/(teacher-tabs)/reports.tsx's
// District Map tab). Never a class or student breakdown here -- that level
// of detail is reserved for the admin's own school (the My School tab).

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, type Theme } from '../../commonStyles';
import { fetchDistrictSchoolTotals, type DistrictSchoolTotal } from '../../lib/siteAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

// One row in the rendered list: either a real DistrictSchoolTotal, or a
// zero-participation invitation pulled from schools_registry when nothing
// in the district totals matched that school's name yet.
type DistrictRow = DistrictSchoolTotal & { isEmptyInvitation?: boolean };

export default function SiteAdminDistrict() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [districtName, setDistrictName] = useState('Your District');
    const [rows, setRows] = useState<DistrictRow[]>([]);

    const loadDistrict = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('school_name, district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setDistrictName(profile?.school_district_name || 'Your District');
            const districtId = profile?.district_id || '';
            const mySchool = (profile?.school_name || '').trim().toLowerCase();
            if (!districtId) {
                setRows([]);
                return;
            }

            const [totals, registryResult] = await Promise.all([
                fetchDistrictSchoolTotals(districtId),
                supabase
                    .from('schools_registry')
                    .select('school_name')
                    .eq('district_id', districtId)
                    .order('school_name', { ascending: true }),
            ]);

            if (registryResult.error) throw registryResult.error;

            const totalsByName = new Map(totals.map((t) => [t.schoolName.trim().toLowerCase(), t]));

            // Same merge pattern as (teacher-tabs)/reports.tsx's District
            // Map and (admin-tabs)/schools.tsx: start from the FULL
            // registry of known schools (so a school with zero app usage
            // still shows up, as an invitation to recruit it), then attach
            // whatever real totals matched -- excluding this admin's own
            // school, which lives on the My School tab instead.
            const registryRows = registryResult.data || [];
            const merged: DistrictRow[] = registryRows
                .filter((r) => (r.school_name || '').trim().toLowerCase() !== mySchool)
                .map((r) => {
                    const key = (r.school_name || '').trim().toLowerCase();
                    const match = totalsByName.get(key);
                    if (match) {
                        totalsByName.delete(key);
                        return match;
                    }
                    return { schoolName: r.school_name, totalMiles: 0, memberCount: 0, isEmptyInvitation: true };
                });

            // Any school with real totals that never matched a registry
            // entry (a school_name typed on a class that doesn't exactly
            // match the registry) still needs to show up, unless it's this
            // admin's own school.
            for (const [key, total] of totalsByName) {
                if (key !== mySchool) merged.push(total);
            }

            merged.sort((a, b) => b.memberCount - a.memberCount || a.schoolName.localeCompare(b.schoolName));
            setRows(merged);
        } catch (err: any) {
            showAlert('Load Error', err.message || 'Could not load district data.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadDistrict();
        }, [loadDistrict])
    );

    const onRefresh = () => {
        setRefreshing(true);
        void loadDistrict();
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
                <Text style={[styles.kicker, { color: theme.accent }]}>DISTRICT MAP</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    Every other school in your district, as an aggregate — the same summary a teacher sees for a school that isn’t their own. Your own school’s detail lives on the My School tab.
                </Text>

                {rows.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>No other schools found in your district yet.</Text>
                ) : (
                    <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                        {rows.map((school, idx) => (
                            <View
                                key={school.schoolName}
                                style={[styles.schoolRow, idx < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                            >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                    <Text style={[styles.schoolName, { color: theme.text }]}>{school.schoolName}</Text>
                                    {school.isEmptyInvitation ? (
                                        <Text style={styles.invitationText}>No active users yet 🚀 A great candidate for outreach</Text>
                                    ) : (
                                        <Text style={[styles.schoolMeta, { color: theme.subtext }]}>
                                            {school.memberCount} student{school.memberCount === 1 ? '' : 's'} participating
                                        </Text>
                                    )}
                                </View>
                                <Text style={[styles.schoolMiles, { color: school.isEmptyInvitation ? theme.border : theme.accent }]}>
                                    {formatMiles(school.totalMiles)} mi
                                </Text>
                            </View>
                        ))}
                    </View>
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
    emptyText: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    listCard: {
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 16,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 2,
    },
    schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    schoolName: { fontSize: 15, fontWeight: '700' },
    schoolMeta: { fontSize: 12, marginTop: 2 },
    // Matches the exact "recruit" tone/color already used for this
    // situation in (teacher-tabs)/reports.tsx and (admin-tabs)/schools.tsx.
    invitationText: { fontSize: 12, color: '#E07A5F', fontWeight: '600', marginTop: 2 },
    schoolMiles: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia' },
});
