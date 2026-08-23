// lib/fullLessons.ts
// Full, printable-depth lesson plans -- the in-app counterpart to the
// standalone .docx lesson plans, rendered natively instead of opened as a
// Word file. See supabase/curriculum-full-lessons-schema.sql.

import { supabase } from '../utils/supabase';
import type { GradeTier, LessonSubject } from './curriculum';

export type LessonStandard = {
    code: string;
    subjectLabel: string;
    gradeLevel: string;
    description: string;
};

export type FullLessonPlan = {
    trailId: string;
    gradeTier: GradeTier;
    subject: LessonSubject;
    title: string;
    subtitle: string | null;
    timeFrame: string | null;
    appConnection: string;
    purpose: string;
    standards: LessonStandard[];
    standardsNote: string | null;
    objectives: string[];
    materials: string[];
    procedures: string[];
    extension: string[];
    assessment: string | null;
};

type FullLessonRow = {
    trail_id: string;
    grade_tier: GradeTier;
    subject: LessonSubject;
    title: string;
    subtitle: string | null;
    time_frame: string | null;
    app_connection: string;
    purpose: string;
    standards: LessonStandard[];
    standards_note: string | null;
    objectives: string[];
    materials: string[];
    procedures: string[];
    extension: string[];
    assessment: string | null;
};

function normalize(row: FullLessonRow): FullLessonPlan {
    return {
        trailId: row.trail_id,
        gradeTier: row.grade_tier,
        subject: row.subject,
        title: row.title,
        subtitle: row.subtitle,
        timeFrame: row.time_frame,
        appConnection: row.app_connection,
        purpose: row.purpose,
        standards: row.standards ?? [],
        standardsNote: row.standards_note,
        objectives: row.objectives ?? [],
        materials: row.materials ?? [],
        procedures: row.procedures ?? [],
        extension: row.extension ?? [],
        assessment: row.assessment,
    };
}

// Every full lesson plan for a trail, keyed by "gradeTier:subject" — mirrors
// the shape of fetchLessonPlansForTrail in lib/curriculum.ts so a screen can
// cheaply check "does a full lesson exist for this card?" without a
// separate round trip per subject card.
export async function fetchFullLessonsForTrail(trailId: string): Promise<Map<string, FullLessonPlan>> {
    const { data, error } = await supabase
        .from('curriculum_full_lessons')
        .select('trail_id, grade_tier, subject, title, subtitle, time_frame, app_connection, purpose, standards, standards_note, objectives, materials, procedures, extension, assessment')
        .eq('trail_id', trailId);

    if (error) throw error;

    const map = new Map<string, FullLessonPlan>();
    for (const row of (data ?? []) as FullLessonRow[]) {
        map.set(`${row.grade_tier}:${row.subject}`, normalize(row));
    }
    return map;
}

// Creates or replaces the full lesson plan for one trail x grade tier x
// subject slot — written by OKAGE staff from the Content tab. Mirrors
// upsertLessonPlan's onConflict target in lib/curriculum.ts: the same
// (trail_id, grade_tier, subject) triple is unique on this table too.
export async function upsertFullLessonPlan(params: {
    trailId: string;
    gradeTier: GradeTier;
    subject: LessonSubject;
    title: string;
    subtitle: string | null;
    timeFrame: string | null;
    appConnection: string;
    purpose: string;
    standards: LessonStandard[];
    standardsNote: string | null;
    objectives: string[];
    materials: string[];
    procedures: string[];
    extension: string[];
    assessment: string | null;
}) {
    const { error } = await supabase
        .from('curriculum_full_lessons')
        .upsert(
            {
                trail_id: params.trailId,
                grade_tier: params.gradeTier,
                subject: params.subject,
                title: params.title,
                subtitle: params.subtitle,
                time_frame: params.timeFrame,
                app_connection: params.appConnection,
                purpose: params.purpose,
                standards: params.standards,
                standards_note: params.standardsNote,
                objectives: params.objectives,
                materials: params.materials,
                procedures: params.procedures,
                extension: params.extension,
                assessment: params.assessment,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'trail_id,grade_tier,subject' }
        );

    if (error) throw error;
}

// Removes a full lesson plan entirely (e.g. it was written by mistake, or
// the trail no longer needs one for this tier/subject) — the subject card
// falls back to just showing its short lesson-guide blurb.
export async function deleteFullLessonPlan(trailId: string, gradeTier: GradeTier, subject: LessonSubject) {
    const { error } = await supabase
        .from('curriculum_full_lessons')
        .delete()
        .eq('trail_id', trailId)
        .eq('grade_tier', gradeTier)
        .eq('subject', subject);

    if (error) throw error;
}
