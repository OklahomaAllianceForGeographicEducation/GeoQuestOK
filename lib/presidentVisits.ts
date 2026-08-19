// lib/presidentVisits.ts
// "Presidents in Oklahoma" bonus content -- light did-you-know facts
// unlocked once a student earns the 'fitness-complete' badge (see
// supabase/president-visit-facts.sql). Not tied to standards or quizzes;
// this is a fun reward, not another lesson.

import { supabase } from '../utils/supabase';

export type PresidentVisitFact = {
    id: string;
    title: string;
    year: string | null;
    body: string;
    funDetail: string | null;
};

type PresidentVisitFactRow = {
    id: string;
    title: string;
    year: string | null;
    body: string;
    fun_detail: string | null;
    sort_order: number;
};

export async function fetchPresidentVisitFacts(): Promise<PresidentVisitFact[]> {
    const { data, error } = await supabase
        .from('president_visit_facts')
        .select('id, title, year, body, fun_detail, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

    if (error) throw error;

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
