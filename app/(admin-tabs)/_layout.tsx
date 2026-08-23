// app/(admin-tabs)/_layout.tsx
// Bottom tab navigator for the District Admin shell — the second, separate
// portal for principals/superintendents (signup.tsx's "K-12 Principal or
// District Admin" educator sub-type, app_role = 'admin'), distinct from the
// Classes/Curriculum/Reports/Account teacher portal in app/(teacher-tabs).
// 4 visible tabs — Overview (district-wide KPIs), Schools (school → class
// drill-down, never a per-student roster), Reports (the single PDF export
// this shell has, unlike teacher Reports' 3-tab, PDF-per-class model), and
// Account. `index` is a 5th route that exists only to resolve the bare
// `/(admin-tabs)` path used by lib/access.ts and app/_layout.tsx's
// post-login redirect.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../commonStyles';
import OnboardingTour from '../../components/OnboardingTour';
import TourTarget from '../../components/tour/TourTarget';
import { useResponsive } from '../../hooks/useResponsive';
import { resolveAppShellPath } from '../../lib/access';
import { supabase } from '../../utils/supabase';

export default function AdminTabLayout() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    // See app/(teacher-tabs)/_layout.tsx for why this exists: caps + centers
    // the tab bar and screen content on wide web viewports instead of
    // stretching them edge-to-edge.
    const { isWideWeb } = useResponsive(1100);

    // Access guard, same pattern and same reason as
    // app/(teacher-tabs)/_layout.tsx: without this, a stale session, a
    // direct URL, or browser back/forward into this route would render the
    // full district portal for anyone, not just a real district admin.
    // `checked` gates the real UI behind a spinner until resolveAppShellPath
    // has confirmed the viewer actually belongs here.
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function checkAccess() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!isMounted) return;
                if (!user) {
                    router.replace('/' as any);
                    return;
                }

                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('role, app_role, active_view')
                    .eq('id', user.id)
                    .single();

                if (!isMounted) return;
                if (error || !profile) {
                    router.replace('/' as any);
                    return;
                }

                const shellPath = resolveAppShellPath(profile);
                if (!shellPath.startsWith('/(admin-tabs)')) {
                    router.replace(shellPath as any);
                    return;
                }

                setChecked(true);
            } catch (err) {
                console.error('Error checking district admin access:', err);
                if (isMounted) router.replace('/' as any);
            }
        }

        checkAccess();

        return () => {
            isMounted = false;
        };
    }, [router]);

    if (!checked) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* No preview-mode concept in this shell -- only District
                Admins land here -- so `active` stays at its default of
                true. */}
            <OnboardingTour tourId="admin" ready={checked} />
            <View style={[styles.contentContainer, { paddingTop: insets.top, alignItems: isWideWeb ? 'center' : 'stretch' }]}>
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
                    {/* href: null keeps this route resolvable (the bare
                        `/(admin-tabs)` path needs an `index` route to land
                        on) without showing it as its own tab. */}
                    <Tabs.Screen name="index" options={{ href: null }} />
                    <Tabs.Screen
                        name="overview"
                        options={{
                            title: 'Overview',
                            tabBarIcon: ({ color, focused }) => (
                                <TourTarget id="admin.overviewTab">
                                    <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} color={color} size={24} />
                                </TourTarget>
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="schools"
                        options={{
                            title: 'Schools',
                            tabBarIcon: ({ color, focused }) => (
                                <TourTarget id="admin.schoolsTab">
                                    <Ionicons name={focused ? 'business' : 'business-outline'} color={color} size={24} />
                                </TourTarget>
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="reports"
                        options={{
                            title: 'Reports',
                            tabBarIcon: ({ color, focused }) => (
                                <TourTarget id="admin.reportsTab">
                                    <Ionicons name={focused ? 'documents-sharp' : 'documents-outline'} color={color} size={24} />
                                </TourTarget>
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="admin-account"
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
    container: { flex: 1 },
    contentContainer: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
