// app/+html.tsx
// Expo Router's root HTML document for the static web export (only used on
// web -- native builds never see this file). Lets us set page-level <head>
// content and global CSS that plain React Native styles can't reach.

import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* Expo Router's static web export doesn't inject app.json's
                    "name" as a <title> automatically -- it has to be set
                    explicitly here, or the browser tab shows nothing. */}
        <title>GeoQuestOK</title>
        <meta name="description" content="GeoQuestOK blends fitness, geography, and history for Oklahoma K-12 students -- walk real Oklahoma trails, unlock landmarks, and learn state history along the way." />
        <meta property="og:title" content="GeoQuestOK" />
        <meta property="og:description" content="Walk real Oklahoma trails, unlock landmarks, and learn state history and geography along the way." />
        <meta property="og:type" content="website" />

        {/* Disables the browser's default hover-based responsive
                    layout for the root <ScrollView>, matching how the app
                    already lays out full-screen scroll views natively. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: globalWebStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Selecting/highlighting text is a normal browser behavior, but on an
// app-like screen full of cards, buttons, and map pins it's very easy to
// accidentally click-drag across the whole page and highlight everything --
// there's no real content here meant to be copy-pasted. `user-select: none`
// on the page root stops that stray full-page selection while leaving actual
// form fields (where selecting text is expected) untouched.
const globalWebStyle = `
html, body, #root {
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

input, textarea, [contenteditable="true"] {
  -webkit-user-select: text;
  -ms-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}

/* React Native Web ships every focusable element with a
   ".r-outlineStyle-*  { outline-style: none; }" atomic class and no
   replacement, so keyboard users get no visible focus indicator anywhere
   in the app -- confirmed live across every Pressable on the marketing
   site (nav, hero CTAs, FAQ accordion, footer) during an /impeccable
   audit. Fixed once here rather than per-component since the removal is
   itself global; !important is needed because RNW's rule and this one
   have equal selector specificity and its stylesheet is injected after
   this one, so it would otherwise win on injection order alone. */
:focus-visible {
  outline: 2px solid #241E18 !important;
  outline-offset: 2px !important;
}
@media (prefers-color-scheme: dark) {
  :focus-visible {
    outline-color: #F6EFE7 !important;
  }
}
`;
