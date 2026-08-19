import { Image } from 'expo-image';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ConfettiBurst from './ConfettiBurst';
import { supabase } from '../utils/supabase';

type BadgeCatalogRow = {
    id: string;
    title: string;
    description: string;
    earned_description: string | null;
    category: string;
    image_filename: string;
};

type StudentBadgeRow = {
    user_id: string;
    badge_id: string;
    unlocked_at: string | null;
};

type BadgeUnlockItem = BadgeCatalogRow & {
    unlockedAt?: string | null;
};

type BadgeUnlockContextValue = {
    refreshBadgeInbox: () => Promise<void>;
};

const SUPABASE_STORAGE_BASE_URL = 'https://pylcsytqrhwylhallzav.supabase.co/storage/v1/object/public/badge-stickers/';

const BadgeUnlockContext = createContext<BadgeUnlockContextValue>({
    refreshBadgeInbox: async () => {},
});

export function useBadgeUnlocks() {
    return useContext(BadgeUnlockContext);
}

function BadgePopup({ badge, onClose }: { badge: BadgeUnlockItem; onClose: () => void }) {
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            {/* Keyed on the badge id so a fresh burst plays every time a
                different badge is unlocked, even if the previous one's
                particles haven't finished falling yet. */}
            <ConfettiBurst key={badge.id} />
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    <Text style={styles.kicker}>BADGE UNLOCKED</Text>
                    <View style={styles.imageFrame}>
                        <Image
                            source={{ uri: `${SUPABASE_STORAGE_BASE_URL}/${badge.image_filename}` }}
                            style={styles.image}
                            contentFit="contain"
                        />
                    </View>
                    <Text style={styles.title}>{badge.title}</Text>
                    <Text style={styles.category}>{badge.category.replace(/[-_]/g, ' ')}</Text>
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

export default function BadgeUnlockProvider({ children }: { children: ReactNode }) {
    const [userId, setUserId] = useState<string | null>(null);
    const [queue, setQueue] = useState<BadgeUnlockItem[]>([]);
    const queueRef = useRef<BadgeUnlockItem[]>([]);
    const seenIdsRef = useRef<Set<string>>(new Set());
    const loadingRef = useRef(false);
    const initialHydrationRef = useRef(false);

    const activeBadge = queue[0] ?? null;

    const refreshBadgeInbox = useCallback(async () => {
        if (!userId || loadingRef.current) return;
        loadingRef.current = true;
        try {
            const { data: badgeRows, error: badgeRowsError } = await supabase
                .from('user_badges')
                .select('user_id, badge_id, unlocked_at')
                .eq('user_id', userId)
                .order('unlocked_at', { ascending: true });

            if (badgeRowsError) throw badgeRowsError;

            const rows = (badgeRows ?? []) as StudentBadgeRow[];
            const freshIds = rows
                .map((row) => String(row.badge_id))
                .filter((id) => id && !seenIdsRef.current.has(id));

            if (freshIds.length === 0) {
                if (!initialHydrationRef.current) {
                    rows.forEach((row) => seenIdsRef.current.add(String(row.badge_id)));
                    initialHydrationRef.current = true;
                }
                return;
            }

            const { data: catalogRows, error: catalogError } = await supabase
                .from('badges_catalog')
                .select('id, title, description, earned_description, category, image_filename')
                .in('id', freshIds);

            if (catalogError) throw catalogError;

            const catalogMap = new Map(
                (catalogRows ?? []).map((row: BadgeCatalogRow) => [String(row.id), row])
            );

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

            rows.forEach((row) => seenIdsRef.current.add(String(row.badge_id)));
            initialHydrationRef.current = true;
        } finally {
            loadingRef.current = false;
        }
    }, [userId]);

    useEffect(() => {
        let mounted = true;

        async function loadUser() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!mounted) return;
            setUserId(session?.user?.id ?? null);
        }

        void loadUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUserId(session?.user?.id ?? null);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!userId) {
            setQueue([]);
            queueRef.current = [];
            seenIdsRef.current = new Set();
            initialHydrationRef.current = false;
            return;
        }

        seenIdsRef.current = new Set();
        queueRef.current = [];
        setQueue([]);
        initialHydrationRef.current = false;

        void refreshBadgeInbox();

        const interval = setInterval(() => {
            void refreshBadgeInbox();
        }, 15000);

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

        const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                void refreshBadgeInbox();
            }
        });

        return () => {
            clearInterval(interval);
            appStateSub.remove();
            void channel.unsubscribe();
        };
    }, [userId, refreshBadgeInbox]);

    const handleClose = useCallback(() => {
        setQueue((current) => current.slice(1));
        queueRef.current = queueRef.current.slice(1);
    }, []);

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
