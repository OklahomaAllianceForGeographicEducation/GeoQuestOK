// app/(site-admin-tabs)/site-admin-account.tsx
// Site Administrator's account screen: identity + school/district
// assignment display, a view switcher (Site Admin / Teacher / Student,
// mirroring teacher-account.tsx's Teacher/Classic switcher and
// okage-account.tsx's Teacher/Student one -- lib/access.ts's
// getAllowedTeacherViews returns all three for this role), and sign out.
// District Administrators do NOT get this switcher -- it moved here from
// their account screen.

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, getGlobalStyles, Theme } from '../../commonStyles';
import { confirmAlert } from '../../lib/confirmAlert';
import { signOutAndRedirect } from '../../lib/auth';
import { requestTourReplay } from '../../lib/onboarding';
import { supabase } from '../../utils/supabase';

// react-native-web's Alert.alert() is a complete no-op (see
// lib/confirmAlert.ts) -- a plain info/error Alert.alert(...) call here
// would silently do nothing on web. confirmAlert (used below for sign-out)
// is a separate, already-web-safe helper for the two-button Cancel/Action
// pattern.
function showAlert(title: string, message: string) {
    console.warn(`[ALERT] ${title}: ${message}`);
    if (Platform.OS === 'web') {
        alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

type SiteAdminProfile = {
    display_name: string | null;
    username: string | null;
    email: string | null;
    school_name: string | null;
    school_district_name: string | null;
    active_view: string | null;
};

export default function SiteAdminAccount() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const baseStyles = getGlobalStyles(theme);
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [profile, setProfile] = useState<SiteAdminProfile | null>(null);

    const loadProfile = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            const { data } = await supabase
                .from('profiles')
                .select('display_name, username, school_name, school_district_name, active_view')
                .eq('id', user.id)
                .maybeSingle();

            setProfile({
                display_name: data?.display_name ?? null,
                username: data?.username ?? null,
                email: user.email ?? null,
                school_name: data?.school_name ?? null,
                school_district_name: data?.school_district_name ?? null,
                active_view: data?.active_view ?? null,
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadProfile();
        }, [loadProfile])
    );

    // Switches this admin's active_view and navigates them into that
    // preview -- same optimistic-update pattern as
    // (teacher-tabs)/teacher-account.tsx and (okage-tabs)/okage-account.tsx.
    // Picking "Site Admin" while already there is a harmless no-op: it just
    // re-confirms the value already saved and stays put.
    const handleToggleAppView = async (targetView: 'site_admin' | 'teacher' | 'classic') => {
        if (!userId) return;
        const previousView = profile?.active_view;
        try {
            setProfile((prev) => (prev ? { ...prev, active_view: targetView } : prev));

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', userId);

            if (error) throw error;

            const destination =
                targetView === 'classic' ? '/(tabs)/dashboard' : targetView === 'teacher' ? '/(teacher-tabs)' : '/(site-admin-tabs)';
            router.replace(destination as any);
        } catch (err: any) {
            setProfile((prev) => (prev ? { ...prev, active_view: previousView ?? prev.active_view } : prev));
            showAlert('View Switch Failed', err.message || 'Could not switch views.');
        }
    };

    const handleSignOutAction = () => {
        confirmAlert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => void signOutAndRedirect(router) },
        ]);
    };

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                <View style={baseStyles.profileImageContainer}>
                    <View style={[baseStyles.avatarRing]}>
                        <View style={[styles.iconAvatar, { backgroundColor: theme.surface }]}>
                            <Ionicons name="school" size={44} color={theme.accent} />
                        </View>
                    </View>
                    <Text style={baseStyles.profileGreeting} accessibilityRole="header">
                        {profile?.display_name || profile?.username || 'Site Administrator'}
                    </Text>
                    <Text style={baseStyles.profileSubtext}>Site Administrator</Text>
                </View>

                {/* View Switcher -- preview the Teacher and Student
                    experiences your school actually sees, same pattern as
                    the OKAGE and Teacher account screens. */}
                <View style={[styles.viewSwitcherBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.switcherTitle, { color: theme.text }]} accessibilityRole="header">Active App View</Text>
                    <View style={styles.segmentedBar}>
                        <Pressable
                            style={[styles.segmentToggle, profile?.active_view === 'site_admin' && { backgroundColor: theme.accent }]}
                            onPress={() => void handleToggleAppView('site_admin')}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: profile?.active_view === 'site_admin' }}
                            aria-selected={profile?.active_view === 'site_admin'}
                        >
                            <Ionicons name="school" size={14} color={profile?.active_view === 'site_admin' ? theme.accentText : theme.text} />
                            <Text style={[styles.segmentLabel, profile?.active_view === 'site_admin' ? { color: theme.accentText } : { color: theme.text }]}>Site Admin</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.segmentToggle, profile?.active_view === 'teacher' && { backgroundColor: theme.accent }]}
                            onPress={() => void handleToggleAppView('teacher')}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: profile?.active_view === 'teacher' }}
                            aria-selected={profile?.active_view === 'teacher'}
                        >
                            <Ionicons name="briefcase" size={14} color={profile?.active_view === 'teacher' ? theme.accentText : theme.text} />
                            <Text style={[styles.segmentLabel, profile?.active_view === 'teacher' ? { color: theme.accentText } : { color: theme.text }]}>Teacher</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.segmentToggle, profile?.active_view === 'classic' && { backgroundColor: theme.accent }]}
                            onPress={() => void handleToggleAppView('classic')}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: profile?.active_view === 'classic' }}
                            aria-selected={profile?.active_view === 'classic'}
                        >
                            <Ionicons name="walk" size={14} color={profile?.active_view === 'classic' ? theme.accentText : theme.text} />
                            <Text style={[styles.segmentLabel, profile?.active_view === 'classic' ? { color: theme.accentText } : { color: theme.text }]}>Student</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={baseStyles.AccountMain}>
                    <View style={[baseStyles.card]}>
                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SCHOOL</Text>
                        <Text style={[styles.fieldValue, { color: theme.text }]}>{profile?.school_name || 'Not assigned'}</Text>

                        <View style={[baseStyles.divider, { marginVertical: 14 }]} />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DISTRICT</Text>
                        <Text style={[styles.fieldValue, { color: theme.text }]}>{profile?.school_district_name || 'Not assigned'}</Text>

                        <View style={[baseStyles.divider, { marginVertical: 14 }]} />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>EMAIL</Text>
                        <Text style={[styles.fieldValue, { color: theme.text }]}>{profile?.email || '—'}</Text>
                    </View>

                    <Text style={[styles.helperText, { color: theme.subtext }]}>
                        For your own school you can see each student’s miles walked and Presidential Fitness Test targets met — never a quiz score or activity log. Every other school in your district only ever shows as one aggregate summary.
                    </Text>

                    <Pressable
                        onPress={() => requestTourReplay('site_admin')}
                        style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.accent }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Replay Tour</Text>
                    </Pressable>

                    <Pressable
                        onPress={handleSignOutAction}
                        // paddingVertical 13 clears the 44px touch-target
                        // floor -- same fix already applied to this exact
                        // button on student-account.tsx, teacher-account.tsx,
                        // and admin-account.tsx.
                        style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.error }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.error, fontWeight: '600', fontSize: 14 }}>Sign Out</Text>
                    </Pressable>
                </View>

                <Text style={baseStyles.acknowledgementText}>
                    The GeoQuestOK app is a partnership between the Oklahoma State Department of Education’s
                    Health & Physical Education Department and the Oklahoma Alliance for Geographic Education.
                    This program works to fulfill the “Walk Across Oklahoma” foundation created by Oklahoma House
                    Bill 1647.
                </Text>
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    iconAvatar: { width: 106, height: 106, borderRadius: 53, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
    fieldValue: { fontSize: 16, fontWeight: '600', fontFamily: 'Georgia' },
    helperText: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
    // Matches (teacher-tabs)/teacher-account.tsx's viewSwitcherBox/
    // segmentedBar/segmentToggle/segmentLabel values exactly, just widened
    // to a 3-way row (Site Admin/Teacher/Student) instead of 2.
    viewSwitcherBox: { borderWidth: 1, padding: 14, borderRadius: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 14 },
    switcherTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10, textAlign: 'center' },
    segmentedBar: { flexDirection: 'row', gap: 8 },
    segmentToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.background },
    segmentLabel: { fontSize: 13, fontWeight: '700' },
});
