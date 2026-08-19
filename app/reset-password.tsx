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
// "StyleSheet" = builds style objects.
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';

// Our shared Supabase client, used to talk to the backend/auth system.
import { supabase } from '../utils/supabase';

// Navigation hook, used here to send the user back to the home/root screen
// once their password is updated.
import { useRouter } from 'expo-router';

// The shared Button component (note: this imports the one in
// components/Button.tsx, a *different* file from app/Button.tsx seen
// earlier — the app has two near-duplicate Button components).
import Button from '../components/Button';
import WebContainer from '../components/WebContainer';

export default function ResetPassword() {
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

    // Grabs the router so we can navigate the user away after success.
    const router = useRouter();

    // Commit the new password to Supabase and return the user to the app.
    // "async function" means this function can use "await" inside it to
    // pause until a Promise (like a network request) finishes.
    async function updatePassword() {
        // Basic client-side validation: Supabase itself also enforces a
        // minimum password length, but checking here first avoids an
        // unnecessary network round-trip and gives the user faster
        // feedback. `6` is the minimum number of characters required.
        if (newPassword.length < 6) {
            // Shows a native alert popup with an "Error" title and this
            // message. Since no buttons are specified, it defaults to a
            // single "OK" button.
            Alert.alert("Error", "Password must be at least 6 characters.");
            // Stop here — don't proceed to actually calling Supabase.
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert("Error", "Passwords don't match. Please re-type them to confirm.");
            return;
        }

        // Flip loading on so the UI can show a "working" state.
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
            // Show whatever error message Supabase returned (e.g. "Password
            // should be at least 6 characters" or a network issue).
            Alert.alert("Error", error.message);
        } else {
            Alert.alert("Success", "Password updated! Logging you in...");
            // Send the user to the root route. Since they now have a valid
            // session, app/_layout.tsx's auth listener will pick that up
            // and redirect them further to the correct role-based screen.
            router.replace('/');
        }

        // Whether it succeeded or failed, we're done loading — reset the
        // button back to its normal state.
        setLoading(false);
    }

    return (
        <View style={styles.container}>
            <WebContainer maxWidth={420} style={{ width: '100%' }}>
                <Text style={styles.title}>Create New Password</Text>
                <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
                <TextInput
                    style={styles.input}
                    // Grey placeholder text shown when the field is empty.
                    placeholder="New Password"
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
                    onChangeText={setNewPassword}
                />
                <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Re-enter New Password"
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                />
                <Button
                    // The label text swaps to "Updating..." while the request
                    // is in flight, giving the user visual feedback that
                    // something is happening.
                    label={loading ? "Updating..." : "Update Password"}
                    onPress={updatePassword}
                />
            </WebContainer>
        </View>
    );
}

const styles = StyleSheet.create({
    // Inline object (not broken across multiple lines) — functionally
    // identical to the multi-line style objects seen in other files, just
    // more compact.
    container: {
        flex: 1,               // fill the whole screen
        justifyContent: 'center', // vertically center the form
        padding: 20,            // 20px breathing room around the edges
        backgroundColor: '#fff' // plain white background
    },
    title: {
        fontSize: 24,       // large heading text
        fontWeight: 'bold', // bold weight (equivalent to '700')
        marginBottom: 20    // 20px of space below the title, before the input
    },
    fieldLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        color: '#8E8E93',
        marginBottom: 4
    },
    input: {
        borderWidth: 1,      // thin 1px border around the text box
        borderColor: '#ccc', // light gray border color
        padding: 15,         // 15px of internal padding so text isn't
                              // jammed against the border
        borderRadius: 8,     // slightly rounded corners
        marginBottom: 15     // 15px of space below the input, before the button
    }
});
