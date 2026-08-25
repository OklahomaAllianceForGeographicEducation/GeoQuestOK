// app/(admin-tabs)/reports.tsx
//
// ============================================================================
// FILE-LEVEL OVERVIEW (read this first if you're new to the codebase)
// ============================================================================
// WHAT IS A "ROUTE GROUP" / WHAT DOES `_layout.tsx` DO?
//   This file lives inside `app/(admin-tabs)/` -- a folder whose name is
//   wrapped in parentheses. In Expo Router (the file-based navigation system
//   this whole `app/` directory uses), a parenthesized folder name is a
//   "route group": it lets files be organized together on disk without that
//   folder name becoming part of the actual URL. So this screen is reachable
//   at `/reports`, not `/(admin-tabs)/reports`. The sibling file
//   `app/(admin-tabs)/_layout.tsx` is a special file Expo Router treats as a
//   shared wrapper/shell for every screen in this folder -- it renders the
//   bottom tab bar and registers this file as the "Reports" tab. See that
//   file for the fuller explanation.
//
// WHAT SCREEN IS THIS?
//   District Admin PDF export: a single printable district-wide report --
//   district totals, then one summary row per school, then one table per
//   school listing its classes -- built the same way teacher reports.tsx
//   builds its gradebook PDF (a self-contained HTML string handed to
//   expo-print, with a separate web-window-print path since expo-print's web
//   implementation just calls window.print() on whatever's currently on
//   screen). Never includes a student name, id, or row -- class is the
//   finest granularity in this export, matching every other screen in this
//   shell.
// ============================================================================

// `expo-print` is Expo's module for turning an HTML string into an actual
// printed page or PDF. On native (iOS/Android) it opens the OS's print/share
// sheet; the web behavior is handled manually below (see the `Platform.OS
// === 'web'` branch) because expo-print's web implementation just calls the
// browser's own `window.print()` on whatever HTML is currently in the page.
import * as Print from 'expo-print';
// `useFocusEffect` (from expo-router, which re-exports it from React
// Navigation) runs a callback every time this screen becomes the active/
// focused tab -- not just once on first mount like a plain `useEffect`. That
// matters here because switching away to another tab and back should
// refresh the report data in case something changed in the meantime.
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
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
import { showAlert } from '../../lib/confirmAlert';
import {
    computeDistrictTotals,
    fetchDistrictAdminClassReport,
    groupBySchool,
    type ClassReportRow,
    type SchoolReportGroup
} from '../../lib/districtAdmin';
// `escapeHtml` converts special HTML characters (like `<`, `>`, `&`) in
// user-entered text (school names, teacher names, etc.) into their safe
// HTML-entity equivalents before those strings get embedded into the raw
// HTML string used for the PDF. Without this, a school/teacher name
// containing something like `<script>` could corrupt the generated
// document's markup or (in a browser context) even run as code -- this is
// the same defensive escaping pattern used by every other PDF/HTML export
// screen in this app.
import { escapeHtml } from '../../lib/htmlExport';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// Small formatting helper: turns a numerator/denominator pair into a rounded
// whole-number percentage string (e.g. pct(3, 4) => "75%"). Guards against
// dividing by zero (e.g. a school with no students yet) by returning "0%"
// instead of NaN.
function pct(numerator: number, denominator: number): string {
    if (denominator <= 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

// The "Reports" tab's screen component for District Admins: loads this
// admin's district-wide class report data, shows a short "what's included"
// preview card, and lets them generate/print a full PDF report. Takes no
// props (rendered directly by the tab navigator); renders a loading
// spinner, then the preview + export UI once data is ready.
export default function AdminReports() {
    // `useColorScheme()` reads the OS's current light/dark mode preference;
    // it can briefly be `null` before the OS reports a value, so `?? 'light'`
    // gives a safe default. `theme` is then the matching color palette
    // object, and `styles` is built from it below so every themed color used
    // in this screen automatically follows dark mode.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // `loading`: true until the very first data fetch below finishes --
    // gates the whole screen behind a spinner so nothing renders with
    // stale/blank values.
    const [loading, setLoading] = useState(true);
    // `exporting`: true only while a PDF is actively being generated --
    // disables the export button and swaps its label to "Generating
    // Report..." so a user can't double-tap and kick off two exports at once.
    const [exporting, setExporting] = useState(false);
    const [districtName, setDistrictName] = useState('Your District');
    // `rows`: the raw, un-grouped per-class report rows returned by
    // fetchDistrictAdminClassReport -- one row per class in the district.
    // Kept around (in addition to `schoolGroups` below) because
    // computeDistrictTotals needs the flat row list, not the grouped-by-
    // school shape.
    const [rows, setRows] = useState<ClassReportRow[]>([]);
    // `schoolGroups`: the same rows, but bucketed by school (each entry has
    // a school name plus the list of classes belonging to it) -- this is the
    // shape the exported PDF's per-school sections are built from.
    const [schoolGroups, setSchoolGroups] = useState<SchoolReportGroup[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Loads everything this screen needs: this admin's own district id (from
    // their `profiles` row) and, if they have one assigned, the full
    // aggregated class report for that district. Wrapped in `useCallback`
    // with an empty dependency array so the function reference never
    // changes across renders -- required so the `useFocusEffect` below (via
    // its own inner `useCallback`) doesn't re-run on every render, only when
    // the screen actually regains focus.
    const loadData = useCallback(async () => {
        try {
            setErrorMessage(null);
            // Ask Supabase Auth who is currently signed in (reads the
            // locally cached session; doesn't necessarily hit the network).
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Read this admin's own profile row to find their district id
            // and the human-readable district name to show in the header.
            // `.select(...)` only asks for these 2 columns (cheaper than
            // `select('*')`); `.eq('id', user.id)` scopes to just this
            // user's row; `.maybeSingle()` tolerates zero rows (returns
            // `null` instead of throwing), which is friendlier here since a
            // missing profile shouldn't crash the whole screen.
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('district_id, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            setDistrictName(profile?.school_district_name || 'Your District');
            const districtId = profile?.district_id || '';
            if (!districtId) {
                // No district on file for this admin -- nothing to report
                // on, so clear both lists rather than attempting a fetch
                // with an empty district id.
                setRows([]);
                setSchoolGroups([]);
                return;
            }

            // `fetchDistrictAdminClassReport` (lib/districtAdmin.ts) calls a
            // Supabase RPC/function that returns one pre-aggregated row per
            // class in this district -- the client never receives
            // individual student rows, only class-level totals. `groupBySchool`
            // then buckets those class rows by school for the per-school
            // sections of the exported PDF.
            const classRows = await fetchDistrictAdminClassReport(districtId);
            setRows(classRows);
            setSchoolGroups(groupBySchool(classRows));
        } catch (err: any) {
            setErrorMessage(err?.message || 'Could not load report data.');
        } finally {
            // Always clear the loading flag, whether the fetch succeeded or
            // failed, so the spinner never gets stuck on screen.
            setLoading(false);
        }
    }, []);

    // Re-fetch every time this tab gains focus (e.g. the admin switches from
    // another tab back to Reports), so the export always reflects the
    // latest data rather than whatever was loaded the first time the screen
    // mounted.
    useFocusEffect(
        useCallback(() => {
            void loadData();
        }, [loadData])
    );

    // Event handler for the "Export District Report PDF" button. Builds a
    // complete, self-contained HTML document (district totals table, a
    // school-by-school overview table, then one detailed table per school
    // listing its classes) as one big template-literal string, then hands
    // that string either to the browser's print dialog (web) or to
    // expo-print's native print/share sheet (iOS/Android).
    const handleExportPDF = async () => {
        // Nothing to export if there's no report data at all -- the
        // export button is also disabled in this case (see the JSX below),
        // but this guards against the handler somehow being invoked anyway.
        if (rows.length === 0) return;
        try {
            setExporting(true);
            // Recompute the district-wide totals (schools/classes/students/
            // miles/fitness rates) from the raw class rows -- same helper
            // used by overview.tsx, kept in lib/districtAdmin.ts so both
            // screens stay consistent.
            const totals = computeDistrictTotals(rows);

            // Build the "Schools Overview" table's row markup: one `<tr>`
            // per school, sorted by student count descending (schools with
            // the most participants show first). `.slice()` makes a shallow
            // copy before `.sort()` so the original `schoolGroups` state
            // array isn't mutated in place (`.sort()` normally sorts in
            // place, which would be a subtle bug if the same array were
            // reused elsewhere).
            const schoolRowsHtml = schoolGroups
                .slice()
                .sort((a, b) => b.memberCount - a.memberCount)
                .map((s) => `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px; font-weight: bold;">${escapeHtml(s.schoolName)}</td>
                        <td style="padding: 10px; text-align: center;">${s.classes.length}</td>
                        <td style="padding: 10px; text-align: center;">${s.memberCount}</td>
                        <td style="padding: 10px; text-align: right;">${formatMiles(s.totalMiles)} mi</td>
                        <td style="padding: 10px; text-align: center;">${pct(s.fitnessParticipants, s.memberCount)}</td>
                        <td style="padding: 10px; text-align: center;">${s.fitnessEntries > 0 ? pct(s.fitnessTargetsMet, s.fitnessEntries) : '—'}</td>
                    </tr>
                `).join(''); // .join('') concatenates every row's HTML string into one long string with no separator between them.

            // Build one whole "section" of HTML per school: a heading with
            // the school's name, followed by a table listing each of that
            // school's classes. `.map()` here returns an array of HTML
            // strings (one per school), and the final `.join('')` glues
            // them all together into the full multi-school report body.
            const schoolSectionsHtml = schoolGroups
                .slice()
                .sort((a, b) => b.memberCount - a.memberCount)
                .map((s) => {
                    // Within this one school, build the class-table rows --
                    // same row-per-item + sort-by-descending-size pattern as
                    // schoolRowsHtml above, just one level deeper (classes
                    // within a school instead of schools within a district).
                    const classRowsHtml = s.classes
                        .slice()
                        .sort((a, b) => b.memberCount - a.memberCount)
                        .map((c) => `
                            <tr style="border-bottom: 1px solid #ddd;">
                                <td style="padding: 8px; font-weight: bold;">${escapeHtml(c.className)}</td>
                                <td style="padding: 8px; color:#666;">${escapeHtml(c.teacherName)}</td>
                                <td style="padding: 8px; text-align: center;">${c.memberCount}</td>
                                <td style="padding: 8px; text-align: right;">${formatMiles(c.totalMiles)} mi</td>
                                <td style="padding: 8px; text-align: center;">${pct(c.fitnessParticipants, c.memberCount)}</td>
                                <td style="padding: 8px; text-align: center;">${c.fitnessEntries > 0 ? `${c.fitnessTargetsMet}/${c.fitnessEntries}` : '—'}</td>
                            </tr>
                        `).join('');

                    // If a school has zero classes, show a single italic
                    // placeholder row (`classRowsHtml ||` falls back to it)
                    // instead of an empty `<tbody>`, so the PDF never shows a
                    // confusing blank table.
                    return `
                        <h3>${escapeHtml(s.schoolName)}</h3>
                        <table>
                            <thead>
                                <tr><th>Class</th><th>Teacher</th><th style="text-align:center;">Students</th><th style="text-align:right;">Miles</th><th style="text-align:center;">Fitness Participation</th><th style="text-align:center;">Targets Met</th></tr>
                            </thead>
                            <tbody>${classRowsHtml || `<tr><td colspan="6" style="padding:10px; color:#999; font-style:italic;">No classes reporting at this school yet.</td></tr>`}</tbody>
                        </table>
                    `;
                }).join('');

            // Assemble the final complete HTML document: an inline <style>
            // block (this is a totally standalone document, not styled by
            // this app's React Native stylesheets), a district totals
            // table, a schools-overview table, and then every individual
            // school's class table (schoolSectionsHtml) appended at the end.
            // This is the exact string handed to either window.print() or
            // Print.printAsync below.
            const htmlContent = `
                <html>
                    <head><style>body{font-family:sans-serif; padding:20px;} table{width:100%; border-collapse:collapse; margin-bottom: 20px;} th{background:#f4f4f4; padding:8px; text-align:left; font-size:12px;} h2{margin-bottom:4px;} h3{margin-top:24px; margin-bottom:8px; color:#4E3629;}</style></head>
                    <body>
                        <h2>District Fitness &amp; Activity Report</h2>
                        <p><b>District:</b> ${escapeHtml(districtName)} &middot; <b>Date:</b> ${new Date().toLocaleDateString()}</p>
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

            // `Platform.OS` (from React Native) tells us which platform the
            // app is currently running on: 'ios', 'android', or 'web'. This
            // screen needs genuinely different printing code per platform,
            // since only the web branch can open a browser window.
            if (Platform.OS === 'web') {
                // See app/(teacher-tabs)/reports.tsx for why this opens a
                // separate window rather than calling Print.printAsync
                // directly: expo-print's web implementation just calls the
                // browser's window.print() on whatever's currently on
                // screen, tab bar included, unless the report HTML is
                // printed from its own window.
                // `window.open('', '_blank')` opens a brand-new, blank
                // browser tab/window (the empty string URL means "about:blank",
                // and '_blank' is the standard target for "open in a new
                // window/tab").
                const printWindow = window.open('', '_blank');
                if (!printWindow) {
                    // `window.open` returns `null` if the browser's pop-up
                    // blocker intercepted it -- surface a clear error
                    // instead of silently doing nothing.
                    throw new Error('Could not open the print window. Check if your browser is blocking pop-ups for this site.');
                }
                // Write the generated HTML string directly into the new
                // window's document, then close it (required after
                // `document.write` to finish loading the page) and bring it
                // to the foreground.
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                printWindow.focus();
                // A short delay before calling `.print()` gives the new
                // window's content (and any fonts/layout) a moment to
                // actually render before the browser's print dialog opens
                // and takes a "snapshot" of the page.
                setTimeout(() => printWindow.print(), 250);
            } else {
                // On iOS/Android, `Print.printAsync` hands the HTML string
                // straight to the native OS print/share sheet -- no manual
                // window management needed here.
                await Print.printAsync({ html: htmlContent });
            }
        } catch (error: any) {
            // Covers both a thrown pop-up-blocked error above and any
            // failure from Print.printAsync -- shown via the cross-platform
            // showAlert helper (a plain Alert.alert would be a silent no-op
            // on web).
            showAlert('Export Failed', error.message);
        } finally {
            // Always clear the exporting flag so the button re-enables and
            // its label reverts, whether the export succeeded or failed.
            setExporting(false);
        }
    };

    // Conditional render: block the whole screen behind a spinner until the
    // very first data load (via loadData/useFocusEffect above) completes.
    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    // Recomputed on every render (not memoized) from whatever `rows` is
    // currently in state -- cheap enough given how few rows a single
    // district's class list typically has, and it needs to reflect the
    // latest `rows` after every refresh.
    const totals = computeDistrictTotals(rows);

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.kicker, { color: theme.accent }]}>DISTRICT REPORT</Text>
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{districtName}</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                    Export a printable summary of Presidential Fitness Test completion and activity across every school in your district.
                </Text>

                {/* Conditional render: only shown if a fetch failed and
                    set an error message -- otherwise this renders nothing
                    (React skips `false`/`null`/`undefined` children). */}
                {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                {/* A preview card describing exactly what the PDF will
                    contain before the admin taps "Export" -- sets
                    expectations and reiterates the privacy guarantee (no
                    student-level data) up front. Counts (school/class
                    totals) are pulled live from state so they always match
                    what will actually be exported. */}
                <View style={[styles.previewCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                    <Text style={[styles.previewHeading, { color: theme.text }]}>Report will include</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext }]}>• District totals: schools, classes, students, miles, fitness participation and pass rate</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext }]}>• One summary row per school ({schoolGroups.length} school{schoolGroups.length === 1 ? '' : 's'})</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext }]}>• One table per school listing its classes ({totals.classCount} class{totals.classCount === 1 ? '' : 'es'} total)</Text>
                    <Text style={[styles.previewLine, { color: theme.subtext, fontStyle: 'italic', marginTop: 8 }]}>No student names, ids, or per-student rows are included anywhere in this export.</Text>
                </View>

                {/* `TourTarget` wraps this button so the onboarding tour
                    (see components/OnboardingTour.tsx) can find and
                    highlight it by the id "admin.exportButton". The button
                    itself is disabled while exporting or when there's no
                    data at all, and its label/opacity change to reflect
                    that state. */}
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
                {/* Conditional render: an explanatory empty-state message
                    shown only when there's genuinely nothing to export yet. */}
                {rows.length === 0 && (
                    <Text style={styles.emptyText}>No class data reporting in your district yet — nothing to export.</Text>
                )}
            </ScrollView>
        </View>
    );
}

// `getStyles` is a function (rather than a plain object) so it can bake the
// current theme's colors into the returned stylesheet -- called once near
// the top of the component on every render.
// -- layout style: centers the loading spinner --
// -- header text styles: the small accent "kicker" label, the big district
//    name title, and the subtitle beneath it --
const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
    errorText: { color: theme.error, fontSize: 13, marginBottom: 16 },
    // -- "Report will include" preview card styles --
    previewCard: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 24, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
    previewHeading: { fontSize: 15, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 10 },
    previewLine: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
    // -- export button + empty-state text styles --
    exportButton: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    exportButtonText: { color: theme.accentText, fontSize: 15, fontWeight: '700' },
    emptyText: { color: theme.subtext, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 14 },
});
