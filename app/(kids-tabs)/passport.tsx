// app/(kids-tabs)/passport.tsx
// "My Badges" -- the elementary-student badge collection. The adult
// Passport screen (`(tabs)/passport.tsx`) is a full "antique field journal"
// object (leather cover, brass clasp, handwritten field notes, a trail
// explorer) -- a deliberate, committed vintage identity that has no honest
// translation into a bright cartoon world, so this screen doesn't try to
// reskin it. Instead it's a second, simpler view onto the same real badge
// data (`badges_catalog`/`user_badges`, see hooks/useBadgeCollection.ts):
// a sticker-album grid, unlocked badges in full color with their real
// artwork, locked ones silhouetted, tap any one for its story.
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import GlobeMascot from '../../components/kids/GlobeMascot';
import { KidsMiniButton, KidsPill } from '../../components/kids/KidsPrimitives';
import ModalBackdrop from '../../components/ModalBackdrop';
import { BADGE_STORAGE_BASE_URL, useBadgeCollection, type BadgeCollectionItem } from '../../hooks/useBadgeCollection';
import { kidsColors, kidsFonts, kidsRadius, kidsSpacing } from '../../styles/kidsTheme';

export default function KidsPassportScreen() {
    const { items, loading, unlockedCount, totalCount } = useBadgeCollection();
    const [selected, setSelected] = useState<BadgeCollectionItem | null>(null);

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: kidsColors.bg }]}>
                <ActivityIndicator size="large" color={kidsColors.grass} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: kidsColors.bg }}>
            <StatusBar barStyle="dark-content" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90, paddingTop: kidsSpacing.lg }}>
                <View style={styles.header}>
                    <GlobeMascot pose="cheer" size={70} />
                    <View style={{ marginLeft: kidsSpacing.md, flex: 1 }}>
                        <Text style={styles.title}>My Badges</Text>
                        <KidsPill icon="🎖️" variant="sun" label={`${unlockedCount} of ${totalCount} found`} />
                    </View>
                </View>

                {items.length === 0 ? (
                    <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.xl, alignItems: 'center' }}>
                        <GlobeMascot pose="think" size={80} />
                        <Text style={styles.emptyText}>No badges yet — walk some trails to start collecting!</Text>
                    </View>
                ) : (
                    <View style={styles.grid}>
                        {items.map((item) => (
                            <Pressable
                                key={item.badge.id}
                                style={styles.tile}
                                onPress={() => setSelected(item)}
                                accessibilityRole="button"
                                accessibilityLabel={item.unlocked ? item.badge.title : `${item.badge.title}, locked`}
                            >
                                <View style={[styles.tileFace, !item.unlocked && styles.tileFaceLocked]}>
                                    <Image
                                        source={{ uri: `${BADGE_STORAGE_BASE_URL}${item.badge.image_filename}` }}
                                        style={[styles.tileImage, !item.unlocked && styles.tileImageLocked]}
                                        contentFit="contain"
                                    />
                                    {!item.unlocked && (
                                        <View style={styles.lockOverlay}>
                                            <Text style={{ fontSize: 22 }}>🔒</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.tileTitle} numberOfLines={2}>{item.unlocked ? item.badge.title : '???'}</Text>
                            </Pressable>
                        ))}
                    </View>
                )}
            </ScrollView>

            {selected && (
                <Modal visible animationType="fade" transparent onRequestClose={() => setSelected(null)}>
                    <ModalBackdrop style={{ alignItems: 'center', justifyContent: 'center' }} onPress={() => setSelected(null)}>
                        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
                            <View style={[sheetStyles.imageWrap, !selected.unlocked && styles.tileFaceLocked]}>
                                <Image
                                    source={{ uri: `${BADGE_STORAGE_BASE_URL}${selected.badge.image_filename}` }}
                                    style={[sheetStyles.image, !selected.unlocked && styles.tileImageLocked]}
                                    contentFit="contain"
                                />
                            </View>
                            <Text style={sheetStyles.title}>{selected.unlocked ? selected.badge.title : 'Mystery Badge'}</Text>
                            <KidsPill label={selected.badge.category.replace(/[-_]/g, ' ')} variant="sky" />
                            <Text style={sheetStyles.body}>
                                {selected.unlocked
                                    ? (selected.badge.earned_description || selected.badge.description)
                                    : 'Keep exploring your trail to discover this badge!'}
                            </Text>
                            <KidsMiniButton label="Close" variant="berry" onPress={() => setSelected(null)} style={{ marginTop: kidsSpacing.md, flex: 0, alignSelf: 'center' }} />
                        </Pressable>
                    </ModalBackdrop>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: kidsSpacing.lg },
    title: { fontFamily: kidsFonts.display, fontSize: 24, color: kidsColors.ink, marginBottom: 6 },
    emptyText: { fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.subink, textAlign: 'center', marginTop: kidsSpacing.md },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: kidsSpacing.lg,
        marginTop: kidsSpacing.xl,
        gap: kidsSpacing.md,
    },
    tile: { width: '30%', alignItems: 'center' },
    tileFace: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: kidsRadius.lg,
        backgroundColor: kidsColors.surface,
        borderWidth: 3,
        borderColor: kidsColors.sun,
        alignItems: 'center',
        justifyContent: 'center',
        padding: kidsSpacing.sm,
    },
    tileFaceLocked: {
        borderColor: kidsColors.cardBorder,
        backgroundColor: kidsColors.bg,
    },
    tileImage: { width: '100%', height: '100%' },
    tileImageLocked: { opacity: 0.18 },
    lockOverlay: { position: 'absolute' },
    tileTitle: { fontFamily: kidsFonts.body, fontSize: 11, color: kidsColors.ink, textAlign: 'center', marginTop: 6 },
});

const sheetStyles = StyleSheet.create({
    sheet: {
        backgroundColor: kidsColors.surface,
        borderRadius: kidsRadius.xl,
        borderWidth: 4,
        borderColor: kidsColors.sun,
        padding: kidsSpacing.xl,
        width: '86%',
        maxWidth: 340,
        alignSelf: 'center',
        alignItems: 'center',
    },
    imageWrap: {
        width: 120,
        height: 120,
        borderRadius: kidsRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: kidsSpacing.md,
    },
    image: { width: '90%', height: '90%' },
    title: { fontFamily: kidsFonts.display, fontSize: 20, color: kidsColors.ink, textAlign: 'center', marginBottom: kidsSpacing.sm },
    body: { fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.subink, textAlign: 'center', marginTop: kidsSpacing.md, lineHeight: 20 },
});
