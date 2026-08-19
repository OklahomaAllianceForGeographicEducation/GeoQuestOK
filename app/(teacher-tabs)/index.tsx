// app/(teacher-tabs)/index.tsx
// Not a visible tab (see _layout.tsx's `href: null` on this screen) — this
// file only exists because expo-router needs an `index` route to resolve
// the bare `/(teacher-tabs)` path that lib/access.ts's
// resolveAppShellPath() and app/_layout.tsx's post-login redirect both
// send teachers to. It used to render its own "Dashboard" (miles/linked-
// students stats + a duplicate "Create Classroom" flow), but that was
// fully redundant with Classes (class creation/join codes) and Reports
// (the same stats, plus every other student-facing view) — removed
// rather than kept as dead weight, so immediately forward to Reports.

import { Redirect } from 'expo-router';

export default function TeacherTabsIndexRedirect() {
    return <Redirect href="/(teacher-tabs)/reports" />;
}
