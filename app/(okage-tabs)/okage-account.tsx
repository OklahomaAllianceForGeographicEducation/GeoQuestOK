// app/(okage-tabs)/okage-account.tsx
// The account/settings tab for OKAGE staff — shows the logged-in user's
// name (editable), lets them preview the app as a teacher or student, and
// lets them sign out.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { colors, Theme } from '../../commonStyles';
import { signOutAndRedirect } from '../../lib/auth';
import { confirmAlert } from '../../lib/confirmAlert';
import { confirmDeleteAccount } from '../../lib/deleteAccount';
import { requestTourReplay } from '../../lib/onboarding';
import { supabase } from '../../utils/supabase';

// react-native-web's Alert.alert() is a complete no-op (see
// lib/confirmAlert.ts) — a plain info/error Alert.alert(...) call here
// would silently do nothing on web. Same pattern used across the other
// OKAGE tabs and app/(teacher-tabs)/curriculum.tsx. confirmAlert (used
// below for sign-out) is a separate, already-web-safe helper for the
// two-button Cancel/Action pattern.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

// Shape of the subset of "profiles" table fields this screen cares about.
type Profile = {
    display_name: string;
    username: string;
    // Which view this OKAGE user is currently previewing as — read by
    // (okage-tabs)/_layout.tsx and (teacher-tabs)/_layout.tsx to decide
    // whether to redirect/show the preview banner.
    active_view: string;
};

export default function OkageAccountScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    // The logged-in user's Supabase auth id, cached in state so later
    // update calls don't need to re-fetch it each time.
    const [userId, setUserId] = useState<string | null>(null);
    // The profile data as last loaded/saved from the database.
    const [profile, setProfile] = useState<Profile | null>(null);
    const [deletingAccount, setDeletingAccount] = useState(false);
    // The text currently in the "Your Name" input box — kept separate from
    // `profile.display_name` so the user can edit freely without every
    // keystroke being treated as "saved."
    const [nameDraft, setNameDraft] = useState('');
    // Whether the "Save Name" request is in flight.
    const [savingName, setSavingName] = useState(false);

    useEffect(() => {
        void loadProfile();
    }, []);

    async function loadProfile() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            const { data, error } = await supabase
                .from('profiles')
                .select('display_name, username, active_view')
                .eq('id', user.id)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                setProfile(data as Profile);
                // Pre-fill the editable name field with whatever name is
                // already saved (preferring display_name, falling back to
                // username, or blank if neither exists).
                setNameDraft(data.display_name || data.username || '');
            }
        } catch (err: any) {
            showAlert('Load Error', err.message || 'Could not load your profile.');
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveName() {
        // Guard against saving with no known user, or an empty/whitespace-
        // only name.
        if (!userId || !nameDraft.trim()) return;
        setSavingName(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ display_name: nameDraft.trim() })
                .eq('id', userId);
            if (error) throw error;
            // Update local state to reflect the save immediately, without
            // waiting for a fresh fetch. `(prev) => (prev ? {...} : prev)`
            // is a defensive pattern: only spread/update `prev` if it's
            // not null; if profile somehow hasn't loaded yet, leave it as-is.
            setProfile((prev) => (prev ? { ...prev, display_name: nameDraft.trim() } : prev));
            showAlert('Saved', 'Your name has been updated.');
        } catch (err: any) {
            showAlert('Save Failed', err.message || 'Could not save your name.');
        } finally {
            setSavingName(false);
        }
    }

    // Switches this OKAGE user's "active_view" preference and navigates
    // them into that preview. `targetView` is restricted by TypeScript to
    // only 'classic' (student view) or 'teacher' — the two views OKAGE
    // staff are allowed to preview.
    async function handleToggleAppView(targetView: 'classic' | 'teacher') {
        if (!userId) return;
        // Remember what the view was before this change, in case the
        // database update fails and we need to roll the local UI back.
        const previousView = profile?.active_view;
        try {
            // "Optimistic update": update the local UI immediately, before
            // waiting for the database confirmation, so the interface
            // feels instantly responsive rather than waiting on a network
            // round-trip.
            setProfile((prev) => (prev ? { ...prev, active_view: targetView } : prev));

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', userId);

            if (error) throw error;

            // Navigate to the actual preview screen: student dashboard for
            // 'classic', or the teacher tab group otherwise.
            router.replace((targetView === 'classic' ? '/(tabs)/dashboard' : '/(teacher-tabs)/') as any);
        } catch (err: any) {
            // The optimistic update above was wrong (the save failed) —
            // revert the local state back to whatever it was before,
            // falling back to the current profile's own value if
            // previousView was somehow undefined.
            setProfile((prev) => (prev ? { ...prev, active_view: previousView || prev.active_view } : prev));
            showAlert('View Switch Failed', err.message || 'Could not switch views.');
        }
    }

    function handleSignOut() {
        // Alert.alert's third argument is an array of buttons. Here there
        // are two: "Cancel" (dismisses the dialog, does nothing) and
        // "Log Out" (destructive style — typically renders in red on iOS
        // to signal a serious/irreversible action — which actually
        // performs the sign-out).
        confirmAlert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log Out',
                style: 'destructive',
                onPress: () => void signOutAndRedirect(router),
            },
        ]);
    }

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* Top "hero" section: avatar icon + welcome message. */}
                <View style={styles.heroSection}>
                    <View style={[styles.avatarCircle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        {/* A generic person icon standing in for a real
                            profile photo, since this app doesn't appear to
                            support custom avatar images. */}
                        <Ionicons name="person-circle-outline" size={54} color={theme.accent} />
                    </View>
                    <Text style={[styles.greeting, { color: theme.text }]} accessibilityRole="header">
                        Welcome back, {profile?.display_name || profile?.username || 'OKAGE Staff'}
                    </Text>
                    <Text style={[styles.subtext, { color: theme.subtext }]}>OKAGE Content Team</Text>
                </View>

                {/* Editable name card. */}
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Your Name</Text>
                    <TextInput
                        style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                        value={nameDraft}
                        onChangeText={setNameDraft}
                        placeholder="Display name"
                        placeholderTextColor={theme.subtext}
                    />
                    <Pressable
                        style={[styles.saveButtonSmall, { borderColor: theme.accent }]}
                        disabled={savingName}
                        // Wrapping in `() => void handleSaveName()` calls
                        // the async function but explicitly discards its
                        // returned Promise (satisfying linters that would
                        // otherwise warn about "a Promise passed where void
                        // was expected" for an onPress handler).
                        onPress={() => void handleSaveName()}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: savingName, busy: savingName }}
                    >
                        {savingName ? (
                            <ActivityIndicator size="small" color={theme.accent} />
                        ) : (
                            <Text style={[styles.saveButtonSmallText, { color: theme.accent }]}>Save Name</Text>
                        )}
                    </Pressable>
                </View>

                {/* View-switching card: two side-by-side toggle buttons to
                    preview as Teacher or as Student. */}
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Preview Your Edits</Text>
                    <Text style={[styles.cardDescription, { color: theme.subtext }]}>
                        See your content changes the way teachers and students will see them.
                    </Text>
                    <View style={styles.segmentedBar}>
                        <Pressable
                            style={[styles.segmentToggle, { borderColor: theme.border }]}
                            onPress={() => void handleToggleAppView('teacher')}
                            accessibilityRole="button"
                        >
                            <Ionicons name="briefcase-outline" size={16} color={theme.accent} />
                            <Text style={[styles.segmentLabel, { color: theme.text }]}>View as Teacher</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.segmentToggle, { borderColor: theme.border }]}
                            onPress={() => void handleToggleAppView('classic')}
                            accessibilityRole="button"
                        >
                            <Ionicons name="walk-outline" size={16} color={theme.accent} />
                            <Text style={[styles.segmentLabel, { color: theme.text }]}>View as Student</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Previously a full-width Button with a custom #FF3B30
                    background -- the same accidental-tap risk (equal
                    visual weight to the primary actions above it) and the
                    same failing contrast (3.55:1 as white-on-fill text,
                    confirmed live) already fixed on the student and
                    teacher account screens' equivalent. This screen was
                    unreachable until an OKAGE test account existed, so it
                    missed that pass; same fix applied now: a small
                    outlined pill using the shared theme.error token
                    (#D70015, 4.72:1) instead. */}
                <Pressable
                    onPress={() => requestTourReplay('okage')}
                    style={{ alignSelf: 'center', marginTop: 6, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.accent }}
                    accessibilityRole="button"
                >
                    <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Replay Tour</Text>
                </Pressable>

                <Pressable
                    onPress={handleSignOut}
                    style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.error }}
                    accessibilityRole="button"
                >
                    <Text style={{ color: theme.error, fontWeight: '600', fontSize: 14 }}>Sign Out Account</Text>
                </Pressable>

                {/* Deliberately understated relative to Sign Out --
                    permanent and wipes everything, so it shouldn't be one
                    careless tap away from anything else here. The
                    confirmation dialog carries the actual warning. */}
                <Pressable
                    onPress={() => confirmDeleteAccount(router, setDeletingAccount)}
                    disabled={deletingAccount}
                    style={{ alignSelf: 'center', marginTop: 20, paddingVertical: 13, paddingHorizontal: 18 }}
                    accessibilityRole="button"
                >
                    {deletingAccount ? (
                        <ActivityIndicator color={theme.subtext} size="small" />
                    ) : (
                        <Text style={{ color: theme.subtext, fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' }}>Delete Account</Text>
                    )}
                </Pressable>
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    heroSection: { alignItems: 'center', marginBottom: 24 },
    avatarCircle: {
        width: 84,
        height: 84,
        // Half of 84 = 42, making this a perfect circle (same trick used
        // elsewhere in the app for circular badges/avatars).
        borderRadius: 42,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12
    },
    greeting: { fontSize: 18, fontWeight: '800', fontFamily: 'Georgia', textAlign: 'center' },
    subtext: { fontSize: 12.5, marginTop: 3 },

    card: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
    cardDescription: { fontSize: 12.5, lineHeight: 17, marginBottom: 12 },
    textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },

    saveButtonSmall: {
        // A slightly thicker border (1.5px, a fractional value) than the
        // usual 1px used elsewhere, making this small button's outline a
        // touch more prominent since it has no filled background color.
        borderWidth: 1.5,
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: 'center',
        // By default a flex child stretches to fill the cross-axis width
        // of its parent. alignSelf: 'flex-start' overrides that just for
        // this one element, shrinking it down to only as wide as its
        // content needs (so the button doesn't stretch across the whole
        // card).
        alignSelf: 'flex-start',
        paddingHorizontal: 16
    },
    saveButtonSmallText: { fontSize: 12, fontWeight: '700' },

    segmentedBar: { flexDirection: 'row', gap: 10 },
    segmentToggle: {
        // flex: 1 on both toggle buttons makes them split the segmentedBar
        // row evenly (50/50), like a classic iOS "segmented control."
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12
    },
    segmentLabel: { fontSize: 12.5, fontWeight: '700' },
});
