// components/WebContainer.tsx
//
// FILE OVERVIEW
// -------------
// Component: WebContainer
// Platform: SHARED (this single file runs on iOS, Android, AND web -- it is
//   NOT one of the `.native.tsx` / `.web.tsx` platform-split files described
//   elsewhere in this codebase; instead it branches internally at runtime
//   using the `useResponsive` hook, which itself checks `Platform.OS`).
// Responsibility: Centers screen content within a max-width column on wide
//   web viewports (Chromebooks/laptops) so cards, forms, and lists don't
//   stretch edge-to-edge across a 1300px+ browser window. On native
//   iOS/Android (and on narrow web windows, e.g. a phone browser or a small
//   split-view window) it renders as a plain pass-through with no extra
//   layout -- children render exactly as if this wrapper weren't there.
//
// Think of this as a lightweight "responsive container" utility you'd wrap
// around a screen's content, similar to a CSS `max-width` + `margin: auto`
// pattern on the web, but implemented in React Native's styling model so it
// also works (as a no-op) on phones/tablets.

import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

// Props for WebContainer:
// - children: the content to render inside (or pass through untouched).
// - maxWidth: the widest the centered column is allowed to get, in pixels,
//   on web. Defaults to 960. Passed straight into useResponsive() too,
//   because that hook needs to know the same cap to decide layout details.
// - style: optional extra View style(s) merged onto the centering wrapper
//   (only applied when the wide-web layout is actually used).
type Props = {
    children: React.ReactNode;
    maxWidth?: number;
    style?: StyleProp<ViewStyle>;
};

// WebContainer
// ------------
// Purpose: wrap a screen's content so it gets a comfortable, centered
// reading/interaction width on wide browser windows, while staying a no-op
// wrapper everywhere else (native apps, and narrow/mobile web).
//
// Props: see the `Props` type above (children, maxWidth, style).
// Returns: either the children rendered directly (no extra wrapping View --
// narrow/native case), or the children wrapped in a centered <View> that
// caps its width at `maxWidth` (wide-web case).
export default function WebContainer({ children, maxWidth = 960, style }: Props) {
    // useResponsive() (see hooks/useResponsive.ts) looks at the current
    // window dimensions and platform to decide whether we're in "wide web"
    // territory. On native this hook always reports isWideWeb === false,
    // since it's gated on Platform.OS === 'web' internally.
    const { isWideWeb } = useResponsive(maxWidth);

    // Not wide web (i.e. native app, or a narrow/mobile browser window):
    // render children directly with no wrapping View at all, using a
    // React Fragment (<>...</>) so this component adds zero extra layout
    // nodes to the tree in the common case.
    if (!isWideWeb) {
        return <>{children}</>;
    }

    // Wide web: wrap children in a View that takes the full available
    // width up to `maxWidth`, then centers itself horizontally within its
    // parent via `alignSelf: 'center'`. Any caller-supplied `style` is
    // merged in after these base styles so it can override them if needed.
    return (
        <View style={[{ width: '100%', maxWidth, alignSelf: 'center' }, style]}>
            {children}
        </View>
    );
}
