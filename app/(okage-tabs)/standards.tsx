// app/(okage-tabs)/standards.tsx
// Browse/search the Oklahoma Academic Standards library: search by code or
// keyword, filter by subject and grade level.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../commonStyles';

// `type StandardRow` describes the shape of a single standards-library
// entry (code, subject, grade, description, etc.), defined in lib/standards.ts.
import { fetchGradeLevelsForSubject, fetchStandardSubjects, searchStandards, type StandardRow } from '../../lib/standards';

export default function OkageStandardsScreen() {
    const theme = colors.light;

    const [loading, setLoading] = useState(true);
    // The full list of subject names available to filter by (e.g. "Math",
    // "Reading"), fetched once on load.
    const [subjects, setSubjects] = useState<string[]>([]);
    // Which subject filter chip is currently selected. `null` means "All
    // Subjects" (no filter applied).
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    // The list of valid grade levels for whichever subject is selected —
    // this list changes depending on selectedSubject, since different
    // subjects may cover different grade ranges.
    const [gradeLevels, setGradeLevels] = useState<string[]>([]);
    const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
    // Free-text search box content.
    const [keyword, setKeyword] = useState('');
    // The standards that currently match the keyword/subject/grade filters.
    const [results, setResults] = useState<StandardRow[]>([]);
    // Whether a search request is currently in flight (separate from the
    // initial `loading`, which only covers the very first subject list
    // fetch).
    const [searching, setSearching] = useState(false);

    // Effect #1: runs once on mount to load the list of subjects for the
    // filter chips.
    useEffect(() => {
        async function bootstrap() {
            try {
                setSubjects(await fetchStandardSubjects());
            } finally {
                setLoading(false);
            }
        }
        void bootstrap();
    }, []);

    // Effect #2: runs whenever `selectedSubject` changes. Fetches the
    // grade levels available within that subject.
    useEffect(() => {
        if (!selectedSubject) {
            // No subject picked ("All Subjects") — there's nothing
            // meaningful to show as grade-level chips, so clear both.
            setGradeLevels([]);
            setSelectedGrade(null);
            return;
        }
        // Whenever the subject changes, reset the grade selection — a
        // grade that was valid for the old subject might not exist for
        // the new one.
        setSelectedGrade(null);
        void fetchGradeLevelsForSubject(selectedSubject).then(setGradeLevels);
    }, [selectedSubject]);

    // Effect #3: the actual search, re-run whenever keyword, subject, or
    // grade changes. This uses a "debounce" pattern (see the setTimeout
    // below) so that typing quickly doesn't fire a network request on
    // every single keystroke.
    useEffect(() => {
        // Guard flag: if this effect re-runs (e.g. the user types another
        // character) before the previous search finishes, we don't want
        // the old, now-outdated search's result to overwrite the newer one.
        let cancelled = false;
        setSearching(true);

        // setTimeout delays running the search by 300 milliseconds. Since
        // this effect re-runs (and its cleanup function fires, clearing
        // the previous timer — see below) on every keystroke, only the
        // LAST keystroke's timer actually survives long enough to fire,
        // as long as the user keeps typing faster than every 300ms. This
        // is the standard "debounce" technique to avoid spamming the
        // backend with a search request per character typed.
        const timer = setTimeout(async () => {
            try {
                const rows = await searchStandards({
                    keyword,
                    // `?? undefined` converts a `null` selectedSubject into
                    // `undefined`, presumably because searchStandards
                    // treats "no filter" as an omitted/undefined argument
                    // rather than an explicit null.
                    subject: selectedSubject ?? undefined,
                    gradeLevel: selectedGrade ?? undefined,
                });
                // Only apply the results if this particular effect run
                // hasn't been superseded by a newer one.
                if (!cancelled) setResults(rows);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 300);

        // Cleanup: runs before the next time this effect fires (i.e. on
        // the very next keystroke/filter change), or when the screen
        // unmounts. Marks this run as cancelled and cancels its pending
        // timer so the debounced search never actually executes if
        // something newer has already superseded it.
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [keyword, selectedSubject, selectedGrade]);

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
                // Normally, tapping anywhere outside a focused TextInput
                // (like on a Pressable chip) dismisses the keyboard AND
                // swallows that tap. "handled" tells the ScrollView to let
                // taps on interactive children (like the filter chips)
                // still register normally even while the keyboard is open,
                // instead of requiring a second tap after the keyboard
                // closes.
                keyboardShouldPersistTaps="handled"
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>REFERENCE LIBRARY</Text>
                <Text style={[styles.mainHeading, { color: theme.text }]}>Standards Library</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Search the Oklahoma Academic Standards by code or keyword, or filter by subject and grade level.
                </Text>

                <TextInput
                    style={[styles.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder="Search by code or keyword (e.g. 3.RL.2, or fractions)"
                    placeholderTextColor={theme.subtext}
                />

                <Text style={styles.fieldLabel}>SUBJECT</Text>
                <View style={styles.chipRow}>
                    {/* The "All Subjects" chip is highlighted (accent
                        background, white text) whenever no specific
                        subject is selected. Tapping it always resets the
                        filter to null, regardless of current state. */}
                    <Pressable
                        style={[styles.chip, { borderColor: theme.border, backgroundColor: !selectedSubject ? theme.accent : theme.surface }]}
                        onPress={() => setSelectedSubject(null)}
                    >
                        <Text style={[styles.chipText, { color: !selectedSubject ? '#FFF' : theme.text }]}>All Subjects</Text>
                    </Pressable>
                    {subjects.map((subject) => {
                        const active = subject === selectedSubject;
                        return (
                            <Pressable
                                key={subject}
                                style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.surface }]}
                                // Tapping an already-selected subject chip
                                // toggles it back off (sets to null,
                                // effectively "All Subjects"); tapping a
                                // different chip selects it.
                                onPress={() => setSelectedSubject(active ? null : subject)}
                            >
                                <Text style={[styles.chipText, { color: active ? '#FFF' : theme.text }]}>{subject}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* Only show the grade-level filter row at all once a
                    subject has been picked and grade levels have loaded for
                    it — otherwise this whole block renders nothing
                    (the `&&` short-circuits to false/undefined, which React
                    simply skips). */}
                {gradeLevels.length > 0 && (
                    <>
                        <Text style={styles.fieldLabel}>GRADE LEVEL</Text>
                        <View style={styles.chipRow}>
                            {gradeLevels.map((grade) => {
                                const active = grade === selectedGrade;
                                return (
                                    <Pressable
                                        key={grade}
                                        style={[styles.chipSmall, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.surface }]}
                                        onPress={() => setSelectedGrade(active ? null : grade)}
                                    >
                                        <Text style={[styles.chipTextSmall, { color: active ? '#FFF' : theme.text }]}>{grade}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </>
                )}

                {/* Section header switches between "Searching…" while a
                    debounced search is in flight, and "Results (N)" once
                    done. If results.length is exactly 100 (presumably the
                    backend's max page size), a "+" is appended to hint
                    there may be even more matches than shown. */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {searching ? 'Searching…' : `Results (${results.length}${results.length === 100 ? '+' : ''})`}
                </Text>

                {searching ? (
                    <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 16 }} />
                ) : results.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.subtext }]}>No standards match this search yet.</Text>
                ) : (
                    results.map((standard) => (
                        <View key={standard.id} style={[styles.standardCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={styles.standardHeaderRow}>
                                <Text style={[styles.standardCode, { color: theme.accent }]}>{standard.code}</Text>
                                <Text style={[styles.standardMeta, { color: theme.subtext }]}>
                                    {standard.subject} · Grade {standard.gradeLevel}
                                </Text>
                            </View>
                            {/* "strand" (a standards sub-category label) is
                                optional — only render this line if the
                                current standard actually has one. */}
                            {standard.strand && <Text style={[styles.standardStrand, { color: theme.text }]}>{standard.strand}</Text>}
                            <Text style={[styles.standardDescription, { color: theme.text }]}>{standard.description}</Text>
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
    searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 14 },
    fieldLabel: { fontSize: 10, fontWeight: '800', color: '#666', letterSpacing: 0.6, marginBottom: 8, marginTop: 4 },
    // flexWrap: 'wrap' lets the chips flow onto multiple lines instead of
    // being squeezed onto one row or overflowing off-screen, once they run
    // out of horizontal space.
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    chip: { borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
    chipText: { fontSize: 12.5, fontWeight: '700' },
    // A visually smaller version of the same chip style, used for the
    // grade-level row so it reads as a secondary/nested filter beneath the
    // subject row.
    chipSmall: { borderWidth: 1, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
    chipTextSmall: { fontSize: 12, fontWeight: '700' },
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#666', marginBottom: 10, marginTop: 14, textTransform: 'uppercase' },
    emptyText: { fontSize: 13, fontStyle: 'italic' },
    standardCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
    standardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        // 'flex-start' (instead of 'center') aligns the code and the
        // subject/grade meta text to the TOP of the row rather than
        // vertically centering them — useful if the meta text on the
        // right ever wraps onto two lines while the code stays one line.
        alignItems: 'flex-start',
        gap: 8
    },
    standardCode: { fontSize: 14, fontWeight: '800' },
    standardMeta: { fontSize: 11, fontWeight: '600', textAlign: 'right' },
    // opacity: 0.8 slightly fades this text (80% fully opaque) to visually
    // de-emphasize it compared to the main description below it.
    standardStrand: { fontSize: 11.5, fontWeight: '700', marginTop: 4, opacity: 0.8 },
    standardDescription: { fontSize: 13.5, lineHeight: 18, marginTop: 6 },
});
