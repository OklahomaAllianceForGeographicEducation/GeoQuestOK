// lib/access.ts
// Shared helpers for deciding which app shell and view a profile should use.

export type AppRole =
    | 'student'
    | 'teacher'
    | 'admin'
    | 'site_admin'
    | 'super_admin'
    | 'professor'
    | 'okage';

export type AppView =
    | 'classic'
    | 'teacher'
    | 'admin'
    | 'site_admin'
    | 'super_admin'
    | 'professor'
    | 'okage';

export type ProfileAccessShape = {
    app_role?: string | null;
    role?: string | null;
    active_view?: string | null;
};

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

export function getResolvedRole(profile?: ProfileAccessShape | null): AppRole {
    return normalizeRole(profile?.app_role ?? profile?.role);
}

export function getResolvedView(profile?: ProfileAccessShape | null): AppView {
    return normalizeView(profile?.active_view);
}

export function resolveAppShellPath(
    profile?: ProfileAccessShape | null
): '/(tabs)/dashboard' | '/(teacher-tabs)' | '/(admin-tabs)' | '/(okage-tabs)' | '/(site-admin-tabs)' {
    const role = getResolvedRole(profile);
    const view = getResolvedView(profile);

    if (role === 'student') {
        return '/(tabs)/dashboard';
    }

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

    return '/(teacher-tabs)';
}

export function getAllowedTeacherViews(role: AppRole): AppView[] {
    if (role === 'teacher') return ['classic', 'teacher'];
    if (role === 'admin') return ['admin'];
    if (role === 'site_admin') return ['site_admin', 'teacher', 'classic'];
    if (role === 'professor') return ['professor'];
    if (role === 'super_admin') return ['super_admin'];
    if (role === 'okage') return ['okage', 'teacher', 'classic'];
    return [];
}
