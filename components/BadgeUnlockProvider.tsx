// components/BadgeUnlockProvider.tsx
//
// This file defines a React Context Provider named BadgeUnlockProvider.
//
// For readers new to Context: React Context is a way to make some state or
// functionality available to any component in the tree *without* having to
// pass it down manually as props through every intermediate component
// ("prop drilling"). You create a Context object (see `createContext`
// below), wrap part of your component tree in that Context's `.Provider`
// (see the bottom of this file), and give the Provider a `value`. Any
// descendant component can then call `useContext` (here wrapped in the
// `useBadgeUnlocks` hook) to read that `value`, no matter how deeply nested
// it is.
//
// This particular provider is meant to wrap the whole app (likely in
// app/_layout.tsx) so that:
//   1. It can watch who's currently logged in (via Supabase auth) and poll
//      /subscribe to the `user_badges` table for newly unlocked badges.
//   2. Whenever it notices a badge the user hasn't seen a popup for yet, it
//      queues it up and renders a full-screen celebratory Modal
//      (`BadgePopup`, with a confetti animation) on top of *whatever screen
//      is currently showing* -- because the Modal/queue lives here at the
//      root instead of on any individual screen, badge popups can appear no
//      matter where in the app the user is.
//   3. It exposes a `refreshBadgeInbox()` function through context (via
//      `useBadgeUnlocks()`) so other screens can proactively ask "check for
//      new badges right now" (e.g. right after a student logs an activity
//      that might have earned one), rather than waiting for the polling
//      interval.
//
// Consumers: any component can call `const { refreshBadgeInbox } =
// useBadgeUnlocks();` to get access to that function. They do NOT get or
// need direct access to the badge queue/popup state -- that's kept private
// inside this provider and only manifests as the Modal popping up.

import { Image } from 'expo-image';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ConfettiBurst from './ConfettiBurst';
import { supabase } from '../utils/supabase';

// Shape of a row from the `badges_catalog` Supabase table: the static
// definition of a badge (its display copy and artwork), independent of
// whether any particular user has earned it yet.
type BadgeCatalogRow = {
    id: string;
    title: string;
    description: string;
    earned_description: string | null;
    category: string;
    image_filename: string;
};

// Shape of a row from the `user_badges` table: a join record saying which
// user unlocked which badge, and when.
type StudentBadgeRow = {
    user_id: string;
    badge_id: string;
    unlocked_at: string | null;
};

// A single item in the popup queue: the catalog info (title, description,
// image, etc.) plus the human-readable date it was unlocked, ready to hand
// straight to <BadgePopup>.
type BadgeUnlockItem = BadgeCatalogRow & {
    unlockedAt?: string | null;
};

// The shape of the value handed out through BadgeUnlockContext. Kept
// intentionally minimal -- just one function -- since the popup UI/queue
// itself is fully internal to this provider and never exposed to consumers.
type BadgeUnlockContextValue = {
    refreshBadgeInbox: () => Promise<void>;
};

// Base URL for the public Supabase Storage bucket holding badge artwork.
// Each badge's `image_filename` is appended to this to build the full
// image URL.
const SUPABASE_STORAGE_BASE_URL = 'https://pylcsytqrhwylhallzav.supabase.co/storage/v1/object/public/badge-stickers/';

// createContext(defaultValue) creates the Context object itself. The
// defaultValue here (a no-op async function) is only ever used if a
// component calls useBadgeUnlocks() *without* being wrapped in a
// <BadgeUnlockContext.Provider> somewhere above it in the tree -- normally
// that shouldn't happen since BadgeUnlockProvider wraps the whole app, but
// having a safe no-op default avoids a crash if it's ever used outside
// that tree (e.g. in isolated tests).
const BadgeUnlockContext = createContext<BadgeUnlockContextValue>({
    refreshBadgeInbox: async () => {},
});

// useBadgeUnlocks
// The public "consumer" hook for this context. Any component, anywhere in
// the tree under <BadgeUnlockProvider>, can call this to get access to
// `refreshBadgeInbox`. This thin wrapper around React's built-in
// `useContext` is the conventional pattern for context: it keeps the raw
// Context object private to this file and gives other files a clean,
// purpose-named hook to import instead.
// Returns: the current BadgeUnlockContextValue ({ refreshBadgeInbox }).
export function useBadgeUnlocks() {
    return useContext(BadgeUnlockContext);
}

// BadgePopup
// The actual "you unlocked a badge!" celebration screen, rendered as a
// native Modal. Not exported -- it's an internal implementation detail of
// BadgeUnlockProvider, rendered only when there's an `activeBadge` in the
// queue.
// Props:
// - badge: the BadgeUnlockItem to display (image, title, category,
//   description, unlock date).
// - onClose: called when the user dismisses the popup (either by tapping
//   the backdrop or the "Continue" button), so the provider can advance to
//   the next queued badge (if any).
// Returns: a Modal containing a confetti burst, a dismissible backdrop, and
// a centered "sheet" card with the badge's details.
function BadgePopup({ badge, onClose }: { badge: BadgeUnlockItem; onClose: () => void }) {
    return (
        // Modal is React Native's built-in component for rendering content
        // above everything else, outside the normal view hierarchy
        // (similar to a portal on web) -- it takes over the full screen.
        // `visible` is always true here because this component is only
        // ever mounted while there IS a badge to show (see `activeBadge ?
        // <BadgePopup ... /> : null` further down); `transparent` lets the
        // custom backdrop show through instead of an opaque native
        // background; `animationType="fade"` is the built-in show/hide
        // transition; `onRequestClose` is required on Android (it's what
        // the hardware back button triggers).
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            {/* Keyed on the badge id so a fresh burst plays every time a
                different badge is unlocked, even if the previous one's
                particles haven't finished falling yet. */}
            <ConfettiBurst key={badge.id} />
            {/* Outer Pressable fills the screen and closes the popup when
                tapped anywhere on the dimmed background. */}
            <Pressable style={styles.backdrop} onPress={onClose}>
                {/* Inner Pressable is the visible card. stopPropagation()
                    prevents a tap *on* the card from bubbling up to the
                    outer Pressable's onPress and closing the popup --
                    without this, tapping the card itself (not just its
                    Continue button) would dismiss it. */}
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    <Text style={styles.kicker}>BADGE UNLOCKED</Text>
                    <View style={styles.imageFrame}>
                        <Image
                            source={{ uri: `${SUPABASE_STORAGE_BASE_URL}${badge.image_filename}` }}
                            style={styles.image}
                            contentFit="contain"
                        />
                    </View>
                    <Text style={styles.title}>{badge.title}</Text>
                    {/* Category strings are stored kebab/snake_case (e.g.
                        "trail-master"); this swaps dashes/underscores for
                        spaces for display. */}
                    <Text style={styles.category}>{badge.category.replace(/[-_]/g, ' ')}</Text>
                    {/* Prefer the badge's special "earned" description
                        (celebratory copy) if the catalog provides one,
                        falling back to the generic description otherwise. */}
                    <Text style={styles.description}>{badge.earned_description || badge.description}</Text>
                    {badge.unlockedAt ? <Text style={styles.meta}>Unlocked {badge.unlockedAt}</Text> : null}
                    <Pressable style={styles.button} onPress={onClose}>
                        <Text style={styles.buttonText}>Continue</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

// BadgeUnlockProvider
// The Context Provider component itself. Wrap the app's root in this (it
// should sit high in the tree, e.g. in app/_layout.tsx) so that:
//   - `children` (the rest of the app) renders normally underneath it, and
//   - it can inject a badge-unlock popup on top of everything whenever one
//     is queued.
// Props:
// - children: the rest of the React tree this provider wraps. Rendered
//   as-is; this component only *adds* the popup on top, it never changes
//   how children render.
// Returns: a <BadgeUnlockContext.Provider> (making `refreshBadgeInbox`
// available to descendants) containing `children` plus, conditionally, the
// <BadgePopup> for the currently active badge.
export default function BadgeUnlockProvider({ children }: { children: ReactNode }) {
    // -- React state (triggers re-render when changed) --
    // userId: the currently logged-in Supabase user's id, or null when
    // logged out / not yet determined. Drives which badges get fetched.
    const [userId, setUserId] = useState<string | null>(null);
    // queue: ordered list of badges waiting to have their "unlocked!"
    // popup shown. Only queue[0] is ever displayed at a time; closing it
    // removes it and reveals the next one, so multiple simultaneous
    // unlocks are shown one after another rather than all at once.
    const [queue, setQueue] = useState<BadgeUnlockItem[]>([]);

    // -- Refs (mutable values that persist across renders WITHOUT causing
    // a re-render when changed, unlike state) --
    // queueRef: mirrors `queue`'s contents so async code (like
    // refreshBadgeInbox, which runs outside the render cycle) can read the
    // latest queue synchronously without depending on stale closures over
    // the `queue` state variable.
    const queueRef = useRef<BadgeUnlockItem[]>([]);
    // seenIdsRef: every badge id this provider has already accounted for
    // (either shown a popup for, or seen during initial hydration -- see
    // below) for the CURRENT user, so the same badge is never queued twice.
    const seenIdsRef = useRef<Set<string>>(new Set());
    // loadingRef: a simple in-flight guard so refreshBadgeInbox doesn't
    // overlap with itself if it's called again (e.g. by the interval)
    // before a previous call has finished.
    const loadingRef = useRef(false);
    // initialHydrationRef: tracks whether we've completed the FIRST fetch
    // for the current user. This matters because on first load, a user may
    // already have many previously-earned badges in `user_badges` --
    // without this flag, all of those pre-existing badges would be treated
    // as "new" and flood the user with popups for badges they already know
    // about. See the logic inside refreshBadgeInbox for how it's used.
    const initialHydrationRef = useRef(false);

    // The badge currently being shown in the popup -- always the front of
    // the queue, or null if nothing is queued (in which case no popup
    // renders).
    const activeBadge = queue[0] ?? null;

    // refreshBadgeInbox
    // Fetches this user's unlocked badges from Supabase, figures out which
    // ones are "new" (not yet seen), looks up their catalog details, and
    // appends any new ones to the popup queue. Exposed to the rest of the
    // app via context so other screens can trigger an immediate check
    // (e.g. right after logging an activity that might award a badge)
    // instead of waiting for the polling interval below.
    // Wrapped in useCallback so its identity only changes when `userId`
    // changes -- this matters because it's used as a dependency of the
    // useEffect below (an unstable function reference would cause that
    // effect to re-run every render).
    const refreshBadgeInbox = useCallback(async () => {
        // Bail out if there's no logged-in user, or if a previous call is
        // still in flight (see loadingRef above).
        if (!userId || loadingRef.current) return;
        loadingRef.current = true;
        try {
            // Step 1: fetch every badge-unlock row for this user, oldest
            // first (so if multiple are new, they queue/pop in the order
            // they were actually earned).
            const { data: badgeRows, error: badgeRowsError } = await supabase
                .from('user_badges')
                .select('user_id, badge_id, unlocked_at')
                .eq('user_id', userId)
                .order('unlocked_at', { ascending: true });

            if (badgeRowsError) throw badgeRowsError;

            const rows = (badgeRows ?? []) as StudentBadgeRow[];
            // Step 2: figure out which of those badge ids we haven't
            // already accounted for (i.e. aren't in seenIdsRef yet).
            const freshIds = rows
                .map((row) => String(row.badge_id))
                .filter((id) => id && !seenIdsRef.current.has(id));

            if (freshIds.length === 0) {
                // Nothing new. If this is the very first fetch for this
                // user (initialHydrationRef still false), mark ALL of
                // their existing badges as "seen" now -- this is the
                // mechanism that prevents a user with, say, 10
                // already-earned badges from being shown 10 popups the
                // moment the app opens. Only badges unlocked AFTER this
                // point will ever trigger a popup.
                if (!initialHydrationRef.current) {
                    rows.forEach((row) => seenIdsRef.current.add(String(row.badge_id)));
                    initialHydrationRef.current = true;
                }
                return;
            }

            // Step 3: for the badges that ARE new, fetch their full
            // catalog details (title/description/image/etc.) in one
            // batched query using `.in('id', freshIds)` rather than one
            // query per badge.
            const { data: catalogRows, error: catalogError } = await supabase
                .from('badges_catalog')
                .select('id, title, description, earned_description, category, image_filename')
                .in('id', freshIds);

            if (catalogError) throw catalogError;

            // Build a Map from badge id -> catalog row for quick lookup
            // while assembling the popup items below.
            const catalogMap = new Map(
                (catalogRows ?? []).map((row: BadgeCatalogRow) => [String(row.id), row])
            );

            // Step 4: combine each fresh id's catalog info with its
            // unlocked_at timestamp (formatted as a locale date string) to
            // build the final BadgeUnlockItem objects that BadgePopup can
            // render directly. Badges missing catalog data (shouldn't
            // normally happen) are mapped to `null` and dropped by the
            // `.filter(Boolean)` below.
            const nextItems = freshIds
                .map((badgeId) => {
                    const badge = catalogMap.get(badgeId);
                    const unlockedRow = rows.find((row) => String(row.badge_id) === badgeId);
                    if (!badge) return null;
                    return {
                        ...badge,
                        unlockedAt: unlockedRow?.unlocked_at ? new Date(unlockedRow.unlocked_at).toLocaleDateString() : null,
                    };
                })
                .filter(Boolean) as BadgeUnlockItem[];

            // Step 5: append the new items to both the reactive `queue`
            // state (so React re-renders and shows the popup) and the
            // `queueRef` mirror (so future async calls see the up-to-date
            // queue). The `existing` Set guards against accidentally
            // double-queuing a badge that might already be in the queue
            // from a previous overlapping call.
            if (nextItems.length > 0) {
                setQueue((current) => {
                    const merged = [...current];
                    const existing = new Set(current.map((item) => item.id));
                    for (const item of nextItems) {
                        if (!existing.has(item.id)) {
                            merged.push(item);
                            existing.add(item.id);
                        }
                    }
                    return merged;
                });
                queueRef.current = [...queueRef.current, ...nextItems];
                nextItems.forEach((item) => seenIdsRef.current.add(item.id));
            }

            // Mark every badge id seen this fetch (fresh or not) as seen,
            // and confirm hydration is complete.
            rows.forEach((row) => seenIdsRef.current.add(String(row.badge_id)));
            initialHydrationRef.current = true;
        } finally {
            // Always release the in-flight guard, whether the fetch
            // succeeded or threw.
            loadingRef.current = false;
        }
    }, [userId]);

    // Effect 1: figure out who's logged in, and keep it up to date.
    // Runs once on mount (empty dependency array `[]`) because auth state
    // changes are handled by the subscription below, not by re-running
    // this effect.
    useEffect(() => {
        // `mounted` guards against calling setUserId after this component
        // has already unmounted (e.g. if the async getSession() call
        // resolves after the app tree has torn down), which React would
        // otherwise warn about.
        let mounted = true;

        // Read whatever session Supabase currently has cached/persisted
        // (e.g. from a previous app launch) to set the initial userId.
        async function loadUser() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!mounted) return;
            setUserId(session?.user?.id ?? null);
        }

        void loadUser();

        // Subscribe to ALL future auth changes (login, logout, token
        // refresh, etc.) so userId stays current for the lifetime of the
        // app, not just at startup.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUserId(session?.user?.id ?? null);
        });

        // Cleanup: runs on unmount. Prevents the stale-closure setState
        // above and releases the Supabase auth subscription so it doesn't
        // leak.
        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // Effect 2: once we know WHO is logged in, set up all the ways we
    // learn about new badge unlocks for that user: an immediate check, a
    // polling interval, a realtime subscription, and an app-foreground
    // check. Re-runs whenever `userId` (or the refreshBadgeInbox function
    // identity, which itself only changes when userId changes) changes --
    // i.e. on login, logout, and switching accounts.
    useEffect(() => {
        if (!userId) {
            // Logged out: clear all per-user state so nothing carries over
            // to whichever user logs in next, and don't set up any
            // fetching/subscriptions.
            setQueue([]);
            queueRef.current = [];
            seenIdsRef.current = new Set();
            initialHydrationRef.current = false;
            return;
        }

        // New user session: reset all the per-user tracking before
        // fetching, so a previous user's "seen" badges/queue don't bleed
        // into this user's view.
        seenIdsRef.current = new Set();
        queueRef.current = [];
        setQueue([]);
        initialHydrationRef.current = false;

        // Check immediately rather than waiting for the first interval
        // tick, so badges already unlocked show up as soon as possible
        // after login.
        void refreshBadgeInbox();

        // Fallback polling: re-check every 15 seconds. This is a safety
        // net in case the realtime subscription below misses an event
        // (e.g. a brief disconnect) or the app doesn't support realtime in
        // some environment.
        const interval = setInterval(() => {
            void refreshBadgeInbox();
        }, 15000);

            // Realtime subscription: Supabase's realtime feature lets the
            // client listen for database changes as they happen, rather
            // than only finding out on the next poll. Here it opens a
            // channel scoped to this user (`badge-unlocks-${userId}`) and
            // listens specifically for INSERT events on `user_badges`
            // rows belonging to this user -- i.e. the moment a badge is
            // awarded server-side, this fires and triggers an immediate
            // refresh instead of waiting up to 15 seconds.
            const channel = supabase
                .channel(`badge-unlocks-${userId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'user_badges',
                    filter: `user_id=eq.${userId}`,
                }, () => {
                    void refreshBadgeInbox();
                })
            .subscribe();

        // AppState tracks whether the app is in the foreground
        // ('active'), background, or inactive. Refreshing when the app
        // becomes active again catches badges that may have been awarded
        // while the app was backgrounded (e.g. a server-side process ran
        // while the user had switched to another app).
        const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                void refreshBadgeInbox();
            }
        });

        // Cleanup: runs when userId changes again or the provider
        // unmounts. Tears down the interval timer, the AppState listener,
        // and the realtime channel so none of them keep running (and
        // potentially firing stale callbacks) after this effect's
        // conditions no longer apply.
        return () => {
            clearInterval(interval);
            appStateSub.remove();
            void channel.unsubscribe();
        };
    }, [userId, refreshBadgeInbox]);

    // handleClose
    // Passed to <BadgePopup> as its onClose. Removes the currently-shown
    // badge (always index 0) from both the state queue and its ref mirror,
    // which causes `activeBadge` to become the next item (or null), either
    // advancing to the next popup or hiding the popup entirely.
    const handleClose = useCallback(() => {
        setQueue((current) => current.slice(1));
        queueRef.current = queueRef.current.slice(1);
    }, []);

    // The context value handed to descendants. useMemo avoids creating a
    // brand-new object on every render (which would otherwise cause every
    // consumer of this context to think the value "changed" and re-render
    // unnecessarily) -- it only creates a new object when refreshBadgeInbox
    // itself changes identity.
    const value = useMemo(() => ({ refreshBadgeInbox }), [refreshBadgeInbox]);

    return (
        <BadgeUnlockContext.Provider value={value}>
            {children}
            {activeBadge ? <BadgePopup badge={activeBadge} onClose={handleClose} /> : null}
        </BadgeUnlockContext.Provider>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(29, 21, 15, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    sheet: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#DDD9D0',
        padding: 20,
        alignItems: 'center',
        gap: 8,
    },
    kicker: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.1,
        color: '#A3803B',
    },
    imageFrame: {
        width: 112,
        height: 112,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#DDD9D0',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        padding: 8,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontFamily: 'Georgia',
        fontSize: 20,
        fontWeight: '800',
        color: '#4E3629',
        textAlign: 'center',
    },
    category: {
        fontSize: 11,
        fontWeight: '700',
        color: '#7A6A54',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    description: {
        fontSize: 13,
        lineHeight: 18,
        color: '#3A352B',
        textAlign: 'center',
    },
    meta: {
        fontSize: 11,
        color: '#5C5446',
        fontStyle: 'italic',
        textAlign: 'center',
    },
    button: {
        marginTop: 8,
        backgroundColor: '#DE9027',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 12,
    },
    buttonText: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '800',
    },
});
