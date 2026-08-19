// app/(okage-tabs)/_layout.tsx
// Bottom tab navigator for OKAGE staff — the content-editor role. OKAGE staff
// update trail descriptions, lesson guides, and quiz questions without ever
// touching student data directly.
// This "_layout.tsx" file wraps every screen inside the (okage-tabs) folder
// (index.tsx, content.tsx, quizzes.tsx, standards.tsx, reports.tsx,
// okage-account.tsx) and is responsible for rendering the tab bar at the
// bottom of the screen that lets the user switch between them.

// Importing Ionicons directly from its own subpath (rather than the
// combined "@expo/vector-icons" package used elsewhere) — both work, this
// is just a slightly different import style.
import Ionicons from '@expo/vector-icons/Ionicons';

// "Tabs" is Expo Router's built-in bottom-tab-bar navigator component.
import { Tabs, useRouter } from 'expo-router';

import { useEffect, useState } from 'react';

// useColorScheme detects whether the device is currently in light or dark
// mode, so the app can adapt its colors automatically.
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';

// useSafeAreaInsets returns how many pixels of padding are needed on each
// edge of the screen to avoid notches, status bars, and home indicators.
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../commonStyles';
import { useResponsive } from '../../hooks/useResponsive';
import { getResolvedRole, resolveAppShellPath } from '../../lib/access';
import { supabase } from '../../utils/supabase';

export default function OkageTabLayout() {
    const router = useRouter();
    // See app/(tabs)/_layout.tsx for why this exists: caps + centers the
    // tab bar and screen content on wide web viewports instead of
    // stretching them edge-to-edge.
    const { isWideWeb } = useResponsive(1100);

    // insets.top / insets.bottom etc. tell us exactly how much space is
    // reserved by the device's notch, status bar, or home indicator on
    // this specific device.
    const insets = useSafeAreaInsets();

    // useColorScheme() can return 'light', 'dark', or null/undefined (e.g.
    // before the OS setting is known). The `?? 'light'` means "if it's
    // null or undefined, default to 'light'" — the nullish coalescing
    // operator.
    const scheme = useColorScheme() ?? 'light';

    // Look up the right color set (light or dark) using the detected
    // scheme as the key into the colors object — unlike some other screens
    // in this app that hardcode colors.light, this layout actually
    // respects the device's dark mode setting.
    const theme = colors[scheme];

    // Tracks whether we've finished checking if this user should actually
    // be redirected elsewhere (see the useEffect below) before we render
    // the real tab bar.
    const [checked, setChecked] = useState(false);

    // Access guard: this layout must never actually RENDER for anyone
    // whose resolved role isn't 'okage', no matter how they got here (a
    // stale/interrupted sign-out leaving an old session in storage, direct
    // URL entry, browser back/forward into a stale route, etc.) -- and
    // separately, if this OKAGE user is mid-preview (active_view set to
    // 'teacher' or 'classic' from the account tab's toggle) but somehow
    // lands back on an okage-tabs route, send them to the view they were
    // previewing instead.
    //
    // A previous version of this check bailed out (`return`) on a
    // non-okage role WITHOUT redirecting anywhere -- the `finally` block
    // still ran and revealed the real OKAGE tab bar/content regardless.
    // getResolvedRole/resolveAppShellPath (lib/access.ts) are the same
    // helpers the rest of the app uses to decide where a profile belongs,
    // checking both the `role` and `app_role` columns rather than trusting
    // just one.
    useEffect(() => {
        // Guard flag to avoid updating state after this layout has
        // unmounted (same pattern used elsewhere in the app).
        let isMounted = true;

        async function checkViewMode() {
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
                    // Can't confirm this user's role -- don't render the
                    // OKAGE portal on an unverified guess.
                    router.replace('/' as any);
                    return;
                }

                const resolvedRole = getResolvedRole(profile);

                if (resolvedRole !== 'okage') {
                    // Not actually OKAGE staff -- send them to whichever
                    // shell they actually belong in instead of falling
                    // through to render this one.
                    router.replace(resolveAppShellPath(profile) as any);
                    return;
                }

                // 'active_view' is presumably a field the user can toggle
                // from their account settings, letting an okage staff
                // member preview what the app looks like as a teacher or
                // as a regular ("classic") student, without actually
                // changing their real role. If that toggle is set, redirect
                // them out of the okage tabs into the view they chose.
                if (profile.active_view === 'teacher') {
                    router.replace('/(teacher-tabs)/' as any);
                    return;
                }
                if (profile.active_view === 'classic') {
                    router.replace('/(tabs)/dashboard' as any);
                    return;
                }

                // Genuinely OKAGE staff, not previewing anything else --
                // clear to render the real OKAGE tabs.
                setChecked(true);
            } catch (error) {
                console.error("Error checking OKAGE view mode:", error);
                // Unable to verify role due to an unexpected error --
                // same reasoning as the !profile case above, don't render
                // the portal on an unverified guess.
                if (isMounted) router.replace('/' as any);
            }
        }

        checkViewMode();

        return () => {
            isMounted = false;
        };
        // This effect re-runs if `router` ever changes identity (in
        // practice this rarely/never happens with Expo Router, but
        // including it satisfies the "list every value used inside" rule
        // for effects).
    }, [router]);

    // Until we've confirmed this user shouldn't be redirected elsewhere,
    // show a loading spinner instead of briefly flashing the OKAGE tab bar.
    if (!checked) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        // paddingTop: insets.top pushes all tab content down below the
        // status bar/notch so nothing is hidden behind it.
        <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top, alignItems: isWideWeb ? 'center' : 'stretch' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: isWideWeb ? 1100 : undefined }}>
            <Tabs
                screenOptions={{
                    // Hides the default header bar Expo Router would
                    // otherwise put at the top of each tab screen — each
                    // screen manages its own header/title area instead.
                    headerShown: false,
                    // Color used for the icon/label of whichever tab is
                    // currently selected.
                    tabBarActiveTintColor: theme.accent,
                    // Color used for icons/labels of the non-selected tabs.
                    tabBarInactiveTintColor: theme.subtext,
                    tabBarStyle: {
                        backgroundColor: theme.surface,
                        // The thin line along the very top edge of the tab
                        // bar, separating it visually from the screen
                        // content above it.
                        borderTopColor: theme.border,
                    },
                }}
            >
                {/* Each Tabs.Screen below corresponds to one file in this
                    same folder. The `name` prop must exactly match the
                    filename (without extension) — e.g. name="index" maps to
                    app/(okage-tabs)/index.tsx. */}
                <Tabs.Screen
                    name="index"
                    options={{
                        // Text label shown under the icon in the tab bar.
                        title: 'Dashboard',
                        // tabBarIcon is a function so it can pick a
                        // different icon depending on whether this tab is
                        // currently active ("focused"). Filled icons
                        // (e.g. 'home-sharp') are shown when selected;
                        // outline versions (e.g. 'home-outline') when not —
                        // a common iOS/Android convention for showing
                        // selection state.
                        tabBarIcon: ({ color, focused }) => (
                            <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="content"
                    options={{
                        title: 'Content',
                        tabBarIcon: ({ color, focused }) => (
                            <Ionicons name={focused ? 'library-sharp' : 'library-outline'} color={color} size={24} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="quizzes"
                    options={{
                        title: 'Quizzes',
                        tabBarIcon: ({ color, focused }) => (
                            <Ionicons name={focused ? 'help-circle-sharp' : 'help-circle-outline'} color={color} size={24} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="standards"
                    options={{
                        title: 'Standards',
                        tabBarIcon: ({ color, focused }) => (
                            <Ionicons name={focused ? 'ribbon-sharp' : 'ribbon-outline'} color={color} size={24} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="reports"
                    options={{
                        title: 'Reports',
                        tabBarIcon: ({ color, focused }) => (
                            <Ionicons name={focused ? 'documents-sharp' : 'documents-outline'} color={color} size={24} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="okage-account"
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
    );
}

const styles = StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
