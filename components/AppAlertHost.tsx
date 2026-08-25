// components/AppAlertHost.tsx
// A themed, in-app replacement for the browser's native window.alert()/
// window.confirm() on web -- see lib/confirmAlert.ts, which previously fell
// back to those directly. A raw browser popup looks jarring next to the
// rest of this app's styled UI, and can't be themed (light/dark, brand
// colors) at all.
//
// Mount exactly one <AppAlertHost /> near the app root (see app/_layout.tsx)
// -- it renders nothing until something calls the imperative
// AppAlertHost.show()/confirm() functions exported below, which
// lib/confirmAlert.ts now calls into on web instead of window.alert/confirm.
// Native platforms are untouched -- they still use the real Alert.alert.

import { useColorScheme } from 'react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { colors } from '../commonStyles';
import ModalBackdrop from './ModalBackdrop';

type HostButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

type HostState = {
    visible: boolean;
    title: string;
    message?: string;
    buttons: HostButton[];
};

const INITIAL_STATE: HostState = { visible: false, title: '', message: undefined, buttons: [] };

// Module-level mutable box so the imperative show()/confirm() functions
// below can reach whichever <AppAlertHost /> instance is currently mounted,
// without every call site needing to be a React component itself (the same
// "singleton ref" pattern toast/alert libraries commonly use). Set by the
// component's own useEffect on mount, cleared on unmount.
let setHostState: ((state: HostState) => void) | null = null;

/** Single-button informational alert -- the in-app equivalent of window.alert(). */
export function show(title: string, message?: string) {
    setHostState?.({
        visible: true,
        title,
        message,
        buttons: [{ text: 'OK', style: 'default' }],
    });
}

/** Multi-button (Cancel + action) alert -- the in-app equivalent of window.confirm(). */
export function confirm(title: string, message: string, buttons: HostButton[]) {
    setHostState?.({ visible: true, title, message, buttons });
}

export default function AppAlertHost() {
    const [state, setState] = useState<HostState>(INITIAL_STATE);
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];

    useEffect(() => {
        setHostState = setState;
        return () => {
            setHostState = null;
        };
    }, []);

    const dismiss = () => setState(INITIAL_STATE);

    const handlePress = (button: HostButton) => {
        dismiss();
        // Deferred a tick so the modal has visibly closed before whatever
        // the button does (e.g. navigation, a destructive delete) runs --
        // matches how a native Alert.alert's dismiss-then-act feels.
        setTimeout(() => button.onPress?.(), 0);
    };

    if (!state.visible) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
            <ModalBackdrop style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.title, { color: theme.text }]}>{state.title}</Text>
                    {state.message ? (
                        <Text style={[styles.message, { color: theme.subtext }]}>{state.message}</Text>
                    ) : null}
                    <View style={styles.buttonRow}>
                        {state.buttons.map((button, i) => {
                            const isDestructive = button.style === 'destructive';
                            const isCancel = button.style === 'cancel';
                            return (
                                <Pressable
                                    key={`${button.text}-${i}`}
                                    onPress={() => handlePress(button)}
                                    style={({ pressed }) => [
                                        styles.button,
                                        {
                                            backgroundColor: isCancel ? 'transparent' : isDestructive ? theme.error : theme.accent,
                                            borderColor: isCancel ? theme.border : 'transparent',
                                            borderWidth: isCancel ? 1 : 0,
                                        },
                                        pressed && { opacity: 0.75 },
                                    ]}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.buttonText, { color: isCancel ? theme.text : theme.accentText }]}>
                                        {button.text}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </ModalBackdrop>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 400, borderRadius: 18, borderWidth: 1, padding: 24 },
    title: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
    message: { fontSize: 14.5, lineHeight: 21, marginBottom: 20 },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    button: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
    buttonText: { fontSize: 14.5, fontWeight: '700' },
});
