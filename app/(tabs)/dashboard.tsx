import {
    Text,
    View,
    ScrollView,
    Pressable,
    Modal,
    TextInput,
    useColorScheme,
    useWindowDimensions,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    Alert,
    ActivityIndicator
} from 'react-native';
import { useState, useRef, useMemo, useEffect } from 'react';
import { Image } from 'expo-image';
import { colors, getDashboardStyles } from '../../commonStyles';
import TrailMap from '../../components/TrailMap';
import { supabase } from '../../utils/supabase';
import { fetchTrailDetails, fetchTrailList, formatMiles, type TrailSummary } from '../../lib/trails';
import { ensureProfileRow } from '../../lib/profiles';

// ─── Types ────────────────────────────────────────────────────────────────────


export type Coordinate = { latitude: number; longitude: number };

export type Landmark = {
    id: string;
    title: string;
    description?: string;
    coordinate: Coordinate;
    mileMarker: number;
    image?: string;
    funFact?: string;
};

export type ActiveTrail = {
    id: string;
    name: string;
    totalMiles: number;
    routeCoordinates: Coordinate[];
    landmarks: Landmark[];
};

// ─── GeoJSON helpers ──────────────────────────────────────────────────────────

export function geojsonLineToCoords(geojson: any): Coordinate[] {
    const feature = geojson?.features?.[0];
    if (!geojson || !geojson.features || !geojson.features[0]) return [];
    if (!feature?.geometry?.coordinates) return [];

    const coords: Coordinate[] = [];

    const pushCoords = (value: any) => {
        if (!Array.isArray(value)) return;

        // A single position: [lng, lat]
        if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
            coords.push({ latitude: value[1], longitude: value[0] });
            return;
        }

        for (const item of value) {
            pushCoords(item);
        }
    };

    pushCoords(feature.geometry.coordinates);
    return coords;
}

export function geojsonPointsToLandmarks(geojson: any): Landmark[] {
    // Add this guard clause at the very beginning
    if (!geojson || !geojson.features) return [];

    return geojson.features.map((f: any) => ({
        id: String(f.id),
        title: f.properties?.title ?? 'Landmark',
        description: f.properties?.description ?? undefined,
        coordinate: {
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
        },
        mileMarker: f.properties?.NearestMile ?? 0,
        image: f.properties?.image ?? undefined,
        funFact: f.properties?.funFact ?? undefined,
    }));
}

function getTrailCenter(coords: Coordinate[]): Coordinate {
    if (!coords.length) {
        return { latitude: 35.4676, longitude: -97.5164 };
    }

    const bounds = coords.reduce(
        (acc, coord) => ({
            minLat: Math.min(acc.minLat, coord.latitude),
            maxLat: Math.max(acc.maxLat, coord.latitude),
            minLng: Math.min(acc.minLng, coord.longitude),
            maxLng: Math.max(acc.maxLng, coord.longitude),
        }),
        {
            minLat: coords[0].latitude,
            maxLat: coords[0].latitude,
            minLng: coords[0].longitude,
            maxLng: coords[0].longitude,
        }
    );

    return {
        latitude: (bounds.minLat + bounds.maxLat) / 2,
        longitude: (bounds.minLng + bounds.maxLng) / 2,
    };
}

function getTrailRegion(coords: Coordinate[]) {
    const center = getTrailCenter(coords);

    if (!coords.length) {
        return {
            latitude: center.latitude,
            longitude: center.longitude,
            latitudeDelta: 0.25,
            longitudeDelta: 0.25,
        };
    }

    const bounds = coords.reduce(
        (acc, coord) => ({
            minLat: Math.min(acc.minLat, coord.latitude),
            maxLat: Math.max(acc.maxLat, coord.latitude),
            minLng: Math.min(acc.minLng, coord.longitude),
            maxLng: Math.max(acc.maxLng, coord.longitude),
        }),
        {
            minLat: coords[0].latitude,
            maxLat: coords[0].latitude,
            minLng: coords[0].longitude,
            maxLng: coords[0].longitude,
        }
    );

    const latitudeDelta = Math.max((bounds.maxLat - bounds.minLat) * 1.35, 0.08);
    const longitudeDelta = Math.max((bounds.maxLng - bounds.minLng) * 1.35, 0.08);

    return {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta,
        longitudeDelta,
    };
}

// ─── Available trails for trail-select (fallback if Supabase is empty) ────────

type TrailOption = Pick<TrailSummary, 'id' | 'name' | 'miles' | 'difficulty'>;

const FALLBACK_TRAILS: TrailOption[] = [
    { id: '2', name: 'Cherokee Heritage Path', miles: 65, difficulty: 'Easy' },
    { id: '3', name: 'Red River Ranch Route', miles: 75, difficulty: 'Easy' },
    { id: '4', name: 'Tallgrass Prairie Pathway', miles: 90, difficulty: 'Easy-Moderate' },
    { id: '5', name: 'Sooner State Circuit', miles: 110, difficulty: 'Moderate' },
    { id: '6', name: 'Route 66 Classic Journey', miles: 125, difficulty: 'Moderate' },
    { id: '7', name: 'Arbuckle Adventure Trail', miles: 140, difficulty: 'Moderate' },
    { id: '8', name: 'Green Country Explorer', miles: 160, difficulty: 'Moderate-Difficult' },
    { id: '9', name: 'Great Plains Expedition', miles: 180, difficulty: 'Difficult' },
    { id: '10', name: 'Cross-Timbers Challenge', miles: 200, difficulty: 'Difficult' },
    { id: '11', name: 'Kiamichi Country Trek', miles: 220, difficulty: 'Very Difficult' },
    { id: '12', name: 'Ultimate Oklahoma Odyssey', miles: 250, difficulty: 'Most Difficult' },
];

// ─── Compute position along route at a given mile ─────────────────────────────

export function getCoordAtMile(coords: Coordinate[], totalMiles: number, targetMile: number): Coordinate {
    if (!coords.length) return { latitude: 35.4676, longitude: -97.5164 };
    if (targetMile <= 0) return coords[0];
    if (targetMile >= totalMiles) return coords[coords.length - 1];
    const targetFraction = targetMile / totalMiles;
    const targetIndex = targetFraction * (coords.length - 1);
    const lower = Math.floor(targetIndex);
    const upper = Math.min(lower + 1, coords.length - 1);
    const t = targetIndex - lower;
    return {
        latitude: coords[lower].latitude + t * (coords[upper].latitude - coords[lower].latitude),
        longitude: coords[lower].longitude + t * (coords[upper].longitude - coords[lower].longitude),
    };
}

// ─── Landmark Card ────────────────────────────────────────────────────────────
function LandmarkCard({
    landmark,
    onPress,
    dStyles,
}: {
    landmark: Landmark;
    onPress: () => void;
    dStyles: ReturnType<typeof getDashboardStyles>;
}) {
    return (
        <Pressable
            style={({ pressed }) => [
                dStyles.landmarkCard,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                landmark.mileMarker <= 0 && dStyles.landmarkCardPassed,
            ]}
            onPress={onPress}
        >
            <View style={dStyles.landmarkImagePlaceholder}>
                <Text style={dStyles.landmarkImageIcon}>📍</Text>
            </View>

            <Text style={dStyles.landmarkCardTitle} numberOfLines={2}>
                {landmark.title}
            </Text>

            <Text style={dStyles.landmarkCardMile}>
                {landmark.mileMarker <= 0 ? 'Passed' : `Mile ${landmark.mileMarker}`}
            </Text>
        </Pressable>
    );
}

// ─── Landmark Detail Modal ────────────────────────────────────────────────────

function LandmarkModal({ landmark, onClose, dStyles }: {
    landmark: Landmark;
    onClose: () => void;
    dStyles: ReturnType<typeof getDashboardStyles>;
}) {
    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={dStyles.modalOverlay}>
                <View style={dStyles.modalSheet}>
                    {landmark.image ? (
                        <Image source={{ uri: landmark.image }} style={dStyles.modalHeroImage} contentFit="cover" />
                    ) : (
                        <View style={dStyles.modalHeroPlaceholder}>
                            <Text style={{ fontSize: 64 }}>🏛️</Text>
                        </View>
                    )}
                    <Pressable style={dStyles.closeButton} onPress={onClose}>
                        <Text style={dStyles.closeButtonText}>✕</Text>
                    </Pressable>
                    <ScrollView contentContainerStyle={dStyles.modalContent} showsVerticalScrollIndicator={false}>
                        <Text style={dStyles.modalTitle}>{landmark.title}</Text>
                        <Text style={dStyles.modalMile}>Mile marker ~{landmark.mileMarker}</Text>
                        <View style={dStyles.modalDivider} />
                        {landmark.description ? (
                            <>
                                <Text style={dStyles.modalSectionLabel}>ABOUT</Text>
                                <Text style={dStyles.modalBodyText}>{landmark.description}</Text>
                            </>
                        ) : (
                            <Text style={dStyles.modalBodyText}>More details about this landmark coming soon.</Text>
                        )}
                        {landmark.funFact && (
                            <>
                                <Text style={dStyles.modalSectionLabel}>FUN FACT</Text>
                                <View style={dStyles.funFactBox}>
                                    <Text style={dStyles.funFactText}>💡 {landmark.funFact}</Text>
                                </View>
                            </>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─── All Landmarks Modal ──────────────────────────────────────────────────────

function AllLandmarksModal({ landmarks, milesWalked, onSelectLandmark, onClose, dStyles }: {
    landmarks: Landmark[];
    milesWalked: number;
    onSelectLandmark: (l: Landmark) => void;
    onClose: () => void;
    dStyles: ReturnType<typeof getDashboardStyles>;
}) {
    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View
                style={[
                    dStyles.modalOverlay,
                    {
                        justifyContent: 'center',
                        paddingVertical: 40,
                    },
                ]}
            >                <View style={[dStyles.modalSheet, { maxHeight: '85%' }]}>
                    <Pressable style={dStyles.closeButton} onPress={onClose}>
                        <Text style={dStyles.closeButtonText}>✕</Text>
                    </Pressable>
                    <Text style={[dStyles.modalTitle, { padding: 24, paddingBottom: 8 }]}>All Landmarks</Text>
                    <Text style={[dStyles.modalMile, { paddingHorizontal: 24, marginBottom: 12 }]}>
                        {landmarks.filter(l => l.mileMarker <= milesWalked).length} of {landmarks.length} passed
                    </Text>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {landmarks.map(landmark => {
                            const passed = landmark.mileMarker <= milesWalked;
                            return (
                                <Pressable
                                    key={landmark.id}
                                    style={[dStyles.allLandmarkRow, !passed && dStyles.allLandmarkRowLocked]}
                                    onPress={() => { onClose(); onSelectLandmark(landmark); }}
                                >
                                    <View style={[dStyles.allLandmarkDot, passed && dStyles.allLandmarkDotPassed]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[dStyles.allLandmarkTitle, !passed && dStyles.allLandmarkTitleLocked]}>
                                            {landmark.title}
                                        </Text>
                                        <Text style={dStyles.allLandmarkMile}>Mile ~{landmark.mileMarker}</Text>
                                    </View>
                                    <Text style={dStyles.allLandmarkArrow}>{passed ? '›' : '🔒'}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─── Log Miles Modal ──────────────────────────────────────────────────────────
// ─── Log Miles Modal ──────────────────────────────────────────────────────────

const PRESETS = [0.5, 1, 2, 5];

function LogMilesModal({ currentMiles, totalMiles, onLog, onClose, dStyles, theme }: {
    currentMiles: number;
    totalMiles: number;
    onLog: (miles: number) => void;
    onClose: () => void;
    dStyles: ReturnType<typeof getDashboardStyles>;
    theme: any;
}) {
    const [custom, setCustom] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const remaining = parseFloat((totalMiles - currentMiles).toFixed(2));

    const internalHandleLog = async (amount: number) => {
        setIsSaving(true);
        await onLog(amount); // Pass the work back to the main screen
        setIsSaving(false);
        onClose();
    };

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <View style={dStyles.modalOverlay}>
                    <View
                        style={[
                            dStyles.modalSheet,
                            {
                                width: '92%',
                                alignSelf: 'center',
                                maxHeight: '75%',
                                paddingBottom: 40,
                                marginTop: 50,
                                marginBottom: 30,
                            },
                        ]}
                    >                        <Pressable style={dStyles.closeButton} onPress={onClose} disabled={isSaving}>
                            <Text style={dStyles.closeButtonText}>✕</Text>
                        </Pressable>
                        <View style={dStyles.modalContent}>
                            <Text style={dStyles.modalTitle}>Log Today's Miles</Text>
                            <Text style={dStyles.modalMile}>
                                {formatMiles(currentMiles)} / {formatMiles(totalMiles)} mi · {formatMiles(remaining)} mi remaining
                            </Text>

                            {isSaving ? (
                                <ActivityIndicator size="large" color={theme.accent} style={{ marginVertical: 20 }} />
                            ) : (
                                <>
                                    <View style={dStyles.modalDivider} />
                                    <Text style={dStyles.modalSectionLabel}>QUICK ADD</Text>
                                    <View style={dStyles.presetsRow}>
                                        {PRESETS.map(p => (
                                            <Pressable key={p} style={dStyles.presetButton} onPress={() => internalHandleLog(p)}>
                                                <Text style={dStyles.presetButtonText}>+{p} mi</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                    <Text style={[dStyles.modalSectionLabel, { marginTop: 20 }]}>CUSTOM AMOUNT</Text>
                                    <View style={dStyles.customInputRow}>
                                        <TextInput
                                            style={dStyles.customInput}
                                            placeholder="e.g. 3.2"
                                            keyboardType="decimal-pad"
                                            value={custom}
                                            onChangeText={setCustom}
                                        />
                                        <Pressable
                                            style={dStyles.customLogButton}
                                            onPress={() => {
                                                const val = parseFloat(custom);
                                                if (!isNaN(val) && val > 0) internalHandleLog(val);
                                            }}
                                        >
                                            <Text style={dStyles.customLogButtonText}>Log</Text>
                                        </Pressable>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ─── Trail Complete / Select Next Trail Modal ─────────────────────────────────

function TrailCompleteModal({
    leftoverMiles,
    trails,
    onSelectTrail,
    dStyles,
    theme,
    mode,
}: {
    leftoverMiles: number;
    trails: TrailOption[];
    onSelectTrail: (trail: TrailOption) => void;
    dStyles: ReturnType<typeof getDashboardStyles>;
    theme: any;
    mode: 'initial' | 'complete';
}) {
    const DIFFICULTY_COLORS: Record<string, string> = {
        'Easiest': '#4CAF50',
        'Easy': '#8BC34A', 'Easy-Moderate': '#CDDC39', 'Moderate': '#FFC107',
        'Moderate-Difficult': '#FF9800', 'Difficult': '#FF5722',
        'Very Difficult': '#E53935', 'Most Difficult': '#B71C1C',
    };

    return (
        <Modal visible animationType="slide" transparent>
            <View style={dStyles.modalOverlay}>
                <View
                    style={[
                        dStyles.modalSheet,
                        {
                            height: '80%',
                            width: '92%',
                            alignSelf: 'center',
                        },
                    ]}
                >                    {/* Celebration header */}
                    <View style={dStyles.trailCompleteHeader}>
                        {mode === 'initial' ? (
                            <>
                                <Text style={dStyles.trailCompleteEmoji}>🧭</Text>
                                <Text style={dStyles.trailCompleteTitle}>Pick Your First Trail</Text>
                                <Text style={dStyles.trailCompleteSubtitle}>
                                    Welcome to GeoQuest. Choose a trail to start your first walk.
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={dStyles.trailCompleteEmoji}>🎉</Text>
                                <Text style={dStyles.trailCompleteTitle}>Trail Complete!</Text>
                                <Text style={dStyles.trailCompleteSubtitle}>
                                    You have
                                    <Text style={{ color: theme.accent, fontWeight: '700' }}>
                                        {' '}{formatMiles(leftoverMiles)} miles
                                    </Text>
                                    {' '}to carry over.
                                </Text>

                                <Text style={dStyles.trailCompleteSubtitle}>
                                    Pick your next trail below.
                                </Text>
                            </>
                        )}
                    </View>

                    <View style={dStyles.modalDivider} />

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                            paddingBottom: 40,
                        }}
                    >                        {trails.length === 0 ? (
                        <Text style={[dStyles.trailCompleteSubtitle, { padding: 24, textAlign: 'center' }]}>
                            You've finished every trail we currently have.
                        </Text>
                    ) : (
                        trails.map(trail => (
                            <Pressable
                                key={trail.id}
                                style={({ pressed }) => [dStyles.trailSelectRow, pressed && { opacity: 0.8 }]}
                                onPress={() => onSelectTrail(trail)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={dStyles.trailSelectName}>{trail.name}</Text>
                                    <Text style={dStyles.trailSelectMeta}>{formatMiles(trail.miles)} miles</Text>
                                </View>
                                <View style={[dStyles.trailSelectBadge, { backgroundColor: DIFFICULTY_COLORS[trail.difficulty] ?? theme.subtext }]}>
                                    <Text style={dStyles.trailSelectBadgeText}>{trail.difficulty}</Text>
                                </View>
                            </Pressable>
                        ))
                    )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─── Main Dashboard Screen ────────────────────────────────────────────────────
export default function DashboardScreen() {
    // 1. ALL HOOKS AT THE TOP
    const [greetingName, setGreetingName] = useState('Explorer'); // Default string
    const [milesWalked, setMilesWalked] = useState(0);           // Use 0, not null
    const [totalMiles, setTotalMiles] = useState(0);            // Use 0, not null
    const [trailName, setTrailName] = useState('Choose your trail');
    const [trailId, setTrailId] = useState('');
    const [availableTrails, setAvailableTrails] = useState<TrailOption[]>(FALLBACK_TRAILS);
    const [completedTrailIds, setCompletedTrailIds] = useState<string[]>([]);
    const [routeGeojson, setRouteGeojson] = useState<any>(null);
    const [landmarksGeojson, setLandmarksGeojson] = useState<any>(null);
    const [isTrailLoading, setIsTrailLoading] = useState(false);
    const [hasHydratedTrailSelection, setHasHydratedTrailSelection] = useState(false);

    const [logModalOpen, setLogModalOpen] = useState(false);
    const [allLandmarksOpen, setAllLandmarksOpen] = useState(false);
    const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
    const [pendingLeftover, setPendingLeftover] = useState<number | null>(null);
    const [trailSelectionMode, setTrailSelectionMode] = useState<'initial' | 'complete'>('complete');

    const rawScheme = useColorScheme();
    const scheme = rawScheme === 'dark' ? 'dark' : 'light';
    const theme = colors[scheme];
    const dStyles = getDashboardStyles(theme);
    const { width: screenWidth } = useWindowDimensions();
    const mapRef = useRef<any>(null);
    const showAlert = (title: string, message: string) => {
        console.warn(`[ALERT] ${title}: ${message}`);
        if (Platform.OS === 'web') {
            alert(`${title}\n\n${message}`);
        } else {
            Alert.alert(title, message);
        }
    };

    useEffect(() => {
        async function initializeUser() {
            setIsTrailLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { error: ensureError } = await ensureProfileRow({
                    userId: user.id,
                    email: user.email,
                    username: user.user_metadata?.username,
                });
                if (ensureError) {
                    console.error('Profile Bootstrap Error:', ensureError);
                }

                // Fetch profile and trails in parallel
                const [profileRes, trails] = await Promise.all([
                    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
                    fetchTrailList()
                ]);

                setVisibleTrails(trails);

                if (profileRes.data) {
                    // SUCCESS: Profile exists
                    const profile = profileRes.data;
                    setGreetingName(profile.username || 'Explorer');
                    // Per-trail progress should come from activity_logs for the active trail.
                    // total_miles_walked is lifetime mileage across all trails.
                    setMilesWalked(0);

                    if (profile.active_trail_id) {
                        setTrailId(profile.active_trail_id);
                        setTrailSelectionMode('complete');
                        setPendingLeftover(null);
                    } else {
                        setMilesWalked(0);
                        setTrailSelectionMode('initial');
                        setPendingLeftover(0); // Trigger selection modal
                    }
                } else {
                    // FALLBACK: Profile row is missing in DB
                    console.warn("Profile row missing, using defaults.");
                    setGreetingName(user.user_metadata?.username || 'Explorer');
                    setMilesWalked(0);
                    setTrailSelectionMode('initial');
                    setPendingLeftover(0); // Force trail selection anyway
                }
            } finally {
                setHasHydratedTrailSelection(true);
                setIsTrailLoading(false);
            }
        }
        initializeUser();
    }, []);


    useEffect(() => {
        if (!hasHydratedTrailSelection) return;

        // If loading is done and we still have no trailId and no leftover miles...
        // force the "selection" mode by setting pendingLeftover to 0
        if (!isTrailLoading && !trailId && pendingLeftover === null) {
            setTrailSelectionMode(milesWalked > 0 ? 'complete' : 'initial');
            setPendingLeftover(0);
        }
    }, [hasHydratedTrailSelection, isTrailLoading, trailId, pendingLeftover, milesWalked]);
    useEffect(() => {
        let isMounted = true;

        async function loadTrailCatalog() {
            try {
                const data = await fetchTrailList();
                if (!isMounted || data.length === 0) return;

                setAvailableTrails(data.map(({ id, name, miles, difficulty }) => ({ id, name, miles, difficulty })));
            } catch {
                if (isMounted) {
                    setAvailableTrails(FALLBACK_TRAILS);
                }
            }
        }

        loadTrailCatalog();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        async function loadCompletedTrails() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const [{ data: logs }, trailCatalog] = await Promise.all([
                    supabase
                        .from('activity_logs')
                        .select('trail_id, miles')
                        .eq('user_id', user.id),
                    fetchTrailList(),
                ]);

                if (!isMounted) return;

                const milesByTrail = new Map<string, number>();
                (logs ?? []).forEach((log) => {
                    const key = String(log.trail_id);
                    milesByTrail.set(key, (milesByTrail.get(key) ?? 0) + Number(log.miles ?? 0));
                });

                const totalsByTrail = new Map(trailCatalog.map((trail) => [trail.id, trail.miles]));
                const completed = [...milesByTrail.entries()]
                    .filter(([trailIdValue, miles]) => miles >= (totalsByTrail.get(trailIdValue) ?? Number.POSITIVE_INFINITY))
                    .map(([trailIdValue]) => trailIdValue);

                setCompletedTrailIds(completed);
            } catch {
                if (isMounted) {
                    setCompletedTrailIds([]);
                }
            }
        }

        loadCompletedTrails();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        async function loadTrailDetails() {
            if (!trailId) return; // Wait for a trailId to exist

            setIsTrailLoading(true);
            try {
                const data = await fetchTrailDetails(trailId);
                if (data) {
                    setTotalMiles(data.miles);
                    setTrailName(data.name);
                    setRouteGeojson(data.routeGeojson); // This triggers the map lines
                    setLandmarksGeojson(data.landmarksGeojson); // This triggers the dots
                }
            } catch (error) {
                console.error("Map Load Error:", error);
            } finally {
                setIsTrailLoading(false);
            }
        }
        loadTrailDetails();
    }, [trailId]); // <--- CRITICAL: Must include trailId here

    useEffect(() => {
        if (!trailId || totalMiles <= 0 || milesWalked < totalMiles) return;

        setCompletedTrailIds((current) => (
            current.includes(trailId) ? current : [...current, trailId]
        ));

        if (pendingLeftover === null) {
            const leftoverMiles = Number(Math.max(milesWalked - totalMiles, 0).toFixed(2));
            setTrailSelectionMode('complete');
            setPendingLeftover(leftoverMiles);
        }
    }, [milesWalked, totalMiles, trailId, pendingLeftover]);

    // 2. LOAD INITIAL DATA
    useEffect(() => {
        async function initialize() {
            if (!trailId) {
                setMilesWalked(0);
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error: ensureError } = await ensureProfileRow({
                    userId: user.id,
                    email: user.email,
                    username: user.user_metadata?.username,
                });
                if (ensureError) {
                    console.error('Profile Bootstrap Error:', ensureError);
                }

                // Fetch Profile
                const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
                if (profile?.username) setGreetingName(profile.username);

                // Fetch Progress for current trail
                const { data: logs } = await supabase
                    .from('activity_logs')
                    .select('miles')
                    .eq('user_id', user.id)
                    .eq('trail_id', trailId);

                if (logs) {
                    const total = logs.reduce((sum, log) => sum + log.miles, 0);
                    setMilesWalked(total);
                }
            }
        }
        initialize();
    }, [trailId]);

    // 3. HANDLE LOGGING (With Overflow Logic)

    const handleLogMiles = async (amount: number) => {
        const normalizedAmount = Number(amount);
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            showAlert("Invalid Miles", "Please enter a valid mile amount greater than 0.");
            return;
        }

        if (!trailId) {
            setTrailSelectionMode('initial');
            setPendingLeftover(0);
            showAlert("Pick a Trail First", "Choose a trail before logging miles.");
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showAlert("Error", "No user found");
            return;
        }

        const trailIdCandidates: (string | number)[] = [trailId];
        if (/^\d+$/.test(trailId)) {
            trailIdCandidates.push(Number(trailId));
        }

        let insertError: any = null;
        for (const trailIdCandidate of trailIdCandidates) {
            const { error } = await supabase
                .from("activity_logs")
                .insert({
                    user_id: user.id,
                    trail_id: trailIdCandidate,
                    miles: normalizedAmount,
                });

            if (!error) {
                insertError = null;
                break;
            }

            insertError = error;

            const likelyTrailIdTypeMismatch =
                typeof error.message === 'string' &&
                (error.message.includes('invalid input syntax') || error.message.includes('type'));

            if (!likelyTrailIdTypeMismatch) {
                break;
            }
        }

        if (insertError) {
            console.error("Activity Log Insert Error:", insertError);
            const code = insertError?.code ? `\nCode: ${insertError.code}` : '';
            showAlert("Database Error", `${insertError.message}${code}`);
            return;
        }

        const projectedMiles = milesWalked + normalizedAmount;
        const reachedTrailEnd = totalMiles > 0 && projectedMiles >= totalMiles;

        if (reachedTrailEnd) {
            const leftoverMiles = Number(Math.max(projectedMiles - totalMiles, 0).toFixed(2));
            setMilesWalked(totalMiles);
            setCompletedTrailIds((current) => (
                current.includes(trailId) ? current : [...current, trailId]
            ));
            setTrailSelectionMode('complete');
            setPendingLeftover(leftoverMiles);
        } else {
            setMilesWalked(projectedMiles);
        }

        setLogModalOpen(false);
    };
    const handleNewTrailSelected = async (newTrail: any) => {
        const leftover = Number((pendingLeftover || 0).toFixed(2));
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showAlert("Error", "No user found");
            return;
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .update({ active_trail_id: newTrail.id })
            .eq('id', user.id);

        if (profileError) {
            const code = profileError?.code ? `\nCode: ${profileError.code}` : '';
            showAlert("Database Error", `${profileError.message}${code}`);
            return;
        }

        if (leftover > 0) {
            const carryoverTrailId = String(newTrail.id);
            const trailIdCandidates: (string | number)[] = [carryoverTrailId];
            if (/^\d+$/.test(carryoverTrailId)) {
                trailIdCandidates.push(Number(carryoverTrailId));
            }

            let carryoverError: any = null;
            for (const trailIdCandidate of trailIdCandidates) {
                const { error } = await supabase
                    .from('activity_logs')
                    .insert({
                        user_id: user.id,
                        trail_id: trailIdCandidate,
                        miles: leftover,
                    });

                if (!error) {
                    carryoverError = null;
                    break;
                }

                carryoverError = error;

                const likelyTrailIdTypeMismatch =
                    typeof error.message === 'string' &&
                    (error.message.includes('invalid input syntax') || error.message.includes('type'));

                if (!likelyTrailIdTypeMismatch) {
                    break;
                }
            }

            if (carryoverError) {
                const code = carryoverError?.code ? `\nCode: ${carryoverError.code}` : '';
                showAlert("Database Error", `${carryoverError.message}${code}`);
                return;
            }
        }

        setTrailId(String(newTrail.id));
        setTrailName(newTrail.name ?? 'Trail');
        setMilesWalked(leftover);
        setTrailSelectionMode('complete');
        setPendingLeftover(null);
    };
    // ... Keep your useMemo calculations (trailCoords, userPosition, etc.) ...
    const trailCoords = useMemo(() => geojsonLineToCoords(routeGeojson), [routeGeojson]);
    const allLandmarks = useMemo(() =>
        geojsonPointsToLandmarks(landmarksGeojson),
        [landmarksGeojson]
    );
    const trailRegion = useMemo(() => getTrailRegion(trailCoords), [trailCoords]);
    const userPosition = useMemo(() => getCoordAtMile(trailCoords, totalMiles, milesWalked), [milesWalked, trailCoords, totalMiles]);
    const progressPct = Math.min((milesWalked / totalMiles) * 100, 100);
    const splitIndex = Math.floor((milesWalked / totalMiles) * (trailCoords.length - 1));
    const walkedCoords = trailCoords.slice(0, splitIndex + 1);
    const remainingCoords = trailCoords.slice(splitIndex);
    const [visibleTrails, setVisibleTrails] = useState<TrailOption[]>([]);
    const trailChoices = useMemo(() => {
        if (trailSelectionMode === 'initial') return visibleTrails;

        const blockedTrailIds = new Set([...completedTrailIds, trailId]);
        return visibleTrails.filter((trail) => !blockedTrailIds.has(trail.id));
    }, [trailSelectionMode, visibleTrails, completedTrailIds, trailId]);

    if (isTrailLoading && !routeGeojson) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={{ marginTop: 10, color: theme.subtext }}>Loading Trail Data...</Text>
            </View>
        );
    }
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 80 }} // 👈 more breathing room
            >
                <View style={dStyles.header}>
                    <View>
                        <Text style={dStyles.headerGreeting}>
                            Ready to walk, {greetingName}?
                        </Text>
                        <Text style={dStyles.headerTrailName}>
                            {trailName}
                        </Text>
                        {isTrailLoading && (
                            <ActivityIndicator
                                size="small"
                                color={theme.accent}
                                style={{ marginTop: 8, alignSelf: 'flex-start' }}
                            />
                        )}
                    </View>

                    <View style={dStyles.milesChip}>
                        <Text style={dStyles.milesChipValue}>
                            {formatMiles(milesWalked)}
                        </Text>
                        <Text style={dStyles.milesChipLabel}>
                            / {formatMiles(totalMiles)} mi
                        </Text>
                    </View>
                </View>
                {/* Map */}
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
                    onLandmarkPress={(landmark: Landmark) => setSelectedLandmark(landmark)}
                    onRecenter={() => { }}
                />
                {/* CTA */}
                <View style={dStyles.ctaRow}>
                    <Pressable style={dStyles.logButton} onPress={() => setLogModalOpen(true)}>
                        <Text style={dStyles.logButtonText}>Log Today's Miles</Text>
                    </Pressable>
                </View>

                {/* Spacer */}
                <View style={{ height: 16 }} />

                {/* Landmark Cards */}
                <View style={{ height: 170 }}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={dStyles.landmarkStrip}
                    >
                        {allLandmarks
                            .slice()
                            .sort((a, b) => a.mileMarker - b.mileMarker)
                            .map((landmark) => {
                                const isPassed = landmark.mileMarker <= milesWalked;

                                return (
                                    <Pressable
                                        key={landmark.id}
                                        style={[
                                            dStyles.landmarkCard,
                                            isPassed && dStyles.landmarkCardPassed,
                                        ]}
                                        onPress={() => setSelectedLandmark(landmark)}
                                    >
                                        <View style={dStyles.landmarkImagePlaceholder}>
                                            <Text style={dStyles.landmarkImageIcon}>📍</Text>
                                        </View>

                                        <Text style={dStyles.landmarkCardTitle} numberOfLines={2}>
                                            {landmark.title}
                                        </Text>

                                        <Text style={dStyles.landmarkCardMile}>
                                            {isPassed ? 'Passed' : `Mile ${landmark.mileMarker}`}
                                        </Text>
                                    </Pressable>
                                );
                            })}


                    </ScrollView>
                </View>

            </ScrollView>


            {logModalOpen && (
                <LogMilesModal
                    currentMiles={milesWalked}
                    totalMiles={totalMiles}
                    onLog={handleLogMiles} // Correctly passing the function
                    onClose={() => setLogModalOpen(false)}
                    dStyles={dStyles}
                    theme={theme}
                />
            )}

            {pendingLeftover !== null && (
                <TrailCompleteModal
                    leftoverMiles={pendingLeftover}
                    trails={trailChoices}
                    onSelectTrail={handleNewTrailSelected}
                    dStyles={dStyles}
                    theme={theme}
                    mode={trailSelectionMode}
                />
            )}


        </View>


    );
}
