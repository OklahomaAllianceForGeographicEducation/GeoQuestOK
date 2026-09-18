// app/(admin-tabs)/admin-account.tsx
//
// FILE-LEVEL OVERVIEW:
// This file lives inside the `(admin-tabs)` Expo Router route group — a
// folder named in parentheses, which means the folder name itself is
// dropped from the URL (see app/(admin-tabs)/_layout.tsx for the full
// explanation of route groups and `_layout.tsx` files). This particular
// screen is registered as the "Account" tab by that folder's _layout.tsx.
//
// District Admin's account screen: identity + district assignment display,
// a District Admin/Student view switcher (same segmented-control pattern
// used by the Teacher/Site Admin/OKAGE account screens -- see
// lib/access.ts's getAllowedTeacherViews, which returns ['admin', 'classic']
// for this role), and sign out.

import { Ionicons } from '@expo/vector-icons';
// `useFocusEffect` (expo-router/React Navigation) runs a callback every time
// this screen comes into focus (including returning to it via tab switches),
// unlike a plain `useEffect` which only runs on mount/dependency change.
// `useRouter` gives imperative navigation (`router.replace`, etc.).
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, getGlobalStyles, Theme } from '../../commonStyles';
import { confirmAlert, showAlert } from '../../lib/confirmAlert';
import { signOutAndRedirect } from '../../lib/auth';
import { confirmDeleteAccount } from '../../lib/deleteAccount';
import { requestTourReplay } from '../../lib/onboarding';
import { supabase } from '../../utils/supabase';

// Shape of the profile data this screen actually needs to display. Kept
// narrow/local to this file (rather than reusing a giant shared "Profile"
// type) since this screen only ever reads these fields.
type AdminProfile = {
    display_name: string | null;
    username: string | null;
    email: string | null;
    school_district_name: string | null;
    active_view: string | null;
};

// The District Admin's "Account" tab: shows who is signed in, which
// district they're attached to, and lets them replay the onboarding tour,
// sign out, or permanently delete their account. Takes no props (it's a
// screen component rendered directly by the tab navigator) and renders the
// full-screen account UI described above.
export default function AdminAccount() {
    // `useColorScheme()` reads the OS light/dark preference; `?? 'light'`
    // covers the brief moment before the OS reports a value. `theme` is then
    // the matching palette object, and `styles`/`baseStyles` are built from
    // it below so text/backgrounds/borders automatically follow dark mode.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const baseStyles = getGlobalStyles(theme);
    const router = useRouter();

    // `loading`: true until the initial profile fetch below finishes --
    // gates the whole screen behind a spinner so we never show stale/blank
    // fields.
    const [loading, setLoading] = useState(true);
    // `profile`: the admin's own row from `profiles` (subset of columns),
    // or null until loaded. Drives every piece of text rendered below.
    const [profile, setProfile] = useState<AdminProfile | null>(null);
    // `deletingAccount`: true while the account-deletion flow is running,
    // used to disable the "Delete Account" button and show a spinner in
    // place of its label so the user can't tap it twice mid-deletion.
    const [deletingAccount, setDeletingAccount] = useState(false);

    // Fetches this signed-in user's profile fields from Supabase and stores
    // them in state. Wrapped in `useCallback` with an empty dependency array
    // so it's created once and can be safely used inside the
    // `useFocusEffect` below without re-triggering that effect on every
    // render.
    const loadProfile = useCallback(async () => {
        try {
            // Ask Supabase Auth who is currently signed in.
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Read this user's row from the `profiles` table, but only the
            // columns this screen actually needs (name, username, district
            // name, active_view). `.eq('id', user.id)` scopes it to just
            // this user; `.maybeSingle()` returns null (instead of
            // throwing) if no row is found, which is friendlier here than
            // `.single()`.
            const { data } = await supabase
                .from('profiles')
                .select('display_name, username, school_district_name, active_view')
                .eq('id', user.id)
                .maybeSingle();

            // Combine the DB row with the auth user's email (which lives on
            // the auth user object, not the `profiles` table) into the
            // shape this screen renders. `?? null` normalizes any
            // `undefined` fields to `null` to match the `AdminProfile` type.
            setProfile({
                display_name: data?.display_name ?? null,
                username: data?.username ?? null,
                email: user.email ?? null,
                school_district_name: data?.school_district_name ?? null,
                active_view: data?.active_view ?? 'admin',
            });
        } finally {
            // Runs whether the try block succeeded or threw, so the
            // spinner always goes away once the attempt is done.
            setLoading(false);
        }
    }, []);

    // `useFocusEffect` re-runs its callback every time this tab becomes the
    // active/focused screen (not just on first mount) -- so if the admin
    // edits their profile elsewhere and taps back to this tab, the data
    // refreshes automatically. Wrapping the call in an inner `useCallback`
    // (recreated only when `loadProfile` changes, which is never, since
    // `loadProfile` has an empty dep array) is required by
    // `useFocusEffect`'s API to avoid re-running on every render.
    useFocusEffect(
        useCallback(() => {
            void loadProfile();
        }, [loadProfile])
    );

    // Same optimistic-update pattern for switching between the District
    // Admin and Classic (student-style) views used by
    // teacher-account.tsx/site-admin-account.tsx/okage-account.tsx: update
    // local state immediately, persist `active_view` to Supabase, then
    // route to the matching shell -- rolling the local state back and
    // showing an alert if the database update fails.
    const applyViewSwitch = async (targetView: 'admin' | 'classic') => {
        const previousView = profile?.active_view;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setProfile(prev => prev ? { ...prev, active_view: targetView } : null);

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', user.id);

            if (error) throw error;

            router.replace((targetView === 'classic' ? '/(tabs)/dashboard' : '/(admin-tabs)/') as any);
        } catch (err: any) {
            setProfile(prev => prev ? { ...prev, active_view: previousView ?? prev.active_view } : null);
            showAlert('View Switch Failed', err.message || 'Could not update your workspace view.');
        }
    };

    // Entry point for the View Switcher's two segments. Switching TO
    // Classic Trail swaps this admin's entire navigation shell and
    // persists that choice (it's still in effect on their next login), so
    // -- unlike returning to District Admin, which just undoes that --  it
    // gets the same one-tap confirm dialog already used by Sign Out on
    // this same screen, rather than firing immediately on a single tap.
    const handleToggleAppView = (targetView: 'admin' | 'classic') => {
        if (targetView === 'classic') {
            confirmAlert(
                'Switch to Classic Trail?',
                'This switches your view to the student experience. You can return to District Admin anytime from the orange banner at the top.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Switch View', onPress: () => void applyViewSwitch('classic') },
                ]
            );
            return;
        }
        void applyViewSwitch('admin');
    };

    // Event handler for the "Sign Out" button. Shows a confirmation dialog
    // first (via the cross-platform `confirmAlert` helper) so a stray tap
    // doesn't immediately log the user out; only calls `signOutAndRedirect`
    // if they confirm by pressing the destructive "Log Out" option.
    const handleSignOutAction = () => {
        confirmAlert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => void signOutAndRedirect(router) },
        ]);
    };

    // Conditional render: while the profile is still loading, show only a
    // centered spinner instead of the (currently empty) profile fields.
    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        // ScrollView (instead of a plain View) lets this screen's content
        // scroll if it's taller than the device viewport -- important on
        // small phones or with large font-accessibility settings.
        // `contentContainerStyle={{ flexGrow: 1 }}` lets the inner content
        // still fill the screen height when it's shorter than the viewport.
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                {/* Header block: avatar circle + name + role label. Falls
                    back through display_name -> username -> a generic label
                    if neither is set, so this never renders blank. */}
                <View style={baseStyles.profileImageContainer}>
                    <View style={[baseStyles.avatarRing]}>
                        <View style={[styles.iconAvatar, { backgroundColor: theme.surface }]}>
                            <Ionicons name="business" size={44} color={theme.accent} />
                        </View>
                    </View>
                    <Text style={baseStyles.profileGreeting} accessibilityRole="header">
                        {profile?.display_name || profile?.username || 'District Administrator'}
                    </Text>
                    <Text style={baseStyles.profileSubtext}>District Administrator</Text>
                </View>

                {/* View Switcher. A styled Pressable row rather than each
                    platform's native segmented control (UISegmentedControl
                    on iOS, Material SegmentedButtons on Android) -- a
                    deliberate choice, not an oversight: this component is
                    shared verbatim across web/iOS/Android (see PRODUCT.md's
                    Operating Context), and neither native control has a web
                    equivalent, so using either would mean a second,
                    platform-forked implementation of this same toggle. What
                    IS fixed here is the accessible semantics: wrapping the
                    two `role="radio"` Pressables in a `radiogroup` gives
                    screen readers the same "one control, N options" model a
                    real segmented control exposes natively, instead of two
                    unrelated standalone radios. Revisit the "styled
                    Pressables" choice only if this toggle gains a native-
                    only distribution (no web target). Caught by an
                    /impeccable adapt pass. */}
                <View style={[styles.viewSwitcherBox, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                    <Text style={[styles.switcherTitle, { color: theme.text }]} accessibilityRole="header">Active App View</Text>
                    <View style={styles.segmentedBar} accessibilityRole="radiogroup" aria-label="Active app view">
                        <Pressable style={[styles.segmentToggle, profile?.active_view === 'admin' && { backgroundColor: theme.accent }]} onPress={() => void handleToggleAppView('admin')} accessibilityRole="radio" accessibilityState={{ selected: profile?.active_view === 'admin' }} aria-selected={profile?.active_view === 'admin'}>
                            <Ionicons name="business" size={14} color={profile?.active_view === 'admin' ? theme.accentText : theme.text} />
                            <Text style={[styles.segmentLabel, profile?.active_view === 'admin' ? { color: theme.accentText } : { color: theme.text }]}>District Admin</Text>
                        </Pressable>
                        <Pressable style={[styles.segmentToggle, profile?.active_view === 'classic' && { backgroundColor: theme.accent }]} onPress={() => void handleToggleAppView('classic')} accessibilityRole="radio" accessibilityState={{ selected: profile?.active_view === 'classic' }} aria-selected={profile?.active_view === 'classic'}>
                            <Ionicons name="walk" size={14} color={profile?.active_view === 'classic' ? theme.accentText : theme.text} />
                            <Text style={[styles.segmentLabel, profile?.active_view === 'classic' ? { color: theme.accentText } : { color: theme.text }]}>Classic Trail</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={baseStyles.AccountMain}>
                    {/* Read-only info card: district name and email pulled
                        straight from `profile` state, with dash/placeholder
                        fallbacks when a field is missing. */}
                    <View style={[baseStyles.card]}>
                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DISTRICT</Text>
                        <Text style={[styles.fieldValue, { color: theme.text }]}>{profile?.school_district_name || 'Not assigned'}</Text>

                        <View style={[baseStyles.divider, { marginVertical: 14 }]} />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>EMAIL</Text>
                        <Text style={[styles.fieldValue, { color: theme.text }]}>{profile?.email || '—'}</Text>
                    </View>

                    <Text style={[styles.helperText, { color: theme.subtext }]}>
                        District/school/class-level reporting only — this account never has access to individual student names, ids, or activity.
                    </Text>

                    {/* `Pressable` is React Native's generic tappable
                        wrapper (like a `<button>` but works identically on
                        iOS/Android/web). `accessibilityRole="button"` tells
                        screen readers to announce it as a button. */}
                    <Pressable
                        onPress={() => requestTourReplay('admin')}
                        style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.accent }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14, fontFamily: 'Georgia' }}>Replay Tour</Text>
                    </Pressable>

                    <Pressable
                        onPress={handleSignOutAction}
                        // paddingVertical 13 (not 10) clears the 44px touch-
                        // target floor -- same fix already applied to this
                        // exact button on student-account.tsx and
                        // teacher-account.tsx after an /impeccable critique
                        // round caught 10 measuring 39px live.
                        style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.error }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.error, fontWeight: '600', fontSize: 14, fontFamily: 'Georgia' }}>Sign Out</Text>
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
        {/* Conditional render: swap the label for a spinner while the
                        deletion request is in flight, so there's visible
                        feedback and the disabled Pressable doesn't look inert. */}
                    {deletingAccount ? (
                            <ActivityIndicator color={theme.subtext} size="small" />
                        ) : (
                            <Text style={{ color: theme.subtext, fontWeight: '600', fontSize: 13, textDecorationLine: 'underline', fontFamily: 'Georgia' }}>Delete Account</Text>
                        )}
                    </Pressable>
                </View>

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

// `getStyles` is a function (not a plain object) because it needs the
// current `theme` to bake theme-dependent values into the stylesheet. It's
// called once per render near the top of the component and memoizing it
// isn't attempted here (a common, cheap-enough pattern in this codebase).
// -- layout style: centers the loading spinner --
// -- avatar style: the circular icon badge in the header --
// -- text styles: field labels/values in the info card, and the italic
//    helper text below it --
const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    iconAvatar: { width: 106, height: 106, borderRadius: 53, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    // fontFamily: 'Georgia' added to fieldLabel/switcherTitle/segmentLabel
    // -- DESIGN.md's Serif-for-Names Rule covers field/section labels and
    // "a button's action" alike, and all three had silently fallen back to
    // the system sans font. Caught by an /impeccable audit.
    // fontWeight bumped 700->800 -- this is an Eyebrow-role label (11px
    // uppercase kicker), and every sibling Eyebrow-style label in this
    // shell (kicker, groupLabel, sectionHeading) uses the documented 800.
    // Caught by an /impeccable critique.
    fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4, fontFamily: 'Georgia' },
    fieldValue: { fontSize: 16, fontWeight: '600', fontFamily: 'Georgia' },
    // fontSize bumped 12->13 -- this is the screen's core privacy-
    // reassurance sentence ("this account never has access to individual
    // student names..."), missed by the prior Georgia/caption-size passes
    // on this file. Caught by an /impeccable critique.
    helperText: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
    // Same View Switcher styling used by teacher-account.tsx/
    // site-admin-account.tsx/okage-account.tsx.
    // shadowOffset/Opacity/Radius/elevation added -- was the one card on
    // this screen with a border but no ambient shadow, unlike baseStyles.card
    // just below it. Caught by an /impeccable audit.
    viewSwitcherBox: { borderWidth: 1, padding: 14, borderRadius: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
    switcherTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10, textAlign: 'center', fontFamily: 'Georgia' },
    segmentedBar: { flexDirection: 'row', gap: 8 },
    // paddingVertical 10 (matching the pattern this style was copied from)
    // measured ~36px live -- under the 44pt/48dp touch-target floor. 14
    // matches the paddingVertical already used by this screen's Sign Out/
    // Delete Account buttons, which were fixed to clear the same floor
    // after an earlier /impeccable critique caught them at 39px.
    segmentToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 10, backgroundColor: theme.background, minHeight: 44 },
    segmentLabel: { fontSize: 13, fontWeight: '700', fontFamily: 'Georgia' },
});
