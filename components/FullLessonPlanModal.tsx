// components/FullLessonPlanModal.tsx
// Renders a full lesson plan (objectives/materials/procedures/extension/
// assessment/standards) natively in-app, in place of opening a .docx file.
// This is the "go deeper" layer a teacher opens on purpose from a subject
// card on the curriculum tab -- not a replacement for the short blurb
// already shown there.

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
// Deliberately importing ScrollView from react-native-gesture-handler
// rather than plain react-native: this modal also has active Gesture.Pan
// handlers (the header drag-to-dismiss below, plus EdgeSwipeBack) inside
// its own local GestureHandlerRootView. Mixing RNGH's gesture system with
// a vanilla react-native ScrollView in the same root is a known source of
// swallowed touch/scroll events on Android (iOS's touch handling is more
// forgiving of the mix) -- using RNGH's own ScrollView keeps it in the
// same gesture arena as the Pan handlers so Android recognizes the scroll.
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { colors } from '../commonStyles';
import EdgeSwipeBack from './EdgeSwipeBack';
import ModalBackdrop from './ModalBackdrop';
import type { FullLessonPlan } from '../lib/fullLessons';

// How far down (in px) a drag has to travel before it counts as "swipe to
// dismiss" rather than snapping back open.
const DISMISS_THRESHOLD = 120;

function Section({ label, children, theme }: { label: string; children: React.ReactNode; theme: typeof colors.light }) {
    return (
        <View style={{ marginTop: 20 }}>
            <Text style={[styles.sectionLabel, { color: theme.accent }]}>{label}</Text>
            {children}
        </View>
    );
}

function BulletList({ items, theme }: { items: string[]; theme: typeof colors.light }) {
    return (
        <View style={{ gap: 6 }}>
            {items.map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: theme.accent }]}>•</Text>
                    <Text style={[styles.bulletText, { color: theme.text }]}>{item}</Text>
                </View>
            ))}
        </View>
    );
}

function NumberedList({ items, theme }: { items: string[]; theme: typeof colors.light }) {
    return (
        <View style={{ gap: 8 }}>
            {items.map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.numberBadge, { color: theme.accent, borderColor: theme.border }]}>{i + 1}</Text>
                    <Text style={[styles.bulletText, { color: theme.text, flex: 1 }]}>{item}</Text>
                </View>
            ))}
        </View>
    );
}

export default function FullLessonPlanModal({
    visible,
    lesson,
    trailName,
    onClose,
}: {
    visible: boolean;
    lesson: FullLessonPlan | null;
    trailName: string;
    onClose: () => void;
}) {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];

    // Vertical drag offset for the swipe-to-dismiss gesture, applied to the
    // sheet's translateY. Reset to 0 every time the modal opens so a
    // previous drag doesn't leave the next lesson's sheet part-way closed.
    const translateY = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (visible) translateY.setValue(0);
    }, [visible, translateY]);

    // Measured height of the drag-handle + header bar, so the left-edge
    // swipe-back strip can start below it instead of overlapping the
    // close button — see the onLayout on that block below.
    const [headerHeight, setHeaderHeight] = useState(0);

    // Swipe-to-dismiss over the drag handle + header bar (the whole strip
    // above the header's bottom divider). activeOffsetY means a plain tap
    // (e.g. on the close button) never activates the pan, so it still
    // reaches the Pressable underneath; only a real downward drag does.
    const panGesture = Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY(10)
        .failOffsetX([-15, 15])
        .onUpdate((e) => {
            if (e.translationY > 0) translateY.setValue(e.translationY);
        })
        .onEnd((e) => {
            if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 1200) {
                Animated.timing(translateY, {
                    toValue: 800,
                    duration: 180,
                    useNativeDriver: true,
                }).start(() => onClose());
            } else {
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 6,
                }).start();
            }
        });

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
            onShow={() => translateY.setValue(0)}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <ModalBackdrop style={styles.overlay} onPress={onClose}>
                    {/* Stops a tap inside the sheet from bubbling up to the
                        backdrop's onPress={onClose} above -- otherwise
                        tapping anywhere in the lesson content, not just
                        outside the card, would close it. */}
                    <Pressable style={styles.sheetPressable} onPress={(e) => e.stopPropagation()}>
                    <Animated.View
                        style={[
                            styles.sheet,
                            { backgroundColor: theme.background, borderColor: theme.border, transform: [{ translateY }] },
                        ]}
                    >
                        {/* The drag handle + header bar (everything above the
                            header's bottom divider) are the swipe-to-dismiss
                            target — kept separate from the ScrollView below so
                            dragging never fights with scrolling the lesson
                            content. The X button still works too; this is an
                            additional way out, not a replacement. onLayout
                            measures its real height so EdgeSwipeBack below
                            can start right after it, instead of overlapping
                            the close button. */}
                        <GestureDetector gesture={panGesture}>
                            <View collapsable={false} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
                                <View style={styles.dragHandle} />
                                <View style={[styles.headerBar, { borderColor: theme.border }]}>
                                    <Text style={[styles.headerKicker, { color: theme.accent }]}>FULL LESSON PLAN</Text>
                                    <Pressable onPress={onClose} hitSlop={10}>
                                        <Ionicons name="close" size={22} color={theme.text} />
                                    </Pressable>
                                </View>
                            </View>
                        </GestureDetector>

                        {/* A plain position:absolute sibling — deliberately
                            NOT wrapped in a flex:1 View here. `sheet` has no
                            explicit height (it sizes to content, capped at
                            maxHeight), and a flex:1 child inside an
                            auto-height parent collapses it instead of
                            filling it (flex:1 implies flexBasis:0, so it
                            contributes nothing to the parent's computed
                            content height) — that's what made the sheet
                            render "stuck low" before. Absolute positioning
                            opts this out of the flex layout entirely, so it
                            can't affect the sheet's sizing at all. */}
                        <EdgeSwipeBack onSwipeBack={onClose} topOffset={headerHeight} />

                        {!lesson ? (
                            <View style={styles.centered}>
                                <Text style={{ color: theme.subtext }}>Loading…</Text>
                            </View>
                        ) : (
                            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                                <Text style={[styles.trailChip, { color: theme.subtext }]}>{trailName}</Text>
                                <Text style={[styles.title, { color: theme.text }]}>{lesson.title}</Text>
                                {lesson.subtitle ? <Text style={[styles.subtitle, { color: theme.subtext }]}>{lesson.subtitle}</Text> : null}

                                <View style={styles.metaRow}>
                                    <View style={[styles.metaPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                        <Text style={[styles.metaPillText, { color: theme.text }]}>
                                            {lesson.gradeTier === 'elementary' ? 'Elementary' : 'Secondary'}
                                        </Text>
                                    </View>
                                    {lesson.timeFrame ? (
                                        <View style={[styles.metaPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <Ionicons name="time-outline" size={12} color={theme.subtext} />
                                            <Text style={[styles.metaPillText, { color: theme.text, marginLeft: 4 }]}>{lesson.timeFrame}</Text>
                                        </View>
                                    ) : null}
                                </View>

                                <Section label="CONNECTION TO THE APP" theme={theme}>
                                    <Text style={[styles.bodyText, { color: theme.text }]}>{lesson.appConnection}</Text>
                                </Section>

                                <Section label="PURPOSE" theme={theme}>
                                    <Text style={[styles.bodyText, { color: theme.text }]}>{lesson.purpose}</Text>
                                </Section>

                                {lesson.standards.length > 0 && (
                                    <Section label="OKLAHOMA ACADEMIC STANDARDS" theme={theme}>
                                        <View style={{ gap: 10 }}>
                                            {lesson.standards.map((std, i) => (
                                                <View key={i} style={[styles.standardCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                    <Text style={[styles.standardCode, { color: theme.accent }]}>
                                                        {std.code} <Text style={[styles.standardMeta, { color: theme.subtext }]}>— {std.subjectLabel}, {std.gradeLevel}</Text>
                                                    </Text>
                                                    <Text style={[styles.standardDesc, { color: theme.text }]}>{std.description}</Text>
                                                </View>
                                            ))}
                                        </View>
                                        {lesson.standardsNote ? (
                                            <Text style={[styles.standardsNote, { color: theme.subtext }]}>{lesson.standardsNote}</Text>
                                        ) : null}
                                    </Section>
                                )}

                                <Section label="OBJECTIVES" theme={theme}>
                                    <BulletList items={lesson.objectives} theme={theme} />
                                </Section>

                                <Section label="MATERIALS" theme={theme}>
                                    <BulletList items={lesson.materials} theme={theme} />
                                </Section>

                                <Section label="PROCEDURES" theme={theme}>
                                    <NumberedList items={lesson.procedures} theme={theme} />
                                </Section>

                                {lesson.extension.length > 0 && (
                                    <Section label="EXTENSION / ENRICHMENT" theme={theme}>
                                        <BulletList items={lesson.extension} theme={theme} />
                                    </Section>
                                )}

                                {lesson.assessment ? (
                                    <Section label="ASSESSMENT" theme={theme}>
                                        <Text style={[styles.bodyText, { color: theme.text }]}>{lesson.assessment}</Text>
                                    </Section>
                                ) : null}
                            </ScrollView>
                        )}
                    </Animated.View>
                    </Pressable>
                </ModalBackdrop>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { justifyContent: 'flex-end' },
    // height: '100%' (not just width) matters here on web specifically:
    // `sheet` below clamps itself with `maxHeight: '92%'`, and a
    // percentage height only resolves against a parent with an actual
    // computed height -- native's Modal host already provides that
    // implicitly, but react-native-web renders this as real CSS, where an
    // auto-height parent makes `maxHeight: '92%'` on the child a no-op.
    // Without this, the sheet grew to its full content height and
    // overflowed past the bottom of the viewport on long lesson plans.
    // justifyContent: 'flex-end' here (in addition to the parent
    // overlay's own flex-end) keeps the sheet bottom-anchored now that
    // this wrapper itself fills the full height rather than shrinking to
    // its content.
    sheetPressable: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
    sheet: { width: '100%', maxWidth: 980, alignSelf: 'center', maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1 },
    dragHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(120,120,120,0.35)', marginTop: 8 },
    headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    centered: { padding: 40, alignItems: 'center' },
    trailChip: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    title: { fontSize: 22, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 4 },
    subtitle: { fontSize: 14, fontStyle: 'italic', marginBottom: 4 },
    metaRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    metaPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    metaPillText: { fontSize: 11, fontWeight: '700' },
    sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
    bodyText: { fontSize: 14, lineHeight: 20 },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bulletDot: { fontSize: 14, lineHeight: 20 },
    bulletText: { fontSize: 14, lineHeight: 20, flex: 1 },
    numberBadge: { fontSize: 12, fontWeight: '800', width: 20, height: 20, borderRadius: 10, borderWidth: 1, textAlign: 'center', lineHeight: 18 },
    standardCard: { borderWidth: 1, borderRadius: 12, padding: 12 },
    standardCode: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    standardMeta: { fontSize: 11, fontWeight: '600', fontStyle: 'italic' },
    standardDesc: { fontSize: 13, lineHeight: 18 },
    standardsNote: { fontSize: 11, fontStyle: 'italic', marginTop: 8, lineHeight: 15 },
});
