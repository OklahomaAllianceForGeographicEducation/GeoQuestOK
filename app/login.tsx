// app/login.tsx
// Email/password sign-in flow. After authentication it also ensures the user
// has a profile row so the rest of the app can read display data.

import React, { useEffect, useRef, useState } from 'react';

// KeyboardAvoidingView automatically shifts its content up when the
// on-screen keyboard opens, so the keyboard doesn't cover the input
// fields/button. Platform lets us branch logic based on which OS the app
// is running on (iOS, Android, or web).
import { Alert, TextInput, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, useColorScheme } from 'react-native';

import { supabase } from '../utils/supabase';

// Link is used here for the "Sign Up" navigation link at the bottom.
import { useRouter, useLocalSearchParams, Link } from 'expo-router';

// Builds the deep link a password-reset email should send the user back
// to. createURL() resolves to the right thing on both platforms:
// "expotestdev://reset-password" on native, the dev/prod web origin here.
import * as Linking from 'expo-linking';

import Button from '../components/Button';
import WebContainer from '../components/WebContainer';
import PartnershipAcknowledgement from '../components/PartnershipAcknowledgement';
import { colors, Theme } from '../commonStyles';
import { Sentry } from '../lib/sentry';

// A helper (defined in lib/profiles.ts) that makes sure a "profiles"
// table row exists for a given user — creating one if it's missing. Used
// right after login in case a user's profile row somehow never got
// created (e.g. an interrupted signup).
import { ensureProfileRow } from '../lib/profiles';
import { resolveAppShellPath } from '../lib/access';

// How long to wait for a Supabase auth request before giving up and
// showing a "this is taking a while" message instead of leaving the
// button spinning forever. Raised from 15s after a beta-launch spike of
// TIMEOUT errors traced to school networks (shared/filtered wifi, a
// classroom of students logging in at once) where 15s was too tight for
// otherwise-healthy requests.
const AUTH_REQUEST_TIMEOUT_MS = 25000;

export default function Login() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    // Separate from `loading` since it drives a different action (the
    // "Forgot password?" link) that can't fire while a sign-in is also
    // in flight, but shouldn't be described by "Logging in...".
    const [resetLoading, setResetLoading] = useState(false);
    // Same idea, for the "Resend confirmation email" action -- surfaced
    // when a sign-in attempt fails specifically because the account's
    // email was never confirmed (see the email_not_confirmed check in
    // signInWithEmail below). Without this, the only way to recover a
    // beta user stuck in that state was deleting and recreating their
    // auth.users row from the Supabase dashboard.
    const [resendLoading, setResendLoading] = useState(false);
    const [showResendConfirmation, setShowResendConfirmation] = useState(false);
    // Inline, on-screen replacements for what used to be a generic
    // alert()/Alert.alert() for every validation and request failure —
    // shown near the fields/button instead of an OS dialog that breaks
    // the visual language and never points at what needs fixing.
    const [formError, setFormError] = useState<string | null>(null);
    const [formNotice, setFormNotice] = useState<string | null>(null);
    const router = useRouter();

    // Supabase's client doesn't support cancelling an in-flight auth
    // request, so a client-side timeout (see AUTH_REQUEST_TIMEOUT_MS
    // above) can "give up" on a request that's actually still running on
    // the network. If the user then retries, that abandoned request can
    // still resolve later -- and without this guard, its stale result
    // could clobber a newer attempt's outcome (e.g. re-navigating, or
    // overwriting a fresh error with a stale one), and every retry adds
    // another concurrent request on top of ones we've already given up
    // on, compounding load exactly when Supabase is already slow. This
    // ref lets a new attempt mark any previous one as stale so its result
    // is ignored when it eventually arrives.
    const activeSignInRef = useRef<AbortController | null>(null);

    // If the user navigates away (e.g. taps "Sign Up", or an auth listener
    // elsewhere redirects them) while a sign-in is still in flight, mark it
    // stale so its eventual result -- including a router.replace() -- can't
    // fire against a screen that's no longer mounted.
    useEffect(() => {
        return () => {
            activeSignInRef.current?.abort();
        };
    }, []);

    // Signup confirmation links now point here with a token_hash/type query
    // pair (see supabase/email-templates/confirm-signup.html) instead of
    // Supabase's own {{ .ConfirmationURL }} verify endpoint -- that old link
    // confirmed the account (and burned the one-time token) on the mere
    // HTTP GET, which email security scanners (e.g. Microsoft Defender Safe
    // Links on university/corporate inboxes -- relevant here since teachers
    // sign up with a school email) fetch automatically to check for
    // phishing, consuming the link before the real user ever clicks it.
    // Verifying explicitly here, from our own page's JS, means a scanner
    // fetching this URL just loads the login page and never touches
    // Supabase's API. A successful verifyOtp() establishes a session, which
    // fires the SIGNED_IN event app/_layout.tsx's listener already redirects
    // on -- so no manual navigation is needed here on success.
    const {
        token_hash: tokenHashParam,
        type: typeParam,
        email: emailParam,
        resend: resendParam,
    } = useLocalSearchParams<{ token_hash?: string; type?: string; email?: string; resend?: string }>();

    // Arrives from signup.tsx when create-account rejects a signup because
    // the email already has an unconfirmed auth.users row (its
    // 'account_exists' error code) -- rather than leaving the person stuck
    // re-reading that error on the signup screen, land them here with the
    // email prefilled and the "Resend confirmation email" action already
    // showing, so finishing confirmation is self-service.
    useEffect(() => {
        const prefillEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam;
        const resend = Array.isArray(resendParam) ? resendParam[0] : resendParam;

        if (!prefillEmail || resend !== '1') {
            return;
        }

        setEmail(prefillEmail);
        setShowResendConfirmation(true);
        setFormNotice("Looks like you already started signing up with this email but haven't confirmed it yet. Resend the confirmation email below, or log in if you've already clicked the link.");
        // Only meant to run once, off the params this screen was navigated
        // to with -- not on every re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const tokenHash = Array.isArray(tokenHashParam) ? tokenHashParam[0] : tokenHashParam;
        const type = Array.isArray(typeParam) ? typeParam[0] : typeParam;

        if (!tokenHash || type !== 'signup') {
            return;
        }

        setFormError(null);
        setFormNotice('Confirming your email...');
        supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' }).then(({ error }) => {
            if (error) {
                setFormNotice(null);
                setFormError('This confirmation link has expired or was already used. Sign up again, or log in below if your account is already confirmed.');
            } else {
                setFormNotice('Email confirmed! Logging you in...');
            }
        });
    }, [tokenHashParam, typeParam]);

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

        // .trim() strips leading/trailing whitespace so a stray space
        // doesn't count as "something was typed". Password isn't trimmed
        // since spaces could theoretically be intentional in a password.
        if (!email.trim() || !password) {
            setFormError("Enter your email and password to log in.");
            return;
        }

        // Guard against a double-tap firing two concurrent sign-in
        // requests while the first one is still in flight.
        if (loading) {
            return;
        }

        // Fail-safe check if Supabase didn't initialize
        // (e.g. missing environment variables). Prevents a confusing crash
        // further down by catching the problem early with a clear message.
        if (!supabase) {
            setFormError("This app isn't connected to its backend right now. Try again shortly, or contact your teacher/admin if this keeps happening.");
            return;
        }

        setFormError(null);
        setFormNotice(null);
        setShowResendConfirmation(false);
        setLoading(true);

        // Mark any still-pending previous attempt as stale before starting
        // this one, so if it resolves later (Supabase doesn't let us
        // actually cancel the underlying request) we ignore it instead of
        // acting on it out from under this newer attempt.
        activeSignInRef.current?.abort();
        const attempt = new AbortController();
        activeSignInRef.current = attempt;

        try {
            // Build a Promise that automatically rejects (fails) after
            // AUTH_REQUEST_TIMEOUT_MS if nothing else resolves it first.
            // `<never>` means this Promise is only ever expected to
            // reject, never successfully resolve with a value.
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), AUTH_REQUEST_TIMEOUT_MS);
            });

            // Promise.race() runs multiple promises simultaneously and
            // takes whichever one finishes (resolves OR rejects) FIRST.
            // Here that means: either Supabase responds in time (normal
            // case), or the timeoutPromise "wins" and throws a TIMEOUT
            // error — preventing the user from waiting forever on a hung
            // network request.
            const { data, error } = await Promise.race([
                supabase.auth.signInWithPassword({ email, password }),
                timeoutPromise,
            ]);

            // A newer attempt (the user retried after this one timed out)
            // has already taken over -- don't act on this stale result.
            if (attempt.signal.aborted) {
                return;
            }

            if (error) {
                console.error("Supabase Authentication Error:", error);
                setFormError(error.message);
                // Supabase's own error_code for this case is
                // 'email_not_confirmed' -- surfaced when Teacher/Site
                // Admin/District Admin signups (the roles that require
                // email verification, see EMAIL_VERIFICATION_SETUP.md)
                // haven't clicked their confirmation link yet, or the
                // original link expired/was lost. Offering a resend here
                // means this is self-service instead of requiring an admin
                // to delete and recreate the account from the dashboard.
                if (error.code === 'email_not_confirmed') {
                    setShowResendConfirmation(true);
                }
                return;
            }

            console.log("Supabase Login Successful. Session data:", data);

            // A successful login should include a session object; this is
            // an extra safety check in case Supabase ever returns success
            // without one.
            if (data.session) {
                // Resolve where this user actually belongs before
                // navigating anywhere. Previously this sent everyone to
                // "/" and relied on app/_layout.tsx's auth listener to
                // redirect onward once its own (async) profile lookup
                // resolved. That works on native, where "/" is a
                // session-aware screen -- but on web "/" resolves to
                // index.web.tsx, the static marketing homepage, which has
                // no session awareness at all. The two navigations raced,
                // and when _layout.tsx's lookup lost the race, a
                // successfully-logged-in user landed on the marketing
                // homepage with no visible sign they were ever signed in
                // (confirmed live during an /impeccable audit -- reload
                // was the only fix, and nothing told the user to do that).
                // Resolving the destination directly here removes the
                // race for the initial redirect entirely.
                let shellPath: ReturnType<typeof resolveAppShellPath> = '/(tabs)/dashboard';

                if (data.user) {
                    // Make sure this user has a row in the "profiles"
                    // table. `user_metadata?.username` uses optional
                    // chaining in case user_metadata itself is missing.
                    // Raced against its own timeout too -- the first race
                    // above only covers signInWithPassword, and a hung
                    // request here would otherwise leave "Logging in..."
                    // spinning forever even though sign-in already succeeded.
                    const profileTimeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error('TIMEOUT')), AUTH_REQUEST_TIMEOUT_MS);
                    });
                    const { error: profileError } = await Promise.race([
                        ensureProfileRow({
                            userId: data.user.id,
                            email: data.user.email,
                            username: data.user.user_metadata?.username,
                        }),
                        profileTimeoutPromise,
                    ]);

                    // Bail if a newer attempt took over while this was in flight.
                    if (attempt.signal.aborted) {
                        return;
                    }

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

                    // ensureProfileRow's upsert doesn't select its row back,
                    // so look the role up directly rather than guessing.
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('app_role, active_view')
                        .eq('id', data.user.id)
                        .maybeSingle();
                    shellPath = resolveAppShellPath(profile);
                }

                // A newer attempt may have taken over while the profile
                // lookup above was in flight -- let it own the navigation.
                if (attempt.signal.aborted) {
                    return;
                }

                console.log("Navigating user to", shellPath);
                router.replace(shellPath);
            } else {
                console.warn("Authentication succeeded, but no valid session was returned.");
            }
        } catch (err: any) {
            // A newer attempt already took over -- this one's error (very
            // often the TIMEOUT this whole guard exists for) is stale.
            // Nothing to show the user and nothing worth reporting to
            // Sentry, since it doesn't reflect what's currently on screen.
            if (attempt.signal.aborted) {
                console.warn("Ignoring stale login error (superseded by a newer attempt):", err);
                return;
            }

            console.error("Unexpected Login Error Caught:", err);
            Sentry.captureException(err);
            // Distinguish our custom timeout from any other kind of
            // unexpected error, so the user gets a more specific,
            // actionable message (check your connection) instead of a
            // generic one.
            if (err.message === 'TIMEOUT') {
                setFormError(
                    "This is taking longer than expected. Check your internet connection (try switching between Wi-Fi and cellular data) and try again."
                );
            } else {
                setFormError(err.message || "Something went wrong signing you in. Try again.");
            }
        } finally {
            // Only touch shared state if this is still the active attempt
            // -- a stale/superseded one shouldn't clear a newer attempt's
            // loading state out from under it.
            if (activeSignInRef.current === attempt) {
                activeSignInRef.current = null;
                // Always turn off the loading state so the button doesn't
                // get stuck saying "Logging in..." forever.
                setLoading(false);
                console.log("--- Login Attempt Complete ---");
            }
        }
    }

    // Send a password-reset email via Supabase, pointing the link back at
    // /reset-password. Clicking it establishes a session and fires a
    // PASSWORD_RECOVERY event that app/_layout.tsx routes there directly.
    async function handleForgotPassword() {
        if (resetLoading || loading) {
            return;
        }

        const cleanEmail = email.trim();
        if (!cleanEmail) {
            setFormError("Enter your email address above first, then tap \"Forgot password?\" again.");
            return;
        }

        if (!supabase) {
            setFormError("This app isn't connected to its backend right now. Try again shortly, or contact your teacher/admin if this keeps happening.");
            return;
        }

        setFormError(null);
        setFormNotice(null);
        setResetLoading(true);
        try {
            const redirectTo = Platform.OS === 'web'
                ? `${window.location.origin}/reset-password`
                : Linking.createURL('/reset-password');

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), 15000);
            });
            const { error } = await Promise.race([
                supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo }),
                timeoutPromise,
            ]);

            if (error) {
                setFormError(error.message);
                return;
            }

            setFormNotice(`If an account exists for ${cleanEmail}, a password reset link is on its way.`);
        } catch (err: any) {
            Sentry.captureException(err);
            setFormError(
                err?.message === 'TIMEOUT'
                    ? "This is taking longer than expected. Check your internet connection and try again."
                    : (err?.message || "Couldn't send the reset link. Try again.")
            );
        } finally {
            setResetLoading(false);
        }
    }

    // Re-send the signup confirmation email via Supabase, for an account
    // that's stuck unconfirmed (link expired, lost, or the original send
    // failed) -- points at the same /login confirm-link handling above,
    // via verifyOtp(). This is the self-service alternative to an admin
    // deleting and recreating the account from the Supabase dashboard.
    async function handleResendConfirmation() {
        if (resendLoading || loading) {
            return;
        }

        const cleanEmail = email.trim();
        if (!cleanEmail) {
            setFormError("Enter your email address above first, then tap \"Resend confirmation email\" again.");
            return;
        }

        if (!supabase) {
            setFormError("This app isn't connected to its backend right now. Try again shortly, or contact your teacher/admin if this keeps happening.");
            return;
        }

        setFormError(null);
        setFormNotice(null);
        setResendLoading(true);
        try {
            const emailRedirectTo = Platform.OS === 'web'
                ? `${window.location.origin}/login`
                : Linking.createURL('/login');

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), 15000);
            });
            const { error } = await Promise.race([
                supabase.auth.resend({
                    type: 'signup',
                    email: cleanEmail,
                    options: { emailRedirectTo },
                }),
                timeoutPromise,
            ]);

            if (error) {
                setFormError(error.message);
                return;
            }

            setShowResendConfirmation(false);
            setFormNotice(`If ${cleanEmail} has an account awaiting confirmation, a new confirmation email is on its way.`);
        } catch (err: any) {
            Sentry.captureException(err);
            setFormError(
                err?.message === 'TIMEOUT'
                    ? "This is taking longer than expected. Check your internet connection and try again."
                    : (err?.message || "Couldn't send the confirmation email. Try again.")
            );
        } finally {
            setResendLoading(false);
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

                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                    style={styles.input}
                    accessibilityLabel="Email"
                    placeholder="you@school.org"
                    placeholderTextColor={theme.subtext}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setFormError(null); }}
                    // Prevents the keyboard/OS from auto-capitalizing the first
                    // letter — email addresses are conventionally lowercase.
                    autoCapitalize="none"
                    autoCorrect={false}
                    // Switches to an email-optimized keyboard layout on mobile
                    // (adds an "@" key, adjusts autocomplete, etc.).
                    keyboardType="email-address"
                    // Lets the OS/browser offer saved-credential autofill,
                    // matching the same login form embedded in app/index.tsx.
                    textContentType="emailAddress"
                    autoComplete="email"
                />

                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                    style={styles.input}
                    accessibilityLabel="Password"
                    placeholder="Password"
                    placeholderTextColor={theme.subtext}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setFormError(null); }}
                    // Masks typed characters as dots.
                    secureTextEntry={true}
                    textContentType="password"
                    autoComplete="password"
                />

                <Pressable
                    onPress={handleForgotPassword}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password?"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ alignSelf: 'flex-end', marginTop: -6, marginBottom: 18 }}
                >
                    <Text style={styles.forgotPasswordText}>
                        {resetLoading ? "Sending..." : "Forgot password?"}
                    </Text>
                </Pressable>

                {/* Inline, near-the-action feedback instead of an OS
                    alert() — visible without breaking the screen's own
                    look, and it stays put so the user can re-read it
                    while fixing the fields below. */}
                {formError && <Text style={styles.formError} accessibilityLiveRegion="assertive" role="alert">{formError}</Text>}
                {formNotice && <Text style={styles.formNotice} accessibilityLiveRegion="assertive" role="alert">{formNotice}</Text>}

                {/* Only shown right after a sign-in attempt fails with
                    Supabase's email_not_confirmed error -- the account
                    exists but is stuck waiting on a confirmation link that
                    may have expired, been lost, or never sent. */}
                {showResendConfirmation && (
                    <Pressable
                        onPress={handleResendConfirmation}
                        accessibilityRole="button"
                        accessibilityLabel="Resend confirmation email"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ alignSelf: 'center', marginBottom: 14 }}
                    >
                        <Text style={styles.forgotPasswordText}>
                            {resendLoading ? "Sending..." : "Resend confirmation email"}
                        </Text>
                    </Pressable>
                )}

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

                {/* Same partnership acknowledgement already shown on the
                    student/teacher account screens (commonStyles.ts'
                    acknowledgementText) -- signing in is one of the two
                    moments a wary parent or teacher is most likely to
                    double-check this is legitimate, and it previously
                    carried none of that trust signal. */}
                <PartnershipAcknowledgement style={styles.acknowledgementText} />
            </WebContainer>
        </KeyboardAvoidingView>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: theme.background },
    title: {
        fontFamily: 'Georgia',
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 30,
        // Horizontally centers this text within its container (as opposed
        // to the default left alignment).
        textAlign: 'center'
    },
    // Replaces the old bold-uppercase micro-label with a small Georgia
    // caption -- reads like a field-guide/journal annotation instead of
    // generic form-UI chrome. Upright, not italic: italic is reserved for
    // the larger section-header tier (see DESIGN.md's Label token); at
    // this smaller size italic hurt legibility more than it added voice.
    fieldLabel: { fontFamily: 'Georgia', fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginBottom: 4, color: theme.subtext },
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
        marginBottom: 15,
    },
    forgotPasswordText: {
        color: theme.accent,
        fontSize: 13,
        fontWeight: '600',
    },
    formError: {
        // Matches signup.tsx's existing searchErrorText red — one error
        // color across the auth flow instead of inventing another.
        color: theme.error,
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 14,
    },
    formNotice: {
        color: theme.text,
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 14,
    },
    linkText: {
        color: theme.accent,
        textAlign: 'center',
        fontWeight: '600'
    },
    // Matches commonStyles.ts' acknowledgementText exactly now that
    // theme.subtext itself clears AA contrast.
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
