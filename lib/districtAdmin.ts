// lib/districtAdmin.ts
// District Admin reporting: class-level rollups for a principal/
// superintendent's own district, aggregated up into school- and
// district-level summaries client-side. The RPC itself
// (get_district_admin_class_report, supabase/district-admin-report.sql)
// never returns an individual student row -- class is the finest
// granularity that ever reaches this client, matching the product
// requirement that district-admin reporting stays at the class/school/
// district level, never the student level.
//
// FILE OVERVIEW:
// This module is the data-access + aggregation layer behind the District
// Administrator reporting screen (app/(admin-tabs)/reports.tsx and
// overview.tsx). It has one network call and two pure aggregation
// functions layered on top of its result:
//   - ClassReportRow (type) + fetchDistrictAdminClassReport(districtId):
//     the one Supabase call in this file -- fetches every class in a
//     district via an RPC, already pre-aggregated at the class level by
//     the database (never per-student).
//   - SchoolReportGroup (type) + groupBySchool(rows): client-side grouping
//     of those class rows into one summary per school.
//   - DistrictTotals (type) + computeDistrictTotals(rows): a single
//     district-wide summary (rolled up across every school/class).
// groupBySchool and computeDistrictTotals both take the SAME
// ClassReportRow[] as input (there's no separate DB call for either) --
// they're just two different ways of summing up the one dataset fetched
// once by fetchDistrictAdminClassReport.

import { supabase } from '../utils/supabase';

export type ClassReportRow = {
    schoolName: string;
    classId: string;
    className: string;
    teacherName: string;
    memberCount: number;
    totalMiles: number;
    // Presidential Fitness Test signal, sourced from activity_journal (the
    // same table app/(tabs)/fitness.tsx writes to): fitnessEntries is how
    // many exercise attempts were logged across the class,
    // fitnessTargetsMet is how many of those cleared the age/gender
    // benchmark, and fitnessParticipants is how many DISTINCT students
    // logged at least one attempt (the completion/participation signal).
    fitnessEntries: number;
    fitnessTargetsMet: number;
    fitnessParticipants: number;
    // A separate, walking-specific activity count (day-to-day trail
    // logging), distinct from fitness-test attempts.
    walkLogEntries: number;
    lastActivityAt: string | null;
};

/**
 * Fetches every class in a district, already aggregated to the class
 * level, for District Administrator reporting.
 *
 * @param districtId - Which district to report on. If falsy (empty
 *   string, undefined-coerced-to-empty, etc.), short-circuits to an empty
 *   array WITHOUT making any network call -- e.g. while the district id is
 *   still loading on the calling screen.
 * @returns An array of ClassReportRow, one per class in the district.
 *   Empty array if the district has no classes yet.
 * @throws The raw Supabase error if the RPC call fails.
 *
 * Side effect: calls the `get_district_admin_class_report` Postgres
 * function (read-only) with `target_district_id` as its argument. Using an
 * RPC (a database-side aggregation function) instead of a raw `.select()`
 * is deliberate here too: it lets the database do the class-level rollup
 * and enforce that no individual student row is ever returned to this
 * client, rather than trusting client-side code to never accidentally
 * request student-level detail.
 */
export async function fetchDistrictAdminClassReport(districtId: string): Promise<ClassReportRow[]> {
    if (!districtId) return [];

    const { data, error } = await supabase.rpc('get_district_admin_class_report', {
        target_district_id: districtId,
    });
    if (error) throw error;

    // Convert each raw (snake_case) RPC row into the camelCase
    // ClassReportRow shape, with defensive fallbacks for every field:
    // missing names get a placeholder label instead of showing blank/
    // undefined in the UI, and every numeric field is coerced with
    // Number(x || 0) so a null/undefined column can't turn a sum into NaN
    // downstream in groupBySchool/computeDistrictTotals.
    return ((data ?? []) as any[]).map((row) => ({
        schoolName: row.school_name || 'Unassigned School',
        classId: String(row.class_id),
        className: row.class_name || 'Untitled Class',
        teacherName: row.teacher_name || 'Unassigned Teacher',
        memberCount: Number(row.member_count || 0),
        totalMiles: Number(row.total_miles || 0),
        fitnessEntries: Number(row.fitness_entries || 0),
        fitnessTargetsMet: Number(row.fitness_targets_met || 0),
        fitnessParticipants: Number(row.fitness_participants || 0),
        walkLogEntries: Number(row.walk_log_entries || 0),
        lastActivityAt: row.last_activity_at || null,
    }));
}

// One school's worth of rolled-up reporting data: every ClassReportRow
// belonging to that school, plus the sums of their numeric fields, so the
// UI can render a per-school summary card without re-summing on every
// render.
export type SchoolReportGroup = {
    schoolName: string;
    classes: ClassReportRow[]; // every class in this school, unaggregated
    memberCount: number; // sum of memberCount across `classes`
    totalMiles: number; // sum of totalMiles across `classes`
    fitnessEntries: number; // sum of fitnessEntries across `classes`
    fitnessTargetsMet: number; // sum of fitnessTargetsMet across `classes`
    fitnessParticipants: number; // sum of fitnessParticipants across `classes`
    walkLogEntries: number; // sum of walkLogEntries across `classes`
    // A school pulled in from schools_registry with no matching classes
    // yet -- same "recruit" signal reports.tsx's District Map tab shows a
    // teacher, surfaced here for the district admin instead.
    isEmptyInvitation?: boolean;
};

/**
 * Groups a flat list of per-class report rows into one summary per school,
 * summing each school's numeric fields across its classes.
 *
 * @param rows - The ClassReportRow[] returned by
 *   fetchDistrictAdminClassReport (or any equivalent array -- this
 *   function is pure and doesn't care where the rows came from).
 * @returns An array of SchoolReportGroup, one per distinct `schoolName`
 *   found in `rows`, sorted DESCENDING by `memberCount` (schools with more
 *   enrolled students appear first). A school with zero classes never
 *   appears here at all (there's nothing in `rows` to group under it) --
 *   see isEmptyInvitation above for how "recruit" schools with no classes
 *   are handled separately, elsewhere in the calling screen.
 *
 * No side effects -- pure aggregation over the passed-in array, no network
 * calls.
 */
export function groupBySchool(rows: ClassReportRow[]): SchoolReportGroup[] {
    // Map keyed by schoolName, built up incrementally as `rows` is walked
    // once. Using a Map (not a plain object) sidesteps any issues with
    // school names that happen to collide with Object.prototype property
    // names (e.g. a school literally named "constructor").
    const groups = new Map<string, SchoolReportGroup>();
    for (const row of rows) {
        const key = row.schoolName;
        if (!groups.has(key)) {
            groups.set(key, {
                schoolName: key,
                classes: [],
                memberCount: 0,
                totalMiles: 0,
                fitnessEntries: 0,
                fitnessTargetsMet: 0,
                fitnessParticipants: 0,
                walkLogEntries: 0,
            });
        }
        const group = groups.get(key)!;
        group.classes.push(row);
        group.memberCount += row.memberCount;
        group.totalMiles += row.totalMiles;
        group.fitnessEntries += row.fitnessEntries;
        group.fitnessTargetsMet += row.fitnessTargetsMet;
        group.fitnessParticipants += row.fitnessParticipants;
        group.walkLogEntries += row.walkLogEntries;
    }
    // Sort schools largest-enrollment-first so the report reads
    // biggest-impact-first rather than in arbitrary insertion order.
    return [...groups.values()].sort((a, b) => b.memberCount - a.memberCount);
}

// A single, district-wide rollup: every ClassReportRow's numeric fields
// summed together, plus two derived percentage rates. This is the
// top-of-screen "district at a glance" summary.
export type DistrictTotals = {
    schoolCount: number; // number of DISTINCT schools represented in the input rows
    classCount: number; // total number of classes (i.e. rows.length)
    studentCount: number; // sum of memberCount across all classes
    totalMiles: number; // sum of totalMiles across all classes
    fitnessEntries: number; // sum of fitnessEntries across all classes
    fitnessTargetsMet: number; // sum of fitnessTargetsMet across all classes
    fitnessParticipants: number; // sum of fitnessParticipants across all classes
    walkLogEntries: number; // sum of walkLogEntries across all classes
    // % of enrolled students (across every class) who logged at least one
    // fitness-test attempt -- the closest available "completion" signal;
    // there's no separate SIS roster to compare against, so participation
    // is measured against students who actually joined a class in-app.
    fitnessParticipationRate: number;
    // % of logged attempts that cleared the benchmark target.
    fitnessPassRate: number;
};

/**
 * Computes district-wide totals (and two derived rates) from the same flat
 * class-report rows groupBySchool consumes -- this is the OTHER way of
 * summarizing fetchDistrictAdminClassReport's result, rolling all the way
 * up to a single number per metric instead of stopping at the school level.
 *
 * @param rows - The ClassReportRow[] to summarize (typically the full
 *   result of fetchDistrictAdminClassReport for one district).
 * @returns A DistrictTotals object. `fitnessParticipationRate` is `0`
 *   (rather than NaN from a division by zero) when `studentCount` is 0;
 *   `fitnessPassRate` is likewise `0` when `fitnessEntries` is 0.
 *
 * No side effects -- pure aggregation, no network calls.
 */
export function computeDistrictTotals(rows: ClassReportRow[]): DistrictTotals {
    // Count distinct school names via a Set -- schoolCount is "how many
    // different schools appear in these rows", not the number of rows.
    const schoolCount = new Set(rows.map((r) => r.schoolName)).size;
    // Single reduce() pass sums every numeric field across all rows at
    // once, accumulating into `acc` starting from the all-zero object
    // passed as reduce's second argument below.
    const totals = rows.reduce(
        (acc, row) => {
            acc.studentCount += row.memberCount;
            acc.totalMiles += row.totalMiles;
            acc.fitnessEntries += row.fitnessEntries;
            acc.fitnessTargetsMet += row.fitnessTargetsMet;
            acc.fitnessParticipants += row.fitnessParticipants;
            acc.walkLogEntries += row.walkLogEntries;
            return acc;
        },
        { studentCount: 0, totalMiles: 0, fitnessEntries: 0, fitnessTargetsMet: 0, fitnessParticipants: 0, walkLogEntries: 0 }
    );

    // Spread the summed `totals` fields in, then add the two derived rates,
    // each guarded against a divide-by-zero producing NaN.
    return {
        schoolCount,
        classCount: rows.length,
        ...totals,
        fitnessParticipationRate: totals.studentCount > 0 ? totals.fitnessParticipants / totals.studentCount : 0,
        fitnessPassRate: totals.fitnessEntries > 0 ? totals.fitnessTargetsMet / totals.fitnessEntries : 0,
    };
}
