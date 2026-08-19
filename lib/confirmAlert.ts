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

type ConfirmButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

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
