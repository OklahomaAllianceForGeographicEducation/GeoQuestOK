// app/(site-admin-tabs)/index.tsx
// Not a visible tab (see _layout.tsx's `href: null` on this screen) — this
// file only exists because expo-router needs an `index` route to resolve
// the bare `/(site-admin-tabs)` path that lib/access.ts's
// resolveAppShellPath() and app/_layout.tsx's post-login redirect both send
// Site Administrators to. Same pattern as app/(admin-tabs)/index.tsx.

import { Redirect } from 'expo-router';

export default function SiteAdminTabsIndexRedirect() {
    return <Redirect href={'/(site-admin-tabs)/school' as any} />;
}
