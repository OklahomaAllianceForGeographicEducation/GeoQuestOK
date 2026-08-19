// lib/auth.ts
// Shared sign-out helper used by every "Sign Out" button in the app
// (teacher, student, and OKAGE account screens).
//
// This clears the LOCAL session first (scope: 'local' -- just wipes the
// on-device/browser storage, no network round trip) and navigates away
// immediately, before ever touching the network. An earlier version did
// the opposite: it called the network-dependent global signOut() FIRST
// and only cleared local storage afterward (on error, or after an 8s
// timeout). On web that had a real failure mode -- the button gave no
// loading feedback, so on a slow connection a student would see nothing
// happen and refresh the page out of impatience. That refresh aborts the
// in-flight request entirely, so neither the network call NOR its
// fallback ever ran, leaving the old session sitting untouched in
// localStorage. The next page load then reads that stale-but-valid
// session back out and routes the student into whatever account it
// actually belongs to -- reported as "sign out did nothing, and refresh
// took me into an account/portal I shouldn't have access to." Clearing
// local storage first (fast, not network-dependent) means that window
// effectively no longer exists: by the time a refresh could happen,
// there's nothing left in storage to resume.
import { supabase } from '../utils/supabase';

export async function signOutAndRedirect(router: { replace: (href: any) => void }): Promise<void> {
    try {
        await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
        console.warn('[signOutAndRedirect] local sign-out failed:', err);
    }
    router.replace('/');

    // Best-effort: also ask Supabase to revoke the refresh token
    // server-side, so a leaked/cached token can't keep being used
    // elsewhere. Fired after local state is already cleared and
    // navigation already started, so a slow or dropped connection here
    // can no longer block or undo the sign-out the user already saw
    // happen.
    supabase.auth.signOut().catch((err) => {
        console.warn('[signOutAndRedirect] background global sign-out failed (local sign-out already completed):', err);
    });
}
