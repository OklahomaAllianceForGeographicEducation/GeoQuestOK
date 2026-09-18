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

// One school's true, deduped-across-classes totals -- `count(distinct
// user_id)` and each distinct student's `total_miles_walked` summed once,
// from get_district_admin_school_totals. See groupBySchool's
// `schoolTotals` param for why this replaces the naive per-class sum.
export type SchoolDedupedTotals = {
    memberCount: number;
    totalMiles: number;
};

/**
 * Groups a flat list of per-class report rows into one summary per school,
 * summing each school's numeric fields across its classes.
 *
 * @param rows - The ClassReportRow[] returned by
 *   fetchDistrictAdminClassReport (or any equivalent array -- this
 *   function is pure and doesn't care where the rows came from).
 * @param schoolTotals - Optional, from
 *   fetchDistrictAdminSchoolTotals(districtId). When given, each group's
 *   `memberCount` and `totalMiles` are replaced with these true (deduped-
 *   across-classes) values instead of the sum of its classes' already-per-
 *   class-deduped numbers, which double-counts any student enrolled in more
 *   than one class at that school (both their membership AND their whole
 *   lifetime `total_miles_walked`, added once per class they're in). A
 *   school missing from this map (shouldn't normally happen -- it's keyed
 *   the same way as `rows`) keeps its summed values as a fallback.
 * @returns An array of SchoolReportGroup, one per distinct `schoolName`
 *   found in `rows`, sorted DESCENDING by `memberCount` (schools with more
 *   enrolled students appear first). A school with zero classes never
 *   appears here at all (there's nothing in `rows` to group under it) --
 *   see isEmptyInvitation above for how "recruit" schools with no classes
 *   are handled separately, elsewhere in the calling screen.
 *
 * No side effects -- pure aggregation over the passed-in arguments, no
 * network calls.
 */
export function groupBySchool(rows: ClassReportRow[], schoolTotals?: Map<string, SchoolDedupedTotals>): SchoolReportGroup[] {
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
    // Replace each school's summed (potentially double-counted) memberCount
    // and totalMiles with their true deduped values, when available.
    if (schoolTotals) {
        for (const group of groups.values()) {
            const deduped = schoolTotals.get(group.schoolName);
            if (deduped) {
                group.memberCount = deduped.memberCount;
                group.totalMiles = deduped.totalMiles;
            }
        }
    }

    // Sort schools largest-enrollment-first so the report reads
    // biggest-impact-first rather than in arbitrary insertion order.
    return [...groups.values()].sort((a, b) => b.memberCount - a.memberCount);
}

/**
 * Fetches each school's true, deduped-across-classes totals (student count
 * AND total miles) -- both computed server-side over each student exactly
 * once, unlike summing each school's classes' `memberCount`/`totalMiles`
 * (which double-counts a student enrolled in more than one class at the
 * same school -- their membership AND their whole lifetime
 * `total_miles_walked`, once per class).
 *
 * @param districtId - Which district to report on. Empty string
 *   short-circuits to an empty Map with no network call.
 * @returns A Map from `school_name` (defaulting to 'Unassigned School',
 *   matching fetchDistrictAdminClassReport's convention) to that school's
 *   SchoolDedupedTotals.
 * @throws The raw Supabase error if the RPC call fails.
 *
 * Side effect: calls the `get_district_admin_school_totals` Postgres
 * function (read-only).
 */
export async function fetchDistrictAdminSchoolTotals(districtId: string): Promise<Map<string, SchoolDedupedTotals>> {
    if (!districtId) return new Map();

    const { data, error } = await supabase.rpc('get_district_admin_school_totals', {
        target_district_id: districtId,
    });
    if (error) throw error;

    return new Map(
        ((data ?? []) as any[]).map((row) => [
            row.school_name || 'Unassigned School',
            { memberCount: Number(row.member_count || 0), totalMiles: Number(row.total_miles || 0) },
        ])
    );
}

// The district's true, deduped-across-classes totals -- see
// SchoolDedupedTotals above, same idea at the whole-district grain.
export type DistrictDedupedTotals = {
    studentCount: number;
    totalMiles: number;
};

/**
 * Fetches the true, deduped-across-classes totals (student count AND total
 * miles) for an entire district -- both computed server-side over each
 * student exactly once, unlike summing every class's
 * `memberCount`/`totalMiles` (which double-counts a student enrolled in
 * more than one class anywhere in the district).
 *
 * @param districtId - Which district to report on. Empty string
 *   short-circuits to `{ studentCount: 0, totalMiles: 0 }` with no network
 *   call.
 * @returns The district's DistrictDedupedTotals.
 * @throws The raw Supabase error if the RPC call fails.
 *
 * Side effect: calls the `get_district_admin_totals` Postgres function
 * (read-only).
 */
export async function fetchDistrictAdminTotals(districtId: string): Promise<DistrictDedupedTotals> {
    if (!districtId) return { studentCount: 0, totalMiles: 0 };

    const { data, error } = await supabase.rpc('get_district_admin_totals', {
        target_district_id: districtId,
    });
    if (error) throw error;

    const row = ((data ?? []) as any[])[0];
    return { studentCount: Number(row?.member_count || 0), totalMiles: Number(row?.total_miles || 0) };
}

/**
 * Fetches every school NAME registered in a district's `schools_registry`
 * table, sorted alphabetically -- the full set of known schools, whether or
 * not any of them have actual class/reporting activity yet.
 *
 * @param districtId - Which district's registry to read. Empty string
 *   short-circuits to `[]` with no network call, same convention as
 *   fetchDistrictAdminClassReport.
 * @returns An array of school name strings.
 * @throws The raw Supabase error if the query fails.
 */
export async function fetchDistrictSchoolRegistry(districtId: string): Promise<string[]> {
    if (!districtId) return [];

    const { data, error } = await supabase
        .from('schools_registry')
        .select('school_name')
        .eq('district_id', districtId)
        .order('school_name', { ascending: true });
    if (error) throw error;

    return (data || []).map((r) => r.school_name).filter((name): name is string => !!name);
}

/**
 * Merges a district's registered school names into an already-grouped
 * `SchoolReportGroup[]` (from groupBySchool), so a school with zero
 * classes/students yet still appears -- as a zeroed-out row flagged
 * `isEmptyInvitation: true` -- instead of silently disappearing because
 * there's no class-report row to group it under.
 *
 * Extracted here (rather than left inline in one screen) after an
 * /impeccable critique caught `(admin-tabs)/reports.tsx`'s PDF export
 * omitting every zero-participation school that `(admin-tabs)/schools.tsx`
 * already showed -- two screens describing the same district's school
 * count differently because the merge only existed in one of them. Both
 * screens now call this one function.
 *
 * @param activeGroups - The result of `groupBySchool(rows)` -- schools that
 *   have at least one class already.
 * @param registrySchoolNames - Every school name in the district's
 *   registry (from fetchDistrictSchoolRegistry), regardless of activity.
 * @returns Every registered school, merged: a registry name that matches
 *   an active group (case/whitespace-insensitively) keeps its real data;
 *   one with no match becomes a zeroed `isEmptyInvitation: true` row. Any
 *   active group whose name never matched a registry entry (a class's
 *   school_name typo that doesn't exactly match the registry) is still
 *   included via the leftover-values step. Sorted by memberCount
 *   descending, ties broken alphabetically.
 *
 * No side effects -- pure merge over the two passed-in arrays.
 */
export function mergeWithSchoolRegistry(activeGroups: SchoolReportGroup[], registrySchoolNames: string[]): SchoolReportGroup[] {
    const groupsByNormalizedName = new Map(activeGroups.map((g) => [g.schoolName.trim().toLowerCase(), g]));

    const merged: SchoolReportGroup[] = registrySchoolNames.map((name) => {
        const normalized = name.trim().toLowerCase();
        const match = groupsByNormalizedName.get(normalized);
        if (match) {
            groupsByNormalizedName.delete(normalized);
            return match;
        }
        return {
            schoolName: name,
            classes: [],
            memberCount: 0,
            totalMiles: 0,
            fitnessEntries: 0,
            fitnessTargetsMet: 0,
            fitnessParticipants: 0,
            walkLogEntries: 0,
            isEmptyInvitation: true,
        };
    });
    merged.push(...groupsByNormalizedName.values());

    merged.sort((a, b) => b.memberCount - a.memberCount || a.schoolName.localeCompare(b.schoolName));
    return merged;
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
 * @param districtTotals - Optional, from
 *   fetchDistrictAdminTotals(districtId). When given, replaces the sum of
 *   every class's already-per-class-deduped `memberCount`/`totalMiles`
 *   (which double-counts a student enrolled in more than one class anywhere
 *   in the district -- their membership AND their whole lifetime
 *   `total_miles_walked`, once per class) with these true district-wide
 *   deduped values. `fitnessParticipationRate` is derived from whichever
 *   student count is used.
 * @returns A DistrictTotals object. `fitnessParticipationRate` is `0`
 *   (rather than NaN from a division by zero) when `studentCount` is 0;
 *   `fitnessPassRate` is likewise `0` when `fitnessEntries` is 0.
 *
 * No side effects -- pure aggregation, no network calls.
 */
export function computeDistrictTotals(rows: ClassReportRow[], districtTotals?: DistrictDedupedTotals): DistrictTotals {
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

    // Use the true, deduped district-wide values when the caller has them;
    // otherwise fall back to the (potentially double-counted) per-class sums.
    const studentCount = districtTotals?.studentCount ?? totals.studentCount;
    const totalMiles = districtTotals?.totalMiles ?? totals.totalMiles;

    // Spread the summed `totals` fields in, then overwrite `studentCount`/
    // `totalMiles` and add the two derived rates, each guarded against a
    // divide-by-zero producing NaN.
    return {
        schoolCount,
        classCount: rows.length,
        ...totals,
        studentCount,
        totalMiles,
        fitnessParticipationRate: studentCount > 0 ? totals.fitnessParticipants / studentCount : 0,
        fitnessPassRate: totals.fitnessEntries > 0 ? totals.fitnessTargetsMet / totals.fitnessEntries : 0,
    };
}
