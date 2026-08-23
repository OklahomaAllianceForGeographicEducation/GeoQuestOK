// app/(admin-tabs)/index.tsx
// Not a visible tab (see _layout.tsx's `href: null` on this screen) — this
// file only exists because expo-router needs an `index` route to resolve
// the bare `/(admin-tabs)` path that lib/access.ts's resolveAppShellPath()
// and app/_layout.tsx's post-login redirect both send district admins to.
// Same pattern as app/(teacher-tabs)/index.tsx.

import { Redirect } from 'expo-router';

export default function AdminTabsIndexRedirect() {
    return <Redirect href={'/(admin-tabs)/overview' as any} />;
}
