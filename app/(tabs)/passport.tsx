// app/(tabs)/passport.tsx
// The student's "Field Journal" — a vintage leather-book-themed screen with
// a closed cover you tap to open, then an open-book layout with 3 tabs:
// collected badge "stamps," free-text field-note history, and a trail
// explorer. Almost all the styling below simulates a physical old book
// (leather, brass clasp, parchment, ink lines) rather than a typical flat
// app UI.

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
    ActivityIndicator,
    Alert,
    // AppState/AppStateStatus let the app detect when it moves between
    // foreground ("active"), background, and inactive states — e.g.
    // switching away to another app and back. Used here to refresh data
    // when the user returns to the app.
    AppState,
    AppStateStatus,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native';
import { DIFFICULTY_COLORS, colors, getTrailStyles } from '../../commonStyles';
import ModalBackdrop from '../../components/ModalBackdrop';
import PresidentFactsModal from '../../components/PresidentFactsModal';
import RoutePreviewMap from '../../components/RoutePreviewMap';
import { formatActivityJournalLine } from '../../lib/activityTypes';
import { PRESIDENTS_UNLOCK_BADGE_ID } from '../../lib/presidentVisits';
import { fetchTrailDetails, fetchTrailList, formatMiles, type TrailSummary as Trail } from '../../lib/trails';
import { supabase } from '../../utils/supabase';

// The public base URL for badge sticker images stored in Supabase Storage
// (Supabase's file/blob storage service). Individual badge image
// filenames get appended to this to build the full image URL.
const SUPABASE_STORAGE_BASE_URL = 'https://pylcsytqrhwylhallzav.supabase.co/storage/v1/object/public/badge-stickers/';

// One entry in the badge/stamp catalog, merged with this student's
// unlock status.
type BadgeItem = {
    id: string;
    title: string;
    description: string;
    // Past-tense version of `description`, shown once the badge is
    // unlocked ("You earned this badge by..." instead of "Earn this
    // badge by..."). Falls back to `description` if not set.
    earned_description?: string | null;
    category: string;
    image_filename: string;
    unlocked: boolean;
    // Only set if unlocked — a pre-formatted date string.
    unlockedAt?: string;
};

// One row from the activity_journal table (the same table fitness.tsx
// writes to), displayed here as a chronological "field notes" diary.
type NotebookJournalEntry = {
    id: string;
    created_at: string;
    miles_walked: number;
    activity_type: string | null;
    input_amount: number | null;
    input_unit: string | null;
    exercise_logged: string;
    exercise_score: number;
    journal_reflection: string;
};

type Coordinate = { latitude: number; longitude: number };

// Formats category string (e.g., 'TRAIL_COMPLETION' -> 'Trail Completion Stamp')
function formatStampCategory(category: string): string {
    if (!category) return 'Stamp';
    // Replace any hyphen or underscore with a space (the regex
    // /[-_]/g matches either character, globally — every occurrence, not
    // just the first), then split into individual words.
    const words = category.replace(/[-_]/g, ' ').split(' ');
    // Title-case each word: capitalize just the first letter, lowercase
    // the rest (so "TRAIL" becomes "Trail", not staying all-caps).
    const titleCased = words
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    return `${titleCased} Stamp`;
}

// A trail card used in the "Explore Trails" tab — visually similar to the
// TrailCard in app/trails.tsx, but slightly restyled (minHeight override,
// tighter route-text line height) to fit this journal's narrower page
// layout.
function TrailCard({ trail, onPress, tStyles }: {
    trail: Trail;
    onPress: () => void;
    tStyles: ReturnType<typeof getTrailStyles>;
}) {
    const diffColor = DIFFICULTY_COLORS[trail.difficulty];
    const imageUri = trail.image_url?.trim();
    return (
        <Pressable
            style={({ pressed }) => [tStyles.card, pressed && tStyles.cardPressed, { minHeight: 110 }]}
            onPress={onPress}
        >
            {imageUri ? (
                <Image
                    source={{ uri: imageUri }}
                    style={tStyles.cardImage}
                    contentFit="cover"
                    transition={200}
                />
            ) : (
                <View style={[tStyles.cardImage, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#FFFFFF', fontSize: 28 }}>🗺️</Text>
                </View>
            )}

            <View style={[tStyles.difficultyBadge, { backgroundColor: diffColor + 'EE' }]}>
                <Text style={tStyles.difficultyBadgeText}>{trail.difficulty}</Text>
            </View>

            <View style={[tStyles.cardBody, { flex: 1, paddingRight: 4 }]}>
                <Text style={tStyles.cardTitle} numberOfLines={1}>{trail.name}</Text>
                <View style={tStyles.cardMeta}>
                    <Text style={tStyles.cardDistance}>📍 {formatMiles(trail.miles)} miles</Text>
                </View>
                <Text style={[tStyles.cardRoute, { lineHeight: 15, marginTop: 2 }]}>{trail.route}</Text>
            </View>
        </Pressable>
    );
}

export default function WornLeatherFieldJournal() {
    const rawScheme = useColorScheme();
    const scheme: 'light' | 'dark' = rawScheme === 'dark' ? 'dark' : 'light';
    const theme = colors[scheme];
    const tStyles = getTrailStyles(theme);

    // Whether the "book" is currently open (showing tabs/content) or
    // closed (showing just the cover). Starts closed for the tap-to-open
    // effect.
    const [isJournalOpen, setIsJournalOpen] = useState(false);
    // Which of the 3 tabs is active once the book is open.
    const [activeTab, setActiveTab] = useState<'passport' | 'field_notes' | 'explore_trails'>('passport');
    const [loading, setLoading] = useState(true);
    const [studentUsername, setStudentUsername] = useState('Explorer');

    const [badges, setBadges] = useState<BadgeItem[]>([]);
    const [journalEntries, setJournalEntries] = useState<NotebookJournalEntry[]>([]);
    const [trailsList, setTrailsList] = useState<Trail[]>([]);

    // Which badge is currently shown in the detail popup modal.
    const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);
    const [badgeModalOpen, setBadgeModalOpen] = useState(false);
    // Whether the "Presidents in Oklahoma" fun-fact deck is open. This is a
    // separate special unlock, not a badge itself — it piggybacks on the
    // existing 'fitness-complete' badge (finishing all 6 Presidential
    // Fitness Challenge events) rather than adding a second parallel
    // unlock/notification system.
    const [presidentFactsModalOpen, setPresidentFactsModalOpen] = useState(false);
    // Holds a non-fatal warning message if any part of the data load
    // partially failed (e.g. badge catalog unreachable, but everything
    // else loaded fine) — shown as an inline banner rather than blocking
    // the whole screen.
    const [loadError, setLoadError] = useState<string | null>(null);

    const [selectedTrail, setSelectedTrail] = useState<Trail | null>(null);
    const [selectedRouteGeojson, setSelectedRouteGeojson] = useState<any>(null);
    const [routePreviewLoading, setRoutePreviewLoading] = useState(false);

    // useFocusEffect (not a plain mount-only useEffect) because expo-router
    // keeps this screen mounted in the background when you switch tabs --
    // a badge unlocked while on another tab (e.g. Fitness) would otherwise
    // never show as unlocked here until the whole app was backgrounded and
    // reopened. Re-running on every focus keeps badges/journal/trails in
    // sync with whatever's actually in the DB.
    useFocusEffect(
        useCallback(() => {
            void loadJournalTelemetry();
        }, [])
    );

    // Re-fetch all journal data whenever the app comes back to the
    // foreground (e.g. user switches to another app to log a walk via a
    // fitness tracker, then returns) — keeps badges/journal/trails fresh
    // without requiring a manual pull-to-refresh.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                void loadJournalTelemetry();
            }
        });

        return () => {
            subscription.remove();
        };
    }, []);

    // Whenever a badge gets selected (tapped), automatically open its
    // detail modal.
    useEffect(() => {
        if (selectedBadge) {
            setBadgeModalOpen(true);
        }
    }, [selectedBadge]);

    const closeBadgeModal = () => {
        setBadgeModalOpen(false);
    };

    // Loads the full GeoJSON route for whichever trail is currently
    // selected in the "Explore Trails" tab's detail modal — identical
    // pattern/logic to the equivalent effect in app/trails.tsx.
    useEffect(() => {
        let isMounted = true;
        async function loadSelectedRouteGeojson() {
            if (!selectedTrail) {
                setSelectedRouteGeojson(null);
                setRoutePreviewLoading(false);
                return;
            }
            setRoutePreviewLoading(true);
            try {
                const detail = await fetchTrailDetails(String(selectedTrail.id));
                if (isMounted) {
                    setSelectedRouteGeojson(detail?.routeGeojson ?? null);
                }
            } catch {
                if (isMounted) {
                    setSelectedRouteGeojson(null);
                }
            } finally {
                if (isMounted) {
                    setRoutePreviewLoading(false);
                }
            }
        }
        loadSelectedRouteGeojson();
        return () => { isMounted = false; };
    }, [selectedTrail]);

    // The main data-loading function, fetching everything this screen
    // needs: username, badge catalog + unlock status, journal entries, and
    // the trail list — each piece has its OWN error handling so a failure
    // in one doesn't prevent the others from loading.
    async function loadJournalTelemetry() {
        try {
            setLoading(true);
            setLoadError(null);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase.from('profiles').select('username, display_name').eq('id', user.id).single();
            if (profile) {
                setStudentUsername(profile.display_name || profile.username || 'Explorer');
            }

            // A hardcoded fallback badge catalog, used ONLY if the real
            // "badges_catalog" table query below comes back empty or
            // errors — ensures the passport screen always has SOMETHING
            // to show (useful during development/testing, or if the
            // database table hasn't been seeded yet).
            const fallbackCatalog = [
                { id: 'mesa-completion', title: 'Black Mesa Summit', description: 'Earn this badge by conquering the highest natural altitude pathway marker in Oklahoma state borders.', earned_description: 'You earned this badge by conquering the highest natural altitude pathway marker in Oklahoma state borders.', category: 'TRAIL_COMPLETION', image_filename: 'mesa.png' },
                { id: 'geology-guru-1', title: 'Geology Explorer', description: 'Earn this badge by perfectly identifying three sedimentary rock layers correctly during landmark popups.', earned_description: 'You earned this badge by perfectly identifying three sedimentary rock layers correctly during landmark popups.', category: 'QUIZ_MASTER', image_filename: 'geology.png' },
                { id: '50-mile-club', title: '50 Mile Trooper', description: 'Earn this badge by crossing over 50 combined virtual trail navigation miles via physical performance metrics.', earned_description: 'You earned this badge by crossing over 50 combined virtual trail navigation miles via physical performance metrics.', category: 'MILESTONE', image_filename: '50_miles.png' },
                { id: 'eco-guardian', title: 'Eco Guardian', description: 'Earn this badge by completing the field identification pop-up puzzle tracking indigenous prairie flora.', earned_description: 'You earned this badge by completing the field identification pop-up puzzle tracking indigenous prairie flora.', category: 'SPECIAL', image_filename: 'eco.png' },
            ];

            // 1. Fetch entire catalog collection from database table
            const { data: catalogData, error: catalogError } = await supabase.from('badges_catalog').select('*').order('sort_order', { ascending: true });

            // 2. Fetch specific user completed join table list
            const { data: unlockedData, error: unlockedError } = await supabase.from('user_badges').select('badge_id, unlocked_at').eq('user_id', user.id);
            if (unlockedError) {
                console.error('Failed to load unlocked badge rows:', unlockedError);
                // `(prev) => prev || unlockedError.message || ...` only
                // sets the error message if one ISN'T already set —
                // preserves whichever error happened FIRST rather than
                // letting a later, possibly less useful error overwrite it.
                setLoadError((prev) => prev || unlockedError.message || 'Unlocked badge list unavailable.');
            }

            // Build a lookup Map from badge id → its unlock metadata, so
            // each catalog entry can quickly check "did this user earn
            // this badge, and when?"
            const unlockedMap = new Map(unlockedData?.map(b => [b.badge_id, { unlocked_at: b.unlocked_at }]) || []);

            // 3. Fallback mock data structure if database returns clean empty array during testing setup
            const baseCatalog = Array.isArray(catalogData) && catalogData.length > 0 ? catalogData : fallbackCatalog;
            if (catalogError) {
                console.error('Failed to load badge catalog, using fallback stamps:', catalogError);
                setLoadError(catalogError.message || 'Badge catalog unavailable, showing fallback stamps.');
            }

            // Merge the catalog with this user's unlock status to build
            // the final list of badges shown on screen.
            const systemBadges: BadgeItem[] = baseCatalog
                .map(b => {
                    const earnedMeta = unlockedMap.get(b.id);
                    return {
                        ...b,
                        unlocked: unlockedMap.has(b.id),
                        // Format the raw unlock timestamp into a
                        // locale-appropriate date string, or leave undefined
                        // if this badge isn't unlocked at all.
                        unlockedAt: earnedMeta?.unlocked_at ? new Date(earnedMeta.unlocked_at).toLocaleDateString() : undefined,
                    };
                })
                // Unlocked badges surface to the top of the grid so a
                // student's earned stamps are the first thing they see;
                // Array.prototype.sort is stable, so badges within each
                // group keep their original sort_order.
                .sort((a, b) => Number(b.unlocked) - Number(a.unlocked));

            setBadges(systemBadges);

            const { data: journals, error: journalError } = await supabase.from('activity_journal').select('*').order('created_at', { ascending: false });
            if (journalError) {
                console.error('Failed to load activity journal entries:', journalError);
                setLoadError((prev) => prev || journalError.message || 'Activity journal unavailable.');
            }
            setJournalEntries(journals || []);

            try {
                const rawTrails = await fetchTrailList();
                setTrailsList(rawTrails || []);
            } catch (trailError) {
                console.error('Failed to load trail list:', trailError);
                setLoadError((prev) => prev || 'Trail list unavailable.');
            }
        } catch (error: any) {
            console.error('Failed to load journal telemetry:', error);
            setLoadError(error?.message || 'Unable to load some journal data.');
        } finally {
            setLoading(false);
        }
    }

    // Identical GeoJSON-flattening logic to the geojsonLineToCoords
    // function in app/trails.tsx, just inlined here as a useMemo instead
    // of a separate module-level function (recalculated only when
    // selectedRouteGeojson changes).
    const trailCoords = useMemo(() => {
        if (!Array.isArray(selectedRouteGeojson?.features)) return [];
        const coords: Coordinate[] = [];
        const pushCoords = (value: any) => {
            if (!Array.isArray(value)) return;
            if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
                coords.push({ latitude: value[1], longitude: value[0] });
                return;
            }
            for (const item of value) pushCoords(item);
        };
        for (const feature of selectedRouteGeojson.features) {
            pushCoords(feature?.geometry?.coordinates);
        }
        return coords;
    }, [selectedRouteGeojson]);

    // Same bounding-box-based map region calculation as
    // getTrailRegion() in app/trails.tsx — see that file's detailed
    // comments for the math behind the 1.35 padding multiplier and the
    // 0.08 minimum-zoom floor.
    const previewRegion = useMemo(() => {
        if (!trailCoords.length) {
            return { latitude: 35.4676, longitude: -97.5164, latitudeDelta: 0.25, longitudeDelta: 0.25 };
        }
        const bounds = trailCoords.reduce(
            (acc, coord) => ({
                minLat: Math.min(acc.minLat, coord.latitude),
                maxLat: Math.max(acc.maxLat, coord.latitude),
                minLng: Math.min(acc.minLng, coord.longitude),
                maxLng: Math.max(acc.maxLng, coord.longitude),
            }),
            { minLat: trailCoords[0].latitude, maxLat: trailCoords[0].latitude, minLng: trailCoords[0].longitude, maxLng: trailCoords[0].longitude }
        );
        const latitudeDelta = Math.max((bounds.maxLat - bounds.minLat) * 1.35, 0.08);
        const longitudeDelta = Math.max((bounds.maxLng - bounds.minLng) * 1.35, 0.08);
        return { latitude: (bounds.minLat + bounds.maxLat) / 2, longitude: (bounds.minLng + bounds.maxLng) / 2, latitudeDelta, longitudeDelta };
    }, [trailCoords]);

    // Whether the "Presidents in Oklahoma" bonus has been unlocked — true
    // once the student has earned the existing fitness-complete badge
    // (beating the target in all 6 Presidential Fitness Challenge events).
    const presidentsUnlocked = badges.some((b) => b.id === PRESIDENTS_UNLOCK_BADGE_ID && b.unlocked);

    const handlePresidentsCardPress = () => {
        if (presidentsUnlocked) {
            setPresidentFactsModalOpen(true);
        } else {
            Alert.alert(
                'Still Locked',
                'Finish the Presidential Fitness Challenge — beat the target in all 6 events — to unlock fun facts about presidents who visited Oklahoma.'
            );
        }
    };

    if (loading) {
        return (
            <View style={styles.centeredLoader}>
                <ActivityIndicator size="large" color="#4E3629" />
                <Text style={styles.loadingText}>Unpacking Field Journal...</Text>
            </View>
        );
    }

    // The CLOSED book state: shows just a tappable leather cover, styled
    // to look like a physical journal (dark brown "leather" background,
    // gold-embossed border frame, a stitched spine line, a brass clasp
    // graphic on the side).
    if (!isJournalOpen) {
        return (
            <View style={styles.outerCanvas}>
                <Pressable style={styles.leatherCoverCard} onPress={() => setIsJournalOpen(true)}>
                    <View style={styles.goldEmbossedFrame}>
                        <View style={styles.spineStitchLine} />
                        <View style={styles.coverMainContent}>
                            <Ionicons name="compass-outline" size={48} color="#C5A059" style={styles.coverIcon} />
                            <Text style={styles.coverOwnerName}>{studentUsername.toUpperCase()}'S</Text>
                            <Text style={styles.coverMainTitle}>FIELD JOURNAL</Text>
                            <View style={styles.vintageSeparatorLine} />
                            <Text style={styles.coverFootnote}>OKLAHOMA STATE PARKS GEOPORTFOLIO</Text>
                        </View>
                        <View style={styles.brassClaspStrap}>
                            <View style={styles.brassButtonLatch}>
                                <Ionicons name="lock-open-outline" size={14} color="#5C4033" />
                            </View>
                            <Text style={styles.latchActionLabel}>OPEN BOOK</Text>
                        </View>
                    </View>
                </Pressable>
            </View>
        );
    }

    // The OPEN book state: a two-column "open book" layout — the left side
    // is a thin binding/spine strip, the middle is the current tab's
    // scrollable "page" content, and the right edge has vertical tab
    // buttons styled like little bookmark tabs sticking out of the book.
    return (
        <View style={styles.outerCanvas}>
            <View style={styles.openBookLayoutContainer}>
                <View style={styles.internalBookBindingSpine} />

                <View style={styles.notebookPaperPage}>
                    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                        {/* Shown at the top of every page/tab if any part
                            of the initial load failed. */}
                        {loadError ? (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorBannerText}>{loadError}</Text>
                            </View>
                        ) : null}

                        {/* TAB 1: "Collected Stamps" — a grid of badges. */}
                        {activeTab === 'passport' && (
                            <View>
                                <View style={styles.fieldPageHeaderRow}>
                                    <Text style={styles.vintagePageTitle}>Collected Stamps</Text>
                                </View>
                                <View style={styles.inkUnderlineDivider} />
                                <View style={styles.stampMatrixGrid}>
                                    {badges.map((badge) => {
                                        const imageUrl = `${SUPABASE_STORAGE_BASE_URL}/${badge.image_filename}`;
                                        return (
                                        <Pressable
                                                key={badge.id}
                                                style={[styles.stampSlotBox, badge.unlocked ? styles.unlockedStampBg : styles.lockedStampBg]}
                                                onPress={() => {
                                                    setSelectedBadge(badge);
                                                    setBadgeModalOpen(true);
                                                }}
                                            >
                                                {/* Expanded Image Container filling maximum box real estate */}
                                                <View style={[
                                                    styles.badgeImageWrapper,
                                                    // Locked (not-yet-earned) badges are faded to 25%
                                                    // opacity, giving a "silhouette" look that hints at
                                                    // the badge's existence without fully revealing it.
                                                    !badge.unlocked && styles.badgeImageWrapperLocked
                                                ]}>
                                                    <Image
                                                        source={{ uri: imageUrl }}
                                                        style={styles.stampPNGSticker}
                                                        contentFit="contain"
                                                    />
                                                </View>
                                            </Pressable>
                        );
                                    })}
                                </View>

                                {/* Special unlock — not a badge, no new
                                    popup system: reuses the same
                                    locked/unlocked card look as the stamp
                                    grid above, just called out in its own
                                    small section since it isn't a stamp. */}
                                <View style={styles.fieldPageHeaderRow}>
                                    <Text style={styles.vintagePageTitle}>Special Unlock</Text>
                                </View>
                                <View style={styles.inkUnderlineDivider} />
                                <Pressable
                                    style={[styles.presidentsCard, presidentsUnlocked ? styles.unlockedStampBg : styles.lockedStampBg]}
                                    onPress={handlePresidentsCardPress}
                                >
                                    <Text style={[styles.presidentsCardEmoji, !presidentsUnlocked && styles.badgeImageWrapperLocked]}>🏛️</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.presidentsCardTitle}>Presidents in Oklahoma</Text>
                                        <Text style={styles.presidentsCardSubtitle}>
                                            {presidentsUnlocked
                                                ? 'Unlocked — tap to read fun facts'
                                                : 'Finish the Presidential Fitness Challenge to unlock'}
                                        </Text>
                                    </View>
                                    <Ionicons
                                        name={presidentsUnlocked ? 'lock-open-outline' : 'lock-closed-outline'}
                                        size={18}
                                        color={presidentsUnlocked ? '#4E3629' : '#B8B0A0'}
                                    />
                                </Pressable>
                            </View>
                        )}

                        {/* TAB 2: "Field Observations" — the journal
                            history, styled like handwritten diary entries
                            on lined paper. */}
                        {activeTab === 'field_notes' && (
                            <View style={styles.linedPaperContainer}>
                                <View style={styles.fieldPageHeaderRow}>
                                    <Text style={styles.vintagePageTitle}>Field Observations</Text>
                                </View>
                                <View style={styles.inkUnderlineDivider} />
                                {journalEntries.length === 0 ? (
                                    <Text style={styles.emptyLinedPaperText}>The pages sit clean and empty, waiting for notes from the trail...</Text>
                                ) : (
                                    journalEntries.map((entry) => (
                                        <View key={entry.id} style={styles.handwrittenLogBlock}>
                                            <Text style={styles.handwrittenDateStamp}>• {new Date(entry.created_at).toLocaleDateString()} •</Text>
                                            {/* Each of these 3 lines only
                                                renders if that entry
                                                actually has relevant data —
                                                a journal entry might be
                                                miles-only, exercise-only,
                                                reflection-only, or any
                                                combination. */}
                                            {entry.miles_walked > 0 && (
                                                <Text style={styles.handwrittenMetricLine}>Log: {formatActivityJournalLine(entry.activity_type, entry.input_amount, entry.input_unit, entry.miles_walked)}</Text>
                                            )}
                                            {entry.exercise_logged && entry.exercise_logged !== 'none' && (
                                                <Text style={styles.handwrittenMetricLine}>Fitness Assessment: Logged {entry.exercise_score} score units inside {entry.exercise_logged.replace('_', ' ')} index parameters.</Text>
                                            )}
                                            {entry.journal_reflection && (
                                                <Text style={styles.handwrittenParagraphText}>"{entry.journal_reflection}"</Text>
                                            )}
                                            <View style={styles.journalRowSeparatorOrnament} />
                                        </View>
                                    ))
                                )}
                            </View>
                        )}

                        {/* TAB 3: "Available Pathways" — trail explorer,
                            reusing the local TrailCard component defined
                            above. */}
                        {activeTab === 'explore_trails' && (
                            <View>
                                <View style={styles.fieldPageHeaderRow}>
                                    <Text style={styles.vintagePageTitle}>Available Pathways</Text>
                                </View>
                                <View style={styles.inkUnderlineDivider} />
                                <View style={{ gap: 4 }}>
                                    {trailsList.map(trail => (
                                        <TrailCard
                                            key={trail.id}
                                            trail={trail}
                                            onPress={() => setSelectedTrail(trail)}
                                            tStyles={tStyles}
                                        />
                                    ))}
                                </View>
                            </View>
                        )}

                    </ScrollView>
                </View>

                {/* The vertical tab strip on the right edge of the open
                    book, including a special "COVER" tab that closes the
                    book entirely. */}
                <View style={styles.rightSideTabsColumn}>
                    <Pressable style={[styles.rightVerticalTab, styles.closeTabBg]} onPress={() => setIsJournalOpen(false)}>
                        <Ionicons name="book" size={16} color="#FFF" />
                        <Text style={styles.verticalTabButtonText}>COVER</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.rightVerticalTab, activeTab === 'passport' ? styles.activeTabBg : styles.inactiveTabBg]}
                        onPress={() => setActiveTab('passport')}
                    >
                        <Ionicons name="ribbon" size={16} color={activeTab === 'passport' ? '#4E3629' : '#C5A059'} />
                        <Text style={[styles.verticalTabButtonText, { color: activeTab === 'passport' ? '#4E3629' : '#EBE6DC' }]}>STAMPS</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.rightVerticalTab, activeTab === 'field_notes' ? styles.activeTabBg : styles.inactiveTabBg]}
                        onPress={() => setActiveTab('field_notes')}
                    >
                        <Ionicons name="create" size={16} color={activeTab === 'field_notes' ? '#4E3629' : '#C5A059'} />
                        <Text style={[styles.verticalTabButtonText, { color: activeTab === 'field_notes' ? '#4E3629' : '#EBE6DC' }]}>NOTES</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.rightVerticalTab, activeTab === 'explore_trails' ? styles.activeTabBg : styles.inactiveTabBg]}
                        onPress={() => setActiveTab('explore_trails')}
                    >
                        <Ionicons name="map" size={16} color={activeTab === 'explore_trails' ? '#4E3629' : '#C5A059'} />
                        <Text style={[styles.verticalTabButtonText, { color: activeTab === 'explore_trails' ? '#4E3629' : '#EBE6DC' }]}>TRAILS</Text>
                    </Pressable>
                </View>
            </View>

            {/* MODAL 1: PARCHMENT STAMP DETAIL POPUP WITH BACKDROP DISMISS & CLEAN FADE OUT */}
            <Modal
                // Requires BOTH badgeModalOpen to be true AND a badge to
                // actually be selected — Boolean(selectedBadge) converts
                // the object-or-null into a strict true/false.
                visible={badgeModalOpen && Boolean(selectedBadge)}
                transparent
                animationType="fade"
                onRequestClose={closeBadgeModal}
                // onDismiss fires after the modal has FULLY finished its
                // closing animation (iOS-specific timing) — clearing
                // selectedBadge only at that point (rather than
                // immediately on close) avoids the badge's content
                // visibly disappearing WHILE the fade-out animation is
                // still playing.
                onDismiss={() => setSelectedBadge(null)}
            >
                {/* Tapping the dark backdrop closes the modal. */}
                <Pressable style={styles.modalBlurOverlay} onPress={closeBadgeModal}>
                    {/* Tapping the actual card content should NOT close
                        the modal — e.stopPropagation() prevents the tap
                        from "bubbling up" to the backdrop Pressable's
                        onPress above it, which would otherwise close the
                        modal even when the user meant to interact with
                        the card itself. */}
                    <Pressable style={styles.parchmentBadgeCard} onPress={(e) => e.stopPropagation()}>
                        {selectedBadge && (
                            <View style={{ alignItems: 'center' }}>
                                <View style={[
                                    styles.largeInkStampCircle,
                                    !selectedBadge.unlocked && styles.badgeImageWrapperLocked
                                ]}>
                                    <Image
                                        source={{ uri: `${SUPABASE_STORAGE_BASE_URL}/${selectedBadge.image_filename}` }}
                                        style={styles.largeStampPNGSticker}
                                        contentFit="contain"
                                    />
                                </View>

                                <Text style={styles.parchmentModalTitle}>{selectedBadge.title}</Text>
                                <Text style={styles.parchmentModalCategory}>{formatStampCategory(selectedBadge.category)}</Text>

                                <View style={styles.inkUnderlineDivider} />

                                <Text style={styles.parchmentModalDescription}>
                                    {selectedBadge.unlocked
                                        ? (selectedBadge.earned_description || selectedBadge.description)
                                        : selectedBadge.description}
                                </Text>

                                {selectedBadge.unlocked ? (
                                    <View style={styles.unlockedMetadataBadgeContainer}>
                                        <Text style={styles.parchmentEarnedNotice}>✓ Authenticated in Catalog on {selectedBadge.unlockedAt}</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.parchmentLockedHint}>This stamp is locked. Keep walking and exploring Oklahoma to add it to your collection.</Text>
                                )}

                                <Pressable style={styles.closeParchmentBtn} onPress={closeBadgeModal}>
                                    <Text style={styles.closeParchmentBtnText}>Return to Logbook</Text>
                                </Pressable>
                            </View>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* MODAL 2: TRAILS DETAIL SLIDE POPUP */}
            {/* Same trail-detail modal structure/content as app/trails.tsx
                (see that file for detailed comments) — only rendered when
                a trail is actually selected from the "Explore Trails" tab. */}
            {selectedTrail && (
                <Modal visible animationType="slide" transparent onRequestClose={() => setSelectedTrail(null)}>
                    {/* Tapping the dimmed backdrop closes the modal; the
                        sheet below is a Pressable that stops that tap from
                        bubbling back up to this one. */}
                    <ModalBackdrop style={tStyles.modalOverlay} onPress={() => setSelectedTrail(null)}>
                        <Pressable style={tStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
                            {selectedTrail.image_url?.trim() ? (
                                <Image source={{ uri: selectedTrail.image_url.trim() }} style={tStyles.modalImage} contentFit="cover" />
                            ) : (
                                <View style={[tStyles.modalImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors[scheme].border }]}>
                                    <Text style={{ color: colors[scheme].subtext, fontSize: 34 }}>🗺️</Text>
                                </View>
                            )}

                            <Pressable style={tStyles.closeButton} onPress={() => setSelectedTrail(null)}>
                                <Text style={tStyles.closeButtonText}>✕</Text>
                            </Pressable>

                            <View style={[tStyles.modalDiffBadge, { backgroundColor: DIFFICULTY_COLORS[selectedTrail.difficulty] }]}>
                                <Text style={tStyles.difficultyBadgeText}>{selectedTrail.difficulty}</Text>
                            </View>

                            <ScrollView style={tStyles.modalScroll} contentContainerStyle={tStyles.modalContent} showsVerticalScrollIndicator={false}>
                                <Text style={tStyles.modalTitle}>{selectedTrail.name}</Text>
                                <Text style={tStyles.modalDistance}>{formatMiles(selectedTrail.miles)} miles</Text>
                                <View style={tStyles.modalDivider} />

                                <Text style={tStyles.modalSectionLabel}>ROUTE</Text>
                                <Text style={tStyles.modalBodyText}>{selectedTrail.route}</Text>

                                <Text style={tStyles.modalSectionLabel}>HIGHLIGHTS</Text>
                                {selectedTrail.highlights.map((h, i) => (
                                    <Text key={i} style={tStyles.modalBullet}>· {h}</Text>
                                ))}

                                <Text style={tStyles.modalSectionLabel}>HISTORICAL FOCUS</Text>
                                <Text style={tStyles.modalBodyText}>{selectedTrail.historicalFocus}</Text>

                                <Text style={tStyles.modalSectionLabel}>ROUTE PREVIEW</Text>
                                <View style={tStyles.previewMapFrame}>
                                    {routePreviewLoading ? (
                                        <View style={tStyles.previewLoading}>
                                            <ActivityIndicator size="small" color={colors[scheme].accent} />
                                            <Text style={tStyles.previewLoadingText}>Loading route preview…</Text>
                                        </View>
                                    ) : (
                                        <RoutePreviewMap
                                            coords={trailCoords}
                                            region={previewRegion}
                                            accentColor={colors[scheme].secondary}
                                            subtextColor={colors[scheme].subtext}
                                            borderColor={colors[scheme].border}
                                        />
                                    )}
                                </View>
                            </ScrollView>
                        </Pressable>
                    </ModalBackdrop>
                </Modal>
            )}

            <PresidentFactsModal
                visible={presidentFactsModalOpen}
                onClose={() => setPresidentFactsModalOpen(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    centeredLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EBE6DC' },
    loadingText: { marginTop: 12, fontSize: 13, fontWeight: '700', color: '#4E3629', letterSpacing: 0.5 },
    outerCanvas: { flex: 1, backgroundColor: '#FFFFFF', padding: 12, justifyContent: 'center' },

    // The closed leather cover: dark brown background (#4E3629 — a rich
    // "cordovan leather" brown), a thick 6px border in an even darker
    // brown for a stitched-edge look, and a heavy drop shadow to make it
    // look like a real object sitting on the screen.
    leatherCoverCard: {
        flex: 1,
        backgroundColor: '#4E3629',
        borderRadius: 20,
        borderWidth: 6,
        borderColor: '#3D2B21',
        padding: 12,
        // position: 'relative' lets the brassClaspStrap below position
        // itself with 'absolute' relative to THIS card, so it can poke out
        // past the card's own right edge (see its negative `right` value).
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 12
    },
    // A gold-colored (#C5A059) inner border frame, simulating an
    // embossed/foil-stamped decorative border often seen on old book covers.
    goldEmbossedFrame: { flex: 1, borderWidth: 2, borderColor: '#C5A059', borderStyle: 'solid', borderRadius: 12, padding: 16, justifyContent: 'center', position: 'relative' },
    // A thin dashed vertical line near the left edge, simulating a book's
    // sewn spine stitching.
    spineStitchLine: { position: 'absolute', left: 4, top: 0, bottom: 0, width: 2, borderLeftWidth: 2, borderLeftColor: '#2C1E17', borderStyle: 'dashed', opacity: 0.6 },
    coverMainContent: { alignItems: 'center', paddingHorizontal: 20 },
    coverIcon: { marginBottom: 20, opacity: 0.85 },
    coverOwnerName: { fontSize: 13, color: '#EBE6DC', letterSpacing: 3, fontWeight: '500', textAlign: 'center' },
    coverMainTitle: { fontSize: 28, color: '#C5A059', fontWeight: '800', fontFamily: 'Georgia', letterSpacing: 1.5, textAlign: 'center', marginTop: 4 },
    vintageSeparatorLine: { height: 1, backgroundColor: '#C5A059', width: 60, marginVertical: 18, opacity: 0.5 },
    coverFootnote: { fontSize: 9, color: '#FAF9F5', letterSpacing: 1, opacity: 0.7, textAlign: 'center', fontWeight: '700' },
    // The "brass clasp" — a small rectangular tab that appears to stick
    // out from the right edge of the book cover (right: -14, a NEGATIVE
    // value, pulls it partially outside the card's own bounds), simulating
    // a book-closure latch. top: '45%' roughly vertically centers it.
    brassClaspStrap: { position: 'absolute', right: -14, top: '45%', width: 56, height: 64, backgroundColor: '#3D2B21', borderTopRightRadius: 8, borderBottomRightRadius: 8, borderLeftWidth: 3, borderLeftColor: '#C5A059', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.3, shadowRadius: 3 },
    brassButtonLatch: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#C5A059', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A3803B' },
    latchActionLabel: { fontSize: 7, fontWeight: '900', color: '#C5A059', marginTop: 4, letterSpacing: 0.5 },

    // The open-book two-column layout: spine strip + page content,
    // side-by-side via flexDirection: 'row'.
    openBookLayoutContainer: { flex: 1, flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 2, height: 6 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8, borderWidth: 1, borderColor: '#C8C4B7' },
    // A thin, slightly darker vertical strip simulating the book's
    // physical spine/binding, complete with its own subtle shadow to
    // suggest a slight 3D fold where the pages meet.
    internalBookBindingSpine: { width: 14, backgroundColor: '#EBEBE6', borderRightWidth: 1, borderRightColor: '#DCD4C4', shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 2, zIndex: 5 },
    notebookPaperPage: { flex: 1, backgroundColor: '#FFFFFF', position: 'relative' },
    fieldPageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
    vintagePageTitle: { fontSize: 18, fontWeight: '800', fontFamily: 'Georgia', color: '#4E3629' },
    // A faint (25% opacity) horizontal "ink" line under each page's title,
    // like an underline drawn by hand.
    inkUnderlineDivider: { height: 1, backgroundColor: '#4E3629', opacity: 0.25, marginTop: 6, marginBottom: 16 },

    stampMatrixGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    // width: '47%' (rather than exactly 50%) leaves just enough room for
    // the 12px gap between two cells to still fit within the row without
    // wrapping to a 3rd column — same 2-column-grid trick as gridCell in
    // signup.tsx, just with a different percentage tuned to this
    // particular gap size.
    stampSlotBox: { width: '47%', height: 110, borderWidth: 1, borderStyle: 'solid', borderColor: '#DDD9D0', borderRadius: 14, padding: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
    unlockedStampBg: { backgroundColor: '#FFFFFF', borderStyle: 'solid', borderColor: '#4E3629' },
    // Locked badges get a dashed border instead of solid, plus reduced
    // overall opacity (72%) — visually distinct from unlocked stamps at a
    // glance.
    lockedStampBg: { backgroundColor: '#FFFFFF', borderStyle: 'dashed', opacity: 0.72 },
    badgeImageWrapper: { width: 88, height: 88, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
    badgeImageWrapperLocked: { opacity: 0.25 },
    stampPNGSticker: { width: '100%', height: '100%' },

    // The "Special Unlock" card — same locked/unlocked border treatment as
    // a stamp (unlockedStampBg / lockedStampBg above), but a wide row
    // layout instead of a grid square, since it's a single one-off item
    // rather than part of the badge collection.
    presidentsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
    presidentsCardEmoji: { fontSize: 32 },
    presidentsCardTitle: { fontSize: 15, fontWeight: '800', fontFamily: 'Georgia', color: '#4E3629' },
    presidentsCardSubtitle: { fontSize: 12, color: '#8A8273', marginTop: 2 },

    linedPaperContainer: { flex: 1 },
    emptyLinedPaperText: { fontSize: 13, fontStyle: 'italic', color: '#8A8273', fontFamily: 'Georgia', lineHeight: 22, marginTop: 20, textAlign: 'center' },
    handwrittenLogBlock: { marginBottom: 18 },
    handwrittenDateStamp: { fontSize: 11, fontWeight: '800', color: '#8A8273', textAlign: 'center', marginBottom: 6, letterSpacing: 1 },
    handwrittenMetricLine: { fontSize: 12, fontWeight: '600', color: '#5C5446', fontFamily: 'Georgia', marginBottom: 4, fontStyle: 'italic' },
    handwrittenParagraphText: { fontSize: 14, color: '#3A352B', fontFamily: 'Georgia', lineHeight: 22, fontStyle: 'italic', marginTop: 4, paddingLeft: 6 },
    // A short (40px), centered horizontal line used as a small decorative
    // flourish between journal entries, rather than a full-width divider.
    journalRowSeparatorOrnament: { height: 1, backgroundColor: '#DCD4C4', width: 40, alignSelf: 'center', marginTop: 14 },

    rightSideTabsColumn: { width: 56, backgroundColor: '#DCD4C4', justifyContent: 'flex-start', paddingTop: 16, gap: 10 },
    rightVerticalTab: { width: 56, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 10, borderBottomRightRadius: 10, flexDirection: 'column', gap: 4 },
    closeTabBg: { backgroundColor: '#3D2B21' },
    // The active tab is styled to look like it's "part of the page" (white
    // background matching the page, no left border so it visually merges
    // seamlessly with the page content to its left) — a common tabbed-UI
    // trick where the active tab appears connected to its content.
    activeTabBg: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD9D0', borderLeftWidth: 0 },
    inactiveTabBg: { backgroundColor: '#4E3629', opacity: 0.85 },
    verticalTabButtonText: { fontSize: 8, fontWeight: '900', color: '#FFF', letterSpacing: 0.4, marginTop: 1, textAlign: 'center' },

    errorBanner: { marginBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: '#D9A441', backgroundColor: '#FFF6E5', paddingHorizontal: 12, paddingVertical: 10 },
    errorBannerText: { color: '#7A4B00', fontSize: 12, lineHeight: 16, fontWeight: '600' },

    // rgba(44,30,23,0.5) is a translucent dark brown (rather than plain
    // black), keeping the "old book" color palette consistent even in the
    // modal's backdrop overlay.
    modalBlurOverlay: { flex: 1, backgroundColor: 'rgba(44,30,23,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    parchmentBadgeCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, borderWidth: 2, borderColor: '#4E3629', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
    largeInkStampCircle: { width: 100, height: 100, justifyContent: 'center', alignItems: 'center', marginBottom: 12, backgroundColor: '#FFFFFF' },
    largeStampPNGSticker: { width: '100%', height: '100%' },
    parchmentModalTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'Georgia', color: '#4E3629', textAlign: 'center' },
    parchmentModalCategory: { fontSize: 10, fontWeight: '800', color: '#8A8273', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
    parchmentModalDescription: { fontSize: 13, color: '#3A352B', fontFamily: 'Georgia', lineHeight: 18, marginTop: 4, marginBottom: 12, textAlign: 'center', width: '100%' },
    unlockedMetadataBadgeContainer: { width: '100%', alignItems: 'center', marginTop: 4 },
    // A soft green background (#E2ECD8) with dark green text (#2D4A22),
    // giving the "earned" notice a positive, celebratory feel — distinct
    // from the neutral parchment colors used elsewhere on this card.
    parchmentEarnedNotice: { color: '#2D4A22', fontSize: 11, fontWeight: '700', backgroundColor: '#E2ECD8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, textAlign: 'center', overflow: 'hidden', width: '100%' },
    // NOTE: howEarnedDetailSubtext is defined here but never referenced
    // anywhere in the component above — dead/unused style.
    howEarnedDetailSubtext: { fontSize: 11, color: '#5C5446', fontFamily: 'Georgia', marginTop: 4, fontStyle: 'italic' },
    parchmentLockedHint: { fontSize: 12, color: '#8A8273', fontStyle: 'italic', fontFamily: 'Georgia', textAlign: 'center', lineHeight: 17, marginTop: 4 },
    closeParchmentBtn: { marginTop: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD9D0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
    closeParchmentBtnText: { color: '#4E3629', fontWeight: '700', fontSize: 13 }
});
