// lib/deleteAccount.ts
// Shared "Delete Account" handler for every account screen (student,
// teacher, OKAGE, site admin, district admin) -- confirms with the user,
// invokes the delete-account Edge Function (the only thing that can
// actually remove the auth user and wipe the RLS-protected tables the
// client itself has no DELETE policy for -- see
// supabase/functions/delete-account/index.ts), then signs out locally and
// redirects to the login screen, same as a normal sign-out.
//
// Error-unwrapping mirrors app/signup.tsx's create-account call:
// supabase.functions.invoke() surfaces a non-2xx response as a generic
// FunctionsHttpError, not the function's own { status, message } JSON body
// -- that body has to be read off error.context (a Response object).

import { supabase } from '../utils/supabase';
import { confirmAlert, showAlert } from './confirmAlert';
import { signOutAndRedirect } from './auth';

// The minimal Expo Router shape this module needs -- just enough to
// navigate away after a successful (or the caller's own) redirect; see
// signOutAndRedirect in lib/auth.ts, which is what actually uses it.
type Router = { replace: (href: any) => void };

/**
 * Pulls a human-readable error message out of a failed
 * `supabase.functions.invoke(...)` call.
 *
 * Why this exists: when a Supabase Edge Function responds with a non-2xx
 * HTTP status, the JS client does NOT hand you that response's JSON body
 * directly -- it wraps the failure in a generic `FunctionsHttpError` whose
 * own `.message` is just a generic "Edge Function returned a non-2xx
 * status code" string. The function's own `{ status, message }` JSON body
 * (e.g. "Cannot delete: you are the only teacher for 3 active classes")
 * is only reachable by reading `error.context`, which is the raw
 * `Response` object, and calling `.json()` on it yourself. This mirrors
 * the same unwrapping logic used in app/signup.tsx's create-account call.
 *
 * @param error - The `error` value returned by `supabase.functions.invoke`.
 *   Expected (but not guaranteed) to have a `.context` property that is a
 *   Response-like object with a `.json()` method.
 * @param fallback - The message to use if no better one can be extracted --
 *   e.g. because `error.context` is missing, or its body isn't valid JSON,
 *   or the JSON body has no `message` field.
 * @returns The Edge Function's own `message` field if it could be parsed
 *   out of `error.context`, otherwise `error.message` if present, otherwise
 *   `fallback`.
 *
 * Side effect: none of its own beyond reading (not consuming further)
 * data already attached to the passed-in `error` object; the `.json()`
 * call itself doesn't make a new network request since the response body
 * was already received as part of the original `invoke` call.
 */
async function extractFunctionErrorMessage(error: any, fallback: string): Promise<string> {
    try {
        const body = await error?.context?.json?.();
        if (body?.message) return body.message;
    } catch {
        // Fall back below if the error response body isn't valid JSON.
    }
    return error?.message || fallback;
}

/**
 * Actually performs account deletion -- called only after the user has
 * confirmed via the confirmAlert dialog in confirmDeleteAccount below, never
 * called directly by UI code.
 *
 * @param router - Passed straight through to signOutAndRedirect on success.
 * @param setDeleting - State setter the caller's screen uses to show a
 *   loading/disabled state on the delete button while this is in flight.
 *   Set to `true` immediately, and back to `false` only on failure -- on
 *   success the screen navigates away instead, so there's no "delete
 *   finished, button re-enabled" state to show.
 * @returns Nothing (resolves once either the success or failure path has
 *   fully run). Never rejects -- both the Edge Function call and
 *   signOutAndRedirect are inside the try block, so any failure is caught
 *   and surfaced via showAlert instead of propagating to the caller.
 *
 * Side effects, in order:
 *   1. Invokes the `delete-account` Supabase Edge Function via POST. This
 *      is a SERVER-SIDE operation -- the Edge Function (not this client)
 *      is what actually deletes the Supabase Auth user and cascades that
 *      deletion through every RLS-protected table scoped to it (activity
 *      logs, badges, quiz results, class memberships, etc. -- see
 *      supabase/functions/delete-account/index.ts for the exact cascade;
 *      the client has no DELETE policy on those tables and could not
 *      perform this itself).
 *   2. On failure: unwraps a friendlier message via
 *      extractFunctionErrorMessage and throws it, which is caught below
 *      and shown via showAlert -- the account is left untouched.
 *   3. On success: calls signOutAndRedirect(router), which clears the
 *      now-meaningless local session and navigates to '/'. There is
 *      nothing left server-side to "undo" at this point -- the auth user
 *      and its data are already gone.
 */
async function performDeletion(router: Router, setDeleting: (deleting: boolean) => void) {
    setDeleting(true);
    try {
        const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
        if (error) {
            const message = await extractFunctionErrorMessage(error, 'Could not delete your account. Try again.');
            throw new Error(message);
        }

        // Account (and every row scoped to it) is gone server-side --
        // clear the local session and leave, same as a normal sign-out.
        await signOutAndRedirect(router);
    } catch (err: any) {
        setDeleting(false);
        showAlert(
            'Could Not Delete Account',
            err.message || 'Something went wrong. Please try again, or contact support if this keeps happening.'
        );
    }
}

/**
 * Entry point every "Delete Account" button in the app calls. Shows a
 * strongly-worded confirmation dialog before actually deleting anything --
 * this is the one action in the app that can't be undone by signing back
 * in, so nothing here proceeds without an explicit, second confirming tap.
 *
 * @param router - Passed straight through to performDeletion (and from
 *   there to signOutAndRedirect) if the user confirms.
 * @param setDeleting - State setter the caller's screen uses to drive a
 *   loading/disabled state on whatever button triggered this, matching the
 *   deletingLogId/savingUsername pattern already used elsewhere in the
 *   account screens. Not called at all if the user cancels.
 * @param extraWarning - Optional extra sentence appended to the
 *   confirmation message, used on the Teacher account screen: deleting a
 *   teacher's account also deletes any classes they own (their students'
 *   own data is untouched, but the class and its rosters go away), which
 *   is worth calling out explicitly before the teacher confirms.
 * @returns Nothing synchronously -- this only shows the dialog. The actual
 *   deletion (if confirmed) happens asynchronously afterward via
 *   performDeletion, fired from the dialog's action button's `onPress`.
 *
 * Side effect: shows a confirmAlert (see lib/confirmAlert.ts) with two
 * buttons -- "Cancel" (no-op, style: 'cancel') and "Delete Everything"
 * (style: 'destructive', wired to `void performDeletion(router, setDeleting)`
 * -- the `void` just tells TypeScript this Promise's rejection doesn't
 * need to be handled by the caller, since performDeletion already catches
 * its own errors internally).
 */
export function confirmDeleteAccount(router: Router, setDeleting: (deleting: boolean) => void, extraWarning?: string) {
    const base = 'This permanently deletes your account and everything tied to it: activity logs, badges, quiz results, class memberships, everything.';
    const message = extraWarning ? `${base} ${extraWarning} This cannot be undone. Are you sure?` : `${base} This cannot be undone. Are you sure?`;
    confirmAlert(
        'Delete Account',
        message,
        [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete Everything', style: 'destructive', onPress: () => void performDeletion(router, setDeleting) },
        ]
    );
}
