// lib/districtAdmin.ts
// District Admin reporting: class-level rollups for a principal/
// superintendent's own district, aggregated up into school- and
// district-level summaries client-side. The RPC itself
// (get_district_admin_class_report, supabase/district-admin-report.sql)
// never returns an individual student row -- class is the finest
// granularity that ever reaches this client, matching the product
// requirement that district-admin reporting stays at the class/school/
// district level, never the student level.

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

export async function fetchDistrictAdminClassReport(districtId: string): Promise<ClassReportRow[]> {
    if (!districtId) return [];

    const { data, error } = await supabase.rpc('get_district_admin_class_report', {
        target_district_id: districtId,
    });
    if (error) throw error;

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

export type SchoolReportGroup = {
    schoolName: string;
    classes: ClassReportRow[];
    memberCount: number;
    totalMiles: number;
    fitnessEntries: number;
    fitnessTargetsMet: number;
    fitnessParticipants: number;
    walkLogEntries: number;
    // A school pulled in from schools_registry with no matching classes
    // yet -- same "recruit" signal reports.tsx's District Map tab shows a
    // teacher, surfaced here for the district admin instead.
    isEmptyInvitation?: boolean;
};

export function groupBySchool(rows: ClassReportRow[]): SchoolReportGroup[] {
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
    return [...groups.values()].sort((a, b) => b.memberCount - a.memberCount);
}

export type DistrictTotals = {
    schoolCount: number;
    classCount: number;
    studentCount: number;
    totalMiles: number;
    fitnessEntries: number;
    fitnessTargetsMet: number;
    fitnessParticipants: number;
    walkLogEntries: number;
    // % of enrolled students (across every class) who logged at least one
    // fitness-test attempt -- the closest available "completion" signal;
    // there's no separate SIS roster to compare against, so participation
    // is measured against students who actually joined a class in-app.
    fitnessParticipationRate: number;
    // % of logged attempts that cleared the benchmark target.
    fitnessPassRate: number;
};

export function computeDistrictTotals(rows: ClassReportRow[]): DistrictTotals {
    const schoolCount = new Set(rows.map((r) => r.schoolName)).size;
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

    return {
        schoolCount,
        classCount: rows.length,
        ...totals,
        fitnessParticipationRate: totals.studentCount > 0 ? totals.fitnessParticipants / totals.studentCount : 0,
        fitnessPassRate: totals.fitnessEntries > 0 ? totals.fitnessTargetsMet / totals.fitnessEntries : 0,
    };
}
