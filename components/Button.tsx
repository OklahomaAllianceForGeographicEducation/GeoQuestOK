// components/Button.tsx
// Shared full-width button used throughout the auth and account flows.
// Matches DESIGN.md's button-primary spec (14px radius, Georgia label,
// accent-tinted glow shadow) so this looks and feels like the same
// component everywhere it's used, rather than a plainer stand-in next to
// hand-rolled primary buttons elsewhere in the app.

import { Text, Pressable, StyleSheet, ViewStyle, StyleProp, useColorScheme } from 'react-native';
import { colors } from '../commonStyles';

// Props for Button:
// - label: the text shown inside the button, and also used as its
//   accessibilityLabel (see below) so screen readers announce the same
//   text a sighted user sees.
// - onPress: handler fired when the button is tapped/clicked. Optional so
//   the component doesn't error if a caller forgets to wire it up, though a
//   button with no onPress does nothing when pressed.
// - style: extra ViewStyle merged on top of the base button style, letting
//   individual screens tweak margins/width/etc. without forking this
//   component.
interface ButtonProps {
    label: string;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
}

// Button
// A shared, full-width, primary-action button (the pill-shaped, glowing
// button used across auth and account screens). It reads the current
// light/dark color scheme and looks up the matching theme colors so it
// automatically re-colors itself with the OS/app theme instead of every
// caller having to pass colors in manually.
// Renders: a Pressable styled as a button, containing a single <Text> label.
export default function Button({ label, onPress, style }: ButtonProps) {
    // useColorScheme() returns 'light', 'dark', or null/undefined (e.g.
    // before the OS preference is known) -- the `?? 'light'` falls back to
    // the light theme in that ambiguous case so `colors[scheme]` is always
    // a valid lookup.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];

    return (
        <Pressable
            onPress={onPress}
            // Without this, the control resolves to a plain unlabeled div
            // for screen readers -- a real gap on the single most
            // important control on every screen that uses it.
            accessibilityRole="button"
            accessibilityLabel={label}
            // `style` on Pressable can be a function of the press state,
            // which is how the pressed-feedback (dimmer + slightly shrunk)
            // effect below is applied only while the finger/cursor is down.
            style={({ pressed }) => [
                styles.button,
                // Theme-driven colors are applied here (rather than baked
                // into the StyleSheet) because they depend on the runtime
                // color scheme read above.
                { backgroundColor: theme.accent, shadowColor: theme.accent },
                style,
                // Simple "pressed" visual feedback: slightly transparent and
                // slightly scaled down, so the button feels tactile without
                // needing a full Animated-driven press animation.
                pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] }
            ]}
        >
            <Text style={[styles.text, { color: theme.accentText }]}>{label}</Text>
        </Pressable>
    );
}

// -- container/button shape styles --
const styles = StyleSheet.create({
    button: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        // shadow* props are iOS-only box-shadow equivalents; `elevation` is
        // the Android equivalent (drop shadow driven by a single elevation
        // number instead of offset/opacity/radius). Both are included so
        // the "glow" shadow shows up on both platforms.
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    // -- label text styles --
    text: {
        fontFamily: 'Georgia',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
});
