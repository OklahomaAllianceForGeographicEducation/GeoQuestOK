// lib/quizzes.ts
// Data helpers for the landmark quiz system: teachers browse/assign questions,
// students fetch what's assigned to them and submit answers.

import { supabase } from '../utils/supabase';

export type GradeBand = 'elementary' | 'middle' | 'high';

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

export type AssignedQuiz = {
    assignmentId: string;
    question: QuizQuestion;
};

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

const QUESTION_COLUMNS =
    'id, trail_id, landmark_id, landmark_title, grade_band, subject, standard_code, question, correct_answer, wrong_answers, is_active';

// ---------------------------------------------------------------------------
// Student-facing
// ---------------------------------------------------------------------------

// Every quiz assigned (via any class the student belongs to) for a given trail.
// RLS on quiz_assignments already scopes rows to the student's own classes.
export async function fetchAssignedQuizzesForStudent(trailId: string): Promise<AssignedQuiz[]> {
    const { data, error } = await supabase
        .from('quiz_assignments')
        .select(`id, question_id, quiz_questions!inner(${QUESTION_COLUMNS})`)
        .eq('quiz_questions.trail_id', trailId)
        .eq('quiz_questions.is_active', true);

    if (error) throw error;

    return (data ?? [])
        .filter((row: any) => row.quiz_questions)
        .map((row: any) => ({
            assignmentId: String(row.id),
            question: normalizeQuestion(row.quiz_questions as QuizQuestionRow),
        }));
}

// Which of the given question ids this student has already answered.
export async function fetchAnsweredQuestionIds(studentId: string, questionIds: string[]): Promise<Set<string>> {
    if (questionIds.length === 0) return new Set();

    const { data, error } = await supabase
        .from('quiz_responses')
        .select('question_id')
        .eq('student_id', studentId)
        .in('question_id', questionIds);

    if (error) throw error;

    return new Set((data ?? []).map((row: { question_id: string }) => String(row.question_id)));
}

type SubmitQuizResponseParams = {
    studentId: string;
    question: QuizQuestion;
    assignmentId: string | null;
    trailId: string;
    selectedAnswer: string;
};

// Record a student's answer and report whether it was correct.
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
export async function fetchAllQuizQuestionsForTrail(trailId: string): Promise<QuizQuestion[]> {
    const { data, error } = await supabase
        .from('quiz_questions')
        .select(QUESTION_COLUMNS)
        .eq('trail_id', trailId)
        .order('landmark_id', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => normalizeQuestion(row as QuizQuestionRow));
}

export type TeacherClass = { id: string; className: string };

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
export async function fetchAssignedQuestionIdsForClass(classId: string): Promise<Set<string>> {
    const { data, error } = await supabase
        .from('quiz_assignments')
        .select('question_id')
        .eq('class_id', classId);

    if (error) throw error;

    return new Set((data ?? []).map((row: { question_id: string }) => String(row.question_id)));
}

export async function assignQuestionToClass(classId: string, questionId: string, teacherId: string) {
    const { error } = await supabase
        .from('quiz_assignments')
        .insert({ class_id: classId, question_id: questionId, assigned_by: teacherId });

    if (error) throw error;
}

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
export async function setQuizQuestionActive(questionId: string, isActive: boolean) {
    const { error } = await supabase
        .from('quiz_questions')
        .update({ is_active: isActive })
        .eq('id', questionId);

    if (error) throw error;
}

// A single assigned question's grading status for one student.
export type QuizGradeStatus = 'correct' | 'incorrect' | 'not_attempted';

export type QuizAssignmentInfo = {
    assignmentId: string;
    landmarkTitle: string;
    question: string;
};

export type QuizGradeMatrix = {
    assignments: QuizAssignmentInfo[];
    // studentId -> assignmentId -> status. Only ever holds 'correct' or
    // 'incorrect' entries (an assignment/student pair with no entry means
    // 'not_attempted' — callers should default missing lookups to that).
    grades: Map<string, Map<string, QuizGradeStatus>>;
};

// Every question assigned to a class, cross-referenced against every
// student's responses, so a teacher can see correct/incorrect/not-attempted
// per student per question — not just the aggregate correct/total count
// fetchClassQuizParticipation returns.
export async function fetchClassQuizGradeMatrix(classId: string): Promise<QuizGradeMatrix> {
    const { data: assignments, error: assignmentsError } = await supabase
        .from('quiz_assignments')
        .select(`id, question_id, quiz_questions(landmark_title, question)`)
        .eq('class_id', classId);

    if (assignmentsError) throw assignmentsError;

    const assignmentList: QuizAssignmentInfo[] = (assignments ?? []).map((row: any) => ({
        assignmentId: String(row.id),
        landmarkTitle: row.quiz_questions?.landmark_title ?? 'Unknown Landmark',
        question: row.quiz_questions?.question ?? '',
    }));

    const assignmentIds = assignmentList.map((a) => a.assignmentId);
    const { data: responses, error: responsesError } = assignmentIds.length
        ? await supabase.from('quiz_responses').select('student_id, assignment_id, is_correct').in('assignment_id', assignmentIds)
        : { data: [], error: null };

    if (responsesError) throw responsesError;

    const grades = new Map<string, Map<string, QuizGradeStatus>>();
    for (const row of (responses ?? []) as { student_id: string; assignment_id: string; is_correct: boolean }[]) {
        const studentGrades = grades.get(row.student_id) ?? new Map<string, QuizGradeStatus>();
        studentGrades.set(String(row.assignment_id), row.is_correct ? 'correct' : 'incorrect');
        grades.set(row.student_id, studentGrades);
    }

    return { assignments: assignmentList, grades };
}

export type QuizParticipation = { correct: number; total: number };

// Per-student correct/total counts across everything assigned to this class,
// for the teacher roster's participation column.
export async function fetchClassQuizParticipation(classId: string): Promise<Map<string, QuizParticipation>> {
    const { data: assignments, error: assignmentsError } = await supabase
        .from('quiz_assignments')
        .select('id')
        .eq('class_id', classId);

    if (assignmentsError) throw assignmentsError;

    const assignmentIds = (assignments ?? []).map((row: { id: string }) => row.id);
    if (assignmentIds.length === 0) return new Map();

    const { data: responses, error: responsesError } = await supabase
        .from('quiz_responses')
        .select('student_id, is_correct')
        .in('assignment_id', assignmentIds);

    if (responsesError) throw responsesError;

    const participation = new Map<string, QuizParticipation>();
    for (const row of (responses ?? []) as { student_id: string; is_correct: boolean }[]) {
        const current = participation.get(row.student_id) ?? { correct: 0, total: 0 };
        current.total += 1;
        if (row.is_correct) current.correct += 1;
        participation.set(row.student_id, current);
    }
    return participation;
}
