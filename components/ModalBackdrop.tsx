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

// Props for ModalBackdrop:
// - children: whatever content should sit on top of the blurred backdrop
//   (typically the modal's card/panel). Rendered after AdaptiveBlur so it
//   paints on top of the blur layer.
// - onPress: optional tap handler. Since the whole backdrop is a Pressable,
//   passing this makes tapping anywhere on the dimmed/blurred area (usually
//   outside the modal's card) dismiss the modal. Omit it for modals that
//   should only be closed via an explicit button.
// - style: additional styles merged onto the base `flex: 1` style (e.g. the
//   modal's own `overlay` style, so this backdrop fills the same area that
//   style previously described).
type ModalBackdropProps = {
    children: React.ReactNode;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
};

// ModalBackdrop
// A reusable "outer layer" for popup modals. It renders a full-size
// Pressable (so it can optionally act as a tap-to-dismiss surface) with an
// AdaptiveBlur filling it behind whatever `children` are passed in. Using
// this instead of each modal hand-rolling its own dimmed View keeps the
// blur/scrim behavior (see AdaptiveBlur.tsx for the platform-specific
// details) consistent everywhere a modal appears.
// Returns: a Pressable element containing the blur layer and children.
export default function ModalBackdrop({ children, onPress, style }: ModalBackdropProps) {
    return (
        // The `style` array merges the base flex:1 sizing with whatever the
        // caller passes in (e.g. positioning for a full-screen overlay).
        <Pressable style={[styles.base, style]} onPress={onPress}>
            {/* Renders first so it's painted underneath `children` -- fills
                its parent (this Pressable) because AdaptiveBlur itself uses
                StyleSheet.absoluteFillObject internally. */}
            <AdaptiveBlur />
            {children}
        </Pressable>
    );
}

// -- layout styles --
const styles = StyleSheet.create({
    base: {
        flex: 1,
    },
});
