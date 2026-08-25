// components/QuizModal.tsx
//
// FILE OVERVIEW
// -------------
// Component: QuizModal (default export)
// Platform: SHARED -- built entirely from react-native primitives (Modal,
//   ScrollView, Pressable, etc.), so the same code runs on iOS, Android, and
//   web with no platform split.
// Responsibility: shows a landmark's informational content (title, mile
//   marker, description, fun fact) plus, when the current student has been
//   assigned one, a multiple-choice quiz for that landmark. If no quiz is
//   assigned (or the student already answered it), this renders exactly
//   like a plain informational popup with no quiz section at all. When a
//   quiz IS shown, this component also owns picking an answer, submitting
//   it (via lib/quizzes.ts), and revealing whether it was correct.

import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, Theme } from '../commonStyles';
import { submitQuizResponse, type AssignedQuiz } from '../lib/quizzes';
import ModalBackdrop from './ModalBackdrop';

// The minimal shape of a landmark this modal needs -- a subset of whatever
// richer landmark type the caller (e.g. the trail map / dashboard) actually
// has, so this component doesn't need to import that whole type.
type LandmarkLike = {
    id: string;
    title: string;
    description?: string;
    funFact?: string;
    mileMarker: number;
};

// Props for QuizModal:
// - landmark: the landmark whose info (and, if applicable, quiz) is shown.
// - assignedQuiz: the quiz question assigned to this student for this
//   landmark, if any (see lib/quizzes.ts's AssignedQuiz type). null/undefined
//   means "no quiz for this landmark" -- the modal just shows landmark info.
// - alreadyAnswered: whether this student has already submitted an answer
//   for this landmark's quiz on a previous visit. When true, the quiz form
//   itself is hidden and a "you already completed this" note is shown
//   instead (its actual score isn't re-shown here).
// - studentId: the current student's id, forwarded to submitQuizResponse
//   when they submit an answer.
// - trailId: the trail this landmark belongs to, also forwarded to
//   submitQuizResponse (quiz responses are recorded per trail attempt).
// - onClose: called when the student taps the backdrop or the Close button.
// - onAnswered: optional callback fired right after a submission succeeds,
//   with the question id and whether the answer was correct -- lets the
//   parent (e.g. update a "landmarks answered" counter) react without this
//   modal needing to know anything about that bookkeeping itself.
// - accentColor: hex color used for the Close button and Submit button
//   backgrounds, and the selected-choice border; defaults to an orange.
type QuizModalProps = {
    landmark: LandmarkLike;
    assignedQuiz?: AssignedQuiz | null;
    alreadyAnswered?: boolean;
    studentId: string;
    trailId: string;
    onClose: () => void;
    onAnswered?: (questionId: string, isCorrect: boolean) => void;
    accentColor?: string;
};

// Fisher-Yates shuffle so the correct answer doesn't always land in the same slot.
// Takes an array and returns a NEW array (the original `items` is copied via
// spread first) with its elements in random order. Walks the array backwards,
// and for each position `i` swaps it with a random earlier-or-equal position
// `j` -- the standard algorithm for producing an unbiased random permutation.
function shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// QuizModal
// ---------
// Purpose: render a landmark's info popup, and -- when applicable -- an
// interactive multiple-choice quiz below it: pick an answer, submit it, see
// whether it was right.
//
// Props: see the `QuizModalProps` type above.
// Returns: a sliding-up-from-bottom <Modal> sheet containing the landmark's
// title/mile marker/description/fun fact, plus (conditionally) either an
// "already answered" note or the live quiz UI.
export default function QuizModal({
    landmark,
    assignedQuiz,
    alreadyAnswered = false,
    studentId,
    trailId,
    onClose,
    onAnswered,
    accentColor = '#DE9027',
}: QuizModalProps) {
    // useColorScheme reports the device/browser's light-or-dark preference;
    // `?? 'light'` covers the brief moment it can report null/undefined
    // before the OS preference is known. `theme` then picks the matching
    // color palette from commonStyles.ts, and `getStyles(theme)` builds a
    // fresh StyleSheet using those colors (see the getStyles comment near
    // the bottom of this file for why it's a function instead of a plain
    // StyleSheet.create call).
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    // The actual quiz question object, or null if no quiz was assigned.
    const question = assignedQuiz?.question ?? null;
    // Only show the interactive quiz section when there IS a question AND
    // the student hasn't already answered it before.
    const showQuiz = !!question && !alreadyAnswered;

    // Builds the list of answer choices (correct + wrong answers) in random
    // order. useMemo recomputes this only when `question` changes -- without
    // it, every re-render (e.g. from `selected` or `submitting` changing)
    // would re-shuffle the choices, visibly jumbling the answers around
    // while the student is still looking at them.
    const choices = useMemo(() => {
        if (!question) return [];
        return shuffle([question.correctAnswer, ...question.wrongAnswers]);
    }, [question]);

    // Which choice string the student has currently tapped (before
    // submitting). null means nothing selected yet.
    const [selected, setSelected] = useState<string | null>(null);
    // True while the submitQuizResponse network call is in flight; disables
    // the Submit button and swaps its label for a spinner.
    const [submitting, setSubmitting] = useState(false);
    // Set once the answer has been submitted and scored; null beforehand.
    // Its presence (not just its value) is used below to decide whether to
    // show the choice list as still-interactive or already-revealed.
    const [result, setResult] = useState<{ isCorrect: boolean } | null>(null);

    // Fires when the student taps "Submit Answer." Bails out silently if
    // there's no question, nothing selected, or a submission is already in
    // progress (guards against double-submits from a fast double-tap).
    // Talks to submitQuizResponse (lib/quizzes.ts) to record the answer and
    // find out if it was correct, then stores that in `result` so the UI can
    // reveal right/wrong styling, and calls the optional onAnswered callback
    // so the parent can react (e.g. update a progress counter) too.
    const handleSubmit = async () => {
        if (!question || !selected || submitting) return;
        setSubmitting(true);
        try {
            const isCorrect = await submitQuizResponse({
                studentId,
                question,
                assignmentId: assignedQuiz?.assignmentId ?? null,
                trailId,
                selectedAnswer: selected,
            });
            setResult({ isCorrect });
            onAnswered?.(question.id, isCorrect);
        } catch (e) {
            // Deliberately just logs -- there's no dedicated error-message
            // UI here, so a failed submission leaves the student able to
            // try again (submitting resets to false in `finally` below).
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            {/* Tapping the dimmed backdrop closes the modal; the sheet
                below is a Pressable that stops that tap from bubbling back
                up to this one, so tapping inside it doesn't close it. */}
            <ModalBackdrop style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    <Pressable
                        style={[styles.closeButton, { backgroundColor: accentColor }]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                    >
                        <Text style={styles.closeButtonText}>Close</Text>
                    </Pressable>

                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        <Text style={styles.title}>{landmark.title}</Text>
                        <Text style={styles.mile}>Mile marker ~{landmark.mileMarker}</Text>
                        <Text style={styles.body}>{landmark.description || 'More details coming soon.'}</Text>
                        {landmark.funFact ? (
                            <View style={styles.funFactBox}>
                                <Text style={styles.funFactLabel}>FUN FACT</Text>
                                <Text style={styles.funFactText}>{landmark.funFact}</Text>
                            </View>
                        ) : null}

                        {alreadyAnswered && question ? (
                            <View style={styles.answeredBox}>
                                <Text style={styles.answeredText}>✓ You already completed this quiz.</Text>
                            </View>
                        ) : null}

                        {showQuiz && question ? (
                            <View style={styles.quizBox}>
                                <Text style={styles.quizKicker}>QUIZ</Text>
                                <Text style={styles.quizQuestion}>{question.question}</Text>

                                {/* Render one Pressable per shuffled choice.
                                    Before submission (isRevealed === false),
                                    tapping a choice just updates `selected`
                                    and only shows a highlighted border on the
                                    tapped one. After submission
                                    (isRevealed === true, i.e. `result` is
                                    set), every choice becomes non-interactive
                                    and is recolored: the actually-correct
                                    answer always turns green, and -- if the
                                    student picked a different, wrong one --
                                    that wrong pick turns red. A correct pick
                                    only shows green (no separate red state
                                    needed since correct-and-selected is the
                                    same choice). */}
                                {choices.map((choice) => {
                                    const isSelected = selected === choice;
                                    const isRevealed = result !== null;
                                    const isChoiceCorrect = choice === question.correctAnswer;
                                    const revealStyle = isRevealed
                                        ? isChoiceCorrect
                                            ? styles.choiceCorrect
                                            : isSelected
                                              ? styles.choiceIncorrect
                                              : null
                                        : null;

                                    return (
                                        <Pressable
                                            key={choice}
                                            disabled={isRevealed}
                                            style={[
                                                styles.choice,
                                                isSelected && !isRevealed && { borderColor: accentColor, borderWidth: 2 },
                                                revealStyle,
                                            ]}
                                            onPress={() => setSelected(choice)}
                                            accessibilityRole="radio"
                                            accessibilityLabel={choice}
                                            accessibilityState={{ selected: isSelected, disabled: isRevealed }}
                                        >
                                            <Text style={styles.choiceText}>{choice}</Text>
                                        </Pressable>
                                    );
                                })}

                                {/* Once submitted, replace the Submit
                                    button with a feedback message instead
                                    (green "Correct!" or red "Not quite,"
                                    revealing the correct answer text). */}
                                {result ? (
                                    <Text style={[styles.resultText, { color: result.isCorrect ? '#2E7D32' : '#C62828' }]}>
                                        {result.isCorrect ? 'Correct! 🎉' : `Not quite — the answer was "${question.correctAnswer}".`}
                                    </Text>
                                ) : (
                                    <Pressable
                                        style={[styles.submitButton, { backgroundColor: accentColor, opacity: selected ? 1 : 0.5 }]}
                                        disabled={!selected || submitting}
                                        onPress={handleSubmit}
                                        accessibilityRole="button"
                                        accessibilityLabel="Submit Answer"
                                    >
                                        {submitting ? (
                                            <ActivityIndicator color="#FFF" size="small" />
                                        ) : (
                                            <Text style={styles.submitButtonText}>Submit Answer</Text>
                                        )}
                                    </Pressable>
                                )}
                            </View>
                        ) : null}
                    </ScrollView>
                </Pressable>
            </ModalBackdrop>
        </Modal>
    );
}

// Theme-aware style factory (see commonStyles.ts's Theme type) -- called
// once per render inside the component so every fill/text/border color
// tracks the active light/dark scheme instead of being frozen at hex
// literals that only ever looked right in light mode. The green/red
// correct-incorrect feedback colors (choiceCorrect/choiceIncorrect,
// answeredBox/answeredText, resultText) are deliberately left as fixed
// semantic colors rather than theme tokens -- "correct" and "incorrect"
// need to read the same regardless of light/dark scheme.
const getStyles = (theme: Theme) => StyleSheet.create({
    overlay: {
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: theme.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
        width: '100%',
        maxWidth: 840,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: theme.border,
    },
    content: {
        padding: 24,
        paddingTop: 40,
    },
    closeButton: {
        position: 'absolute',
        top: 14,
        right: 16,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 14,
        zIndex: 10,
    },
    closeButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFF',
        letterSpacing: 0.5,
    },
    title: {
        fontSize: 22,
        fontFamily: 'Georgia',
        fontWeight: '800',
        color: theme.text,
        marginBottom: 4,
    },
    mile: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.subtext,
        marginBottom: 12,
    },
    body: {
        fontSize: 15,
        lineHeight: 22,
        color: theme.text,
    },
    funFactBox: {
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        backgroundColor: theme.background,
        borderWidth: 1,
        borderColor: theme.border,
    },
    funFactLabel: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
        color: '#A3803B',
        marginBottom: 4,
    },
    funFactText: {
        fontSize: 13,
        lineHeight: 18,
        color: theme.text,
    },
    answeredBox: {
        marginTop: 20,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#E8F5E9',
    },
    answeredText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2E7D32',
    },
    quizBox: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: theme.border,
    },
    quizKicker: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.1,
        color: '#A3803B',
        marginBottom: 6,
    },
    quizQuestion: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.text,
        marginBottom: 14,
        lineHeight: 22,
    },
    choice: {
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
    },
    choiceCorrect: {
        borderColor: '#2E7D32',
        borderWidth: 2,
        backgroundColor: '#E8F5E9',
    },
    choiceIncorrect: {
        borderColor: '#C62828',
        borderWidth: 2,
        backgroundColor: '#FDECEA',
    },
    choiceText: {
        fontSize: 14,
        color: theme.text,
        fontWeight: '600',
    },
    submitButton: {
        marginTop: 8,
        height: 46,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    submitButtonText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14,
    },
    resultText: {
        marginTop: 8,
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },
});
