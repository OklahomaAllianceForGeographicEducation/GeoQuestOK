// lib/auth.ts
// Shared sign-out helper used by every "Sign Out" button in the app
// (teacher, student, admin, site admin, and OKAGE account screens).
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
//
// stopAutoRefresh() below closes a second, related hole in that same
// fix: utils/supabase.js configures `autoRefreshToken: true`, which
// schedules a background timer to refresh the access token before it
// expires. `scope: 'local'` sign-out clears storage but does NOT cancel
// that already-scheduled timer, and -- unlike a global sign-out -- does
// NOT revoke the refresh token server-side either. If that timer fires
// after local storage is cleared but before the background global
// sign-out below has finished revoking it, the refresh call still
// succeeds (the old refresh token is still valid server-side) and writes
// a brand new, fully valid session straight back into local storage --
// silently reviving the account that just "signed out." The next
// redirect or page reload then reads that revived session and routes the
// user right back into their portal, which is exactly the "sign out sent
// me back into the app, and reloading froze" failure reported live on
// the District Admin account screen. Stopping the timer BEFORE clearing
// storage closes the window completely: nothing is left scheduled that
// could ever write a session back in.
import { supabase } from '../utils/supabase';

export async function signOutAndRedirect(router: { replace: (href: any) => void }): Promise<void> {
    // Cancel any pending/scheduled token-refresh timer first -- see the
    // comment above for why this has to happen before local sign-out, not
    // after.
    try {
        supabase.auth.stopAutoRefresh();
    } catch (err) {
        console.warn('[signOutAndRedirect] stopAutoRefresh failed:', err);
    }

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
