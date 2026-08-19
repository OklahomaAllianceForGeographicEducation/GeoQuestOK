// lib/standards.ts
// Search/browse helpers for the Oklahoma Academic Standards library.

import { supabase } from '../utils/supabase';

export type StandardRow = {
    id: string;
    code: string;
    subject: string;
    gradeLevel: string;
    strand: string | null;
    description: string;
};

type StandardDbRow = {
    id: string;
    code: string;
    subject: string;
    grade_level: string;
    strand: string | null;
    description: string;
};

function normalize(row: StandardDbRow): StandardRow {
    return {
        id: row.id,
        code: row.code,
        subject: row.subject,
        gradeLevel: row.grade_level,
        strand: row.strand,
        description: row.description,
    };
}

const COLUMNS = 'id, code, subject, grade_level, strand, description';

// Bridges the app's fixed lesson/quiz subject keys (lib/curriculum.ts
// LESSON_SUBJECTS) to the full subject names used in the standards library,
// so the picker can default to the relevant subject.
export const LESSON_SUBJECT_TO_STANDARDS_SUBJECT: Record<string, string> = {
    math: 'Mathematics',
    science: 'Science',
    social: 'Social Studies',
    english: 'English Language Arts',
    arts: 'Fine Arts',
};

// Every distinct subject present in the library, for filter chips.
export async function fetchStandardSubjects(): Promise<string[]> {
    const { data, error } = await supabase.from('standards_library').select('subject');
    if (error) throw error;
    return [...new Set((data ?? []).map((r: { subject: string }) => r.subject))].sort();
}

// Every distinct grade level present for a given subject, for filter chips
// scoped to whatever subject is currently selected.
export async function fetchGradeLevelsForSubject(subject: string): Promise<string[]> {
    const { data, error } = await supabase.from('standards_library').select('grade_level').eq('subject', subject);
    if (error) throw error;
    return [...new Set((data ?? []).map((r: { grade_level: string }) => r.grade_level))];
}

export type StandardSearchParams = {
    keyword?: string;
    subject?: string;
    gradeLevel?: string;
    limit?: number;
};

// Search by code/keyword and optionally filter by subject/grade level.
export async function searchStandards(params: StandardSearchParams): Promise<StandardRow[]> {
    let query = supabase.from('standards_library').select(COLUMNS);

    if (params.subject) query = query.eq('subject', params.subject);
    if (params.gradeLevel) query = query.eq('grade_level', params.gradeLevel);

    const keyword = params.keyword?.trim();
    if (keyword) {
        const escaped = keyword.replace(/[%_]/g, '\\$&');
        query = query.or(`code.ilike.%${escaped}%,description.ilike.%${escaped}%,strand.ilike.%${escaped}%`);
    }

    query = query.order('subject', { ascending: true }).order('code', { ascending: true }).limit(params.limit ?? 100);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row) => normalize(row as StandardDbRow));
}
