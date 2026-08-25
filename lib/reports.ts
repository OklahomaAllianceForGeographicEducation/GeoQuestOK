// lib/reports.ts
// Statewide mileage reporting for OKAGE staff. Calls a security-definer RPC
// that returns school-level aggregates only — no student names or ids.
//
// FILE OVERVIEW (for someone new to this codebase):
// This module powers the OKAGE-facing statewide report screen. It calls a
// single Postgres RPC (a stored function exposed through Supabase, called
// via `supabase.rpc(...)`) that has already done all the heavy
// aggregation work in the database -- summing miles and counting students
// per school -- so this file only has to reshape the result into a
// friendlier TypeScript shape and (optionally) group it by district for
// display.
//
// "Security-definer" (mentioned above) means the RPC runs with the
// permissions of whoever DEFINED the function in Postgres, not the
// permissions of whoever is CALLING it -- that's what lets it read across
// every school/district's data to build a statewide report, while still
// only ever returning aggregate numbers (counts and totals), never a
// student's name or id, so callers with only OKAGE-level access can't use
// this as a backdoor to individual student data.
//
// Exports:
//   - `SchoolMileageRow` -- one school's aggregate stats.
//   - `fetchStatewideSchoolReport()` -- calls the RPC and returns the full
//     flat list of schools.
//   - `DistrictGroup` -- schools rolled up under their district, with
//     district-level totals.
//   - `groupByDistrict(rows)` -- pure client-side grouping/aggregation of
//     the flat list above.

import { supabase } from '../utils/supabase';

// One school's aggregate mileage/participation stats, already converted to
// camelCase and safe numeric types for the UI.
// Fields:
//   - districtId: the school's district's id (empty string if unknown --
//     see fetchStatewideSchoolReport's normalization below).
//   - districtName: human-readable district name, defaulted if missing.
//   - schoolName: human-readable school name, defaulted if missing.
//   - studentCount: how many students at this school have any recorded activity.
//   - totalMiles: summed miles walked by students at this school.
export type SchoolMileageRow = {
    districtId: string;
    districtName: string;
    schoolName: string;
    studentCount: number;
    totalMiles: number;
};

// The raw shape of one row as returned by the `okage_statewide_school_report`
// RPC -- snake_case, and numeric fields typed loosely (`number | string`)
// because Postgres can return aggregate numeric types (e.g. `bigint`,
// `numeric`) as strings over the wire depending on driver/type mapping, so
// the normalization step below always coerces them with `Number(...)`.
type ReportRpcRow = {
    district_id: string | null;
    school_district_name: string | null;
    school_name: string | null;
    student_count: number | string;
    total_miles: number | string;
};

// Fetches the full statewide, per-school mileage/participation report.
// Parameters: none.
// Returns: a Promise resolving to an array of SchoolMileageRow, one per
// school that has data, in whatever order the RPC returns them (no
// explicit ordering is applied client-side here -- see groupByDistrict
// below for the one built-in sort, which is by total district miles).
// Side effects: calls the `okage_statewide_school_report` Postgres RPC via
// `supabase.rpc(...)` (a security-definer function -- see file header).
// Throws the raw Supabase error if the call fails.
export async function fetchStatewideSchoolReport(): Promise<SchoolMileageRow[]> {
    const { data, error } = await supabase.rpc('okage_statewide_school_report');
    if (error) throw error;

    // Normalize each raw RPC row: fall back to sensible placeholder text
    // for any missing district/school name (so the UI never renders a
    // blank cell), and coerce the numeric fields to actual `number`s in
    // case Postgres sent them over the wire as strings.
    return ((data ?? []) as ReportRpcRow[]).map((row) => ({
        districtId: row.district_id ?? '',
        districtName: row.school_district_name || 'Unassigned District',
        schoolName: row.school_name || 'Unassigned School',
        studentCount: Number(row.student_count ?? 0),
        totalMiles: Number(row.total_miles ?? 0),
    }));
}

// A district-level rollup: every school in the district (from the flat
// list) plus the district's own summed totals across all of them.
// Fields:
//   - districtId / districtName: identify the district.
//   - schools: every SchoolMileageRow belonging to this district, in the
//     order they were encountered while grouping.
//   - totalMiles: sum of `totalMiles` across every school in this district.
//   - studentCount: sum of `studentCount` across every school in this district.
export type DistrictGroup = {
    districtId: string;
    districtName: string;
    schools: SchoolMileageRow[];
    totalMiles: number;
    studentCount: number;
};

// Groups a flat list of per-school rows (as returned by
// fetchStatewideSchoolReport) into one entry per district, with
// district-wide totals computed alongside the school list. Pure
// client-side aggregation -- no network/database access.
// Parameters:
//   - rows: the flat SchoolMileageRow[] to group.
// Returns: a DistrictGroup[], sorted by totalMiles descending (so the
// highest-mileage district appears first in the report).
// Side effects: none.
export function groupByDistrict(rows: SchoolMileageRow[]): DistrictGroup[] {
    // A Map (keyed by district id, falling back to district name if the id
    // is empty/unknown) is used instead of an object so groups are built up
    // in a single pass with O(1) lookups, and so key order reflects first-
    // encountered order rather than any implicit object-key ordering quirks.
    const groups = new Map<string, DistrictGroup>();
    for (const row of rows) {
        // Prefer grouping by districtId; only fall back to districtName if
        // districtId came back empty (see the `?? ''` fallback above) --
        // this keeps two different districts that both ended up with an
        // empty id from being incorrectly merged together, as long as
        // their names differ.
        const key = row.districtId || row.districtName;
        if (!groups.has(key)) {
            groups.set(key, { districtId: row.districtId, districtName: row.districtName, schools: [], totalMiles: 0, studentCount: 0 });
        }
        const group = groups.get(key)!;
        group.schools.push(row);
        group.totalMiles += row.totalMiles;
        group.studentCount += row.studentCount;
    }
    // Highest total-miles district first, for the report's default display order.
    return [...groups.values()].sort((a, b) => b.totalMiles - a.totalMiles);
}
