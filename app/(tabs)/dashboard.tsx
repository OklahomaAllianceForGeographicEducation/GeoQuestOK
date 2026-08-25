// app/(tabs)/dashboard.tsx
// Main experience screen. Dynamically branches out between the student map interface
// and the educator class control deck based on the authenticated profile row role.
// This is the single most complex screen in the app: it renders a live
// trail map, tracks the student's walked-vs-remaining progress along the
// route, pops up landmark/quiz modals as the student "crosses" mile
// markers, and handles switching to a new trail once the current one is
// completed.

import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, DIFFICULTY_COLORS, getDashboardStyles } from '../../commonStyles';
import { showAlert } from '../../lib/confirmAlert';
import { useBadgeUnlocks } from '../../components/BadgeUnlockProvider';
import MileageLogModal from '../../components/MileageLogModal';
import ModalBackdrop from '../../components/ModalBackdrop';
import QuizModal from '../../components/QuizModal';
// TrailMap is the actual interactive map component (own file under
// components/) — it likely wraps a native MapView, drawing the walked and
// remaining route as separate colored lines plus landmark pins.
import TrailMap from '../../components/TrailMap';
import TourTarget from '../../components/tour/TourTarget';
import { getTrailMilesForUser, logMilesActivity } from '../../lib/activity';
import { signOutAndRedirect } from '../../lib/auth';
import {
    geojsonLineToCoords,
    geojsonPointsToLandmarks,
    type ActiveTrail,
    type Coordinate,
    type Landmark,
} from '../../lib/landmarks';
import { fetchAnsweredQuestionIds, fetchAssignedQuizzesForStudent, type AssignedQuiz } from '../../lib/quizzes';
import { fetchTrailDetails, fetchTrailList, formatMiles, type TrailSummary } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// Finds the geographic midpoint of a trail's route by averaging its
// bounding box's min/max latitude and longitude — used as the map's
// default center point.
function getTrailCenter(coords: Coordinate[]): Coordinate {
    if (!coords.length) return { latitude: 35.4676, longitude: -97.5164 };
    const bounds = coords.reduce(
        (acc, coord) => ({
            minLat: Math.min(acc.minLat, coord.latitude),
            maxLat: Math.max(acc.maxLat, coord.latitude),
            minLng: Math.min(acc.minLng, coord.longitude),
            maxLng: Math.max(acc.maxLng, coord.longitude),
        }),
        { minLat: coords[0].latitude, maxLat: coords[0].latitude, minLng: coords[0].longitude, maxLng: coords[0].longitude }
    );
    return { latitude: (bounds.minLat + bounds.maxLat) / 2, longitude: (bounds.minLng + bounds.maxLng) / 2 };
}

// Builds the full map "region" (center + zoom level), reusing the same
// bounding-box + 1.35x-padding + 0.08-minimum-zoom logic seen in
// app/trails.tsx and passport.tsx.
function getTrailRegion(coords: Coordinate[]) {
    const center = getTrailCenter(coords);
    if (!coords.length) {
        return { latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.25, longitudeDelta: 0.25 };
    }
    const bounds = coords.reduce(
        (acc, coord) => ({
            minLat: Math.min(acc.minLat, coord.latitude),
            maxLat: Math.max(acc.maxLat, coord.latitude),
            minLng: Math.min(acc.minLng, coord.longitude),
            maxLng: Math.max(acc.maxLng, coord.longitude),
        }),
        { minLat: coords[0].latitude, maxLat: coords[0].latitude, minLng: coords[0].longitude, maxLng: coords[0].longitude }
    );
    return {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: Math.max((bounds.maxLat - bounds.minLat) * 1.35, 0.08),
        longitudeDelta: Math.max((bounds.maxLng - bounds.minLng) * 1.35, 0.08),
    };
}

// Great-circle distance between two lat/lng points, in miles.
function haversineMiles(a: Coordinate, b: Coordinate): number {
    const R = 3958.8;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Real (haversine) distance walked ALONG the route from coords[0] up to and
// including coords[i], for every i -- e.g. cumulativeMiles[3] is the true
// distance from the trailhead to the 4th recorded point. This is what lets
// "how many miles has the student walked" map onto an actual position on
// the line, instead of assuming every recorded point is evenly spaced.
// Digitized trails never are: a curvy few hundred yards through a town can
// have as many points as a straight 7-mile stretch of highway, so treating
// "60% of the points" as "60% of the distance" routinely put the walked/
// remaining split and the student's marker miles away from where they
// actually were -- e.g. on Red River, index-fraction math placed a student
// who'd walked 30 real miles at a point 40 miles down the line, ten miles
// ahead of themselves, and made already-passed landmarks look like they
// were still ahead of the marker.
export function computeCumulativeMiles(coords: Coordinate[]): number[] {
    const cumulative: number[] = coords.length > 0 ? [0] : [];
    for (let i = 1; i < coords.length; i++) {
        cumulative.push(cumulative[i - 1] + haversineMiles(coords[i - 1], coords[i]));
    }
    return cumulative;
}

// Finds the index `lower` such that cumulativeMiles[lower] is the last
// recorded point at or before targetMile along the route -- i.e. targetMile
// falls somewhere between coords[lower] and coords[lower + 1]. Shared by
// getCoordAtMile (below) and the walked/remaining route split in the main
// component, so the "you are here" marker and the colored line it sits on
// are always derived from the exact same position.
export function findRouteBracketIndex(cumulativeMiles: number[], targetMile: number): number {
    if (cumulativeMiles.length === 0) return 0;
    let lower = 0;
    for (let i = 0; i < cumulativeMiles.length - 1; i++) {
        if (cumulativeMiles[i + 1] >= targetMile) {
            lower = i;
            break;
        }
        lower = i + 1;
    }
    return lower;
}

// The core "where is the student's marker on the map" calculation: given
// the full list of route coordinates, each one's real cumulative distance
// from the trailhead, and how many miles the student has walked so far,
// returns the exact lat/lng point along the route that corresponds to that
// mileage — this is what makes the student's position marker move smoothly
// along the trail as they log more miles, rather than just jumping between
// landmark pins.
export function getCoordAtMile(coords: Coordinate[], cumulativeMiles: number[], targetMile: number): Coordinate {
    if (!coords.length) return { latitude: 35.4676, longitude: -97.5164 };
    // If they haven't walked anything yet, they're at the very start of
    // the route.
    if (targetMile <= 0) return coords[0];
    const totalRouteMiles = cumulativeMiles[cumulativeMiles.length - 1] ?? 0;
    // If they've walked the whole (or more than the whole) route, place
    // them at the very last coordinate — don't extrapolate past the end.
    if (targetMile >= totalRouteMiles) return coords[coords.length - 1];

    // `lower` and `upper` are the two whole-number coordinate indices that
    // bracket the real-distance position (e.g. the recorded points just
    // before and just after 12.6 real miles in).
    const lower = findRouteBracketIndex(cumulativeMiles, targetMile);
    // Math.min(..., coords.length - 1) guards against `upper` ever going
    // past the last valid array index.
    const upper = Math.min(lower + 1, coords.length - 1);
    const segStart = cumulativeMiles[lower];
    const segEnd = cumulativeMiles[upper];
    // `t` is how far between `lower` and `upper` the exact position falls,
    // as a fraction of THIS segment's own real length (0 to 1) — not of the
    // route's average segment length, so long and short segments both
    // interpolate correctly.
    const t = segEnd > segStart ? (targetMile - segStart) / (segEnd - segStart) : 0;
    // Linear interpolation ("lerp"): blend between the `lower` and `upper`
    // coordinates proportionally to `t`, producing a smooth in-between
    // point rather than snapping to one of the two nearest recorded
    // coordinates.
    return {
        latitude: coords[lower].latitude + t * (coords[upper].latitude - coords[lower].latitude),
        longitude: coords[lower].longitude + t * (coords[upper].longitude - coords[lower].longitude),
    };
}

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
    // A ref to the underlying map instance, used to imperatively call
    // methods like animateToRegion() (see the "recenter" button below) —
    // `any` typed since the exact map library's ref type isn't imported here.
    const mapRef = useRef<any>(null);
    const { refreshBadgeInbox } = useBadgeUnlocks();

    // Structural User Metadata States
    const [userRole, setUserRole] = useState<'student' | 'teacher' | 'admin' | 'site_admin'>('student');
    // Whether this account (if a teacher/admin) is currently viewing the
    // student-style "classic" experience or their normal teacher tools.
    const [activeView, setActiveView] = useState<'classic' | 'teacher'>('classic');
    const [greetingName, setGreetingName] = useState('Explorer');
    const [schoolDistrict, setSchoolDistrict] = useState('');
    const [gradesText, setGradesText] = useState('');
    const [loadingLayout, setLoadingLayout] = useState(true);

    // Student Progress Tracking Data States
    const [milesWalked, setMilesWalked] = useState(0);
    const [totalMiles, setTotalMiles] = useState(0);
    const [trailName, setTrailName] = useState('Choose your trail');
    const [trailId, setTrailId] = useState<string | null>(null);
    const [routeGeojson, setRouteGeojson] = useState<any>(null);
    const [landmarksGeojson, setLandmarksGeojson] = useState<any>(null);
    // The full catalog of trails, used to build the "pick your next trail"
    // list once the current one is done.
    const [visibleTrails, setVisibleTrails] = useState<TrailSummary[]>([]);
    const [completedTrailIds, setCompletedTrailIds] = useState<string[]>([]);

    // Overlay Popup Modal Controllers
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [allLandmarksOpen, setAllLandmarksOpen] = useState(false);
    // Which single landmark's detail/quiz modal is currently open.
    const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
    // A QUEUE of landmarks waiting to be shown one after another — used
    // when the student logs enough miles in one go to cross MULTIPLE
    // landmarks at once, so each gets its own popup shown in sequence
    // rather than all appearing simultaneously.
    const [popupQueue, setPopupQueue] = useState<Landmark[]>([]);
    // A ref (not state, since we don't need re-renders when it changes)
    // tracking which landmark ids have ALREADY been auto-popped this
    // session, so re-crossing the same mileage range (e.g. after a
    // refresh) doesn't spam the same popups again.
    const autoPoppedIdsRef = useRef<Set<string>>(new Set());
    // Remembers the previous milesWalked value between renders/effects, so
    // the "did we just cross a new landmark" effect below can compare
    // "before" vs "after" mileage. `null` specifically means "not yet
    // initialized" (distinct from 0 miles), used to avoid firing false
    // popups on the very first load.
    const prevMilesWalkedRef = useRef<number | null>(null);

    // Explicit operational state tracking completed workflow state transitions
    // Whether the "pick your next trail" modal (TrailCompleteModal) should
    // be forced open.
    const [showRolloverModal, setShowRolloverModal] = useState(false);
    // Whether the student voluntarily opened the trail switcher (via the
    // "Switch Trail" button) -- distinct from showRolloverModal, which is
    // for the forced "you just finished, pick a next one" case.
    const [switchTrailModalOpen, setSwitchTrailModalOpen] = useState(false);

    // Quiz assignment state (student side)
    const [userId, setUserId] = useState<string | null>(null);
    // A lookup from landmark id → the quiz question assigned to it (if
    // any) for the classes this student belongs to.
    const [quizByLandmarkId, setQuizByLandmarkId] = useState<Map<string, AssignedQuiz>>(new Map());
    // The set of quiz question ids this student has ALREADY answered.
    const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());

    // 1. State Hydration. This is a useFocusEffect (not a plain mount-only
    // effect) because expo-router's tab navigator keeps this screen mounted
    // in the background when you switch tabs -- a plain `useEffect(..., [])`
    // would only ever read the profile once per app launch, so miles logged
    // from the Fitness tab (or any other change made elsewhere) would never
    // show up here until a full app restart. Re-running on every focus keeps
    // milesWalked/trailId/etc. in sync with whatever's actually in the DB.
    const loadProfileBoundaries = useCallback(async () => {
        try {
            const { data: authData } = await supabase.auth.getUser();
            if (!authData?.user) return;
            setUserId(authData.user.id);

            const { data: profileRow } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', authData.user.id)
                .single();

            if (profileRow) {
                // `??` (nullish coalescing) rather than `||` is used here
                // specifically because a falsy-but-valid value like an
                // empty string or 0 shouldn't be replaced by the default —
                // only genuinely missing (null/undefined) values should
                // fall back.
                const extractedRole = profileRow.role ?? 'student';
                const extractedView = profileRow.active_view ?? 'classic';
                setUserRole(extractedRole);
                setActiveView(extractedView);
                setGreetingName(profileRow.display_name || profileRow.username || 'Explorer');
                setSchoolDistrict(profileRow.school_district_name || 'Oklahoma');
                setGradesText(profileRow.generic_grades_taught || '');

                // milesWalked is NOT read from profiles.total_miles_walked
                // here -- that column is a separate lifetime total (used
                // for badges/leaderboard), not per-trail progress. The
                // "Load Trail Details" effect below fetches the real
                // per-trail figure once trailId is known.

                const { data: completedTrails } = await supabase
                    .from('user_completed_trails')
                    .select('trail_id')
                    .eq('user_id', authData.user.id);

                setCompletedTrailIds((completedTrails || []).map((row: { trail_id: string }) => String(row.trail_id)));

                // Teachers/site admins currently viewing their OWN teacher
                // dashboard (not previewing the classic student view)
                // don't need any of the student-specific trail-loading
                // logic below — bail out early.
                if ((extractedRole === 'teacher' || extractedRole === 'site_admin') && extractedView === 'teacher') {
                    return;
                }

                if (profileRow.active_trail_id) {
                    setTrailId(profileRow.active_trail_id);
                } else {
                    setTrailId(null);
                }
            } else {
                setGreetingName('Explorer');
                setActiveView('classic');
                setTrailId(null);
            }
        } catch (err) {
            console.error("Layout Hydration Crash:", err);
        } finally {
            setLoadingLayout(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadProfileBoundaries();
        }, [loadProfileBoundaries])
    );

    // 1b. Refresh THIS trail's logged mileage every time the Dashboard
    // regains focus (e.g. coming back from the Fitness tab after logging
    // an activity). loadProfileBoundaries above also runs on focus, but it
    // only calls setTrailId(profileRow.active_trail_id) -- when that id
    // hasn't actually changed (the common case: same active trail, just
    // more miles logged against it), React skips re-rendering for that
    // no-op state update, so the "Load Trail Details" effect below (keyed
    // on trailId) never re-fires and milesWalked silently goes stale until
    // something else forces trailId to change. Re-fetching it directly
    // here, independent of trailId identity, is what actually keeps the
    // progress bar/map in sync.
    useFocusEffect(
        useCallback(() => {
            if (userRole !== 'student' && activeView !== 'classic') return;
            if (!trailId || !userId) return;
            void getTrailMilesForUser(userId, trailId)
                .then((miles) => setMilesWalked(miles))
                .catch((err) => console.error('Failed to refresh trail mileage on focus:', err));
        }, [trailId, userId, userRole, activeView])
    );

    // 2. Load Maps / Progress Collections if student metrics apply
    // Fetches the full route/landmark GeoJSON for whichever trail is
    // currently active, re-running whenever the trail (or role/view)
    // changes.
    useEffect(() => {
        // NOTE: this condition uses && here (both must be true to bail
        // out), meaning it only skips loading if the role ISN'T student
        // AND the view ISN'T classic — i.e. it still loads for students
        // OR anyone currently in classic view, matching the isStudentShell
        // logic used later in the render.
        if (userRole !== 'student' && activeView !== 'classic') return;
        if (!trailId || !userId) return;
        async function loadTrailDetails() {
            try {
                const [data, trailMiles] = await Promise.all([
                    fetchTrailDetails(trailId!),
                    // Progress toward THIS specific trail, computed fresh
                    // from activity_logs rather than any shared counter --
                    // see lib/activity.ts's getTrailMilesForUser for why.
                    // This naturally picks up right where the student left
                    // off if they're switching back to a trail they'd
                    // already made progress on, and shows 0 for a trail
                    // they've never touched, with no carry-over math and no
                    // risk of the same logged miles counting toward more
                    // than one trail at once.
                    getTrailMilesForUser(userId!, trailId!),
                ]);

                if (data) {
                    setTotalMiles(data.miles);
                    setTrailName(data.name);
                    setRouteGeojson(data.routeGeojson);
                    setLandmarksGeojson(data.landmarksGeojson);
                }

                setMilesWalked(trailMiles);

                // Covers the edge case where this trail's progress already
                // meets or exceeds its length right when it loads (e.g.
                // switching back to a trail that was actually finished) --
                // immediately show the "pick next trail" modal rather than
                // silently letting them sit on a "finished" trail.
                if (data && data.miles > 0 && trailMiles >= data.miles) {
                    setShowRolloverModal(true);
                }
            } catch (e) {
                console.error(e);
            }
        }
        void loadTrailDetails();
    }, [trailId, userRole, activeView, userId]);

    // 2b. Load whatever quizzes this student's classes have assigned for the active trail.
    useEffect(() => {
        if (userRole !== 'student' && activeView !== 'classic') return;
        if (!trailId || !userId) {
            setQuizByLandmarkId(new Map());
            setAnsweredQuestionIds(new Set());
            return;
        }
        async function loadAssignedQuizzes() {
            try {
                const assigned = await fetchAssignedQuizzesForStudent(trailId!);
                // Build a lookup Map keyed by landmarkId for quick access
                // when rendering each landmark card.
                setQuizByLandmarkId(new Map(assigned.map((a) => [a.question.landmarkId, a])));

                const answered = await fetchAnsweredQuestionIds(userId!, assigned.map((a) => a.question.id));
                setAnsweredQuestionIds(answered);
            } catch (e) {
                console.error(e);
            }
        }
        void loadAssignedQuizzes();
    }, [trailId, userId, userRole, activeView]);

    // Reset the "already seen" crossing baseline whenever the active trail changes,
    // so switching trails doesn't retroactively fire popups for carried-over mileage.
    useEffect(() => {
        prevMilesWalkedRef.current = null;
    }, [trailId]);

    // The "did the student just cross any new landmarks" detector — runs
    // every time milesWalked changes.
    useEffect(() => {
        if (userRole !== 'student' && activeView !== 'classic') return;

        // First run after a trail switch (prevMilesWalkedRef was just
        // reset to null above): just record the current mileage as the
        // baseline WITHOUT checking for crossings, since we have nothing
        // meaningful to compare against yet.
        if (prevMilesWalkedRef.current === null) {
            prevMilesWalkedRef.current = milesWalked;
            return;
        }

        const prevMiles = prevMilesWalkedRef.current;
        if (milesWalked > prevMiles) {
            const landmarks = geojsonPointsToLandmarks(landmarksGeojson);
            // Find every landmark whose mile marker falls AFTER the
            // previous mileage but AT OR BEFORE the new mileage — i.e.
            // landmarks the student just "walked past" with this update —
            // and that haven't already been auto-popped before. A mile-0
            // "Welcome to the trail" landmark is included via `>=` rather
            // than a strict `>`: prevMiles is only ever 0 here on the
            // transition out of a true 0-miles starting baseline (the
            // null-branch above records the baseline WITHOUT checking
            // crossings, so this block never runs on that first render),
            // meaning mileMarker(0) >= prevMiles(0) fires exactly once, on
            // the student's first logged activity on this trail -- not on
            // every re-render or re-focus at 0 miles.
            const crossed = landmarks
                .filter((l) => l.mileMarker >= prevMiles && l.mileMarker <= milesWalked)
                .filter((l) => !autoPoppedIdsRef.current.has(l.id))
                .sort((a, b) => a.mileMarker - b.mileMarker);

            if (crossed.length > 0) {
                // Mark all of them as "already popped" immediately, then
                // add them to the popup queue so they show one at a time.
                crossed.forEach((l) => autoPoppedIdsRef.current.add(l.id));
                setPopupQueue((q) => [...q, ...crossed]);
            }
        }
        prevMilesWalkedRef.current = milesWalked;
    }, [milesWalked, landmarksGeojson, userRole, activeView]);

    // Catch trail completion any time milesWalked/totalMiles change for any
    // reason (a fresh focus refetch, a new log, a trail switch) -- not just
    // the one-off checks inside loadTrailDetails/handleLogMiles, which only
    // fire on their own specific trigger and can miss a completion that
    // happens via a different path (e.g. logging enough miles on the
    // current trail to finish it, without switching trails).
    useEffect(() => {
        if (userRole !== 'student' && activeView !== 'classic') return;
        if (totalMiles > 0 && milesWalked >= totalMiles) {
            setShowRolloverModal(true);
        }
    }, [milesWalked, totalMiles, userRole, activeView]);

    // Pop the next queued landmark into view once the current modal closes.
    // Runs whenever popupQueue or selectedLandmark changes — as soon as
    // there's no landmark currently open AND there's something waiting in
    // the queue, immediately promote the first queued item to
    // selectedLandmark (opening its modal) and remove it from the queue.
    useEffect(() => {
        if (!selectedLandmark && popupQueue.length > 0) {
            // Array destructuring: `next` is the first element, `...rest`
            // captures everything else as a new array.
            const [next, ...rest] = popupQueue;
            setSelectedLandmark(next);
            setPopupQueue(rest);
        }
    }, [popupQueue, selectedLandmark]);

    useEffect(() => {
        if (userRole !== 'student' && activeView !== 'classic') return;
        async function loadCatalogs() {
            const list = await fetchTrailList();
            setVisibleTrails(list);
        }
        void loadCatalogs();
    }, [userRole, activeView]);

    // Handles the mileage-logging flow triggered from MileageLogModal.
    const handleLogMiles = async (amount: number) => {
        try {
            const { data: authData } = await supabase.auth.getUser();
            if (!authData?.user) return;
            const milesToLog = amount;
            const newMiles = milesWalked + milesToLog;

            if (!trailId) {
                showAlert('No Active Trail', 'Please choose a trail before logging miles.');
                return;
            }

            await logMilesActivity({
                userId: authData.user.id,
                miles: milesToLog,
                trailId,
            });

            // Update local state immediately for a responsive UI, rather
            // than waiting for a re-fetch.
            setMilesWalked(newMiles);

            setLogModalOpen(false);

            // Check whether this newly logged mileage unlocked any badges.
            await refreshBadgeInbox();

            if (totalMiles > 0 && newMiles >= totalMiles) {
                setShowRolloverModal(true);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Handles picking a new trail, whether that's the forced initial pick,
    // a just-finished rollover, or a voluntary mid-trail switch. No
    // mileage math happens here at all -- switching only changes which
    // trail_id is active. Progress on the new trail (0 for one they've
    // never touched, or whatever they'd already logged if they're
    // switching back to one) is picked up by the "Load Trail Details"
    // effect once trailId changes below.
    const handleNewTrailSelected = async (trail: any) => {
        try {
            const { data: authData } = await supabase.auth.getUser();
            if (!authData?.user) return;

            setShowRolloverModal(false);
            setSwitchTrailModalOpen(false);

            await supabase.from('profiles').update({
                active_trail_id: trail.id,
            }).eq('id', authData.user.id);

            setTrailId(trail.id);
            // Optimistic UI: show the new trail's name/length and reset the
            // progress bar to 0 immediately rather than waiting on the
            // network round-trip -- the effect corrects milesWalked right
            // after if this trail actually had prior progress on it.
            setTotalMiles(trail.miles);
            setTrailName(trail.name);
            setMilesWalked(0);
        } catch (e) {
            console.error(e);
        }
    };

    // Geospatial Layer Memoizations
    // A chain of derived values, each recalculated only when its specific
    // dependencies change, forming a pipeline: raw GeoJSON → flat
    // coordinate list → map region → student's exact position on the route.
    const trailCoords = useMemo(() => geojsonLineToCoords(routeGeojson), [routeGeojson]);
    const allLandmarks = useMemo(() => geojsonPointsToLandmarks(landmarksGeojson), [landmarksGeojson]);
    const trailRegion = useMemo(() => getTrailRegion(trailCoords), [trailCoords]);
    // Real (not index-fraction) distance from the trailhead to each
    // recorded route point — see computeCumulativeMiles above for why this
    // matters. Only depends on trailCoords, so it's recomputed once per
    // trail load, not on every mile logged.
    const cumulativeMiles = useMemo(() => computeCumulativeMiles(trailCoords), [trailCoords]);
    const userPosition = useMemo(() => getCoordAtMile(trailCoords, cumulativeMiles, milesWalked), [trailCoords, cumulativeMiles, milesWalked]);

    // The list of landmarks the student has ALREADY reached (mileMarker <=
    // milesWalked) that have an assigned quiz they haven't answered yet —
    // used both for the badge icons on landmark cards and for the "Quizzes
    // waiting for you" call-to-action button.
    const pendingQuizzes = useMemo(() => {
        return allLandmarks.filter((l) => {
            const assigned = quizByLandmarkId.get(l.id);
            if (!assigned) return false;
            if (answeredQuestionIds.has(assigned.question.id)) return false;
            return l.mileMarker <= milesWalked;
        });
    }, [allLandmarks, quizByLandmarkId, answeredQuestionIds, milesWalked]);

    // Progress bar percentage, clamped to a max of 100 (so overshooting
    // the trail length via a rollover-eligible surplus doesn't visually
    // overflow the bar past full).
    const progressPct = totalMiles > 0 ? Math.min((milesWalked / totalMiles) * 100, 100) : 0;
    // Figures out which INDEX into the trailCoords array corresponds to
    // the student's current mileage, so the route line can be visually
    // split into a "walked" (already-covered) segment and a "remaining"
    // segment on the map. Uses the same real-distance bracketing as
    // userPosition above (rather than a naive fraction-of-array-length), so
    // the split always lands exactly where the "you are here" marker is —
    // never ahead of or behind it. Math.min(milesWalked, totalRouteMiles)
    // prevents walking past the last recorded point if milesWalked exceeds
    // the route's own real length (a rollover-pending state).
    const totalRouteMiles = cumulativeMiles[cumulativeMiles.length - 1] ?? 0;
    const splitIndex = trailCoords.length > 0
        ? findRouteBracketIndex(cumulativeMiles, Math.min(milesWalked, totalRouteMiles))
        : 0;
    // .slice(0, splitIndex + 1) takes everything UP TO AND INCLUDING the
    // split point — the "already walked" portion of the route.
    const walkedCoords = trailCoords.slice(0, splitIndex + 1);
    // .slice(splitIndex) takes everything FROM the split point onward
    // (deliberately overlapping by one coordinate with walkedCoords above,
    // so the two colored line segments connect visually without a gap).
    const remainingCoords = trailCoords.slice(splitIndex);

    // Filters out both the currently active trail AND any historically completed trails
    // The list of trails offered in the "pick your next trail" modal:
    // every known trail EXCEPT the one currently active and any the
    // student has already fully completed before.
    const trailChoices = useMemo(() => {
        return visibleTrails.filter(t => t.id !== trailId && !completedTrailIds.includes(t.id));
    }, [visibleTrails, trailId, completedTrailIds]);

    // What mode the trail picker modal should render in, or null if it
    // shouldn't show at all right now.
    const trailModalMode: 'initial' | 'completed' | 'voluntary' | null = !trailId
        ? 'initial'
        : showRolloverModal
            ? 'completed'
            : switchTrailModalOpen
                ? 'voluntary'
                : null;

    if (loadingLayout) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme?.background || '#F6EFE7' }}>
                <ActivityIndicator size="large" color={theme?.accent || '#FF5722'} />
            </View>
        );
    }

    // Whether this account should see the STUDENT map/trail experience —
    // true for genuine students, and ALSO true for a teacher/site_admin/
    // okage/etc. currently previewing the classic view. Deliberately NOT
    // narrowed to `userRole === 'teacher'`: every other role/view gate in
    // this file already uses the role-agnostic `activeView === 'classic'`
    // pattern (see the `userRole !== 'student' && activeView !== 'classic'`
    // early-returns above), since lib/access.ts's getAllowedTeacherViews is
    // what actually decides which roles are allowed into classic view in
    // the first place -- this check doesn't need its own role allowlist.
    // Hardcoding just 'teacher' here left site_admin (and okage) previewers
    // landing on the "create a class" educator-fallback card below instead
    // of the real walking/mileage UI.
    const isStudentShell = userRole === 'student' || activeView === 'classic';

    // If NOT the student shell, render a simplified educator summary card
    // instead of the map interface — this is a minimal fallback view
    // (note the "Coming Soon" alert on its button), distinct from the
    // full-featured (teacher-tabs) screens elsewhere in the app; this
    // branch is presumably reached only in edge cases like a teacher who
    // somehow lands on the classic tab group without switching views.
    if (!isStudentShell) {
        return (
            <View style={[teacherStyles.container, { backgroundColor: theme.background }]}>
                <StatusBar barStyle="dark-content" />
                <ScrollView contentContainerStyle={teacherStyles.scrollContent}>
                    <View style={[teacherStyles.badgeRow, { backgroundColor: theme.border }]}>
                        <Text style={[teacherStyles.badgeText, { color: theme.accent }]}>🎯 Educator View</Text>
                    </View>
                    <Text style={[teacherStyles.titleText, { color: theme.text }]} accessibilityRole="header">Welcome back, {greetingName}</Text>
                    <Text style={[teacherStyles.subTitleText, { color: theme.subtext }]}>📍 Managing: {schoolDistrict}</Text>
                    {/* gradesText.replace('_', ' ') swaps the FIRST
                        underscore for a space (e.g. "middle_school" →
                        "middle school"), then .toUpperCase() capitalizes
                        it entirely for display. */}
                    {gradesText ? <Text style={[teacherStyles.metaText, { color: theme.subtext }]}>Class Tier: {gradesText.replace('_', ' ').toUpperCase()}</Text> : null}
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
                        <Text style={dStyles.headerGreeting} accessibilityRole="header">Ready to walk, {greetingName}?</Text>
                        <Text style={dStyles.headerTrailName} numberOfLines={1}>{trailName}</Text>
                        {/* Always available -- not just when a trail is
                            finished -- so a student can correct which
                            trail they're on for a class at any time. */}
                        <Pressable onPress={() => setSwitchTrailModalOpen(true)} hitSlop={8} accessibilityRole="button">
                            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700', marginTop: 2 }}>Switch Trail</Text>
                        </Pressable>
                    </View>
                    <View style={dStyles.milesChip}>
                        <Text style={dStyles.milesChipValue}>{formatMiles(milesWalked)}</Text>
                        <Text style={dStyles.milesChipLabel}>/ {formatMiles(totalMiles)} mi</Text>
                    </View>
                </View>

                <View style={dStyles.progressContainer}>
                    {/* The filled portion's width is set as a percentage
                        string (e.g. "42%"), computed from progressPct
                        above — this is what visually grows the progress
                        bar as the student logs more miles. */}
                    <View style={dStyles.progressTrack}><View style={[dStyles.progressFill, { width: `${progressPct}%` }]} /></View>
                    {/* .toFixed(0) rounds to a whole number percentage
                        (e.g. "42% complete" rather than "42.37%"). */}
                    <Text style={dStyles.progressLabel}>{progressPct.toFixed(0)}% complete</Text>
                </View>

                <TrailMap
                    walkedCoords={walkedCoords}
                    remainingCoords={remainingCoords}
                    allLandmarks={allLandmarks}
                    trailCoords={trailCoords}
                    userPosition={userPosition}
                    trailRegion={trailRegion}
                    milesWalked={milesWalked}
                    mapRef={mapRef}
                    dStyles={dStyles}
                    theme={theme}
                    onLandmarkPress={(l: Landmark) => setSelectedLandmark(l)}
                    // Tapping a "recenter" control (presumably rendered
                    // INSIDE the TrailMap component itself) calls this
                    // function, which imperatively animates the map back
                    // to center on the student's current position over
                    // 500 milliseconds.
                    onRecenter={() => mapRef.current?.animateToRegion({
                        latitude: userPosition.latitude,
                        longitude: userPosition.longitude,
                        latitudeDelta: trailRegion.latitudeDelta,
                        longitudeDelta: trailRegion.longitudeDelta,
                    }, 500)}
                />

                <View style={[dStyles.ctaRow, { flexDirection: 'row', gap: 12, paddingHorizontal: 16 }]}>
                    <TourTarget id="student.logButton" style={{ flex: 1 }}>
                        <Pressable style={dStyles.logButton} onPress={() => router.push('/fitness')} accessibilityRole="link"><Text style={dStyles.logButtonText}>Open Daily Log</Text></Pressable>
                    </TourTarget>
                    <Pressable style={[dStyles.logButton, { flex: 1 }]} onPress={() => setAllLandmarksOpen(true)} accessibilityRole="button"><Text style={dStyles.logButtonText}>All Landmarks</Text></Pressable>
                </View>

                {/* The "quizzes waiting" banner only appears when there's
                    at least one pending quiz — tapping it dumps the ENTIRE
                    pendingQuizzes list into the popup queue at once, so
                    the student can work through all of them in sequence. */}
                {pendingQuizzes.length > 0 && (
                    <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                        <Pressable
                            style={[dStyles.logButton, { backgroundColor: theme?.accent || '#FF5722' }]}
                            onPress={() => setPopupQueue(pendingQuizzes)}
                            accessibilityRole="button"
                        >
                            <Text style={dStyles.logButtonText}>📝 Quizzes waiting for you ({pendingQuizzes.length})</Text>
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
                        {allLandmarks.slice().sort((a, b) => a.mileMarker - b.mileMarker).map((l) => {
                            const assignedQuiz = quizByLandmarkId.get(l.id);
                            const hasPendingQuiz = !!assignedQuiz && !answeredQuestionIds.has(assignedQuiz.question.id);
                            const isPassed = l.mileMarker <= milesWalked;
                            return (
                                <LandmarkCard
                                    key={l.id}
                                    landmark={l}
                                    isPassed={isPassed}
                                    milesToGo={Math.max(0, l.mileMarker - milesWalked)}
                                    hasPendingQuiz={hasPendingQuiz}
                                    onPress={() => setSelectedLandmark(l)}
                                    dStyles={dStyles}
                                />
                            );
                        })}
                    </ScrollView>
                </TourTarget>
            </ScrollView>

            <MileageLogModal
                visible={logModalOpen}
                onSubmit={handleLogMiles}
                onClose={() => setLogModalOpen(false)}
                accentColor={theme?.accent || '#FF5722'}
                title="Log Your Progress"
            />
            {/* The trail-completion/selection modal only mounts while
                needed (see trailModalMode above) — it's not kept
                permanently mounted-but-hidden like some other modals in
                this app. */}
            {trailModalMode && (
                <TrailCompleteModal
                    trails={trailChoices}
                    onSelectTrail={handleNewTrailSelected}
                    dStyles={dStyles}
                    mode={trailModalMode}
                    onClose={() => setSwitchTrailModalOpen(false)}
                />
            )}
            {selectedLandmark && (
                <QuizModal
                    landmark={selectedLandmark}
                    assignedQuiz={quizByLandmarkId.get(selectedLandmark.id) ?? null}
                    // An inline Immediately-Invoked Function Expression
                    // (IIFE) computes whether the CURRENTLY selected
                    // landmark's quiz has already been answered — needed
                    // here as a plain boolean prop rather than a lookup
                    // QuizModal would have to do itself.
                    alreadyAnswered={(() => {
                        const assigned = quizByLandmarkId.get(selectedLandmark.id);
                        return assigned ? answeredQuestionIds.has(assigned.question.id) : false;
                    })()}
                    studentId={userId ?? ''}
                    trailId={trailId ?? ''}
                    accentColor={theme?.accent}
                    // When QuizModal reports a question was successfully
                    // answered, add its id to the answered set — `new
                    // Set(prev).add(questionId)` creates a fresh copy
                    // (required for React to detect the state change)
                    // with the new id included.
                    onAnswered={(questionId) => setAnsweredQuestionIds((prev) => new Set(prev).add(questionId))}
                    onClose={() => setSelectedLandmark(null)}
                />
            )}
            {allLandmarksOpen && <AllLandmarksModal landmarks={allLandmarks} milesWalked={milesWalked} onSelectLandmark={(l: any) => setSelectedLandmark(l)} onClose={() => setAllLandmarksOpen(false)} dStyles={dStyles} theme={theme} />}
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
