// lib/presidentVisits.ts
// "Presidents in Oklahoma" bonus content -- light did-you-know facts
// unlocked once a student earns the 'fitness-complete' badge (see
// supabase/president-visit-facts.sql). Not tied to standards or quizzes;
// this is a fun reward, not another lesson.
//
// FILE OVERVIEW (for someone new to this codebase):
// This is a small, single-purpose data module. It reads a handful of rows
// out of one Supabase table (`president_visit_facts`) and reshapes them
// into the camelCase `PresidentVisitFact` type the UI works with. There is
// no writing/editing here -- this content is presumably seeded/managed
// directly in the database (see the referenced .sql file), not through the
// app.
//
// Exports:
//   - `PresidentVisitFact` -- the UI-friendly shape of one fact.
//   - `fetchPresidentVisitFacts()` -- loads every active fact, in display
//     order.
//   - `PRESIDENTS_UNLOCK_BADGE_ID` -- the badge id that gates this feature,
//     shared so the unlock check and this content stay in sync.

import { supabase } from '../utils/supabase';

// The UI-facing shape of one "Presidents in Oklahoma" fact card.
// Fields:
//   - id: stable row identifier (used as a React list key, etc.).
//   - title: the fact's heading, e.g. a president's name.
//   - year: the year (or year range) associated with the fact, as free text
//     since some entries may not have a single clean numeric year -- null
//     if the database has no year recorded for this row.
//   - body: the main fact text shown to the student.
//   - funDetail: an optional extra "fun fact" shown alongside the main body;
//     null when this row has no bonus detail.
export type PresidentVisitFact = {
    id: string;
    title: string;
    year: string | null;
    body: string;
    funDetail: string | null;
};

// The raw shape of a row as it comes back from Postgres/Supabase --
// snake_case column names, plus `sort_order` (used only for ordering the
// query, not exposed on the UI-facing type above).
type PresidentVisitFactRow = {
    id: string;
    title: string;
    year: string | null;
    body: string;
    fun_detail: string | null;
    sort_order: number;
};

// Loads every currently-active "Presidents in Oklahoma" fact, in the
// curator-assigned display order.
// Parameters: none.
// Returns: a Promise resolving to an array of PresidentVisitFact, sorted by
// `sort_order` ascending (i.e. in the order they should be shown/paged
// through). Returns `[]` if the table has no active rows.
// Side effects: performs one Supabase SELECT against `president_visit_facts`,
// filtered to `is_active = true`. Throws the raw Supabase error object if
// the query fails -- callers are expected to catch/handle it (e.g. show an
// error state) rather than this function swallowing it.
export async function fetchPresidentVisitFacts(): Promise<PresidentVisitFact[]> {
    const { data, error } = await supabase
        .from('president_visit_facts')
        // Only the columns actually used below are selected, including
        // sort_order purely so the `.order()` clause below can sort by it.
        .select('id, title, year, body, fun_detail, sort_order')
        // Hides any fact a curator has deactivated (soft-delete pattern --
        // the row still exists in the database, it's just excluded here).
        .eq('is_active', true)
        // Curated display order, ascending (lowest sort_order shown first).
        .order('sort_order', { ascending: true });

    if (error) throw error;

    // Reshape each raw snake_case row into the camelCase PresidentVisitFact
    // shape the UI expects. `sort_order` is intentionally dropped here --
    // it already did its job in the `.order()` call above and callers don't
    // need it once the array is already in the right order.
    return (data ?? []).map((row: PresidentVisitFactRow) => ({
        id: row.id,
        title: row.title,
        year: row.year,
        body: row.body,
        funDetail: row.fun_detail,
    }));
}

// The badge id this feature unlocks on. Kept as a named constant (rather
// than a magic string scattered across components) since it's the one
// piece of coupling to the existing fitness-badge system.
export const PRESIDENTS_UNLOCK_BADGE_ID = 'fitness-complete';
