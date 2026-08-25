// app/(site-admin-tabs)/_layout.tsx
//
// FILE-LEVEL OVERVIEW (for learning Expo Router):
// -------------------------------------------------------------------------
// A folder named in parentheses, like `(site-admin-tabs)`, is an Expo
// Router "route group": it groups a set of screens together and lets them
// share one `_layout.tsx`, but the parentheses themselves never appear in
// the actual URL/path. A `_layout.tsx` file is special to Expo Router --
// instead of being a screen itself, it defines the *navigator* (here, a
// bottom tab bar via `<Tabs>`) that wraps every sibling file in the same
// folder. Each sibling file (`school.tsx`, `district.tsx`,
// `site-admin-account.tsx`, `index.tsx`) automatically becomes one
// `<Tabs.Screen>`.
//
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

// Icon set bundled with Expo -- gives us named vector icons (like
// 'school-outline') without shipping our own icon font/images.
import Ionicons from '@expo/vector-icons/Ionicons';
// `Tabs` is Expo Router's bottom-tab-bar navigator component.
// `useRouter` gives us an imperative object (`router.replace(...)`,
// `router.push(...)`) for navigating in code, as opposed to declaratively
// with a `<Link>`.
import { Tabs, useRouter } from 'expo-router';
// React's two most common hooks: `useState` holds a piece of state across
// re-renders; `useEffect` runs a side effect (here, an async access check)
// after render, and again whenever its dependency array changes.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
// `useSafeAreaInsets` reports how much padding is needed on each edge of
// the screen to avoid notches, status bars, and home indicators on phones.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../commonStyles';
import OnboardingTour from '../../components/OnboardingTour';
import TourTarget from '../../components/tour/TourTarget';
import { useResponsive } from '../../hooks/useResponsive';
import { resolveAppShellPath } from '../../lib/access';
import { supabase } from '../../utils/supabase';

/**
 * SiteAdminTabLayout
 * ---------------------------------------------------------------------
 * The `_layout.tsx` component for the `(site-admin-tabs)` route group.
 * Props: none (Expo Router renders layout components with no props of
 * their own; the matched child screen is rendered automatically inside
 * the `<Tabs>` navigator based on the current route).
 *
 * What it does, step by step:
 *   1. Runs an async "access guard" effect on mount that re-checks (from
 *      Supabase, not from any cached/local value) whether the signed-in
 *      user is actually allowed to be in this shell.
 *   2. While that check is running, renders a centered loading spinner
 *      instead of the tab bar, so nothing site-admin-specific ever
 *      flashes on screen before the check completes.
 *   3. Once the check passes, renders the bottom tab bar (`<Tabs>`) with
 *      three visible tabs (My School, District, Account) plus one hidden
 *      `index` route used only for URL resolution.
 *
 * Returns: either a loading `<View>` (spinner) or the full tab-bar layout
 * `<View>` wrapping `<Tabs>`.
 */
export default function SiteAdminTabLayout() {
    const router = useRouter();
    // Insets (in pixels) for the safe area on this device, e.g. `insets.top`
    // is how much space the status bar/notch takes at the top.
    const insets = useSafeAreaInsets();
    // `useColorScheme()` returns 'light', 'dark', or null/undefined depending
    // on the OS-level appearance setting; the `?? 'light'` falls back to
    // light mode if the OS doesn't report one. `theme` is then just a plain
    // object of color strings picked for that scheme (see commonStyles.ts).
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
    // `checked` starts `false` (meaning "we haven't confirmed access yet")
    // and flips to `true` only once the effect below confirms this user's
    // profile really does belong in the site-admin shell.
    const [checked, setChecked] = useState(false);

    // This effect runs exactly once after the component first mounts,
    // because its dependency array is `[router]` and `router` is a stable
    // reference from Expo Router (it doesn't change between renders). It's
    // an async permission check, not something that reruns on every render.
    useEffect(() => {
        // A simple "is this effect instance still the current one" flag.
        // Because `checkAccess` is async, the component could unmount (e.g.
        // user navigates away) before the `await` calls resolve; without
        // this guard, calling `setChecked`/`router.replace` after unmount
        // could touch stale state or navigate unexpectedly.
        let isMounted = true;

        async function checkAccess() {
            try {
                // Ask Supabase Auth who is currently signed in (reads the
                // locally cached session/JWT, effectively free of a network
                // round trip in most cases).
                const { data: { user } } = await supabase.auth.getUser();
                if (!isMounted) return;
                if (!user) {
                    // No signed-in user at all -- bounce to the root/login
                    // screen. `router.replace` swaps the current history
                    // entry instead of pushing a new one, so the user can't
                    // hit "back" to return to this guarded screen.
                    router.replace('/' as any);
                    return;
                }

                // Look up this user's row in the `profiles` table to find
                // their role. `.single()` expects exactly one matching row
                // and throws/returns an error if zero or multiple come back.
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

                // `resolveAppShellPath` is shared logic (lib/access.ts) that
                // decides which app shell (student, teacher, admin,
                // site-admin, etc.) a given profile belongs in.
                const shellPath = resolveAppShellPath(profile);
                if (!shellPath.startsWith('/(site-admin-tabs)')) {
                    // This profile's real shell is somewhere else -- redirect
                    // them there instead of letting them view this one.
                    router.replace(shellPath as any);
                    return;
                }

                // Only now do we know for certain this is a real Site
                // Administrator -- unlock rendering of the actual tab bar.
                setChecked(true);
            } catch (err) {
                console.error('Error checking site admin access:', err);
                if (isMounted) router.replace('/' as any);
            }
        }

        checkAccess();

        // Effect cleanup: runs when the component unmounts (or before the
        // effect re-runs, though here it only ever runs once). Flips the
        // guard flag so any in-flight async work becomes a no-op.
        return () => {
            isMounted = false;
        };
    }, [router]);

    // While the access check is still in flight, show a spinner instead of
    // any part of the real UI -- this is what prevents a flash of
    // site-admin content for someone who turns out not to be one.
    if (!checked) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        // Outer wrapper -- just fills the screen with the theme's
        // background color so there's no flash of white/black behind the
        // tab bar while things load.
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* No preview-mode concept in this shell -- only Site Admins
                land here -- so `active` stays at its default of true. */}
            {/* OnboardingTour is a reusable component that walks a new user
                through the UI using highlighted "TourTarget" elements. It
                only starts once `ready` (our `checked` guard) is true, and
                `tourId` picks which set of tour steps to show. */}
            <OnboardingTour tourId="site_admin" ready={checked} />
            {/* paddingTop: insets.top pushes content below the status bar/
                notch. On wide web screens (isWideWeb) content is centered
                instead of stretched edge-to-edge -- see useResponsive. */}
            <View style={[styles.contentContainer, { paddingTop: insets.top, alignItems: isWideWeb ? 'center' : 'stretch' }]}>
              {/* This inner View caps the tab bar/content at 1100px wide on
                  wide web viewports so it doesn't stretch unnaturally across
                  an ultra-wide browser window. */}
              <View style={{ flex: 1, width: '100%', maxWidth: isWideWeb ? 1100 : undefined }}>
                {/* `<Tabs>` is the actual bottom tab-bar navigator.
                    `screenOptions` applies shared settings to every tab:
                    hide the default header bar, and color the active/
                    inactive tab icons/labels and the tab bar itself using
                    the current theme. */}
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
                    {/* Each `<Tabs.Screen name="...">` corresponds to a
                        sibling file in this folder (school.tsx, district.tsx,
                        site-admin-account.tsx). `tabBarIcon` is a render
                        prop Expo Router calls with the current tint `color`
                        and whether this tab is `focused`, letting us swap
                        between filled ("sharp") and outline icon variants. */}
                    <Tabs.Screen
                        name="school"
                        options={{
                            title: 'My School',
                            tabBarIcon: ({ color, focused }) => (
                                // TourTarget marks this icon as a highlightable
                                // step for the onboarding tour above.
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

// `StyleSheet.create` is React Native's helper for defining style objects.
// It doesn't do anything magical at runtime (mostly just returns the object
// with IDs for perf), but it's the idiomatic way to define reusable style
// objects instead of inline object literals everywhere.
// -- layout/container styles --
const styles = StyleSheet.create({
    container: { flex: 1 },
    contentContainer: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
