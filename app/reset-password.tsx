// app/reset-password.tsx
// Used after a password reset link opens the app. The user enters a new
// password here and Supabase updates the active session.

// "React" is imported so JSX below can compile (some setups need it in
// scope even if you never type "React." explicitly).
// "useState" is a React hook that gives a component its own piece of
// memory ("state") that persists between renders and triggers a re-render
// whenever it's updated.
import React, { useState } from 'react';

// "View" = generic layout container (like a <div>).
// "Text" = required wrapper for any visible text.
// "TextInput" = an editable text box the user can type into.
// "Alert" = shows a native popup dialog with a title/message/buttons.
// "Platform" = lets us branch logic based on which OS the app is running
// on -- needed here because RN's Alert.alert() is a silent no-op on web.
// "StyleSheet" = builds style objects.
import { View, Text, TextInput, Pressable, Alert, Platform, StyleSheet, useColorScheme } from 'react-native';

// Our shared Supabase client, used to talk to the backend/auth system.
import { supabase } from '../utils/supabase';

// Navigation hook, used here to send the user back to the home/root screen
// once their password is updated. Link gives this screen an escape hatch
// back to /login for anyone who arrived via an old/expired reset link.
import { useRouter, Link } from 'expo-router';

// The shared Button component (note: this imports the one in
// components/Button.tsx, a *different* file from app/Button.tsx seen
// earlier — the app has two near-duplicate Button components).
import Button from '../components/Button';
import WebContainer from '../components/WebContainer';
import PartnershipAcknowledgement from '../components/PartnershipAcknowledgement';
import { colors, Theme } from '../commonStyles';
import { resolveAppShellPath } from '../lib/access';

export default function ResetPassword() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    // `newPassword` holds whatever the user has typed so far.
    // `setNewPassword` is the function used to update it — calling it
    // triggers React to re-render this component with the new value.
    // useState('') means the initial value is an empty string.
    const [newPassword, setNewPassword] = useState('');

    // A second copy of the new password the user re-types, purely to catch
    // typos before they're committed -- there's no way to "see" what you
    // typed into a masked secureTextEntry field otherwise.
    const [confirmPassword, setConfirmPassword] = useState('');

    // Tracks whether we're currently waiting on the network request to
    // Supabase, so we can disable/relabel the button and avoid the user
    // double-tapping "Update" while it's already in progress.
    const [loading, setLoading] = useState(false);

    // Inline replacement for what used to be an Alert.alert() on every
    // validation failure — shown near the fields instead of an OS dialog.
    const [formError, setFormError] = useState<string | null>(null);

    // Grabs the router so we can navigate the user away after success.
    const router = useRouter();

    // Same web-vs-native alert helper as app/login.tsx and app/signup.tsx.
    // Matters here specifically because RN's Alert.alert() is a silent
    // no-op on react-native-web -- without this, a successful password
    // reset on web (the app's primary classroom surface) showed zero
    // confirmation before redirecting.
    const showAlert = (title: string, message: string) => {
        if (Platform.OS === 'web') {
            alert(`${title}\n\n${message}`);
        } else {
            Alert.alert(title, message);
        }
    };

    // Commit the new password to Supabase and return the user to the app.
    // "async function" means this function can use "await" inside it to
    // pause until a Promise (like a network request) finishes.
    async function updatePassword() {
        // Basic client-side validation: Supabase itself also enforces a
        // minimum password length, but checking here first avoids an
        // unnecessary network round-trip and gives the user faster
        // feedback. `6` is the minimum number of characters required.
        // Guard against a double-tap firing two concurrent update
        // requests while the first one is still in flight (the Button
        // component this screen uses has no built-in disabled state).
        if (loading) {
            return;
        }

        if (newPassword.length < 6) {
            setFormError("Password must be at least 6 characters.");
            // Stop here — don't proceed to actually calling Supabase.
            return;
        }

        if (newPassword !== confirmPassword) {
            setFormError("Passwords don't match. Re-type them to confirm.");
            return;
        }

        // Flip loading on so the UI can show a "working" state.
        setFormError(null);
        setLoading(true);

        // Ask Supabase to update the currently logged-in user's password.
        // This only works because the user already has an active session
        // (they got here via a password-reset deep link, which logs them
        // in temporarily). `error` will be null on success, or an object
        // describing what went wrong on failure.
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) {
            // Supabase returns a literal "Auth session missing!" when this
            // screen is reached without a valid recovery session (e.g. an
            // expired or already-used reset link, or navigating here
            // directly) -- translate that specific case into something a
            // student or parent can actually act on, and pass anything
            // else (e.g. "Password should be at least 6 characters")
            // through as-is.
            setFormError(
                error.message.toLowerCase().includes('session')
                    ? "This reset link has expired or was already used. Request a new one from the login screen."
                    : error.message
            );
        } else {
            showAlert("Success", "Password updated! Logging you in...");
            // Resolve the destination directly rather than sending the user
            // to '/' and hoping app/_layout.tsx's auth listener redirects
            // them onward: updateUser() fires a USER_UPDATED auth event,
            // which _layout.tsx's listener deliberately does NOT act on (it
            // only redirects on SIGNED_IN/SIGNED_OUT/INITIAL_SESSION/
            // PASSWORD_RECOVERY) -- so '/' would have stranded a signed-in
            // user on a non-session-aware screen (index.web.tsx's static
            // marketing homepage on web, the onboarding carousel on
            // native), the same class of bug login.tsx's redirect already
            // fixed once. Found by an /impeccable audit.
            const { data: { user } } = await supabase.auth.getUser();
            let shellPath: ReturnType<typeof resolveAppShellPath> = '/(tabs)/dashboard';
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('app_role, active_view')
                    .eq('id', user.id)
                    .maybeSingle();
                shellPath = resolveAppShellPath(profile);
            }
            router.replace(shellPath);
        }

        // Whether it succeeded or failed, we're done loading — reset the
        // button back to its normal state.
        setLoading(false);
    }

    return (
        <View style={styles.container}>
            <WebContainer maxWidth={420} style={{ width: '100%' }}>
                <Text style={styles.title}>Create New Password</Text>
                <Text style={styles.fieldLabel}>New password</Text>
                <TextInput
                    style={styles.input}
                    accessibilityLabel="New password"
                    // Grey placeholder text shown when the field is empty.
                    placeholder="New Password"
                    placeholderTextColor={theme.subtext}
                    // Masks the typed characters with dots, like a normal
                    // password field, so the new password isn't shown in
                    // plain text on screen.
                    secureTextEntry
                    // "Controlled input" pattern: the TextInput's displayed
                    // value is always exactly whatever `newPassword` currently
                    // is in state — React state drives what's on screen,
                    // rather than the TextInput remembering its own text.
                    value={newPassword}
                    // Every keystroke calls setNewPassword with the entire
                    // updated string, updating state (and thus re-rendering
                    // this component with the latest value).
                    onChangeText={(t) => { setNewPassword(t); setFormError(null); }}
                    textContentType="newPassword"
                    autoComplete="new-password"
                />
                <Text style={styles.fieldLabel}>Confirm password</Text>
                <TextInput
                    style={styles.input}
                    accessibilityLabel="Confirm password"
                    placeholder="Re-enter New Password"
                    placeholderTextColor={theme.subtext}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setFormError(null); }}
                    textContentType="newPassword"
                    autoComplete="new-password"
                />

                {formError && <Text style={styles.formError} accessibilityLiveRegion="assertive" role="alert">{formError}</Text>}

                <Button
                    // The label text swaps to "Updating..." while the request
                    // is in flight, giving the user visual feedback that
                    // something is happening.
                    label={loading ? "Updating..." : "Update Password"}
                    onPress={updatePassword}
                />

                {/* Escape hatch: this screen previously had no way out at
                    all for someone who arrived via an old/expired link or
                    changed their mind. */}
                <Link href="/login" asChild>
                    <Pressable style={{ marginTop: 20 }}>
                        <Text style={styles.linkText}>Cancel and back to Log In</Text>
                    </Pressable>
                </Link>

                {/* Same partnership acknowledgement shown on login.tsx and
                    the student/teacher account screens -- see login.tsx
                    for why this belongs on every auth screen, not just
                    signup. */}
                <PartnershipAcknowledgement style={styles.acknowledgementText} />
            </WebContainer>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    // Inline object (not broken across multiple lines) — functionally
    // identical to the multi-line style objects seen in other files, just
    // more compact.
    container: {
        flex: 1,               // fill the whole screen
        justifyContent: 'center', // vertically center the form
        padding: 20,            // 20px breathing room around the edges
        backgroundColor: theme.background
    },
    title: {
        fontFamily: 'Georgia',
        fontSize: 24,       // large heading text
        fontWeight: 'bold', // bold weight (equivalent to '700')
        color: theme.text,
        marginBottom: 20,    // 20px of space below the title, before the input
        textAlign: 'center'  // matches login.tsx and signup.tsx's centered titles
    },
    // Matches login.tsx's fieldLabel (see there for why this replaced the
    // old bold-uppercase micro-label style, and why it's upright rather
    // than italic at this size).
    fieldLabel: {
        fontFamily: 'Georgia',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.2,
        color: theme.subtext,
        marginBottom: 4
    },
    input: {
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        fontSize: 16,
        color: theme.text,
        fontFamily: 'Georgia',
        marginBottom: 15     // 15px of space below the input, before the button
    },
    linkText: {
        color: theme.accent,
        textAlign: 'center',
        fontWeight: '600'
    },
    formError: {
        // Matches signup.tsx's searchErrorText / login.tsx's formError red.
        color: theme.error,
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 14,
    },
    // Matches login.tsx's acknowledgementText (see there for why).
    acknowledgementText: {
        fontSize: 11,
        lineHeight: 16,
        color: theme.subtext,
        textAlign: 'center',
        paddingHorizontal: 32,
        paddingTop: 24,
        paddingBottom: 16,
    }
});
