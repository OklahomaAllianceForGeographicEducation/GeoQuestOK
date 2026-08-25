// app/(site-admin-tabs)/site-admin-account.tsx
//
// FILE-LEVEL OVERVIEW:
// -------------------------------------------------------------------------
// The "Account" tab screen inside the `(site-admin-tabs)` route group -- a
// folder named in parentheses is an Expo Router "route group": it lets
// every sibling file here (school.tsx, district.tsx, this file) share one
// `_layout.tsx` (which defines the bottom tab bar), without the
// parentheses themselves ever showing up in the URL. See this folder's
// `_layout.tsx` for the fuller explanation of route groups and
// `_layout.tsx` files.
//
// Screen/role: Site Administrator (building-level principal). Purpose:
// show this admin's identity (avatar/name), a view switcher (Site Admin /
// Teacher / Student, mirroring teacher-account.tsx's Teacher/Classic
// switcher and okage-account.tsx's Teacher/Student one -- lib/access.ts's
// getAllowedTeacherViews returns all three for this role) that lets them
// preview the other experiences their school actually sees, read-only
// school/district/email fields, and account actions (replay onboarding
// tour, sign out, delete account). District Administrators do NOT get this
// switcher -- it moved here from their account screen.

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, getGlobalStyles, Theme } from '../../commonStyles';
import { confirmAlert } from '../../lib/confirmAlert';
import { signOutAndRedirect } from '../../lib/auth';
import { confirmDeleteAccount } from '../../lib/deleteAccount';
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

// The shape this screen actually renders with -- a merge of a few columns
// from the `profiles` table plus the Supabase Auth `email` (which lives on
// the auth user object, not in `profiles`). Every field is nullable because
// a brand-new or incompletely-filled-out profile row may not have them set
// yet.
type SiteAdminProfile = {
    display_name: string | null;
    username: string | null;
    email: string | null;
    school_name: string | null;
    school_district_name: string | null;
    active_view: string | null;
};

/**
 * SiteAdminAccount
 * ---------------------------------------------------------------------
 * The default-exported "Account" tab screen. No props (Expo Router tab
 * screens receive none). Manages its own profile-loading state and the
 * view-switcher/sign-out/delete-account actions.
 *
 * Returns: a loading spinner on first load; otherwise a scrollable page
 * with an avatar, greeting, the 3-way view switcher, read-only school/
 * district/email fields, and the tour-replay/sign-out/delete-account
 * buttons.
 */
export default function SiteAdminAccount() {
    // Theme setup: read the OS-level light/dark preference (falling back to
    // light), look up the matching color palette, and build this screen's
    // two style objects from it -- `styles` for screen-specific styles
    // defined at the bottom of this file, `baseStyles` for the shared
    // account-screen styles (avatar ring, greeting text, card, divider,
    // etc.) reused across every account screen in the app.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const baseStyles = getGlobalStyles(theme);
    // Imperative navigation object -- used below to redirect the admin into
    // whichever shell they switch their active_view to.
    const router = useRouter();

    // `loading` -- true only until the very first profile fetch resolves,
    // driving the full-screen spinner below.
    const [loading, setLoading] = useState(true);
    // This admin's own Supabase Auth user id, needed to scope the
    // `active_view` update in handleToggleAppView to just this row.
    const [userId, setUserId] = useState<string | null>(null);
    // The loaded profile fields to render (name, school, district, email,
    // current active_view). `null` until the first load completes.
    const [profile, setProfile] = useState<SiteAdminProfile | null>(null);
    // Whether the "Delete Account" flow is currently in progress -- swaps
    // that button's label for a spinner and disables it while true.
    const [deletingAccount, setDeletingAccount] = useState(false);

    // Data-loading function, memoized with `useCallback` (empty deps) so
    // its identity is stable across renders -- used below as a dependency
    // of the focus-effect callback.
    const loadProfile = useCallback(async () => {
        try {
            // Who is signed in right now? Reads the local session/JWT
            // (normally no network round trip).
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            // Pull this admin's display fields from `profiles`.
            // `.maybeSingle()` (rather than `.single()`) tolerates zero
            // matching rows by returning `null` instead of throwing, which
            // matters here since the `data?.field ?? null` fallbacks below
            // already handle a missing row gracefully.
            const { data } = await supabase
                .from('profiles')
                .select('display_name, username, school_name, school_district_name, active_view')
                .eq('id', user.id)
                .maybeSingle();

            // `??` (nullish coalescing) rather than `||` so a legitimately
            // empty string wouldn't be replaced -- though in practice these
            // fields are either a real value or genuinely absent (null/
            // undefined) here. `user.email` comes from the Auth user
            // object itself, not from `profiles`, since email isn't
            // duplicated into that table.
            setProfile({
                display_name: data?.display_name ?? null,
                username: data?.username ?? null,
                email: user.email ?? null,
                school_name: data?.school_name ?? null,
                school_district_name: data?.school_district_name ?? null,
                active_view: data?.active_view ?? null,
            });
        } finally {
            // Runs whether the fetch succeeded, failed, or returned early
            // (the `if (!user) return;` above) -- always clears the
            // spinner so the UI never gets stuck loading forever.
            setLoading(false);
        }
    }, []);

    // `useFocusEffect` re-runs `loadProfile()` every time this tab becomes
    // focused (first open, and again on switching back from another tab) --
    // not just once on mount -- because expo-router's tab navigator keeps
    // screens mounted in the background rather than unmounting them, so a
    // plain mount-only effect would show stale data (e.g. an active_view
    // switched from elsewhere) until the whole app restarted.
    useFocusEffect(
        useCallback(() => {
            void loadProfile();
        }, [loadProfile])
    );

    // Event handler for tapping one of the 3 segmented-control buttons
    // (Site Admin / Teacher / Student). Switches this admin's active_view
    // and navigates them into that preview -- same optimistic-update
    // pattern as (teacher-tabs)/teacher-account.tsx and
    // (okage-tabs)/okage-account.tsx. Picking "Site Admin" while already
    // there is a harmless no-op: it just re-confirms the value already
    // saved and stays put.
    const handleToggleAppView = async (targetView: 'site_admin' | 'teacher' | 'classic') => {
        if (!userId) return;
        // Remember the value before this change, in case the Supabase
        // write fails and we need to roll the UI back to it.
        const previousView = profile?.active_view;
        try {
            // Optimistic update: flip `active_view` in local state
            // immediately, before the network request even resolves, so
            // the segmented control's highlighted option changes instantly
            // rather than waiting on a round trip.
            setProfile((prev) => (prev ? { ...prev, active_view: targetView } : prev));

            // Persist the new active_view to the `profiles` table so it
            // survives app restarts and is what every other screen's
            // access-guard/role check reads going forward.
            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', userId);

            if (error) throw error;

            // Navigate into whichever shell corresponds to the newly
            // chosen view. `router.replace` swaps the current history
            // entry (rather than pushing a new one), so tapping "back"
            // afterward doesn't return to this exact pre-switch state.
            const destination =
                targetView === 'classic' ? '/(tabs)/dashboard' : targetView === 'teacher' ? '/(teacher-tabs)' : '/(site-admin-tabs)';
            router.replace(destination as any);
        } catch (err: any) {
            // The Supabase write failed -- roll the optimistic update back
            // to whatever active_view was before this tap, then surface
            // the failure so the admin knows the switch didn't take.
            setProfile((prev) => (prev ? { ...prev, active_view: previousView ?? prev.active_view } : prev));
            showAlert('View Switch Failed', err.message || 'Could not switch views.');
        }
    };

    // Event handler for the "Sign Out" button: shows a confirmation dialog
    // first (via confirmAlert, a cross-platform-safe helper -- see
    // lib/confirmAlert.ts) rather than signing out immediately on a single
    // tap, since accidentally hitting this would kick the admin out of the
    // app. Only proceeds with signOutAndRedirect (lib/auth.ts) if "Log Out"
    // is actually tapped.
    const handleSignOutAction = () => {
        confirmAlert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => void signOutAndRedirect(router) },
        ]);
    };

    // Conditional render: while the first profile fetch is in flight, show
    // nothing but a centered spinner instead of a screen full of blank/
    // placeholder fields.
    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    // The main render: avatar + greeting, the 3-way view switcher, the
    // read-only school/district/email card, and the action buttons.
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* ScrollView so the page can scroll on shorter screens; a
                fixed avatar/greeting header sits above it. */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                <View style={baseStyles.profileImageContainer}>
                    {/* A generic school-building icon stands in for a real
                        profile picture -- Site Administrators don't get the
                        customizable avatar picker students/teachers have. */}
                    <View style={[baseStyles.avatarRing]}>
                        <View style={[styles.iconAvatar, { backgroundColor: theme.surface }]}>
                            <Ionicons name="school" size={44} color={theme.accent} />
                        </View>
                    </View>
                    {/* accessibilityRole="header" tells screen readers this
                        text acts as a heading. Falls back through
                        display_name -> username -> a generic label, in
                        case neither name field is set on the profile. */}
                    <Text style={baseStyles.profileGreeting} accessibilityRole="header">
                        {profile?.display_name || profile?.username || 'Site Administrator'}
                    </Text>
                    <Text style={baseStyles.profileSubtext}>Site Administrator</Text>
                </View>

                {/* View Switcher -- preview the Teacher and Student
                    experiences your school actually sees, same pattern as
                    the OKAGE and Teacher account screens. Each Pressable
                    below is one segment; tapping it calls
                    handleToggleAppView with that segment's target view, and
                    is visually highlighted (background + icon/text color)
                    only when it matches the current profile.active_view. */}
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
                    {/* Read-only identity card: school, district, and email
                        -- all sourced straight from the loaded profile/auth
                        user, with a "Not assigned"/em-dash fallback for any
                        field that's missing. There's no edit form here --
                        these are administrative facts, not something the
                        admin changes from this screen. */}
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

                    {/* Reiterates, in plain language, exactly what data
                        privacy boundary this role operates under -- see
                        school.tsx (own school, per-student detail) and
                        district.tsx (every other school, aggregate only)
                        for where those two views actually live. */}
                    <Text style={[styles.helperText, { color: theme.subtext }]}>
                        For your own school you can see each student’s miles walked and Presidential Fitness Test targets met — never a quiz score or activity log. Every other school in your district only ever shows as one aggregate summary.
                    </Text>

                    {/* Re-opens the onboarding tour (components/OnboardingTour)
                        for this role on demand, via lib/onboarding.ts's
                        requestTourReplay -- useful if the admin dismissed it
                        the first time and wants to see it again. */}
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

                    {/* Deliberately understated relative to Sign Out --
                        permanent and wipes everything, so it shouldn't be
                        one careless tap away from anything else here. The
                        confirmation dialog carries the actual warning. */}
                    <Pressable
                        onPress={() => confirmDeleteAccount(router, setDeletingAccount)}
                        disabled={deletingAccount}
                        style={{ alignSelf: 'center', marginTop: 20, paddingVertical: 13, paddingHorizontal: 18 }}
                        accessibilityRole="button"
                    >
                        {deletingAccount ? (
                            <ActivityIndicator color={theme.subtext} size="small" />
                        ) : (
                            <Text style={{ color: theme.subtext, fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' }}>Delete Account</Text>
                        )}
                    </Pressable>
                </View>

                {/* Standard footer acknowledgement text shared across the
                    app's account screens, crediting the state department
                    partnership behind GeoQuestOK. */}
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
    // -- layout/loading styles --
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    iconAvatar: { width: 106, height: 106, borderRadius: 53, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    // -- identity-card field text styles --
    fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
    fieldValue: { fontSize: 16, fontWeight: '600', fontFamily: 'Georgia' },
    helperText: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
    // -- view-switcher (segmented control) styles --
    // Matches (teacher-tabs)/teacher-account.tsx's viewSwitcherBox/
    // segmentedBar/segmentToggle/segmentLabel values exactly, just widened
    // to a 3-way row (Site Admin/Teacher/Student) instead of 2.
    viewSwitcherBox: { borderWidth: 1, padding: 14, borderRadius: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 14 },
    switcherTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10, textAlign: 'center' },
    segmentedBar: { flexDirection: 'row', gap: 8 },
    segmentToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.background },
    segmentLabel: { fontSize: 13, fontWeight: '700' },
});
