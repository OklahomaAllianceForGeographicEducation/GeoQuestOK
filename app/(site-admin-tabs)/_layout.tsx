// app/(site-admin-tabs)/_layout.tsx
// Bottom tab navigator for the Site Administrator shell -- a building-level
// principal (signup.tsx's "Site Administrator (Principal)" educator sub-
// type, app_role = 'site_admin'), distinct from the district-wide District
// Administrator portal in app/(admin-tabs). 3 visible tabs -- My School
// (per-student miles + Presidential Fitness Test targets met, grouped by
// class), District (every other school in the district, one summary row
// each -- the same aggregate a teacher sees for schools that aren't their
// own), and Account. `index` is a 4th route that exists only to resolve the
// bare `/(site-admin-tabs)` path used by lib/access.ts and app/_layout.tsx's
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

export default function SiteAdminTabLayout() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    // See app/(teacher-tabs)/_layout.tsx for why this exists: caps + centers
    // the tab bar and screen content on wide web viewports instead of
    // stretching them edge-to-edge.
    const { isWideWeb } = useResponsive(1100);

    // Access guard, same pattern and same reason as app/(admin-tabs)/_layout.tsx:
    // without this, a stale session, a direct URL, or browser back/forward
    // into this route would render the full site-admin portal for anyone,
    // not just a real Site Administrator.
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
                if (!shellPath.startsWith('/(site-admin-tabs)')) {
                    router.replace(shellPath as any);
                    return;
                }

                setChecked(true);
            } catch (err) {
                console.error('Error checking site admin access:', err);
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
            {/* No preview-mode concept in this shell -- only Site Admins
                land here -- so `active` stays at its default of true. */}
            <OnboardingTour tourId="site_admin" ready={checked} />
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
                        `/(site-admin-tabs)` path needs an `index` route to
                        land on) without showing it as its own tab. */}
                    <Tabs.Screen name="index" options={{ href: null }} />
                    <Tabs.Screen
                        name="school"
                        options={{
                            title: 'My School',
                            tabBarIcon: ({ color, focused }) => (
                                <TourTarget id="site_admin.schoolTab">
                                    <Ionicons name={focused ? 'school-sharp' : 'school-outline'} color={color} size={24} />
                                </TourTarget>
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="district"
                        options={{
                            title: 'District',
                            tabBarIcon: ({ color, focused }) => (
                                <TourTarget id="site_admin.districtTab">
                                    <Ionicons name={focused ? 'map' : 'map-outline'} color={color} size={24} />
                                </TourTarget>
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="site-admin-account"
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
