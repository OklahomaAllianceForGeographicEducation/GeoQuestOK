// app/(tabs)/_layout.tsx
// Bottom tab navigator for the STUDENT ("classic") view: Dashboard,
// Fitness, Leaderboard, Passport, Account. This is the main app experience
// for regular students, but it's also reused as a "preview" mode for
// teachers/OKAGE staff who want to see what students see.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../commonStyles';
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

    // Whether the current user is a teacher/okage who is actively
    // previewing the student ("classic") view.
    const [isTeacherPreviewing, setIsTeacherPreviewing] = useState(false);
    // Remembers which "real" role this previewing user actually has, so
    // the "return to ___ view" banner and button know exactly where to
    // send them back. Defaults to 'teacher' but gets corrected to 'okage'
    // if that's what the loaded profile turns out to be.
    const [previewingRole, setPreviewingRole] = useState<'teacher' | 'okage'>('teacher');
    const [switchingBack, setSwitchingBack] = useState(false);

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
                    const isInClassicView = profile.active_view === 'classic';

                    // If this user is an okage staff member, the banner
                    // should say "return to OKAGE view"; otherwise it's a
                    // teacher, so "return to Teacher view".
                    setPreviewingRole(isOkage ? 'okage' : 'teacher');

                    // Show the preview banner only when the account is
                    // actually a teacher or okage role (not a genuine
                    // student) AND they've explicitly switched their
                    // active_view to 'classic' to preview the student
                    // experience.
                    setIsTeacherPreviewing((isTeacher || isOkage) && isInClassicView);

                    // Defensive redirects: if a teacher or okage user's
                    // active_view somehow says they should be on THEIR OWN
                    // tabs (not previewing anything) but they've still
                    // landed here on the student tabs, bounce them back to
                    // where they actually belong. This can happen, for
                    // example, if a stale link or back-navigation puts them
                    // on the wrong screen.
                    if (isTeacher && profile.active_view === 'teacher') {
                        router.replace('/(teacher-tabs)/' as any);
                    } else if (isOkage && profile.active_view === 'okage') {
                        router.replace('/(okage-tabs)/' as any);
                    }
                    // Note: a genuine student (role isn't 'teacher' or
                    // 'okage') simply falls through here with no redirect,
                    // since this IS their home tab group.
                }
            } catch (error) {
                console.error("Error checking preview mode status:", error);
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
            const targetView = previewingRole === 'okage' ? 'okage' : 'teacher';

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', user.id);

            if (error) throw error;

            setIsTeacherPreviewing(false);
            router.replace((previewingRole === 'okage' ? '/(okage-tabs)/' : '/(teacher-tabs)/') as any);
        } catch (error) {
            console.error("Failed to return to previous view:", error);
            alert("Could not switch back. Please try again.");
        } finally {
            setSwitchingBack(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Dynamic Banner: Pushed down safely past the notch/Dynamic Island */}
            {isTeacherPreviewing && (
                <View style={{ backgroundColor: '#DE9027', paddingTop: insets.top }}>
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
                                Previewing as Student — Tap to Return to {previewingRole === 'okage' ? 'OKAGE' : 'Teacher'} View
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
                                <Ionicons name={focused ? 'journal-sharp' : 'journal-outline'} color={color} size={24} />
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
