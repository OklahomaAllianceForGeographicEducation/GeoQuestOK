// app/(teacher-tabs)/_layout.tsx
// Bottom tab navigator for teacher authenticated screens. 4 visible tabs —
// Classes (create classes/join codes/roster management), Curriculum,
// Reports (all student data: rosters, quiz/fitness/activity detail, My
// School, District Map, PDF export), and Account. `index` is a 5th route
// that exists only to resolve the bare `/(teacher-tabs)` path — see its
// `href: null` below — there's no separate "Dashboard" tab anymore; that
// screen's stats/class-creation were fully redundant with Classes/Reports.
// Also shows a special "you're previewing" banner when an OKAGE staff
// member is using this view temporarily instead of a real teacher.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

// TouchableOpacity is an older/simpler tappable wrapper than Pressable
// (used elsewhere in the app) — it just fades its opacity on press rather
// than giving a full pressed-state callback. Both do the same basic job.
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../commonStyles';
import { useResponsive } from '../../hooks/useResponsive';
import { resolveAppShellPath } from '../../lib/access';
import { supabase } from '../../utils/supabase';

export default function TeacherTabLayout() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    // See app/(tabs)/_layout.tsx for why this exists: caps + centers the
    // tab bar and screen content on wide web viewports instead of
    // stretching them edge-to-edge.
    const { isWideWeb } = useResponsive(1100);

    // OKAGE staff can preview the teacher view to check that their content
    // edits show up correctly. Real teachers never see this banner.
    // True only when the currently logged-in user is an 'okage' role AND
    // has explicitly switched their active_view to 'teacher' (see the
    // (okage-tabs) account screen for where that toggle presumably lives).
    const [isOkagePreviewing, setIsOkagePreviewing] = useState(false);
    // Tracks whether the "return to OKAGE view" action is currently in
    // progress, so the banner can show a spinner and ignore repeat taps.
    const [switchingBack, setSwitchingBack] = useState(false);
    // Access guard: this layout previously rendered the teacher tabs
    // immediately for ANY logged-in user -- it only ever checked the
    // profile's role to decide whether to show the "OKAGE previewing"
    // banner, never to decide whether the viewer was actually allowed to
    // be here at all. A student (or anyone else) landing on this route --
    // a stale/interrupted sign-out leaving an old session in storage,
    // direct URL entry, browser back/forward into a stale route -- would
    // see the full teacher portal (rosters, reports, curriculum tools).
    // `checked` gates the real UI behind a spinner until the guard below
    // has confirmed the viewer belongs here.
    const [checked, setChecked] = useState(false);

    useEffect(() => {
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
                    router.replace('/' as any);
                    return;
                }

                // resolveAppShellPath (lib/access.ts) is the same helper
                // the rest of the app uses to decide which shell a
                // profile belongs in, checking both the `role` and
                // `app_role` columns. Teachers, and OKAGE staff actively
                // previewing the teacher view, resolve to this shell;
                // everyone else (students, non-previewing OKAGE staff)
                // gets redirected to wherever they actually belong instead
                // of ever seeing this portal render.
                const shellPath = resolveAppShellPath(profile);
                if (!shellPath.startsWith('/(teacher-tabs)')) {
                    router.replace(shellPath as any);
                    return;
                }

                // Only show the preview banner if BOTH conditions are
                // true: this account's real role is 'okage' (not an
                // actual teacher), AND they've chosen to preview the
                // teacher view specifically.
                setIsOkagePreviewing(profile.role === 'okage' && profile.active_view === 'teacher');
                setChecked(true);
            } catch (error) {
                console.error("Error checking preview mode status:", error);
                if (isMounted) router.replace('/' as any);
            }
        }

        checkViewMode();

        return () => {
            isMounted = false;
        };
    }, [router]);

    // Handles the banner's tap action: switch the OKAGE user's
    // active_view back to 'okage' in the database, then navigate them back
    // to their real OKAGE tabs.
    const handleReturnToOkageView = async () => {
        // Ignore taps while a switch is already underway, preventing
        // duplicate requests if the user taps rapidly.
        if (switchingBack) return;
        setSwitchingBack(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: 'okage' })
                .eq('id', user.id);

            if (error) throw error;

            setIsOkagePreviewing(false);
            router.replace('/(okage-tabs)/' as any);
        } catch (error) {
            console.error("Failed to return to OKAGE view:", error);
            // Plain browser/JS `alert()` rather than React Native's
            // Alert.alert() — works fine on web, but on native platforms
            // this may not show a proper native dialog (a small
            // inconsistency compared to how other screens in the app use
            // showAlert()-style helpers).
            alert("Could not switch back to OKAGE view. Please try again.");
        } finally {
            setSwitchingBack(false);
        }
    };

    // Until the access guard above has confirmed the viewer actually
    // belongs on the teacher tabs, show a spinner instead of briefly (or,
    // for an unauthorized viewer, indefinitely) rendering the real portal.
    if (!checked) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* The orange preview banner only renders at all when
                isOkagePreviewing is true — otherwise this entire block is
                skipped. */}
            {isOkagePreviewing && (
                // paddingTop: insets.top pushes the banner's tappable area
                // down below the status bar/notch, since this banner sits
                // at the very top of the screen, above where the tab
                // content's own safe-area padding would normally apply.
                <View style={{ backgroundColor: '#DE9027', paddingTop: insets.top }}>
                    <TouchableOpacity
                        style={styles.banner}
                        onPress={handleReturnToOkageView}
                        // Disables tap handling entirely while a switch is
                        // in progress (in addition to the early-return
                        // check inside the handler itself — belt and
                        // braces).
                        disabled={switchingBack}
                    >
                        {switchingBack ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Text style={styles.bannerText}>
                                Previewing as Teacher — Tap to Return to OKAGE View
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* When the preview banner is showing, it already accounts for
                the top safe-area inset itself, so the tab content below it
                shouldn't add ANOTHER chunk of top padding (that would push
                everything down twice). This ternary applies insets.top
                only when the banner is NOT showing. */}
            <View style={[styles.contentContainer, { paddingTop: isOkagePreviewing ? 0 : insets.top, alignItems: isWideWeb ? 'center' : 'stretch' }]}>
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
                        `/(teacher-tabs)` path used by lib/access.ts and
                        the post-login redirect needs an `index` route to
                        land on) without showing it as its own tab — it
                        immediately redirects to Reports. There is
                        deliberately no visible "Dashboard" tab anymore. */}
                    <Tabs.Screen name="index" options={{ href: null }} />
                    <Tabs.Screen
                        name="classes"
                        options={{
                            title: 'Classes',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? 'school-sharp' : 'school-outline'} color={color} size={24} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="curriculum"
                        options={{
                            title: 'Curriculum',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? 'library-sharp' : 'library-outline'} color={color} size={24} />
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
                        name="teacher-account"
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
    banner: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        // zIndex controls stacking order when elements overlap — a higher
        // number renders on top of lower ones. 999 is an intentionally
        // large value to make sure this banner stays above anything else
        // that might otherwise overlap it.
        zIndex: 999,
    },
    bannerText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
