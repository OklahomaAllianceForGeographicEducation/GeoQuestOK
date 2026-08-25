// components/PresidentFactsModal.tsx
//
// FILE OVERVIEW
// -------------
// Component: PresidentFactsModal (default export)
// Platform: SHARED -- a single implementation of react-native primitives
//   (Modal, Pressable, Text, View) that renders the same on iOS, Android,
//   and web. There is no `.native.tsx` / `.web.tsx` split here.
// Responsibility: a light, swipeable "did you know" card deck of
//   presidential visits to Oklahoma -- the reward content unlocked by
//   finishing the Presidential Fitness Challenge (see
//   lib/presidentVisits.ts). Deliberately NOT a quiz and NOT tied to
//   academic standards: just fun facts, styled to match the Field Journal's
//   parchment look on the Passport screen. Facts are fetched once when the
//   modal opens, and the student pages through them one at a time with
//   next/back arrows.

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

// PresidentFactsModal
// --------------------
// Purpose: show a full-screen (but visually card-like) modal presenting a
// deck of presidential-visit fun facts, one at a time, with pager controls
// to move forward/back through them.
//
// Props:
// - visible: whether the modal should currently be shown. Also acts as the
//   trigger for (re)loading facts -- see the useEffect below.
// - onClose: called when the student taps the backdrop or the "Return to
//   Logbook" button, so the parent can hide this modal.
//
// Returns: a <Modal> containing a parchment-styled card. The card shows one
// of four mutually exclusive states depending on data-loading progress: a
// spinner (loading), an error message (load failed), a "no facts yet"
// message (loaded but empty), or the current fact plus pager controls.
export default function PresidentFactsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    // Whether the initial fetch of facts is still in flight. Starts true so
    // the very first render (before the effect below has a chance to run)
    // shows a spinner instead of a flash of empty content.
    const [loading, setLoading] = useState(true);
    // The full list of facts fetched from Supabase (via
    // fetchPresidentVisitFacts). Empty until the fetch resolves.
    const [facts, setFacts] = useState<PresidentVisitFact[]>([]);
    // Which fact in `facts` is currently being displayed (0-based). Reset to
    // 0 every time the modal is (re)opened, so a student always starts at
    // the first fact rather than wherever they left off last time.
    const [index, setIndex] = useState(0);
    // Holds a human-readable error message if the fetch fails; null means
    // "no error." Shown instead of a fact card when non-null.
    const [loadError, setLoadError] = useState<string | null>(null);

    // Loads (or reloads) the fact deck every time the modal transitions to
    // visible. Guarded by `if (!visible) return` so this does nothing while
    // the modal is hidden -- it only fires on the render where `visible`
    // flips from false to true (or is true on first mount). Resetting
    // `index` to 0 here (rather than inside loadFacts) ensures the pager
    // position resets immediately, without waiting on the network request.
    useEffect(() => {
        if (!visible) return;
        setIndex(0);
        void loadFacts();
    }, [visible]);

    // Fetches the list of presidential-visit facts and updates state
    // accordingly. Not memoized with useCallback since it's only ever
    // invoked from the effect above (and only while this component is
    // mounted), so there's no risk of it going stale or causing extra
    // effect re-runs.
    async function loadFacts() {
        try {
            setLoading(true);
            setLoadError(null);
            const rows = await fetchPresidentVisitFacts();
            setFacts(rows);
        } catch (err: any) {
            // err.message may be undefined for non-Error throws, hence the
            // fallback string.
            setLoadError(err.message || 'Could not load these facts right now.');
        } finally {
            setLoading(false);
        }
    }

    // The fact currently on screen (undefined if `facts` is empty or index
    // is out of range, which the render logic below checks for via `!fact`).
    const fact = facts[index];
    // Used to disable/grey out the "back" pager arrow on the first card.
    const isFirst = index === 0;
    // Used to disable/grey out the "forward" pager arrow on the last card.
    const isLast = index === facts.length - 1;

    return (
        // transparent + fade: this Modal is meant to look like a card
        // floating over a dimmed backdrop rather than a full opaque screen
        // transition.
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            {/* ModalBackdrop renders the dimmed background and calls
                onClose when tapped anywhere outside the card. */}
            <ModalBackdrop style={styles.overlay} onPress={onClose}>
                {/* Stopping propagation here means tapping inside the card
                    itself does NOT bubble up to the backdrop's onPress, so
                    the modal only closes on an actual outside tap. */}
                <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
                    <Text style={styles.kicker}>🏛️ PRESIDENTS IN OKLAHOMA</Text>

                    {/* Four mutually exclusive states, checked in priority
                        order: still loading, then a load error, then "no
                        facts at all," and finally the normal card content.
                        Only one of these four branches ever renders at a
                        time. */}
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
                            {/* year and funDetail are optional fields on a
                                fact -- both are conditionally rendered only
                                when present. */}
                            {fact.year ? <Text style={styles.year}>{fact.year}</Text> : null}
                            <Text style={styles.title}>{fact.title}</Text>
                            <Text style={styles.body}>{fact.body}</Text>
                            {fact.funDetail ? (
                                <View style={styles.funBox}>
                                    <Text style={styles.funLabel}>DID YOU KNOW?</Text>
                                    <Text style={styles.funText}>{fact.funDetail}</Text>
                                </View>
                            ) : null}

                            {/* Pager row: back arrow, "N / total" counter,
                                forward arrow. Each arrow clamps the index
                                with Math.max/Math.min so repeatedly tapping
                                at either end can't push `index` out of
                                bounds (redundant with the `disabled` prop,
                                but a safe belt-and-suspenders guard). */}
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

// Static (non-theme-dependent) styles for the parchment-look card: overlay
// centering, the card shell/shadow, typography for the kicker/title/body,
// the "fun fact" callout box, and the pager row/buttons/counter.
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
    errorText: { fontSize: 13, color: '#756D5E', fontStyle: 'italic', textAlign: 'center' },
    year: { fontSize: 11, fontWeight: '800', color: '#756D5E', letterSpacing: 1, textAlign: 'center', marginBottom: 4 },
    title: { fontSize: 19, fontWeight: '800', fontFamily: 'Georgia', color: '#4E3629', textAlign: 'center', marginBottom: 10 },
    body: { fontSize: 14, lineHeight: 20, color: '#3A352B', fontFamily: 'Georgia', textAlign: 'center' },
    funBox: { marginTop: 14, backgroundColor: '#FBF3E1', borderRadius: 12, borderWidth: 1, borderColor: '#E8D9B5', padding: 12 },
    funLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#A3803B', marginBottom: 4, textAlign: 'center' },
    funText: { fontSize: 13, lineHeight: 18, color: '#5C4A22', textAlign: 'center' },
    pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 18 },
    pagerButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#DDD9D0', alignItems: 'center', justifyContent: 'center' },
    pagerButtonDisabled: { opacity: 0.4 },
    pagerCount: { fontSize: 12, fontWeight: '700', color: '#756D5E', minWidth: 44, textAlign: 'center' },
    closeButton: { marginTop: 18, alignSelf: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD9D0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
    closeButtonText: { color: '#4E3629', fontWeight: '700', fontSize: 13 },
});
