// app/(kids-tabs)/student-account.tsx
// "Me" -- the elementary-student profile screen. The adult Account screen
// (`(tabs)/student-account.tsx`) is a dense settings surface: a full
// Dicebear style/background picker grid, a delete-able activity log
// viewer, account deletion. None of that is right for this audience or
// this demo's scope -- this screen keeps exactly what a young student
// needs: who am I (name + a fun re-rollable avatar), what classes am I in,
// and -- the one piece of real product wiring this whole shell exists
// for -- the switch between the standard GeoQuestOK experience and this
// "Explorer World" one (see lib/access.ts's 'kids' AppView). It reads and
// writes the exact same `profiles`/`class_memberships`/`classes` rows and
// `join_class_by_code` RPC as the adult screen.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import GlobeMascot from '../../components/kids/GlobeMascot';
import { KidsButton, KidsCard, KidsMiniButton, KidsPill } from '../../components/kids/KidsPrimitives';
import ModalBackdrop from '../../components/ModalBackdrop';
import { signOutAndRedirect } from '../../lib/auth';
import { confirmAlert, showAlert } from '../../lib/confirmAlert';
import { containsProfanity } from '../../utils/profanity';
import { getAnonymousName } from '../../utils/randomNames';
import { supabase } from '../../utils/supabase';
import { kidsColors, kidsFonts, kidsRadius, kidsSpacing } from '../../styles/kidsTheme';

type Membership = { id: number; classId: string; className: string; isAnonymousRequired: boolean };

function avatarUrlForSeed(seed: string) {
    return `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(seed)}&backgroundColor=4DC3F7`;
}

export default function KidsStudentAccountScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [username, setUsername] = useState('Explorer');
    const [avatarSeed, setAvatarSeed] = useState('Explorer');
    const [activeView, setActiveView] = useState<'classic' | 'kids'>('kids');
    const [switching, setSwitching] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [seedDraft, setSeedDraft] = useState('Explorer');
    const [saving, setSaving] = useState(false);

    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [membershipsLoading, setMembershipsLoading] = useState(true);
    const [joinCode, setJoinCode] = useState('');
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        async function load() {
            const { data: authData } = await supabase.auth.getUser();
            if (!authData?.user) return;
            setUserId(authData.user.id);

            const { data } = await supabase
                .from('profiles')
                .select('username, display_name, avatar_seed, active_view')
                .eq('id', authData.user.id)
                .single();

            if (data) {
                setUsername(data.username || data.display_name || 'Explorer');
                setAvatarSeed(data.avatar_seed && !data.avatar_seed.startsWith('http') ? data.avatar_seed : (data.username || 'Explorer'));
                setActiveView(data.active_view === 'classic' ? 'classic' : 'kids');
            }
            setLoading(false);

            await fetchMemberships(authData.user.id);
        }
        void load();
    }, []);

    async function fetchMemberships(uid: string) {
        try {
            setMembershipsLoading(true);
            const { data: membershipRows, error: membershipError } = await supabase
                .from('class_memberships')
                .select('id, class_id')
                .eq('user_id', uid);
            if (membershipError) throw membershipError;

            const classIds = [...new Set((membershipRows || []).map((r) => r.class_id))];
            let classRows: { id: string; class_name: string; is_anonymous_required?: boolean }[] = [];
            if (classIds.length > 0) {
                const { data, error } = await supabase.from('classes').select('id, class_name, is_anonymous_required').in('id', classIds);
                if (!error) classRows = data || [];
            }
            const classById = new Map(classRows.map((c) => [c.id, c]));
            setMemberships((membershipRows || []).map((row) => {
                const cls = classById.get(row.class_id);
                return {
                    id: row.id,
                    classId: row.class_id,
                    className: cls?.class_name || row.class_id,
                    isAnonymousRequired: !!cls?.is_anonymous_required,
                };
            }));
        } catch (e: any) {
            console.error(e);
        } finally {
            setMembershipsLoading(false);
        }
    }

    const hasAnonymityRule = memberships.some((m) => m.isAnonymousRequired);
    const displayName = hasAnonymityRule && userId ? getAnonymousName(userId) : username;
    const avatarUrl = avatarUrlForSeed(hasAnonymityRule && userId ? getAnonymousName(userId) : avatarSeed);

    const handleToggleAppView = async (target: 'classic' | 'kids') => {
        if (switching || target === activeView) return;
        setSwitching(true);
        const previous = activeView;
        try {
            setActiveView(target);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');
            const { error } = await supabase.from('profiles').update({ active_view: target }).eq('id', user.id);
            if (error) throw error;
            router.replace((target === 'kids' ? '/(kids-tabs)/dashboard' : '/(tabs)/dashboard') as any);
        } catch (err: any) {
            setActiveView(previous);
            showAlert('Could Not Switch', err.message || 'Please try again.');
        } finally {
            setSwitching(false);
        }
    };

    const openEditor = () => {
        setNameDraft(username);
        setSeedDraft(avatarSeed);
        setEditOpen(true);
    };

    const rerollAvatar = () => setSeedDraft(`${username || 'Explorer'}-${Math.floor(Math.random() * 100000)}`);

    const saveProfile = async () => {
        const clean = nameDraft.trim();
        if (!clean) return;
        if (containsProfanity(clean)) {
            showAlert('Try Another Name', 'Please pick a friendly name.');
            return;
        }
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');
            await supabase.from('profiles').update({ username: clean, avatar_seed: seedDraft }).eq('id', user.id);
            setUsername(clean);
            setAvatarSeed(seedDraft);
            setEditOpen(false);
        } catch (err: any) {
            showAlert('Could Not Save', err.message || 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleJoin = async () => {
        const code = joinCode.trim().toUpperCase();
        if (!code || !userId) return;
        setJoining(true);
        try {
            const { data, error } = await supabase.rpc('join_class_by_code', { target_class_id: code });
            if (error) {
                if (error.code === '23505') showAlert('Already In!', "You're already part of this class.");
                else throw error;
            } else if (!data || data.length === 0) {
                showAlert('Not Found', "That code doesn't match a class.");
            } else {
                setJoinCode('');
                showAlert('Woohoo!', `You joined ${data[0].class_name}!`);
                await fetchMemberships(userId);
            }
        } catch (err: any) {
            showAlert('Could Not Join', err.message);
        } finally {
            setJoining(false);
        }
    };

    const handleLeave = (membershipId: number, className: string) => {
        confirmAlert('Leave Class?', `Leave ${className}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Leave',
                style: 'destructive',
                onPress: async () => {
                    await supabase.from('class_memberships').delete().eq('id', membershipId);
                    if (userId) await fetchMemberships(userId);
                },
            },
        ]);
    };

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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90, paddingTop: kidsSpacing.xl }}>
                <View style={{ alignItems: 'center' }}>
                    <Pressable onPress={openEditor} accessibilityRole="button" accessibilityLabel="Edit your name and avatar">
                        <View style={styles.avatarRing}>
                            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="contain" />
                        </View>
                        <View style={styles.editBadge}><Text style={{ fontSize: 14 }}>✏️</Text></View>
                    </Pressable>
                    <Text style={styles.name}>{displayName}</Text>
                    {hasAnonymityRule && <KidsPill icon="🔒" label="Name hidden for a class" variant="sky" />}
                </View>

                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.xl }}>
                    <Text style={styles.sectionTitle}>Explore As</Text>
                    <View style={styles.segmentRow}>
                        <Pressable
                            style={[styles.segment, activeView === 'kids' && styles.segmentActive]}
                            onPress={() => handleToggleAppView('kids')}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: activeView === 'kids' }}
                        >
                            <Text style={{ fontSize: 18 }}>🌎</Text>
                            <Text style={[styles.segmentLabel, activeView === 'kids' && styles.segmentLabelActive]}>Explorer World</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.segment, activeView === 'classic' && styles.segmentActive]}
                            onPress={() => handleToggleAppView('classic')}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: activeView === 'classic' }}
                        >
                            <Text style={{ fontSize: 18 }}>🥾</Text>
                            <Text style={[styles.segmentLabel, activeView === 'classic' && styles.segmentLabelActive]}>Classic Trail</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.xl }}>
                    <Text style={styles.sectionTitle}>My Classes</Text>
                    <KidsCard>
                        {membershipsLoading ? (
                            <ActivityIndicator color={kidsColors.grass} />
                        ) : memberships.length === 0 ? (
                            <Text style={styles.mutedText}>You haven't joined a class yet.</Text>
                        ) : (
                            memberships.map((m) => (
                                <View key={m.id} style={styles.classRow}>
                                    <Text style={styles.className} numberOfLines={1}>🏫 {m.className}</Text>
                                    <Pressable onPress={() => handleLeave(m.id, m.className)} accessibilityRole="button" accessibilityLabel={`Leave ${m.className}`}>
                                        <Text style={styles.leaveLink}>Leave</Text>
                                    </Pressable>
                                </View>
                            ))
                        )}

                        <View style={styles.joinRow}>
                            <TextInput
                                value={joinCode}
                                onChangeText={setJoinCode}
                                placeholder="Class Code"
                                placeholderTextColor={kidsColors.subink}
                                autoCapitalize="characters"
                                style={styles.joinInput}
                            />
                            <KidsMiniButton label={joining ? '...' : 'Join'} variant="grass" onPress={handleJoin} style={{ flex: 0, minWidth: 84 }} />
                        </View>
                    </KidsCard>
                </View>

                <View style={{ paddingHorizontal: kidsSpacing.lg, marginTop: kidsSpacing.xl }}>
                    <KidsButton label="Sign Out" icon="👋" variant="berry" onPress={() => void signOutAndRedirect(router)} />
                </View>
            </ScrollView>

            <Modal visible={editOpen} animationType="fade" transparent onRequestClose={() => setEditOpen(false)}>
                <ModalBackdrop style={{ alignItems: 'center', justifyContent: 'center' }} onPress={() => setEditOpen(false)}>
                    <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
                        <Text style={sheetStyles.title}>Edit My Profile</Text>
                        <View style={styles.avatarRing}>
                            <Image source={{ uri: avatarUrlForSeed(seedDraft) }} style={styles.avatar} contentFit="contain" />
                        </View>
                        <KidsMiniButton label="Surprise Me!" icon="🎲" variant="sky" onPress={rerollAvatar} style={{ flex: 0, marginTop: kidsSpacing.sm, marginBottom: kidsSpacing.md }} />
                        <TextInput
                            value={nameDraft}
                            onChangeText={setNameDraft}
                            placeholder="Your name"
                            placeholderTextColor={kidsColors.subink}
                            style={sheetStyles.input}
                            maxLength={24}
                        />
                        <View style={{ flexDirection: 'row', gap: kidsSpacing.sm, marginTop: kidsSpacing.lg, width: '100%' }}>
                            <KidsMiniButton label="Cancel" variant="sky" onPress={() => setEditOpen(false)} />
                            <KidsMiniButton label={saving ? 'Saving...' : 'Save'} variant="grass" onPress={saveProfile} />
                        </View>
                    </Pressable>
                </ModalBackdrop>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    avatarRing: {
        width: 108,
        height: 108,
        borderRadius: 54,
        backgroundColor: kidsColors.surface,
        borderWidth: 5,
        borderColor: kidsColors.sun,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatar: { width: '82%', height: '82%' },
    editBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: kidsColors.grass,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: kidsColors.bg,
    },
    name: { fontFamily: kidsFonts.display, fontSize: 22, color: kidsColors.ink, marginTop: kidsSpacing.md, marginBottom: kidsSpacing.sm },
    sectionTitle: { fontFamily: kidsFonts.display, fontSize: 16, color: kidsColors.ink, marginBottom: kidsSpacing.sm },
    segmentRow: { flexDirection: 'row', backgroundColor: kidsColors.surface, borderRadius: kidsRadius.pill, borderWidth: 3, borderColor: kidsColors.cardBorder, padding: 4, gap: 4 },
    segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: kidsRadius.pill },
    segmentActive: { backgroundColor: kidsColors.grass },
    segmentLabel: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.subink },
    segmentLabelActive: { color: kidsColors.white },
    mutedText: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.subink, textAlign: 'center', paddingVertical: kidsSpacing.sm },
    classRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: kidsSpacing.sm, borderBottomWidth: 1, borderBottomColor: kidsColors.cardBorder },
    className: { flex: 1, fontFamily: kidsFonts.body, fontSize: 14, color: kidsColors.ink, marginRight: kidsSpacing.sm },
    leaveLink: { fontFamily: kidsFonts.bodyBold, fontSize: 12, color: kidsColors.berry },
    joinRow: { flexDirection: 'row', gap: kidsSpacing.sm, marginTop: kidsSpacing.md },
    joinInput: {
        flex: 1,
        backgroundColor: kidsColors.bg,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
        borderRadius: kidsRadius.pill,
        paddingHorizontal: kidsSpacing.md,
        fontFamily: kidsFonts.body,
        fontSize: 14,
        color: kidsColors.ink,
    },
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
        alignItems: 'center',
    },
    title: { fontFamily: kidsFonts.display, fontSize: 18, color: kidsColors.ink, marginBottom: kidsSpacing.md },
    input: {
        width: '100%',
        backgroundColor: kidsColors.bg,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
        borderRadius: kidsRadius.md,
        paddingHorizontal: kidsSpacing.md,
        paddingVertical: 10,
        fontFamily: kidsFonts.body,
        fontSize: 15,
        color: kidsColors.ink,
        textAlign: 'center',
    },
});
