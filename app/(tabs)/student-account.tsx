// app/(tabs)/student-account.tsx
// NOTE: the header comment inside this file says "app/(tabs)/account.tsx",
// but the actual filename (and route) is "student-account.tsx" — matching
// Tabs.Screen name="student-account" in (tabs)/_layout.tsx. Same stale-
// comment pattern as teacher-account.tsx.
// The student's account screen: avatar/profile customizer, an "all
// activity data" log viewer with delete, and a "join & manage classes"
// panel — three separate bottom-sheet modals launched from one main
// button list.

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useColorScheme,
    View,
} from 'react-native';
import { colors, getGlobalStyles, type Theme } from '../../commonStyles';
import AdaptiveBlur from '../../components/AdaptiveBlur';
import Button from '../../components/Button';
import ModalBackdrop from '../../components/ModalBackdrop';
import { signOutAndRedirect } from '../../lib/auth';
import { confirmAlert } from '../../lib/confirmAlert';
import { confirmDeleteAccount } from '../../lib/deleteAccount';
import { requestTourReplay } from '../../lib/onboarding';
import { formatActivitySummary } from '../../lib/activityTypes';
import { ensureProfileRow } from '../../lib/profiles';
import { formatMiles } from '../../lib/trails';
import { supabase } from '../../utils/supabase';
// NATIVE ENGAGEMENT UTILITIES
import { checkIsUsernameAppropriate, hasDisallowedCharacters } from '../../utils/profanity';
// getAnonymousName generates a stable, randomly-assigned placeholder name
// (e.g. "Silent Falcon") derived from a user's id — used to hide a
// student's real username on leaderboards/rosters when a class they're in
// requires anonymity.
import { getAnonymousName } from '../../utils/randomNames';

type Profile = {
    username: string;
    display_name: string;
    avatar_seed: string;
    app_role?: string;
    active_view?: string;
    school_name?: string;
    school_district_name?: string;
    district_id?: string;
    generic_grades_taught?: string;
};

// Raw shape of a row from the "activity_logs" table (miles-walked history,
// distinct from the "activity_journal" table used by fitness.tsx/
// passport.tsx — this app has two separate logging tables for slightly
// different purposes).
type ActivityLogDbRow = {
    id: number;
    miles: number;
    created_at: string;
    trail_id: string;
    activity_type: string | null;
    input_amount: number | null;
    input_unit: string | null;
};

// A minimal trail lookup row, used to translate trail_id → trail name.
type TrailNameDbRow = {
    id: string;
    name: string;
};

// The "cleaned up" version of ActivityLogDbRow used in the UI — camelCase
// field names and a resolved trailName instead of just a raw trailId.
type ActivityRow = {
    id: number;
    miles: number;
    createdAt: string;
    trailId: string;
    trailName: string;
    activityType: string | null;
    inputAmount: number | null;
    inputUnit: string | null;
};

// One row shown in the "Active Memberships" list within the Groups modal.
type MembershipRow = {
    id: number;
    classId: string;
    className: string;
    isAnonymousRequired: boolean; // Tracking safety flags
};

const ART_STYLES = ['bottts', 'lorelei', 'adventurer', 'pixel-art', 'open-peeps', 'personas', 'shapes'];

const BG_COLORS = [
    'ff595e', 'ffca3a', '8ac926', '1982c4', '6a4c93',
    'ff924c', 'f15bb5', '00f5d4', '2b2d42', 'ffffff'
];

// Formats an ISO timestamp string into a friendly display format like
// "Mar 5, 2026, 3:45 PM".
function formatLoggedDate(value: string) {
    const asDate = new Date(value);
    // Number.isNaN(asDate.getTime()) checks whether the Date object failed
    // to parse (an invalid date's getTime() returns NaN) — if parsing
    // failed, just return the original raw string rather than showing
    // something like "Invalid Date" to the user.
    if (Number.isNaN(asDate.getTime())) return value;
    return asDate.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

// Same local style-factory pattern as teacher-account.tsx's
// getAccountStyles, defined separately here since these two account
// screens' edit sheets have diverged slightly (this one adds
// logsScroll/logRow/deleteButton styles for the activity log modal that
// the teacher version doesn't have).
function getAccountStyles(theme: Theme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            justifyContent: 'flex-end',
        },
        dismissDismissibleBackdrop: {
            ...StyleSheet.absoluteFillObject,
        },
        sheet: {
            backgroundColor: theme.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '94%',
            paddingTop: 20,
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        },
        modalTitle: {
            fontFamily: 'Georgia',
            fontSize: 22,
            fontWeight: '700',
            color: theme.text,
        },
        modalDivider: {
            height: 1,
            backgroundColor: theme.border,
            marginVertical: 12,
        },
        label: {
            fontSize: 11,
            fontWeight: '700',
            color: theme.subtext,
            letterSpacing: 1.1,
            marginBottom: 6,
            marginTop: 12,
        },
        input: {
            backgroundColor: theme.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            color: theme.text,
            marginBottom: 4,
        },
        modalActions: {
            flexDirection: 'row',
            gap: 10,
            marginTop: 20,
        },
        actionButton: {
            flex: 1,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cancelButton: {
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
        },
        saveButton: {
            backgroundColor: theme.accent,
        },
        cancelText: {
            color: theme.text,
            fontWeight: '600',
            fontSize: 15,
        },
        saveText: {
            color: '#fff',
            fontWeight: '700',
            fontSize: 15,
        },
        summaryRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        summaryText: {
            color: theme.subtext,
            fontSize: 13,
        },
        summaryValue: {
            color: theme.accent,
            fontWeight: '700',
            fontSize: 14,
        },
        logsScroll: {
            // Caps the inner scrollable list of activity logs / class
            // memberships at 350px tall, so a long history doesn't push
            // the modal's action buttons off-screen — the list scrolls
            // internally instead.
            maxHeight: 350,
        },
        logRow: {
            backgroundColor: theme.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 12,
            marginBottom: 10,
        },
        logTopRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
        },
        logMiles: {
            color: theme.text,
            fontFamily: 'Georgia',
            fontWeight: '700',
            fontSize: 16,
        },
        logTrail: {
            color: theme.text,
            fontSize: 14,
            marginTop: 4,
            fontWeight: '600',
        },
        logDate: {
            color: theme.subtext,
            fontSize: 12,
            marginTop: 3,
        },
        deleteButton: {
            // #D70015, not #FF3B30 -- the same "one error color" already
            // used across the auth flow (login.tsx/signup.tsx). #FF3B30
            // as a white-text fill measured 3.55:1, failing AA; #D70015
            // measures 5.39:1 in the same role.
            backgroundColor: '#D70015',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 7,
            // A fixed minWidth ensures the delete button doesn't visually
            // shrink/jitter as its label text changes between "Delete" and
            // "Deleting" (a longer word) while a deletion is in progress.
            minWidth: 78,
            alignItems: 'center',
        },
        deleteButtonDisabled: {
            opacity: 0.6,
        },
        deleteText: {
            color: '#fff',
            fontWeight: '700',
            fontSize: 12,
        },
        emptyState: {
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 26,
        },
        emptyText: {
            color: theme.subtext,
            textAlign: 'center',
        },
        scrollerWrapperContainer: {
            marginVertical: 4,
            height: 48,
        },
        optionChip: {
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 22,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            marginRight: 8,
            justifyContent: 'center',
            alignItems: 'center',
        },
        optionChipActive: {
            backgroundColor: theme.accent,
            borderColor: theme.accent,
        },
        optionChipText: {
            fontSize: 13,
            fontWeight: '600',
            color: theme.text,
        },
        optionChipTextActive: {
            color: '#fff',
        },
        colorCircle: {
            width: 34,
            height: 34,
            borderRadius: 17,
            marginRight: 10,
            borderWidth: 2,
            borderColor: 'transparent',
        },
        colorCircleSelected: {
            borderColor: theme.accent,
        },
        arrowPickerContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
            marginTop: 8,
            marginBottom: 12,
        },
        arrowButton: {
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        arrowButtonText: {
            fontSize: 24,
            fontWeight: '700',
            color: theme.text,
            lineHeight: 26,
        },
        defaultResetButton: {
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignSelf: 'center',
            marginBottom: 4,
        },
        defaultResetButtonActive: {
            borderColor: theme.accent,
            backgroundColor: theme.surface,
        },
        defaultResetText: {
            fontSize: 12,
            color: theme.subtext,
            fontWeight: '600',
        },
        defaultResetTextActive: {
            color: theme.accent,
            fontWeight: '700',
        },
        previewImageContainer: {
            alignItems: 'center',
            marginTop: 8,
            marginBottom: 4,
        },
        previewImageWrapper: {
            padding: 4,
            borderRadius: 28,
            borderWidth: 3,
            borderColor: 'transparent',
        },
        previewImageWrapperActive: {
            borderColor: theme.accent,
        }
    });
}

export default function AccountScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const baseStyles = getGlobalStyles(theme);
    const accountStyles = getAccountStyles(theme);
    const router = useRouter();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [userId, setUserId] = useState<string | null>(null);

    // --- Profile customizer modal state ---
    const [editOpen, setEditOpen] = useState(false);
    const [displayNameDraft, setDisplayNameDraft] = useState('');
    const [usernameDraft, setUsernameDraft] = useState('');
    const [savingUsername, setSavingUsername] = useState(false);
    const [remoteBannedWords, setRemoteBannedWords] = useState<string[]>([]); // Dynamic remote blocklist

    const [chosenStyle, setChosenStyle] = useState('bottts');
    const [seedIndex, setSeedIndex] = useState(1);

    const [isUsingNicknameLook, setIsUsingNicknameLook] = useState(false);
    const [chosenBg, setChosenBg] = useState('ff595e');

    // --- Activity log modal state ---
    const [activityOpen, setActivityOpen] = useState(false);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
    // Which specific log row is currently being deleted (so only that
    // row's button shows "Deleting" while the rest stay interactive-
    // looking, though see the actual disabled logic below).
    const [deletingLogId, setDeletingLogId] = useState<number | null>(null);

    // --- Class groups modal state ---
    const [groupsOpen, setGroupsOpen] = useState(false);
    const [memberships, setMemberships] = useState<MembershipRow[]>([]);
    const [membershipsLoading, setMembershipsLoading] = useState(false);
    const [newGroupCode, setNewGroupCode] = useState('');
    const [joiningGroup, setJoiningGroup] = useState(false);

    // --- Delete account state ---
    const [deletingAccount, setDeletingAccount] = useState(false);

    // Fetch the live banned words database dictionary on mount
    useEffect(() => {
        async function loadBannedWords() {
            if (!supabase) return;
            const { data, error } = await supabase
                .from('banned_words')
                .select('word');

            if (data && !error) {
                setRemoteBannedWords(data.map(row => row.word));
            } else if (error) {
                // Moderation still runs (utils/profanity.ts has its own
                // static wordlist layers) but silently degrades without
                // this remote list, so surface it rather than pretending
                // nothing's wrong.
                console.error('Could not load remote moderation wordlist:', error.message);
            }
        }
        void loadBannedWords();
    }, []);

    // Resolve what identity to print dynamically if any active tracks force anonymity rules
    // If ANY class this student belongs to requires anonymity, their
    // displayed greeting name switches to a randomly generated but STABLE
    // (deterministic based on their user id) placeholder name instead of
    // their real username — protecting their identity in that context.
    const resolvedGreetingName = useMemo(() => {
        const hasAnonymityRule = memberships.some(m => m.isAnonymousRequired);
        if (hasAnonymityRule && userId) {
            return getAnonymousName(userId);
        }
        return profile?.username || 'Explorer';
    }, [profile, memberships, userId]);

    // The avatar shown on the main (non-editing) profile page.
    const currentAvatarUrl = useMemo(() => {
        // New accounts default avatar_seed to their own raw user id (not a URL)
        // until they customize their avatar here -- only use it once it's a URL.
        if (!profile?.avatar_seed?.startsWith('http')) {
            return `https://api.dicebear.com/7.x/bottts/png?seed=default&backgroundColor=ff595e`;
        }
        // Force PNG format (rather than SVG) for consistent rendering,
        // same as the leaderboard screen's avatar handling.
        return profile.avatar_seed.replace('/svg?', '/png?');
    }, [profile]);

    // Live preview avatar shown inside the customizer sheet, built fresh
    // from whatever the user currently has selected. Note: uses
    // "ExplorerSeed-N" as the numbered-seed prefix, whereas
    // teacher-account.tsx uses "EducatorSeed-N" — each account type gets
    // its own distinct default seed pool.
    const previewAvatarUrl = useMemo(() => {
        const resolvingSeedValue = isUsingNicknameLook ? usernameDraft.trim() : `ExplorerSeed-${seedIndex}`;
        return `https://api.dicebear.com/7.x/${chosenStyle}/png?seed=${encodeURIComponent(resolvingSeedValue || 'Explorer')}&backgroundColor=${chosenBg}`;
    }, [chosenStyle, seedIndex, isUsingNicknameLook, usernameDraft, chosenBg]);

    // Sums every activity row's miles into one grand total shown at the
    // top of the activity log modal.
    const totalActivityMiles = useMemo(
        () => activityRows.reduce((sum, row) => sum + Number(row.miles ?? 0), 0),
        [activityRows]
    );

    // Wrapped in useCallback so it has a stable identity (safe to use as a
    // dependency elsewhere, e.g. inside fetchProfile's own useCallback
    // below).
    const showAlert = useCallback((title: string, message: string) => {
        if (Platform.OS === 'web') {
            alert(`${title}\n\n${message}`);
            return;
        }
        Alert.alert(title, message);
    }, []);

    const fetchProfile = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            await ensureProfileRow({
                userId: user.id,
                email: user.email,
                username: user.user_metadata?.username,
            });

            const { data, error } = await supabase
                .from('profiles')
                .select('username, display_name, avatar_seed, app_role, active_view, school_name, school_district_name, district_id, generic_grades_taught')
                .eq('id', user.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setProfile(data);
                setUsernameDraft(data.username || '');
                setDisplayNameDraft(data.display_name || '');

                // Same avatar-URL-parsing logic seen in
                // teacher-account.tsx, but checking for the
                // "ExplorerSeed-" prefix instead of "EducatorSeed-".
                if (data.avatar_seed && data.avatar_seed.includes('?')) {
                    const matchStyle = data.avatar_seed.split('/7.x/')[1]?.split('/')[0];
                    const matchSeed = decodeURIComponent(data.avatar_seed.split('seed=')[1]?.split('&')[0] || '');
                    const matchBg = data.avatar_seed.split('backgroundColor=')[1]?.split('&')[0];

                    if (matchStyle) setChosenStyle(matchStyle);
                    if (matchBg) setChosenBg(matchBg);

                    if (matchSeed.startsWith('ExplorerSeed-')) {
                        const parsedNum = parseInt(matchSeed.replace('ExplorerSeed-', ''), 10);
                        setSeedIndex(isNaN(parsedNum) ? 1 : parsedNum);
                        setIsUsingNicknameLook(false);
                    } else {
                        setIsUsingNicknameLook(true);
                    }
                }
            }
        } catch (error: any) {
            showAlert('Profile Error', error.message);
        }
    }, [showAlert]);

    useEffect(() => {
        void fetchProfile();
    }, [fetchProfile]);

    function handlePreviousSeed() {
        setIsUsingNicknameLook(false);
        setSeedIndex((prev) => (prev <= 1 ? 50 : prev - 1));
    }

    function handleNextSeed() {
        setIsUsingNicknameLook(false);
        setSeedIndex((prev) => (prev >= 50 ? 1 : prev + 1));
    }

    function handleResetToDefaultUsername() {
        if (!usernameDraft.trim()) {
            showAlert('Notice', 'Please type a nickname below first.');
            return;
        }
        setIsUsingNicknameLook(true);
    }

    async function saveProfileChanges() {
        const cleanUsername = usernameDraft.trim();
        const cleanDisplayName = displayNameDraft.trim();

        if (!cleanUsername || !cleanDisplayName) {
            showAlert('Invalid Fields', 'Real name and App Nickname cannot be empty.');
            return;
        }
        if (!userId) return;

        try {
            setSavingUsername(true);

            // Fetch a dynamic list of ALLOWED words (a whitelist) — used
            // to override the profanity filter for specific words that
            // might otherwise get flagged as inappropriate but are
            // actually fine (e.g. a word that's a false positive).
            const { data: whitelistRows, error: whitelistError } = await supabase
                .from('username_whitelist')
                .select('allowed_word');

            if (whitelistError) {
                console.error('Failed to get dynamic whitelist rows:', whitelistError);
            }

            const currentDynamicWhitelist = whitelistRows?.map(row => row.allowed_word) || [];

            if (hasDisallowedCharacters(cleanUsername)) {
                showAlert('Nickname Not Allowed', 'Nicknames can only use letters, spaces, and hyphens — no numbers or symbols.');
                setSavingUsername(false);
                return;
            }

            // Perform robust filter package evaluation using local whitelist and dynamic cloud dictionary
            if (!checkIsUsernameAppropriate(cleanUsername, currentDynamicWhitelist, remoteBannedWords)) {
                showAlert('Inappropriate Nickname', 'Please choose a school-appropriate public nickname.');
                setSavingUsername(false);
                return;
            }

            const compiledSeedString = previewAvatarUrl;
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    username: cleanUsername,
                    display_name: cleanDisplayName,
                    avatar_seed: compiledSeedString
                })
                .eq('id', userId);

            if (profileError) throw profileError;

            // NOTE: this replaces the ENTIRE profile object with just
            // these 3 fields, rather than spreading the existing profile
            // (`{ ...profile, username: ..., ... }`) — any other fields
            // previously on `profile` (app_role, active_view, school
            // info, etc.) get wiped from local state here. This doesn't
            // cause visible bugs on THIS screen (which doesn't read those
            // other fields), but it's a subtly incomplete update compared
            // to how teacher-account.tsx's equivalent save function
            // preserves the rest of the profile object.
            setProfile({ username: cleanUsername, display_name: cleanDisplayName, avatar_seed: compiledSeedString });
            setEditOpen(false);
            showAlert('Success', 'Profile changes saved.');
        } catch (error: any) {
            showAlert('Update Failed', error.message);
        } finally {
            setSavingUsername(false);
        }
    }

    // Opens the activity log modal AND immediately triggers a fresh fetch
    // — the modal doesn't rely on data being pre-loaded, it fetches fresh
    // every time it's opened.
    async function openActivityData() {
        setActivityOpen(true);
        await fetchActivityRows();
    }

    async function fetchActivityRows() {
        try {
            setActivityLoading(true);
            if (!userId) return;

            const { data: logs, error: logsError } = await supabase
                .from('activity_logs')
                .select('id, miles, created_at, trail_id, activity_type, input_amount, input_unit')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (logsError) throw logsError;

            const logRows = (logs ?? []) as ActivityLogDbRow[];
            // Get the unique set of trail ids referenced across all log
            // entries, so we only need to query trail NAMES for the
            // distinct trails actually involved (rather than one query
            // per log row, which would be wasteful).
            const trailIds = [...new Set(logRows.map((row) => String(row.trail_id)))];

            let trailNameMap = new Map<string, string>();
            if (trailIds.length > 0) {
                const { data: trails } = await supabase
                    .from('trails')
                    .select('id, name')
                    .in('id', trailIds);

                if (trails) {
                    trailNameMap = new Map((trails as TrailNameDbRow[]).map((t) => [String(t.id), t.name]));
                }
            }

            // Transform the raw DB rows into the cleaner ActivityRow shape,
            // resolving each row's trail name from the lookup map (or
            // falling back to a generic "Trail {id}" label if somehow not
            // found).
            setActivityRows(logRows.map((row) => ({
                id: row.id,
                miles: Number(row.miles ?? 0),
                createdAt: row.created_at,
                trailId: String(row.trail_id),
                trailName: trailNameMap.get(String(row.trail_id)) ?? `Trail ${row.trail_id}`,
                activityType: row.activity_type ?? null,
                inputAmount: row.input_amount ?? null,
                inputUnit: row.input_unit ?? null,
            })));
        } catch (error: any) {
            showAlert('Activity Error', error.message);
        } finally {
            setActivityLoading(false);
        }
    }

    async function deleteActivityRow(row: ActivityRow) {
        try {
            setDeletingLogId(row.id);
            const { error: deleteError } = await supabase.from('activity_logs').delete().eq('id', row.id);
            if (deleteError) throw deleteError;

            // Remove the deleted row from local state immediately rather
            // than re-fetching the whole list.
            const nextRows = activityRows.filter((item) => item.id !== row.id);
            setActivityRows(nextRows);
        } catch (error: any) {
            showAlert('Delete Failed', error.message);
        } finally {
            setDeletingLogId(null);
        }
    }

    // Shows a native confirmation dialog before actually deleting a log
    // row, with a specific message describing exactly what's about to be
    // removed.
    function confirmDeleteActivityRow(row: ActivityRow) {
        const promptMessage = `Delete ${formatMiles(row.miles)} miles from ${row.trailName} logged on ${formatLoggedDate(row.createdAt)}?`;
        confirmAlert('Delete Activity Log', promptMessage, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void deleteActivityRow(row) },
        ]);
    }

    async function openGroupsPortal() {
        setGroupsOpen(true);
        await fetchMemberships();
    }

    async function fetchMemberships() {
        try {
            setMembershipsLoading(true);
            if (!userId) return;

            // There's no foreign key between class_memberships and classes, so
            // PostgREST can't resolve an embedded classes(...) join -- fetch
            // memberships and class details separately and merge them here.
            const { data: membershipRows, error: membershipError } = await supabase
                .from('class_memberships')
                .select('id, class_id')
                .eq('user_id', userId);

            if (membershipError) throw membershipError;

            const classIds = [...new Set((membershipRows || []).map((r) => r.class_id))];
            // A local type describing what a "classes" row lookup might
            // return — `is_anonymous_required?` is optional because, as
            // handled below, this column might not even exist yet on
            // some database environments.
            type ClassLookupRow = { id: string; class_name: string; is_anonymous_required?: boolean };
            let classRows: ClassLookupRow[] = [];
            if (classIds.length > 0) {
                const withAnonymity = await supabase
                    .from('classes')
                    .select('id, class_name, is_anonymous_required')
                    .in('id', classIds);

                // Postgres error code '42703' means "column does not
                // exist" — this handles the case where a database
                // environment hasn't been migrated to include the
                // is_anonymous_required column yet, gracefully falling
                // back to a query that omits it entirely rather than
                // crashing the whole screen.
                if (withAnonymity.error?.code === '42703') {
                    // is_anonymous_required doesn't exist on this database yet --
                    // fall back to a query without it so the roster still loads.
                    const withoutAnonymity = await supabase.from('classes').select('id, class_name').in('id', classIds);
                    if (withoutAnonymity.error) throw withoutAnonymity.error;
                    classRows = withoutAnonymity.data || [];
                } else if (withAnonymity.error) {
                    throw withAnonymity.error;
                } else {
                    classRows = withAnonymity.data || [];
                }
            }

            const classById = new Map((classRows || []).map((c) => [c.id, c]));

            setMemberships((membershipRows || []).map((row) => {
                const cls = classById.get(row.class_id);
                return {
                    id: row.id,
                    classId: row.class_id,
                    // Fall back to showing the raw class id if the class
                    // name lookup somehow failed to find a match.
                    className: cls?.class_name || row.class_id,
                    // `!!cls?.is_anonymous_required` converts a possibly
                    // undefined value (if the class wasn't found, or if
                    // the column doesn't exist on this database) into a
                    // strict false, rather than leaving it undefined.
                    isAnonymousRequired: !!cls?.is_anonymous_required,
                };
            }));
        } catch (err: any) {
            showAlert('Error', err.message || 'Could not fetch active group rosters.');
        } finally {
            setMembershipsLoading(false);
        }
    }

    // Handles the "Join" button in the groups modal — looks up a class by
    // its join code and, if found, adds a membership row for the current
    // student.
    async function joinNewGroupAction() {
        const code = newGroupCode.trim().toUpperCase();
        if (!code) return;

        try {
            setJoiningGroup(true);
            // Looks the class up AND enrolls the caller in one server-side
            // RPC call, rather than a client-side select-then-insert — a
            // student has no direct SELECT access to a class they aren't
            // already a member of (classes.id doubles as the join code, and
            // that table's RLS no longer allows browsing it wholesale). See
            // supabase/fix-classes-join-code-enumeration.sql. Returns zero
            // rows if the code doesn't match any class.
            const { data, error } = await supabase.rpc('join_class_by_code', { target_class_id: code });
            if (error) {
                // Postgres error code '23505' means "unique constraint
                // violation" — this specific error means the student is
                // ALREADY a member of this class (their membership row
                // would be a duplicate), so it's handled with a friendlier
                // "you're already in this class" message instead of a
                // generic error.
                if (error.code === '23505') showAlert('Active', 'You belong to this class track already.');
                else throw error;
            } else if (!data || data.length === 0) {
                showAlert('Not Found', 'No group exists with that invite code.');
            } else {
                setNewGroupCode('');
                showAlert('Success', `Joined ${data[0].class_name}!`);
                await fetchMemberships();
            }
        } catch (error: any) {
            showAlert('Error Joining', error.message);
        } finally {
            setJoiningGroup(false);
        }
    }

    // Confirms then removes this student's membership in a specific class.
    async function leaveGroupAction(membershipId: number, className: string) {
        confirmAlert('Leave Group', `Exit ${className}? Your ranking rows will disappear from their boards.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Leave',
                style: 'destructive',
                onPress: async () => {
                    const { error } = await supabase.from('class_memberships').delete().eq('id', membershipId);
                    if (error) {
                        showAlert('Error', error.message || 'Could not leave that group. Please try again.');
                        return;
                    }
                    await fetchMemberships();
                }
            }
        ]);
    }

    return (
        <>
            <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                <View style={baseStyles.profileImageContainer}>
                    <Pressable style={baseStyles.avatarEditWrapper} onPress={() => setEditOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit profile picture">
                        <View style={baseStyles.avatarRing}>
                            <Image source={{ uri: currentAvatarUrl }} style={baseStyles.profileImage} contentFit="contain" />
                        </View>
                        <View style={baseStyles.avatarEditBadge}>
                            <Ionicons name="pencil" size={16} color="#FFF" />
                        </View>
                    </Pressable>
                    <Text style={baseStyles.profileGreeting} accessibilityRole="header">Welcome back, {resolvedGreetingName}</Text>
                    <Text style={baseStyles.profileSubtext}>Manage your account profiles</Text>
                </View>

                <View style={baseStyles.AccountMain}>
                    <Button label="View All Activity Data" onPress={() => void openActivityData()} />
                    <Button label="Join & Manage Classes" onPress={() => void openGroupsPortal()} />
                    {/* Demoted from a full-width filled Button (identical
                        size/shape to the two primary actions above,
                        distinguished only by red fill) to a smaller
                        outlined control, separated by extra top margin --
                        it was one careless tap away from "Join & Manage
                        Classes" with no other distinction (flagged in an
                        /impeccable critique as a real accidental-tap risk
                        for a K-12 audience). Color reused from the
                        deleteButton fix above (#D70015, 4.72:1 as text on
                        this cream background). */}
                    <Pressable
                        onPress={() => requestTourReplay('student')}
                        style={{ alignSelf: 'center', marginTop: 28, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.accent }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Replay Tour</Text>
                    </Pressable>

                    <Pressable
                        onPress={() => void signOutAndRedirect(router)}
                        // paddingVertical 10 measured 39px live, 5px under
                        // the 44px touch-target floor -- caught in a later
                        // /impeccable critique round after the original
                        // demotion fix. 13 clears it.
                        style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.error }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.error, fontWeight: '600', fontSize: 14 }}>Sign Out</Text>
                    </Pressable>

                    {/* Deliberately understated (plain text, no border/pill,
                        muted color) rather than matched to Sign Out's
                        visual weight -- this is permanent and wipes
                        everything, so it shouldn't be one careless tap
                        away from anything else on this screen. The
                        confirmation dialog carries the actual warning. */}
                    <Pressable
                        onPress={() => confirmDeleteAccount(router, setDeletingAccount)}
                        disabled={deletingAccount}
                        style={{ alignSelf: 'center', marginTop: 20, paddingVertical: 13, paddingHorizontal: 18 }}
                        accessibilityRole="button"
                    >
                        {deletingAccount ? (
                            <ActivityIndicator color={theme.subtext} size="small" />
                        ) : (
                            <Text style={{ color: theme.subtext, fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' }}>Delete Account</Text>
                        )}
                    </Pressable>
                </View>

                <Text style={baseStyles.acknowledgementText}>
                    The GeoQuestOK app is a partnership between the Oklahoma State Department of Education’s
                    Health & Physical Education Department and the Oklahoma Alliance for Geographic Education.
                    This program works to fulfill the “Walk Across Oklahoma” foundation created by Oklahoma House
                    Bill 1647.
                </Text>
            </ScrollView>

            {/* Modal Customizer Profile */}
            <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={accountStyles.overlay}
                >
                    <AdaptiveBlur />
                    <Pressable style={accountStyles.dismissDismissibleBackdrop} onPress={() => setEditOpen(false)} />

                    <View style={accountStyles.sheet}>
                        <ScrollView contentContainerStyle={{ paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
                            <Text style={accountStyles.modalTitle} accessibilityRole="header">Customize Profile</Text>
                            <View style={accountStyles.modalDivider} />

                            <View style={accountStyles.previewImageContainer}>
                                <View style={[accountStyles.previewImageWrapper, isUsingNicknameLook && accountStyles.previewImageWrapperActive]}>
                                    <Image source={{ uri: previewAvatarUrl }} style={{ width: 140, height: 140, borderRadius: 20 }} contentFit="contain" />
                                </View>
                            </View>

                            <View style={accountStyles.arrowPickerContainer}>
                                <Pressable style={accountStyles.arrowButton} onPress={handlePreviousSeed} accessibilityRole="button" accessibilityLabel="Previous look">
                                    <Text style={accountStyles.arrowButtonText}>‹</Text>
                                </Pressable>
                                <Pressable style={accountStyles.arrowButton} onPress={handleNextSeed} accessibilityRole="button" accessibilityLabel="Next look">
                                    <Text style={accountStyles.arrowButtonText}>›</Text>
                                </Pressable>
                            </View>

                            <Pressable style={[accountStyles.defaultResetButton, isUsingNicknameLook && accountStyles.defaultResetButtonActive]} onPress={handleResetToDefaultUsername} accessibilityRole="button">
                                <Text style={[accountStyles.defaultResetText, isUsingNicknameLook && accountStyles.defaultResetTextActive]}>
                                    {isUsingNicknameLook ? '✨ Matching Nickname Look Active' : '✨ Match Nickname Look'}
                                </Text>
                            </Pressable>

                            <Text style={accountStyles.label}>ART STYLE CATEGORY</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={accountStyles.scrollerWrapperContainer}>
                                {ART_STYLES.map((s) => (
                                    <Pressable key={s} style={[accountStyles.optionChip, chosenStyle === s && accountStyles.optionChipActive]} onPress={() => setChosenStyle(s)} accessibilityRole="radio" accessibilityState={{ selected: chosenStyle === s }} aria-selected={chosenStyle === s}>
                                        <Text style={[accountStyles.optionChipText, chosenStyle === s && accountStyles.optionChipTextActive]}>{s}</Text>
                                    </Pressable>
                                ))}
                            </ScrollView>

                            <Text style={accountStyles.label}>BACKGROUND THEME COLOR</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={accountStyles.scrollerWrapperContainer}>
                                {BG_COLORS.map((color, idx) => (
                                    <Pressable key={color} style={[accountStyles.colorCircle, { backgroundColor: `#${color}` }, chosenBg === color && accountStyles.colorCircleSelected]} onPress={() => setChosenBg(color)} accessibilityRole="radio" accessibilityState={{ selected: chosenBg === color }} aria-selected={chosenBg === color} accessibilityLabel={`Background color ${idx + 1}`} />
                                ))}
                            </ScrollView>

                            <Text style={[accountStyles.label, { marginTop: 12 }]}>ROSTER NAME (PRIVATE TO TEACHERS)</Text>
                            <TextInput value={displayNameDraft} onChangeText={setDisplayNameDraft} autoCapitalize="words" style={accountStyles.input} placeholder="First & Last Name" placeholderTextColor={theme.subtext} />

                            <Text style={[accountStyles.label, { marginTop: 8 }]}>USERNAME NICKNAME (PUBLIC)</Text>
                            <TextInput value={usernameDraft} onChangeText={(text) => { setUsernameDraft(text); setIsUsingNicknameLook(false); }} autoCapitalize="none" style={accountStyles.input} placeholder="Nickname" placeholderTextColor={theme.subtext} />
                        </ScrollView>

                        <View style={accountStyles.modalActions}>
                            <Pressable style={[accountStyles.actionButton, accountStyles.cancelButton]} onPress={() => setEditOpen(false)} accessibilityRole="button">
                                <Text style={accountStyles.cancelText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={[accountStyles.actionButton, accountStyles.saveButton]} onPress={() => void saveProfileChanges()} accessibilityRole="button">
                                {savingUsername ? <ActivityIndicator color="#fff" size="small" /> : <Text style={accountStyles.saveText}>Save Changes</Text>}
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Modal Activity Logs */}
            {/* NOTE: unlike the customizer sheet above, this modal isn't
                wrapped in a KeyboardAvoidingView — reasonable here since
                this modal contains no text inputs, so there's no keyboard
                to avoid. */}
            <Modal visible={activityOpen} animationType="slide" transparent onRequestClose={() => setActivityOpen(false)}>
                <ModalBackdrop style={accountStyles.overlay}>
                    <Pressable style={accountStyles.dismissDismissibleBackdrop} onPress={() => setActivityOpen(false)} />
                    <View style={accountStyles.sheet}>
                        <Text style={accountStyles.modalTitle} accessibilityRole="header">All Activity Data</Text>
                        <View style={accountStyles.modalDivider} />

                        <View style={accountStyles.summaryRow}>
                            <Text style={accountStyles.summaryText}>Entries: {activityRows.length}</Text>
                            <Text style={accountStyles.summaryValue}>Total: {formatMiles(totalActivityMiles)} mi</Text>
                        </View>
                        <View style={accountStyles.modalDivider} />

                        {activityLoading ? (
                            <View style={accountStyles.emptyState}>
                                <ActivityIndicator size="large" color={theme.accent} />
                                <Text style={[accountStyles.emptyText, { marginTop: 10 }]}>Loading activity logs...</Text>
                            </View>
                        ) : activityRows.length === 0 ? (
                            <View style={accountStyles.emptyState}>
                                <Text style={accountStyles.emptyText}>No activity logged yet.</Text>
                            </View>
                        ) : (
                            <ScrollView style={accountStyles.logsScroll} showsVerticalScrollIndicator={false}>
                                {activityRows.map((row) => (
                                    <View key={row.id} style={accountStyles.logRow}>
                                        <View style={accountStyles.logTopRow}>
                                            <Text style={accountStyles.logMiles}>{formatMiles(row.miles)} mi</Text>
                                            {/* disabled={deletingLogId !==
                                                null} disables EVERY delete
                                                button (not just the one
                                                being deleted) while any
                                                deletion is in progress —
                                                prevents the user from
                                                triggering a second delete
                                                request before the first
                                                one finishes. */}
                                            <Pressable style={[accountStyles.deleteButton, deletingLogId === row.id && accountStyles.deleteButtonDisabled]} onPress={() => confirmDeleteActivityRow(row)} disabled={deletingLogId !== null} accessibilityRole="button" accessibilityLabel={`Delete ${formatMiles(row.miles)} miles from ${row.trailName}`}>
                                                <Text style={accountStyles.deleteText}>{deletingLogId === row.id ? 'Deleting' : 'Delete'}</Text>
                                            </Pressable>
                                        </View>
                                        <Text style={accountStyles.logTrail}>{row.trailName}</Text>
                                        {row.activityType && row.inputAmount && row.inputUnit && (
                                            <Text style={accountStyles.logTrail}>{formatActivitySummary(row.activityType, row.inputAmount, row.inputUnit)}</Text>
                                        )}
                                        <Text style={accountStyles.logDate}>{formatLoggedDate(row.createdAt)}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        )}

                        <View style={accountStyles.modalActions}>
                            <Pressable style={[accountStyles.actionButton, accountStyles.cancelButton]} onPress={() => setActivityOpen(false)} accessibilityRole="button">
                                <Text style={accountStyles.cancelText}>Close</Text>
                            </Pressable>
                            <Pressable style={[accountStyles.actionButton, accountStyles.saveButton]} onPress={() => { void fetchActivityRows(); }} disabled={activityLoading} accessibilityRole="button">
                                {activityLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={accountStyles.saveText}>Refresh</Text>}
                            </Pressable>
                        </View>
                    </View>
                </ModalBackdrop>
            </Modal>

            {/* Modal Class Group Management */}
            <Modal visible={groupsOpen} animationType="slide" transparent onRequestClose={() => setGroupsOpen(false)}>
                <ModalBackdrop style={accountStyles.overlay}>
                    <Pressable style={accountStyles.dismissDismissibleBackdrop} onPress={() => setGroupsOpen(false)} />
                    <View style={accountStyles.sheet}>
                        <Text style={accountStyles.modalTitle} accessibilityRole="header">Join & Manage Classes</Text>
                        <View style={accountStyles.modalDivider} />

                        <Text style={accountStyles.label}>ENTER CLASS OR SCOUT CODE</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                            {/* Placeholder previously showed a format
                                ("73069-ALCOTT-GYM") that doesn't match what
                                the app actually generates (a plain 6-character
                                code like "76H2D7", confirmed live) --
                                misleading example for a student who has a
                                real code in hand and isn't sure what to type. */}
                            <TextInput value={newGroupCode} onChangeText={setNewGroupCode} autoCapitalize="characters" placeholder="e.g. 76H2D7" placeholderTextColor={theme.subtext} style={[accountStyles.input, { flex: 1 }]} />
                            <Pressable onPress={() => void joinNewGroupAction()} style={[accountStyles.actionButton, accountStyles.saveButton, { flex: 0, minWidth: 96, paddingHorizontal: 28, height: 56, borderRadius: 14 }]} accessibilityRole="button">
                                {joiningGroup ? <ActivityIndicator color="#fff" /> : <Text style={[accountStyles.saveText, { fontSize: 17 }]}>Join</Text>}
                            </Pressable>
                        </View>

                        <Text style={accountStyles.label}>ACTIVE MEMBERSHIPS</Text>
                        {membershipsLoading ? <ActivityIndicator size="small" color={theme.accent} /> : (
                            <ScrollView style={accountStyles.logsScroll} showsVerticalScrollIndicator={false}>
                                {memberships.map((item) => (
                                    <View key={item.id} style={accountStyles.logRow}>
                                        <View style={accountStyles.logTopRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[accountStyles.logTrail, { marginTop: 0 }]}>{item.className}</Text>
                                                <Text style={accountStyles.logDate}>
                                                    {item.classId} {item.isAnonymousRequired ? '(🔒 Anonymous Enforced)' : ''}
                                                </Text>
                                            </View>
                                            <Pressable style={[accountStyles.deleteButton, { minWidth: 70 }]} onPress={() => void leaveGroupAction(item.id, item.className)} accessibilityRole="button" accessibilityLabel={`Leave ${item.className}`}>
                                                <Text style={accountStyles.deleteText}>Leave</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                        )}

                        <View style={accountStyles.modalActions}>
                            <Pressable style={[accountStyles.actionButton, accountStyles.cancelButton]} onPress={() => setGroupsOpen(false)} accessibilityRole="button">
                                <Text style={accountStyles.cancelText}>Close</Text>
                            </Pressable>
                        </View>
                    </View>
                </ModalBackdrop>
            </Modal>
        </>
    );
}
