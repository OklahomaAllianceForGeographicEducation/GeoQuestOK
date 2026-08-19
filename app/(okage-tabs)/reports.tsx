// app/(okage-tabs)/reports.tsx
// Statewide mileage report for OKAGE staff: total miles walked per enrolled
// school, grouped by district. Schools with no enrolled students are left
// out by the report query itself, and only aggregate numbers ever reach
// this screen — no student names, usernames, or ids.
import { useEffect, useState } from 'react';

// RefreshControl adds the classic "pull down to refresh" gesture to a
// ScrollView.
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../commonStyles';
import { formatMiles } from '../../lib/trails';

// Data-fetching + data-shaping helpers, kept in lib/reports.ts so the
// screen component itself only worries about rendering, not about how the
// report data is queried/grouped. `type DistrictGroup` is imported
// alongside the two functions since TypeScript needs the type definition
// to know the shape of the data these functions return.
import { fetchStatewideSchoolReport, groupByDistrict, type DistrictGroup } from '../../lib/reports';

export default function OkageReportsScreen() {
    const theme = colors.light;

    const [loading, setLoading] = useState(true);
    // Tracks whether the user is actively pulling down to refresh (as
    // opposed to the very first load), so we can show the pull-to-refresh
    // spinner separately from the full-screen loading spinner.
    const [refreshing, setRefreshing] = useState(false);
    // The fetched + grouped report data: an array of districts, each
    // containing an array of schools.
    const [districts, setDistricts] = useState<DistrictGroup[]>([]);
    // Text currently typed into the search box.
    const [search, setSearch] = useState('');

    // Shared load function used both for the initial fetch and for
    // pull-to-refresh, so the fetching logic only lives in one place.
    async function load() {
        try {
            // Fetch the raw per-school rows from Supabase...
            const rows = await fetchStatewideSchoolReport();
            // ...then reshape them into a nested district → schools
            // structure, which is easier to render as grouped cards.
            setDistricts(groupByDistrict(rows));
        } catch (err: any) {
            Alert.alert('Load Error', err.message || 'Could not load the statewide report.');
        } finally {
            // Turn off both loading indicators regardless of success/
            // failure — whichever one was active gets cleared.
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    // Sum every district's totalMiles into one grand total across the
    // whole state. `sum` starts at 0 and accumulates as reduce walks the
    // array.
    const statewideTotalMiles = districts.reduce((sum, d) => sum + d.totalMiles, 0);
    // Same pattern, but summing each district's studentCount instead.
    const statewideStudentCount = districts.reduce((sum, d) => sum + d.studentCount, 0);

    // Normalize the search box's text once: trim whitespace and lowercase
    // it, so comparisons below are case-insensitive and ignore accidental
    // leading/trailing spaces.
    const lowerSearch = search.trim().toLowerCase();

    // If there's no search text, just use every district unfiltered. If
    // there IS search text, build a filtered copy of the district list.
    const filteredDistricts = lowerSearch
        ? districts
              // For each district, keep a copy of it (`...d` spreads all
              // its existing fields) but replace `schools` with only the
              // schools whose name matches the search, OR keep all schools
              // if the district's own name matches (so searching a district
              // name still shows every school in it).
              .map((d) => ({
                  ...d,
                  schools: d.schools.filter(
                      (s) => s.schoolName.toLowerCase().includes(lowerSearch) || d.districtName.toLowerCase().includes(lowerSearch)
                  ),
              }))
              // Then drop any district that ended up with zero matching
              // schools AND whose own name doesn't match the search either
              // — i.e. remove districts that are entirely irrelevant to
              // the search.
              .filter((d) => d.schools.length > 0 || d.districtName.toLowerCase().includes(lowerSearch))
        : districts;

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
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                // Attaches the pull-to-refresh gesture handler to this
                // ScrollView. `refreshing` controls whether the built-in
                // spinner is currently shown at the top.
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            void load();
                        }}
                    />
                }
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>STATEWIDE REPORT</Text>
                <Text style={[styles.mainHeading, { color: theme.text }]}>School Mileage</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Total miles walked by every enrolled school, grouped by district. Schools with no enrolled students aren't shown.
                </Text>

                {/* Summary strip with three side-by-side stats: total
                    miles, number of districts, total students. */}
                <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.summaryItem}>
                        <Text style={[styles.summaryValue, { color: theme.accent }]}>{formatMiles(statewideTotalMiles)}</Text>
                        <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Total Miles</Text>
                    </View>
                    <View style={styles.summaryItem}>
                        <Text style={[styles.summaryValue, { color: theme.accent }]}>{districts.length}</Text>
                        <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Districts</Text>
                    </View>
                    <View style={styles.summaryItem}>
                        <Text style={[styles.summaryValue, { color: theme.accent }]}>{statewideStudentCount}</Text>
                        <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Enrolled Students</Text>
                    </View>
                </View>

                <TextInput
                    style={[styles.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search by district or school name"
                    // Controls the color of the placeholder text itself
                    // (separate from the `color` style above, which
                    // controls the color of text the user actually types).
                    placeholderTextColor={theme.subtext}
                />

                {/* Ternary: if there are zero districts to show, render an
                    explanatory message instead of an empty list. The
                    message itself differs depending on WHY the list is
                    empty — no data at all, vs. a search with no matches. */}
                {filteredDistricts.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>
                        {districts.length === 0 ? 'No enrolled schools reporting mileage yet.' : 'No districts or schools match that search.'}
                    </Text>
                ) : (
                    filteredDistricts.map((district) => (
                        // Prefer a stable district id as the React key; if
                        // one isn't available, fall back to the district
                        // name (still unique enough for this list).
                        <View key={district.districtId || district.districtName} style={[styles.districtCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={styles.districtHeaderRow}>
                                <Text style={[styles.districtName, { color: theme.text }]}>{district.districtName}</Text>
                                <Text style={[styles.districtMiles, { color: theme.accent }]}>{formatMiles(district.totalMiles)} mi</Text>
                            </View>
                            {/* Builds "N school(s) · M student(s)" with
                                correct singular/plural wording depending on
                                the count — the ternary adds an 's' only
                                when the count isn't exactly 1. */}
                            <Text style={[styles.districtMeta, { color: theme.subtext }]}>
                                {district.schools.length} school{district.schools.length === 1 ? '' : 's'} · {district.studentCount} student{district.studentCount === 1 ? '' : 's'}
                            </Text>

                            <View style={[styles.divider, { backgroundColor: theme.border }]} />

                            {district.schools
                                // .slice() with no arguments makes a shallow
                                // copy of the array. This matters because
                                // .sort() mutates the array it's called on
                                // in place — copying first means we don't
                                // accidentally reorder the original
                                // `district.schools` array (which could
                                // cause subtle bugs on re-render).
                                .slice()
                                // Sort schools within this district from
                                // highest miles to lowest. b - a (instead of
                                // a - b) produces descending order.
                                .sort((a, b) => b.totalMiles - a.totalMiles)
                                .map((school) => (
                                    <View key={`${district.districtId}-${school.schoolName}`} style={styles.schoolRow}>
                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                            <Text style={[styles.schoolName, { color: theme.text }]}>{school.schoolName}</Text>
                                            <Text style={[styles.schoolMeta, { color: theme.subtext }]}>
                                                {school.studentCount} student{school.studentCount === 1 ? '' : 's'} enrolled
                                            </Text>
                                        </View>
                                        <Text style={[styles.schoolMiles, { color: theme.text }]}>{formatMiles(school.totalMiles)} mi</Text>
                                    </View>
                                ))}
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    mainHeading: { fontSize: 24, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    introText: { fontSize: 14, lineHeight: 19, marginBottom: 16 },
    emptyText: { fontSize: 13, fontStyle: 'italic', marginTop: 12 },

    summaryCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
    // flex: 1 on each of the three summary items makes them split the
    // summaryCard's width evenly (1/3 each), since the card itself is a
    // flexDirection: 'row' with three equal-flex children.
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryValue: { fontSize: 18, fontWeight: '800' },
    summaryLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.4,
        marginTop: 2,
        // Forces the text to render as ALL CAPS regardless of how it's
        // typed in the JSX/data — purely a visual transform, doesn't
        // change the underlying string value.
        textTransform: 'uppercase'
    },

    searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 16 },

    districtCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
    districtHeaderRow: {
        flexDirection: 'row',
        // 'space-between' pushes the first child (district name) to the
        // far left and the last child (mile total) to the far right, with
        // any extra space distributed between them — a common pattern for
        // "label on the left, value on the right" rows.
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    districtName: { fontSize: 16, fontWeight: '800', fontFamily: 'Georgia', flex: 1, paddingRight: 8 },
    districtMiles: { fontSize: 15, fontWeight: '800' },
    districtMeta: { fontSize: 12, marginTop: 2 },
    // A thin 1px-tall horizontal line used as a visual divider; its color
    // comes from the theme (applied inline where it's used) rather than
    // being hardcoded here.
    divider: { height: 1, marginVertical: 12 },

    schoolRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    schoolName: { fontSize: 13.5, fontWeight: '700' },
    schoolMeta: { fontSize: 11.5, marginTop: 2 },
    schoolMiles: { fontSize: 13.5, fontWeight: '700' },
});
