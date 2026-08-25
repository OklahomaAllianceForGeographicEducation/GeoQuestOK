// hooks/useResponsive.ts
// Shared breakpoint logic for adapting layouts on web (Chromebooks/laptops)
// without changing native iOS/Android behavior at all -- every flag here is
// gated on Platform.OS === 'web', so this hook is always a no-op on native.
//
// WHAT A "CUSTOM HOOK" IS (for anyone new to this codebase's React
// conventions): a custom hook is just a plain JavaScript function whose
// name starts with `use` and which is allowed to call other React hooks
// inside it (here, `useWindowDimensions`). It exists purely to package up
// reusable stateful/reactive logic so screens don't have to repeat it.
// Unlike a regular helper function, a hook automatically re-runs whenever
// the underlying reactive value it reads (here, the window/screen size)
// changes, and the component that called it automatically re-renders with
// the new result -- e.g. if the user resizes their browser window,
// `useWindowDimensions()` reports the new width, this hook recomputes
// `isWideWeb`/`contentMaxWidth` from it, and any screen that called
// `useResponsive()` re-renders with the updated layout automatically.
//
// HOW A SCREEN WOULD USE THIS: inside a component's function body (never
// inside a loop/condition/callback -- that's one of React's "Rules of
// Hooks"), a screen would write something like:
//   const { isWideWeb, contentMaxWidth } = useResponsive(600);
// and then reference those values in its JSX/styles, e.g.
// `style={{ maxWidth: contentMaxWidth, alignSelf: 'center' }}` to center
// and cap a form's width on wide web viewports while leaving native
// full-width behavior untouched (since `isWeb` is false there).

import { Platform, useWindowDimensions } from 'react-native';

// The pixel-width thresholds this hook's flags are based on. Only
// `tablet` is actually read below (via BREAKPOINTS.tablet) -- `desktop` is
// exported for any screen that wants a second, wider breakpoint of its own
// (e.g. to further adapt a layout past simple "wide vs. narrow"), even
// though nothing in this file currently branches on it.
export const BREAKPOINTS = {
    // Narrow browser windows (or a Chromebook in split-view) still get the
    // native phone-shaped layout.
    tablet: 700,
    desktop: 1024,
};

// The shape of the object useResponsive() returns -- documented field by
// field so a caller knows what each one means without re-reading the hook
// body.
export type Responsive = {
    width: number;
    height: number;
    // True only when running the web build (Platform.OS === 'web'); always
    // false on iOS/Android. Lets a screen write web-only conditional JSX/
    // styles without importing `Platform` itself.
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
//
// Parameters:
//   maxWidth - the largest pixel width the caller wants its content column
//     to grow to on web. Defaults to 1000 if the caller doesn't pass one.
//     Has no effect on native (see contentMaxWidth below).
// Returns: a Responsive object (see the type above) recomputed every time
// this hook is called during a render, using the window size at that
// moment.
export function useResponsive(maxWidth: number = 1000): Responsive {
    // useWindowDimensions() is a React Native hook that returns the
    // current window/screen size and re-renders the calling component
    // whenever it changes (e.g. browser resize, device rotation).
    const { width, height } = useWindowDimensions();
    // Platform.OS is a plain string constant ('web' | 'ios' | 'android')
    // set by React Native at bundle time -- not reactive, but cheap to
    // recompute on every call.
    const isWeb = Platform.OS === 'web';
    // Only ever true on web AND once the viewport is at least as wide as
    // the `tablet` breakpoint -- on native this short-circuits to false
    // immediately without even checking `width`.
    const isWideWeb = isWeb && width >= BREAKPOINTS.tablet;
    // On web: never let content grow past `maxWidth`, but still shrink
    // down to fit narrower viewports (Math.min picks whichever of the two
    // is smaller). On native: just use the full device width unmodified,
    // since native layouts aren't meant to be capped/centered this way.
    const contentMaxWidth = isWeb ? Math.min(width, maxWidth) : width;

    return { width, height, isWeb, isWideWeb, contentMaxWidth };
}
