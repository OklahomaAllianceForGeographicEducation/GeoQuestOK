// lib/curriculum.ts
// Cross-curricular lesson guide content for each trail. `curriculum_lesson_plans`
// in Supabase is the editable source of truth (written by OKAGE staff); the
// hand-authored FALLBACK_GUIDANCE below only fills in trails/subjects that
// don't have a database row yet, so existing copy never disappears mid-migration.
//
// FILE OVERVIEW:
// This module handles the "short lesson guide" cross-curricular content
// shown per trail (see lib/fullLessons.ts for the separate, much longer
// printable-depth lesson plans). Every trail can have up to 10 short guide
// "cells": one per (grade tier x subject) combination -- 2 grade tiers
// (elementary/secondary) x 5 subjects (math/science/social/english/arts).
// Exports:
//   - GradeTier / LessonSubject: the closed sets of grade tiers and subjects.
//   - GRADE_TIERS / LESSON_SUBJECTS: ordered lists (with display labels/
//     icons) used to render tier/subject pickers in the UI.
//   - LessonPlan (type): the resolved, UI-ready shape of one guide cell,
//     after merging DB content with hand-authored fallback text.
//   - fetchLessonPlansForTrail(trailId): reads every DB-authored row for a
//     trail from `curriculum_lesson_plans`.
//   - resolveLessonPlans(trailId, trailName, dbRows): pure merge logic --
//     builds the full 2x5 grid, DB content winning over fallback text,
//     fallback winning over a blank cell.
//   - upsertLessonPlan(params): OKAGE staff's "save" action -- creates or
//     replaces one guide cell in the database.

import { supabase } from '../utils/supabase';

// Which age band a lesson guide cell targets. Determines which half of a
// TrailGuidance's content (elementary vs. secondary) fallback text is
// pulled from, and which `grade_tier` value is stored on/read from the
// `curriculum_lesson_plans` table.
export type GradeTier = 'elementary' | 'secondary';
// Which school subject a lesson guide cell connects the trail experience
// to. Corresponds to the `subject` column on `curriculum_lesson_plans`.
export type LessonSubject = 'math' | 'science' | 'social' | 'english' | 'arts';

// Ordered list of grade tiers with their display labels, used to render the
// tier-picker/tab control in the curriculum UI (e.g. (okage-tabs)/content.tsx,
// (teacher-tabs)/curriculum.tsx). Order here is the order shown on screen.
export const GRADE_TIERS: { value: GradeTier; label: string }[] = [
    { value: 'elementary', label: 'Elementary View (K-5)' },
    { value: 'secondary', label: 'Secondary View (6-12)' },
];

// Ordered list of the five cross-curricular subjects, each with a display
// label and an Ionicons icon name (used directly by <Ionicons name=.../>),
// used to render the row of subject cards for a trail's lesson guide.
export const LESSON_SUBJECTS: { value: LessonSubject; label: string; icon: string }[] = [
    { value: 'math', label: 'Mathematics Connection', icon: 'calculator-outline' },
    { value: 'science', label: 'Science & Regional Systems', icon: 'flask-outline' },
    { value: 'social', label: 'Social Studies & History', icon: 'globe-outline' },
    { value: 'english', label: 'English Language Arts', icon: 'book-outline' },
    { value: 'arts', label: 'Visual & Performing Arts', icon: 'color-palette-outline' },
];

// One grade tier's worth of hand-authored fallback text, one string per
// subject -- i.e. the five "cells" for either the elementary or secondary
// half of a single TrailGuidance entry below.
type SubjectGuidance = Record<LessonSubject, string>;

// One hand-authored fallback guidance entry, covering both grade tiers'
// worth of subject text for trails matching a given name pattern.
type TrailGuidance = {
    matchNames: string[]; // lowercase substrings matched against the real trail name
    elementary: SubjectGuidance;
    secondary: SubjectGuidance;
};

// Hand-authored lesson guides predating the real trail catalog; matched
// loosely by name since they don't share ids with it. This array is only
// consulted by findFallbackGuidance below when a trail/subject/tier
// combination has no matching row in the `curriculum_lesson_plans` table --
// it's the "we haven't migrated this content into the database yet" safety
// net, not something meant to be edited going forward (OKAGE staff edit
// live content through the Content tab UI, which writes to the database
// instead).
const FALLBACK_GUIDANCE: TrailGuidance[] = [
    {
        matchNames: ['pioneer', 'panhandle'],
        elementary: {
            math: "Count daily walking steps and convert them mathematically into virtual map miles.",
            science: "Examine evolving weather patterns across the panhandle and study regional animal habitats.",
            social: "Study Oklahoma history, early pioneer settlements, and communities.",
            english: "Build vocabulary definitions with geographical terms; write travel logs for virtual journeys.",
            arts: "Draw historical path maps and design travel postcards representing the 12 walking trails."
        },
        secondary: {
            math: "Execute detailed statistical metrics tracking classroom data variance and performance averages.",
            science: "Study structural geological rock formations and Oklahoma ecosystem biodiversity.",
            social: "Analyze industrial economic development histories and local state government actions.",
            english: "Analyze native primary source documents; research canonical Oklahoma authors like Ralph Ellison.",
            arts: "Paint regional landscapes mimicking notable Oklahoma visual artists; explore photography projects."
        }
    },
    {
        matchNames: ['cherokee'],
        elementary: {
            math: "Graph class progress charts over time and compare the total distance metrics separating locations.",
            science: "Discover simple machines used historically across transportation systems.",
            social: "Study sovereign Native American tribal nations and historical preservation sites.",
            english: "Engage in storytelling workshops about historical figures such as Sequoyah and Will Rogers.",
            arts: "Learn traditional Native American movement sequences and study Maria Tallchief's historical legacy."
        },
        secondary: {
            math: "Utilize geometric properties to extract coordinates and analyze physical map scale indicators.",
            science: "Investigate principles of motion, kinetic energy transfer, and conservation systems.",
            social: "Deconstruct immigration patterns, human demographic groups, and historical civil rights efforts.",
            english: "Present research essays about state poets (e.g., Joy Harjo) and craft persuasive arguments.",
            arts: "Construct characters monologues or theatrical documentation studying Wiley Post and Will Rogers."
        }
    },
    {
        matchNames: ['sooner'],
        elementary: {
            math: "Calculate time variables required to clear a trail path selecting multiple speeds.",
            science: "Deconstruct human bodily systems and cardiovascular reactions under intense aerobic physical exercise.",
            social: "Study community public helpers, local municipal services, and the transition toward statehood.",
            english: "Read specialized literature produced by Oklahoma creators like Tammi Sauer and Bill Wallace.",
            arts: "Learn and perform regional folk arrangements alongside the official Oklahoma state song."
        },
        secondary: {
            math: "Develop algebraic formulas modeling fitness curves and caloric conversion math profiles.",
            science: "Analyze advanced aerospace science history, rocketry propulsion physics, and native astronaut careers.",
            social: "Explore legal frameworks under state political boundaries and constitutional governance models.",
            english: "Deconstruct prose techniques across classical works authored by S.E. Hinton and Rilla Askew.",
            arts: "Stage historical theatrical performance materials extracted from the classic 'Oklahoma!' musical score."
        }
    }
];

// Finds the hand-authored TrailGuidance entry (if any) whose `matchNames`
// list contains a substring of the given trail's real name -- a loose,
// case-insensitive match rather than an exact id lookup, since this
// fallback content predates (and doesn't share ids with) the real trail
// catalog. Not exported; only resolveLessonPlans below calls this.
//
// @param trailName - The trail's actual display name (e.g. "Cherokee Trail").
// @returns The first matching TrailGuidance whose matchNames includes a
//   substring of the lowercased trailName, or `null` if none match (a
//   trail with no fallback content authored for it at all).
//
// No side effects -- pure array search over the local FALLBACK_GUIDANCE.
function findFallbackGuidance(trailName: string): TrailGuidance | null {
    const lower = trailName.toLowerCase();
    return FALLBACK_GUIDANCE.find((g) => g.matchNames.some((m) => lower.includes(m))) ?? null;
}

// The fully-resolved, UI-ready shape of one lesson-guide "cell" (one grade
// tier x subject combination) for one trail, after merging database content
// with hand-authored fallback text. This is what components actually render
// -- see resolveLessonPlans below for how it's built.
export type LessonPlan = {
    trailId: string; // which trail this cell belongs to
    gradeTier: GradeTier; // which age band this cell is for
    subject: LessonSubject; // which subject this cell connects to
    content: string; // the guide text to display; '' if nothing authored at all
    standardCode: string | null; // an optional academic standard code OKAGE attached to this cell, or null
    isCustom: boolean; // true once OKAGE has saved a real row for this slot in curriculum_lesson_plans; false means `content` (if any) came from the hand-authored FALLBACK_GUIDANCE instead
};

// The raw shape of one row of the `curriculum_lesson_plans` Postgres table,
// as returned directly by Supabase (snake_case column names, no
// camelCase conversion applied yet -- that happens in resolveLessonPlans).
type LessonPlanRow = {
    trail_id: string;
    grade_tier: GradeTier;
    subject: LessonSubject;
    standard_code: string | null;
    content: string;
};

/**
 * Fetches every database-authored lesson-guide row for a single trail.
 *
 * @param trailId - Which trail's rows to fetch (curriculum_lesson_plans.trail_id).
 * @returns A Map keyed by `"${gradeTier}:${subject}"` (e.g. "elementary:math")
 *   -> the raw LessonPlanRow for that cell. Only cells OKAGE has actually
 *   saved appear in the map; a trail with no saved content yet returns an
 *   empty Map (not an error).
 * @throws The raw Supabase error if the SELECT fails.
 *
 * Side effect: read-only Supabase query (`select` on
 * `curriculum_lesson_plans`, filtered to this one trail_id), no writes.
 */
export async function fetchLessonPlansForTrail(trailId: string): Promise<Map<string, LessonPlanRow>> {
    const { data, error } = await supabase
        .from('curriculum_lesson_plans')
        .select('trail_id, grade_tier, subject, standard_code, content')
        .eq('trail_id', trailId);

    if (error) throw error;

    // Index the flat row array by "gradeTier:subject" so resolveLessonPlans
    // below can look up any one cell in O(1) instead of scanning the array
    // repeatedly for each of the 10 grid cells.
    const map = new Map<string, LessonPlanRow>();
    for (const row of (data ?? []) as LessonPlanRow[]) {
        map.set(`${row.grade_tier}:${row.subject}`, row);
    }
    return map;
}

/**
 * Resolves the full 2 (grade tier) x 5 (subject) lesson-guide grid for a
 * single trail, merging live database content with hand-authored fallback
 * text: for each cell, DB content wins if present; otherwise hand-authored
 * FALLBACK_GUIDANCE text fills the gap (matched by trail name, not id); if
 * neither exists, the cell is simply blank (`content: ''`) rather than
 * omitted, so the UI can still render an empty card inviting OKAGE to
 * write something.
 *
 * @param trailId - Which trail this grid is for (stored on each resulting
 *   LessonPlan so the UI/save action knows which trail a cell belongs to).
 * @param trailName - The trail's display name, used only to match against
 *   FALLBACK_GUIDANCE.matchNames (see findFallbackGuidance) -- has no other
 *   effect on the result.
 * @param dbRows - The Map returned by fetchLessonPlansForTrail for this
 *   same trailId.
 * @returns An object with `elementary` and `secondary` keys, each mapping
 *   every LessonSubject to its resolved LessonPlan for that tier.
 *
 * No side effects -- pure function, no network calls (all data it needs is
 * passed in already-fetched via `dbRows`).
 */
export function resolveLessonPlans(
    trailId: string,
    trailName: string,
    dbRows: Map<string, LessonPlanRow>
): Record<GradeTier, Record<LessonSubject, LessonPlan>> {
    // Look up the fallback text ONCE for the whole trail (not per-cell) --
    // it's the same TrailGuidance object regardless of which grade tier or
    // subject we're currently resolving.
    const fallback = findFallbackGuidance(trailName);

    // Builds the 5-subject row for one grade tier. Defined as a closure so
    // it can be called twice below (once per tier) without repeating the
    // per-subject loop logic.
    const build = (gradeTier: GradeTier): Record<LessonSubject, LessonPlan> => {
        const result = {} as Record<LessonSubject, LessonPlan>;
        // Walk every known subject (not every dbRow) so every cell in the
        // grid always gets a LessonPlan -- including subjects with no DB
        // row AND no fallback text, which end up with content: ''.
        for (const { value: subject } of LESSON_SUBJECTS) {
            const dbRow = dbRows.get(`${gradeTier}:${subject}`);
            if (dbRow) {
                // Database content exists for this cell -- it always wins
                // over fallback text, and isCustom is set so the UI can
                // e.g. show an "edited" indicator.
                result[subject] = {
                    trailId,
                    gradeTier,
                    subject,
                    content: dbRow.content,
                    standardCode: dbRow.standard_code,
                    isCustom: true,
                };
            } else {
                // No database row for this cell -- fall back to
                // hand-authored text if this trail matched a
                // FALLBACK_GUIDANCE entry, otherwise leave it blank ('').
                // standardCode is always null here since fallback content
                // predates the standards-tagging feature. isCustom: false
                // tells the UI this is placeholder/legacy text, not
                // something OKAGE has actually saved.
                result[subject] = {
                    trailId,
                    gradeTier,
                    subject,
                    content: fallback?.[gradeTier]?.[subject] ?? '',
                    standardCode: null,
                    isCustom: false,
                };
            }
        }
        return result;
    };

    // Build both tiers and return them together as the full grid.
    return { elementary: build('elementary'), secondary: build('secondary') };
}

/**
 * Creates or replaces one lesson-guide cell (one trail x grade-tier x
 * subject combination) -- this is OKAGE staff's "Save" action when editing
 * curriculum content in the app.
 *
 * @param params.trailId - Which trail this cell belongs to.
 * @param params.gradeTier - Which age band this cell is for.
 * @param params.subject - Which subject this cell is for.
 * @param params.content - The guide text to save.
 * @param params.standardCode - An optional academic standard code to
 *   attach; falsy values (empty string, null) are normalized to `null`
 *   before writing, rather than being stored as an empty string.
 * @param params.updatedBy - The auth user id of the staff member saving
 *   this edit, recorded for auditing.
 * @returns Nothing on success (resolved Promise<void>).
 * @throws The raw Supabase error if the write fails.
 *
 * Side effect: performs an UPSERT (insert-or-update) into
 * `curriculum_lesson_plans`. The `onConflict: 'trail_id,grade_tier,subject'`
 * option tells Postgres which unique constraint identifies "the same row"
 * -- if a row with this exact (trail_id, grade_tier, subject) triple
 * already exists, its columns are overwritten in place; otherwise a new
 * row is inserted. `updated_at` is always stamped with the current time
 * client-side.
 */
export async function upsertLessonPlan(params: {
    trailId: string;
    gradeTier: GradeTier;
    subject: LessonSubject;
    content: string;
    standardCode: string | null;
    updatedBy: string;
}) {
    const { error } = await supabase
        .from('curriculum_lesson_plans')
        .upsert(
            {
                trail_id: params.trailId,
                grade_tier: params.gradeTier,
                subject: params.subject,
                content: params.content,
                standard_code: params.standardCode || null,
                updated_by: params.updatedBy,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'trail_id,grade_tier,subject' }
        );

    if (error) throw error;
}
