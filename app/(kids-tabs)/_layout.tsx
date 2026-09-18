// app/(kids-tabs)/_layout.tsx
// Bottom tab navigator for the cartoony ELEMENTARY student experience --
// same five destinations as `(tabs)/_layout.tsx` (Dashboard, Fitness,
// Leaderboard, Passport, Account), reached today via a student's own
// active_view toggle (see student-account.tsx's "Try the Explorer World"
// switch) or a teacher/okage/site_admin/admin previewing it, and
// eventually the shell a self-reported grade routes a young student into
// automatically (see lib/access.ts's 'kids' AppView). Mirrors
// `(tabs)/_layout.tsx`'s role/view detection and "return to my real view"
// banner pattern one level deeper.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OnboardingTour from '../../components/OnboardingTour';
import TourTarget from '../../components/tour/TourTarget';
import { useResponsive } from '../../hooks/useResponsive';
import { kidsColors, kidsFontAssets, kidsFonts, kidsRadius } from '../../styles/kidsTheme';
import { supabase } from '../../utils/supabase';

function KidsTabIcon({ name, focused }: { name: keyof typeof Ionicons.glyphMap; focused: boolean }) {
    return (
        <View style={[tabIconStyles.bubble, focused && tabIconStyles.bubbleFocused]}>
            <Ionicons name={name} size={22} color={focused ? kidsColors.white : kidsColors.sky} />
        </View>
    );
}

const tabIconStyles = StyleSheet.create({
    bubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bubbleFocused: {
        backgroundColor: kidsColors.grass,
    },
});

export default function KidsTabLayout() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { isWideWeb } = useResponsive(1100);

    const [fontsLoaded] = useFonts(kidsFontAssets);

    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewingRole, setPreviewingRole] = useState<'teacher' | 'okage' | 'site_admin' | 'admin'>('teacher');
    const [switchingBack, setSwitchingBack] = useState(false);
    const [roleChecked, setRoleChecked] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function checkViewMode() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('role, active_view')
                    .eq('id', user.id)
                    .single();

                if (error) throw error;

                if (isMounted && profile) {
                    const isTeacher = profile.role === 'teacher';
                    const isOkage = profile.role === 'okage';
                    const isSiteAdmin = profile.role === 'site_admin';
                    const isAdmin = profile.role === 'admin';
                    const isStudent = profile.role === 'student' || !profile.role;
                    const isInKidsView = profile.active_view === 'kids';

                    setPreviewingRole(isOkage ? 'okage' : isSiteAdmin ? 'site_admin' : isAdmin ? 'admin' : 'teacher');
                    setIsPreviewing((isTeacher || isOkage || isSiteAdmin || isAdmin) && isInKidsView);

                    // A student whose active_view isn't 'kids' anymore
                    // (they switched back to the standard experience
                    // elsewhere, e.g. from another tab) shouldn't be stuck
                    // on this shell.
                    if (isStudent && profile.active_view !== 'kids') {
                        router.replace('/(tabs)/dashboard' as any);
                    } else if (isTeacher && profile.active_view === 'teacher') {
                        router.replace('/(teacher-tabs)/' as any);
                    } else if (isOkage && profile.active_view === 'okage') {
                        router.replace('/(okage-tabs)/' as any);
                    } else if (isSiteAdmin && profile.active_view === 'site_admin') {
                        router.replace('/(site-admin-tabs)/' as any);
                    } else if (isAdmin && profile.active_view === 'admin') {
                        router.replace('/(admin-tabs)/' as any);
                    }
                }
            } catch (error) {
                console.error('Error checking kids-view mode status:', error);
            } finally {
                if (isMounted) setRoleChecked(true);
            }
        }

        checkViewMode();

        return () => {
            isMounted = false;
        };
    }, [router]);

    const handleReturnToRoleView = async () => {
        if (switchingBack) return;
        setSwitchingBack(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            const targetView = previewingRole;

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', user.id);

            if (error) throw error;

            setIsPreviewing(false);
            const destination =
                previewingRole === 'okage' ? '/(okage-tabs)/'
                    : previewingRole === 'site_admin' ? '/(site-admin-tabs)/'
                    : previewingRole === 'admin' ? '/(admin-tabs)/'
                    : '/(teacher-tabs)/';
            router.replace(destination as any);
        } catch (error) {
            console.error('Failed to return to previous view:', error);
            alert('Could not switch back. Please try again.');
        } finally {
            setSwitchingBack(false);
        }
    };

    if (!fontsLoaded || !roleChecked) {
        return (
            <View style={[styles.container, styles.loadingContainer, { backgroundColor: kidsColors.bg }]}>
                <ActivityIndicator size="large" color={kidsColors.grass} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: kidsColors.bg }]}>
            <OnboardingTour tourId="student" active={!isPreviewing} ready={roleChecked} />

            {isPreviewing && (
                <View style={{ backgroundColor: kidsColors.grassDeep, paddingTop: insets.top }}>
                    <TouchableOpacity style={styles.banner} onPress={handleReturnToRoleView} disabled={switchingBack}>
                        {switchingBack ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Text style={styles.bannerText}>
                                🌎 Previewing the Explorer World — Tap to Return to {previewingRole === 'okage' ? 'OKAGE' : previewingRole === 'site_admin' ? 'Site Admin' : previewingRole === 'admin' ? 'District Admin' : 'Teacher'} View
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            <View style={[styles.contentContainer, { paddingTop: isPreviewing ? 0 : insets.top, alignItems: isWideWeb ? 'center' : 'stretch' }]}>
                <View style={{ flex: 1, width: '100%', maxWidth: isWideWeb ? 1100 : undefined }}>
                    <Tabs
                        screenOptions={{
                            headerShown: false,
                            tabBarShowLabel: true,
                            tabBarActiveTintColor: kidsColors.grass,
                            tabBarInactiveTintColor: kidsColors.subink,
                            tabBarLabelStyle: { fontFamily: kidsFonts.display, fontSize: 11, marginBottom: 4 },
                            tabBarStyle: {
                                backgroundColor: kidsColors.surface,
                                borderTopWidth: 3,
                                borderTopColor: kidsColors.cardBorder,
                                height: 74,
                                paddingTop: 8,
                            },
                        }}
                    >
                        <Tabs.Screen
                            name="dashboard"
                            options={{
                                title: 'Home',
                                tabBarIcon: ({ focused }) => <KidsTabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />,
                            }}
                        />
                        <Tabs.Screen
                            name="fitness"
                            options={{
                                title: 'My Walk',
                                tabBarIcon: ({ focused }) => <KidsTabIcon name={focused ? 'footsteps' : 'footsteps-outline'} focused={focused} />,
                            }}
                        />
                        <Tabs.Screen
                            name="leaderboard"
                            options={{
                                title: 'Ranks',
                                tabBarIcon: ({ focused }) => <KidsTabIcon name={focused ? 'trophy' : 'trophy-outline'} focused={focused} />,
                            }}
                        />
                        <Tabs.Screen
                            name="passport"
                            options={{
                                title: 'Badges',
                                tabBarIcon: ({ focused }) => (
                                    <TourTarget id="student.passportTab">
                                        <KidsTabIcon name={focused ? 'ribbon' : 'ribbon-outline'} focused={focused} />
                                    </TourTarget>
                                ),
                            }}
                        />
                        <Tabs.Screen
                            name="student-account"
                            options={{
                                title: 'Me',
                                tabBarIcon: ({ focused }) => <KidsTabIcon name={focused ? 'person-circle' : 'person-circle-outline'} focused={focused} />,
                            }}
                        />
                    </Tabs>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { alignItems: 'center', justifyContent: 'center' },
    contentContainer: { flex: 1 },
    banner: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        zIndex: 999,
        borderBottomLeftRadius: kidsRadius.md,
        borderBottomRightRadius: kidsRadius.md,
    },
    bannerText: {
        color: '#FFF',
        fontFamily: kidsFonts.display,
        fontSize: 13,
    },
});
