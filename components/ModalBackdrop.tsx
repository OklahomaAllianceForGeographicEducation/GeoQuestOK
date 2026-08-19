// components/ModalBackdrop.tsx
// Shared "frosted glass" backdrop for popup modals. Blurs whatever is
// behind the modal (via expo-blur, which works on iOS, Android, and web --
// on web it renders the CSS backdrop-filter blur) instead of dimming it
// with a flat grey/dark tint. Drop-in replacement for the plain
// View/Pressable each modal used to render as its outermost overlay: pass
// the modal's existing `overlay` style (minus its old backgroundColor) via
// `style`, and `onPress` only if that overlay was tap-to-dismiss.

import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import AdaptiveBlur from './AdaptiveBlur';

type ModalBackdropProps = {
    children: React.ReactNode;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
};

export default function ModalBackdrop({ children, onPress, style }: ModalBackdropProps) {
    return (
        <Pressable style={[styles.base, style]} onPress={onPress}>
            <AdaptiveBlur />
            {children}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        flex: 1,
    },
});
