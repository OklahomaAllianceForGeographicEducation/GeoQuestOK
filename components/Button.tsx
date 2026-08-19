// components/Button.tsx
// Shared full-width button used throughout the auth and account flows.

import { Text, Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors } from '../commonStyles';

interface ButtonProps {
    label: string;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
}

// Render a themed button with optional style overrides.
export default function Button({ label, onPress, style }: ButtonProps) {
    const theme = colors['light'];

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent },
                style,
                pressed && { opacity: 0.8 }
            ]}
        >
            <Text style={styles.text}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    text: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
