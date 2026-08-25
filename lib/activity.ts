// lib/activity.ts
// Shared activity logging helpers so dashboard and fitness write the same
// mileage event shape into Supabase.
//
// FILE OVERVIEW:
// This module is the data-access layer for the `activity_logs` Supabase
// table -- the append-only ledger of every "I walked/ran/biked X" event a
// student logs. It intentionally does NOT maintain any running total itself;
// every read function here recomputes totals fresh from the raw rows (see
// the big comment on getTrailMilesForUser below for why that matters).
//
// Exports:
//   - logMilesActivity(params): INSERT a single new activity_logs row.
//   - getTrailMilesForUser(userId, trailId): SELECT + sum miles for one
//     student on one trail (drives that trail's progress bar).
//   - ActivityLogEntry (type) + fetchStudentActivityLogs(studentId): the
//     teacher-facing day-by-day log for one student.
//   - FitnessResultEntry (type) + fetchClassFitnessSummary(classId): the
//     teacher-facing Presidential Fitness Test summary for a whole class,
//     via a Postgres RPC function rather than a direct table read.

import { supabase } from '../utils/supabase';

// Parameters accepted by logMilesActivity. Mirrors (in camelCase) the
// columns of the activity_logs table that get written.
//   - userId:       the auth user id (profiles.id) this log entry belongs to.
//   - miles:        the number of miles this single log entry represents,
//                    already converted from whatever unit the student
//                    entered (see lib/activityTypes.ts's milesForActivity).
//   - trailId:      which trail this progress should count toward.
//   - activityType: e.g. 'walking', 'running', 'cycling' -- defaults to
//                    'walking' if omitted.
//   - inputAmount:  the RAW amount the student typed before conversion (e.g.
//                    10000 if they entered steps) -- stored alongside the
//                    converted `miles` value purely so the original entry
//                    can be displayed/audited later (see
//                    formatActivityJournalLine in lib/activityTypes.ts).
//   - inputUnit:    which unit inputAmount is in (e.g. 'steps', 'minutes').
type LogMilesParams = {
    userId: string;
    miles: number;
    trailId: string;
    activityType?: string;
    inputAmount?: number;
    inputUnit?: string;
};

/**
 * Records one new activity/mileage event for a student.
 *
 * @param params - See LogMilesParams above for field-by-field meaning.
 * @throws Error if `miles` is not a finite positive number, or if `trailId`
 *   is falsy (empty string, null, etc.) -- both are checked client-side
 *   BEFORE any network call, so a bad call never reaches Supabase.
 * @throws The raw Supabase error if the INSERT itself fails (e.g. a Row
 *   Level Security policy rejects it, or a network error occurs).
 * @returns Nothing on success (a resolved Promise<void>).
 *
 * Side effect: inserts exactly one new row into the `activity_logs` table.
 * activityType/inputAmount/inputUnit are optional on the caller's side but
 * always written explicitly (as `null` when omitted) so every row has a
 * consistent shape.
 */
export async function logMilesActivity({ userId, miles, trailId, activityType, inputAmount, inputUnit }: LogMilesParams) {
    // Guard clauses: reject obviously-invalid input before ever hitting the
    // network. miles <= 0 also rejects negative numbers, not just zero.
    if (!Number.isFinite(miles) || miles <= 0) {
        throw new Error('Miles must be greater than zero.');
    }
    if (!trailId) {
        throw new Error('An active trail is required before logging miles.');
    }

    // Write one row to activity_logs. Supabase's `.insert()` returns
    // `{ data, error }`; we only care about `error` here since the caller
    // doesn't need the inserted row back.
    const { error } = await supabase.from('activity_logs').insert({
        user_id: userId,
        miles,
        trail_id: trailId,
        activity_type: activityType ?? 'walking',
        input_amount: inputAmount ?? null,
        input_unit: inputUnit ?? null,
    });

    // Supabase never throws on its own for a failed request -- it returns
    // the error object instead. Re-throwing here lets callers use a normal
    // try/catch around logMilesActivity(...) instead of checking a return
    // value every time.
    if (error) throw error;
}

// Progress toward ONE specific trail, computed fresh from activity_logs
// rather than trusting a single shared counter. This is what lets students
// switch trails freely: switching only changes which trail_id is "active"
// on their profile, never touches any mileage total, so there's no
// carry-over math and no risk of the same logged miles double-counting
// toward more than one trail. profiles.total_miles_walked is a SEPARATE,
// unrelated lifetime total (used for badges/leaderboard) and is untouched
// by any of this.
/**
 * Computes how many miles a single student has logged toward a single
 * trail, by summing every matching activity_logs row fresh each time (no
 * cached/stored counter is trusted).
 *
 * @param userId - The student's auth user id.
 * @param trailId - Which trail's progress to compute.
 * @returns The sum of `miles` across every activity_logs row where
 *   user_id = userId AND trail_id = trailId. Returns 0 if there are no
 *   matching rows (not an error case).
 * @throws The raw Supabase error if the SELECT fails.
 *
 * Side effect: read-only Supabase query (`select` on `activity_logs`),
 * no writes.
 */
export async function getTrailMilesForUser(userId: string, trailId: string): Promise<number> {
    // Fetch just the `miles` column (not the whole row -- cheaper) for every
    // log entry belonging to this user AND this trail. Both `.eq()` filters
    // are combined with an implicit AND.
    const { data, error } = await supabase
        .from('activity_logs')
        .select('miles')
        .eq('user_id', userId)
        .eq('trail_id', trailId);

    if (error) throw error;

    // Sum up the `miles` column across every returned row. `data || []`
    // guards against `data` being null (which the client can return even
    // without an error, e.g. for an empty result set in some edge cases).
    // `Number(row.miles || 0)` guards against a null/undefined miles value
    // on any individual row so one bad row can't turn the whole sum into NaN.
    return (data || []).reduce((sum, row) => sum + Number(row.miles || 0), 0);
}

// ---------------------------------------------------------------------------
// Teacher-facing: day-by-day breakdown for one student, instead of just
// their lifetime mileage total. Relies on activity_logs_select_teacher_of_class
// (a teacher can read this row if the student is in one of their classes) —
// see supabase/add-teacher-activity-detail-access.sql.
// ---------------------------------------------------------------------------
// One row of a student's activity_logs history, in the camelCase shape the
// UI consumes (as opposed to the snake_case column names Postgres uses).
//   - id:           the log row's primary key (as a string).
//   - miles:        miles credited by this entry (already-converted value).
//   - trailId:      which trail this entry counted toward.
//   - activityType: e.g. 'walking', 'running', 'cycling', 'swimming'.
//   - inputAmount:  the raw amount the student originally entered (e.g.
//                    10000 steps), or null if not recorded.
//   - inputUnit:    the unit inputAmount is in (e.g. 'steps'), or null.
//   - createdAt:    ISO timestamp string of when the row was inserted.
export type ActivityLogEntry = {
    id: string;
    miles: number;
    trailId: string;
    activityType: string;
    inputAmount: number | null;
    inputUnit: string | null;
    createdAt: string;
};

/**
 * Fetches the full, newest-first activity log history for a single student
 * -- used by teacher-facing screens to show a day-by-day breakdown rather
 * than just a lifetime total.
 *
 * @param studentId - The student's auth user id (activity_logs.user_id).
 * @returns An array of ActivityLogEntry, most recent first. Empty array if
 *   the student has no logged activity yet.
 * @throws The raw Supabase error if the SELECT fails -- notably, this can
 *   fail with a permissions error if the requesting teacher isn't actually
 *   linked to this student's class (see the
 *   activity_logs_select_teacher_of_class Row Level Security policy
 *   mentioned in the comment above this function).
 *
 * Side effect: read-only Supabase query, no writes.
 */
export async function fetchStudentActivityLogs(studentId: string): Promise<ActivityLogEntry[]> {
    // Select only the columns the UI actually needs, filtered to this one
    // student, ordered newest-first (`ascending: false`) so the teacher sees
    // the most recent activity at the top of the list.
    const { data, error } = await supabase
        .from('activity_logs')
        .select('id, miles, trail_id, activity_type, input_amount, input_unit, created_at')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    // Convert each raw (snake_case, loosely-typed) Postgres row into the
    // strongly-typed, camelCase ActivityLogEntry shape the UI expects:
    //   - id/trailId are coerced to String() in case Postgres returns them
    //     as numbers or another type.
    //   - miles falls back to 0 if null/undefined so arithmetic elsewhere
    //     never has to null-check it.
    //   - activityType falls back to 'walking' to match the same default
    //     used when the row was originally inserted.
    //   - inputAmount is only converted to a Number when it's actually
    //     present (`!= null`); otherwise it stays null rather than becoming
    //     NaN or 0, preserving the "we don't know" meaning.
    return (data || []).map((row: any) => ({
        id: String(row.id),
        miles: Number(row.miles || 0),
        trailId: String(row.trail_id),
        activityType: row.activity_type || 'walking',
        inputAmount: row.input_amount != null ? Number(row.input_amount) : null,
        inputUnit: row.input_unit || null,
        createdAt: row.created_at,
    }));
}

// ---------------------------------------------------------------------------
// Teacher-facing: presidential fitness-test results for every student in a
// class, via a SECURITY DEFINER function rather than a direct table read —
// see supabase/add-teacher-activity-detail-access.sql for why: it lets a
// teacher see exercise scores without ever exposing the private
// journal_reflection text students write on the same table.
// ---------------------------------------------------------------------------
// One Presidential Fitness Test attempt, as returned by the
// get_class_fitness_summary RPC for a single student in a class.
//   - studentId:      which student this attempt belongs to.
//   - exerciseLogged: the name/kind of exercise (e.g. "push-ups", "mile
//                     run") the score is for.
//   - exerciseScore:  the raw numeric score/result, or null if not scored.
//   - isTargetMet:    whether this attempt cleared the age/gender
//                     benchmark for that exercise, or null if unknown.
//   - loggedAt:       ISO timestamp string of when the attempt was logged.
export type FitnessResultEntry = {
    studentId: string;
    exerciseLogged: string;
    exerciseScore: number | null;
    isTargetMet: boolean | null;
    loggedAt: string;
};

/**
 * Fetches Presidential Fitness Test results for every student in a class,
 * via a Postgres RPC (remote procedure call / stored function) rather than
 * a direct table SELECT.
 *
 * @param classId - The class whose students' fitness results to fetch.
 * @returns An array of FitnessResultEntry, one per logged attempt (a
 *   student with multiple attempts appears multiple times). Empty array if
 *   no attempts have been logged yet.
 * @throws The raw Supabase error if the RPC call fails.
 *
 * Side effect: calls the `get_class_fitness_summary` Postgres function
 * (read-only from this client's point of view). Using an RPC here -- a
 * SECURITY DEFINER function defined in the database -- instead of a normal
 * `.from('activity_journal').select(...)` is deliberate: it lets the
 * function return only the exercise score/target-met columns while never
 * exposing the private `journal_reflection` free-text field students write
 * on that same underlying table. A direct table read would either expose
 * that private text to teachers or require a much more complex column-level
 * security setup.
 */
export async function fetchClassFitnessSummary(classId: string): Promise<FitnessResultEntry[]> {
    // supabase.rpc(name, params) calls a named Postgres function -- here,
    // passing `target_class_id` as the function's single argument.
    const { data, error } = await supabase.rpc('get_class_fitness_summary', { target_class_id: classId });

    if (error) throw error;

    // Convert each raw row from the RPC's result set into the camelCase
    // FitnessResultEntry shape. exerciseScore is only Number()-converted
    // when present, preserving `null` (unscored) rather than coercing it to
    // 0 or NaN. isTargetMet and loggedAt are passed through as-is since
    // they're already the right JS type (boolean/string) coming back from
    // Postgres via the JS client.
    return (data || []).map((row: any) => ({
        studentId: row.student_id,
        exerciseLogged: row.exercise_logged,
        exerciseScore: row.exercise_score != null ? Number(row.exercise_score) : null,
        isTargetMet: row.is_target_met,
        loggedAt: row.logged_at,
    }));
}
