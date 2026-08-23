// components/Button.tsx
// Shared full-width button used throughout the auth and account flows.
// Matches DESIGN.md's button-primary spec (14px radius, Georgia label,
// accent-tinted glow shadow) so this looks and feels like the same
// component everywhere it's used, rather than a plainer stand-in next to
// hand-rolled primary buttons elsewhere in the app.

import { Text, Pressable, StyleSheet, ViewStyle, StyleProp, useColorScheme } from 'react-native';
import { colors } from '../commonStyles';

interface ButtonProps {
    label: string;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
}

// Render a themed button with optional style overrides.
export default function Button({ label, onPress, style }: ButtonProps) {
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
            style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent, shadowColor: theme.accent },
                style,
                pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] }
            ]}
        >
            <Text style={[styles.text, { color: theme.accentText }]}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    text: {
        fontFamily: 'Georgia',
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
});
