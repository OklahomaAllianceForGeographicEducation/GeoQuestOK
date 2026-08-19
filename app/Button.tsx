// app/Button.tsx
// Local copy of the shared button component. The app currently imports this
// version in a few places, so we keep it documented until the duplicate is
// cleaned up.
// NOTE: There is a very similar file at components/Button.tsx. Having two
// nearly-identical Button components is a maintenance risk (a fix made to
// one won't apply to the other) — worth consolidating eventually.

// "Text" renders text (React Native has no raw text nodes like HTML does —
// all visible text must be wrapped in a <Text> component).
// "Pressable" is React Native's modern tappable/clickable wrapper — it
// replaces the older TouchableOpacity/TouchableHighlight components and
// gives us a callback for the "pressed" state so we can style it.
// "StyleSheet" builds style objects (see +not-found.tsx for more detail).
// "ViewStyle" and "StyleProp" are TypeScript-only imports (types, not
// runtime values) used to describe what kind of style object is allowed to
// be passed into this component as a prop.
import { Text, Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';

// Pulls in the shared color palette defined in commonStyles.ts, one level
// up from this file (the "../" means "go up one folder from app/").
import { colors } from '../commonStyles';

// TypeScript interface describing exactly what props this component
// accepts. Declaring this lets TypeScript catch mistakes (like a typo in a
// prop name, or passing a number where a string is expected) at compile
// time instead of at runtime.
interface ButtonProps {
    // The text shown inside the button. Required (no "?"), so every usage
    // of <Button /> must supply a label.
    label: string;
    // Function to run when the button is tapped. The "?" makes this
    // optional — if omitted, tapping the button simply does nothing.
    // "() => void" means "a function that takes no arguments and returns
    // nothing".
    onPress?: () => void;
    // Optional style overrides the parent screen can pass in to customize
    // this specific button instance (e.g. to change its width or margin)
    // without having to modify this shared component.
    style?: StyleProp<ViewStyle>;
}

// Render a themed button with optional style overrides.
// The { label, onPress, style } syntax is "destructuring" — it pulls those
// three named fields directly out of the props object so we can refer to
// them as plain variables instead of writing props.label, props.onPress, etc.
export default function Button({ label, onPress, style }: ButtonProps) {
    // colors['light'] pulls the "light" theme's colors out of the palette
    // object imported above (as opposed to a hypothetical 'dark' theme).
    // This button is hardcoded to always use the light theme colors,
    // regardless of the device's actual color scheme.
    const theme = colors['light'];

    return (
        <Pressable
            // Runs the onPress function (if any) whenever the user taps.
            onPress={onPress}
            // Pressable's "style" prop can be a function instead of a
            // plain object. React Native calls this function with the
            // current press state ({ pressed }) so you can change the
            // look while the user is actively holding it down.
            style={({ pressed }) => [
                // This is an ARRAY of styles. React Native merges style
                // objects in an array from left to right, with later
                // entries overriding earlier ones for any properties they
                // share. Order here matters:
                // 1) Base look (padding, rounded corners, etc.)
                styles.button,
                // 2) Background color pulled from the current theme.
                { backgroundColor: theme.accent },
                // 3) Any custom style the parent screen passed in via the
                //    `style` prop — this can override anything above it.
                style,
                // 4) If the button is currently being pressed, this adds
                //    { opacity: 0.8 } on top of everything else, dimming
                //    the button slightly to 80% opacity as visual feedback
                //    that the tap registered. `pressed && {...}` is a
                //    common shorthand: if `pressed` is false, this
                //    evaluates to `false`, and React Native simply ignores
                //    falsy entries in a style array.
                pressed && { opacity: 0.8 }
            ]}
        >
            {/* The visible label text, styled via styles.text below. */}
            <Text style={styles.text}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        // Space between the button's edge and its content (the text) on
        // all four sides, in density-independent pixels. Larger padding =
        // a taller/wider, easier-to-tap button.
        padding: 16,
        // Rounds the corners of the button. 12 is a fairly soft, modern
        // rounded-rectangle look; 0 would be sharp corners, and a very
        // large number (e.g. 999) would make it a full pill/capsule shape.
        borderRadius: 12,
        // Centers the Text child horizontally (cross-axis, since the
        // default flex direction is column).
        alignItems: 'center',
        // Centers the Text child vertically (main-axis).
        justifyContent: 'center',
        // Makes the button stretch to fill 100% of its parent's width,
        // rather than shrinking to fit just the text.
        width: '100%',
    },
    text: {
        // Pure white text, so it stands out against theme.accent
        // (typically a saturated/dark accent color) behind it.
        color: '#FFFFFF',
        // Body-sized text — 16 is a common comfortable reading/button size
        // on mobile.
        fontSize: 16,
        // Semi-bold weight (values run roughly 100 "thin" to 900 "black").
        // 600 makes the label a bit more prominent than normal (400)
        // weight text, appropriate for a call-to-action button.
        fontWeight: '600',
    },
});
