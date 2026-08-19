// components/QuizModal.tsx
// Shows a landmark's informational content plus (when the current student has
// been assigned one) a multiple-choice quiz for that landmark. If no quiz is
// assigned this renders exactly like a plain informational popup.

import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { submitQuizResponse, type AssignedQuiz } from '../lib/quizzes';
import ModalBackdrop from './ModalBackdrop';

type LandmarkLike = {
    id: string;
    title: string;
    description?: string;
    funFact?: string;
    mileMarker: number;
};

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
function shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

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
    const question = assignedQuiz?.question ?? null;
    const showQuiz = !!question && !alreadyAnswered;

    const choices = useMemo(() => {
        if (!question) return [];
        return shuffle([question.correctAnswer, ...question.wrongAnswers]);
    }, [question]);

    const [selected, setSelected] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ isCorrect: boolean } | null>(null);

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
                    <Pressable style={[styles.closeButton, { backgroundColor: accentColor }]} onPress={onClose}>
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
                                        >
                                            <Text style={styles.choiceText}>{choice}</Text>
                                        </Pressable>
                                    );
                                })}

                                {result ? (
                                    <Text style={[styles.resultText, { color: result.isCorrect ? '#2E7D32' : '#C62828' }]}>
                                        {result.isCorrect ? 'Correct! 🎉' : `Not quite — the answer was "${question.correctAnswer}".`}
                                    </Text>
                                ) : (
                                    <Pressable
                                        style={[styles.submitButton, { backgroundColor: accentColor, opacity: selected ? 1 : 0.5 }]}
                                        disabled={!selected || submitting}
                                        onPress={handleSubmit}
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

const styles = StyleSheet.create({
    overlay: {
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#FAF9F5',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
        width: '100%',
        maxWidth: 840,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: '#C8C4B7',
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
        color: '#4E3629',
        marginBottom: 4,
    },
    mile: {
        fontSize: 12,
        fontWeight: '700',
        color: '#8A8A8A',
        marginBottom: 12,
    },
    body: {
        fontSize: 15,
        lineHeight: 22,
        color: '#3A352B',
    },
    funFactBox: {
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#F4F1EA',
        borderWidth: 1,
        borderColor: '#DDD9D0',
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
        color: '#3A352B',
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
        borderTopColor: '#DDD9D0',
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
        color: '#4E3629',
        marginBottom: 14,
        lineHeight: 22,
    },
    choice: {
        borderWidth: 1,
        borderColor: '#C8C4B7',
        backgroundColor: '#FFFFFF',
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
        color: '#3A352B',
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
