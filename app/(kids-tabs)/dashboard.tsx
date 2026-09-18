// app/(kids-tabs)/dashboard.tsx
// The cartoony elementary-student Home screen -- same live trail-progress
// data as `(tabs)/dashboard.tsx` (via the shared `useStudentDashboard`
// hook: real trail, real mileage, real landmarks/quizzes, real Supabase
// writes), rendered as a big, simple, mascot-led experience instead of the
// adult "field guide" one. See DESIGN.md's "Explorer World" section for the
// visual language this screen commits to.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import GlobeMascot from '../../components/kids/GlobeMascot';
import { KidsButton, KidsCard, KidsIconBubble, KidsMiniButton, KidsPill, KidsProgressBar } from '../../components/kids/KidsPrimitives';
import MileageLogModal from '../../components/MileageLogModal';
import ModalBackdrop from '../../components/ModalBackdrop';
import QuizModal from '../../components/QuizModal';
import TrailMap from '../../components/TrailMap';
import TourTarget from '../../components/tour/TourTarget';
import { useStudentDashboard } from '../../hooks/useStudentDashboard';
import { DIFFICULTY_COLORS } from '../../commonStyles';
import { formatMiles, type TrailSummary } from '../../lib/trails';
import { kidsColors, kidsFonts, kidsMapStyles, kidsModalTheme, kidsRadius, kidsSpacing } from '../../styles/kidsTheme';

export default function KidsDashboardScreen() {
    const router = useRouter();
    const d = useStudentDashboard();

    if (d.loadingLayout) {
        return (
            <View style={[styles.center, { backgroundColor: kidsColors.bg }]}>
                <ActivityIndicator size="large" color={kidsColors.grass} />
            </View>
        );
    }

    if (!d.isStudentShell) {
        return (
            <View style={[styles.center, { backgroundColor: kidsColors.bg, padding: kidsSpacing.xl }]}>
                <GlobeMascot pose="think" size={90} />
                <Text style={styles.fallbackTitle}>This world is for explorers!</Text>
                <Text style={styles.fallbackBody}>Head to your Classes tab to manage your class.</Text>
            </View>
        );
    }

    const passedCount = d.allLandmarks.filter((l) => l.mileMarker <= d.milesWalked).length;

    return (
        <View style={{ flex: 1, backgroundColor: kidsColors.bg }}>
            <StatusBar barStyle="dark-content" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90, paddingTop: kidsSpacing.lg }}>
                {/* Header: mascot + greeting */}
                <View style={styles.header}>
                    <GlobeMascot pose="wave" size={76} />
                    <View style={{ flex: 1, marginLeft: kidsSpacing.md }}>
                        <Text style={styles.greeting}>Ready to walk, {d.greetingName}?</Text>
                        <Pressable onPress={() => d.setSwitchTrailModalOpen(true)} hitSlop={8} accessibilityRole="button">
                            <Text style={styles.trailLink} numberOfLines={1}>🧭 {d.trailName} · Switch Trail</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Progress card */}
                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.lg }}>
                    <KidsCard>
                        <View style={styles.progressRow}>
                            <Text style={styles.progressLabel}>My Miles</Text>
                            <KidsPill icon="⭐" variant="sun" label={`${d.progressPct.toFixed(0)}%`} />
                        </View>
                        <KidsProgressBar pct={d.progressPct} />
                        <Text style={styles.progressCaption}>
                            {formatMiles(d.milesWalked)} of {formatMiles(d.totalMiles)} miles · {passedCount} spot{passedCount === 1 ? '' : 's'} found
                        </Text>
                    </KidsCard>
                </View>

                {/* Trail map */}
                <View style={{ marginTop: kidsSpacing.lg }}>
                    <TrailMap
                        walkedCoords={d.walkedCoords}
                        remainingCoords={d.remainingCoords}
                        allLandmarks={d.allLandmarks}
                        trailCoords={d.trailCoords}
                        userPosition={d.userPosition}
                        trailRegion={d.trailRegion}
                        milesWalked={d.milesWalked}
                        mapRef={d.mapRef}
                        dStyles={kidsMapStyles}
                        theme={kidsModalTheme}
                        onLandmarkPress={(l: any) => d.setSelectedLandmark(l)}
                        onRecenter={() => d.mapRef.current?.animateToRegion({
                            latitude: d.userPosition.latitude,
                            longitude: d.userPosition.longitude,
                            latitudeDelta: d.trailRegion.latitudeDelta,
                            longitudeDelta: d.trailRegion.longitudeDelta,
                        }, 500)}
                    />
                </View>

                {/* Big primary CTA + secondary action */}
                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.lg }}>
                    <TourTarget id="student.logButton">
                        <KidsButton label="Log My Walk" icon="🥾" variant="grass" onPress={() => router.push('/fitness' as any)} />
                    </TourTarget>
                    <View style={{ flexDirection: 'row', gap: kidsSpacing.md, marginTop: kidsSpacing.md }}>
                        <KidsMiniButton label="All Spots" icon="🗺️" variant="sky" onPress={() => d.setAllLandmarksOpen(true)} />
                        <KidsMiniButton label="My Badges" icon="🎖️" variant="berry" onPress={() => router.push('/(kids-tabs)/passport' as any)} />
                    </View>
                </View>

                {/* Pending quizzes banner */}
                {d.pendingQuizzes.length > 0 && (
                    <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.md }}>
                        <KidsButton
                            label={`Quiz Time! (${d.pendingQuizzes.length})`}
                            icon="📝"
                            variant="sun"
                            onPress={() => d.setPopupQueue(d.pendingQuizzes)}
                        />
                    </View>
                )}

                {/* Landmark sticker strip */}
                <View style={{ marginTop: kidsSpacing.xl }}>
                    <Text style={styles.sectionTitle}>Spots Along the Way</Text>
                    <TourTarget id="student.landmarkStrip" style={{ height: 158 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: kidsSpacing.lg, gap: kidsSpacing.md }}>
                            {d.allLandmarks.slice().sort((a, b) => a.mileMarker - b.mileMarker).map((l) => {
                                const assignedQuiz = d.quizByLandmarkId.get(l.id);
                                const hasPendingQuiz = !!assignedQuiz && !d.answeredQuestionIds.has(assignedQuiz.question.id);
                                const isPassed = l.mileMarker <= d.milesWalked;
                                const milesToGo = Math.max(0, l.mileMarker - d.milesWalked);
                                return (
                                    <Pressable
                                        key={l.id}
                                        onPress={() => isPassed && d.setSelectedLandmark(l)}
                                        disabled={!isPassed}
                                        accessibilityRole="button"
                                        accessibilityLabel={isPassed ? l.title : `${l.title}, locked, ${formatMiles(milesToGo)} miles to go`}
                                        style={styles.landmarkStickerWrap}
                                    >
                                        <View style={[styles.landmarkSticker, !isPassed && styles.landmarkStickerLocked]}>
                                            <View style={styles.landmarkStickerFace}>
                                                <Text style={{ fontSize: 34 }}>{isPassed ? '📍' : '🔒'}</Text>
                                                {hasPendingQuiz && isPassed ? (
                                                    <View style={styles.quizDot}><Text style={{ fontSize: 11 }}>📝</Text></View>
                                                ) : null}
                                            </View>
                                        </View>
                                        <Text style={styles.landmarkStickerTitle} numberOfLines={2}>{l.title}</Text>
                                        <Text style={styles.landmarkStickerMeta}>{isPassed ? 'Found it!' : `${formatMiles(milesToGo)} mi to go`}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </TourTarget>
                </View>
            </ScrollView>

            <MileageLogModal
                visible={d.logModalOpen}
                onSubmit={d.handleLogMiles}
                onClose={() => d.setLogModalOpen(false)}
                accentColor={kidsColors.grass}
                title="Log Your Walk!"
                theme={kidsModalTheme}
                fontFamily={kidsFonts.display}
            />

            {d.trailModalMode && (
                <KidsTrailCompleteModal
                    trails={d.trailChoices}
                    onSelectTrail={d.handleNewTrailSelected}
                    mode={d.trailModalMode}
                    onClose={() => d.setSwitchTrailModalOpen(false)}
                />
            )}

            {d.selectedLandmark && (
                <QuizModal
                    landmark={d.selectedLandmark}
                    assignedQuiz={d.quizByLandmarkId.get(d.selectedLandmark.id) ?? null}
                    alreadyAnswered={(() => {
                        const assigned = d.quizByLandmarkId.get(d.selectedLandmark.id);
                        return assigned ? d.answeredQuestionIds.has(assigned.question.id) : false;
                    })()}
                    studentId={d.userId ?? ''}
                    trailId={d.trailId ?? ''}
                    accentColor={kidsColors.grass}
                    theme={kidsModalTheme}
                    fontFamily={kidsFonts.display}
                    onAnswered={(questionId) => d.setAnsweredQuestionIds((prev) => new Set(prev).add(questionId))}
                    onClose={() => d.setSelectedLandmark(null)}
                />
            )}

            {d.allLandmarksOpen && (
                <KidsAllLandmarksModal
                    landmarks={d.allLandmarks}
                    milesWalked={d.milesWalked}
                    onSelectLandmark={(l: any) => d.setSelectedLandmark(l)}
                    onClose={() => d.setAllLandmarksOpen(false)}
                />
            )}
        </View>
    );
}

// A full-screen sheet listing every landmark on the trail, kids-styled:
// same locked/unlocked logic as the adult AllLandmarksModal, rebuilt with
// KidsCard rows instead of hairline list rows.
function KidsAllLandmarksModal({ landmarks, milesWalked, onSelectLandmark, onClose }: any) {
    const sorted = [...landmarks].sort((a: any, b: any) => a.mileMarker - b.mileMarker);
    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <ModalBackdrop style={{ justifyContent: 'flex-end' }} onPress={onClose}>
                <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
                    <View style={sheetStyles.grabber} />
                    <Text style={sheetStyles.sheetTitle}>All Spots</Text>
                    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                        {sorted.map((l: any) => {
                            const isPassed = l.mileMarker <= milesWalked;
                            const milesToGo = Math.max(0, l.mileMarker - milesWalked);
                            return (
                                <Pressable
                                    key={l.id}
                                    disabled={!isPassed}
                                    onPress={() => { onClose(); onSelectLandmark(l); }}
                                    accessibilityRole="button"
                                    style={[sheetStyles.row, !isPassed && { opacity: 0.5 }]}
                                >
                                    <KidsIconBubble icon={isPassed ? '📍' : '🔒'} variant={isPassed ? 'grass' : 'neutral'} size={40} />
                                    <View style={{ flex: 1, marginLeft: kidsSpacing.md }}>
                                        <Text style={sheetStyles.rowTitle} numberOfLines={1}>{l.title}</Text>
                                        <Text style={sheetStyles.rowMeta}>{isPassed ? `Found at mile ~${l.mileMarker}` : `${formatMiles(milesToGo)} mi to go`}</Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                    <KidsMiniButton label="Close" variant="berry" onPress={onClose} style={{ marginTop: kidsSpacing.sm, flex: 0 }} />
                </Pressable>
            </ModalBackdrop>
        </Modal>
    );
}

// The trail-picker sheet: 'initial' (no trail yet) / 'completed' (just
// finished) are non-dismissible; 'voluntary' (tapped "Switch Trail") is.
function KidsTrailCompleteModal({ trails, onSelectTrail, mode, onClose }: any) {
    const dismissible = mode === 'voluntary';
    return (
        <Modal visible animationType="slide" transparent onRequestClose={dismissible ? onClose : undefined}>
            <ModalBackdrop style={{ justifyContent: 'flex-end' }}>
                <View style={sheetStyles.sheet}>
                    <View style={sheetStyles.grabber} />
                    <Text style={sheetStyles.sheetTitle}>
                        {mode === 'initial' && 'Pick Your Trail! 🧭'}
                        {mode === 'completed' && 'You did it! Pick a New Trail 🎉'}
                        {mode === 'voluntary' && 'Switch Trail'}
                    </Text>
                    <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
                        {trails.length === 0 ? (
                            <View style={{ padding: kidsSpacing.xl, alignItems: 'center' }}>
                                <GlobeMascot pose="cheer" size={80} />
                                <Text style={[sheetStyles.rowMeta, { textAlign: 'center', marginTop: kidsSpacing.md, fontSize: 15 }]}>
                                    Wow! You finished every trail there is!
                                </Text>
                            </View>
                        ) : (
                            trails.map((trail: any) => {
                                const badgeColor = DIFFICULTY_COLORS[trail.difficulty as TrailSummary['difficulty']] || kidsColors.sky;
                                return (
                                    <Pressable key={trail.id} onPress={() => onSelectTrail(trail)} style={sheetStyles.trailCard} accessibilityRole="button">
                                        <Image
                                            source={trail.image_url ? { uri: trail.image_url } : 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=300&q=80'}
                                            style={sheetStyles.trailCardImage}
                                            contentFit="cover"
                                        />
                                        <View style={{ padding: kidsSpacing.md }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: kidsSpacing.sm }}>
                                                <Text style={sheetStyles.trailCardName} numberOfLines={1}>{trail.name}</Text>
                                                <View style={[sheetStyles.trailCardBadge, { backgroundColor: badgeColor }]}>
                                                    <Text style={sheetStyles.trailCardBadgeText}>{trail.difficulty}</Text>
                                                </View>
                                            </View>
                                            <Text style={sheetStyles.rowMeta}>📏 {formatMiles(trail.miles)} miles</Text>
                                        </View>
                                    </Pressable>
                                );
                            })
                        )}
                    </ScrollView>
                    {dismissible && <KidsMiniButton label="Never Mind" variant="berry" onPress={onClose} style={{ marginTop: kidsSpacing.sm, flex: 0 }} />}
                </View>
            </ModalBackdrop>
        </Modal>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    fallbackTitle: { fontFamily: kidsFonts.display, fontSize: 20, color: kidsColors.ink, marginTop: kidsSpacing.lg, textAlign: 'center' },
    fallbackBody: { fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.subink, marginTop: kidsSpacing.sm, textAlign: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: kidsSpacing.lg },
    greeting: { fontFamily: kidsFonts.display, fontSize: 22, color: kidsColors.ink, lineHeight: 26 },
    trailLink: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.sky, marginTop: 4 },
    progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: kidsSpacing.sm },
    progressLabel: { fontFamily: kidsFonts.display, fontSize: 16, color: kidsColors.ink },
    progressCaption: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.subink, marginTop: kidsSpacing.sm },
    sectionTitle: { fontFamily: kidsFonts.display, fontSize: 16, color: kidsColors.ink, paddingHorizontal: kidsSpacing.lg, marginBottom: kidsSpacing.sm },
    landmarkStickerWrap: { width: 108, alignItems: 'center' },
    landmarkSticker: {
        width: 88,
        height: 88,
        borderRadius: kidsRadius.lg,
        backgroundColor: kidsColors.surface,
        borderWidth: 3,
        borderColor: kidsColors.skyBright,
        alignItems: 'center',
        justifyContent: 'center',
    },
    landmarkStickerLocked: {
        borderColor: kidsColors.cardBorder,
        backgroundColor: kidsColors.bg,
    },
    landmarkStickerFace: { alignItems: 'center', justifyContent: 'center' },
    quizDot: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: kidsColors.sun,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: kidsColors.white,
    },
    landmarkStickerTitle: { fontFamily: kidsFonts.body, fontSize: 12, color: kidsColors.ink, textAlign: 'center', marginTop: 6 },
    landmarkStickerMeta: { fontFamily: kidsFonts.bodyRegular, fontSize: 11, color: kidsColors.subink, textAlign: 'center', marginTop: 2 },
});

const sheetStyles = StyleSheet.create({
    sheet: {
        backgroundColor: kidsColors.surface,
        borderTopLeftRadius: kidsRadius.xl,
        borderTopRightRadius: kidsRadius.xl,
        maxHeight: '85%',
        width: '100%',
        paddingHorizontal: kidsSpacing.lg,
        paddingTop: kidsSpacing.sm,
        paddingBottom: kidsSpacing.lg,
    },
    grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: kidsColors.cardBorder, alignSelf: 'center', marginBottom: kidsSpacing.md },
    sheetTitle: { fontFamily: kidsFonts.display, fontSize: 20, color: kidsColors.ink, marginBottom: kidsSpacing.md },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: kidsSpacing.sm },
    rowTitle: { fontFamily: kidsFonts.body, fontSize: 15, color: kidsColors.ink },
    rowMeta: { fontFamily: kidsFonts.bodyRegular, fontSize: 12, color: kidsColors.subink, marginTop: 2 },
    trailCard: {
        backgroundColor: kidsColors.bg,
        borderRadius: kidsRadius.lg,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
        overflow: 'hidden',
        marginBottom: kidsSpacing.md,
    },
    trailCardImage: { width: '100%', height: 110, backgroundColor: kidsColors.cardBorder },
    trailCardName: { flex: 1, fontFamily: kidsFonts.display, fontSize: 15, color: kidsColors.ink },
    trailCardBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: kidsRadius.pill },
    trailCardBadgeText: { fontSize: 10, color: '#FFF', fontFamily: kidsFonts.bodyBold },
});
