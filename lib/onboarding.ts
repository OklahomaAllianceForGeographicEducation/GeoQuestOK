// lib/onboarding.ts
// Content and storage for the first-run guided tours shown by
// components/OnboardingTour.tsx. One tour per app shell (student, teacher,
// OKAGE, district admin, site admin) — each shell's _layout.tsx mounts the
// tour for its own TourAudience and decides when it's eligible to show
// (see the "active"/"ready" props on OnboardingTour, and each layout's
// existing preview-mode checks).
//
// Each step is either:
//   - a plain welcome/closing card (no `targetKey`) -- a compact floating
//     card with a title, body, and an Ionicons `icon`; or
//   - a spotlight step (`targetKey` set) -- OnboardingTour navigates to
//     `route`, finds the real on-screen control registered under that key
//     (see components/tour/TourTarget.tsx), and dims everything else on
//     screen except it.
//
// To customize wording: edit the `steps` array for the relevant audience
// below. To force a tour to show again after a content change (rather than
// waiting on a user to clear app storage), bump that tour's `version` —
// the seen-state is stored per version, so a version bump makes every
// device treat it as unseen again without touching anyone's other
// progress.

import AsyncStorage from '@react-native-async-storage/async-storage';

// One entry per app shell in lib/access.ts's resolveAppShellPath.
export type TourAudience = 'student' | 'teacher' | 'okage' | 'admin' | 'site_admin';

export type TourStep = {
    title: string;
    body: string;
    // Ionicons glyph name shown on a welcome/closing card (ignored once
    // `targetKey` is set -- a spotlight step points at the real control
    // instead of showing an icon).
    icon?: string;
    // The id a TourTarget somewhere in the app registered itself under
    // (components/tour/TourTarget.tsx). When set, this step spotlights
    // that real control instead of showing a centered card.
    targetKey?: string;
    // expo-router path OnboardingTour navigates to before it tries to find
    // `targetKey` -- needed whenever the target lives on a screen other
    // than whichever one the tour happened to start on.
    route?: string;
};

export type Tour = {
    id: TourAudience;
    version: number;
    steps: TourStep[];
};

export const TOURS: Record<TourAudience, Tour> = {
    student: {
        id: 'student',
        version: 5,
        steps: [
            {
                title: 'Welcome to GeoQuestOK',
                body: "Here's a quick look around before you hit the trail — it only takes a minute.",
                icon: 'walk-outline',
            },
            {
                title: 'Every step counts',
                body: 'Tap here to open your daily log and add today\'s activity.',
                targetKey: 'student.logButton',
                route: '/(tabs)/dashboard',
            },
            {
                title: 'Log your miles',
                body: 'Tap here, then enter how many miles you walked (or another activity, like biking). Submit it below and it moves you down the trail right away.',
                targetKey: 'student.mileageButton',
                route: '/(tabs)/fitness',
            },
            {
                title: 'Log a Presidential Fitness challenge',
                body: 'Tap here to log a Presidential Fitness exercise — push-ups, curl-ups, shuttle run, or the mile run. Pick your exercise and enter your score; we\'ll show you the target for your age and gender right on the screen.',
                targetKey: 'student.exerciseToggle',
                route: '/(tabs)/fitness',
            },
            {
                title: 'Stop and learn',
                body: 'Each landmark here unlocks a short lesson and quiz about that part of Oklahoma. Reach it, read it, ace it.',
                targetKey: 'student.landmarkStrip',
                route: '/(tabs)/dashboard',
            },
            {
                title: 'Keep your Passport',
                body: "Every trail you finish gets stamped in here — your own record of everywhere you've been.",
                targetKey: 'student.passportTab',
                route: '/(tabs)/passport',
            },
            {
                title: "Let's hit the trail",
                body: "That's the whole tour! Log your first mile whenever you're ready.",
                icon: 'checkmark-circle-outline',
            },
        ],
    },
    teacher: {
        id: 'teacher',
        version: 4,
        steps: [
            {
                title: 'Welcome to your classroom',
                body: 'Tap here for Classes — rosters, trail assignments, and each student\'s progress at a glance.',
                targetKey: 'teacher.classesTab',
                route: '/(teacher-tabs)/classes',
            },
            {
                title: 'Create your first class',
                body: 'Tap here to create a class. You\'ll get a join code — hand it to your students and they enroll themselves, no roster upload needed.',
                targetKey: 'teacher.createClassButton',
                route: '/(teacher-tabs)/classes',
            },
            {
                title: 'Assign a trail or a quiz',
                body: 'Curriculum lets you assign standards-aligned trails and quizzes to a whole class in a couple of taps.',
                targetKey: 'teacher.curriculumTab',
                route: '/(teacher-tabs)/curriculum',
            },
            {
                title: 'Pick a trail to assign',
                body: 'Tap a trail here to open its lesson guide, then choose a class and assign that trail\'s quiz questions to it — assign all of them at once, or hand-pick which ones count.',
                targetKey: 'teacher.curriculumTrailCard',
                route: '/(teacher-tabs)/curriculum',
            },
            {
                title: 'Grading happens for you',
                body: 'Reports gives you per-student and whole-class totals with automatic grading — no answer keys to check by hand.',
                targetKey: 'teacher.reportsTab',
                route: '/(teacher-tabs)/reports',
            },
            {
                title: 'Export a grade summary',
                body: 'Tap here any time to turn the class you\'re viewing into a printable/shareable PDF — ready for a parent, an admin, or your own records.',
                targetKey: 'teacher.exportButton',
                route: '/(teacher-tabs)/reports',
            },
            {
                title: "You're set",
                body: "That's the tour. Head to Classes to add your first roster whenever you're ready.",
                icon: 'checkmark-circle-outline',
            },
        ],
    },
    okage: {
        id: 'okage',
        version: 3,
        steps: [
            {
                title: 'Welcome, OKAGE staff',
                body: 'This is your content-editor home — trail descriptions, lesson guides, and quiz questions for the whole program.',
                targetKey: 'okage.homeTab',
                route: '/(okage-tabs)/',
            },
            {
                title: 'Keep content current',
                body: 'Content is where trail write-ups and cross-curricular lesson guides get updated as the curriculum evolves.',
                targetKey: 'okage.contentTab',
                route: '/(okage-tabs)/content',
            },
            {
                title: 'Edit a trail',
                body: 'Tap a trail here to edit its description, its lesson guide, and (per subject) its deeper full lesson plans.',
                targetKey: 'okage.contentTrailCard',
                route: '/(okage-tabs)/content',
            },
            {
                title: 'Write quiz questions',
                body: 'Tap here for Quizzes — add or edit the questions tied to each landmark on a trail.',
                targetKey: 'okage.quizzesTab',
                route: '/(okage-tabs)/quizzes',
            },
            {
                title: 'Pick a trail to edit its quiz',
                body: 'Tap a trail here, then use Add Question to build out the quiz for each of its landmarks.',
                targetKey: 'okage.quizzesTrailChip',
                route: '/(okage-tabs)/quizzes',
            },
            {
                title: 'See the program-wide picture',
                body: 'Reports rolls up activity across every participating school, not just one classroom.',
                targetKey: 'okage.reportsTab',
                route: '/(okage-tabs)/reports',
            },
            {
                title: 'Ready when you are',
                body: "That's the tour. You can preview the Teacher or Student experience any time from your account settings.",
                icon: 'checkmark-circle-outline',
            },
        ],
    },
    admin: {
        id: 'admin',
        version: 3,
        steps: [
            {
                title: 'Welcome, District Admin',
                body: 'Overview gives you district-wide participation and mileage at a glance — no per-student detail, just the big picture.',
                targetKey: 'admin.overviewTab',
                route: '/(admin-tabs)/overview',
            },
            {
                title: 'Drill into a school',
                body: 'Schools breaks the district down school by school, then class by class from there.',
                targetKey: 'admin.schoolsTab',
                route: '/(admin-tabs)/schools',
            },
            {
                title: 'Expand a school',
                body: 'Tap a school here to see its classes — still only ever a class-level aggregate, never a per-student row.',
                targetKey: 'admin.schoolRow',
                route: '/(admin-tabs)/schools',
            },
            {
                title: 'Export for the board',
                body: 'Reports gives you one PDF export covering the whole district, ready to share.',
                targetKey: 'admin.reportsTab',
                route: '/(admin-tabs)/reports',
            },
            {
                title: 'Generate the report',
                body: 'Tap here to turn everything on this page into a printable/shareable PDF — school and class summaries, no student names or ids anywhere in it.',
                targetKey: 'admin.exportButton',
                route: '/(admin-tabs)/reports',
            },
            {
                title: 'Ready when you are',
                body: "That's the tour. Reach out to your OKAGE contact any time you need a hand.",
                icon: 'checkmark-circle-outline',
            },
        ],
    },
    site_admin: {
        id: 'site_admin',
        version: 3,
        steps: [
            {
                title: 'Welcome, Site Admin',
                body: 'My School goes deeper than a district view: per-student miles and Presidential Fitness Test targets met, grouped by class.',
                targetKey: 'site_admin.schoolTab',
                route: '/(site-admin-tabs)/school',
            },
            {
                title: 'Expand a class',
                body: 'Tap a class here to see each of its students’ miles walked and whether they’ve met their Presidential Fitness targets.',
                targetKey: 'site_admin.classRow',
                route: '/(site-admin-tabs)/school',
            },
            {
                title: 'See how your school compares',
                body: 'District shows every other school in your district at the same one-line summary level a teacher sees — your own school’s detail always stays on My School.',
                targetKey: 'site_admin.districtTab',
                route: '/(site-admin-tabs)/district',
            },
            {
                title: 'Ready when you are',
                body: "That's the tour. You can preview the Teacher or Student experience any time from your account settings.",
                icon: 'checkmark-circle-outline',
            },
        ],
    },
};

const STORAGE_PREFIX = 'geoquestok:onboarding';

function storageKey(tourId: TourAudience, version: number): string {
    return `${STORAGE_PREFIX}:${tourId}:v${version}`;
}

// Whether this device has already dismissed (finished or skipped) this
// exact version of this tour. Fails "seen" (not "unseen") on a storage
// error — a broken AsyncStorage read should never make the tour reappear
// on every single app open.
export async function hasSeenTour(tourId: TourAudience, version: number): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(storageKey(tourId, version))) === 'seen';
    } catch {
        return true;
    }
}

export async function markTourSeen(tourId: TourAudience, version: number): Promise<void> {
    try {
        await AsyncStorage.setItem(storageKey(tourId, version), 'seen');
    } catch {
        // Best-effort — if this write fails the tour may show again next
        // launch, which is a minor annoyance, not a broken feature.
    }
}

// Lets a "Replay Tour" button on an account/settings screen (see e.g.
// app/(tabs)/student-account.tsx) re-open the tour that's already mounted
// in that shell's _layout.tsx, without either of them needing a direct
// reference to the other. Doesn't touch the "seen" storage above -- a
// replay is a one-off, explicit request, not a change to first-run state.
type ReplayListener = () => void;
const replayListeners: Record<TourAudience, Set<ReplayListener>> = {
    student: new Set(),
    teacher: new Set(),
    okage: new Set(),
    admin: new Set(),
    site_admin: new Set(),
};

export function requestTourReplay(tourId: TourAudience): void {
    replayListeners[tourId].forEach((listener) => listener());
}

export function onTourReplayRequested(tourId: TourAudience, listener: ReplayListener): () => void {
    replayListeners[tourId].add(listener);
    return () => replayListeners[tourId].delete(listener);
}
