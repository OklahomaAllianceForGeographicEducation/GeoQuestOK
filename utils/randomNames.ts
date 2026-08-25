// utils/randomNames.ts
//
// Small, dependency-free helper for turning a student's Supabase user id
// (a UUID string) into a friendly, human-readable display name like
// "SwiftHiker" or "ZestyRanger" -- used anywhere the app wants to show a
// student on a leaderboard or public list *without* exposing their real
// name or raw user id. It's likely imported by leaderboard/reports screens
// (e.g. app/(tabs)/leaderboard.tsx) wherever a row needs a display label
// for a user but the real name shouldn't be shown or hasn't been set.
//
// The key property this module relies on is that the name is
// *deterministic*: calling getAnonymousName with the same userId always
// returns the exact same adjective+noun combo, because the "randomness"
// is really just a hash of the id, not Math.random(). That means a given
// student shows up as the same nickname every time you look at the
// leaderboard, without the app needing to store the generated name
// anywhere.

// Word banks used to build the two-word nickname. Every generated name is
// `${adjective}${noun}` (no separator/space), e.g. "Swift" + "Hiker" ->
// "SwiftHiker". Both lists are themed around hiking/trail/exploration to
// match the app's trail/fitness concept.
const ADJECTIVES = [
    'Swift', 'Clever', 'Sunny', 'Bold', 'Nimble', 'Amused', 'Fearless',
    'Daring', 'Zesty', 'Bright', 'Jolly', 'Spunky', 'Quirky', 'Valiant'
];

const NOUNS = [
    'Hiker', 'Scout', 'Explorer', 'Tracker', 'Walker', 'Ranger', 'Voyager',
    'Runner', 'Pioneer', 'Glider', 'Navigator', 'Trecker', 'Rover', 'Blazer'
];

/**
 * Deterministically maps a student's unique identity to a fun, static nickname combination.
 *
 * @param userId The student's unique id (e.g. their Supabase auth user id,
 *   a UUID string). Any non-empty string works -- this function doesn't
 *   care about the id's format, only its characters.
 * @returns A two-word nickname like "BoldScout" built by hashing `userId`
 *   into two indices, one into ADJECTIVES and one into NOUNS. Returns the
 *   literal fallback string 'Anonymous Explorer' if `userId` is falsy
 *   (empty string, undefined, etc.) so callers always get *some* display
 *   name instead of an empty label or a crash.
 */
export function getAnonymousName(userId: string): string {
    if (!userId) return 'Anonymous Explorer';

    // Create a simple, robust hash code out of the unique string components
    //
    // This is a classic string-hashing loop (the same shape as Java's
    // String.hashCode()): walk every character of the id, and for each one
    // combine its char code into a running `hash` integer using bit-shift
    // multiplication. `(hash << 5) - hash` is a fast way of computing
    // `hash * 31` (shifting left by 5 bits doubles a number five times,
    // i.e. multiplies by 32, then subtracting the original `hash` once
    // brings it down to 31x) -- multiplying by a prime like 31 at each step
    // is what spreads similar input strings out to very different-looking
    // hash values, so two userIds that only differ by one character end up
    // mapping to unrelated-looking nicknames instead of near-identical ones.
    // JS numbers overflow/wrap using 32-bit semantics inside `<<`, so this
    // can produce a large negative or positive integer -- that's expected
    // and is corrected for below with Math.abs().
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Math.abs() guards against `hash` being negative (see overflow note
    // above) before using it with `%`, since a negative dividend would
    // otherwise produce a negative array index. Using `hash + 1` for the
    // noun index (rather than reusing `hash` again) means the adjective
    // and noun aren't picked by the exact same number modulo two different
    // list lengths, which lowers the odds of the two words always moving
    // in lockstep for similar hashes.
    const adjIndex = Math.abs(hash) % ADJECTIVES.length;
    const nounIndex = Math.abs(hash + 1) % NOUNS.length;

    return `${ADJECTIVES[adjIndex]}${NOUNS[nounIndex]}`;
}