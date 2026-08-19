// lib/activity.ts
// Shared activity logging helpers so dashboard and fitness write the same
// mileage event shape into Supabase.

import { supabase } from '../utils/supabase';

type LogMilesParams = {
    userId: string;
    miles: number;
    trailId: string;
    activityType?: string;
    inputAmount?: number;
    inputUnit?: string;
};

export async function logMilesActivity({ userId, miles, trailId, activityType, inputAmount, inputUnit }: LogMilesParams) {
    if (!Number.isFinite(miles) || miles <= 0) {
        throw new Error('Miles must be greater than zero.');
    }
    if (!trailId) {
        throw new Error('An active trail is required before logging miles.');
    }

    const { error } = await supabase.from('activity_logs').insert({
        user_id: userId,
        miles,
        trail_id: trailId,
        activity_type: activityType ?? 'walking',
        input_amount: inputAmount ?? null,
        input_unit: inputUnit ?? null,
    });

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
export async function getTrailMilesForUser(userId: string, trailId: string): Promise<number> {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('miles')
        .eq('user_id', userId)
        .eq('trail_id', trailId);

    if (error) throw error;

    return (data || []).reduce((sum, row) => sum + Number(row.miles || 0), 0);
}

// ---------------------------------------------------------------------------
// Teacher-facing: day-by-day breakdown for one student, instead of just
// their lifetime mileage total. Relies on activity_logs_select_teacher_of_class
// (a teacher can read this row if the student is in one of their classes) —
// see supabase/add-teacher-activity-detail-access.sql.
// ---------------------------------------------------------------------------
export type ActivityLogEntry = {
    id: string;
    miles: number;
    trailId: string;
    activityType: string;
    inputAmount: number | null;
    inputUnit: string | null;
    createdAt: string;
};

export async function fetchStudentActivityLogs(studentId: string): Promise<ActivityLogEntry[]> {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('id, miles, trail_id, activity_type, input_amount, input_unit, created_at')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false });

    if (error) throw error;

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
export type FitnessResultEntry = {
    studentId: string;
    exerciseLogged: string;
    exerciseScore: number | null;
    isTargetMet: boolean | null;
    loggedAt: string;
};

export async function fetchClassFitnessSummary(classId: string): Promise<FitnessResultEntry[]> {
    const { data, error } = await supabase.rpc('get_class_fitness_summary', { target_class_id: classId });

    if (error) throw error;

    return (data || []).map((row: any) => ({
        studentId: row.student_id,
        exerciseLogged: row.exercise_logged,
        exerciseScore: row.exercise_score != null ? Number(row.exercise_score) : null,
        isTargetMet: row.is_target_met,
        loggedAt: row.logged_at,
    }));
}
