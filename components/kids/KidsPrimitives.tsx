// components/kids/KidsPrimitives.tsx
//
// Reusable building blocks for the (kids-tabs) shell: a "squishy" 3D button
// (a solid Deep-colored base plate peeking out from under a Fill-colored
// top face -- press it and the top face drops to meet the base, the same
// tactile trick Duolingo/most kid-game UIs use so a button reads as a
// physical, pressable object rather than a flat colored rectangle), a card,
// a pill/chip, and a chunky rounded progress bar. Every color here comes
// from styles/kidsTheme.ts -- nothing hardcoded.
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { kidsColors, kidsFonts, kidsRadius, kidsSpacing, kidsCardShadow } from '../../styles/kidsTheme';

type KidsButtonVariant = 'grass' | 'sky' | 'sun' | 'berry';

const VARIANT_FILL: Record<KidsButtonVariant, string> = {
    grass: kidsColors.grass,
    sky: kidsColors.sky,
    sun: kidsColors.sun,
    berry: kidsColors.berry,
};
const VARIANT_DEEP: Record<KidsButtonVariant, string> = {
    grass: kidsColors.grassDeep,
    sky: kidsColors.skyDeep,
    sun: kidsColors.sunDeep,
    berry: kidsColors.berryDeep,
};
// Sun is the one Fill weight that pairs with dark text (see kidsTheme.ts's
// contrast notes) -- every other variant carries white.
const VARIANT_TEXT: Record<KidsButtonVariant, string> = {
    grass: kidsColors.white,
    sky: kidsColors.white,
    sun: kidsColors.ink,
    berry: kidsColors.white,
};

type KidsButtonProps = {
    label: string;
    onPress: () => void;
    variant?: KidsButtonVariant;
    icon?: string;
    disabled?: boolean;
    fullWidth?: boolean;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
};

export function KidsButton({ label, onPress, variant = 'grass', icon, disabled, fullWidth = true, accessibilityLabel, style }: KidsButtonProps) {
    const press = useRef(new Animated.Value(0)).current;
    const fill = VARIANT_FILL[variant];
    const deep = VARIANT_DEEP[variant];
    const textColor = VARIANT_TEXT[variant];

    const translateY = press.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });

    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            onPressIn={() => Animated.timing(press, { toValue: 1, duration: 70, useNativeDriver: true }).start()}
            onPressOut={() => Animated.timing(press, { toValue: 0, duration: 110, useNativeDriver: true }).start()}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled: !!disabled }}
            style={[{ opacity: disabled ? 0.5 : 1, width: fullWidth ? '100%' : undefined }, style]}
        >
            <View style={[buttonBase.base, { backgroundColor: deep }]}>
                <Animated.View style={[buttonBase.face, { backgroundColor: fill, transform: [{ translateY }] }]}>
                    {icon ? <Text style={buttonBase.icon}>{icon}</Text> : null}
                    <Text style={[buttonBase.label, { color: textColor }]} numberOfLines={1}>{label}</Text>
                </Animated.View>
            </View>
        </Pressable>
    );
}

const buttonBase = StyleSheet.create({
    base: {
        borderRadius: kidsRadius.pill,
        paddingBottom: 5,
    },
    face: {
        borderRadius: kidsRadius.pill,
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: kidsSpacing.xl,
        gap: kidsSpacing.sm,
    },
    icon: {
        fontSize: 20,
    },
    label: {
        fontFamily: kidsFonts.display,
        fontSize: 17,
        letterSpacing: 0.2,
    },
});

// A smaller, inline "chunky" pill -- same press-down trick, used for
// secondary actions sitting beside a primary KidsButton (e.g. "All
// Landmarks" next to "Log My Walk").
type KidsMiniButtonProps = {
    label: string;
    onPress: () => void;
    variant?: KidsButtonVariant;
    icon?: string;
    style?: StyleProp<ViewStyle>;
};

export function KidsMiniButton({ label, onPress, variant = 'sky', icon, style }: KidsMiniButtonProps) {
    const fill = VARIANT_FILL[variant];
    const deep = VARIANT_DEEP[variant];
    const textColor = VARIANT_TEXT[variant];
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[{ flex: 1 }, style]}>
            {({ pressed }) => (
                <View style={[miniButton.base, { backgroundColor: deep }]}>
                    <View style={[miniButton.face, { backgroundColor: fill, transform: [{ translateY: pressed ? 3 : 0 }] }]}>
                        {icon ? <Text style={miniButton.icon}>{icon}</Text> : null}
                        <Text style={[miniButton.label, { color: textColor }]} numberOfLines={1}>{label}</Text>
                    </View>
                </View>
            )}
        </Pressable>
    );
}

const miniButton = StyleSheet.create({
    base: { borderRadius: kidsRadius.pill, paddingBottom: 4 },
    face: {
        borderRadius: kidsRadius.pill,
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: kidsSpacing.lg,
        gap: 6,
    },
    icon: { fontSize: 15 },
    label: { fontFamily: kidsFonts.display, fontSize: 14 },
});

// A rounded white card, thick soft border, ambient sky-tinted shadow.
export function KidsCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[cardStyles.card, style]}>{children}</View>;
}

const cardStyles = StyleSheet.create({
    card: {
        backgroundColor: kidsColors.surface,
        borderRadius: kidsRadius.xl,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
        padding: kidsSpacing.lg,
        ...kidsCardShadow,
    },
});

type KidsPillVariant = 'grass' | 'sky' | 'sun' | 'berry' | 'neutral';
const PILL_BG: Record<KidsPillVariant, string> = {
    grass: kidsColors.grassBright,
    sky: kidsColors.skyBright,
    sun: kidsColors.sun,
    berry: kidsColors.berryBright,
    neutral: kidsColors.bg,
};

export function KidsPill({ label, variant = 'neutral', icon }: { label: string; variant?: KidsPillVariant; icon?: string }) {
    return (
        <View style={[pillStyles.pill, { backgroundColor: PILL_BG[variant] }]}>
            {icon ? <Text style={pillStyles.icon}>{icon}</Text> : null}
            <Text style={pillStyles.label} numberOfLines={1}>{label}</Text>
        </View>
    );
}

const pillStyles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: kidsRadius.pill,
        paddingVertical: 6,
        paddingHorizontal: 12,
        alignSelf: 'flex-start',
    },
    icon: { fontSize: 13 },
    label: { fontFamily: kidsFonts.body, fontSize: 13, color: kidsColors.ink },
});

// A chunky rounded progress bar -- track in a pale sky tint, fill in Grass
// Bright with a Grass-deep bottom edge for the same "has thickness" read
// as the buttons above.
export function KidsProgressBar({ pct }: { pct: number }) {
    const clamped = Math.max(0, Math.min(100, pct));
    return (
        <View style={progressStyles.track}>
            <View style={[progressStyles.fillShadow, { width: `${clamped}%` }]}>
                <View style={progressStyles.fill} />
            </View>
        </View>
    );
}

const progressStyles = StyleSheet.create({
    track: {
        height: 22,
        borderRadius: kidsRadius.pill,
        backgroundColor: kidsColors.bg,
        borderWidth: 3,
        borderColor: kidsColors.cardBorder,
        overflow: 'hidden',
    },
    fillShadow: {
        height: '100%',
        backgroundColor: kidsColors.grassDeep,
        borderRadius: kidsRadius.pill,
    },
    fill: {
        flex: 1,
        margin: 2,
        borderRadius: kidsRadius.pill,
        backgroundColor: kidsColors.grassBright,
    },
});

// A circular colored bubble holding an emoji/icon glyph -- used for nav
// icons and small decorative accents throughout the kids shell.
export function KidsIconBubble({ icon, variant = 'sky', size = 44 }: { icon: string; variant?: KidsPillVariant; size?: number }) {
    return (
        <View style={[bubbleStyles.bubble, { backgroundColor: PILL_BG[variant], width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={{ fontSize: size * 0.5 }}>{icon}</Text>
        </View>
    );
}

const bubbleStyles = StyleSheet.create({
    bubble: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
