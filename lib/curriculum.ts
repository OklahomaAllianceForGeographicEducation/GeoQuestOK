// lib/curriculum.ts
// Cross-curricular lesson guide content for each trail. `curriculum_lesson_plans`
// in Supabase is the editable source of truth (written by OKAGE staff); the
// hand-authored FALLBACK_GUIDANCE below only fills in trails/subjects that
// don't have a database row yet, so existing copy never disappears mid-migration.

import { supabase } from '../utils/supabase';

export type GradeTier = 'elementary' | 'secondary';
export type LessonSubject = 'math' | 'science' | 'social' | 'english' | 'arts';

export const GRADE_TIERS: { value: GradeTier; label: string }[] = [
    { value: 'elementary', label: 'Elementary View (K-5)' },
    { value: 'secondary', label: 'Secondary View (6-12)' },
];

export const LESSON_SUBJECTS: { value: LessonSubject; label: string; icon: string }[] = [
    { value: 'math', label: 'Mathematics Connection', icon: 'calculator-outline' },
    { value: 'science', label: 'Science & Regional Systems', icon: 'flask-outline' },
    { value: 'social', label: 'Social Studies & History', icon: 'globe-outline' },
    { value: 'english', label: 'English Language Arts', icon: 'book-outline' },
    { value: 'arts', label: 'Visual & Performing Arts', icon: 'color-palette-outline' },
];

type SubjectGuidance = Record<LessonSubject, string>;

type TrailGuidance = {
    matchNames: string[]; // lowercase substrings matched against the real trail name
    elementary: SubjectGuidance;
    secondary: SubjectGuidance;
};

// Hand-authored lesson guides predating the real trail catalog; matched
// loosely by name since they don't share ids with it.
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

function findFallbackGuidance(trailName: string): TrailGuidance | null {
    const lower = trailName.toLowerCase();
    return FALLBACK_GUIDANCE.find((g) => g.matchNames.some((m) => lower.includes(m))) ?? null;
}

export type LessonPlan = {
    trailId: string;
    gradeTier: GradeTier;
    subject: LessonSubject;
    content: string;
    standardCode: string | null;
    isCustom: boolean; // true once OKAGE has saved a row for this slot
};

type LessonPlanRow = {
    trail_id: string;
    grade_tier: GradeTier;
    subject: LessonSubject;
    standard_code: string | null;
    content: string;
};

// Every DB-authored lesson plan row for a trail, keyed by "gradeTier:subject".
export async function fetchLessonPlansForTrail(trailId: string): Promise<Map<string, LessonPlanRow>> {
    const { data, error } = await supabase
        .from('curriculum_lesson_plans')
        .select('trail_id, grade_tier, subject, standard_code, content')
        .eq('trail_id', trailId);

    if (error) throw error;

    const map = new Map<string, LessonPlanRow>();
    for (const row of (data ?? []) as LessonPlanRow[]) {
        map.set(`${row.grade_tier}:${row.subject}`, row);
    }
    return map;
}

// Resolve the lesson plan grid for a trail: DB content wins, hand-authored
// copy fills any gap, and empty cells are simply blank (nothing authored yet).
export function resolveLessonPlans(
    trailId: string,
    trailName: string,
    dbRows: Map<string, LessonPlanRow>
): Record<GradeTier, Record<LessonSubject, LessonPlan>> {
    const fallback = findFallbackGuidance(trailName);

    const build = (gradeTier: GradeTier): Record<LessonSubject, LessonPlan> => {
        const result = {} as Record<LessonSubject, LessonPlan>;
        for (const { value: subject } of LESSON_SUBJECTS) {
            const dbRow = dbRows.get(`${gradeTier}:${subject}`);
            if (dbRow) {
                result[subject] = {
                    trailId,
                    gradeTier,
                    subject,
                    content: dbRow.content,
                    standardCode: dbRow.standard_code,
                    isCustom: true,
                };
            } else {
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

    return { elementary: build('elementary'), secondary: build('secondary') };
}

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
