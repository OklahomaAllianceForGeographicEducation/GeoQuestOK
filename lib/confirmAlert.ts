// lib/confirmAlert.ts
// react-native-web's Alert.alert() is a complete no-op -- see
// node_modules/react-native-web/src/exports/Alert/index.js, which is
// literally just `static alert() {}`. Every confirm-style Alert.alert(...)
// call in this app (Cancel/Delete, Cancel/Leave, Cancel/Sign Out, etc.)
// silently did nothing on web: no dialog ever appeared, and the button's
// onPress -- which is what actually performs the delete/leave/sign-out --
// never fired. Native platforms are unaffected (Alert.alert works there).
//
// confirmAlert() is a drop-in replacement for that specific two-button
// "Cancel" + one action pattern: on web it falls back to window.confirm
// (a real, if plainer, browser dialog), and on native it defers to the
// genuine Alert.alert.

import { Alert, Platform } from 'react-native';

// One button in a confirmAlert(...) dialog -- deliberately a small subset
// of React Native's own AlertButton shape (just enough fields for this
// app's two-button Cancel/action pattern), so a caller can pass the same
// buttons array style it would give directly to Alert.alert.
//   - text:    the button's visible label (e.g. "Cancel", "Delete Everything").
//   - onPress: callback invoked if this button is the one the user picks.
//              Optional because a plain "Cancel" button often has nothing
//              to do besides dismiss the dialog.
//   - style:   'cancel' marks the dismiss/no-op button; confirmAlert (the
//              web fallback below) uses this to find the OTHER button --
//              the one that performs the real action -- since a native
//              two-button window.confirm() can't render multiple buttons
//              with distinct labels, only OK/Cancel.
type ConfirmButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

/**
 * Cross-platform replacement for a two-button (Cancel + action)
 * `Alert.alert(...)` call. See the file-level comment above for WHY this
 * exists: react-native-web's Alert.alert is a total no-op, so any
 * confirm-before-destructive-action flow (delete, leave, sign out) that
 * used it directly would silently never prompt -- and never fire its
 * action callback -- on web.
 *
 * @param title - The dialog's title/heading text.
 * @param message - The dialog's body text. On web, concatenated onto
 *   `title` (separated by a blank line) since `window.confirm` only takes
 *   one combined string, not a separate title/body.
 * @param buttons - The two (or more) buttons this confirmation offers.
 *   Only the first non-'cancel'-style button is ever actually invoked on
 *   web (see below) -- this helper assumes exactly one "real" action
 *   button, matching every call site in this app.
 * @returns Nothing. Resolves/returns synchronously; the actual
 *   confirm/cancel decision is reported only via calling (or not calling)
 *   the matched button's `onPress`.
 *
 * Side effects / platform branching:
 *   - On web (`Platform.OS === 'web'`): calls the browser's native
 *     `window.confirm(...)`, which blocks the page synchronously until the
 *     user picks OK or Cancel. If OK (confirmed === true), calls the
 *     non-cancel button's `onPress` (if any); if Cancel, does nothing.
 *   - On native (iOS/Android): defers entirely to the real, non-broken
 *     `Alert.alert(title, message, buttons)`, which renders every button
 *     exactly as given.
 */
export function confirmAlert(title: string, message: string, buttons: ConfirmButton[]) {
    if (Platform.OS === 'web') {
        // The non-cancel button is the one that actually performs the
        // action -- everything here only ever has exactly one of those.
        const actionButton = buttons.find((b) => b.style !== 'cancel');
        const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);
        if (confirmed) actionButton?.onPress?.();
        return;
    }
    Alert.alert(title, message, buttons);
}

// Same underlying problem as confirmAlert above, for the simpler single-
// button "just tell the user something" case (success/error notices).
// Several screens (login.tsx, signup.tsx, reset-password.tsx,
// teacher-account.tsx) had already hand-rolled an identical
// Platform.OS === 'web' ? window.alert(...) : Alert.alert(...) closure
// locally; this is that same helper, shared, so a screen that still calls
// plain Alert.alert() (silently doing nothing on web) can be pointed here
// instead of growing yet another copy.
/**
 * Cross-platform replacement for a plain, single-button informational
 * `Alert.alert(title, message)` call (success/error notices with no choice
 * to make) -- same underlying bug as confirmAlert above: react-native-web's
 * Alert.alert never shows anything, so a bare notice would silently vanish
 * on web.
 *
 * @param title - The alert's title/heading text.
 * @param message - Optional body text. On web, appended to `title`
 *   (separated by a blank line) when present.
 * @returns Nothing. On web this blocks synchronously until the user
 *   dismisses the native `window.alert(...)` dialog; on native it defers to
 *   the real `Alert.alert`.
 *
 * Side effects: calls `window.alert(...)` on web, or `Alert.alert(...)` on
 * native -- no network/Supabase calls, no state changes.
 */
export function showAlert(title: string, message?: string) {
    if (Platform.OS === 'web') {
        window.alert(message ? `${title}\n\n${message}` : title);
        return;
    }
    Alert.alert(title, message);
}
