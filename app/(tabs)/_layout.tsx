// app/(tabs)/_layout.tsx
// Bottom tab navigator for the STUDENT ("classic") view: Dashboard,
// Fitness, Leaderboard, Passport, Account. This is the main app experience
// for regular students, but it's also reused as a "preview" mode for
// teachers/OKAGE staff/Site Administrators who want to see what students
// see. District Administrators don't preview -- see lib/access.ts.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../commonStyles';
import OnboardingTour from '../../components/OnboardingTour';
import TourTarget from '../../components/tour/TourTarget';
import { useResponsive } from '../../hooks/useResponsive';
import { supabase } from '../../utils/supabase';

export default function TabLayout() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    // On a wide browser window (Chromebook/laptop), the phone-shaped bottom
    // tab layout is kept -- same tabs, same look -- but capped to a
    // comfortable width and centered instead of stretching the tab bar and
    // every screen's content edge-to-edge across the window.
    const { isWideWeb } = useResponsive(1100);

    // Whether the current user is a teacher/okage/site_admin who is
    // actively previewing the student ("classic") view.
    const [isTeacherPreviewing, setIsTeacherPreviewing] = useState(false);
    // Remembers which "real" role this previewing user actually has, so
    // the "return to ___ view" banner and button know exactly where to
    // send them back. Defaults to 'teacher' but gets corrected to 'okage'
    // or 'site_admin' if that's what the loaded profile turns out to be.
    const [previewingRole, setPreviewingRole] = useState<'teacher' | 'okage' | 'site_admin'>('teacher');
    const [switchingBack, setSwitchingBack] = useState(false);
    // Whether checkViewMode below has resolved at least once -- see its
    // `finally` block.
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
                    const isInClassicView = profile.active_view === 'classic';

                    // If this user is an okage staff member or a site
                    // admin, the banner should name that role; otherwise
                    // it's a teacher, so "return to Teacher view".
                    setPreviewingRole(isOkage ? 'okage' : isSiteAdmin ? 'site_admin' : 'teacher');

                    // Show the preview banner only when the account is
                    // actually a teacher, okage, or site_admin role (not a
                    // genuine student) AND they've explicitly switched
                    // their active_view to 'classic' to preview the
                    // student experience.
                    setIsTeacherPreviewing((isTeacher || isOkage || isSiteAdmin) && isInClassicView);

                    // Defensive redirects: if a teacher/okage/site_admin
                    // user's active_view somehow says they should be on
                    // THEIR OWN tabs (not previewing anything) but they've
                    // still landed here on the student tabs, bounce them
                    // back to where they actually belong. This can happen,
                    // for example, if a stale link or back-navigation puts
                    // them on the wrong screen.
                    if (isTeacher && profile.active_view === 'teacher') {
                        router.replace('/(teacher-tabs)/' as any);
                    } else if (isOkage && profile.active_view === 'okage') {
                        router.replace('/(okage-tabs)/' as any);
                    } else if (isSiteAdmin && profile.active_view === 'site_admin') {
                        router.replace('/(site-admin-tabs)/' as any);
                    }
                    // Note: a genuine student (role isn't 'teacher',
                    // 'okage', or 'site_admin') simply falls through here
                    // with no redirect, since this IS their home tab group.
                }
            } catch (error) {
                console.error("Error checking preview mode status:", error);
            } finally {
                // Gates the onboarding tour below: it should never flash on
                // screen for the split second before we know whether this
                // viewer is a genuine student or a teacher/okage/site_admin
                // previewing the student view.
                if (isMounted) setRoleChecked(true);
            }
        }

        checkViewMode();

        return () => {
            isMounted = false;
        };
    }, [router]);

    // Tapping the orange preview banner: switch active_view back to this
    // user's real role and navigate them there.
    const handleReturnToTeacherView = async () => {
        if (switchingBack) return;
        setSwitchingBack(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");

            // Pick the correct target based on which role this user
            // actually is.
            const targetView = previewingRole;

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', user.id);

            if (error) throw error;

            setIsTeacherPreviewing(false);
            const destination =
                previewingRole === 'okage' ? '/(okage-tabs)/' : previewingRole === 'site_admin' ? '/(site-admin-tabs)/' : '/(teacher-tabs)/';
            router.replace(destination as any);
        } catch (error) {
            console.error("Failed to return to previous view:", error);
            alert("Could not switch back. Please try again.");
        } finally {
            setSwitchingBack(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Only ever shown to a genuine student -- never to a
                teacher/okage/site_admin previewing this view (see
                `active` below), and never before that check has resolved
                (see `ready`). */}
            <OnboardingTour tourId="student" active={!isTeacherPreviewing} ready={roleChecked} />

            {/* Dynamic Banner: Pushed down safely past the notch/Dynamic Island */}
            {isTeacherPreviewing && (
                // theme.accent (not the marketing site's brighter
                // '#DE9027' hero hue) -- the deepened, AA-verified value
                // this app's own light theme already uses everywhere else
                // for "this needs attention" accents.
                <View style={{ backgroundColor: theme.accent, paddingTop: insets.top }}>
                    <TouchableOpacity
                        style={styles.banner}
                        onPress={handleReturnToTeacherView}
                        disabled={switchingBack}
                    >
                        {switchingBack ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            // The banner text itself dynamically names the
                            // correct role to return to, using the same
                            // ternary logic seen elsewhere in this file.
                            <Text style={styles.bannerText}>
                                Previewing as Student — Tap to Return to {previewingRole === 'okage' ? 'OKAGE' : previewingRole === 'site_admin' ? 'Site Admin' : 'Teacher'} View
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* Content view sets top padding ONLY if the banner isn't occupying that space */}
            <View style={[styles.contentContainer, { paddingTop: isTeacherPreviewing ? 0 : insets.top, alignItems: isWideWeb ? 'center' : 'stretch' }]}>
              <View style={{ flex: 1, width: '100%', maxWidth: isWideWeb ? 1100 : undefined }}>
                <Tabs
                    screenOptions={{
                        headerShown: false,
                        tabBarActiveTintColor: theme.accent,
                        tabBarInactiveTintColor: theme.subtext,
                        tabBarStyle: {
                            backgroundColor: theme.surface,
                            borderTopColor: theme.border,
                        },
                    }}
                >
                    {/* Five tabs, each matching a file in this same folder:
                        dashboard.tsx, fitness.tsx, leaderboard.tsx,
                        passport.tsx, student-account.tsx. */}
                    <Tabs.Screen
                        name="dashboard"
                        options={{
                            title: 'Dashboard',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="fitness"
                        options={{
                            title: 'Fitness',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? 'barbell-sharp' : 'barbell-outline'} color={color} size={24} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="leaderboard"
                        options={{
                            title: 'Leaderboard',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? 'trophy-sharp' : 'trophy-outline'} color={color} size={24} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="passport"
                        options={{
                            title: 'Passport',
                            tabBarIcon: ({ color, focused }) => (
                                <TourTarget id="student.passportTab">
                                    <Ionicons name={focused ? 'journal-sharp' : 'journal-outline'} color={color} size={24} />
                                </TourTarget>
                            )
                        }}
                    />
                    <Tabs.Screen
                        name="student-account"
                        options={{
                            title: 'Account',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? 'person-circle-sharp' : 'person-circle-outline'} color={color} size={24} />
                            ),
                        }}
                    />
                </Tabs>
              </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    contentContainer: {
        flex: 1,
    },
    banner: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        zIndex: 999,
    },
    bannerText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
