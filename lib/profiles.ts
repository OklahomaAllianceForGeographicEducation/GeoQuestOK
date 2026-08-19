// lib/profiles.ts
// Profile bootstrap helpers. The auth user and the `profiles` table are kept
// in sync here so screens can rely on one place for fallback username logic.

import { supabase } from '../utils/supabase';

type EnsureProfileParams = {
    userId: string;
    email?: string | null;
    username?: string | null;
    display_name?: string | null;
    app_role?: string;
    active_view?: string;
    district_id?: string | null;
    school_district_name?: string | null;
    school_name?: string | null;
    generic_grades_taught?: string | null;
    avatar_seed?: string | null;
};

function buildFallbackUsername({
    username,
    email,
}: {
    username?: string | null;
    email?: string | null;
}): string {
    const provided = username?.trim();
    if (provided) return provided.slice(0, 40);

    const fromEmail = email?.split('@')[0]?.trim();
    if (fromEmail) return fromEmail.slice(0, 40);

    return 'Explorer';
}

export async function ensureProfileRow({
    userId,
    email,
    username,
    display_name,
    app_role,
    active_view,
    district_id = null,
    school_district_name = null,
    school_name = null,
    generic_grades_taught = null,
    avatar_seed = null,
}: EnsureProfileParams) {
    const providedUsername = username?.trim();

    const { data: existingProfile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_seed, total_miles_walked, app_role, active_view, role, district_id, school_district_name, school_name, generic_grades_taught')
        .eq('id', userId)
        .maybeSingle();

    const safeUsername = providedUsername || existingProfile?.username || buildFallbackUsername({ username: null, email });
    const safeDisplayName = display_name?.trim() || existingProfile?.display_name || safeUsername;
    const resolvedRole = app_role ?? existingProfile?.app_role ?? existingProfile?.role ?? 'student';
    const resolvedActiveView = active_view ?? existingProfile?.active_view ?? 'classic';
    const resolvedDistrictId = district_id ?? existingProfile?.district_id ?? null;
    const resolvedSchoolDistrictName = school_district_name ?? existingProfile?.school_district_name ?? null;
    const resolvedSchoolName = school_name ?? existingProfile?.school_name ?? null;
    const resolvedGrades = generic_grades_taught ?? existingProfile?.generic_grades_taught ?? null;
    const resolvedAvatarSeed = avatar_seed || existingProfile?.avatar_seed || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeUsername)}&backgroundColor=ff595e`;
    const resolvedMiles = typeof existingProfile?.total_miles_walked === 'number' ? existingProfile.total_miles_walked : 0;

    return supabase
        .from('profiles')
        .upsert(
            {
                id: userId,
                username: safeUsername,
                display_name: safeDisplayName,
                avatar_seed: resolvedAvatarSeed,
                total_miles_walked: resolvedMiles,

                // THE COUPLING FIX: Populate both legacy text and explicit custom enum columns
                role: resolvedRole,
                app_role: resolvedRole,

                active_view: resolvedActiveView,
                district_id: resolvedDistrictId,
                school_district_name: resolvedSchoolDistrictName,
                school_name: resolvedSchoolName,
                generic_grades_taught: resolvedGrades
            },
            {
                onConflict: 'id',
                ignoreDuplicates: false, // Ensures frontend form changes force an update over backend defaults
            }
        );
}