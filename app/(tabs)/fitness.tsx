// app/(tabs)/fitness.tsx
// Student "fitness journal" screen: log trail-walking activity, log a
// Presidential-Fitness-style exercise score against an age/gender-specific
// benchmark target, and optionally write a free-text reflection note.

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useColorScheme,
    View
} from 'react-native';
import { colors, Theme } from '../../commonStyles';

// Custom modal components (their own files under components/) for
// entering a walking activity and a numeric exercise score, so this screen
// doesn't need its own inline forms for those inputs.
import ActivityLogModal from '../../components/ActivityLogModal';
import TourTarget from '../../components/tour/TourTarget';

// useBadgeUnlocks is a hook exposed by the app-wide BadgeUnlockProvider
// (wrapped around the whole app in app/_layout.tsx), giving access to
// refreshBadgeInbox() so newly-earned badges can be detected right after
// logging an activity.
import { useRef } from 'react';
import { useBadgeUnlocks } from '../../components/BadgeUnlockProvider';
import NumericEntryModal from '../../components/NumericEntryModal';
import { logMilesActivity } from '../../lib/activity';
import { ActivityKey, formatActivitySummary, formatMilesShort, InputUnit } from '../../lib/activityTypes';
import { confirmAlert, showAlert } from '../../lib/confirmAlert';
import { supabase } from '../../utils/supabase';

// The 6 exercises this journal can track a score for.
type ExerciseKey = 'curl_ups' | 'plank' | 'mile_run' | 'beep_test' | 'push_ups' | 'pull_ups';

// A large, hand-entered lookup table of official Presidential Youth
// Fitness Program-style benchmark targets, organized as:
//   FITNESS_BENCHMARKS[gender][age][exercise] = { target, unit, display }
// - `target` is the raw numeric threshold used for pass/fail comparison in
//   code (e.g. handleCommitLogEntry below compares a student's score
//   against this number).
// - `unit` is the raw unit label (reps / seconds / laps) matching `target`.
// - `display` is a pre-formatted, human-friendly string shown directly in
//   the UI (e.g. "10:15 or faster" for the mile run, which converts the
//   raw `target` seconds value into minutes:seconds for readability).
// This is a big static data table rather than something computed — each
// individual number is a specific published fitness standard for that
// age/gender/exercise combination (ages 6 through 17, split into BOYS and
// GIRLS brackets), not a value meant to be tuned for looks — so unlike the
// UI style numbers elsewhere in this app, these specific numbers are
// external benchmark data rather than design decisions.
// Type annotation: for each of the two genders, a mapping from age (a
// number key) to a mapping from ExerciseKey to the {target, unit, display}
// shape.
const FITNESS_BENCHMARKS: Record<'BOYS' | 'GIRLS', Record<number, Record<ExerciseKey, { target: number; unit: string; display: string }>>> = {
    BOYS: {
        6: { curl_ups: { target: 33, unit: 'reps', display: '33 reps in 1 min' }, plank: { target: 73, unit: 'seconds', display: '73 seconds' }, mile_run: { target: 615, unit: 'seconds', display: '10:15 or faster' }, beep_test: { target: 27, unit: 'laps', display: '27 laps' }, push_ups: { target: 9, unit: 'reps', display: '9 reps' }, pull_ups: { target: 2, unit: 'reps', display: '2 reps' } },
        7: { curl_ups: { target: 36, unit: 'reps', display: '36 reps in 1 min' }, plank: { target: 90, unit: 'seconds', display: '90 seconds' }, mile_run: { target: 562, unit: 'seconds', display: '9:22 or faster' }, beep_test: { target: 32, unit: 'laps', display: '32 laps' }, push_ups: { target: 14, unit: 'reps', display: '14 reps' }, pull_ups: { target: 4, unit: 'reps', display: '4 reps' } },
        8: { curl_ups: { target: 40, unit: 'reps', display: '40 reps in 1 min' }, plank: { target: 95, unit: 'seconds', display: '95 seconds' }, mile_run: { target: 528, unit: 'seconds', display: '8:48 or faster' }, beep_test: { target: 39, unit: 'laps', display: '39 laps' }, push_ups: { target: 17, unit: 'reps', display: '17 reps' }, pull_ups: { target: 5, unit: 'reps', display: '5 reps' } },
        9: { curl_ups: { target: 41, unit: 'reps', display: '41 reps in 1 min' }, plank: { target: 109, unit: 'seconds', display: '109 seconds' }, mile_run: { target: 511, unit: 'seconds', display: '8:31 or faster' }, beep_test: { target: 47, unit: 'laps', display: '47 laps' }, push_ups: { target: 18, unit: 'reps', display: '18 reps' }, pull_ups: { target: 5, unit: 'reps', display: '5 reps' } },
        10: { curl_ups: { target: 45, unit: 'reps', display: '45 reps in 1 min' }, plank: { target: 119, unit: 'seconds', display: '119 seconds' }, mile_run: { target: 477, unit: 'seconds', display: '7:57 or faster' }, beep_test: { target: 55, unit: 'laps', display: '55 laps' }, push_ups: { target: 22, unit: 'reps', display: '22 reps' }, pull_ups: { target: 6, unit: 'reps', display: '6 reps' } },
        11: { curl_ups: { target: 47, unit: 'reps', display: '47 reps in 1 min' }, plank: { target: 119, unit: 'seconds', display: '119 seconds' }, mile_run: { target: 452, unit: 'seconds', display: '7:32 or faster' }, beep_test: { target: 60, unit: 'laps', display: '60 laps' }, push_ups: { target: 27, unit: 'reps', display: '27 reps' }, pull_ups: { target: 6, unit: 'reps', display: '6 reps' } },
        12: { curl_ups: { target: 50, unit: 'reps', display: '50 reps in 1 min' }, plank: { target: 127, unit: 'seconds', display: '127 seconds' }, mile_run: { target: 431, unit: 'seconds', display: '7:11 or faster' }, beep_test: { target: 65, unit: 'laps', display: '65 laps' }, push_ups: { target: 31, unit: 'reps', display: '31 reps' }, pull_ups: { target: 7, unit: 'reps', display: '7 reps' } },
        13: { curl_ups: { target: 53, unit: 'reps', display: '53 reps in 1 min' }, plank: { target: 134, unit: 'seconds', display: '134 seconds' }, mile_run: { target: 410, unit: 'seconds', display: '6:50 or faster' }, beep_test: { target: 70, unit: 'laps', display: '70 laps' }, push_ups: { target: 39, unit: 'reps', display: '39 reps' }, pull_ups: { target: 7, unit: 'reps', display: '7 reps' } },
        14: { curl_ups: { target: 56, unit: 'reps', display: '56 reps in 1 min' }, plank: { target: 134, unit: 'seconds', display: '134 seconds' }, mile_run: { target: 386, unit: 'seconds', display: '6:26 or faster' }, beep_test: { target: 75, unit: 'laps', display: '75 laps' }, push_ups: { target: 40, unit: 'reps', display: '40 reps' }, pull_ups: { target: 10, unit: 'reps', display: '10 reps' } },
        15: { curl_ups: { target: 57, unit: 'reps', display: '57 reps in 1 min' }, plank: { target: 156, unit: 'seconds', display: '156 seconds' }, mile_run: { target: 380, unit: 'seconds', display: '6:20 or faster' }, beep_test: { target: 81, unit: 'laps', display: '81 laps' }, push_ups: { target: 42, unit: 'reps', display: '42 reps' }, pull_ups: { target: 11, unit: 'reps', display: '11 reps' } },
        16: { curl_ups: { target: 57, unit: 'reps', display: '57 reps in 1 min' }, plank: { target: 156, unit: 'seconds', display: '156 seconds' }, mile_run: { target: 368, unit: 'seconds', display: '6:08 or faster' }, beep_test: { target: 84, unit: 'laps', display: '84 laps' }, push_ups: { target: 44, unit: 'reps', display: '44 reps' }, pull_ups: { target: 11, unit: 'reps', display: '11 reps' } },
        17: { curl_ups: { target: 57, unit: 'reps', display: '57 reps in 1 min' }, plank: { target: 156, unit: 'seconds', display: '156 seconds' }, mile_run: { target: 366, unit: 'seconds', display: '6:06 or faster' }, beep_test: { target: 84, unit: 'laps', display: '84 laps' }, push_ups: { target: 53, unit: 'reps', display: '53 reps' }, pull_ups: { target: 13, unit: 'reps', display: '13 reps' } }
    },
    GIRLS: {
        6: { curl_ups: { target: 32, unit: 'reps', display: '32 reps in 1 min' }, plank: { target: 71, unit: 'seconds', display: '71 seconds' }, mile_run: { target: 680, unit: 'seconds', display: '11:20 or faster' }, beep_test: { target: 22, unit: 'laps', display: '22 laps' }, push_ups: { target: 9, unit: 'reps', display: '9 reps' }, pull_ups: { target: 2, unit: 'reps', display: '2 reps' } },
        7: { curl_ups: { target: 34, unit: 'reps', display: '34 reps in 1 min' }, plank: { target: 92, unit: 'seconds', display: '92 seconds' }, mile_run: { target: 636, unit: 'seconds', display: '10:36 or faster' }, beep_test: { target: 25, unit: 'laps', display: '25 laps' }, push_ups: { target: 14, unit: 'reps', display: '14 reps' }, pull_ups: { target: 2, unit: 'reps', display: '2 reps' } },
        8: { curl_ups: { target: 38, unit: 'reps', display: '38 reps in 1 min' }, plank: { target: 92, unit: 'seconds', display: '92 seconds' }, mile_run: { target: 602, unit: 'seconds', display: '10:02 or faster' }, beep_test: { target: 29, unit: 'laps', display: '29 laps' }, push_ups: { target: 17, unit: 'reps', display: '17 reps' }, pull_ups: { target: 2, unit: 'reps', display: '2 reps' } },
        9: { curl_ups: { target: 39, unit: 'reps', display: '39 reps in 1 min' }, plank: { target: 105, unit: 'seconds', display: '105 seconds' }, mile_run: { target: 570, unit: 'seconds', display: '9:30 or faster' }, beep_test: { target: 35, unit: 'laps', display: '35 laps' }, push_ups: { target: 18, unit: 'reps', display: '18 reps' }, pull_ups: { target: 2, unit: 'reps', display: '2 reps' } },
        10: { curl_ups: { target: 40, unit: 'reps', display: '40 reps in 1 min' }, plank: { target: 105, unit: 'seconds', display: '105 seconds' }, mile_run: { target: 559, unit: 'seconds', display: '9:19 or faster' }, beep_test: { target: 41, unit: 'laps', display: '41 laps' }, push_ups: { target: 20, unit: 'reps', display: '20 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } },
        11: { curl_ups: { target: 42, unit: 'reps', display: '42 reps in 1 min' }, plank: { target: 105, unit: 'seconds', display: '105 seconds' }, mile_run: { target: 542, unit: 'seconds', display: '9:02 or faster' }, beep_test: { target: 46, unit: 'laps', display: '46 laps' }, push_ups: { target: 20, unit: 'reps', display: '20 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } },
        12: { curl_ups: { target: 45, unit: 'reps', display: '45 reps in 1 min' }, plank: { target: 127, unit: 'seconds', display: '127 seconds' }, mile_run: { target: 503, unit: 'seconds', display: '8:23 or faster' }, beep_test: { target: 49, unit: 'laps', display: '49 laps' }, push_ups: { target: 21, unit: 'reps', display: '21 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } },
        13: { curl_ups: { target: 46, unit: 'reps', display: '46 reps in 1 min' }, plank: { target: 127, unit: 'seconds', display: '127 seconds' }, mile_run: { target: 493, unit: 'seconds', display: '8:13 or faster' }, beep_test: { target: 50, unit: 'laps', display: '50 laps' }, push_ups: { target: 21, unit: 'reps', display: '21 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } },
        14: { curl_ups: { target: 47, unit: 'reps', display: '47 reps in 1 min' }, plank: { target: 134, unit: 'seconds', display: '134 seconds' }, mile_run: { target: 479, unit: 'seconds', display: '7:59 or faster' }, beep_test: { target: 50, unit: 'laps', display: '50 laps' }, push_ups: { target: 21, unit: 'reps', display: '21 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } },
        15: { curl_ups: { target: 48, unit: 'reps', display: '48 reps in 1 min' }, plank: { target: 145, unit: 'seconds', display: '145 seconds' }, mile_run: { target: 479, unit: 'seconds', display: '7:59 or faster' }, beep_test: { target: 50, unit: 'laps', display: '50 laps' }, push_ups: { target: 21, unit: 'reps', display: '21 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } },
        16: { curl_ups: { target: 48, unit: 'reps', display: '48 reps in 1 min' }, plank: { target: 145, unit: 'seconds', display: '145 seconds' }, mile_run: { target: 479, unit: 'seconds', display: '7:59 or faster' }, beep_test: { target: 50, unit: 'laps', display: '50 laps' }, push_ups: { target: 24, unit: 'reps', display: '24 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } },
        17: { curl_ups: { target: 48, unit: 'reps', display: '48 reps in 1 min' }, plank: { target: 145, unit: 'seconds', display: '145 seconds' }, mile_run: { target: 479, unit: 'seconds', display: '7:59 or faster' }, beep_test: { target: 50, unit: 'laps', display: '50 laps' }, push_ups: { target: 25, unit: 'reps', display: '25 reps' }, pull_ups: { target: 3, unit: 'reps', display: '3 reps' } }
    }
};

// The 6 selectable exercises shown in the dropdown, each with an emoji +
// label combination for a friendlier look than plain text.
const EXERCISE_OPTIONS: { key: ExerciseKey; label: string }[] = [
    { key: 'curl_ups', label: 'Curl-Ups (1 Minute)' },
    { key: 'plank', label: 'Plank Hold' },
    { key: 'mile_run', label: 'One Mile Run' },
    { key: 'beep_test', label: '20m Beep Test' },
    { key: 'push_ups', label: 'Right-Angle Push-Ups' },
    { key: 'pull_ups', label: 'Pull-Ups' }
];

export default function AdvancedStudentJournal() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    // Pull just the refresh function out of the badge-unlock context, so
    // this screen can trigger a badge check after successfully logging
    // an activity.
    const { refreshBadgeInbox } = useBadgeUnlocks();

    // Core profile hooks
    const [loading, setLoading] = useState(true);
    // The student's age (used to look up the right row in
    // FITNESS_BENCHMARKS). Defaults to 10 until the real profile loads.
    const [age, setAge] = useState<number>(10);
    // Which fitness bracket (BOYS/GIRLS) to use for benchmark lookups.
    const [group, setGroup] = useState<'BOYS' | 'GIRLS'>('BOYS');

    // Setup configuration editing toggles
    // Whether the inline age/gender editor panel is expanded.
    const [showProfileEditor, setShowProfileEditor] = useState(false);

    // Section Toggles
    // Whether the "log a walking activity" section is expanded/enabled.
    // Defaults to true since walking is the app's core activity.
    const [enableWalking, setEnableWalking] = useState(true);
    // Whether the "log an exercise score" section is expanded/enabled.
    // Defaults to false since it's optional/secondary.
    const [enableExercise, setEnableExercise] = useState(false);
    const [activityModalOpen, setActivityModalOpen] = useState(false);
    const [scoreModalOpen, setScoreModalOpen] = useState(false);
    // Which trail the student currently has "active" (selected on the
    // dashboard) — required before miles can be attributed to a specific
    // trail's progress.
    const [activeTrailId, setActiveTrailId] = useState<string | null>(null);

    // Form states
    // The shape of a single logged walking activity, captured from the
    // ActivityLogModal.
    type ActivityLogEntry = { activityType: ActivityKey; amount: number; unit: InputUnit; miles: number };
    const [activityLog, setActivityLog] = useState<ActivityLogEntry | null>(null);
    // Remembers the most recently used activity type (e.g. "walking",
    // "running") so the next time the modal opens, it can default to
    // whatever the student picked last time rather than always resetting.
    const [lastActivityType, setLastActivityType] = useState<ActivityKey>('walking');
    const [selectedExercise, setSelectedExercise] = useState<ExerciseKey>('curl_ups');
    const [showDropdown, setShowDropdown] = useState(false);
    // Kept as a string (matches what the NumericEntryModal returns after
    // .toString()) even though it represents a number, then parsed with
    // parseInt() only when actually needed for comparisons/saving.
    const [inputScore, setInputScore] = useState('');
    const [reflection, setReflection] = useState('');
    const [submitting, setSubmitting] = useState(false);
    // A ref to the outer ScrollView, used to programmatically scroll to
    // the bottom when the reflection text field is focused (so the
    // keyboard doesn't cover it) — see onFocus on the TextInput below.
    const scrollRef = useRef<ScrollView>(null);

    // Dynamic Target Engine Calculations
    // Look up this student's benchmark target for their current
    // group/age/exercise combination. `FITNESS_BENCHMARKS[group]?.[age]`
    // uses optional chaining in case `age` somehow falls outside the
    // table's 6-17 range; if so, it falls back to the age-10 row as a
    // reasonable default rather than crashing on `undefined`.
    const targetConfig = FITNESS_BENCHMARKS[group]?.[age]?.[selectedExercise] ||
        FITNESS_BENCHMARKS[group]?.[10]?.[selectedExercise];

    // useFocusEffect (not a plain mount-only useEffect) because expo-router
    // keeps this tab mounted in the background when you switch tabs -- a
    // plain useEffect(..., []) only ever read activeTrailId once, when this
    // screen first mounted. Switching the active trail on the Dashboard
    // tab afterward never updated it here, so an activity logged from this
    // screen could silently get attributed to whatever trail was active
    // the LAST time this tab mounted, not the one just switched to.
    useFocusEffect(
        useCallback(() => {
            void loadProfileContext();
        }, [])
    );

    async function loadProfileContext() {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('profiles')
                .select('birth_date, award_group, active_trail_id')
                .eq('id', user.id)
                .single();

            if (data) {
                if (data.award_group) setGroup(data.award_group as 'BOYS' | 'GIRLS');
                setActiveTrailId(data.active_trail_id || null);
                if (data.birth_date) {
                    // Compute the student's current age from their stored
                    // birth date. This is a SIMPLE year-difference
                    // calculation (not accounting for whether their exact
                    // birthday has passed yet this year), so it can be off
                    // by up to 1 year in some cases — a reasonable
                    // approximation for picking a benchmark bracket rather
                    // than a precise age calculation.
                    const computedAge = new Date().getFullYear() - new Date(data.birth_date).getFullYear();
                    // Clamp the computed age into the benchmark table's
                    // valid 6–17 range: cap anything 17 or older at
                    // exactly 17 (the table's oldest bracket), and floor
                    // anything younger than 6 up to 6 (the table's
                    // youngest bracket), via Math.max(6, ...).
                    setAge(computedAge >= 17 ? 17 : Math.max(6, computedAge));
                }
            }
        } catch {
            console.log("Using safe local fallback metrics context.");
        } finally {
            setLoading(false);
        }
    }

    // Persist changes to Supabase profiles when editing age or bracket group values manually
    const saveProfileUpdate = async (newAge: number, newGroup: 'BOYS' | 'GIRLS') => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Compute a placeholder timestamp birth date matching the picked target age scale
            // Since the app only stores a real birth_date (not a separate
            // "age" column), manually picking an age here works backward
            // to fabricate a plausible birth date (Jan 1st of the
            // appropriate year) that would compute back to roughly that
            // age using the same calculation as loadProfileContext above.
            const syntheticBirthYear = new Date().getFullYear() - newAge;
            const birthDateStr = `${syntheticBirthYear}-01-01`;

            const { error } = await supabase
                .from('profiles')
                .update({
                    award_group: newGroup,
                    birth_date: birthDateStr
                })
                .eq('id', user.id);

            if (error) throw error;
        } catch (err: any) {
            console.log("Profile state storage failure: ", err.message);
        }
    };

    // Callback passed into ActivityLogModal — receives the completed
    // activity entry once the student finishes filling out that modal.
    const handleActivityLogged = async (result: ActivityLogEntry) => {
        setActivityLog(result);
        setLastActivityType(result.activityType);
    };

    // Callback passed into NumericEntryModal for the exercise score.
    const handleExerciseScoreLogged = async (score: number) => {
        setInputScore(score.toString());
    };

    // The main "Commit Log Entry" submit handler — validates whichever
    // sections are enabled, then writes one row to the activity_journal
    // table (and separately updates the student's trail mileage progress
    // if walking was logged).
    const handleCommitLogEntry = async () => {
        const miles = activityLog?.miles ?? 0;
        // parseInt(inputScore) converts the score string to an integer;
        // `|| 0` falls back to 0 if inputScore is empty or not a valid
        // number (parseInt would return NaN, and `NaN || 0` evaluates to 0).
        const score = parseInt(inputScore) || 0;

        // Validation: if the walking section is toggled on, an activity
        // MUST actually have been logged via the modal.
        if (enableWalking && !activityLog) {
            showAlert("Activity Enabled", "Please log an activity or untoggle the activity field.");
            return;
        }
        // Similarly, if exercise tracking is on, a score must be entered.
        if (enableExercise && !inputScore) {
            showAlert("Exercise Enabled", "Please enter your exercise results or untoggle the evaluation field.");
            return;
        }
        // If NEITHER section is enabled, there must at least be some
        // reflection text — otherwise there's nothing meaningful to save
        // at all.
        if (!enableWalking && !enableExercise && !reflection.trim()) {
            showAlert("Empty Document", "Please select at least one item type or write a thought to save.");
            return;
        }
        // Logging actual miles requires an active trail to attribute
        // them to — without one, there's nowhere to apply the mileage
        // progress.
        if (enableWalking && miles > 0 && !activeTrailId) {
            showAlert('No Active Trail', 'Pick a trail in the dashboard before logging miles here.');
            return;
        }

        // Sanity-check unusually large entries BEFORE they ever reach the
        // database. exercise_score/miles_walked are numeric columns with
        // limited precision -- a fat-fingered extra digit (e.g. "5000"
        // curl-ups typed instead of "50") used to sail past every check
        // above and get rejected by Postgres itself with a raw "numeric
        // field overflow" error, which surfaced to the student as a
        // confusing hard failure with no way to just confirm "yes, I
        // really did mean that many" and continue. Comparing the score
        // against the exercise's own benchmark target (already available
        // here) gives a per-exercise-appropriate threshold instead of one
        // arbitrary number that would be too strict for some exercises and
        // too loose for others.
        const scoreLooksImplausible = enableExercise && score > 0 && targetConfig.target > 0 && score > targetConfig.target * 10;
        const milesLookImplausible = enableWalking && miles > 100;

        if (scoreLooksImplausible || milesLookImplausible) {
            confirmAlert(
                'Double-Check This Entry',
                scoreLooksImplausible
                    ? `${score} ${targetConfig.unit} is far above the usual target of ${targetConfig.target}. Are you sure that's correct?`
                    : `Logging ${miles.toFixed(1)} miles in one entry is unusually high. Are you sure that's correct?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: "Yes, It's Correct", onPress: () => void proceedWithSubmit() },
                ]
            );
            return;
        }

        await proceedWithSubmit();
    };

    const proceedWithSubmit = async () => {
        const miles = activityLog?.miles ?? 0;
        const score = parseInt(inputScore) || 0;

        try {
            setSubmitting(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const trailId = activeTrailId;

            // Determine whether the student's exercise score actually met
            // the benchmark target. Special-cased for mile_run: a FASTER
            // time (lower number of seconds) is better, so passing means
            // scoring LESS THAN OR EQUAL TO the target — the opposite
            // comparison from every other exercise, where a HIGHER number
            // (more reps/laps/seconds held) is better.
            let passedTarget = false;
            if (enableExercise && score > 0) {
                passedTarget = selectedExercise === 'mile_run'
                    ? score <= targetConfig.target
                    : score >= targetConfig.target;
            }

            const { error } = await supabase
                .from('activity_journal')
                .insert({
                    student_id: user.id,
                    // Every field below is conditionally saved based on
                    // whether its corresponding section was actually
                    // enabled — e.g. if walking is toggled off,
                    // miles_walked is explicitly 0 and activity_type is
                    // null, rather than leaving stale data from a
                    // previous, unrelated activityLog value.
                    miles_walked: enableWalking ? miles : 0,
                    activity_type: enableWalking ? activityLog!.activityType : null,
                    input_amount: enableWalking ? activityLog!.amount : null,
                    input_unit: enableWalking ? activityLog!.unit : null,
                    exercise_logged: enableExercise ? selectedExercise : 'none',
                    exercise_score: enableExercise ? score : 0,
                    journal_reflection: reflection.trim() || null,
                    is_target_met: enableExercise ? passedTarget : false
                });

            if (error) throw error;

            // logMilesActivity is a SEPARATE call (lib/activity.ts) from
            // the activity_journal insert above — this presumably updates
            // the student's cumulative trail-progress totals (used
            // elsewhere in the app, like the dashboard and leaderboard),
            // distinct from the raw journal entry which is just a log/
            // history record.
            if (enableWalking && miles > 0) {
                await logMilesActivity({
                    userId: user.id,
                    miles,
                    trailId: trailId!,
                    activityType: activityLog!.activityType,
                    inputAmount: activityLog!.amount,
                    inputUnit: activityLog!.unit,
                });
            }

            // Check whether this newly logged activity unlocked any new
            // badges, so the app-wide badge popup can show if so.
            await refreshBadgeInbox();
            // Reset the form back to a blank state after a successful save.
            setActivityLog(null);
            setInputScore('');
            setReflection('');
        } catch (err: any) {
            // A raw Postgres "numeric field overflow" is exactly the kind
            // of confusing database-speak error a student shouldn't see --
            // the threshold check before this function runs already
            // catches the common case, but this is a friendlier fallback
            // for anything that slips past it.
            const isOverflow = typeof err?.message === 'string' && /overflow|out of range/i.test(err.message);
            showAlert(
                "Log Failure",
                isOverflow
                    ? "One of the numbers you entered is too large to save. Please double-check it and try again."
                    : err.message
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                ref={scrollRef}
                style={styles.container}
                contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
                keyboardShouldPersistTaps="handled"
                // Lets React Native automatically add extra bottom
                // padding/insets to account for the keyboard's height when
                // it's open, on top of whatever KeyboardAvoidingView is
                // already doing.
                automaticallyAdjustKeyboardInsets
            >

                {/* Custom Profile Banner Display - Clickable to open configuration interface */}
                <Pressable
                    style={[styles.profileBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => setShowProfileEditor(!showProfileEditor)}
                    accessibilityRole="button"
                    accessibilityLabel={`${age === 17 ? 'Age group 17+' : `Age group ${age} years old`}, ${group === 'BOYS' ? 'Boys' : 'Girls'}. Tap to change.`}
                    // Paired with aria-expanded -- see the comment on
                    // WebNav.tsx's hamburger toggle for why both are needed.
                    accessibilityState={{ expanded: showProfileEditor }}
                    aria-expanded={showProfileEditor}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={styles.bannerKicker}>YOUR PROFILE (TAP TO CHANGE)</Text>
                        <Text style={[styles.bannerMainText, { color: theme.text }]}>
                            {/* Age 17 is treated as an open-ended "17+"
                                bracket (matching how the benchmark table's
                                oldest row works) rather than showing a
                                literal "17 Years Old". */}
                            {age === 17 ? "Age Group: 17+" : `Age Group: ${age} Years Old`} · {group === 'BOYS' ? "Boys" : "Girls"}
                        </Text>
                    </View>
                    <Ionicons name={showProfileEditor ? "close-circle" : "create-outline"} size={22} color={theme.accent} />
                </Pressable>

                {/* EXPANDABLE IN-SCREEN SELECTOR FOR AGE AND GENDER COHORTS */}
                {showProfileEditor && (
                    <View style={[styles.inlineEditorContainer, { backgroundColor: theme.surface, borderColor: theme.accent }]}>
                        <Text style={styles.fieldTitle}>CHOOSE YOUR GROUP</Text>
                        <View style={styles.genderRowContainer}>
                            <Pressable
                                style={[styles.bracketSelectorButton, group === 'BOYS' ? { backgroundColor: theme.accent } : { backgroundColor: theme.background }]}
                                onPress={() => {
                                    setGroup('BOYS');
                                    // Save immediately on tap — there's no
                                    // separate "Save" button for this
                                    // editor; each choice persists right
                                    // away.
                                    void saveProfileUpdate(age, 'BOYS');
                                }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: group === 'BOYS' }}
                                aria-selected={group === 'BOYS'}
                            >
                                <Text style={[styles.bracketButtonText, group === 'BOYS' ? { color: '#FFF' } : { color: theme.text }]}>BOYS</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.bracketSelectorButton, group === 'GIRLS' ? { backgroundColor: theme.accent } : { backgroundColor: theme.background }]}
                                onPress={() => {
                                    setGroup('GIRLS');
                                    void saveProfileUpdate(age, 'GIRLS');
                                }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: group === 'GIRLS' }}
                                aria-selected={group === 'GIRLS'}
                            >
                                <Text style={[styles.bracketButtonText, group === 'GIRLS' ? { color: '#FFF' } : { color: theme.text }]}>GIRLS</Text>
                            </Pressable>
                        </View>

                        <Text style={[styles.fieldTitle, { marginTop: 12 }]}>YOUR AGE ({age} YRS OLD)</Text>
                        {/* A horizontally scrolling row of age pills, one
                            per age 6 through 17, written as a plain inline
                            array literal since it's only used here. */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageSliderContainer}>
                            {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((num) => (
                                <Pressable
                                    key={num}
                                    style={[styles.agePill, age === num ? { backgroundColor: theme.accent } : { backgroundColor: theme.background }]}
                                    onPress={() => {
                                        setAge(num);
                                        void saveProfileUpdate(num, group);
                                    }}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: age === num }}
                                    aria-selected={age === num}
                                    accessibilityLabel={num === 17 ? '17 or older' : `${num} years old`}
                                >
                                    <Text style={[styles.agePillText, age === num ? { color: '#FFF', fontWeight: '800' } : { color: theme.text }]}>
                                        {num === 17 ? '17+' : num}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Main Activity Card Form */}
                <View style={[styles.journalSurface, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.surfaceTitle, { color: theme.text }]} accessibilityRole="header">Today&apos;s Trail Journal</Text>
                    <Text style={styles.surfaceSubtitle}>Log a walk, add an exercise if you did one, and jot a note about your day.</Text>

                    {/* FIELD BLOCK 1: ACTIVITY MANAGEMENT */}
                    {/* Tapping this whole row toggles enableWalking, rather
                        than needing a separate dedicated checkbox tap
                        target — the checkbox icon on the right is purely
                        visual feedback for the row's current state. */}
                    <Pressable
                        style={[styles.toggleSelectorRow, { borderColor: theme.border }]}
                        onPress={() => setEnableWalking(!enableWalking)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: enableWalking }}
                        aria-checked={enableWalking}
                    >
                        <View style={styles.rowTitleArea}>
                            <Ionicons name="flame" size={18} color={enableWalking ? theme.accent : theme.subtext} />
                            <Text style={[styles.toggleLabel, { color: theme.text }]}>Log a Walk</Text>
                        </View>
                        <Ionicons
                            name={enableWalking ? "checkbox" : "square-outline"}
                            size={22}
                            color={enableWalking ? theme.accent : theme.subtext}
                        />
                    </Pressable>

                    {enableWalking && (
                        <View style={styles.inputBoxInterior}>
                            <Text style={styles.fieldTitle}>TRAIL MILES LOGGED</Text>
                            <TourTarget id="student.mileageButton">
                                <Pressable
                                    style={[styles.mileageLaunchButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                                    onPress={() => setActivityModalOpen(true)}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.mileageLaunchButtonText, { color: theme.text }]}>
                                        {/* If an activity has already been
                                            logged this session, show a summary
                                            of it right on the button (e.g.
                                            "2.3 mi · 30 min walking") instead
                                            of a generic prompt. */}
                                        {activityLog
                                            ? `${formatMilesShort(activityLog.miles)} mi · ${formatActivitySummary(activityLog.activityType, activityLog.amount, activityLog.unit)}`
                                            : 'Log Activity'}
                                    </Text>
                                    <Ionicons name="create-outline" size={16} color={theme.subtext} />
                                </Pressable>
                            </TourTarget>
                        </View>
                    )}

                    {/* FIELD BLOCK 2: PRESIDENTIAL EXERCISES */}
                    <TourTarget id="student.exerciseToggle">
                        <Pressable
                            style={[styles.toggleSelectorRow, { borderColor: theme.border, marginTop: 14 }]}
                            onPress={() => setEnableExercise(!enableExercise)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: enableExercise }}
                            aria-checked={enableExercise}
                        >
                            <View style={styles.rowTitleArea}>
                                <Ionicons name="fitness" size={18} color={enableExercise ? theme.accent : theme.subtext} />
                                <Text style={[styles.toggleLabel, { color: theme.text }]}>Log a Challenge Exercise</Text>
                            </View>
                            <Ionicons
                                name={enableExercise ? "checkbox" : "square-outline"}
                                size={22}
                                color={enableExercise ? theme.accent : theme.subtext}
                            />
                        </Pressable>
                    </TourTarget>

                    {enableExercise && (
                        <View style={styles.inputBoxInterior}>
                            <Text style={styles.fieldTitle}>CHOOSE YOUR EXERCISE</Text>
                            <Pressable
                                style={[styles.dropdownButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                                onPress={() => setShowDropdown(!showDropdown)}
                                accessibilityRole="button"
                                accessibilityState={{ expanded: showDropdown }}
                                aria-expanded={showDropdown}
                            >
                                <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>
                                    {/* .find() locates the option object
                                        matching the currently selected
                                        exercise key, then reads its label
                                        for display. */}
                                    {EXERCISE_OPTIONS.find(o => o.key === selectedExercise)?.label}
                                </Text>
                                <Ionicons name={showDropdown ? "chevron-up" : "chevron-down"} size={16} color={theme.subtext} />
                            </Pressable>

                            {/* A custom hand-built dropdown menu (React
                                Native has no native <select> element) — a
                                floating list of options that appears
                                directly below the button when opened. */}
                            {showDropdown && (
                                <View style={[styles.dropdownOverlay, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    {EXERCISE_OPTIONS.map((opt) => (
                                        <Pressable
                                            key={opt.key}
                                            style={[styles.dropdownRow, selectedExercise === opt.key && { backgroundColor: theme.background }]}
                                            onPress={() => {
                                                setSelectedExercise(opt.key);
                                                // Clear any previously
                                                // entered score -- without
                                                // this, switching exercises
                                                // (e.g. push-ups -> mile
                                                // run) kept the old numeric
                                                // value on screen, now
                                                // mislabeled under the new
                                                // exercise's units, and
                                                // submitting it wrote that
                                                // stale number against the
                                                // wrong benchmark. Found by
                                                // an /impeccable audit.
                                                setInputScore('');
                                                // Selecting an option
                                                // immediately closes the
                                                // dropdown, like a native
                                                // picker would.
                                                setShowDropdown(false);
                                            }}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected: selectedExercise === opt.key }}
                                            aria-selected={selectedExercise === opt.key}
                                        >
                                            <Text style={{ color: theme.text, fontSize: 14, fontWeight: selectedExercise === opt.key ? '700' : '500' }}>
                                                {opt.label}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}

                            <Text style={[styles.fieldTitle, { marginTop: 12 }]}>
                                YOUR SCORE ({targetConfig.unit.toUpperCase()})
                            </Text>
                            <Pressable
                                style={[styles.mileageLaunchButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                                onPress={() => setScoreModalOpen(true)}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.mileageLaunchButtonText, { color: theme.text }]}>
                                    {inputScore ? `${inputScore} ${targetConfig.unit}` : 'Enter Score'}
                                </Text>
                                <Ionicons name="create-outline" size={16} color={theme.subtext} />
                            </Pressable>
                            {/* Shows the student exactly what target
                                they're aiming for, pulled straight from
                                the FITNESS_BENCHMARKS table's
                                human-readable `display` string. */}
                            <Text style={[styles.helperText, { color: theme.accent }]}>
                                🎯 Target: {targetConfig.display}
                            </Text>
                        </View>
                    )}

                    {/* OPTIONAL FIELD BLOCK 3: JOURNAL REFLECTIONS */}
                    <Text style={[styles.fieldTitle, { marginTop: 18 }]}>TODAY&apos;S NOTES (OPTIONAL)</Text>
                    <TextInput
                        style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                        placeholder="Write anything about your day's journey, route notes, or wellness state..."
                        placeholderTextColor={theme.subtext}
                        multiline
                        numberOfLines={3}
                        value={reflection}
                        onChangeText={setReflection}
                        // When the user taps into this field (near the
                        // bottom of the form), scroll the page all the way
                        // down so the field stays visible above the
                        // keyboard rather than being covered by it.
                        onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    />

                    <Pressable
                        style={[styles.actionSubmit, { backgroundColor: theme.accent }]}
                        onPress={() => void handleCommitLogEntry()}
                        disabled={submitting}
                        accessibilityRole="button"
                    >
                        {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.actionSubmitText}>Save Today&apos;s Log</Text>}
                    </Pressable>
                </View>
            </ScrollView>
            <ActivityLogModal
                visible={activityModalOpen}
                onClose={() => setActivityModalOpen(false)}
                onSubmit={handleActivityLogged}
                accentColor={theme.accent}
                title="Log Activity"
                initialActivity={lastActivityType}
            />
            <NumericEntryModal
                visible={scoreModalOpen}
                onClose={() => setScoreModalOpen(false)}
                onSubmit={handleExerciseScoreLogged}
                accentColor={theme.accent}
                title={selectedExercise === 'mile_run' ? 'Enter Your Mile Time' : 'Enter Challenge Score'}
                suffix={targetConfig.unit}
                mode={selectedExercise === 'mile_run' ? 'minuteSeconds' : 'number'}
            />
        </KeyboardAvoidingView>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1 },
    profileBanner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
    bannerKicker: { fontSize: 8, letterSpacing: 0.8, fontWeight: '800', color: theme.subtext, marginBottom: 2 },
    bannerMainText: { fontSize: 13, fontWeight: '700' },

    inlineEditorContainer: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18 },
    genderRowContainer: { flexDirection: 'row', gap: 10, marginTop: 4 },
    // flex: 1 makes the BOYS/GIRLS buttons split the row 50/50.
    bracketSelectorButton: { flex: 1, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border },
    bracketButtonText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    ageSliderContainer: { gap: 8, paddingVertical: 4 },
    // width: 44 / borderRadius: 18 — since 18 is less than half of 44
    // (which would be 22), these pills are ROUNDED but not perfectly
    // circular; they read as capsule/pill shapes since height (36) and
    // width (44) aren't equal either.
    agePill: { width: 44, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border },
    agePillText: { fontSize: 13, fontWeight: '600' },

    journalSurface: { borderWidth: 1, borderRadius: 16, padding: 18 },
    surfaceTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 4 },
    surfaceSubtitle: { fontSize: 13, color: theme.subtext, lineHeight: 18, marginBottom: 16 },

    // A fixed height of 50 (rather than letting padding determine the
    // height naturally) keeps both toggle rows exactly the same size
    // regardless of very minor content differences.
    toggleSelectorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 14, height: 50 },
    rowTitleArea: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    toggleLabel: { fontSize: 14, fontWeight: '700' },

    // paddingLeft: 8 gives the expanded content a slight visual indent
    // relative to the toggle row above it, hinting that it's "nested
    // under" that toggle.
    inputBoxInterior: { marginTop: 10, paddingLeft: 8 },
    fieldTitle: { fontSize: 9, fontWeight: '800', color: theme.subtext, letterSpacing: 0.8, marginBottom: 6 },
    textArea: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },
    helperText: { fontSize: 11, fontWeight: '600', marginTop: 4, paddingLeft: 2 },
    mileageLaunchButton: { borderWidth: 1, borderRadius: 10, minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    // flex: 1 lets this text take up all available space, pushing the
    // pencil icon on the same row all the way to the right edge.
    mileageLaunchButtonText: { fontSize: 14, fontWeight: '600', flex: 1 },

    dropdownButton: { borderWidth: 1, borderRadius: 10, height: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    // overflow: 'hidden' ensures the dropdown's own rounded corners
    // actually clip its row children — without this, a row's square
    // corners could poke out past the container's rounded border.
    dropdownOverlay: { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: 'hidden' },
    dropdownRow: { paddingVertical: 12, paddingHorizontal: 14 },

    actionSubmit: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
    actionSubmitText: { color: '#FFF', fontWeight: '700', fontSize: 15 }
});
