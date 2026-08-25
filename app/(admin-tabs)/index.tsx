// app/(admin-tabs)/index.tsx
//
// FILE-LEVEL OVERVIEW:
// `(admin-tabs)` is an Expo Router "route group" (a folder name in
// parentheses) — see the longer explanation at the top of
// app/(admin-tabs)/_layout.tsx for what that means and what `_layout.tsx`
// files do. This particular file is the group's `index` route, meaning it's
// what renders if someone navigates to the bare group path
// `/(admin-tabs)` with no specific screen name after it.
//
// Not a visible tab (see _layout.tsx's `href: null` on this screen) — this
// file only exists because expo-router needs an `index` route to resolve
// the bare `/(admin-tabs)` path that lib/access.ts's resolveAppShellPath()
// and app/_layout.tsx's post-login redirect both send district admins to.
// Same pattern as app/(teacher-tabs)/index.tsx.

// `Redirect` is an expo-router component: rendering it immediately
// navigates to `href` instead of showing any UI of its own. It's the
// declarative equivalent of calling `router.replace(href)` in an effect.
import { Redirect } from 'expo-router';

// This component renders nothing visible — as soon as expo-router mounts
// it (because the user landed on the bare `/(admin-tabs)` path), it
// immediately redirects to the real landing tab, `overview`. This keeps the
// "index" route from ever showing blank content or needing its own UI.
export default function AdminTabsIndexRedirect() {
    return <Redirect href={'/(admin-tabs)/overview' as any} />;
}
