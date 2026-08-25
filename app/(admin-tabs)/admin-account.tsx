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
// and sign out. No view switcher -- District Administrators don't preview
// the Teacher or Student experience; that capability lives on the Site
// Administrator account screen instead (lib/access.ts's
// getAllowedTeacherViews returns only ['admin'] for this role).

import { Ionicons } from '@expo/vector-icons';
// `useFocusEffect` (expo-router/React Navigation) runs a callback every time
// this screen comes into focus (including returning to it via tab switches),
// unlike a plain `useEffect` which only runs on mount/dependency change.
// `useRouter` gives imperative navigation (`router.replace`, etc.).
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, getGlobalStyles, Theme } from '../../commonStyles';
import { confirmAlert } from '../../lib/confirmAlert';
import { signOutAndRedirect } from '../../lib/auth';
import { confirmDeleteAccount } from '../../lib/deleteAccount';
import { requestTourReplay } from '../../lib/onboarding';
import { supabase } from '../../utils/supabase';

// Shape of the profile data this screen actually needs to display. Kept
// narrow/local to this file (rather than reusing a giant shared "Profile"
// type) since this screen only ever reads these 4 fields.
type AdminProfile = {
    display_name: string | null;
    username: string | null;
    email: string | null;
    school_district_name: string | null;
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
            // 3 columns this screen actually displays (name, username,
            // district name). `.eq('id', user.id)` scopes it to just this
            // user; `.maybeSingle()` returns null (instead of throwing) if
            // no row is found, which is friendlier here than `.single()`.
            const { data } = await supabase
                .from('profiles')
                .select('display_name, username, school_district_name')
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
                        <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Replay Tour</Text>
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
        {/* Conditional render: swap the label for a spinner while the
                        deletion request is in flight, so there's visible
                        feedback and the disabled Pressable doesn't look inert. */}
                    {deletingAccount ? (
                            <ActivityIndicator color={theme.subtext} size="small" />
                        ) : (
                            <Text style={{ color: theme.subtext, fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' }}>Delete Account</Text>
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
    fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
    fieldValue: { fontSize: 16, fontWeight: '600', fontFamily: 'Georgia' },
    helperText: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
});
