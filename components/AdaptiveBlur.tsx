// components/AdaptiveBlur.tsx
// The actual blur-or-scrim fill used behind popup modals -- factored out of
// ModalBackdrop so screens that build their own overlay (a KeyboardAvoidingView
// wrapping a BlurView + a separate dismiss Pressable, rather than
// ModalBackdrop's all-in-one Pressable) can still get the same
// platform-correct treatment instead of a raw <BlurView> that misrenders on
// Android. Fills its parent absolutely -- render it as the first child of
// whatever positioned overlay container the screen already has.

import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

// AdaptiveBlur
// Takes no props. A per-platform "fill the parent with a blur/scrim" layer:
//   - Android: a flat semi-transparent dark View (real blur is unreliable
//     there, see comment below).
//   - iOS: expo-blur's native BlurView, which iOS itself animates in.
//   - web: expo-blur's BlurView (CSS backdrop-filter under the hood), with
//     a manual opacity fade-in added here since the web CSS blur otherwise
//     just pops in instantly.
// Returns: a single View or BlurView element sized via
// StyleSheet.absoluteFillObject, so it always fills whatever positioned
// parent renders it (that parent must establish the size/position).
export default function AdaptiveBlur() {
    // On web, expo-blur just sets the CSS backdrop-filter directly, so the
    // blur pops in at full strength the instant the modal mounts -- an
    // abrupt flash rather than the smooth blur-in native platforms give
    // modals for free (iOS animates BlurView's presentation itself; Android
    // uses the flat scrim below). Fading opacity in over a couple hundred ms
    // after mount gets web much closer to that same natural feel.
    // React state: `blurVisible` tracks whether the fade-in should have
    // completed. On native (iOS/Android) it starts (and stays) `true` since
    // this fade trick is web-only; on web it starts `false` so the first
    // render paints at opacity 0, then flips to `true` once the effect
    // below runs, triggering the CSS transition.
    const [blurVisible, setBlurVisible] = useState(Platform.OS !== 'web');
    // useEffect with an empty dependency array ([]) runs its callback once,
    // right after the component's first mount, and never again (there are
    // no reactive values it depends on). This is where the delayed
    // "become visible" animation is kicked off for web only.
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        // Two rAFs (rather than one) guarantee the browser has actually
        // painted the initial opacity:0 frame before we flip it to 1 --
        // with just one, the two style updates can land in the same paint
        // and the transition never has anything to animate from.
        const raf1 = requestAnimationFrame(() => {
            const raf2 = requestAnimationFrame(() => setBlurVisible(true));
            cleanupRaf2 = raf2;
        });
        let cleanupRaf2 = 0;
        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(cleanupRaf2);
        };
    }, []);

    // expo-blur's real blur effect is unreliable on Android -- depending on
    // device/OS version it can render as a mis-sized or oddly-cropped grey
    // layer instead of a smooth blur (reported as "greyed out ends weird on
    // top"). iOS and web get the real blur; Android falls back to a flat
    // semi-transparent scrim, which is cheap, always renders correctly, and
    // looks close enough to the intended effect.
    if (Platform.OS === 'android') {
        return <View style={[StyleSheet.absoluteFillObject, styles.androidScrim]} />;
    }

    return (
        <BlurView
            intensity={45}
            tint="dark"
            style={[
                StyleSheet.absoluteFillObject,
                Platform.OS === 'web' && (webFadeStyle(blurVisible) as any),
            ]}
        />
    );
}

// Plain CSS transition properties -- react-native-web passes these straight
// through to the underlying div's style, but they aren't valid native RN
// style keys, so this is only ever applied on web (see Platform.OS check
// above) and built as a plain object rather than via StyleSheet.create,
// which would strip unrecognized keys on native.
function webFadeStyle(visible: boolean) {
    return {
        opacity: visible ? 1 : 0,
        transitionProperty: 'opacity',
        transitionDuration: '220ms',
        transitionTimingFunction: 'ease-out',
    };
}

const styles = StyleSheet.create({
    androidScrim: {
        backgroundColor: 'rgba(20,20,20,0.55)',
    },
});
