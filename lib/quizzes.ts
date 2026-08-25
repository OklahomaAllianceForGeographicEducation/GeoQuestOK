// lib/quizzes.ts
// Data helpers for the landmark quiz system: teachers browse/assign questions,
// students fetch what's assigned to them and submit answers.
//
// FILE OVERVIEW (for someone new to this codebase):
// Every landmark on a trail can have one or more multiple-choice quiz
// questions written for it by OKAGE staff (the content team). A teacher
// then picks which of those questions to "assign" to one of their classes
// -- that assignment (a row in `quiz_assignments`) is what actually makes
// a question show up for a student to answer. A student's answer is
// recorded as a row in `quiz_responses`, which is graded immediately
// client-side (by comparing to the stored correct answer) and stored
// alongside whether it was correct.
//
// So there are three tables involved throughout this file:
//   - `quiz_questions` -- the question bank, one row per question, tied to
//     a specific trail + landmark + grade band. Has an `is_active` flag
//     used as a soft-delete (see setQuizQuestionActive below).
//   - `quiz_assignments` -- links one `quiz_questions` row to one `classes`
//     row (i.e. "this class has been assigned this question").
//   - `quiz_responses` -- one row per (student, question) the student has
//     actually answered, with their chosen answer and whether it was correct.
//
// Exports:
//   - Types: `GradeBand`, `QuizQuestion`, `AssignedQuiz`, `TeacherClass`,
//     `QuizGradeStatus`, `QuizAssignmentInfo`, `QuizGradeMatrix`,
//     `QuizParticipation`, `QuizQuestionInput`.
//   - Student-facing: `fetchAssignedQuizzesForStudent`,
//     `fetchAnsweredQuestionIds`, `submitQuizResponse`.
//   - Teacher-facing: `fetchQuizQuestionsForTrail`, `fetchTeacherClasses`,
//     `fetchAssignedQuestionIdsForClass`, `assignQuestionToClass`,
//     `unassignQuestionFromClass`, `fetchClassQuizGradeMatrix`,
//     `fetchClassQuizParticipation`.
//   - OKAGE-facing: `fetchAllQuizQuestionsForTrail`, `createQuizQuestion`,
//     `updateQuizQuestion`, `setQuizQuestionActive`.

import { supabase } from '../utils/supabase';

// The three grade bands a quiz question can be written for. Distinct from
// a specific numeric grade (e.g. "3rd grade") -- questions are grouped
// into these three broad tiers.
export type GradeBand = 'elementary' | 'middle' | 'high';

// The UI-facing (camelCase) shape of one quiz question, used everywhere a
// question needs to be displayed, answered, or edited.
// Fields:
//   - id: stable row identifier.
//   - trailId: which trail this question belongs to.
//   - landmarkId: which landmark (within that trail's GeoJSON) this question is tied to.
//   - landmarkTitle: display name of that landmark, denormalized onto the
//     question row itself (rather than joined at read time) for simpler queries.
//   - gradeBand: which of the three GradeBand tiers this question targets.
//   - subject: the subject area (e.g. matches lib/standards.ts subject codes).
//   - standardCode: an optional academic standard code this question aligns to; null if untagged.
//   - question: the question text shown to the student.
//   - correctAnswer: the exact string that counts as correct (compared via strict equality in submitQuizResponse below).
//   - wrongAnswers: the other multiple-choice options shown alongside the correct answer.
//   - isActive: whether this question is currently live (see setQuizQuestionActive) -- inactive questions are hidden from every browse/assign/answer query in this file.
export type QuizQuestion = {
    id: string;
    trailId: string;
    landmarkId: string;
    landmarkTitle: string;
    gradeBand: GradeBand;
    subject: string;
    standardCode: string | null;
    question: string;
    correctAnswer: string;
    wrongAnswers: string[];
    isActive: boolean;
};

// A question as assigned to a student, pairing the assignment row's own id
// (needed when submitting a response, and for per-assignment grading) with
// the full question content.
export type AssignedQuiz = {
    assignmentId: string;
    question: QuizQuestion;
};

// The raw snake_case shape of a `quiz_questions` row as returned by Supabase.
type QuizQuestionRow = {
    id: string;
    trail_id: string;
    landmark_id: string;
    landmark_title: string;
    grade_band: GradeBand;
    subject: string;
    standard_code: string | null;
    question: string;
    correct_answer: string;
    wrong_answers: string[];
    is_active?: boolean;
};

// Converts one raw `quiz_questions` row into the camelCase QuizQuestion
// shape used throughout the UI. Defaults `wrongAnswers` to `[]` and
// `isActive` to `true` if either is missing from the row (e.g. a query that
// didn't select `is_active` at all, or a genuinely null `wrong_answers`).
// Pure function, no side effects.
function normalizeQuestion(row: QuizQuestionRow): QuizQuestion {
    return {
        id: String(row.id),
        trailId: String(row.trail_id),
        landmarkId: String(row.landmark_id),
        landmarkTitle: row.landmark_title,
        gradeBand: row.grade_band,
        subject: row.subject,
        standardCode: row.standard_code ?? null,
        question: row.question,
        correctAnswer: row.correct_answer,
        wrongAnswers: row.wrong_answers ?? [],
        isActive: row.is_active ?? true,
    };
}

// The full column list requested on every plain SELECT against
// `quiz_questions` below -- kept as one shared constant so every query
// stays in sync with what normalizeQuestion expects to find on the row.
const QUESTION_COLUMNS =
    'id, trail_id, landmark_id, landmark_title, grade_band, subject, standard_code, question, correct_answer, wrong_answers, is_active';

// ---------------------------------------------------------------------------
// Student-facing
// ---------------------------------------------------------------------------

// Every quiz assigned (via any class the student belongs to) for a given trail.
// RLS on quiz_assignments already scopes rows to the student's own classes.
// Parameters:
//   - trailId: which trail to fetch the student's assigned quizzes for.
// Returns: a Promise resolving to an AssignedQuiz[] -- one entry per
// assignment, each pairing that assignment's id with its full question
// content. Only assignments whose underlying question is both active AND
// tied to the given trail are included.
// Side effects: one Supabase SELECT against `quiz_assignments`, joined to
// `quiz_questions` (see the embedded select syntax below). Row Level
// Security on `quiz_assignments` restricts which assignment rows this
// query can even see to just the classes the calling student belongs to --
// this function itself applies no student-id filter, relying entirely on
// that RLS policy. Throws the raw Supabase error on failure.
export async function fetchAssignedQuizzesForStudent(trailId: string): Promise<AssignedQuiz[]> {
    const { data, error } = await supabase
        .from('quiz_assignments')
        // `quiz_questions!inner(...)` is Supabase/PostgREST's embedded-
        // resource syntax: it performs an INNER JOIN from quiz_assignments
        // to quiz_questions (via the assignment's question_id foreign key),
        // pulling back the listed QUESTION_COLUMNS nested under the
        // `quiz_questions` key on each returned row. Being an INNER join
        // (not a left join) means an assignment whose question was deleted
        // outright wouldn't appear at all -- though in practice questions
        // are soft-deleted via is_active rather than actually removed.
        .select(`id, question_id, quiz_questions!inner(${QUESTION_COLUMNS})`)
        // These `.eq()` filters apply to the JOINED quiz_questions columns
        // (dot-path syntax), not to quiz_assignments itself -- i.e. "only
        // assignments whose question belongs to this trail and is active".
        .eq('quiz_questions.trail_id', trailId)
        .eq('quiz_questions.is_active', true);

    if (error) throw error;

    return (data ?? [])
        // Defensive filter: skip any row where the joined quiz_questions
        // object somehow came back falsy (shouldn't normally happen given
        // the inner join above, but guards against a malformed response).
        .filter((row: any) => row.quiz_questions)
        .map((row: any) => ({
            assignmentId: String(row.id),
            question: normalizeQuestion(row.quiz_questions as QuizQuestionRow),
        }));
}

// Which of the given question ids this student has already answered.
// Parameters:
//   - studentId: the student to check answered questions for.
//   - questionIds: the candidate question ids to check.
// Returns: a Promise resolving to a Set of question ids (as strings) the
// student already has a `quiz_responses` row for. Returns an empty Set
// immediately (no query at all) if `questionIds` is empty.
// Side effects: one Supabase SELECT against `quiz_responses`, filtered to
// this student and this list of question ids. Throws the raw Supabase
// error on failure.
export async function fetchAnsweredQuestionIds(studentId: string, questionIds: string[]): Promise<Set<string>> {
    if (questionIds.length === 0) return new Set();

    const { data, error } = await supabase
        .from('quiz_responses')
        .select('question_id')
        .eq('student_id', studentId)
        // `.in(...)` matches rows whose question_id is any of the given ids
        // -- equivalent to a SQL `WHERE question_id IN (...)`.
        .in('question_id', questionIds);

    if (error) throw error;

    // A Set is returned (rather than an array) since callers only ever
    // need an O(1) "has this question been answered?" membership check.
    return new Set((data ?? []).map((row: { question_id: string }) => String(row.question_id)));
}

// The parameters accepted by submitQuizResponse below.
type SubmitQuizResponseParams = {
    studentId: string; // Who is answering.
    question: QuizQuestion; // The full question being answered (its correctAnswer is used for grading).
    assignmentId: string | null; // The specific assignment this answer is for, if any (null if answered outside a class assignment context).
    trailId: string; // Which trail this question belongs to (denormalized onto the response row for easier querying later).
    selectedAnswer: string; // The exact answer string the student chose.
};

// Record a student's answer and report whether it was correct.
// Parameters: a SubmitQuizResponseParams object (see type above).
// Returns: a Promise resolving to `true` if `selectedAnswer` exactly
// matches `question.correctAnswer`, `false` otherwise -- grading happens
// client-side here (a simple strict string equality check) before the
// insert, and the resulting boolean is stored on the row as `is_correct`
// rather than being recomputed later.
// Side effects: one Supabase INSERT into `quiz_responses`. Throws the raw
// Supabase error on failure (e.g. a unique-constraint violation if this
// student already has a response for this question, depending on the
// table's constraints).
export async function submitQuizResponse({
    studentId,
    question,
    assignmentId,
    trailId,
    selectedAnswer,
}: SubmitQuizResponseParams): Promise<boolean> {
    const isCorrect = selectedAnswer === question.correctAnswer;

    const { error } = await supabase.from('quiz_responses').insert({
        student_id: studentId,
        question_id: question.id,
        assignment_id: assignmentId,
        trail_id: trailId,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
    });

    if (error) throw error;

    return isCorrect;
}

// ---------------------------------------------------------------------------
// Teacher-facing
// ---------------------------------------------------------------------------

// The full active question bank for a trail, for the teacher's browse/filter UI.
// Parameters:
//   - trailId: which trail's questions to fetch.
// Returns: a Promise resolving to a QuizQuestion[] of every active question
// tied to this trail, ordered by landmarkId (so questions for the same
// landmark are grouped together in the UI).
// Side effects: one Supabase SELECT against `quiz_questions`. Throws the
// raw Supabase error on failure.
export async function fetchQuizQuestionsForTrail(trailId: string): Promise<QuizQuestion[]> {
    const { data, error } = await supabase
        .from('quiz_questions')
        .select(QUESTION_COLUMNS)
        .eq('trail_id', trailId)
        .eq('is_active', true)
        .order('landmark_id', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => normalizeQuestion(row as QuizQuestionRow));
}

// ---------------------------------------------------------------------------
// OKAGE-facing: browse every question for a trail, including deactivated ones.
// ---------------------------------------------------------------------------
// Parameters:
//   - trailId: which trail's questions to fetch.
// Returns: a Promise resolving to a QuizQuestion[] of EVERY question tied
// to this trail -- active and inactive alike -- for the content-editor's
// full management view, ordered by landmarkId. This is the only fetch
// function in this file that does NOT filter on `is_active`.
// Side effects: one Supabase SELECT against `quiz_questions`. Throws the
// raw Supabase error on failure.
export async function fetchAllQuizQuestionsForTrail(trailId: string): Promise<QuizQuestion[]> {
    const { data, error } = await supabase
        .from('quiz_questions')
        .select(QUESTION_COLUMNS)
        .eq('trail_id', trailId)
        .order('landmark_id', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => normalizeQuestion(row as QuizQuestionRow));
}

// A minimal class summary used when populating a teacher's own class picker.
export type TeacherClass = { id: string; className: string };

// Every class this teacher owns, for populating the assignment screen's
// class picker.
// Parameters:
//   - teacherId: the teacher whose classes to fetch.
// Returns: a Promise resolving to a TeacherClass[], newest-created class first.
// Side effects: one Supabase SELECT against `classes`, filtered to this
// teacher. Throws the raw Supabase error on failure.
export async function fetchTeacherClasses(teacherId: string): Promise<TeacherClass[]> {
    const { data, error } = await supabase
        .from('classes')
        .select('id, class_name')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: { id: string; class_name: string }) => ({
        id: String(row.id),
        className: row.class_name,
    }));
}

// question_ids already assigned to a class, for rendering toggle state.
// Parameters:
//   - classId: which class's assignments to check.
// Returns: a Promise resolving to a Set of question ids already assigned to
// this class, so the assignment UI can render each question's toggle as
// already-on or off.
// Side effects: one Supabase SELECT against `quiz_assignments`, filtered to
// this class. Throws the raw Supabase error on failure.
export async function fetchAssignedQuestionIdsForClass(classId: string): Promise<Set<string>> {
    const { data, error } = await supabase
        .from('quiz_assignments')
        .select('question_id')
        .eq('class_id', classId);

    if (error) throw error;

    return new Set((data ?? []).map((row: { question_id: string }) => String(row.question_id)));
}

// Assigns one question to one class, creating the row that makes it
// actually show up for that class's students.
// Parameters:
//   - classId: the class to assign the question to.
//   - questionId: the question being assigned.
//   - teacherId: which teacher performed the assignment (recorded as `assigned_by` for audit purposes).
// Returns: a Promise that resolves once the insert completes.
// Side effects: one Supabase INSERT into `quiz_assignments`. Throws the raw
// Supabase error on failure (e.g. a unique-constraint violation if this
// exact class/question pair is already assigned, depending on the table's
// constraints).
export async function assignQuestionToClass(classId: string, questionId: string, teacherId: string) {
    const { error } = await supabase
        .from('quiz_assignments')
        .insert({ class_id: classId, question_id: questionId, assigned_by: teacherId });

    if (error) throw error;
}

// Removes a question's assignment from a class -- the inverse of
// assignQuestionToClass. Note this only removes the `quiz_assignments` row
// itself; any `quiz_responses` students already submitted against that
// assignment are NOT deleted here, so unassigning a question a student
// already answered leaves their historical response orphaned from an
// active assignment (still queryable directly by question/student id, just
// no longer reachable via a live assignment row).
// Parameters:
//   - classId: the class to remove the assignment from.
//   - questionId: the question to unassign.
// Returns: a Promise that resolves once the delete completes.
// Side effects: one Supabase DELETE against `quiz_assignments`, filtered to
// this exact class/question pair. Throws the raw Supabase error on failure.
export async function unassignQuestionFromClass(classId: string, questionId: string) {
    const { error } = await supabase
        .from('quiz_assignments')
        .delete()
        .eq('class_id', classId)
        .eq('question_id', questionId);

    if (error) throw error;
}

// ---------------------------------------------------------------------------
// OKAGE-facing: create/edit/deactivate quiz questions.
// ---------------------------------------------------------------------------

// The editable fields of a quiz question, as filled out on the OKAGE
// question-editor form. Same shape as QuizQuestion minus `id` and
// `isActive` (assigned/managed separately -- see createQuizQuestion,
// updateQuizQuestion, and setQuizQuestionActive below).
export type QuizQuestionInput = {
    trailId: string;
    landmarkId: string;
    landmarkTitle: string;
    gradeBand: GradeBand;
    subject: string;
    standardCode: string | null;
    question: string;
    correctAnswer: string;
    wrongAnswers: string[];
};

// Adds a brand new question to the bank.
// Parameters:
//   - input: the full set of fields for the new question (see QuizQuestionInput).
// Returns: a Promise that resolves once the insert completes (the new
// row's generated id is not returned to the caller here -- re-fetch if
// needed).
// Side effects: one Supabase INSERT into `quiz_questions`. An empty/falsy
// `standardCode` is stored as `null`. New rows default to `is_active: true`
// at the database level (not set explicitly here). Throws the raw Supabase
// error on failure.
export async function createQuizQuestion(input: QuizQuestionInput) {
    const { error } = await supabase.from('quiz_questions').insert({
        trail_id: input.trailId,
        landmark_id: input.landmarkId,
        landmark_title: input.landmarkTitle,
        grade_band: input.gradeBand,
        subject: input.subject,
        standard_code: input.standardCode || null,
        question: input.question,
        correct_answer: input.correctAnswer,
        wrong_answers: input.wrongAnswers,
    });

    if (error) throw error;
}

// Overwrites every editable field of an existing question.
// Parameters:
//   - questionId: the row id of the question to update.
//   - input: the full replacement set of fields (see QuizQuestionInput) --
//     a full overwrite, not a partial patch.
// Returns: a Promise that resolves once the update completes.
// Side effects: one Supabase UPDATE against `quiz_questions`, filtered to
// the given `questionId`. Does not touch `is_active` -- see
// setQuizQuestionActive for that. Throws the raw Supabase error on failure.
export async function updateQuizQuestion(questionId: string, input: QuizQuestionInput) {
    const { error } = await supabase
        .from('quiz_questions')
        .update({
            trail_id: input.trailId,
            landmark_id: input.landmarkId,
            landmark_title: input.landmarkTitle,
            grade_band: input.gradeBand,
            subject: input.subject,
            standard_code: input.standardCode || null,
            question: input.question,
            correct_answer: input.correctAnswer,
            wrong_answers: input.wrongAnswers,
        })
        .eq('id', questionId);

    if (error) throw error;
}

// Soft delete: keeps the row (and any assignments/responses tied to it) but
// hides it from every browse/assign/answer query, which all filter on is_active.
// Parameters:
//   - questionId: the row id of the question to (de)activate.
//   - isActive: the new active-flag value (false to soft-delete, true to restore).
// Returns: a Promise that resolves once the update completes.
// Side effects: one Supabase UPDATE against `quiz_questions`, filtered to
// the given `questionId`, touching only the `is_active` column. Throws the
// raw Supabase error on failure. This is why fetchAllQuizQuestionsForTrail
// above (unlike every other fetch function here) doesn't filter on
// is_active -- it's specifically meant to show OKAGE staff the deactivated
// rows too, so they have something to reactivate.
export async function setQuizQuestionActive(questionId: string, isActive: boolean) {
    const { error } = await supabase
        .from('quiz_questions')
        .update({ is_active: isActive })
        .eq('id', questionId);

    if (error) throw error;
}

// A single assigned question's grading status for one student -- either
// they got it right, got it wrong, or haven't attempted it yet.
export type QuizGradeStatus = 'correct' | 'incorrect' | 'not_attempted';

// A minimal summary of one class assignment, for column headers in the
// teacher's per-student grade grid.
export type QuizAssignmentInfo = {
    assignmentId: string;
    landmarkTitle: string;
    question: string;
};

// The full grid of assignment x student grading results for a class.
// Fields:
//   - assignments: every question currently assigned to the class (the
//     grid's "columns").
//   - grades: a nested map, studentId -> assignmentId -> status. Only ever
//     holds 'correct' or 'incorrect' entries (an assignment/student pair
//     with no entry means 'not_attempted' — callers should default missing
//     lookups to that, since there is no explicit 'not_attempted' row
//     stored anywhere; it's simply the absence of a response).
export type QuizGradeMatrix = {
    assignments: QuizAssignmentInfo[];
    grades: Map<string, Map<string, QuizGradeStatus>>;
};

// Every question assigned to a class, cross-referenced against every
// student's responses, so a teacher can see correct/incorrect/not-attempted
// per student per question — not just the aggregate correct/total count
// fetchClassQuizParticipation returns.
// Parameters:
//   - classId: which class's grade matrix to build.
// Returns: a Promise resolving to a QuizGradeMatrix (see type above).
// Side effects: two sequential Supabase queries -- first every assignment
// for the class (joined to its question's landmark title/text), then every
// response tied to any of those assignment ids (skipped entirely, using an
// empty result, if there are no assignments at all). Throws the raw
// Supabase error from either query on failure.
export async function fetchClassQuizGradeMatrix(classId: string): Promise<QuizGradeMatrix> {
    const { data: assignments, error: assignmentsError } = await supabase
        .from('quiz_assignments')
        // Embedded-resource join to quiz_questions (NOT `!inner` this time,
        // so an assignment whose question is missing would still appear,
        // with `quiz_questions` coming back null/undefined -- handled via
        // the `?.` optional chaining and fallback text below).
        .select(`id, question_id, quiz_questions(landmark_title, question)`)
        .eq('class_id', classId);

    if (assignmentsError) throw assignmentsError;

    // Reshape into the "columns" of the grid, falling back to placeholder
    // text if the joined question data came back missing.
    const assignmentList: QuizAssignmentInfo[] = (assignments ?? []).map((row: any) => ({
        assignmentId: String(row.id),
        landmarkTitle: row.quiz_questions?.landmark_title ?? 'Unknown Landmark',
        question: row.quiz_questions?.question ?? '',
    }));

    const assignmentIds = assignmentList.map((a) => a.assignmentId);
    // Only bother querying quiz_responses if there's at least one
    // assignment to match against -- an empty `.in()` list would otherwise
    // be a wasted round-trip (and some query builders treat an empty `.in()`
    // array ambiguously), so this short-circuits to an empty result instead.
    const { data: responses, error: responsesError } = assignmentIds.length
        ? await supabase.from('quiz_responses').select('student_id, assignment_id, is_correct').in('assignment_id', assignmentIds)
        : { data: [], error: null };

    if (responsesError) throw responsesError;

    // Build the nested studentId -> assignmentId -> status map: for each
    // response row, look up (or lazily create) that student's inner Map,
    // then record this assignment's correct/incorrect status on it.
    const grades = new Map<string, Map<string, QuizGradeStatus>>();
    for (const row of (responses ?? []) as { student_id: string; assignment_id: string; is_correct: boolean }[]) {
        const studentGrades = grades.get(row.student_id) ?? new Map<string, QuizGradeStatus>();
        studentGrades.set(String(row.assignment_id), row.is_correct ? 'correct' : 'incorrect');
        grades.set(row.student_id, studentGrades);
    }

    return { assignments: assignmentList, grades };
}

// A student's simple correct/total tally across a class's assignments.
export type QuizParticipation = { correct: number; total: number };

// Per-student correct/total counts across everything assigned to this class,
// for the teacher roster's participation column.
// Parameters:
//   - classId: which class to tally participation for.
// Returns: a Promise resolving to a Map of studentId -> QuizParticipation
// (correct count and total-attempted count). A student who has answered
// nothing yet from this class's assignments simply has no entry in the map
// at all (rather than an explicit `{ correct: 0, total: 0 }`) -- callers
// should treat a missing key the same as zero participation. Returns an
// empty Map immediately if the class has no assignments at all.
// Side effects: two sequential Supabase queries -- first every assignment
// id for the class, then every response tied to any of those assignment
// ids. Throws the raw Supabase error from either query on failure.
export async function fetchClassQuizParticipation(classId: string): Promise<Map<string, QuizParticipation>> {
    const { data: assignments, error: assignmentsError } = await supabase
        .from('quiz_assignments')
        .select('id')
        .eq('class_id', classId);

    if (assignmentsError) throw assignmentsError;

    const assignmentIds = (assignments ?? []).map((row: { id: string }) => row.id);
    // No assignments at all -- nothing to tally, and no point querying
    // quiz_responses at all.
    if (assignmentIds.length === 0) return new Map();

    const { data: responses, error: responsesError } = await supabase
        .from('quiz_responses')
        .select('student_id, is_correct')
        .in('assignment_id', assignmentIds);

    if (responsesError) throw responsesError;

    // Accumulate each student's correct/total counts across every response
    // row, creating their entry in the map lazily on first encounter.
    const participation = new Map<string, QuizParticipation>();
    for (const row of (responses ?? []) as { student_id: string; is_correct: boolean }[]) {
        const current = participation.get(row.student_id) ?? { correct: 0, total: 0 };
        current.total += 1;
        if (row.is_correct) current.correct += 1;
        participation.set(row.student_id, current);
    }
    return participation;
}
