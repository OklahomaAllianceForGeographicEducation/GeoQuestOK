// hooks/useResponsive.ts
// Shared breakpoint logic for adapting layouts on web (Chromebooks/laptops)
// without changing native iOS/Android behavior at all -- every flag here is
// gated on Platform.OS === 'web', so this hook is always a no-op on native.

import { Platform, useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
    // Narrow browser windows (or a Chromebook in split-view) still get the
    // native phone-shaped layout.
    tablet: 700,
    desktop: 1024,
};

export type Responsive = {
    width: number;
    height: number;
    isWeb: boolean;
    // True once the browser viewport is wide enough that the phone-shaped
    // layout should give way to a centered, wider one.
    isWideWeb: boolean;
    // A comfortable max width for a centered column of readable content
    // (forms, cards, lists) -- avoids text/inputs stretching edge-to-edge
    // on a 1366px+ Chromebook screen.
    contentMaxWidth: number;
};

// `maxWidth` lets a screen opt into a narrower or wider cap than the
// default (e.g. a login form wants ~420px, a dashboard wants ~1000px).
export function useResponsive(maxWidth: number = 1000): Responsive {
    const { width, height } = useWindowDimensions();
    const isWeb = Platform.OS === 'web';
    const isWideWeb = isWeb && width >= BREAKPOINTS.tablet;
    const contentMaxWidth = isWeb ? Math.min(width, maxWidth) : width;

    return { width, height, isWeb, isWideWeb, contentMaxWidth };
}
