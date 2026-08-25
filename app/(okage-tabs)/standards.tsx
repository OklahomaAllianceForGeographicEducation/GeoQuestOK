// app/(okage-tabs)/standards.tsx
// Browse/search the Oklahoma Academic Standards library: search by code or
// keyword, filter by subject and grade level. OKAGE staff can also add new
// standards, fix a typo in an existing one, or remove one entirely — the
// library only grants OKAGE write access, so this is the one screen that
// can maintain it.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { colors, Theme } from '../../commonStyles';
import { confirmAlert } from '../../lib/confirmAlert';

// `type StandardRow` describes the shape of a single standards-library
// entry (code, subject, grade, description, etc.), defined in lib/standards.ts.
import {
    createStandard,
    deleteStandard,
    fetchGradeLevelsForSubject,
    fetchStandardSubjects,
    searchStandards,
    STANDARD_SUBJECT_CODES,
    updateStandard,
    type StandardInput,
    type StandardRow,
} from '../../lib/standards';

// react-native-web's Alert.alert() is a complete no-op (see
// lib/confirmAlert.ts) — a plain info/error Alert.alert(...) call here
// would silently do nothing on web. Same pattern used across the other
// OKAGE tabs and app/(teacher-tabs)/curriculum.tsx.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

const EMPTY_FORM: StandardInput = {
    code: '',
    subject: '',
    gradeLevel: '',
    strand: null,
    description: '',
    sourceDocument: null,
};

export default function OkageStandardsScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

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

    // Add/edit form state. `editingId` is null while adding a brand new
    // standard, or set to an existing row's id while editing one.
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<StandardInput>({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    // Grade-level quick-fill chips scoped to whatever subject is currently
    // typed into the form — separate from the page-level `gradeLevels`
    // filter above, since the form's subject and the filter's subject can
    // differ.
    const [formGradeLevels, setFormGradeLevels] = useState<string[]>([]);

    // The always-visible Oklahoma subject codes, merged with whatever
    // subjects already exist in the library (so a subject that isn't on
    // the standard list -- added by hand at some point -- still shows up
    // as a quick-fill option instead of disappearing). Used for both the
    // filter row and the add/edit form's quick-fill row, so both stay in
    // sync with each other and with the shared canonical list.
    const subjectOptions = [...new Set([...STANDARD_SUBJECT_CODES, ...subjects])].sort();

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
            } catch (err: any) {
                if (!cancelled) showAlert('Search Error', err.message || 'Could not search the standards library.');
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

    // Effect #4: while the form is open, keep its grade-level quick-fill
    // chips in sync with whatever subject is currently typed in.
    useEffect(() => {
        if (!formOpen || !form.subject.trim()) {
            setFormGradeLevels([]);
            return;
        }
        void fetchGradeLevelsForSubject(form.subject.trim()).then(setFormGradeLevels);
        // form.subject deliberately drives this, not the whole `form`
        // object — re-fetching on every keystroke of unrelated fields
        // (description, etc.) would be wasted work.
    }, [formOpen, form.subject]);

    // Re-runs the current search + refreshes the filter chip lists — used
    // after a save/delete so the results and "Subject"/"Grade Level" chip
    // rows immediately reflect the change (e.g. a brand new subject shows
    // up as a filter chip right away).
    async function refreshAfterEdit() {
        const [rows, subjectList] = await Promise.all([
            searchStandards({ keyword, subject: selectedSubject ?? undefined, gradeLevel: selectedGrade ?? undefined }),
            fetchStandardSubjects(),
        ]);
        setResults(rows);
        setSubjects(subjectList);
        if (selectedSubject) {
            setGradeLevels(await fetchGradeLevelsForSubject(selectedSubject));
        }
    }

    function openAddForm() {
        setEditingId(null);
        // Pre-fill the subject with whatever filter is currently active,
        // since that's very likely what staff are about to add another
        // standard for.
        setForm({ ...EMPTY_FORM, subject: selectedSubject ?? '', gradeLevel: selectedGrade ?? '' });
        setFormOpen(true);
    }

    function openEditForm(standard: StandardRow) {
        setEditingId(standard.id);
        setForm({
            code: standard.code,
            subject: standard.subject,
            gradeLevel: standard.gradeLevel,
            strand: standard.strand,
            description: standard.description,
            sourceDocument: standard.sourceDocument,
        });
        setFormOpen(true);
    }

    async function handleSubmitForm() {
        if (!form.code.trim() || !form.subject.trim() || !form.gradeLevel.trim() || !form.description.trim()) {
            showAlert('Missing Info', 'Code, subject, grade level, and description are all required.');
            return;
        }
        setSaving(true);
        try {
            const input: StandardInput = {
                code: form.code.trim(),
                subject: form.subject.trim(),
                gradeLevel: form.gradeLevel.trim(),
                strand: form.strand?.trim() || null,
                description: form.description.trim(),
                sourceDocument: form.sourceDocument?.trim() || null,
            };
            if (editingId) {
                await updateStandard(editingId, input);
            } else {
                await createStandard(input);
            }
            await refreshAfterEdit();
            setFormOpen(false);
            showAlert('Saved', editingId ? 'Standard updated.' : 'Standard added to the library.');
        } catch (err: any) {
            // A duplicate (code, subject, gradeLevel) triple surfaces here
            // as a Postgres unique-violation message — shown as-is, which
            // is specific enough for staff to know what to change.
            showAlert('Save Failed', err.message || 'Could not save this standard.');
        } finally {
            setSaving(false);
        }
    }

    function handleDelete(standard: StandardRow) {
        confirmAlert(
            'Remove Standard',
            `Remove "${standard.code}" (${standard.subject}, Grade ${standard.gradeLevel}) from the library? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            try {
                                await deleteStandard(standard.id);
                                await refreshAfterEdit();
                                showAlert('Removed', 'Standard removed from the library.');
                            } catch (err: any) {
                                showAlert('Remove Failed', err.message || 'Could not remove this standard.');
                            }
                        })();
                    },
                },
            ]
        );
    }

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
                <Text style={[styles.mainHeading, { color: theme.text }]} accessibilityRole="header">Standards Library</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Search the Oklahoma Academic Standards by code or keyword, filter by subject and grade level, or add/edit a standard.
                </Text>

                <Pressable
                    style={[styles.addButton, { borderColor: theme.accent, backgroundColor: formOpen ? theme.accent : 'transparent' }]}
                    onPress={() => (formOpen ? setFormOpen(false) : openAddForm())}
                    accessibilityRole="button"
                >
                    <Ionicons name={formOpen ? 'close' : 'add'} size={16} color={formOpen ? theme.accentText : theme.accent} />
                    <Text style={[styles.addButtonText, { color: formOpen ? theme.accentText : theme.accent }]}>
                        {formOpen ? 'Cancel' : 'Add Standard'}
                    </Text>
                </Pressable>

                {formOpen && (
                    <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.formTitle, { color: theme.text }]}>{editingId ? 'Edit Standard' : 'New Standard'}</Text>

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>CODE</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={form.code}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, code: text }))}
                            placeholder="e.g. 3.RL.2"
                            placeholderTextColor={theme.subtext}
                            autoCapitalize="characters"
                        />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SUBJECT</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={form.subject}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, subject: text }))}
                            placeholder="e.g. Mathematics"
                            placeholderTextColor={theme.subtext}
                        />
                        <View style={styles.chipRow}>
                            {subjectOptions.map((subject) => {
                                const active = subject === form.subject;
                                return (
                                    <Pressable
                                        key={subject}
                                        style={[styles.chipSmall, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.background }]}
                                        onPress={() => setForm((prev) => ({ ...prev, subject }))}
                                        accessibilityRole="button"
                                    >
                                        <Text style={[styles.chipTextSmall, { color: active ? theme.accentText : theme.text }]}>{subject}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>GRADE LEVEL</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={form.gradeLevel}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, gradeLevel: text }))}
                            placeholder="e.g. 3rd Grade"
                            placeholderTextColor={theme.subtext}
                        />
                        {formGradeLevels.length > 0 && (
                            <View style={styles.chipRow}>
                                {formGradeLevels.map((grade) => (
                                    <Pressable
                                        key={grade}
                                        style={[styles.chipSmall, { borderColor: theme.border, backgroundColor: theme.background }]}
                                        onPress={() => setForm((prev) => ({ ...prev, gradeLevel: grade }))}
                                        accessibilityRole="button"
                                    >
                                        <Text style={[styles.chipTextSmall, { color: theme.text }]}>{grade}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>STRAND (optional)</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={form.strand ?? ''}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, strand: text }))}
                            placeholder="A sub-category label, if this library uses one"
                            placeholderTextColor={theme.subtext}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DESCRIPTION</Text>
                        <TextInput
                            style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={form.description}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, description: text }))}
                            placeholder="The full standard text"
                            placeholderTextColor={theme.subtext}
                            multiline
                            numberOfLines={3}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SOURCE DOCUMENT (optional)</Text>
                        <TextInput
                            style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                            value={form.sourceDocument ?? ''}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, sourceDocument: text }))}
                            placeholder="e.g. Oklahoma Academic Standards for Mathematics (2022)"
                            placeholderTextColor={theme.subtext}
                        />

                        <Pressable
                            style={[styles.saveButton, { backgroundColor: theme.accent }]}
                            disabled={saving}
                            onPress={() => void handleSubmitForm()}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: saving, busy: saving }}
                        >
                            {saving ? <ActivityIndicator color={theme.accentText} /> : (
                                <Text style={[styles.saveButtonText, { color: theme.accentText }]}>{editingId ? 'Save Changes' : 'Add Standard'}</Text>
                            )}
                        </Pressable>
                    </View>
                )}

                <TextInput
                    style={[styles.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder="Search by code or keyword (e.g. 3.RL.2, or fractions)"
                    placeholderTextColor={theme.subtext}
                />

                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SUBJECT</Text>
                <View style={styles.chipRow}>
                    {/* The "All Subjects" chip is highlighted (accent
                        background, white text) whenever no specific
                        subject is selected. Tapping it always resets the
                        filter to null, regardless of current state. */}
                    <Pressable
                        style={[styles.chip, { borderColor: theme.border, backgroundColor: !selectedSubject ? theme.accent : theme.surface }]}
                        onPress={() => setSelectedSubject(null)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: !selectedSubject }}
                    >
                        <Text style={[styles.chipText, { color: !selectedSubject ? theme.accentText : theme.text }]}>All Subjects</Text>
                    </Pressable>
                    {subjectOptions.map((subject) => {
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
                                accessibilityRole="radio"
                                accessibilityState={{ checked: active }}
                            >
                                <Text style={[styles.chipText, { color: active ? theme.accentText : theme.text }]}>{subject}</Text>
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
                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>GRADE LEVEL</Text>
                        <View style={styles.chipRow}>
                            {gradeLevels.map((grade) => {
                                const active = grade === selectedGrade;
                                return (
                                    <Pressable
                                        key={grade}
                                        style={[styles.chipSmall, { borderColor: theme.border, backgroundColor: active ? theme.accent : theme.surface }]}
                                        onPress={() => setSelectedGrade(active ? null : grade)}
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked: active }}
                                    >
                                        <Text style={[styles.chipTextSmall, { color: active ? theme.accentText : theme.text }]}>{grade}</Text>
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
                            {standard.sourceDocument && (
                                <Text style={[styles.standardSource, { color: theme.subtext }]}>{standard.sourceDocument}</Text>
                            )}
                            <View style={styles.standardActionRow}>
                                <Pressable
                                    style={[styles.iconButton, { borderColor: theme.border }]}
                                    onPress={() => openEditForm(standard)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Edit standard ${standard.code}`}
                                >
                                    <Ionicons name="create-outline" size={16} color={theme.accent} />
                                </Pressable>
                                <Pressable
                                    style={[styles.iconButton, { borderColor: theme.border }]}
                                    onPress={() => handleDelete(standard)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove standard ${standard.code}`}
                                >
                                    <Ionicons name="trash-outline" size={16} color={theme.error} />
                                </Pressable>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    mainHeading: { fontSize: 24, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    introText: { fontSize: 14, lineHeight: 19, marginBottom: 16 },
    searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 14, marginTop: 4 },
    fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginTop: 10 },
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
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10, marginTop: 14, textTransform: 'uppercase' },
    emptyText: { fontSize: 13, fontStyle: 'italic' },

    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginBottom: 4 },
    addButtonText: { fontSize: 13, fontWeight: '700' },
    formCard: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginTop: 12,
        marginBottom: 16,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    formTitle: { fontSize: 15, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 4 },
    textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },
    saveButton: { marginTop: 16, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    saveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

    standardCard: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
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
    standardSource: { fontSize: 10.5, fontStyle: 'italic', marginTop: 6 },
    standardActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    iconButton: { borderWidth: 1, borderRadius: 10, padding: 14 },
});
