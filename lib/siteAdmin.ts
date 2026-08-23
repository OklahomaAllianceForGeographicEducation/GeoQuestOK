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

import { supabase } from '../utils/supabase';

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

export async function fetchSiteAdminSchoolReport(schoolName: string, districtId: string): Promise<SiteAdminStudentRow[]> {
    if (!schoolName || !districtId) return [];

    const { data, error } = await supabase.rpc('get_site_admin_school_report', {
        target_school_name: schoolName,
        target_district_id: districtId,
    });
    if (error) throw error;

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
export function groupByClass(rows: SiteAdminStudentRow[]): SiteAdminClassGroup[] {
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
    return [...groups.values()].sort((a, b) => b.memberCount - a.memberCount);
}

// One aggregate row per OTHER school in the district -- the exact same
// get_district_school_totals RPC a teacher's District Map tab already
// calls (supabase/tighten-district-aggregate-privacy.sql), already granted
// to any authenticated caller. Never returns a student id, name, or row.
export type DistrictSchoolTotal = {
    schoolName: string;
    totalMiles: number;
    memberCount: number;
};

export async function fetchDistrictSchoolTotals(districtId: string): Promise<DistrictSchoolTotal[]> {
    if (!districtId) return [];

    const { data, error } = await supabase.rpc('get_district_school_totals', {
        target_district_id: districtId,
    });
    if (error) throw error;

    return ((data ?? []) as any[]).map((row) => ({
        schoolName: row.school_name || 'Unassigned School',
        totalMiles: Number(row.total_miles || 0),
        memberCount: Number(row.member_count || 0),
    }));
}
