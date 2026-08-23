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
    sourceDocument: string | null;
};

type StandardDbRow = {
    id: string;
    code: string;
    subject: string;
    grade_level: string;
    strand: string | null;
    description: string;
    source_document: string | null;
};

function normalize(row: StandardDbRow): StandardRow {
    return {
        id: row.id,
        code: row.code,
        subject: row.subject,
        gradeLevel: row.grade_level,
        strand: row.strand,
        description: row.description,
        sourceDocument: row.source_document,
    };
}

const COLUMNS = 'id, code, subject, grade_level, strand, description, source_document';

// Bridges the app's fixed lesson/quiz subject keys (lib/curriculum.ts
// LESSON_SUBJECTS) to the standards-library subject codes below, so the
// picker can default to the relevant subject.
export const LESSON_SUBJECT_TO_STANDARDS_SUBJECT: Record<string, string> = {
    math: 'MATH',
    science: 'SCI',
    social: 'SS',
    english: 'ELA',
    arts: 'ART',
};

// Oklahoma State Dept. of Education's Academic Standards subject codes --
// always offered as quick-fill buttons on (okage-tabs)/standards.tsx,
// merged with whatever subjects already exist in the library (so a
// district-specific or one-off subject someone already added still shows
// up too). Keeping this as one shared list/naming convention, rather than
// each screen inventing its own, is what keeps a new standard's `subject`
// value matching the existing rows instead of fragmenting into "MATH" vs
// "Mathematics" duplicates that don't group together.
export const STANDARD_SUBJECT_CODES = ['ELA', 'MATH', 'SCI', 'SS', 'ART', 'PE', 'HE', 'WL', 'CS'];

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

export type StandardInput = {
    code: string;
    subject: string;
    gradeLevel: string;
    strand: string | null;
    description: string;
    sourceDocument: string | null;
};

// Adds a new standard to the library. The table's unique constraint is
// (code, subject, gradeLevel) — a duplicate throws a Postgres unique-
// violation error, surfaced to the caller as-is.
export async function createStandard(input: StandardInput): Promise<void> {
    const { error } = await supabase.from('standards_library').insert({
        code: input.code,
        subject: input.subject,
        grade_level: input.gradeLevel,
        strand: input.strand,
        description: input.description,
        source_document: input.sourceDocument,
    });
    if (error) throw error;
}

export async function updateStandard(id: string, input: StandardInput): Promise<void> {
    const { error } = await supabase
        .from('standards_library')
        .update({
            code: input.code,
            subject: input.subject,
            grade_level: input.gradeLevel,
            strand: input.strand,
            description: input.description,
            source_document: input.sourceDocument,
        })
        .eq('id', id);
    if (error) throw error;
}

export async function deleteStandard(id: string): Promise<void> {
    const { error } = await supabase.from('standards_library').delete().eq('id', id);
    if (error) throw error;
}
