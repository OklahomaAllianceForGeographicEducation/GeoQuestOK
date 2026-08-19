// lib/access.ts
// Shared helpers for deciding which app shell and view a profile should use.

export type AppRole =
    | 'student'
    | 'teacher'
    | 'admin'
    | 'super_admin'
    | 'professor'
    | 'okage';

export type AppView =
    | 'classic'
    | 'teacher'
    | 'admin'
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

export function resolveAppShellPath(profile?: ProfileAccessShape | null): '/(tabs)/dashboard' | '/(teacher-tabs)' | '/(okage-tabs)' {
    const role = getResolvedRole(profile);
    const view = getResolvedView(profile);

    if (role === 'student') {
        return '/(tabs)/dashboard';
    }

    if (role === 'teacher') {
        return view === 'classic' ? '/(tabs)/dashboard' : '/(teacher-tabs)';
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
    if (role === 'professor') return ['professor'];
    if (role === 'super_admin') return ['super_admin'];
    if (role === 'okage') return ['okage', 'teacher', 'classic'];
    return [];
}

