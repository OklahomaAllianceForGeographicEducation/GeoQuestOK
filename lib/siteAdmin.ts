// lib/siteAdmin.ts
// Site Administrator (building-level principal) reporting: per-student
// totals for the principal's OWN school, and district-wide one-row-per-
// school aggregates for every OTHER school in the district -- the same
// aggregate a teacher already sees for schools that aren't their own.
//
// The own-school RPC (get_site_admin_school_report,
// supabase/site-admin-role.sql) exposes exactly two numbers per student --
// total miles walked and Presidential Fitness Test targets met -- and never
// an individual quiz score or a raw activity-log entry. Class is the finest
// granularity for every OTHER school; a Site Administrator never sees a
// student name, id, or row outside their own building.
//
// FILE OVERVIEW (for someone new to this codebase):
// This module is the data layer for the (site-admin-tabs) shell's two
// reporting screens: "My School" (per-student detail, own building only)
// and "District" (school-level aggregates for every other school). Both
// screens call a Postgres RPC (a stored function, invoked via
// `supabase.rpc(...)`) rather than querying tables directly -- the RPCs
// are what actually enforce which rows a Site Administrator is allowed to
// see, at the database layer, so this file's job is just to call the right
// RPC with the right arguments and reshape the result for the UI.
//
// Exports:
//   - `SiteAdminStudentRow` -- one student's per-class stats within the caller's own school.
//   - `fetchSiteAdminSchoolReport(schoolName, districtId)` -- the flat per-student list for "My School".
//   - `SiteAdminClassGroup` -- students grouped/rolled up by class.
//   - `groupByClass(rows)` -- pure client-side grouping of the flat list above.
//   - `DistrictSchoolTotal` -- one other school's aggregate stats.
//   - `fetchDistrictSchoolTotals(districtId)` -- the flat per-school list for "District".

import { supabase } from '../utils/supabase';

// One student's stats within one class at the caller's own school, as
// returned (already per-student) by get_site_admin_school_report.
// Fields:
//   - classId / className: which class this student belongs to.
//   - teacherName: that class's teacher, for display.
//   - studentId / studentName: identifies the student (safe to show here
//     since this data never leaves the admin's own building).
//   - totalMiles: this student's total logged mileage.
//   - fitnessEntries: how many Presidential Fitness Test entries this student has logged.
//   - fitnessTargetsMet: how many of those entries met the age/gender target.
export type SiteAdminStudentRow = {
    classId: string;
    className: string;
    teacherName: string;
    studentId: string;
    studentName: string;
    totalMiles: number;
    fitnessEntries: number;
    fitnessTargetsMet: number;
};

// Fetches the per-student report for the Site Administrator's own school --
// the only place in this file (or this admin role generally) individual
// student rows are returned, since this RPC is scoped to the caller's own
// building.
// Parameters:
//   - schoolName: the admin's own school name, used by the RPC to scope results.
//   - districtId: the admin's own district id, used alongside schoolName to scope results.
// Returns: a Promise resolving to a flat SiteAdminStudentRow[], one row per
// student per class. Returns `[]` immediately (no RPC call at all) if
// either `schoolName` or `districtId` is falsy/empty, since the RPC has
// nothing meaningful to scope to without both.
// Side effects: calls the `get_site_admin_school_report` Postgres RPC
// (a security-definer function that itself enforces the own-school-only
// scoping -- see file header). Throws the raw Supabase error on failure.
export async function fetchSiteAdminSchoolReport(schoolName: string, districtId: string): Promise<SiteAdminStudentRow[]> {
    if (!schoolName || !districtId) return [];

    const { data, error } = await supabase.rpc('get_site_admin_school_report', {
        target_school_name: schoolName,
        target_district_id: districtId,
    });
    if (error) throw error;

    // Reshape each raw RPC row (snake_case, loosely-typed numerics) into
    // the camelCase SiteAdminStudentRow shape, coercing ids to strings and
    // numeric fields via Number(...), and filling in placeholder text for
    // any missing class/teacher/student name so the UI never renders a
    // blank cell.
    return ((data ?? []) as any[]).map((row) => ({
        classId: String(row.class_id),
        className: row.class_name || 'Untitled Class',
        teacherName: row.teacher_name || 'Unassigned Teacher',
        studentId: String(row.student_id),
        studentName: row.student_name || 'Anonymous',
        totalMiles: Number(row.total_miles || 0),
        fitnessEntries: Number(row.fitness_entries || 0),
        fitnessTargetsMet: Number(row.fitness_targets_met || 0),
    }));
}

// One class's rollup: every student in the class (from the flat per-student
// list) plus the class's own summed/counted totals across all of them.
// Fields:
//   - classId / className / teacherName: identify the class.
//   - students: every SiteAdminStudentRow belonging to this class, in the
//     order they were encountered while grouping.
//   - memberCount: number of students grouped into this class.
//   - totalMiles / fitnessEntries / fitnessTargetsMet: summed across every
//     student in this class.
export type SiteAdminClassGroup = {
    classId: string;
    className: string;
    teacherName: string;
    students: SiteAdminStudentRow[];
    memberCount: number;
    totalMiles: number;
    fitnessEntries: number;
    fitnessTargetsMet: number;
};

// Groups the flat per-student rows into one entry per class, each carrying
// its own student list plus the same aggregate stats admin-tabs' Schools
// tab already shows at the class level -- so a Site Administrator sees
// that familiar rollup first, with the per-student breakdown one tap deeper.
// Parameters:
//   - rows: the flat SiteAdminStudentRow[] to group (as returned by
//     fetchSiteAdminSchoolReport).
// Returns: a SiteAdminClassGroup[], sorted by memberCount descending (the
// class with the most students shown first).
// Side effects: none -- pure client-side aggregation, no network/database access.
export function groupByClass(rows: SiteAdminStudentRow[]): SiteAdminClassGroup[] {
    // A Map keyed by classId is used so each class's group can be built up
    // in a single pass over `rows`, with O(1) lookup/creation per row.
    const groups = new Map<string, SiteAdminClassGroup>();
    for (const row of rows) {
        if (!groups.has(row.classId)) {
            groups.set(row.classId, {
                classId: row.classId,
                className: row.className,
                teacherName: row.teacherName,
                students: [],
                memberCount: 0,
                totalMiles: 0,
                fitnessEntries: 0,
                fitnessTargetsMet: 0,
            });
        }
        const group = groups.get(row.classId)!;
        group.students.push(row);
        group.memberCount += 1;
        group.totalMiles += row.totalMiles;
        group.fitnessEntries += row.fitnessEntries;
        group.fitnessTargetsMet += row.fitnessTargetsMet;
    }
    // Biggest class first, matching the "most students" ordering convention
    // used elsewhere in the admin-facing rollup screens.
    return [...groups.values()].sort((a, b) => b.memberCount - a.memberCount);
}

// One aggregate row per OTHER school in the district -- the exact same
// get_district_school_totals RPC a teacher's District Map tab already
// calls (supabase/tighten-district-aggregate-privacy.sql), already granted
// to any authenticated caller. Never returns a student id, name, or row.
// Fields:
//   - schoolName: the other school's display name.
//   - totalMiles: summed mileage across every student at that school.
//   - memberCount: number of students with recorded activity at that school.
export type DistrictSchoolTotal = {
    schoolName: string;
    totalMiles: number;
    memberCount: number;
};

// Fetches one-row-per-school aggregate totals for every school in the
// given district (used by the "District" tab to show how the admin's own
// school compares to the rest of the district, at the same coarse,
// no-student-detail granularity a teacher sees for schools other than
// their own).
// Parameters:
//   - districtId: which district's schools to aggregate.
// Returns: a Promise resolving to a DistrictSchoolTotal[], one row per
// school with any recorded activity in the district. Returns `[]`
// immediately (no RPC call) if `districtId` is falsy/empty.
// Side effects: calls the `get_district_school_totals` Postgres RPC.
// Throws the raw Supabase error on failure.
export async function fetchDistrictSchoolTotals(districtId: string): Promise<DistrictSchoolTotal[]> {
    if (!districtId) return [];

    const { data, error } = await supabase.rpc('get_district_school_totals', {
        target_district_id: districtId,
    });
    if (error) throw error;

    // Reshape into camelCase, defaulting a missing school name and
    // coercing numeric fields the same way fetchSiteAdminSchoolReport does above.
    return ((data ?? []) as any[]).map((row) => ({
        schoolName: row.school_name || 'Unassigned School',
        totalMiles: Number(row.total_miles || 0),
        memberCount: Number(row.member_count || 0),
    }));
}
