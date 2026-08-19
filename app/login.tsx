// app/login.tsx
// Email/password sign-in flow. After authentication it also ensures the user
// has a profile row so the rest of the app can read display data.

import React, { useState } from 'react';

// KeyboardAvoidingView automatically shifts its content up when the
// on-screen keyboard opens, so the keyboard doesn't cover the input
// fields/button. Platform lets us branch logic based on which OS the app
// is running on (iOS, Android, or web).
import { Alert, TextInput, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';

import { supabase } from '../utils/supabase';

// Link is used here for the "Sign Up" navigation link at the bottom.
import { useRouter, Link } from 'expo-router';

import Button from '../components/Button';
import WebContainer from '../components/WebContainer';

// A helper (defined in lib/profiles.ts) that makes sure a "profiles"
// table row exists for a given user — creating one if it's missing. Used
// right after login in case a user's profile row somehow never got
// created (e.g. an interrupted signup).
import { ensureProfileRow } from '../lib/profiles';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Normalize alert behavior across web and mobile.
    // React Native's Alert.alert() doesn't work in a web browser the same
    // way it does on iOS/Android, so this helper picks the right mechanism
    // depending on platform.
    const showAlert = (title: string, message: string) => {
        // Always log it too, so it shows up in developer tooling/console
        // even if the visual alert is missed.
        console.warn(`[ALERT] ${title}: ${message}`);
        if (Platform.OS === 'web') {
            // The browser's built-in alert() function only takes one
            // string, so title and message are combined with two newlines
            // between them for readability.
            alert(`${title}\n\n${message}`);
        } else {
            // On native platforms, use React Native's proper Alert API,
            // which shows a native-looking popup with a real title and body.
            Alert.alert(title, message);
        }
    };

    // Submit credentials to Supabase and route the user into the app.
    async function signInWithEmail() {
        console.log("--- Login Attempt Started ---");
        console.log("Target Email:", email);

        // .trim() strips leading/trailing whitespace so a stray space
        // doesn't count as "something was typed". Password isn't trimmed
        // since spaces could theoretically be intentional in a password.
        if (!email.trim() || !password) {
            showAlert("Missing Fields", "Please enter your email and password.");
            return;
        }

        // Fail-safe check if Supabase didn't initialize
        // (e.g. missing environment variables). Prevents a confusing crash
        // further down by catching the problem early with a clear message.
        if (!supabase) {
            showAlert("Configuration Error", "Supabase client is not initialized. Please verify your utils/supabase configuration.");
            return;
        }

        setLoading(true);
        try {
            // Build a Promise that automatically rejects (fails) after
            // 15000 milliseconds (15 seconds) if nothing else resolves it
            // first. `<never>` means this Promise is only ever expected to
            // reject, never successfully resolve with a value.
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), 15000);
            });

            // Promise.race() runs multiple promises simultaneously and
            // takes whichever one finishes (resolves OR rejects) FIRST.
            // Here that means: either Supabase responds within 15 seconds
            // (normal case), or the timeoutPromise "wins" and throws a
            // TIMEOUT error — preventing the user from waiting forever on
            // a hung network request.
            const { data, error } = await Promise.race([
                supabase.auth.signInWithPassword({ email, password }),
                timeoutPromise,
            ]);

            if (error) {
                console.error("Supabase Authentication Error:", error);
                showAlert("Login Failed", error.message);
                return;
            }

            console.log("Supabase Login Successful. Session data:", data);

            // A successful login should include a session object; this is
            // an extra safety check in case Supabase ever returns success
            // without one.
            if (data.session) {
                if (data.user) {
                    // Make sure this user has a row in the "profiles"
                    // table. `user_metadata?.username` uses optional
                    // chaining in case user_metadata itself is missing.
                    // Raced against its own timeout too -- the first race
                    // above only covers signInWithPassword, and a hung
                    // request here would otherwise leave "Logging in..."
                    // spinning forever even though sign-in already succeeded.
                    const profileTimeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error('TIMEOUT')), 15000);
                    });
                    const { error: profileError } = await Promise.race([
                        ensureProfileRow({
                            userId: data.user.id,
                            email: data.user.email,
                            username: data.user.user_metadata?.username,
                        }),
                        profileTimeoutPromise,
                    ]);

                    if (profileError) {
                        console.error("Profile Bootstrap Error:", profileError);
                        // Login still succeeds even if this fails — the
                        // user just gets a warning that their profile data
                        // might be incomplete, rather than being blocked
                        // from entering the app entirely.
                        showAlert(
                            "Profile Setup Warning",
                            `${profileError.message}\n\nYour account was created, but the profile row could not be saved. Check profiles INSERT/UPSERT RLS policy.`
                        );
                    }
                }

                console.log("Navigating user to app root...");
                // Send the user to "/", where app/_layout.tsx's auth
                // listener picks up the now-active session and redirects
                // them to the correct role-specific tab group.
                router.replace('/');
            } else {
                console.warn("Authentication succeeded, but no valid session was returned.");
            }
        } catch (err: any) {
            console.error("Unexpected Login Error Caught:", err);
            // Distinguish our custom 15-second timeout from any other kind
            // of unexpected error, so the user gets a more specific,
            // actionable message (check your connection) instead of a
            // generic one.
            if (err.message === 'TIMEOUT') {
                showAlert(
                    "Login Timed Out",
                    "This is taking longer than expected. Check your internet connection (try switching between Wi-Fi and cellular data) and try again."
                );
            } else {
                showAlert("Unexpected Error", err.message || "An unexpected error occurred during sign-in.");
            }
        } finally {
            // Runs no matter what happened above — always turn off the
            // loading state so the button doesn't get stuck saying
            // "Logging in..." forever.
            setLoading(false);
            console.log("--- Login Attempt Complete ---");
        }
    }

    return (
        <KeyboardAvoidingView
            // iOS needs "padding" behavior (push content up by adding
            // padding at the bottom) to avoid the keyboard overlapping
            // inputs; Android handles this differently and generally works
            // better with "height" behavior (actually shrink the view).
            // Platform.OS === 'ios' ? 'padding' : 'height' picks the right
            // one automatically based on which OS is running.
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            {/* On a wide browser window, WebContainer caps this form to a
                comfortable card width and centers it instead of letting
                the inputs stretch edge-to-edge across the screen. On
                native/narrow web it's a no-op passthrough. */}
            <WebContainer maxWidth={420} style={{ width: '100%' }}>
                <Text style={styles.title}>Welcome Back</Text>

                <Text style={styles.fieldLabel}>EMAIL</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    // Prevents the keyboard/OS from auto-capitalizing the first
                    // letter — email addresses are conventionally lowercase.
                    autoCapitalize="none"
                    // Switches to an email-optimized keyboard layout on mobile
                    // (adds an "@" key, adjusts autocomplete, etc.).
                    keyboardType="email-address"
                />

                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    // Masks typed characters as dots.
                    secureTextEntry={true}
                />

                <Button
                    label={loading ? "Logging in..." : "Login"}
                    onPress={signInWithEmail}
                />

                {/* asChild tells Link "don't render your own wrapper element —
                    instead, pass your navigation behavior down to my single
                    child (the Pressable) directly." This lets the Pressable
                    control its own styling/appearance while still being fully
                    tappable-to-navigate like a Link. */}
                <Link href="/signup" asChild>
                    <Pressable style={{ marginTop: 20 }}>
                        {/* &apos; is the HTML/JSX escape code for a plain
                            apostrophe ('). It's used here instead of typing a
                            raw ' character because a bare apostrophe inside
                            JSX text can sometimes trip up linters that expect
                            it to be escaped. */}
                        <Text style={styles.linkText}>Don&apos;t have an account? Sign Up</Text>
                    </Pressable>
                </Link>
            </WebContainer>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 30,
        // Horizontally centers this text within its container (as opposed
        // to the default left alignment).
        textAlign: 'center'
    },
    fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4, color: '#8E8E93' },
    input: { borderWidth: 1, borderColor: '#ccc', padding: 15, borderRadius: 8, marginBottom: 15 },
    linkText: {
        // A standard iOS "system blue" color, commonly used for tappable
        // links/actions so users instantly recognize it as interactive.
        color: '#007AFF',
        textAlign: 'center',
        fontWeight: '600'
    }
});
