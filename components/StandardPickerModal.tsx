// components/StandardPickerModal.tsx
//
// FILE OVERVIEW
// -------------
// Component: StandardPickerModal (default export)
// Platform: SHARED -- built from plain react-native primitives (Modal,
//   ScrollView, TextInput, etc.), so it renders the same on iOS, Android,
//   and web with no platform-specific file split.
// Responsibility: a searchable/filterable picker for academic standards
//   (e.g. Oklahoma Academic Standards rows from lib/standards.ts), used by
//   OKAGE staff when attaching a standard to a quiz question or trail. Lets
//   the user narrow results by subject (a horizontal row of chips), then by
//   grade level (a second row of chips, populated based on the chosen
//   subject), and by a free-text keyword search box -- all three filters
//   combine together server-side via searchStandards. Selecting a result
//   calls back to the parent with the chosen StandardRow and closes the
//   modal.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchGradeLevelsForSubject, fetchStandardSubjects, searchStandards, type StandardRow } from '../lib/standards';
import type { Theme } from '../commonStyles';
import ModalBackdrop from './ModalBackdrop';

// Props for StandardPickerModal:
// - visible: whether the modal is currently shown. Also drives the
//   "reset filters and (re)load subjects" effect below.
// - onClose: called when the user taps Close, or after a standard is
//   selected (selection auto-closes the modal too).
// - onSelect: called with the chosen StandardRow when the user taps a
//   result row.
// - theme: the active color theme object (see commonStyles.ts) driving
//   every themed color in this modal via getStyles below.
// - accentColor: optional override for the highlight color used on the
//   Close button and selected filter chips; falls back to `theme.accent`.
// - initialSubject: optional subject name to pre-select as the active
//   subject filter whenever the modal opens (e.g. so re-opening the picker
//   from a question already tagged "Math" starts filtered to Math).
type StandardPickerModalProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (standard: StandardRow) => void;
    theme: Theme;
    accentColor?: string;
    initialSubject?: string;
};

// StandardPickerModal
// --------------------
// Purpose: let staff search/filter/select one academic standard from a
// large reference list, combining a subject filter, a grade-level filter,
// and free-text keyword search.
//
// Props: see the `StandardPickerModalProps` type above.
// Returns: a slide-up <Modal> sheet containing a search box, a subject chip
// row, a conditional grade-level chip row, and a scrollable list of matching
// standards (or a loading spinner / "no matches" message).
export default function StandardPickerModal({
    visible,
    onClose,
    onSelect,
    theme,
    accentColor,
    initialSubject,
}: StandardPickerModalProps) {
    // Prefer an explicit accentColor prop; otherwise fall back to the
    // theme's own accent color.
    const resolvedAccentColor = accentColor ?? theme.accent;
    // The full list of distinct subject names available to filter by (e.g.
    // "Math", "Science"), fetched once per modal-open.
    const [subjects, setSubjects] = useState<string[]>([]);
    // Which subject chip is currently active; null means "All" (no subject
    // filter applied).
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    // Grade-level options for the currently selected subject (e.g. "3rd
    // Grade", "4th Grade"); refetched whenever selectedSubject changes.
    const [gradeLevels, setGradeLevels] = useState<string[]>([]);
    // Which grade-level chip is currently active; null means no grade
    // filter applied.
    const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
    // Free-text search box contents.
    const [keyword, setKeyword] = useState('');
    // The current page of matching standards, refreshed by the debounced
    // search effect below.
    const [results, setResults] = useState<StandardRow[]>([]);
    // True while a search request is in flight; shows a spinner in place of
    // the results list.
    const [loading, setLoading] = useState(false);

    // Resets the filters and (re)loads the subject list every time the
    // modal transitions to visible. Guarded so it does nothing while
    // hidden. `initialSubject` is included in the dependency array so that
    // if the parent opens this modal again with a different initialSubject
    // (e.g. picking a standard for a different question), the filter resets
    // to match. Note this intentionally does NOT reset selectedGrade or
    // results directly -- clearing selectedSubject to initialSubject here
    // triggers the next effect (grade levels) and the search effect below
    // to recompute from a consistent starting point instead.
    useEffect(() => {
        if (!visible) return;
        setKeyword('');
        setSelectedSubject(initialSubject ?? null);
        void fetchStandardSubjects().then(setSubjects);
    }, [visible, initialSubject]);

    // Loads the grade-level options for whichever subject is currently
    // selected. If the modal is hidden, or no subject is selected (the
    // "All" chip), grade levels are cleared to an empty list instead of
    // being fetched -- there's no single subject to scope them to.
    useEffect(() => {
        if (!visible || !selectedSubject) {
            setGradeLevels([]);
            return;
        }
        void fetchGradeLevelsForSubject(selectedSubject).then(setGradeLevels);
    }, [visible, selectedSubject]);

    // The actual search: re-runs whenever the modal's visibility or any of
    // the three filters (keyword, subject, grade) changes. Debounced by 250ms
    // via setTimeout so fast typing in the keyword box doesn't fire a
    // network request on every single keystroke -- only once typing pauses.
    // The `cancelled` flag plus the cleanup function guard against a classic
    // React race condition: if the effect re-runs (e.g. the user keeps
    // typing) before the previous timer's request resolves, the cleanup
    // function clears that stale timer AND the "cancelled" flag stops its
    // results from being applied even if it had already started the network
    // call before being cleared.
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const rows = await searchStandards({
                    keyword,
                    subject: selectedSubject ?? undefined,
                    gradeLevel: selectedGrade ?? undefined,
                    limit: 50,
                });
                if (!cancelled) setResults(rows);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [visible, keyword, selectedSubject, selectedGrade]);

    // Theme-aware style factory -- rebuilt each render so every color
    // tracks the current `theme` prop (see the getStyles definition near
    // the bottom of this file).
    const styles = getStyles(theme);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <ModalBackdrop style={styles.overlay}>
                <View style={styles.sheet}>
                    <Pressable
                        style={[styles.closeButton, { backgroundColor: resolvedAccentColor }]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                    >
                        <Text style={styles.closeButtonText}>Close</Text>
                    </Pressable>

                    <Text style={styles.title}>Pick a Standard</Text>

                    {/* Free-text keyword box. Every keystroke updates
                        `keyword` state, which the debounced search effect
                        above picks up 250ms after typing stops. */}
                    <TextInput
                        style={styles.searchInput}
                        value={keyword}
                        onChangeText={setKeyword}
                        placeholder="Search by code or keyword"
                        placeholderTextColor={theme.subtext}
                    />

                    {/* Subject filter row: a horizontally scrolling strip of
                        chips, one "All" chip plus one per fetched subject.
                        Only one chip is "active" (highlighted) at a time --
                        tapping "All" clears the subject filter entirely,
                        tapping an already-active subject also clears it
                        (toggle behavior), and tapping any other subject
                        makes it the new filter. */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                        <Pressable
                            style={[styles.chip, !selectedSubject && { backgroundColor: resolvedAccentColor, borderColor: resolvedAccentColor }]}
                            onPress={() => setSelectedSubject(null)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: !selectedSubject }}
                        >
                            <Text style={[styles.chipText, !selectedSubject && { color: theme.accentText }]}>All</Text>
                        </Pressable>
                        {subjects.map((subject) => {
                            const active = subject === selectedSubject;
                            return (
                                <Pressable
                                    key={subject}
                                    style={[styles.chip, active && { backgroundColor: resolvedAccentColor, borderColor: resolvedAccentColor }]}
                                    onPress={() => setSelectedSubject(active ? null : subject)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                >
                                    <Text style={[styles.chipText, active && { color: theme.accentText }]}>{subject}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    {/* Grade-level filter row: only rendered at all once
                        gradeLevels has entries (i.e. a subject is selected
                        and its grade options have loaded). No "All" chip
                        here -- tapping the already-active grade toggles it
                        off (clearing the grade filter), same pattern as the
                        subject chips above. */}
                    {gradeLevels.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                            {gradeLevels.map((grade) => {
                                const active = grade === selectedGrade;
                                return (
                                    <Pressable
                                        key={grade}
                                        style={[styles.chipSmall, active && { backgroundColor: resolvedAccentColor, borderColor: resolvedAccentColor }]}
                                        onPress={() => setSelectedGrade(active ? null : grade)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                    >
                                        <Text style={[styles.chipTextSmall, active && { color: theme.accentText }]}>{grade}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    )}

                    {/* Results list: three mutually exclusive states --
                        spinner while a search is in flight, an empty-state
                        message when the search returned nothing, or the
                        actual list of matching StandardRows.
                        keyboardShouldPersistTaps="handled" lets a tap on a
                        result row register even if the on-screen keyboard
                        is currently focused/open on the search box above,
                        which ScrollView would otherwise swallow as a
                        "dismiss keyboard" tap. */}
                    <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled">
                        {loading ? (
                            <ActivityIndicator size="small" color={resolvedAccentColor} style={{ marginTop: 16 }} />
                        ) : results.length === 0 ? (
                            <Text style={styles.emptyText}>No standards match this search.</Text>
                        ) : (
                            results.map((standard) => (
                                // Tapping a result both reports the pick to
                                // the parent (onSelect) and closes the
                                // modal (onClose) in one action -- there's
                                // no separate "confirm" step.
                                <Pressable
                                    key={standard.id}
                                    style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}
                                    onPress={() => {
                                        onSelect(standard);
                                        onClose();
                                    }}
                                    accessibilityRole="button"
                                >
                                    <View style={styles.resultHeaderRow}>
                                        <Text style={[styles.resultCode, { color: resolvedAccentColor }]}>{standard.code}</Text>
                                        <Text style={styles.resultMeta}>
                                            {standard.subject} · {standard.gradeLevel}
                                        </Text>
                                    </View>
                                    <Text style={styles.resultDescription} numberOfLines={2}>
                                        {standard.description}
                                    </Text>
                                </Pressable>
                            ))
                        )}
                    </ScrollView>
                </View>
            </ModalBackdrop>
        </Modal>
    );
}

// Theme-aware style factory: rebuilt each render so every color tracks the
// current theme. Groups: overlay/sheet shell, title/close button, the
// search input, the two chip-row styles (subject-size and smaller
// grade-size chips), and the results list row/text styles.
const getStyles = (theme: Theme) => StyleSheet.create({
    overlay: {
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: theme.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: theme.border,
        paddingTop: 24,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        paddingHorizontal: 20,
        width: '100%',
        maxWidth: 760,
        alignSelf: 'center',
        height: '80%',
    },
    title: {
        fontSize: 18,
        fontFamily: 'Georgia',
        fontWeight: '800',
        color: theme.text,
        marginBottom: 12,
        marginTop: 6,
        textAlign: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 14,
        right: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 14,
        zIndex: 10,
    },
    closeButtonText: { fontSize: 12, fontWeight: '700', color: theme.accentText, letterSpacing: 0.5 },
    searchInput: {
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        color: theme.text,
        marginBottom: 10,
    },
    chipRow: { gap: 8, paddingBottom: 8 },
    chip: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 13 },
    chipText: { fontSize: 12, fontWeight: '700', color: theme.text },
    chipSmall: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 11 },
    chipTextSmall: { fontSize: 11.5, fontWeight: '700', color: theme.text },
    resultsScroll: { flex: 1, marginTop: 6 },
    emptyText: { fontSize: 13, fontStyle: 'italic', color: theme.subtext, marginTop: 16 },
    resultRow: { borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 10 },
    resultHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    resultCode: { fontSize: 13.5, fontWeight: '800' },
    resultMeta: { fontSize: 10.5, fontWeight: '600', color: theme.subtext, textAlign: 'right', flexShrink: 1 },
    resultDescription: { fontSize: 12.5, lineHeight: 17, color: theme.text, marginTop: 3 },
});
