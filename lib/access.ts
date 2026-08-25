// lib/access.ts
// Shared helpers for deciding which app shell and view a profile should use.
//
// FILE OVERVIEW (read this first):
// This module is pure client-side logic -- it never talks to Supabase or the
// network itself. Instead it takes a `profile` object (already fetched from
// the `profiles` table elsewhere in the app) and answers two questions:
//   1. "What ROLE is this account?" (student, teacher, admin, ...)
//   2. "Given that role, which app SHELL (a top-level tab-bar layout, e.g.
//      the `(teacher-tabs)` route group) should we route them into, and
//      which VIEW inside that shell are they currently looking at?"
// The "view" concept exists because some roles (teacher, site_admin, okage)
// can preview what OTHER roles see -- e.g. a Site Administrator can flip
// their `active_view` to 'classic' to see the app exactly as a student would,
// without actually being a student. `resolveAppShellPath` is the function
// every top-level layout/redirect calls to decide which route group to send
// a signed-in user into.
//
// Exports from this file:
//   - AppRole / AppView: the closed sets of valid role/view strings.
//   - ProfileAccessShape: the minimal shape this module needs from a
//     `profiles` row (callers can pass a full profile object; only these
//     three fields are read).
//   - getResolvedRole / getResolvedView: normalize possibly-messy/legacy
//     string values on a profile into a known AppRole/AppView.
//   - resolveAppShellPath: the main "where should this user land" function.
//   - getAllowedTeacherViews: which AppViews a given role is allowed to
//     switch into (drives the view-toggle UI on account screens).

/**
 * The set of account "roles" recognized by the app. This drives which
 * dedicated tab-bar shell (route group) a signed-in user is routed into --
 * see `resolveAppShellPath` below. Stored (as a plain string, possibly in a
 * different case) on a profile row's `app_role` or legacy `role` column and
 * normalized into one of these exact values by `normalizeRole`.
 *   - 'student'     -> the default/base experience, `(tabs)` shell.
 *   - 'teacher'     -> classroom-level views, `(teacher-tabs)` shell.
 *   - 'admin'       -> District Administrator, `(admin-tabs)` shell.
 *   - 'site_admin'  -> Site Administrator (building-level principal),
 *                      `(site-admin-tabs)` shell.
 *   - 'super_admin' -> highest-privilege internal role.
 *   - 'professor'   -> a distinct educator role with its own shell/view.
 *   - 'okage'       -> OKAGE staff (the organization behind the app),
 *                      `(okage-tabs)` shell.
 */
export type AppRole =
    | 'student'
    | 'teacher'
    | 'admin'
    | 'site_admin'
    | 'super_admin'
    | 'professor'
    | 'okage';

/**
 * The "view" a user is currently previewing, independent of their actual
 * AppRole. Certain roles (teacher, site_admin, okage) are allowed to look at
 * the app as if they were a different, lower-privileged role -- e.g. a
 * teacher toggling to 'classic' sees the exact same screens a student would.
 * Stored on a profile's `active_view` column and normalized by
 * `normalizeView`. Which views a role may switch into is decided by
 * `getAllowedTeacherViews`, not by this type itself (this type is just the
 * full universe of possible values).
 */
export type AppView =
    | 'classic'
    | 'teacher'
    | 'admin'
    | 'site_admin'
    | 'super_admin'
    | 'professor'
    | 'okage';

/**
 * The minimal subset of a `profiles` table row this module needs. Callers
 * typically pass a full profile object fetched from Supabase -- this type
 * just documents (and type-checks) which fields actually get read here.
 *   - app_role:    the current/preferred role column. Read first.
 *   - role:        an older/legacy role column, used as a fallback if
 *                  `app_role` isn't set (see `getResolvedRole`).
 *   - active_view: which AppView the user currently has toggled on,
 *                  independent of their role (see `getResolvedView`).
 * All three are optional/nullable because a freshly-created profile row (or
 * one predating these columns) may not have them populated yet.
 */
export type ProfileAccessShape = {
    app_role?: string | null;
    role?: string | null;
    active_view?: string | null;
};

// Takes whatever raw string (or null/undefined) lives in a profile's role
// column and maps it onto exactly one of the AppRole values, case-
// insensitively. Anything unrecognized (including no value at all) falls
// back to 'student' -- the safest, lowest-privilege default. Not exported;
// only `getResolvedRole` below calls this.
function normalizeRole(value?: string | null): AppRole {
    switch ((value || 'student').toLowerCase()) {
        case 'teacher':
            return 'teacher';
        case 'admin':
            return 'admin';
        case 'site_admin':
            return 'site_admin';
        case 'super_admin':
            return 'super_admin';
        case 'professor':
            return 'professor';
        case 'okage':
            return 'okage';
        default:
            return 'student';
    }
}

// Same idea as normalizeRole above, but for the `active_view` column: maps a
// raw string onto exactly one AppView, case-insensitively, defaulting to
// 'classic' (the plain student-style view) when unset or unrecognized.
function normalizeView(value?: string | null): AppView {
    switch ((value || 'classic').toLowerCase()) {
        case 'teacher':
            return 'teacher';
        case 'admin':
            return 'admin';
        case 'site_admin':
            return 'site_admin';
        case 'professor':
            return 'professor';
        case 'super_admin':
            return 'super_admin';
        case 'okage':
            return 'okage';
        default:
            return 'classic';
    }
}

/**
 * Reads and normalizes the effective role for a profile.
 *
 * @param profile - Any object matching ProfileAccessShape (or null/undefined
 *   for "no profile loaded yet"). Only `app_role` and `role` are read.
 * @returns The normalized AppRole. Prefers `app_role`; if that's not set,
 *   falls back to the legacy `role` column; if neither is set, defaults to
 *   'student' (via normalizeRole's own fallback).
 *
 * No side effects -- pure function, no network calls.
 */
export function getResolvedRole(profile?: ProfileAccessShape | null): AppRole {
    return normalizeRole(profile?.app_role ?? profile?.role);
}

/**
 * Reads and normalizes the effective "preview view" for a profile.
 *
 * @param profile - Any object matching ProfileAccessShape (or null/undefined).
 *   Only `active_view` is read.
 * @returns The normalized AppView, defaulting to 'classic' when unset.
 *
 * No side effects -- pure function, no network calls.
 */
export function getResolvedView(profile?: ProfileAccessShape | null): AppView {
    return normalizeView(profile?.active_view);
}

/**
 * Decides which top-level route group (tab-bar "shell") a signed-in user
 * should be routed into, based on their resolved role and, for roles that
 * support previewing other experiences, their currently-selected view.
 *
 * @param profile - Any object matching ProfileAccessShape (or null/undefined,
 *   which resolves to the student default).
 * @returns One of the fixed route-group path strings. Callers (typically a
 *   layout's redirect logic) pass this straight to the router.
 *
 * No side effects -- pure function, no network calls, no navigation itself
 * (the caller is responsible for actually redirecting to the returned path).
 */
export function resolveAppShellPath(
    profile?: ProfileAccessShape | null
): '/(tabs)/dashboard' | '/(teacher-tabs)' | '/(admin-tabs)' | '/(okage-tabs)' | '/(site-admin-tabs)' {
    const role = getResolvedRole(profile);
    const view = getResolvedView(profile);

    // Students have no shell to choose between -- always the base tab bar.
    if (role === 'student') {
        return '/(tabs)/dashboard';
    }

    // Teachers normally land in their own dedicated shell, but if they've
    // toggled their active_view to 'classic' (previewing the student
    // experience), send them to the same dashboard a student would see.
    if (role === 'teacher') {
        return view === 'classic' ? '/(tabs)/dashboard' : '/(teacher-tabs)';
    }

    // District Administrators (signup.tsx's "District Administrator"
    // educator sub-type) get their own dedicated shell -- district/school/
    // class-level reporting, never a per-student roster -- rather than
    // falling into the teacher portal like every other non-student/non-
    // okage role below. No preview-as-teacher/student toggle for this
    // role -- that capability lives on Site Administrators instead (see
    // below).
    if (role === 'admin') {
        return '/(admin-tabs)';
    }

    // Site Administrators (signup.tsx's "Site Administrator" educator
    // sub-type -- building-level principals) get a DIFFERENT dedicated
    // shell from District Administrators: their own school's data goes one
    // level deeper (per-student miles + Presidential Fitness Test targets
    // met, never a quiz score or raw activity log), while every other
    // school in their district only ever shows the same one-line aggregate
    // a teacher sees for schools that aren't their own. Like OKAGE staff,
    // they can also preview the Teacher and Student ("classic")
    // experiences via the same active_view toggle, to see what their
    // school's teachers/students actually see.
    if (role === 'site_admin') {
        if (view === 'classic') return '/(tabs)/dashboard';
        if (view === 'teacher') return '/(teacher-tabs)';
        return '/(site-admin-tabs)';
    }

    if (role === 'okage') {
        if (view === 'classic') return '/(tabs)/dashboard';
        if (view === 'teacher') return '/(teacher-tabs)';
        return '/(okage-tabs)';
    }

    // Fallback for any remaining role not explicitly handled above (e.g.
    // 'professor', 'super_admin') -- routed into the teacher shell as a
    // reasonable default rather than throwing or returning undefined.
    return '/(teacher-tabs)';
}

/**
 * Lists which AppViews a given role is allowed to switch its `active_view`
 * into -- this is what drives the view-toggle control shown on account
 * screens (e.g. "View as Teacher" / "View as Student" buttons). The order of
 * entries has no special meaning here; each screen decides how to present
 * the list.
 *
 * @param role - The user's actual, resolved AppRole (from getResolvedRole).
 * @returns An array of AppView values this role may pick. An empty array
 *   means the role has no preview toggle at all (e.g. 'student', 'admin').
 *   Note that 'admin' (District Administrator) intentionally returns only
 *   its own single view, per the comment on resolveAppShellPath above: that
 *   role has no preview-as-teacher/student capability.
 *
 * No side effects -- pure function, no network calls.
 */
export function getAllowedTeacherViews(role: AppRole): AppView[] {
    if (role === 'teacher') return ['classic', 'teacher'];
    if (role === 'admin') return ['admin'];
    if (role === 'site_admin') return ['site_admin', 'teacher', 'classic'];
    if (role === 'professor') return ['professor'];
    if (role === 'super_admin') return ['super_admin'];
    if (role === 'okage') return ['okage', 'teacher', 'classic'];
    return [];
}
