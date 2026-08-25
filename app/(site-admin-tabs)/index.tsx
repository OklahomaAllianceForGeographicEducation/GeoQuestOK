// app/(site-admin-tabs)/index.tsx
//
// FILE-LEVEL OVERVIEW (for learning Expo Router):
// -------------------------------------------------------------------------
// Expo Router turns the folder structure under `app/` into your navigation
// structure ("file-based routing"). A folder whose name is wrapped in
// parentheses, like `(site-admin-tabs)`, is a "route group": the
// parentheses tell Expo Router to use that folder purely for organizing
// files and sharing a layout -- the group's name is NOT part of the URL
// path the user sees. Every screen inside a route group can share a common
// `_layout.tsx` (in this case, the bottom tab bar defined in this folder's
// `_layout.tsx`).
//
// This particular file is the `index` route for the `(site-admin-tabs)`
// group, meaning it's what renders if someone navigates to the *bare* group
// path (e.g. right after login, before picking a specific tab). Screen/role:
// none, really -- it's not a screen a Site Administrator ever sees, because
// it immediately redirects. It exists purely as routing plumbing.
//
// Not a visible tab (see _layout.tsx's `href: null` on this screen) — this
// file only exists because expo-router needs an `index` route to resolve
// the bare `/(site-admin-tabs)` path that lib/access.ts's
// resolveAppShellPath() and app/_layout.tsx's post-login redirect both send
// Site Administrators to. Same pattern as app/(admin-tabs)/index.tsx.

// `Redirect` is an Expo Router component: instead of rendering any UI, when
// it mounts it immediately navigates ("replaces" the current route in the
// history stack) to the `href` you give it.
import { Redirect } from 'expo-router';

/**
 * SiteAdminTabsIndexRedirect
 * ---------------------------------------------------------------------
 * A component with no props and no state. Its only job is to render a
 * `<Redirect>` so that anyone who lands on the bare `/(site-admin-tabs)`
 * URL gets sent straight to the "My School" tab (`school.tsx`) instead of
 * seeing a blank screen. Because `_layout.tsx` marks this route's tab
 * button as `href: null`, it never shows up in the tab bar itself.
 *
 * Returns: a `<Redirect>` element (no visible UI is ever actually shown to
 * the user -- the navigation happens before anything paints).
 */
export default function SiteAdminTabsIndexRedirect() {
    // `as any` here is just a TypeScript escape hatch: Expo Router's typed
    // routes don't always know about this literal string path, so the cast
    // silences a type error without changing behavior at runtime.
    return <Redirect href={'/(site-admin-tabs)/school' as any} />;
}
