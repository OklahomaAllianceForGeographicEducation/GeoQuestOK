// app/+not-found.tsx
// Fallback screen for invalid routes.
// In Expo Router, any file named "+not-found.tsx" is a special file: the
// router automatically shows this screen when the user navigates to a URL/
// path that doesn't match any other route in the app. You never navigate
// here manually — it's a safety net.

// "Link" is Expo Router's version of a hyperlink/navigation component — like
// an <a> tag on the web, but it works for native navigation too.
// "Stack" lets us configure options (like the screen title) for whichever
// stack navigator this screen happens to be rendered inside of.
import { Link, Stack } from 'expo-router';

// "StyleSheet" is React Native's way of defining CSS-like style objects.
// "View" is the most basic layout container in React Native — the rough
// equivalent of a <div> on the web.
// "useColorScheme" reports whether the OS/browser is currently in light or
// dark mode, so this screen can follow the same theme system every other
// screen in the app uses instead of a hardcoded dark background.
import { StyleSheet, View, useColorScheme } from 'react-native';

// Shared theme tokens (light/dark) used across the whole app.
import { colors } from '../commonStyles';

// This is the component React Native/Expo Router will render for any
// unmatched route. "export default" means this is the main (and only)
// thing this file exports, which is required for Expo Router to treat it
// as a screen.
export default function NotFoundScreen() {
    // Same pattern used everywhere else in the app: fall back to 'light'
    // if the OS/browser doesn't report a preference, then look up that
    // scheme's token values.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];

    // A component's "return" describes what should appear on screen (this
    // is JSX — HTML-like syntax that compiles down to React function calls).
    return (
        // The outer <> ... </> is a "React Fragment". It lets us return two
        // sibling elements (Stack.Screen and View) without wrapping them in
        // an extra, unnecessary <View> that would otherwise affect layout.
        <>
            {/* Stack.Screen doesn't render any visible UI itself — it's a
                configuration element. Here we're telling the navigator
                that this screen's header/title text should read
                "Page not found" instead of the default file name. */}
            <Stack.Screen options={{ title: 'Page not found' }} />

            {/* This View is the main visible container for the screen.
                Its look (background color, centering, etc.) comes from
                styles.container below, plus the theme-driven background
                color applied inline here. */}
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                {/* Tapping this Link sends the user back to the root route
                    ("/"), which in this app is app/index.tsx. The text
                    between the tags ("Back to Home Screen") is what the
                    user sees and taps on. style={styles.button} controls
                    how that text looks (size, underline, color). */}
                <Link href="/" style={[styles.button, { color: theme.text }]}>
                    Back to Home Screen
                </Link>
            </View>

        </>
    );
}

// StyleSheet.create() takes a plain object of style definitions and
// returns an optimized style object. Using it (instead of plain objects)
// lets React Native validate the styles and improves performance slightly.
const styles = StyleSheet.create({
    // Styles applied to the outer View above.
    container: {
        // flex: 1 means "grow to fill all available space in the parent".
        // Since this is the top-level View on the screen, flex: 1 makes it
        // take up the entire screen (100% width and height).
        flex: 1,
        // justifyContent controls alignment along the main axis. By default
        // a View's main axis is vertical (column), so 'center' vertically
        // centers the children (the Link) in the middle of the screen.
        justifyContent: 'center',
        // alignItems controls alignment along the cross axis (horizontal,
        // since main axis is vertical here). 'center' horizontally centers
        // the Link as well. Together, justifyContent + alignItems both set
        // to 'center' puts the Link dead-center on the screen.
        alignItems: 'center',
    },
    // Styles applied to the Link's text above.
    button: {
        // Text size in density-independent pixels. Larger number = bigger
        // text. 20 is noticeably larger than typical body text (usually
        // 14-16), making it read like a clickable button/link.
        fontSize: 20,
        // Draws a line underneath the text, mimicking a classic web
        // hyperlink so users recognize it's tappable.
        textDecorationLine: 'underline',
        // Color now comes from theme.text (applied inline above) instead
        // of a hardcoded white, so it stays legible against theme.background
        // in both light and dark mode rather than assuming a dark screen.
    },
});
