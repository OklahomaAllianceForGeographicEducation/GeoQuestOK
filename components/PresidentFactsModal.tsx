// components/PresidentFactsModal.tsx
// A light, swipeable "did you know" card deck of presidential visits to
// Oklahoma -- the reward content unlocked by finishing the Presidential
// Fitness Challenge (see lib/presidentVisits.ts). Deliberately NOT a quiz
// and NOT tied to academic standards: just fun facts, styled to match the
// Field Journal's parchment look on the Passport screen.

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { fetchPresidentVisitFacts, type PresidentVisitFact } from '../lib/presidentVisits';
import ModalBackdrop from './ModalBackdrop';

export default function PresidentFactsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [facts, setFacts] = useState<PresidentVisitFact[]>([]);
    const [index, setIndex] = useState(0);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setIndex(0);
        void loadFacts();
    }, [visible]);

    async function loadFacts() {
        try {
            setLoading(true);
            setLoadError(null);
            const rows = await fetchPresidentVisitFacts();
            setFacts(rows);
        } catch (err: any) {
            setLoadError(err.message || 'Could not load these facts right now.');
        } finally {
            setLoading(false);
        }
    }

    const fact = facts[index];
    const isFirst = index === 0;
    const isLast = index === facts.length - 1;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <ModalBackdrop style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
                    <Text style={styles.kicker}>🏛️ PRESIDENTS IN OKLAHOMA</Text>

                    {loading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator size="small" color="#4E3629" />
                        </View>
                    ) : loadError ? (
                        <View style={styles.centered}>
                            <Text style={styles.errorText}>{loadError}</Text>
                        </View>
                    ) : !fact ? (
                        <View style={styles.centered}>
                            <Text style={styles.errorText}>No facts yet -- check back soon!</Text>
                        </View>
                    ) : (
                        <>
                            <View style={styles.divider} />
                            {fact.year ? <Text style={styles.year}>{fact.year}</Text> : null}
                            <Text style={styles.title}>{fact.title}</Text>
                            <Text style={styles.body}>{fact.body}</Text>
                            {fact.funDetail ? (
                                <View style={styles.funBox}>
                                    <Text style={styles.funLabel}>DID YOU KNOW?</Text>
                                    <Text style={styles.funText}>{fact.funDetail}</Text>
                                </View>
                            ) : null}

                            <View style={styles.pagerRow}>
                                <Pressable
                                    style={[styles.pagerButton, isFirst && styles.pagerButtonDisabled]}
                                    disabled={isFirst}
                                    onPress={() => setIndex((i) => Math.max(0, i - 1))}
                                >
                                    <Ionicons name="chevron-back" size={18} color={isFirst ? '#C8C4B7' : '#4E3629'} />
                                </Pressable>
                                <Text style={styles.pagerCount}>{index + 1} / {facts.length}</Text>
                                <Pressable
                                    style={[styles.pagerButton, isLast && styles.pagerButtonDisabled]}
                                    disabled={isLast}
                                    onPress={() => setIndex((i) => Math.min(facts.length - 1, i + 1))}
                                >
                                    <Ionicons name="chevron-forward" size={18} color={isLast ? '#C8C4B7' : '#4E3629'} />
                                </Pressable>
                            </View>
                        </>
                    )}

                    <Pressable style={styles.closeButton} onPress={onClose}>
                        <Text style={styles.closeButtonText}>Return to Logbook</Text>
                    </Pressable>
                </Pressable>
            </ModalBackdrop>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 520,
        borderWidth: 2,
        borderColor: '#4E3629',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#A3803B', textAlign: 'center' },
    divider: { height: 1, backgroundColor: '#4E3629', opacity: 0.25, marginTop: 10, marginBottom: 14 },
    centered: { paddingVertical: 30, alignItems: 'center' },
    errorText: { fontSize: 13, color: '#8A8273', fontStyle: 'italic', textAlign: 'center' },
    year: { fontSize: 11, fontWeight: '800', color: '#8A8273', letterSpacing: 1, textAlign: 'center', marginBottom: 4 },
    title: { fontSize: 19, fontWeight: '800', fontFamily: 'Georgia', color: '#4E3629', textAlign: 'center', marginBottom: 10 },
    body: { fontSize: 14, lineHeight: 20, color: '#3A352B', fontFamily: 'Georgia', textAlign: 'center' },
    funBox: { marginTop: 14, backgroundColor: '#FBF3E1', borderRadius: 12, borderWidth: 1, borderColor: '#E8D9B5', padding: 12 },
    funLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#A3803B', marginBottom: 4, textAlign: 'center' },
    funText: { fontSize: 13, lineHeight: 18, color: '#5C4A22', textAlign: 'center' },
    pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 18 },
    pagerButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#DDD9D0', alignItems: 'center', justifyContent: 'center' },
    pagerButtonDisabled: { opacity: 0.4 },
    pagerCount: { fontSize: 12, fontWeight: '700', color: '#8A8273', minWidth: 44, textAlign: 'center' },
    closeButton: { marginTop: 18, alignSelf: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD9D0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
    closeButtonText: { color: '#4E3629', fontWeight: '700', fontSize: 13 },
});
