import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchGradeLevelsForSubject, fetchStandardSubjects, searchStandards, type StandardRow } from '../lib/standards';
import ModalBackdrop from './ModalBackdrop';

type StandardPickerModalProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (standard: StandardRow) => void;
    accentColor?: string;
    initialSubject?: string;
};

export default function StandardPickerModal({
    visible,
    onClose,
    onSelect,
    accentColor = '#FF5722',
    initialSubject,
}: StandardPickerModalProps) {
    const [subjects, setSubjects] = useState<string[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [gradeLevels, setGradeLevels] = useState<string[]>([]);
    const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState<StandardRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setKeyword('');
        setSelectedSubject(initialSubject ?? null);
        void fetchStandardSubjects().then(setSubjects);
    }, [visible, initialSubject]);

    useEffect(() => {
        if (!visible || !selectedSubject) {
            setGradeLevels([]);
            return;
        }
        void fetchGradeLevelsForSubject(selectedSubject).then(setGradeLevels);
    }, [visible, selectedSubject]);

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

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <ModalBackdrop style={styles.overlay}>
                <View style={styles.sheet}>
                    <Pressable style={[styles.closeButton, { backgroundColor: accentColor }]} onPress={onClose}>
                        <Text style={styles.closeButtonText}>Close</Text>
                    </Pressable>

                    <Text style={styles.title}>Pick a Standard</Text>

                    <TextInput
                        style={styles.searchInput}
                        value={keyword}
                        onChangeText={setKeyword}
                        placeholder="Search by code or keyword"
                        placeholderTextColor="#8E8E93"
                    />

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                        <Pressable
                            style={[styles.chip, !selectedSubject && { backgroundColor: accentColor, borderColor: accentColor }]}
                            onPress={() => setSelectedSubject(null)}
                        >
                            <Text style={[styles.chipText, !selectedSubject && { color: '#FFF' }]}>All</Text>
                        </Pressable>
                        {subjects.map((subject) => {
                            const active = subject === selectedSubject;
                            return (
                                <Pressable
                                    key={subject}
                                    style={[styles.chip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
                                    onPress={() => setSelectedSubject(active ? null : subject)}
                                >
                                    <Text style={[styles.chipText, active && { color: '#FFF' }]}>{subject}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    {gradeLevels.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                            {gradeLevels.map((grade) => {
                                const active = grade === selectedGrade;
                                return (
                                    <Pressable
                                        key={grade}
                                        style={[styles.chipSmall, active && { backgroundColor: accentColor, borderColor: accentColor }]}
                                        onPress={() => setSelectedGrade(active ? null : grade)}
                                    >
                                        <Text style={[styles.chipTextSmall, active && { color: '#FFF' }]}>{grade}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    )}

                    <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled">
                        {loading ? (
                            <ActivityIndicator size="small" color={accentColor} style={{ marginTop: 16 }} />
                        ) : results.length === 0 ? (
                            <Text style={styles.emptyText}>No standards match this search.</Text>
                        ) : (
                            results.map((standard) => (
                                <Pressable
                                    key={standard.id}
                                    style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}
                                    onPress={() => {
                                        onSelect(standard);
                                        onClose();
                                    }}
                                >
                                    <View style={styles.resultHeaderRow}>
                                        <Text style={[styles.resultCode, { color: accentColor }]}>{standard.code}</Text>
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

const styles = StyleSheet.create({
    overlay: {
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#FAF9F5',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: '#C8C4B7',
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
        color: '#4E3629',
        marginBottom: 12,
        marginTop: 6,
        textAlign: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 14,
        right: 16,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 14,
        zIndex: 10,
    },
    closeButtonText: { fontSize: 12, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
    searchInput: {
        borderWidth: 1,
        borderColor: '#C8C4B7',
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        color: '#4E3629',
        marginBottom: 10,
    },
    chipRow: { gap: 8, paddingBottom: 8 },
    chip: { borderWidth: 1, borderColor: '#C8C4B7', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13 },
    chipText: { fontSize: 12, fontWeight: '700', color: '#4E3629' },
    chipSmall: { borderWidth: 1, borderColor: '#C8C4B7', backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 11 },
    chipTextSmall: { fontSize: 11.5, fontWeight: '700', color: '#4E3629' },
    resultsScroll: { flex: 1, marginTop: 6 },
    emptyText: { fontSize: 13, fontStyle: 'italic', color: '#8E8E93', marginTop: 16 },
    resultRow: { borderBottomWidth: 1, borderBottomColor: '#E5E1D4', paddingVertical: 10 },
    resultHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    resultCode: { fontSize: 13.5, fontWeight: '800' },
    resultMeta: { fontSize: 10.5, fontWeight: '600', color: '#8E8E93', textAlign: 'right', flexShrink: 1 },
    resultDescription: { fontSize: 12.5, lineHeight: 17, color: '#4E3629', marginTop: 3 },
});
