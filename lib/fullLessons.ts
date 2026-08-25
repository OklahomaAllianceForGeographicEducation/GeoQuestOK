// lib/fullLessons.ts
// Full, printable-depth lesson plans -- the in-app counterpart to the
// standalone .docx lesson plans, rendered natively instead of opened as a
// Word file. See supabase/curriculum-full-lessons-schema.sql.
//
// FILE OVERVIEW:
// This module is the data-access layer for the `curriculum_full_lessons`
// Supabase table -- the FULL (multi-section: objectives, materials,
// step-by-step procedures, extension activities, assessment) lesson plans,
// as opposed to the short one-paragraph guide "cells" handled by
// lib/curriculum.ts. Like lib/curriculum.ts, plans are keyed by a
// (trail_id, grade_tier, subject) triple -- at most one full lesson exists
// per trail x grade-tier x subject combination.
// Exports:
//   - LessonStandard (type): one academic-standard citation attached to a
//     lesson plan.
//   - FullLessonPlan (type): the complete, camelCase, UI-ready shape of one
//     full lesson.
//   - fetchFullLessonsForTrail(trailId): reads every full lesson for a
//     trail, keyed the same way lib/curriculum.ts keys its own map.
//   - upsertFullLessonPlan(params): OKAGE staff's create-or-replace save
//     action for one full lesson.
//   - deleteFullLessonPlan(trailId, gradeTier, subject): removes one full
//     lesson entirely, reverting that slot back to just the short guide
//     blurb.

import { supabase } from '../utils/supabase';
import type { GradeTier, LessonSubject } from './curriculum';

// One academic-standard citation attached to a full lesson plan (e.g. an
// Oklahoma Academic Standards code), shown alongside the plan so a teacher
// can justify how the trail activity ties into required curriculum.
export type LessonStandard = {
    code: string; // the standard's official code/id (e.g. "OAS.3.M.GM.1")
    subjectLabel: string; // human-readable subject name for display (e.g. "Mathematics")
    gradeLevel: string; // the grade(s) this standard applies to (e.g. "3rd Grade")
    description: string; // the standard's actual text/requirement
};

// The complete, camelCase, UI-ready shape of one full lesson plan -- what
// screens actually render. See FullLessonRow below for the raw Postgres
// column shape this is converted from.
export type FullLessonPlan = {
    trailId: string; // which trail this lesson belongs to
    gradeTier: GradeTier; // which age band this lesson targets
    subject: LessonSubject; // which cross-curricular subject this lesson is for
    title: string; // the lesson's display title
    subtitle: string | null; // an optional secondary title/tagline
    timeFrame: string | null; // estimated duration/pacing (e.g. "45 minutes"), or null if not specified
    appConnection: string; // how this lesson ties back into the GeoQuestOK app experience (e.g. logging miles on this trail)
    purpose: string; // the lesson's overall goal/rationale, shown as an intro paragraph
    standards: LessonStandard[]; // academic standards this lesson satisfies (see LessonStandard above); empty array if none attached
    standardsNote: string | null; // optional free-text caveat/clarification about the standards list, or null
    objectives: string[]; // bullet list of specific learning objectives
    materials: string[]; // bullet list of materials/supplies needed
    procedures: string[]; // ordered, step-by-step instructions for running the lesson
    extension: string[]; // bullet list of optional extension/enrichment activities
    assessment: string | null; // how student understanding is checked/graded, or null if not specified
};

// The raw shape of one row of the `curriculum_full_lessons` Postgres
// table -- same fields as FullLessonPlan, but snake_case column names as
// Supabase returns them, before normalize() below converts to camelCase.
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

// Converts one raw FullLessonRow (snake_case, as Postgres/Supabase returns
// it) into the camelCase FullLessonPlan shape the UI consumes. Not
// exported; only fetchFullLessonsForTrail below calls this.
//
// @param row - One raw row as returned by a `curriculum_full_lessons` select.
// @returns The equivalent FullLessonPlan. Array-typed fields (standards,
//   objectives, materials, procedures, extension) each fall back to an
//   empty array via `?? []` in case the column comes back null/undefined
//   (e.g. a row inserted before one of these columns existed) -- this
//   keeps every FullLessonPlan's array fields safe to `.map()`/`.length`
//   over without a caller having to null-check them. Scalar optional
//   fields (subtitle, timeFrame, standardsNote, assessment) are passed
//   through as-is, preserving `null` rather than being coerced to
//   something else.
//
// No side effects -- pure data transformation, no network calls.
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

/**
 * Fetches every full lesson plan saved for a single trail, across all
 * grade tiers and subjects.
 *
 * @param trailId - Which trail's full lessons to fetch
 *   (curriculum_full_lessons.trail_id).
 * @returns A Map keyed by `"${gradeTier}:${subject}"` (e.g.
 *   "secondary:science") -> the normalized FullLessonPlan for that slot --
 *   mirrors the shape of fetchLessonPlansForTrail's return value in
 *   lib/curriculum.ts, so a screen can cheaply check "does a full lesson
 *   exist for this subject card?" (`map.has(key)`) without a separate round
 *   trip per subject card. Only slots with an actual saved row appear;
 *   a trail with none yet returns an empty Map.
 * @throws The raw Supabase error if the SELECT fails.
 *
 * Side effect: read-only Supabase query (`select` on
 * `curriculum_full_lessons`, filtered to this one trail_id), no writes.
 */
export async function fetchFullLessonsForTrail(trailId: string): Promise<Map<string, FullLessonPlan>> {
    const { data, error } = await supabase
        .from('curriculum_full_lessons')
        .select('trail_id, grade_tier, subject, title, subtitle, time_frame, app_connection, purpose, standards, standards_note, objectives, materials, procedures, extension, assessment')
        .eq('trail_id', trailId);

    if (error) throw error;

    // Index each normalized row by "gradeTier:subject" for O(1) lookup by
    // the calling screen (same indexing scheme as lib/curriculum.ts's
    // fetchLessonPlansForTrail).
    const map = new Map<string, FullLessonPlan>();
    for (const row of (data ?? []) as FullLessonRow[]) {
        map.set(`${row.grade_tier}:${row.subject}`, normalize(row));
    }
    return map;
}

/**
 * Creates or replaces the full lesson plan for one trail x grade-tier x
 * subject slot -- OKAGE staff's "Save" action for full lessons from the
 * Content tab.
 *
 * @param params.trailId - Which trail this lesson belongs to.
 * @param params.gradeTier - Which age band this lesson targets.
 * @param params.subject - Which subject this lesson is for.
 * @param params.title / subtitle / timeFrame / appConnection / purpose /
 *   standards / standardsNote / objectives / materials / procedures /
 *   extension / assessment - Every remaining field of a FullLessonPlan
 *   (see that type's field-by-field comments above) to save, exactly as
 *   provided -- no defaulting/coercion happens here (unlike normalize(),
 *   which is only used on the READ path).
 * @returns Nothing on success (resolved Promise<void>).
 * @throws The raw Supabase error if the write fails.
 *
 * Side effect: performs an UPSERT into `curriculum_full_lessons`, keyed on
 * the same `(trail_id, grade_tier, subject)` unique constraint as
 * lib/curriculum.ts's upsertLessonPlan -- an existing row for this triple
 * is overwritten in place; otherwise a new row is inserted. `updated_at` is
 * stamped with the current time client-side.
 */
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

/**
 * Removes a full lesson plan entirely (e.g. it was written by mistake, or
 * the trail no longer needs one for this tier/subject).
 *
 * @param trailId - Which trail's lesson to delete.
 * @param gradeTier - Which grade tier's lesson to delete.
 * @param subject - Which subject's lesson to delete.
 * @returns Nothing on success (resolved Promise<void>). Succeeds silently
 *   even if no row matched (Postgres DELETE with no matches is not an
 *   error) -- there's no way for the caller to distinguish "deleted a row"
 *   from "no row existed to delete."
 * @throws The raw Supabase error if the DELETE fails.
 *
 * Side effect: deletes at most one row from `curriculum_full_lessons` --
 * the one matching all three filters (trail_id AND grade_tier AND
 * subject). After this, the corresponding subject card in the UI falls
 * back to showing just its short lesson-guide blurb from
 * lib/curriculum.ts instead of a full lesson.
 */
export async function deleteFullLessonPlan(trailId: string, gradeTier: GradeTier, subject: LessonSubject) {
    const { error } = await supabase
        .from('curriculum_full_lessons')
        .delete()
        .eq('trail_id', trailId)
        .eq('grade_tier', gradeTier)
        .eq('subject', subject);

    if (error) throw error;
}
