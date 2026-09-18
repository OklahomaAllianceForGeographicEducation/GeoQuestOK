// components/FirstLoginProfilePrompt.tsx
//
// FILE OVERVIEW
// -------------
// Prompts a student, the first time they ever log in, to set their age and
// gender bracket. These two values (stored as profiles.birth_date and
// profiles.award_group) drive which fitness benchmark row applies to them
// (see FITNESS_BENCHMARKS in app/(tabs)/fitness.tsx) and which fitness
// badge targets they're evaluated against server-side (see
// evaluate_fitness_badges in supabase/badge-activity-triggers.sql). Both of
// those silently fall back to age 10 / BOYS when birth_date is null --
// until now the ONLY way to actually set them was a small "tap to change"
// panel buried on the Fitness tab, which most students never discovered.
//
// Mounted once at the app root (app/_layout.tsx), the same way
// BadgeUnlockProvider is. Shows a skippable modal when:
//   - a student is logged in (profiles.app_role === 'student'), AND
//   - they've never set a birth_date (profiles.birth_date IS NULL), AND
//   - they haven't already tapped "Skip for now" on this device.
//
// Picking "Skip for now" intentionally does NOT write anything to the
// profile -- per privacy-policy.tsx, age/gender are optional and not
// required at sign-up, so skipping should behave exactly like never having
// been asked. Without a device-local skip flag, though, that would mean
// the prompt reappears on every single login for a student who skips once,
// which is the same "keeps asking every time" complaint this file exists
// to avoid for badge popups elsewhere -- so the skip is remembered
// per-device via AsyncStorage instead.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors } from '../commonStyles';
import { supabase } from '../utils/supabase';

const SKIP_STORAGE_PREFIX = 'geoquestok:profile-prompt:skipped';

// Matches the age range FITNESS_BENCHMARKS covers in app/(tabs)/fitness.tsx.
const AGE_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export default function FirstLoginProfilePrompt() {
    const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
    const theme = colors[scheme];

    // Mirrors BadgeUnlockProvider's own userId-tracking effect below --
    // this component isn't a context provider, so it just tracks this for
    // its own internal use rather than exposing it to anyone else.
    const [userId, setUserId] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [group, setGroup] = useState<'BOYS' | 'GIRLS' | null>(null);
    const [age, setAge] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function loadUser() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!mounted) return;
            setUserId(session?.user?.id ?? null);
        }
        void loadUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUserId(session?.user?.id ?? null);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // Whenever the logged-in user changes, decide whether they're due for
    // this prompt: student role, no birth_date on file yet, and haven't
    // already skipped it on this device.
    useEffect(() => {
        if (!userId) {
            setVisible(false);
            return;
        }

        let cancelled = false;

        async function checkEligibility() {
            try {
                const skipped = await AsyncStorage.getItem(`${SKIP_STORAGE_PREFIX}:${userId}`);
                if (cancelled || skipped === '1') return;

                const { data } = await supabase
                    .from('profiles')
                    .select('app_role, birth_date')
                    .eq('id', userId)
                    .single();

                if (cancelled || !data) return;

                if (data.app_role === 'student' && !data.birth_date) {
                    setVisible(true);
                }
            } catch {
                // Non-critical: if this check fails, the student just keeps
                // using the silent age-10/BOYS default, same behavior as
                // before this prompt existed.
            }
        }

        void checkEligibility();
        return () => { cancelled = true; };
    }, [userId]);

    async function handleSkip() {
        if (userId) {
            try {
                await AsyncStorage.setItem(`${SKIP_STORAGE_PREFIX}:${userId}`, '1');
            } catch {
                // Best-effort -- worst case the prompt shows again next login.
            }
        }
        setVisible(false);
    }

    async function handleSave() {
        if (!userId || !group || !age || saving) return;
        setSaving(true);
        try {
            // Same "fabricate a Jan 1st birth date that computes back to
            // the chosen age" approach as fitness.tsx's saveProfileUpdate
            // -- the schema only stores a real birth_date, not a separate
            // age column.
            const syntheticBirthYear = new Date().getFullYear() - age;
            const { error } = await supabase
                .from('profiles')
                .update({
                    award_group: group,
                    birth_date: `${syntheticBirthYear}-01-01`,
                })
                .eq('id', userId);

            if (error) throw error;
            setVisible(false);
        } catch {
            // Leave the modal open so the student can retry rather than
            // silently losing their picks.
        } finally {
            setSaving(false);
        }
    }

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={handleSkip}>
            <View style={styles.backdrop}>
                <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.title, { color: theme.text }]}>Welcome! Let&apos;s set up your profile</Text>
                    <Text style={[styles.subtitle, { color: theme.subtext }]}>
                        This helps us pick fitness goals that fit you. You can change it anytime from the Fitness tab.
                    </Text>

                    <Text style={[styles.fieldLabel, { color: theme.subtext }]}>I AM A...</Text>
                    <View style={styles.row}>
                        <Pressable
                            style={[
                                styles.choiceButton,
                                { borderColor: theme.border },
                                group === 'BOYS' && { backgroundColor: theme.accent, borderColor: theme.accent },
                            ]}
                            onPress={() => setGroup('BOYS')}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: group === 'BOYS' }}
                            aria-selected={group === 'BOYS'}
                        >
                            <Text style={[styles.choiceText, { color: group === 'BOYS' ? '#FFF' : theme.text }]}>BOY</Text>
                        </Pressable>
                        <Pressable
                            style={[
                                styles.choiceButton,
                                { borderColor: theme.border },
                                group === 'GIRLS' && { backgroundColor: theme.accent, borderColor: theme.accent },
                            ]}
                            onPress={() => setGroup('GIRLS')}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: group === 'GIRLS' }}
                            aria-selected={group === 'GIRLS'}
                        >
                            <Text style={[styles.choiceText, { color: group === 'GIRLS' ? '#FFF' : theme.text }]}>GIRL</Text>
                        </Pressable>
                    </View>

                    <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 14 }]}>MY AGE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageRow}>
                        {AGE_OPTIONS.map((num) => (
                            <Pressable
                                key={num}
                                style={[
                                    styles.agePill,
                                    { borderColor: theme.border },
                                    age === num && { backgroundColor: theme.accent, borderColor: theme.accent },
                                ]}
                                onPress={() => setAge(num)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: age === num }}
                                aria-selected={age === num}
                                accessibilityLabel={num === 17 ? '17 or older' : `${num} years old`}
                            >
                                <Text style={[styles.agePillText, { color: age === num ? '#FFF' : theme.text }]}>
                                    {num === 17 ? '17+' : num}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>

                    <Pressable
                        style={[styles.saveButton, { backgroundColor: theme.accent, opacity: group && age ? 1 : 0.5 }]}
                        onPress={handleSave}
                        disabled={!group || !age || saving}
                        accessibilityRole="button"
                    >
                        <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save & Continue'}</Text>
                    </Pressable>

                    <Pressable onPress={handleSkip} style={styles.skipButton} disabled={saving} accessibilityRole="button">
                        <Text style={[styles.skipButtonText, { color: theme.subtext }]}>Skip for now</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    sheet: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 20,
        borderWidth: 1,
        padding: 22,
    },
    title: {
        fontSize: 19,
        fontWeight: '800',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 14,
        lineHeight: 18,
    },
    fieldLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    row: {
        flexDirection: 'row',
        gap: 10,
    },
    choiceButton: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    choiceText: {
        fontSize: 14,
        fontWeight: '800',
    },
    ageRow: {
        gap: 8,
        paddingVertical: 2,
    },
    agePill: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    agePillText: {
        fontSize: 14,
        fontWeight: '700',
    },
    saveButton: {
        marginTop: 18,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '800',
    },
    skipButton: {
        marginTop: 10,
        alignItems: 'center',
        paddingVertical: 6,
    },
    skipButtonText: {
        fontSize: 12,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
});
