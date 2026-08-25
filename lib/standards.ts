// lib/standards.ts
// Search/browse helpers for the Oklahoma Academic Standards library.
//
// FILE OVERVIEW (for someone new to this codebase):
// "Standards" here means the Oklahoma State Dept. of Education's Academic
// Standards -- the official curriculum benchmarks (e.g. "MATH.3.OA.1")
// that teachers align lessons/quiz questions to. This module is the data
// layer for a single Supabase table, `standards_library`, used by the
// OKAGE-facing standards browser/editor screen
// (app/(okage-tabs)/standards.tsx) and by the standard-picker component
// (components/StandardPickerModal.tsx) used elsewhere when tagging a quiz
// question with a standard.
//
// Exports:
//   - `StandardRow` -- the UI-friendly (camelCase) shape of one standard.
//   - `LESSON_SUBJECT_TO_STANDARDS_SUBJECT` -- maps this app's own lesson
//     subject keys to the standards library's subject codes.
//   - `STANDARD_SUBJECT_CODES` -- the fixed list of official subject codes
//     offered as quick-pick buttons.
//   - `fetchStandardSubjects()` -- distinct subjects currently in the library.
//   - `fetchGradeLevelsForSubject(subject)` -- distinct grade levels for a subject.
//   - `StandardSearchParams` / `searchStandards(params)` -- keyword + filter search.
//   - `StandardInput` / `createStandard(input)` / `updateStandard(id, input)`
//     / `deleteStandard(id)` -- CRUD for OKAGE staff maintaining the library.

import { supabase } from '../utils/supabase';

// The UI-facing (camelCase) shape of one standard, as consumed by the
// standards browser/editor and the standard picker.
// Fields:
//   - id: stable row identifier.
//   - code: the official standard code, e.g. "MATH.3.OA.1".
//   - subject: subject code this standard belongs to (see STANDARD_SUBJECT_CODES).
//   - gradeLevel: the grade (or grade band) this standard targets, as free text.
//   - strand: optional sub-category/strand name within the subject (e.g. "Algebraic Reasoning"); null if not set.
//   - description: the full text of the standard.
//   - sourceDocument: optional citation/reference to the official source document; null if not set.
export type StandardRow = {
    id: string;
    code: string;
    subject: string;
    gradeLevel: string;
    strand: string | null;
    description: string;
    sourceDocument: string | null;
};

// The raw snake_case shape of a row as stored in Postgres/returned by Supabase.
type StandardDbRow = {
    id: string;
    code: string;
    subject: string;
    grade_level: string;
    strand: string | null;
    description: string;
    source_document: string | null;
};

// Converts one raw database row into the UI-facing StandardRow shape
// (snake_case -> camelCase, no other transformation). Pure function, no
// side effects.
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

// The column list requested on every SELECT against `standards_library`
// below -- kept as one shared constant so every query stays in sync with
// what `normalize()` above expects to find on each row.
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

// Returns every distinct `subject` value currently present in the
// standards library, for building filter chips.
// Parameters: none.
// Returns: a Promise resolving to a sorted (alphabetical) array of unique
// subject code strings.
// Side effects: one Supabase SELECT of just the `subject` column across
// the WHOLE `standards_library` table (no filter) -- fine at this table's
// expected size, but note this fetches every row's subject value, then
// dedupes client-side via a Set, rather than asking Postgres for DISTINCT.
// Throws the raw Supabase error on failure.
export async function fetchStandardSubjects(): Promise<string[]> {
    const { data, error } = await supabase.from('standards_library').select('subject');
    if (error) throw error;
    // Set dedupes repeated subject values, then spread back into an array
    // and sort alphabetically for a stable, predictable chip order.
    return [...new Set((data ?? []).map((r: { subject: string }) => r.subject))].sort();
}

// Returns every distinct `grade_level` value present for a given subject,
// for filter chips scoped to whatever subject is currently selected.
// Parameters:
//   - subject: the subject code to filter grade levels by.
// Returns: a Promise resolving to an array of unique grade level strings,
// in whatever order Postgres happened to return the matching rows (not
// explicitly sorted, unlike fetchStandardSubjects above).
// Side effects: one Supabase SELECT of the `grade_level` column, filtered
// to rows where `subject` equals the given value. Throws the raw Supabase
// error on failure.
export async function fetchGradeLevelsForSubject(subject: string): Promise<string[]> {
    const { data, error } = await supabase.from('standards_library').select('grade_level').eq('subject', subject);
    if (error) throw error;
    return [...new Set((data ?? []).map((r: { grade_level: string }) => r.grade_level))];
}

// The optional filter/search inputs accepted by searchStandards below.
// All fields are optional -- an empty params object matches everything
// (up to the default limit).
export type StandardSearchParams = {
    keyword?: string; // Free-text search matched against code, description, and strand (case-insensitive, substring match).
    subject?: string; // Restrict results to this exact subject code.
    gradeLevel?: string; // Restrict results to this exact grade level.
    limit?: number; // Maximum rows to return; defaults to 100 if not given.
};

// Searches the standards library by keyword and/or subject/grade-level
// filters, for the OKAGE browse/search screen and the standard picker.
// Parameters: a StandardSearchParams object (see type above).
// Returns: a Promise resolving to a StandardRow[] matching every supplied
// filter, sorted by subject then code (both ascending), capped at
// `params.limit` (default 100) rows.
// Side effects: one Supabase SELECT against `standards_library` with
// whichever `.eq()`/`.or()` filters apply. Throws the raw Supabase error on
// failure.
export async function searchStandards(params: StandardSearchParams): Promise<StandardRow[]> {
    let query = supabase.from('standards_library').select(COLUMNS);

    // Each filter is only applied if the caller actually supplied a value --
    // an unset `subject`/`gradeLevel` means "don't filter on this field" rather
    // than "match empty string".
    if (params.subject) query = query.eq('subject', params.subject);
    if (params.gradeLevel) query = query.eq('grade_level', params.gradeLevel);

    const keyword = params.keyword?.trim();
    if (keyword) {
        // Postgres's `ilike` wildcard characters ('%' and '_') would
        // otherwise be interpreted as pattern operators if a user typed
        // them literally into the search box (e.g. searching for "50%") --
        // escaping them here (`\$&` re-inserts the matched character
        // prefixed with a backslash) makes the search treat them as plain
        // literal text instead.
        const escaped = keyword.replace(/[%_]/g, '\\$&');
        // `.or(...)` builds a Postgres OR filter across three columns: a
        // row matches if the keyword appears (case-insensitively, as a
        // substring -- the surrounding `%...%` wildcards) in ANY of code,
        // description, or strand.
        query = query.or(`code.ilike.%${escaped}%,description.ilike.%${escaped}%,strand.ilike.%${escaped}%`);
    }

    // Stable, predictable ordering (grouped by subject, then alphabetical
    // by code within each subject), capped at the requested/default limit
    // so an overly broad search can't pull back the entire table at once.
    query = query.order('subject', { ascending: true }).order('code', { ascending: true }).limit(params.limit ?? 100);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row) => normalize(row as StandardDbRow));
}

// The fields needed to create or fully replace a standard, as edited via
// the OKAGE standards editor form. Same shape as StandardRow minus `id`
// (which is assigned by the database on insert, or already known on update).
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
// Parameters:
//   - input: the full set of fields for the new standard (see StandardInput).
// Returns: a Promise that resolves once the insert completes (no data is
// returned to the caller -- if the new row's id is needed, re-fetch it).
// Side effects: one Supabase INSERT into `standards_library`. Throws the
// raw Supabase error (including a unique-constraint violation on a
// duplicate code/subject/gradeLevel combination) on failure.
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

// Overwrites every editable field of an existing standard.
// Parameters:
//   - id: the row id of the standard to update.
//   - input: the full replacement set of fields (see StandardInput) -- this
//     is a full overwrite, not a partial patch, so every field must be
//     supplied even if only one actually changed.
// Returns: a Promise that resolves once the update completes.
// Side effects: one Supabase UPDATE against `standards_library`, filtered
// to the given `id`. Throws the raw Supabase error on failure (e.g. a
// unique-constraint violation if the edit collides with another row's
// code/subject/gradeLevel).
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

// Permanently removes a standard from the library.
// Parameters:
//   - id: the row id of the standard to delete.
// Returns: a Promise that resolves once the delete completes.
// Side effects: one Supabase DELETE (hard delete -- no soft-delete/active
// flag involved here, unlike e.g. lib/quizzes.ts's is_active pattern)
// against `standards_library`, filtered to the given `id`. Throws the raw
// Supabase error on failure. Note this does not check/clean up any other
// table that might reference this standard's code (e.g. a quiz question's
// `standard_code`) -- those are stored as a loose text reference, not a
// foreign key, so deleting a standard here does not cascade or fail due to
// existing references elsewhere.
export async function deleteStandard(id: string): Promise<void> {
    const { error } = await supabase.from('standards_library').delete().eq('id', id);
    if (error) throw error;
}
