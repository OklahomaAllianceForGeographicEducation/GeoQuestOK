// lib/reports.ts
// Statewide mileage reporting for OKAGE staff. Calls a security-definer RPC
// that returns school-level aggregates only — no student names or ids.

import { supabase } from '../utils/supabase';

export type SchoolMileageRow = {
    districtId: string;
    districtName: string;
    schoolName: string;
    studentCount: number;
    totalMiles: number;
};

type ReportRpcRow = {
    district_id: string | null;
    school_district_name: string | null;
    school_name: string | null;
    student_count: number | string;
    total_miles: number | string;
};

export async function fetchStatewideSchoolReport(): Promise<SchoolMileageRow[]> {
    const { data, error } = await supabase.rpc('okage_statewide_school_report');
    if (error) throw error;

    return ((data ?? []) as ReportRpcRow[]).map((row) => ({
        districtId: row.district_id ?? '',
        districtName: row.school_district_name || 'Unassigned District',
        schoolName: row.school_name || 'Unassigned School',
        studentCount: Number(row.student_count ?? 0),
        totalMiles: Number(row.total_miles ?? 0),
    }));
}

export type DistrictGroup = {
    districtId: string;
    districtName: string;
    schools: SchoolMileageRow[];
    totalMiles: number;
    studentCount: number;
};

export function groupByDistrict(rows: SchoolMileageRow[]): DistrictGroup[] {
    const groups = new Map<string, DistrictGroup>();
    for (const row of rows) {
        const key = row.districtId || row.districtName;
        if (!groups.has(key)) {
            groups.set(key, { districtId: row.districtId, districtName: row.districtName, schools: [], totalMiles: 0, studentCount: 0 });
        }
        const group = groups.get(key)!;
        group.schools.push(row);
        group.totalMiles += row.totalMiles;
        group.studentCount += row.studentCount;
    }
    return [...groups.values()].sort((a, b) => b.totalMiles - a.totalMiles);
}
