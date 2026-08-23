// app/(admin-tabs)/reports.tsx
// District Admin PDF export: a single printable district-wide report --
// district totals, then one summary row per school, then one table per
// school listing its classes -- built the same way teacher reports.tsx
// builds its gradebook PDF (a self-contained HTML string handed to
// expo-print, with a separate web-window-print path since expo-print's web
// implementation just calls window.print() on whatever's currently on
// screen). Never includes a student name, id, or row -- class is the
// finest granularity in this export, matching every other screen in this
// shell.

import * as Print from 'expo-print';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native';
import { colors, Theme } from '../../commonStyles';
import TourTarget from '../../components/tour/TourTarget';
import {
    computeDistrictTotals,
    fetchDistrictAdminClassReport,
    groupBySchool,
    type ClassReportRow,
    type SchoolReportGroup
} from '../../lib/districtAdmin';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

function pct(numerator: number, denominator: number): string {
    if (denominator <= 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

export default function AdminReports() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [districtName, setDistrictName] = useState('Your District');
    const [rows, setRows] = useState<ClassReportRow[]>([]);
    const [schoolGroups, setSchoolGroups] = useState<SchoolReportGroup[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadData = useCallback(async () => {
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
                setRows([]);
                setSchoolGroups([]);
                return;
            }

            const classRows = await fetchDistrictAdminClassReport(districtId);
            setRows(classRows);
            setSchoolGroups(groupBySchool(classRows));
        } catch (err: any) {
            setErrorMessage(err?.message || 'Could not load report data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadData();
        }, [loadData])
    );

    const handleExportPDF = async () => {
        if (rows.length === 0) return;
        try {
            setExporting(true);
            const totals = computeDistrictTotals(rows);

            const schoolRowsHtml = schoolGroups
                .slice()
                .sort((a, b) => b.memberCount - a.memberCount)
                .map((s) => `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px; font-weight: bold;">${s.schoolName}</td>
                        <td style="padding: 10px; text-align: center;">${s.classes.length}</td>
                        <td style="padding: 10px; text-align: center;">${s.memberCount}</td>
                        <td style="padding: 10px; text-align: right;">${formatMiles(s.totalMiles)} mi</td>
                        <td style="padding: 10px; text-align: center;">${pct(s.fitnessParticipants, s.memberCount)}</td>
                        <td style="padding: 10px; text-align: center;">${s.fitnessEntries > 0 ? pct(s.fitnessTargetsMet, s.fitnessEntries) : '—'}</td>
                    </tr>
                `).join('');

            const schoolSectionsHtml = schoolGroups
                .slice()
                .sort((a, b) => b.memberCount - a.memberCount)
                .map((s) => {
                    const classRowsHtml = s.classes
                        .slice()
                        .sort((a, b) => b.memberCount - a.memberCount)
                        .map((c) => `
                            <tr style="border-bottom: 1px solid #ddd;">
                                <td style="padding: 8px; font-weight: bold;">${c.className}</td>
                                <td style="padding: 8px; color:#666;">${c.teacherName}</td>
                                <td style="padding: 8px; text-align: center;">${c.memberCount}</td>
                                <td style="padding: 8px; text-align: right;">${formatMiles(c.totalMiles)} mi</td>
                                <td style="padding: 8px; text-align: center;">${pct(c.fitnessParticipants, c.memberCount)}</td>
                                <td style="padding: 8px; text-align: center;">${c.fitnessEntries > 0 ? `${c.fitnessTargetsMet}/${c.fitnessEntries}` : '—'}</td>
                            </tr>
                        `).join('');

                    return `
                        <h3>${s.schoolName}</h3>
                        <table>
                            <thead>
                                <tr><th>Class</th><th>Teacher</th><th style="text-align:center;">Students</th><th style="text-align:right;">Miles</th><th style="text-align:center;">Fitness Participation</th><th style="text-align:center;">Targets Met</th></tr>
                            </thead>
                            <tbody>${classRowsHtml || `<tr><td colspan="6" style="padding:10px; color:#999; font-style:italic;">No classes reporting at this school yet.</td></tr>`}</tbody>
                        </table>
                    `;
                }).join('');

            const htmlContent = `
                <html>
                    <head><style>body{font-family:sans-serif; padding:20px;} table{width:100%; border-collapse:collapse; margin-bottom: 20px;} th{background:#f4f4f4; padding:8px; text-align:left; font-size:12px;} h2{margin-bottom:4px;} h3{margin-top:24px; margin-bottom:8px; color:#4E3629;}</style></head>
                    <body>
                        <h2>District Fitness &amp; Activity Report</h2>
                        <p><b>District:</b> ${districtName} &middot; <b>Date:</b> ${new Date().toLocaleDateString()}</p>
                        <p style="font-size:12px; color:#666;">Every figure below is a class, school, or district aggregate — this report contains no individual student names or ids.</p>

                        <h3 style="margin-top:0;">District Totals</h3>
                        <table>
                            <thead><tr><th>Schools Reporting</th><th>Active Classes</th><th>Students Participating</th><th>Total Miles</th><th>Fitness Participation</th><th>Fitness Targets Met</th></tr></thead>
                            <tbody>
                                <tr>
                                    <td style="padding:10px;">${totals.schoolCount}</td>
                                    <td style="padding:10px;">${totals.classCount}</td>
                                    <td style="padding:10px;">${totals.studentCount}</td>
                                    <td style="padding:10px;">${formatMiles(totals.totalMiles)} mi</td>
                                    <td style="padding:10px;">${pct(totals.fitnessParticipants, totals.studentCount)}</td>
                                    <td style="padding:10px;">${totals.fitnessEntries > 0 ? pct(totals.fitnessTargetsMet, totals.fitnessEntries) : '—'}</td>
                                </tr>
                            </tbody>
                        </table>

                        <h3>Schools Overview</h3>
                        <table>
                            <thead><tr><th>School</th><th style="text-align:center;">Classes</th><th style="text-align:center;">Students</th><th style="text-align:right;">Miles</th><th style="text-align:center;">Fitness Participation</th><th style="text-align:center;">Targets Met</th></tr></thead>
                            <tbody>${schoolRowsHtml || `<tr><td colspan="6" style="padding:10px; color:#999; font-style:italic;">No schools reporting yet.</td></tr>`}</tbody>
                        </table>

                        ${schoolSectionsHtml}
                    </body>
                </html>
            `;

            if (Platform.OS === 'web') {
                // See app/(teacher-tabs)/reports.tsx for why this opens a
                // separate window rather than calling Print.printAsync
                // directly: expo-print's web implementation just calls the
                // browser's window.print() on whatever's currently on
                // screen, tab bar included, unless the report HTML is
                // printed from its own window.
                const printWindow = window.open('', '_blank');
                if (!printWindow) {
                    throw new Error('Could not open the print window. Check if your browser is blocking pop-ups for this site.');
                }
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => printWindow.print(), 250);
            } else {
                await Print.printAsync({ html: htmlContent });
            }
        } catch (error: any) {
            if (Platform.OS === 'web') {
                window.alert(`Export Failed: ${error.message}`);
            } else {
                Alert.alert('Export Failed', error.message);
            }
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    const totals = computeDistrictTotals(rows);

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.kicker, { color: theme.accent }]}>DISTRICT REPORT</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    Export a printable summary of Presidential Fitness Test completion and activity across every school in your district.
                </Text>

                {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                <View style={[styles.previewCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                    <Text style={[styles.previewHeading, { color: theme.text }]}>Report will include</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext }]}>• District totals: schools, classes, students, miles, fitness participation and pass rate</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext }]}>• One summary row per school ({schoolGroups.length} school{schoolGroups.length === 1 ? '' : 's'})</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext }]}>• One table per school listing its classes ({totals.classCount} class{totals.classCount === 1 ? '' : 'es'} total)</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext, fontStyle: 'italic', marginTop: 8 }]}>No student names, ids, or per-student rows are included anywhere in this export.</Text>
                </View>

                <TourTarget id="admin.exportButton">
                    <Pressable
                        style={({ pressed }) => [styles.exportButton, { backgroundColor: theme.accent, opacity: pressed || exporting || rows.length === 0 ? 0.7 : 1 }]}
                        onPress={() => void handleExportPDF()}
                        disabled={exporting || rows.length === 0}
                        accessibilityRole="button"
                    >
                        <Text style={styles.exportButtonText}>{exporting ? 'Generating Report...' : 'Export District Report PDF'}</Text>
                    </Pressable>
                </TourTarget>
                {rows.length === 0 && (
                    <Text style={styles.emptyText}>No class data reporting in your district yet — nothing to export.</Text>
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
    previewCard: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 24, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
    previewHeading: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 10 },
    previewLine: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
    exportButton: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    exportButtonText: { color: theme.accentText, fontSize: 15, fontWeight: '700' },
    emptyText: { color: theme.subtext, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 14 },
});
