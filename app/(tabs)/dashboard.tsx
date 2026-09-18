// app/(tabs)/dashboard.tsx
// Main experience screen. Dynamically branches out between the student map interface
// and the educator class control deck based on the authenticated profile row role.
// All the live-data logic (profile hydration, trail loading, landmark-crossing
// detection, mileage logging, trail switching, quiz assignment lookups) lives in
// `hooks/useStudentDashboard.ts` -- shared verbatim with the cartoony elementary
// shell at `app/(kids-tabs)/dashboard.tsx`, so both screens track the exact same
// real progress with no forked business logic. This file owns only the "classic"
// rendering of that data: the live trail map, the walked-vs-remaining progress bar,
// landmark/quiz popups, and the trail-switch flow's UI.

import { Image } from 'expo-image';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, DIFFICULTY_COLORS, getDashboardStyles } from '../../commonStyles';
import MileageLogModal from '../../components/MileageLogModal';
import ModalBackdrop from '../../components/ModalBackdrop';
import QuizModal from '../../components/QuizModal';
// TrailMap is the actual interactive map component (own file under
// components/) — it likely wraps a native MapView, drawing the walked and
// remaining route as separate colored lines plus landmark pins.
import TrailMap from '../../components/TrailMap';
import TourTarget from '../../components/tour/TourTarget';
import { signOutAndRedirect } from '../../lib/auth';
import { type Landmark } from '../../lib/landmarks';
import { type TrailSummary } from '../../lib/trails';
import { formatMiles } from '../../lib/trails';
import { useStudentDashboard } from '../../hooks/useStudentDashboard';

// Sub-components for Student UI
// A single landmark thumbnail card shown in the horizontally-scrolling
// strip near the bottom of the screen. Uses `any` typed props (rather than
// a strict interface) — a looser style choice compared to most other
// components in this app.
function LandmarkCard({ landmark, onPress, dStyles, isPassed, milesToGo, hasPendingQuiz }: any) {
    return (
        <Pressable
            style={[dStyles.landmarkCard, isPassed && dStyles.landmarkCardPassed, !isPassed && dStyles.landmarkCardLocked]}
            onPress={onPress}
            // A landmark the student hasn't walked far enough to reach yet
            // is locked: untappable, so there's no way to open its detail/
            // quiz popup before actually reaching it on the trail (same
            // rule the "All Landmarks" list enforces).
            disabled={!isPassed}
            accessibilityRole="button"
            accessibilityLabel={isPassed ? landmark.title : `${landmark.title}, locked, ${formatMiles(milesToGo)} miles to go`}
        >
            <View style={dStyles.landmarkImagePlaceholder}>
                <Text style={dStyles.landmarkImageIcon}>{isPassed ? '📍' : '🔒'}</Text>
                {/* A small badge icon floats in the corner of any PASSED
                    landmark that has an unanswered quiz waiting, so
                    students can spot at a glance which landmarks still
                    have something to do. Gated on isPassed too, so a
                    locked landmark never advertises a quiz the student
                    can't actually open yet. */}
                {hasPendingQuiz && isPassed ? (
                    <View style={quizBadgeStyles.badge}>
                        <Text style={quizBadgeStyles.badgeText}>📝</Text>
                    </View>
                ) : null}
            </View>
            <Text style={[dStyles.landmarkCardTitle, !isPassed && dStyles.landmarkCardTitleLocked]} numberOfLines={2}>
                {landmark.title}
            </Text>
            <Text style={dStyles.landmarkCardMile}>
                {isPassed ? 'Passed' : `${formatMiles(milesToGo)} mi to go`}
            </Text>
        </Pressable>
    );
}

// Styles for just the small pending-quiz notification badge on a landmark
// card — kept as its own separate StyleSheet.create() call rather than
// merged into the shared dStyles object, since it's a small, self-
// contained visual detail.
const quizBadgeStyles = StyleSheet.create({
    badge: {
        // Positions the badge overlapping the TOP-RIGHT corner of its
        // parent (negative top/right values push it slightly outside the
        // parent's own bounds), giving the classic "notification dot in
        // the corner" look.
        position: 'absolute',
        top: -4,
        right: -4,
        width: 20,
        height: 20,
        borderRadius: 10, // circle
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    badgeText: {
        fontSize: 11,
    },
});

// A full-screen modal listing EVERY landmark on the current trail (not
// just the ones visible in the horizontal strip), letting the student jump
// straight to any one of them.
function AllLandmarksModal({ landmarks, milesWalked, onSelectLandmark, onClose, dStyles, theme }: any) {
    // Trail order, so "how far to the next landmark" reads top-to-bottom the
    // same way the horizontal landmark strip on the dashboard already does.
    const sortedLandmarks = [...landmarks].sort((a: any, b: any) => a.mileMarker - b.mileMarker);
    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            {/* Tapping the dimmed backdrop closes the modal; the sheet
                itself is a Pressable that stops that tap from bubbling
                back up to this one, so tapping inside it doesn't close it. */}
            <ModalBackdrop style={dStyles.modalOverlay} onPress={onClose}>
                <Pressable style={[dStyles.modalSheet, { maxHeight: '85%' }]} onPress={(e) => e.stopPropagation()}>
                    <Pressable style={[customModalStyles.modernCloseBtn, { backgroundColor: theme?.accent || '#FF5722' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
                        <Text style={customModalStyles.modernCloseBtnText}>Close</Text>
                    </Pressable>
                    <Text style={[dStyles.modalTitle, { padding: 24, paddingLeft: 16 }]} accessibilityRole="header">All Landmarks</Text>
                    <ScrollView>
                        {sortedLandmarks.map((l: any) => {
                            // A landmark the student hasn't walked far enough to
                            // reach yet stays visible -- name and how far away
                            // it is -- but is locked: greyed out and untappable,
                            // so there's no way to jump ahead and read about a
                            // landmark before actually reaching it on the trail.
                            const isPassed = l.mileMarker <= milesWalked;
                            const milesToGo = Math.max(0, l.mileMarker - milesWalked);
                            return (
                                <Pressable
                                    key={l.id}
                                    style={[dStyles.allLandmarkRow, !isPassed && dStyles.allLandmarkRowLocked]}
                                    disabled={!isPassed}
                                    onPress={() => { onClose(); onSelectLandmark(l); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={isPassed ? l.title : `${l.title}, locked, ${formatMiles(milesToGo)} mi to go`}
                                >
                                    <View style={[dStyles.allLandmarkDot, isPassed && dStyles.allLandmarkDotPassed, { marginTop: 4 }]} />
                                    <Text style={[dStyles.allLandmarkTitle, !isPassed && dStyles.allLandmarkTitleLocked]}>
                                        {isPassed ? l.title : `🔒 ${l.title}`}
                                    </Text>
                                    <Text style={dStyles.allLandmarkMile}>
                                        {isPassed ? `Mile ~${l.mileMarker}` : `${formatMiles(milesToGo)} mi to go`}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </Pressable>
            </ModalBackdrop>
        </Modal>
    );
}

// Shown when the student either finishes their current trail (walks its
// full length) or has no trail selected yet — presents a list of
// not-yet-completed trails to pick from next.
// `mode` drives both the title copy and whether the modal can be
// dismissed: 'initial' (no trail chosen yet) and 'completed' (the current
// trail was just finished) are both non-dismissible -- walking without an
// active trail doesn't make sense, and a just-finished trail needs a next
// destination. 'voluntary' (the student tapped "Switch Trail" on their own)
// is dismissible via onClose, since they might just be checking options.
function TrailCompleteModal({ trails, onSelectTrail, dStyles, mode, onClose }: any) {
    const dismissible = mode === 'voluntary';
    return (
        <Modal visible animationType="slide" transparent onRequestClose={dismissible ? onClose : undefined}>
            <ModalBackdrop style={dStyles.modalOverlay}>
                <View style={[dStyles.modalSheet, { height: '85%', width: '94%', maxWidth: 440, paddingHorizontal: 16, paddingVertical: 20, alignSelf: 'center' }]}>
                    {dismissible && (
                        <Pressable style={[customModalStyles.modernCloseBtn, { backgroundColor: '#8E8E93' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
                            <Text style={customModalStyles.modernCloseBtnText}>Close</Text>
                        </Pressable>
                    )}
                    {/* The title wording differs depending on WHY this
                        modal is showing. */}
                    <Text style={[dStyles.modalTitle, { paddingLeft: 4, paddingBottom: 4, fontSize: 21, fontFamily: 'Georgia', fontWeight: '800', textAlign: 'left', width: '100%' }]} accessibilityRole="header">
                        {mode === 'initial' && 'Choose Your Target Trail'}
                        {mode === 'completed' && 'Trail Completed! Select Next Destination'}
                        {mode === 'voluntary' && 'Switch Trail'}
                    </Text>
                    <Text style={{ color: '#636366', fontSize: 13, marginBottom: 14, paddingLeft: 4, fontFamily: 'Georgia', fontStyle: 'italic' }}>
                        {mode === 'voluntary'
                            ? "Pick any trail below to make it your active one -- your progress on it (if you've started it before) picks up right where you left off."
                            : 'Your progress will map directly onto an uncompleted trail below:'}
                    </Text>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                        {trails.length === 0 ? (
                            // If the student has genuinely completed EVERY
                            // available trail, there's nothing left to pick
                            // — show a congratulatory message instead of an
                            // empty list.
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ fontFamily: 'Georgia', fontSize: 15, color: '#4E3629', textAlign: 'center' }}>
                                    ✨ Incredible! You have completed every available trail in the system! 🎉
                                </Text>
                            </View>
                        ) : (
                            trails.map((trail: any) => {
                                // Look up the color for this trail's
                                // difficulty rating (same shared palette
                                // used on the Trails catalog screen),
                                // falling back to a neutral gray if the
                                // difficulty value somehow doesn't match
                                // any known key.
                                const badgeColor = DIFFICULTY_COLORS[trail.difficulty as TrailSummary['difficulty']] || '#8E8E93';
                                return (
                                    <Pressable key={trail.id} style={customModalStyles.vintageTrailCard} onPress={() => onSelectTrail(trail)} accessibilityRole="button" accessibilityLabel={`${trail.name}, ${formatMiles(trail.miles)} miles`}>
                                        <Image
                                            // If this trail has no
                                            // image_url set, fall back to a
                                            // generic scenic stock photo
                                            // from Unsplash rather than
                                            // showing a broken image or
                                            // blank space.
                                            source={trail.image_url ? { uri: trail.image_url } : 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=300&q=80'}
                                            style={customModalStyles.trailCardImage}
                                            contentFit="cover"
                                        />
                                        <View style={customModalStyles.trailCardDetailsContainer}>
                                            <View style={customModalStyles.vintageCardHeader}>
                                                <Text style={customModalStyles.vintageTrailName}>{trail.name}</Text>
                                                <View style={[customModalStyles.diffBadge, { backgroundColor: badgeColor }]} >
                                                    <Text style={customModalStyles.diffBadgeText}>{trail.difficulty}</Text>
                                                </View>
                                            </View>
                                            <Text style={customModalStyles.vintageTrailMeta}>📍 Length: {formatMiles(trail.miles)} miles</Text>
                                            {trail.route ? (
                                                <Text style={customModalStyles.vintageTrailRoute}>
                                                    {trail.route}
                                                </Text>
                                            ) : null}
                                        </View>
                                    </Pressable>
                                );
                            })
                        )}
                    </ScrollView>
                </View>
            </ModalBackdrop>
        </Modal>
    );
}

const customModalStyles = StyleSheet.create({
    logModalSheet: {
        backgroundColor: '#FAF9F5',
        // Changed from top-only to all corners for a complete rounded look
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#C8C4B7',
        paddingTop: 24,
        paddingBottom: 24,
        paddingHorizontal: 24,
        width: '92%',           // Narrowed slightly to let the rounded sides float elegantly
        maxWidth: 340,          // Sets a maximum boundary constraint for large layouts
        alignItems: 'center',
        // Added bottom margin so it hovers cohesively above the screen edge
        marginBottom: Platform.OS === 'ios' ? 34 : 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5
    },
    logModalTitle: {
        fontSize: 20,
        fontFamily: 'Georgia',
        fontWeight: '800',
        color: '#4E3629',
        marginBottom: 16,
        marginTop: 6,
        textAlign: 'center',
        width: '100%'
    },
    compactInputField: {
        height: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: 'center', // Centers the text alignment correctly
        marginBottom: 16
    },
    modernCloseBtn: {
        position: 'absolute',
        top: 14,
        right: 16,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 14,
        zIndex: 10
    },
    modernCloseBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFF',
        letterSpacing: 0.5
    },
    quickActionRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 6,
        width: '100%',
        maxWidth: 260,
        alignSelf: 'center'
    },
    quickActionPill: {
        backgroundColor: '#F4F1EA',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        flex: 1,
        alignItems: 'center'
    },
    quickActionPillText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4E3629'
    },
    vintageTrailCard: {
        backgroundColor: '#FAF9F5',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        borderRadius: 12,
        // Clips the trail image's square corners to match the card's own
        // rounded corners.
        overflow: 'hidden',
        marginBottom: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2
    },
    trailCardImage: {
        width: '100%',
        height: 120,
        // Shown briefly as a placeholder background color while the real
        // image is still loading in.
        backgroundColor: '#E2DEC9'
    },
    trailCardDetailsContainer: {
        padding: 14
    },
    vintageCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
        gap: 8
    },
    vintageTrailName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#4E3629',
        fontFamily: 'Georgia',
        // flex: 1 lets the trail name take up remaining space, pushing
        // the difficulty badge to the far right.
        flex: 1
    },
    diffBadge: {
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 8,
        marginTop: 2
    },
    diffBadgeText: {
        fontSize: 10,
        color: '#FFF',
        fontWeight: '700'
    },
    vintageTrailMeta: {
        fontSize: 13,
        color: '#5C5446',
        fontWeight: '600',
        marginBottom: 4
    },
    vintageTrailRoute: {
        fontSize: 12,
        // Was an iOS-gray outlier (#636366) inside an otherwise warm
        // "vintage" palette shared with this same modal's #4E3629/#5C5446
        // and Passport's field-journal theme -- normalized to match.
        color: '#756D5E',
        marginTop: 4,
        lineHeight: 16,
    }
});

// ----------------------------------------------------
// MAIN EXPONENT COMPONENT LAYOUT SWITCH
// ----------------------------------------------------
export default function DashboardScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const dStyles = getDashboardStyles(theme);
    const router = useRouter();
    const d = useStudentDashboard();

    if (d.loadingLayout) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme?.background || '#F6EFE7' }}>
                <ActivityIndicator size="large" color={theme?.accent || '#FF5722'} />
            </View>
        );
    }

    // If NOT the student shell, render a simplified educator summary card
    // instead of the map interface — this is a minimal fallback view
    // (note the "Coming Soon" alert on its button), distinct from the
    // full-featured (teacher-tabs) screens elsewhere in the app; this
    // branch is presumably reached only in edge cases like a teacher who
    // somehow lands on the classic tab group without switching views.
    if (!d.isStudentShell) {
        return (
            <View style={[teacherStyles.container, { backgroundColor: theme.background }]}>
                <StatusBar barStyle="dark-content" />
                <ScrollView contentContainerStyle={teacherStyles.scrollContent}>
                    <View style={[teacherStyles.badgeRow, { backgroundColor: theme.border }]}>
                        <Text style={[teacherStyles.badgeText, { color: theme.accent }]}>🎯 Educator View</Text>
                    </View>
                    <Text style={[teacherStyles.titleText, { color: theme.text }]} accessibilityRole="header">Welcome back, {d.greetingName}</Text>
                    <Text style={[teacherStyles.subTitleText, { color: theme.subtext }]}>📍 Managing: {d.schoolDistrict}</Text>
                    {/* gradesText.replace('_', ' ') swaps the FIRST
                        underscore for a space (e.g. "middle_school" →
                        "middle school"), then .toUpperCase() capitalizes
                        it entirely for display. */}
                    {d.gradesText ? <Text style={[teacherStyles.metaText, { color: theme.subtext }]}>Class Tier: {d.gradesText.replace('_', ' ').toUpperCase()}</Text> : null}
                    <View style={[teacherStyles.card, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
                        <Text style={[teacherStyles.cardHeader, { color: theme.text }]} accessibilityRole="header">Classroom Tools</Text>
                        <Text style={[teacherStyles.cardBody, { color: theme.subtext }]}>
                            Your account is registered as an Educator. Head to the Classes tab to create a class, manage rosters, and review classroom leaderboards.
                        </Text>
                        <Pressable style={[teacherStyles.primaryButton, { backgroundColor: theme.accent }]} onPress={() => router.push('/(teacher-tabs)/classes' as any)} accessibilityRole="link">
                            <Text style={teacherStyles.buttonText}>Go to Classes</Text>
                        </Pressable>
                    </View>
                    <Pressable style={teacherStyles.signOutButton} onPress={() => void signOutAndRedirect(router)} accessibilityRole="button">
                        <Text style={[teacherStyles.signOutText, { color: theme.error }]}>Sign Out</Text>
                    </Pressable>
                </ScrollView>
            </View>
        );
    }

    // The main student dashboard: header greeting/miles chip, progress
    // bar, the live trail map, action buttons, a pending-quizzes banner,
    // and a horizontal landmark strip.
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80, paddingTop: 10 }}>
                <View style={dStyles.header}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={dStyles.headerGreeting} accessibilityRole="header">Ready to walk, {d.greetingName}?</Text>
                        <Text style={dStyles.headerTrailName} numberOfLines={1}>{d.trailName}</Text>
                        {/* Always available -- not just when a trail is
                            finished -- so a student can correct which
                            trail they're on for a class at any time. */}
                        <Pressable onPress={() => d.setSwitchTrailModalOpen(true)} hitSlop={8} accessibilityRole="button">
                            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700', marginTop: 2 }}>Switch Trail</Text>
                        </Pressable>
                    </View>
                    <View style={dStyles.milesChip}>
                        <Text style={dStyles.milesChipValue}>{formatMiles(d.milesWalked)}</Text>
                        <Text style={dStyles.milesChipLabel}>/ {formatMiles(d.totalMiles)} mi</Text>
                    </View>
                </View>

                <View style={dStyles.progressContainer}>
                    {/* The filled portion's width is set as a percentage
                        string (e.g. "42%"), computed from progressPct
                        above — this is what visually grows the progress
                        bar as the student logs more miles. */}
                    <View style={dStyles.progressTrack}><View style={[dStyles.progressFill, { width: `${d.progressPct}%` }]} /></View>
                    {/* .toFixed(0) rounds to a whole number percentage
                        (e.g. "42% complete" rather than "42.37%"). */}
                    <Text style={dStyles.progressLabel}>{d.progressPct.toFixed(0)}% complete</Text>
                </View>

                <TrailMap
                    walkedCoords={d.walkedCoords}
                    remainingCoords={d.remainingCoords}
                    allLandmarks={d.allLandmarks}
                    trailCoords={d.trailCoords}
                    userPosition={d.userPosition}
                    trailRegion={d.trailRegion}
                    milesWalked={d.milesWalked}
                    mapRef={d.mapRef}
                    dStyles={dStyles}
                    theme={theme}
                    onLandmarkPress={(l: Landmark) => d.setSelectedLandmark(l)}
                    // Tapping a "recenter" control (presumably rendered
                    // INSIDE the TrailMap component itself) calls this
                    // function, which imperatively animates the map back
                    // to center on the student's current position over
                    // 500 milliseconds.
                    onRecenter={() => d.mapRef.current?.animateToRegion({
                        latitude: d.userPosition.latitude,
                        longitude: d.userPosition.longitude,
                        latitudeDelta: d.trailRegion.latitudeDelta,
                        longitudeDelta: d.trailRegion.longitudeDelta,
                    }, 500)}
                />

                <View style={[dStyles.ctaRow, { flexDirection: 'row', gap: 12, paddingHorizontal: 16 }]}>
                    <TourTarget id="student.logButton" style={{ flex: 1 }}>
                        <Pressable style={dStyles.logButton} onPress={() => router.push('/fitness')} accessibilityRole="link"><Text style={dStyles.logButtonText}>Open Daily Log</Text></Pressable>
                    </TourTarget>
                    <Pressable style={[dStyles.logButton, { flex: 1 }]} onPress={() => d.setAllLandmarksOpen(true)} accessibilityRole="button"><Text style={dStyles.logButtonText}>All Landmarks</Text></Pressable>
                </View>

                {/* The "quizzes waiting" banner only appears when there's
                    at least one pending quiz — tapping it dumps the ENTIRE
                    pendingQuizzes list into the popup queue at once, so
                    the student can work through all of them in sequence. */}
                {d.pendingQuizzes.length > 0 && (
                    <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                        <Pressable
                            style={[dStyles.logButton, { backgroundColor: theme?.accent || '#FF5722' }]}
                            onPress={() => d.setPopupQueue(d.pendingQuizzes)}
                            accessibilityRole="button"
                        >
                            <Text style={dStyles.logButtonText}>📝 Quizzes waiting for you ({d.pendingQuizzes.length})</Text>
                        </Pressable>
                    </View>
                )}

                {/* A fixed-height (170px) wrapper around the horizontally
                    scrolling landmark card strip, so this section doesn't
                    change the overall page layout height regardless of
                    how many landmarks exist. */}
                <TourTarget id="student.landmarkStrip" style={{ height: 170 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dStyles.landmarkStrip}>
                        {/* .slice() makes a shallow copy before .sort()
                            (which mutates in place), same defensive pattern
                            seen in app/(okage-tabs)/reports.tsx, avoiding
                            accidentally reordering the original
                            allLandmarks array. Sorted by mile marker so the
                            strip reads left-to-right in trail order. */}
                        {d.allLandmarks.slice().sort((a, b) => a.mileMarker - b.mileMarker).map((l) => {
                            const assignedQuiz = d.quizByLandmarkId.get(l.id);
                            const hasPendingQuiz = !!assignedQuiz && !d.answeredQuestionIds.has(assignedQuiz.question.id);
                            const isPassed = l.mileMarker <= d.milesWalked;
                            return (
                                <LandmarkCard
                                    key={l.id}
                                    landmark={l}
                                    isPassed={isPassed}
                                    milesToGo={Math.max(0, l.mileMarker - d.milesWalked)}
                                    hasPendingQuiz={hasPendingQuiz}
                                    onPress={() => d.setSelectedLandmark(l)}
                                    dStyles={dStyles}
                                />
                            );
                        })}
                    </ScrollView>
                </TourTarget>
            </ScrollView>

            <MileageLogModal
                visible={d.logModalOpen}
                onSubmit={d.handleLogMiles}
                onClose={() => d.setLogModalOpen(false)}
                accentColor={theme?.accent || '#FF5722'}
                title="Log Your Progress"
            />
            {/* The trail-completion/selection modal only mounts while
                needed (see trailModalMode above) — it's not kept
                permanently mounted-but-hidden like some other modals in
                this app. */}
            {d.trailModalMode && (
                <TrailCompleteModal
                    trails={d.trailChoices}
                    onSelectTrail={d.handleNewTrailSelected}
                    dStyles={dStyles}
                    mode={d.trailModalMode}
                    onClose={() => d.setSwitchTrailModalOpen(false)}
                />
            )}
            {d.selectedLandmark && (
                <QuizModal
                    landmark={d.selectedLandmark}
                    assignedQuiz={d.quizByLandmarkId.get(d.selectedLandmark.id) ?? null}
                    // An inline Immediately-Invoked Function Expression
                    // (IIFE) computes whether the CURRENTLY selected
                    // landmark's quiz has already been answered — needed
                    // here as a plain boolean prop rather than a lookup
                    // QuizModal would have to do itself.
                    alreadyAnswered={(() => {
                        const assigned = d.quizByLandmarkId.get(d.selectedLandmark.id);
                        return assigned ? d.answeredQuestionIds.has(assigned.question.id) : false;
                    })()}
                    studentId={d.userId ?? ''}
                    trailId={d.trailId ?? ''}
                    accentColor={theme?.accent}
                    // When QuizModal reports a question was successfully
                    // answered, add its id to the answered set — `new
                    // Set(prev).add(questionId)` creates a fresh copy
                    // (required for React to detect the state change)
                    // with the new id included.
                    onAnswered={(questionId) => d.setAnsweredQuestionIds((prev) => new Set(prev).add(questionId))}
                    onClose={() => d.setSelectedLandmark(null)}
                />
            )}
            {d.allLandmarksOpen && <AllLandmarksModal landmarks={d.allLandmarks} milesWalked={d.milesWalked} onSelectLandmark={(l: any) => d.setSelectedLandmark(l)} onClose={() => d.setAllLandmarksOpen(false)} dStyles={dStyles} theme={theme} />}
        </View>
    );
}

// Styles for the simplified educator fallback view (the `!isStudentShell`
// branch above) — kept separate from the shared dStyles object since this
// is a distinct, minimal layout only used in that one edge case.
const teacherStyles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 24, paddingTop: 15, alignItems: 'center' },
    badgeRow: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, marginBottom: 16 },
    badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    titleText: { fontSize: 26, fontWeight: 'bold', fontFamily: 'Georgia', textAlign: 'center', marginBottom: 4 },
    subTitleText: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginBottom: 2 },
    metaText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 20 },
    card: { width: '100%', padding: 20, borderRadius: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, marginBottom: 30 },
    cardHeader: { fontSize: 16, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 8 },
    cardBody: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
    primaryButton: { padding: 14, borderRadius: 10, alignItems: 'center' },
    buttonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    signOutButton: { marginTop: 10, padding: 10 },
    signOutText: { fontWeight: '600', fontSize: 14 }
});
