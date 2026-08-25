// lib/profiles.ts
// Profile bootstrap helpers. The auth user and the `profiles` table are kept
// in sync here so screens can rely on one place for fallback username logic.
//
// FILE OVERVIEW (for someone new to this codebase):
// Every signed-in user in this app has a matching row in the `profiles`
// table (keyed by their Supabase Auth user id) holding app-specific data
// that doesn't live on the auth user itself: username, display name, role,
// which "view" of the app they're in, school/district info, mileage
// totals, etc. This module's one exported function, `ensureProfileRow`,
// is the shared "create it if missing, patch it if present, and always
// fill in sensible defaults for anything not explicitly passed" routine --
// it's called after login/signup flows so the rest of the app can assume a
// profile row always exists and is reasonably filled in.
//
// Exports:
//   - `ensureProfileRow(params)` -- upserts the caller's profile row,
//     merging any explicitly-passed fields with whatever already exists in
//     the database (or sensible fallbacks if neither is present).
// (`buildFallbackUsername` is a private helper, not exported.)

import { supabase } from '../utils/supabase';

// The set of fields ensureProfileRow accepts. Every field except `userId`
// is optional -- any field left out falls back to whatever's already
// stored in the database for this user, or (failing that) a hardcoded
// default. See the resolution logic inside ensureProfileRow for exactly
// how each field's fallback chain works.
type EnsureProfileParams = {
    userId: string; // The Supabase Auth user id this profile row belongs to (used as the `profiles.id` primary key).
    email?: string | null; // The user's email, used only as a fallback source for username (see buildFallbackUsername) -- not stored on the profile itself.
    username?: string | null; // Desired username; falls back to the existing stored username, then to an email-derived guess, then to 'Explorer'.
    display_name?: string | null; // Desired display name shown in the UI; falls back to the existing stored display name, then to whatever username resolves to.
    app_role?: string; // Desired app role (e.g. 'student', 'teacher', 'admin'); falls back to the existing app_role, then the legacy `role` column, then 'student'.
    active_view?: string; // Which app shell/UI the user currently sees (e.g. 'classic', 'teacher'); falls back to the existing value, then 'classic'.
    district_id?: string | null; // The district this user belongs to, if any.
    school_district_name?: string | null; // Human-readable district name, if any.
    school_name?: string | null; // Human-readable school name, if any.
    generic_grades_taught?: string | null; // Free-text grade levels a teacher-type user teaches, if any.
    avatar_seed?: string | null; // Seed string used to generate this user's avatar image; falls back to the existing seed, then a freshly-generated DiceBear seed derived from the username.
};

// Builds a reasonable username when none was explicitly provided anywhere
// else in the resolution chain (see ensureProfileRow below). Tries, in
// order: the given username (trimmed, capped to 40 chars), then the local
// part of the given email (the bit before '@', also capped to 40 chars),
// then finally the literal string 'Explorer' if neither is usable.
// Parameters:
//   - username: a candidate username, or null/undefined.
//   - email: a candidate email to derive a username from, or null/undefined.
// Returns: a non-empty username string. Side effects: none -- pure function.
function buildFallbackUsername({
    username,
    email,
}: {
    username?: string | null;
    email?: string | null;
}): string {
    const provided = username?.trim();
    if (provided) return provided.slice(0, 40);

    // No explicit username -- try to derive one from the email's local
    // part (everything before the '@'), e.g. "jane.doe@school.org" -> "jane.doe".
    const fromEmail = email?.split('@')[0]?.trim();
    if (fromEmail) return fromEmail.slice(0, 40);

    // Neither was usable -- last-resort generic default.
    return 'Explorer';
}

// Ensures a `profiles` row exists for this user and brings it up to date
// with any explicitly-passed fields, while preserving whatever's already
// stored for anything left unspecified. This is the "create or patch, with
// smart defaults" routine called after login/signup so the rest of the app
// never has to worry about a missing or half-filled-in profile row.
//
// Parameters: an EnsureProfileParams object (see type above for each
// field's meaning and fallback behavior). Only `userId` is required.
//
// Resolution logic (for each field): prefer the value explicitly passed
// in this call; if not passed, prefer whatever is already stored on the
// existing profile row (read via a SELECT before the upsert below); if
// neither is available, fall back to a hardcoded default (e.g. 'student'
// for role, 'classic' for active_view, a freshly generated DiceBear avatar
// URL for avatar_seed).
//
// Returns: the Supabase PostgrestBuilder promise for the upsert call
// itself (i.e. this function does NOT await/unwrap it) -- callers get back
// whatever `{ data, error }` shape a Supabase `.upsert()` call resolves to,
// and are responsible for checking `error` themselves.
//
// Side effects:
//   - One SELECT against `profiles` (`.maybeSingle()` -- returns null
//     rather than throwing if no row exists yet for this user).
//   - One UPSERT against `profiles`, keyed by `id` (onConflict: 'id'),
//     which INSERTs a new row if none existed or UPDATEs the existing one
//     if it did. `ignoreDuplicates: false` means an existing row's columns
//     ARE overwritten by this call's resolved values (not left alone),
//     which is what allows a user's own account-settings form to actually
//     change previously-stored data rather than a conflicting write always
//     silently losing to whatever was there first.
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

    // Read whatever's already stored for this user (if anything) so the
    // fallback chains below can prefer existing data over hardcoded
    // defaults. `.maybeSingle()` returns `data: null` (not an error) when
    // no row exists yet -- e.g. the very first time this runs for a brand
    // new account.
    const { data: existingProfile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_seed, total_miles_walked, app_role, active_view, role, district_id, school_district_name, school_name, generic_grades_taught')
        .eq('id', userId)
        .maybeSingle();

    // Each field below follows the same pattern: explicitly-passed value
    // wins, then the existing stored value, then a hardcoded default.
    // `buildFallbackUsername` is only reached here if BOTH the passed-in
    // username and the existing stored username were empty.
    const safeUsername = providedUsername || existingProfile?.username || buildFallbackUsername({ username: null, email });
    const safeDisplayName = display_name?.trim() || existingProfile?.display_name || safeUsername;
    // `role` is a legacy column kept in sync alongside `app_role` (see the
    // "THE COUPLING FIX" comment on the upsert payload below) -- checked
    // here too so an account created before `app_role` existed still
    // resolves to its real role instead of falling all the way to 'student'.
    const resolvedRole = app_role ?? existingProfile?.app_role ?? existingProfile?.role ?? 'student';
    const resolvedActiveView = active_view ?? existingProfile?.active_view ?? 'classic';
    const resolvedDistrictId = district_id ?? existingProfile?.district_id ?? null;
    const resolvedSchoolDistrictName = school_district_name ?? existingProfile?.school_district_name ?? null;
    const resolvedSchoolName = school_name ?? existingProfile?.school_name ?? null;
    const resolvedGrades = generic_grades_taught ?? existingProfile?.generic_grades_taught ?? null;
    // Avatar seed: explicit value, then existing stored value, then a
    // freshly-generated DiceBear (bottts style) avatar URL seeded with this
    // user's resolved username, so every user without a custom avatar
    // still gets a distinct, stable-looking generated one.
    const resolvedAvatarSeed = avatar_seed || existingProfile?.avatar_seed || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeUsername)}&backgroundColor=ff595e`;
    // Mileage total is never passed into this function -- it's only ever
    // updated elsewhere (activity logging) -- so this just carries forward
    // whatever's already stored, defaulting a brand new profile to 0.
    const resolvedMiles = typeof existingProfile?.total_miles_walked === 'number' ? existingProfile.total_miles_walked : 0;

    // Upsert: creates the row if `userId` has none yet, otherwise updates
    // every listed column on the existing row to these resolved values.
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
                // Tells Postgres which column identifies "the same row" for
                // conflict-detection purposes -- a second upsert with the
                // same `id` updates the existing row instead of erroring
                // on a duplicate primary key.
                onConflict: 'id',
                ignoreDuplicates: false, // Ensures frontend form changes force an update over backend defaults
            }
        );
}
