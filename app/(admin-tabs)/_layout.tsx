// app/(admin-tabs)/_layout.tsx
//
// ============================================================================
// FILE-LEVEL OVERVIEW (read this first if you're new to the codebase)
// ============================================================================
// WHAT IS A "ROUTE GROUP"?
//   In Expo Router (the file-based navigation system this whole `app/`
//   directory uses), any folder whose name is wrapped in parentheses --
//   like `(admin-tabs)` -- is a "route group". The parentheses tell the
//   router "organize files under here, but do NOT add this folder's name
//   as a segment in the actual URL". So a file at
//   `app/(admin-tabs)/overview.tsx` is reachable at the URL `/overview`,
//   not `/(admin-tabs)/overview` (although `/(admin-tabs)/overview` also
//   still works as an internal path you can pass to `router.push`/
//   `router.replace`, which is why you'll see strings like that below).
//   Route groups are purely an organizational tool for the developer: they
//   let you keep "all the screens a District Admin can see" together in
//   one folder, each with their own shared layout/navigation, without that
//   grouping leaking into the URLs a user actually sees.
//
// WHAT DOES `_layout.tsx` DO?
//   Any folder in `app/` can contain a special `_layout.tsx` file. Expo
//   Router treats it as a wrapper that renders around every screen inside
//   that folder -- kind of like a shared "frame" or "shell". This
//   particular `_layout.tsx` renders a bottom tab bar (using expo-router's
//   `<Tabs>` component) and puts each sibling screen (`overview.tsx`,
//   `schools.tsx`, `reports.tsx`, `admin-account.tsx`, `index.tsx`) inside
//   one of those tabs. It also runs an "access guard" (see the `useEffect`
//   below) before showing any of those tabs, so this file is a good place
//   to understand the *shape* of the whole District Admin portion of the
//   app before diving into any individual screen.
//
// WHAT SCREEN/ROLE IS THIS FOR?
//   This is the navigation shell for the District Admin portal -- the
//   second, separate portal for principals/superintendents (signup.tsx's
//   "K-12 Principal or District Admin" educator sub-type, app_role =
//   'admin'), distinct from the Classes/Curriculum/Reports/Account teacher
//   portal in app/(teacher-tabs).
//
// WHAT'S IN THIS SHELL?
//   4 visible tabs — Overview (district-wide KPIs), Schools (school → class
//   drill-down, never a per-student roster), Reports (the single PDF export
//   this shell has, unlike teacher Reports' 3-tab, PDF-per-class model), and
//   Account. `index` is a 5th route that exists only to resolve the bare
//   `/(admin-tabs)` path used by lib/access.ts and app/_layout.tsx's
//   post-login redirect.
// ============================================================================

// Ionicons: a bundled icon font component from Expo's vector-icons package.
// Used below to draw the little tab-bar icons (e.g. the "stats-chart" icon).
import Ionicons from '@expo/vector-icons/Ionicons';
// `Tabs` is expo-router's built-in bottom-tab-bar navigator component --
// rendering <Tabs> with <Tabs.Screen> children is what actually creates the
// tab bar you see at the bottom of the screen and wires each tab to one of
// the sibling files in this folder. `useRouter` gives us an imperative way
// to navigate (e.g. `router.replace(...)`) from inside event handlers or
// effects, as opposed to declarative <Link> components.
import { Tabs, useRouter } from 'expo-router';
// React's core hooks: `useState` holds a piece of state that persists across
// re-renders and re-renders the component when changed; `useEffect` runs a
// side effect (something outside of pure rendering, like a network call)
// after render, re-running when its dependency array changes.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
// `useSafeAreaInsets` (from the community safe-area-context library) reports
// how much padding is needed on each edge of the screen to avoid notches,
// status bars, and home-indicator bars on real devices.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../commonStyles';
import OnboardingTour from '../../components/OnboardingTour';
import TourTarget from '../../components/tour/TourTarget';
import { useResponsive } from '../../hooks/useResponsive';
import { resolveAppShellPath } from '../../lib/access';
import { supabase } from '../../utils/supabase';

// The default export of a `_layout.tsx` file is the component Expo Router
// renders as the wrapper/shell for this whole route group. Every screen
// under app/(admin-tabs)/ gets rendered *inside* whatever this component
// returns (specifically, inside the <Tabs> element below, which slots the
// active screen in automatically).
export default function AdminTabLayout() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    // `useColorScheme()` reads the device's current light/dark mode setting.
    // It can return `null` before the OS reports a preference, hence the
    // `?? 'light'` fallback so `theme` always has a real value to look up.
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
    // useState(false): starts "unchecked" every time this layout mounts, so
    // the guard always re-verifies access rather than trusting a previous
    // result.
    const [checked, setChecked] = useState(false);

    // This effect runs the access check exactly once when the layout first
    // mounts (empty-ish dependency array -- only `router` is listed, and
    // `router` from expo-router is a stable reference, so in practice this
    // behaves like "run once on mount"). It performs an async permission
    // check and only shows the real tab bar once it's confirmed the signed
    // in user is actually a district admin.
    useEffect(() => {
        // `isMounted` is a classic guard against calling `setState` after
        // the component has already unmounted (e.g. if the user navigates
        // away while the `await` calls below are still in flight). Without
        // it, React would log a warning about updating state on an
        // unmounted component, and in rare races could apply a stale
        // redirect after the component is already gone.
        let isMounted = true;

        async function checkAccess() {
            try {
                // Ask Supabase Auth who is currently signed in (reads the
                // locally cached session/JWT; does not necessarily hit the
                // network every time).
                const { data: { user } } = await supabase.auth.getUser();
                if (!isMounted) return;
                if (!user) {
                    // Nobody is signed in at all -- bounce back to the
                    // public landing/login screen. `router.replace` (as
                    // opposed to `router.push`) swaps the current history
                    // entry instead of stacking a new one, so the back
                    // button won't return here.
                    router.replace('/' as any);
                    return;
                }

                // Read this user's row from the `profiles` table to find
                // out their role. `.select('role, app_role, active_view')`
                // only asks Postgres for those 3 columns (cheaper than
                // `select('*')`); `.eq('id', user.id)` filters to just this
                // user's row; `.single()` expects exactly one row back and
                // turns "0 or 2+ rows" into an error.
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('role, app_role, active_view')
                    .eq('id', user.id)
                    .single();

                if (!isMounted) return;
                if (error || !profile) {
                    // Couldn't load a profile (e.g. row missing, RLS denied
                    // it, network hiccup) -- fail safe by sending the user
                    // back to the public landing page rather than showing
                    // this admin shell.
                    router.replace('/' as any);
                    return;
                }

                // `resolveAppShellPath` is shared logic (in lib/access.ts)
                // that looks at the profile's role/app_role/active_view and
                // decides which top-level shell ("/(admin-tabs)",
                // "/(teacher-tabs)", etc.) this user is actually supposed to
                // land in.
                const shellPath = resolveAppShellPath(profile);
                if (!shellPath.startsWith('/(admin-tabs)')) {
                    // This user is signed in, but their resolved shell isn't
                    // this one (e.g. they're really a teacher who navigated
                    // here directly, or via a stale link) -- redirect them
                    // to the shell they actually belong in.
                    router.replace(shellPath as any);
                    return;
                }

                // Everything checked out: this user really is a district
                // admin. Flip `checked` to true so the render below swaps
                // the spinner for the real tab bar.
                setChecked(true);
            } catch (err) {
                console.error('Error checking district admin access:', err);
                if (isMounted) router.replace('/' as any);
            }
        }

        checkAccess();

        // Effect cleanup function: React calls this when the component
        // unmounts (or before the effect re-runs). Here it just flips
        // `isMounted` to false so any `await` still pending above knows not
        // to call `setState` anymore.
        return () => {
            isMounted = false;
        };
    }, [router]);

    // Conditional render #1: while the access check above is still running
    // (or hasn't been confirmed yet), show a centered loading spinner instead
    // of any real screen content. This prevents a flash of admin UI before
    // we know the viewer is allowed to see it.
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
            {/* OnboardingTour: a component that walks first-time users
                through the UI with highlighted callouts. `ready={checked}`
                makes sure it doesn't try to point at tab bar icons before
                the real tab bar (guarded above by `checked`) has rendered. */}
            <OnboardingTour tourId="admin" ready={checked} />
            {/* `insets.top` (from useSafeAreaInsets) is applied as top
                padding so content doesn't render underneath the phone's
                status bar/notch. `alignItems` switches between centering
                content (wide web/desktop browser windows) and stretching it
                edge-to-edge (normal phone-width screens). */}
            <View style={[styles.contentContainer, { paddingTop: insets.top, alignItems: isWideWeb ? 'center' : 'stretch' }]}>
              {/* On wide web viewports, cap the whole tab bar + content at
                  1100px so it doesn't stretch uncomfortably across a huge
                  monitor; on phones, `maxWidth: undefined` just means "use
                  all available width". */}
              <View style={{ flex: 1, width: '100%', maxWidth: isWideWeb ? 1100 : undefined }}>
                {/* <Tabs> is expo-router's bottom tab navigator. Everything
                    inside `screenOptions` applies to every tab unless a
                    specific <Tabs.Screen> overrides it: here it hides the
                    default header bar and themes the tab bar's active/
                    inactive icon colors, background, and top border to
                    match light/dark mode. */}
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
                    {/* Each <Tabs.Screen name="..."> below corresponds to a
                        sibling file in this folder (e.g. name="overview"
                        maps to overview.tsx). `href: null` keeps this route
                        resolvable (the bare `/(admin-tabs)` path needs an
                        `index` route to land on) without showing it as its
                        own tab. */}
                    <Tabs.Screen name="index" options={{ href: null }} />
                    {/* `tabBarIcon` is a render-prop expo-router calls with
                        the current tab's tint `color` and whether it's
                        `focused` (the active tab), so each tab can swap
                        between a filled and outline icon variant.
                        `TourTarget` wraps the icon so the onboarding tour
                        can find and highlight this specific tab by id. */}
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

// StyleSheet.create({...}) is React Native's way of defining style objects.
// It doesn't do much magic at runtime (mostly a light validation/perf
// optimization) but is the idiomatic pattern for grouping styles instead of
// inlining objects everywhere.
// -- layout/container styles: full-screen flex containers and the
//    spinner-centering wrapper used by the `!checked` loading state above --
const styles = StyleSheet.create({
    container: { flex: 1 },
    contentContainer: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
