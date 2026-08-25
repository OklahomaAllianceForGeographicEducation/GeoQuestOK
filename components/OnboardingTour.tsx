// components/OnboardingTour.tsx
// First-run guided tour, shown once per app shell per device. Mount one of
// these per role-based layout (see app/(tabs)/_layout.tsx and its four
// siblings) with that shell's TourAudience; content and per-step targets
// live in lib/onboarding.ts, not here.
//
// Two kinds of step, decided per-step by whether lib/onboarding.ts gave it
// a `targetKey`:
//   - a small floating card (welcome/closing) with a title, body, and an
//     icon badge, centered over a dimmed backdrop -- never a full-screen
//     takeover; or
//   - a "spotlight": navigates to the step's `route`, measures the real
//     control registered under `targetKey` (see
//     components/tour/TourTarget.tsx), dims everything else on screen, and
//     puts a tooltip next to it.
//
// `active` should be false whenever the current viewer isn't a genuine
// member of this audience — e.g. a teacher/OKAGE/site-admin user previewing
// the student view via active_view. Passing `ready={false}` until that
// preview check has actually resolved avoids a one-frame flash of the tour
// before the caller knows which case it's in.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../commonStyles';
import { hasSeenTour, markTourSeen, onTourReplayRequested, TOURS, TourAudience } from '../lib/onboarding';
import { TargetRect, useTourTargetsContext } from '../lib/tourTargets';
import Button from './Button';

type OnboardingTourProps = {
    tourId: TourAudience;
    // Whether this viewer is eligible to see this tour at all. Defaults to
    // true for shells with no preview concept of their own.
    active?: boolean;
    // Whether the caller's own eligibility check has resolved. Defaults to
    // true for the same reason.
    ready?: boolean;
    onDismiss?: () => void;
};

// How long to keep polling for a step's target to mount/measure before
// giving up and falling back to a plain centered card for that step (e.g.
// after navigating to a route whose screen takes a moment to render).
const LOCATE_TIMEOUT_MS = 3000;
const LOCATE_POLL_MS = 100;

// Rough card height used only to decide whether a tooltip fits below the
// spotlighted target or needs to go above it -- doesn't need to be exact,
// just enough to avoid the common case of running off the bottom edge.
const ESTIMATED_TOOLTIP_HEIGHT = 220;
const SPOTLIGHT_PADDING = 6;
// How long to wait after asking the page to scroll a target into view
// before trusting a measurement -- long enough for a smooth-scroll to
// settle, short enough not to make the tour feel laggy.
const SCROLL_SETTLE_MS = 300;

// OnboardingTour
// The exported component itself. See the file-level comment above for the
// overall design (first-run guided tour, floating cards vs. spotlight
// steps). One instance of this should be mounted per role-based app shell.
// Props:
// - tourId: which tour definition (from lib/onboarding.ts's TOURS map) this
//   instance shows -- also used as the storage key for "has this been
//   seen" and as the channel for manual replay requests.
// - active: whether this viewer is really a member of this tour's
//   audience. Defaults to true.
// - ready: whether the caller's own eligibility check (e.g. an
//   active_view preview check) has resolved yet. Defaults to true.
// - onDismiss: optional callback fired whenever the tour ends (finished or
//   skipped).
// Returns: a React Native <Modal> containing either a FloatingCard or a
// SpotlightOverlay for the current step, or null while the tour isn't
// active/visible.
export default function OnboardingTour({ tourId, active = true, ready = true, onDismiss }: OnboardingTourProps) {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { measure, scrollIntoView } = useTourTargetsContext();
    const { width: screenW, height: screenH } = useWindowDimensions();
    const tour = TOURS[tourId];

    // visible: whether the tour's Modal is currently shown. Starts false;
    // flipped true either by the first-run effect below (tour hasn't been
    // seen yet) or by a manual "Replay Tour" request.
    const [visible, setVisible] = useState(false);
    // stepIndex: which step of `tour.steps` is currently being shown.
    // Advances via `advance()`/onNext, or moves back via onBack.
    const [stepIndex, setStepIndex] = useState(0);
    // null while there's no target to show (card steps), or while a
    // spotlight step's target hasn't been located yet.
    const [spotlightRect, setSpotlightRect] = useState<TargetRect | null>(null);
    // True once a spotlight step's target has been searched for and never
    // showed up -- falls back to a plain card rather than leaving the tour
    // stuck on an invisible overlay.
    const [targetMissing, setTargetMissing] = useState(false);

    // step: the current step's full definition (title, body, icon, and
    // optionally targetKey/route for a spotlight step), looked up fresh
    // every render from `tour.steps[stepIndex]`.
    const step = tour.steps[stepIndex];

    // First-run: show automatically the first time this device hasn't
    // dismissed this exact tour version.
    useEffect(() => {
        if (!ready) return;

        if (!active) {
            setVisible(false);
            return;
        }

        let cancelled = false;
        hasSeenTour(tour.id, tour.version).then((seen) => {
            if (!cancelled && !seen) {
                setStepIndex(0);
                setVisible(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [ready, active, tour.id, tour.version]);

    // Manual re-open, e.g. a "Replay Tour" row on an account screen (see
    // lib/onboarding.ts's requestTourReplay).
    useEffect(() => {
        return onTourReplayRequested(tourId, () => {
            setStepIndex(0);
            setVisible(true);
        });
    }, [tourId]);

    // Locate the current step's target: navigate to its route if it has
    // one, then poll until the target measures or we give up.
    useEffect(() => {
        if (!visible) return;

        if (!step.targetKey) {
            setSpotlightRect(null);
            setTargetMissing(false);
            return;
        }

        if (step.route) {
            router.navigate(step.route as any);
        }

        let cancelled = false;
        let elapsed = 0;
        setSpotlightRect(null);
        setTargetMissing(false);

        const tick = () => {
            if (cancelled) return;
            measure(step.targetKey!).then((rect) => {
                if (cancelled) return;
                if (rect && rect.width > 0 && rect.height > 0) {
                    // Found it, but don't trust this measurement yet: the
                    // target may be below the fold (needs scrolling) or
                    // mid-navigation-transition (a stale/transient
                    // position). Ask for a scroll, wait for it to settle,
                    // then measure once more before locking in a rect --
                    // otherwise the ring can end up framing whatever
                    // happened to be at that position instead of the
                    // actual target (e.g. the tab bar, if the target was
                    // still off-screen at the first measurement).
                    const scrolled = scrollIntoView(step.targetKey!);
                    if (!scrolled) {
                        setSpotlightRect(rect);
                        return;
                    }
                    setTimeout(() => {
                        if (cancelled) return;
                        measure(step.targetKey!).then((settledRect) => {
                            if (cancelled) return;
                            setSpotlightRect(settledRect ?? rect);
                        });
                    }, SCROLL_SETTLE_MS);
                    return;
                }
                elapsed += LOCATE_POLL_MS;
                if (elapsed >= LOCATE_TIMEOUT_MS) {
                    setTargetMissing(true);
                    return;
                }
                setTimeout(tick, LOCATE_POLL_MS);
            });
        };
        tick();

        return () => {
            cancelled = true;
        };
        // Re-run on window resize too, so an in-progress spotlight
        // re-measures after an orientation change or a resized web window.
    }, [visible, stepIndex, step.targetKey, step.route, screenW, screenH]);

    // finish
    // Ends the tour: hides the Modal, persists to storage (via
    // markTourSeen) that this tour/version has been seen so it won't
    // auto-show again on future launches, and notifies the parent screen
    // via the optional onDismiss callback. Called both when the student
    // reaches the last step's "Let's go" button and when they tap "Skip".
    const finish = () => {
        setVisible(false);
        markTourSeen(tour.id, tour.version);
        onDismiss?.();
    };

    // Nothing to render while the tour isn't active -- returning null here
    // (rather than always rendering the Modal with visible={false}) avoids
    // doing any of the target-locating work in the effect above when the
    // tour isn't actually showing.
    if (!visible) return null;

    // isFirst/isLast: whether the current step is the first/last in this
    // tour -- used to hide the "Back" link on step 1, and to change the
    // "Next" button's label to "Let's go" on the final step.
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === tour.steps.length - 1;
    const nextLabel = isLast ? "Let's go" : 'Next';
    // advance
    // Handler for the "Next"/"Let's go" button: moves to the next step, or
    // calls finish() if this was already the last step.
    const advance = () => (isLast ? finish() : setStepIndex((i) => i + 1));

    // A spotlight step renders the dim-and-point overlay once its target
    // is measured; otherwise (no targetKey, or the target never showed up)
    // it falls back to the same centered card used for welcome/closing.
    const showSpotlight = !!step.targetKey && !!spotlightRect && !targetMissing;
    // While a spotlight step's target is still being located, show nothing
    // rather than a flash of the wrong content.
    const isLocating = !!step.targetKey && !spotlightRect && !targetMissing;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={finish} statusBarTranslucent>
            {isLocating ? null : showSpotlight && spotlightRect ? (
                <SpotlightOverlay
                    rect={spotlightRect}
                    screenW={screenW}
                    screenH={screenH}
                    insets={insets}
                    theme={theme}
                    step={step}
                    stepIndex={stepIndex}
                    stepCount={tour.steps.length}
                    isFirst={isFirst}
                    nextLabel={nextLabel}
                    onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
                    onNext={advance}
                    onSkip={finish}
                    // Remounts SpotlightOverlay on every step change, which
                    // resets its internal measuredHeight state back to null
                    // -- each step's content gets its own fresh
                    // height measurement rather than carrying over the
                    // previous step's, which could otherwise (briefly) mis
                    // -position a step with very different content length.
                    key={stepIndex}
                />
            ) : (
                <FloatingCard
                    theme={theme}
                    insets={insets}
                    step={step}
                    stepIndex={stepIndex}
                    stepCount={tour.steps.length}
                    isFirst={isFirst}
                    nextLabel={nextLabel}
                    onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
                    onNext={advance}
                    onSkip={finish}
                />
            )}
        </Modal>
    );
}

type StepChromeProps = {
    theme: (typeof colors)['light'];
    step: (typeof TOURS)['student']['steps'][number];
    stepIndex: number;
    stepCount: number;
    isFirst: boolean;
    nextLabel: string;
    onBack: () => void;
    onNext: () => void;
    onSkip: () => void;
};

// StepDots
// Small internal presentational helper: renders the row of progress dots
// shown at the bottom of every tour card/tooltip (one dot per step, with
// the active step's dot wider and colored differently).
// Props:
// - count: total number of steps in the tour (how many dots to render).
// - activeIndex: which dot should be styled as "active" (the current step).
// - color: fill color for the active dot.
// - inactiveColor: fill color for every other dot.
// Returns: a row of small circular Views, one per step.
function StepDots({ count, activeIndex, color, inactiveColor }: { count: number; activeIndex: number; color: string; inactiveColor: string }) {
    return (
        <View style={styles.dots}>
            {Array.from({ length: count }).map((_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i === activeIndex ? color : inactiveColor }, i === activeIndex && styles.dotActive]} />
            ))}
        </View>
    );
}

// The welcome/closing treatment: a small floating card centered over a
// dimmed backdrop -- same visual language as the spotlight tooltip below,
// just not anchored to a target. Deliberately not a full-screen takeover:
// the current screen stays dimly visible behind it, same as every other
// step in the tour.
function FloatingCard({
    theme,
    insets,
    step,
    stepIndex,
    stepCount,
    isFirst,
    nextLabel,
    onBack,
    onNext,
    onSkip,
}: StepChromeProps & { insets: { top: number; bottom: number } }) {
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
            <View style={[styles.floatingCardWrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
                <View style={[styles.tooltip, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow, width: '100%', maxWidth: 340 }]}>
                    <View style={styles.tooltipTopRow}>
                        <Text style={[styles.tooltipStepCount, { color: theme.subtext }]}>
                            Step {stepIndex + 1} of {stepCount}
                        </Text>
                        <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip tour" hitSlop={12}>
                            <Text style={[styles.skip, { color: theme.subtext }]}>Skip</Text>
                        </Pressable>
                    </View>

                    <View style={[styles.iconBadge, { backgroundColor: theme.accent + '18', alignSelf: 'center', marginBottom: 14 }]}>
                        <Ionicons name={(step.icon ?? 'information-circle-outline') as any} size={28} color={theme.accent} />
                    </View>

                    <Text style={[styles.tooltipTitle, { color: theme.text, textAlign: 'center' }]}>{step.title}</Text>
                    <Text style={[styles.tooltipText, { color: theme.text, textAlign: 'center' }]}>{step.body}</Text>

                    <StepDots count={stepCount} activeIndex={stepIndex} color={theme.accent} inactiveColor={theme.border} />

                    {!isFirst && (
                        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Previous step" style={styles.backLink} hitSlop={8}>
                            <Text style={[styles.backLinkText, { color: theme.subtext }]}>Back</Text>
                        </Pressable>
                    )}

                    <Button label={nextLabel} onPress={onNext} />
                </View>
            </View>
        </View>
    );
}

// The dim-everything-else-and-point treatment for a spotlight step: four
// scrim panels frame a "hole" around the real control, an accent ring
// traces its edge, and a compact tooltip sits next to it.
function SpotlightOverlay({
    rect,
    screenW,
    screenH,
    insets,
    theme,
    step,
    stepIndex,
    stepCount,
    isFirst,
    nextLabel,
    onBack,
    onNext,
    onSkip,
}: StepChromeProps & { rect: TargetRect; screenW: number; screenH: number; insets: { top: number; bottom: number } }) {
    // Real height of this step's tooltip, captured via onLayout below once
    // it's actually rendered. Falls back to ESTIMATED_TOOLTIP_HEIGHT only
    // for the very first layout pass, before a real measurement exists --
    // that static guess was previously the ONLY input to the above/below
    // decision, and measured 33% too short against this tour's own longest
    // real step (289px actual vs. 220px estimated), confirmed live. A
    // target positioned further from the screen edge than this step's
    // happened to be would have let the tooltip run off the bottom of the
    // viewport instead of flipping above it.
    const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
    const tooltipHeightForPlacement = measuredHeight ?? ESTIMATED_TOOLTIP_HEIGHT;

    const holeLeft = Math.max(0, rect.x - SPOTLIGHT_PADDING);
    const holeTop = Math.max(0, rect.y - SPOTLIGHT_PADDING);
    const holeWidth = Math.min(screenW - holeLeft, rect.width + SPOTLIGHT_PADDING * 2);
    const holeHeight = Math.min(screenH - holeTop, rect.height + SPOTLIGHT_PADDING * 2);
    const holeBottom = holeTop + holeHeight;
    const holeRight = holeLeft + holeWidth;

    const isCompact = rect.width <= 80 && rect.height <= 80;
    const ringRadius = isCompact ? Math.max(holeWidth, holeHeight) / 2 : 16;

    const tooltipWidth = Math.min(340, screenW - 32);
    const spaceBelow = screenH - holeBottom;
    const spaceAbove = holeTop;
    const placeBelow = spaceBelow >= tooltipHeightForPlacement + 16 || spaceBelow >= spaceAbove;
    const gap = 14;

    const tooltipLeft = Math.min(Math.max(16, holeLeft + holeWidth / 2 - tooltipWidth / 2), screenW - 16 - tooltipWidth);
    const tooltipTopValue = Math.min(holeBottom + gap, screenH - insets.bottom - 24);
    const tooltipBottomValue = Math.max(insets.bottom + 16, screenH - holeTop + gap);
    const tooltipStyle = placeBelow
        ? { top: tooltipTopValue, left: tooltipLeft, width: tooltipWidth }
        : { bottom: tooltipBottomValue, left: tooltipLeft, width: tooltipWidth };

    // The little diamond that visually welds the tooltip to the ring it's
    // talking about -- without it the card just floats near the target
    // instead of clearly pointing at it. Clamped away from the tooltip's
    // own rounded corners so it never pokes out past a curve.
    const ARROW_SIZE = 14;
    const arrowCenterX = Math.min(Math.max(holeLeft + holeWidth / 2, tooltipLeft + 24), tooltipLeft + tooltipWidth - 24);

    const scrim = 'rgba(0,0,0,0.55)';

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Four scrim panels dim everything except the hole around the
                target -- simpler and more portable than an SVG mask, and
                avoids adding a new native dependency for one effect. */}
            <View style={[styles.scrimPanel, { backgroundColor: scrim, left: 0, top: 0, width: screenW, height: holeTop }]} />
            <View style={[styles.scrimPanel, { backgroundColor: scrim, left: 0, top: holeBottom, width: screenW, height: Math.max(0, screenH - holeBottom) }]} />
            <View style={[styles.scrimPanel, { backgroundColor: scrim, left: 0, top: holeTop, width: holeLeft, height: holeHeight }]} />
            <View style={[styles.scrimPanel, { backgroundColor: scrim, left: holeRight, top: holeTop, width: Math.max(0, screenW - holeRight), height: holeHeight }]} />

            {/* Accent ring framing the spotlighted control itself. */}
            <View
                pointerEvents="none"
                style={[
                    styles.ring,
                    {
                        left: holeLeft,
                        top: holeTop,
                        width: holeWidth,
                        height: holeHeight,
                        borderRadius: ringRadius,
                        borderColor: theme.accent,
                        shadowColor: theme.accent,
                    },
                ]}
            />

            {/* Connects the ring to the tooltip: a rotated square whose
                visible two edges match the tooltip's own border/fill, so it
                reads as a seamless pointer rather than a floating shape. */}
            <View
                pointerEvents="none"
                style={
                    placeBelow
                        ? {
                              position: 'absolute',
                              left: arrowCenterX - ARROW_SIZE / 2,
                              top: tooltipTopValue - ARROW_SIZE / 2,
                              width: ARROW_SIZE,
                              height: ARROW_SIZE,
                              backgroundColor: theme.surface,
                              borderLeftWidth: 1,
                              borderTopWidth: 1,
                              borderColor: theme.border,
                              transform: [{ rotate: '45deg' }],
                          }
                        : {
                              position: 'absolute',
                              left: arrowCenterX - ARROW_SIZE / 2,
                              bottom: tooltipBottomValue - ARROW_SIZE / 2,
                              width: ARROW_SIZE,
                              height: ARROW_SIZE,
                              backgroundColor: theme.surface,
                              borderRightWidth: 1,
                              borderBottomWidth: 1,
                              borderColor: theme.border,
                              transform: [{ rotate: '45deg' }],
                          }
                }
            />

            <View
                style={[styles.tooltip, tooltipStyle, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}
                onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}
            >
                <View style={styles.tooltipTopRow}>
                    <Text style={[styles.tooltipStepCount, { color: theme.subtext }]}>
                        Step {stepIndex + 1} of {stepCount}
                    </Text>
                    <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip tour" hitSlop={12}>
                        <Text style={[styles.skip, { color: theme.subtext }]}>Skip</Text>
                    </Pressable>
                </View>

                <Text style={[styles.tooltipTitle, { color: theme.text }]}>{step.title}</Text>
                <Text style={[styles.tooltipText, { color: theme.text }]}>{step.body}</Text>

                <StepDots count={stepCount} activeIndex={stepIndex} color={theme.accent} inactiveColor={theme.border} />

                {!isFirst && (
                    <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Previous step" style={styles.backLink} hitSlop={8}>
                        <Text style={[styles.backLinkText, { color: theme.subtext }]}>Back</Text>
                    </Pressable>
                )}

                <Button label={nextLabel} onPress={onNext} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    // -- FloatingCard layout styles --
    floatingCardWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    skip: {
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    iconBadge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // -- step progress dot styles (StepDots) --
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginVertical: 4,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    dotActive: {
        width: 20,
    },
    // -- "Back" link styles --
    backLink: {
        alignSelf: 'center',
        paddingVertical: 4,
    },
    backLinkText: {
        fontFamily: 'Georgia',
        fontSize: 14,
        fontWeight: '600',
    },
    // -- SpotlightOverlay scrim/ring styles --
    scrimPanel: {
        position: 'absolute',
    },
    ring: {
        position: 'absolute',
        borderWidth: 3,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 6,
    },
    // -- tooltip/card body styles (shared by FloatingCard and SpotlightOverlay) --
    tooltip: {
        position: 'absolute',
        borderRadius: 20,
        borderWidth: 1,
        padding: 20,
        gap: 4,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    tooltipTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    tooltipStepCount: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    tooltipTitle: {
        fontFamily: 'Georgia',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.2,
        marginBottom: 6,
    },
    tooltipText: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 6,
    },
});
