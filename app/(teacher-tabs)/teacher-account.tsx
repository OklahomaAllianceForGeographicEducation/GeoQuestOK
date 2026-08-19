// app/(teacher-tabs)/teacher-account.tsx
// NOTE: the header comment inside this file says
// "app/(teacher-tabs)/account.tsx", but the actual filename (and route) is
// "teacher-account.tsx" — matching the Tabs.Screen name="teacher-account"
// registered in (teacher-tabs)/_layout.tsx. Another stale internal comment,
// same pattern seen in a few other files in this app.
// The teacher's account/settings screen: profile info, a Dicebear-based
// avatar customizer (style/color/seed picker), school/district editing
// with the same registry search pattern as signup, a Teacher/Classic view
// switcher, and sign out.

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
    View,
} from 'react-native';
// getGlobalStyles is a shared style factory (like getTrailStyles /
// getLeaderboardStyles seen elsewhere) — produces styles reused across
// multiple account-style screens (this one and student-account.tsx), while
// getAccountStyles below is defined LOCALLY in this file for styles
// specific to just this screen's edit sheet.
import { colors, getGlobalStyles, type Theme } from '../../commonStyles';
import AdaptiveBlur from '../../components/AdaptiveBlur';
import Button from '../../components/Button';
import { signOutAndRedirect } from '../../lib/auth';
import { confirmAlert } from '../../lib/confirmAlert';
import { ensureProfileRow } from '../../lib/profiles';
import { supabase } from '../../utils/supabase';

// The subset of "profiles" table fields this screen reads/writes.
type Profile = {
    username: string;
    display_name: string;
    // avatar_seed here actually stores a FULL Dicebear image URL (not
    // just a short "seed" string) — a slightly misleading field name kept
    // for compatibility with how it's used elsewhere in the app (e.g. the
    // leaderboard screen's profilePicture logic).
    avatar_seed: string;
    app_role: string;
    active_view: string;
    school_name?: string;
    school_district_name?: string;
    district_id?: string;
    generic_grades_taught?: 'elementary' | 'middle_school' | 'high_school' | 'split_campus' | ''; // 🌟 Ensure this matches your database column
};

// Matches districts_registry: id is a text code (e.g. "01-C019"), not a uuid.
type DistrictItem = {
    id: string;
    district_name: string;
};

// Matches schools_registry: id is uuid, district_id is the FK text code.
type SchoolItem = {
    id: string;
    school_name: string;
    district_id: string;
};

// The available Dicebear avatar "art styles" (each is a different
// illustration style Dicebear offers — robots, faces, pixel art, etc.).
const ART_STYLES = ['bottts', 'lorelei', 'adventurer', 'pixel-art', 'open-peeps', 'personas', 'shapes'];
// A palette of hex color codes (WITHOUT the leading '#') usable as the
// avatar's background color swatch options.
const BG_COLORS = ['ff595e', 'ffca3a', '8ac926', '1982c4', '6a4c93', 'ff924c', 'f15bb5', '00f5d4', '2b2d42', 'ffffff'];

// A local style-factory function (same pattern as getTrailStyles /
// getLeaderboardStyles in commonStyles.ts), but defined right here since
// these styles are specific to this one account-editing screen rather
// than shared app-wide.
function getAccountStyles(theme: Theme) {
    return StyleSheet.create({
        overlay: { flex: 1, justifyContent: 'flex-end' },
        // The spread of StyleSheet.absoluteFillObject expands into
        // { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }
        // — used here (rather than referencing the constant directly) so
        // additional style properties could be added alongside it later
        // if needed, though none currently are.
        dismissBackdrop: { ...StyleSheet.absoluteFillObject },
        sheet: {
            backgroundColor: theme.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '94%',
            paddingTop: 20,
            paddingHorizontal: 20,
            // Extra bottom padding on iOS (40px vs 24px on Android) to
            // account for the home-indicator gesture bar at the bottom of
            // modern iPhones, which sits closer to on-screen content than
            // Android's typical bottom nav.
            paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        },
        modalTitle: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '700', color: theme.text },
        modalDivider: { height: 1, backgroundColor: theme.border, marginVertical: 12 },
        label: { fontSize: 11, fontWeight: '700', color: theme.subtext, letterSpacing: 1.1, marginBottom: 6, marginTop: 12 },
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
        // Fades a disabled input to 50% opacity (used for the school
        // field before a district has been chosen).
        inputDisabled: { opacity: 0.5 },
        helperText: { fontSize: 12, color: theme.subtext, marginTop: 2, marginBottom: 4, lineHeight: 16 },
        modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
        actionButton: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
        cancelButton: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
        saveButton: { backgroundColor: theme.accent },
        cancelText: { color: theme.text, fontWeight: '600', fontSize: 15 },
        saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
        scrollerWrapperContainer: { marginVertical: 4, height: 48 },
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
        optionChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
        optionChipText: { fontSize: 13, fontWeight: '600', color: theme.text },
        optionChipTextActive: { color: '#fff' },
        // A small circular swatch for each background color option.
        colorCircle: { width: 34, height: 34, borderRadius: 17, marginRight: 10, borderWidth: 2, borderColor: 'transparent' },
        colorCircleSelected: { borderColor: theme.accent },
        arrowPickerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginTop: 8, marginBottom: 12 },
        arrowButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
        arrowButtonText: { fontSize: 24, fontWeight: '700', color: theme.text, lineHeight: 26 },
        defaultResetButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignSelf: 'center', marginBottom: 4 },
        defaultResetButtonActive: { borderColor: theme.accent, backgroundColor: theme.surface },
        defaultResetText: { fontSize: 12, color: theme.subtext, fontWeight: '600' },
        defaultResetTextActive: { color: theme.accent, fontWeight: '700' },
        previewImageContainer: { alignItems: 'center', marginTop: 8, marginBottom: 4 },
        previewImageWrapper: { padding: 4, borderRadius: 28, borderWidth: 3, borderColor: 'transparent' },
        previewImageWrapperActive: { borderColor: theme.accent },
        viewSwitcherBox: { borderWidth: 1, padding: 14, borderRadius: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 14 },
        switcherTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10, textAlign: 'center' },
        segmentedBar: { flexDirection: 'row', gap: 8 },
        segmentToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F2F2F7' },
        segmentLabel: { fontSize: 13, fontWeight: '700' },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        // position: 'relative' + zIndex: 1 lets the floating dropdown
        // (below) position itself relative to this field block and layer
        // above surrounding content.
        fieldBlock: { position: 'relative', zIndex: 1 },
        dropdownWindow: {
            backgroundColor: '#FFF',
            borderWidth: 1,
            borderColor: '#C7C7CC',
            borderRadius: 12,
            marginTop: 2,
            marginBottom: 10,
            maxHeight: 200,
            elevation: 6,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
        },
        dropdownRow: { paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
        dropdownRowText: { fontSize: 15, color: '#1C1C1E', fontWeight: '500' },
        inlineLoader: { position: 'absolute', right: 14, top: 38 },
    });
}

export default function TeacherAccountScreen() {
    const theme = colors.light;
    const baseStyles = getGlobalStyles(theme);
    const accountStyles = getAccountStyles(theme);
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    // Whether the "Save Changes" request is currently in flight.
    const [updating, setUpdating] = useState(false);

    // Profile Identity States
    const [profile, setProfile] = useState<Profile | null>(null);
    // Whether the "Customize Profile & Avatar" bottom sheet is open.
    const [editOpen, setEditOpen] = useState(false);

    const [displayNameDraft, setDisplayNameDraft] = useState('');
    const [usernameDraft, setUsernameDraft] = useState('');

    // District selection
    const [districtQuery, setDistrictQuery] = useState('');
    const [districtResults, setDistrictResults] = useState<DistrictItem[]>([]);
    const [selectedDistrict, setSelectedDistrict] = useState<DistrictItem | null>(null);
    const [showDistrictDropdown, setShowDistrictDropdown] = useState(false);
    const [isSearchingDistricts, setIsSearchingDistricts] = useState(false);

    // School selection
    const [schoolQuery, setSchoolQuery] = useState('');
    const [schoolResults, setSchoolResults] = useState<SchoolItem[]>([]);
    const [selectedSchool, setSelectedSchool] = useState<SchoolItem | null>(null);
    const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
    const [isSearchingSchools, setIsSearchingSchools] = useState(false);

    // Avatar & Grade Configuration Values
    const [chosenStyle, setChosenStyle] = useState('bottts');
    // Dicebear generates a DIFFERENT-looking avatar for each distinct
    // "seed" string. Rather than letting the user type an arbitrary seed,
    // this app cycles through 50 pre-numbered seeds ("EducatorSeed-1"
    // through "EducatorSeed-50") via left/right arrow buttons, giving a
    // curated "browse through variations" experience instead of a raw
    // text field.
    const [seedIndex, setSeedIndex] = useState(1);
    // If true, the avatar's seed is derived from the user's own username
    // instead of the numbered seedIndex — so their avatar visually
    // "matches" their public handle consistently.
    const [isUsingNicknameLook, setIsUsingNicknameLook] = useState(false);
    const [chosenBg, setChosenBg] = useState('ff595e');
    const [gradeDraft, setGradeDraft] = useState<'elementary' | 'middle_school' | 'high_school' | 'split_campus' | ''>('');

    // useCallback wraps this function so it has a stable identity across
    // renders (only recreated if `router` changes), which lets it safely
    // be listed as a useEffect dependency below without causing that
    // effect to re-run on every single render.
    const loadProfileData = useCallback(async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.replace('/');
                return;
            }

            // Make sure a profile row exists before trying to read one —
            // a defensive safety net in case something went wrong during
            // this account's original signup flow.
            await ensureProfileRow({ userId: user.id });
            const { data, error } = await supabase
                .from('profiles')
                .select('username, display_name, avatar_seed, app_role, active_view, school_name, school_district_name, district_id, generic_grades_taught')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (data) {
                // Normalize every possibly-null database field into a
                // clean, always-defined Profile object (empty string
                // fallbacks rather than nulls), so the rest of the
                // component doesn't need to handle null checks everywhere.
                const loadedProfile: Profile = {
                    username: data.username || '',
                    display_name: data.display_name || '',
                    avatar_seed: data.avatar_seed || '',
                    app_role: data.app_role || 'teacher',
                    active_view: data.active_view || 'teacher',
                    school_name: data.school_name || '',
                    school_district_name: data.school_district_name || '',
                    district_id: data.district_id || '',
                    generic_grades_taught: data.generic_grades_taught || '',
                };

                setProfile(loadedProfile);
                setUsernameDraft(loadedProfile.username);
                setDisplayNameDraft(loadedProfile.display_name);
                setGradeDraft(loadedProfile.generic_grades_taught || '');

                // 👇 ADD THESE CODES TO MAKE SURE DRAFTS PRE-COMMIT EXISTING STATE DATA:
                // Pre-fill the district/school search boxes and their
                // "selected" state with whatever this teacher already has
                // saved, so opening the edit sheet shows their CURRENT
                // school info rather than a blank search form every time.
                setDistrictQuery(loadedProfile.school_district_name || '');
                if (loadedProfile.district_id) {
                    setSelectedDistrict({
                        id: loadedProfile.district_id,
                        district_name: loadedProfile.school_district_name || ''
                    });
                }

                setSchoolQuery(loadedProfile.school_name || '');
                if (loadedProfile.school_name && loadedProfile.district_id) {
                    // NOTE: since we don't have the real school's uuid
                    // stored on the profile (only its name), a placeholder
                    // id 'loaded-initial' is used here — this SchoolItem
                    // object exists mainly to make `selectedSchool` non-
                    // null (so the school search UI treats it as already
                    // "confirmed"), not to represent a real registry row.
                    setSelectedSchool({
                        id: 'loaded-initial',
                        school_name: loadedProfile.school_name,
                        district_id: loadedProfile.district_id
                    });
                }

                // Reverse-engineer the avatar customizer's style/seed/
                // background controls from the SAVED full Dicebear URL, so
                // reopening the editor shows the picker state that
                // actually matches the currently saved avatar, instead of
                // resetting to defaults every time.
                if (loadedProfile.avatar_seed && loadedProfile.avatar_seed.includes('?')) {
                    // Parses a URL shaped like:
                    // https://api.dicebear.com/7.x/{style}/svg?seed={seed}&backgroundColor={bg}
                    // by splitting the string on known fixed substrings
                    // rather than using a proper URL-parsing library —
                    // works, but fragile if Dicebear's URL format ever
                    // changes.
                    const matchStyle = loadedProfile.avatar_seed.split('/7.x/')[1]?.split('/')[0];
                    const matchSeed = decodeURIComponent(loadedProfile.avatar_seed.split('seed=')[1]?.split('&')[0] || '');
                    const matchBg = loadedProfile.avatar_seed.split('backgroundColor=')[1]?.split('&')[0];

                    if (matchStyle) setChosenStyle(matchStyle);
                    if (matchBg) setChosenBg(matchBg);

                    // If the saved seed does NOT start with the
                    // "EducatorSeed-" prefix, it must have been generated
                    // from the username (the "match public handle" mode),
                    // so restore that toggle. Otherwise, extract the
                    // numeric part after the prefix to restore the exact
                    // seedIndex.
                    if (matchSeed && !matchSeed.startsWith('EducatorSeed-')) {
                        setIsUsingNicknameLook(true);
                    } else if (matchSeed) {
                        const parsedNum = parseInt(matchSeed.replace('EducatorSeed-', ''), 10);
                        // Falls back to seed 1 if parsing somehow fails
                        // (isNaN check), rather than leaving seedIndex as
                        // an invalid NaN value.
                        setSeedIndex(isNaN(parsedNum) ? 1 : parsedNum);
                        setIsUsingNicknameLook(false);
                    }
                }
            }
        } catch (err: any) {
            Alert.alert('Error loading profile', err.message);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        void loadProfileData();
    }, [loadProfileData]);

    // District search
    // Identical debounced-search pattern used in signup.tsx — see that
    // file's comments for the detailed breakdown of the debounce timing.
    useEffect(() => {
        if (districtQuery.trim().length < 2 || selectedDistrict?.district_name === districtQuery) {
            setDistrictResults([]);
            setShowDistrictDropdown(false);
            return;
        }
        const delayFn = setTimeout(async () => {
            setIsSearchingDistricts(true);
            try {
                const { data, error } = await supabase
                    .from('districts_registry')
                    .select('id, district_name')
                    .ilike('district_name', `%${districtQuery}%`)
                    .limit(10);

                if (error) throw error;
                if (data) {
                    setDistrictResults(data);
                    setShowDistrictDropdown(true);
                }
            } catch (err) {
                console.error('Failed querying districts_registry:', err);
            } finally {
                setIsSearchingDistricts(false);
            }
        }, 300);
        return () => clearTimeout(delayFn);
    }, [districtQuery, selectedDistrict]);

    // School search
    useEffect(() => {
        if (!selectedDistrict) {
            setSchoolResults([]);
            setShowSchoolDropdown(false);
            return;
        }
        if (selectedSchool?.school_name === schoolQuery) {
            setSchoolResults([]);
            setShowSchoolDropdown(false);
            return;
        }
        const delayFn = setTimeout(async () => {
            setIsSearchingSchools(true);
            try {
                // Building the query as a `let` variable (rather than a
                // single chained expression) so an extra `.ilike()` filter
                // can be conditionally appended only when there's actual
                // search text — with an empty schoolQuery, this shows
                // EVERY school in the district (up to the limit) rather
                // than requiring the user to type something first.
                let request = supabase
                    .from('schools_registry')
                    .select('id, school_name, district_id')
                    .eq('district_id', selectedDistrict.id)
                    .limit(15);

                if (schoolQuery.trim().length > 0) {
                    request = request.ilike('school_name', `%${schoolQuery}%`);
                }

                const { data, error } = await request;
                if (error) throw error;
                if (data) {
                    setSchoolResults(data);
                    setShowSchoolDropdown(true);
                }
            } catch (err) {
                console.error('Failed querying schools_registry:', err);
            } finally {
                setIsSearchingSchools(false);
            }
        }, 300);
        return () => clearTimeout(delayFn);
    }, [schoolQuery, selectedDistrict, selectedSchool]);

    // The avatar URL actually shown on the main profile page (outside the
    // edit sheet) — whatever's currently saved, or a generic default if
    // this profile has never set one.
    const currentAvatarUrl = useMemo(() => {
        if (!profile?.avatar_seed) return `https://api.dicebear.com/7.x/bottts/svg?seed=default&backgroundColor=ff595e`;
        return profile.avatar_seed;
    }, [profile]);

    // The LIVE preview avatar URL shown inside the edit sheet, rebuilt
    // fresh from whatever style/seed/background the user currently has
    // selected — updates instantly as they tap through options, before
    // anything is actually saved.
    const previewAvatarUrl = useMemo(() => {
        // If "match public handle" mode is on, use the trimmed username
        // draft as the seed; otherwise use the numbered "EducatorSeed-N"
        // pattern.
        const resolvingSeedValue = isUsingNicknameLook ? usernameDraft.trim() : `EducatorSeed-${seedIndex}`;
        // encodeURIComponent escapes the seed value for safe inclusion in
        // a URL (handles spaces, special characters, etc.). Falls back to
        // the literal word 'Educator' if the resolved seed is somehow
        // empty (e.g. username draft is blank while in nickname mode).
        return `https://api.dicebear.com/7.x/${chosenStyle}/svg?seed=${encodeURIComponent(resolvingSeedValue || 'Educator')}&backgroundColor=${chosenBg}`;
    }, [chosenStyle, seedIndex, isUsingNicknameLook, usernameDraft, chosenBg]);

    // Moves to the PREVIOUS numbered seed (wrapping from 1 back around to
    // 50), and switches OFF "match public handle" mode since the user is
    // now manually browsing seeds again.
    function handlePreviousSeed() {
        setIsUsingNicknameLook(false);
        setSeedIndex((prev) => (prev <= 1 ? 50 : prev - 1));
    }

    // Same idea, moving forward and wrapping from 50 back to 1.
    function handleNextSeed() {
        setIsUsingNicknameLook(false);
        setSeedIndex((prev) => (prev >= 50 ? 1 : prev + 1));
    }

    // Switches the avatar to "match public handle" mode — requires a
    // non-empty username first, since an empty seed wouldn't produce a
    // meaningful/consistent avatar.
    function handleToggleMatchPublicHandle() {
        if (!usernameDraft.trim()) {
            Alert.alert('Notice', 'Please enter a valid public handle first.');
            return;
        }
        setIsUsingNicknameLook(true);
    }

    // Same "clear selection if the typed text no longer matches" pattern
    // used in signup.tsx's district/school fields.
    function handleDistrictChangeText(text: string) {
        setDistrictQuery(text);
        if (selectedDistrict && text !== selectedDistrict.district_name) {
            setSelectedDistrict(null);
            setSelectedSchool(null);
            setSchoolQuery('');
        }
    }

    function handleSchoolChangeText(text: string) {
        setSchoolQuery(text);
        if (selectedSchool && text !== selectedSchool.school_name) {
            setSelectedSchool(null);
        }
    }

    // The main "Save Changes" handler for the edit sheet — writes
    // username, display name, avatar, and school/district info all in one
    // update.
    const saveProfileChanges = async () => {
        const cleanUsername = usernameDraft.trim().toLowerCase();
        const cleanDisplayName = displayNameDraft.trim();

        // Local web-vs-native alert helper, same pattern seen in several
        // other screens, just defined inline here rather than as a
        // top-level function.
        const triggerAlert = (title: string, message: string) => {
            if (Platform.OS === 'web') {
                window.alert(`${title}\n\n${message}`);
            } else {
                Alert.alert(title, message);
            }
        };

        if (!cleanUsername || !cleanDisplayName) {
            triggerAlert('Missing Fields', 'Username and Display Name cannot be blank.');
            return;
        }

        try {
            setUpdating(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const finalAvatarUrl = previewAvatarUrl;
            // `?? null` converts a missing selectedDistrict into an
            // explicit database null rather than undefined.
            const finalDistrictId = selectedDistrict?.id ?? null;
            // If a district was picked from the dropdown, use its exact
            // name; otherwise fall back to whatever free text the user
            // typed (or null if that's also empty) — lets a teacher save
            // a district name they typed even if it didn't match a
            // registry entry.
            const finalDistrictName = selectedDistrict?.district_name ?? (districtQuery.trim() || null);
            const finalSchoolName = selectedSchool?.school_name ?? (schoolQuery.trim() || null);

            // 1. Permanently update profile columns inside Supabase cloud storage
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    username: cleanUsername,
                    display_name: cleanDisplayName,
                    avatar_seed: finalAvatarUrl,
                    district_id: finalDistrictId,
                    school_district_name: finalDistrictName,
                    school_name: finalSchoolName,
                    generic_grades_taught: gradeDraft || null,
                })
                .eq('id', user.id);

            if (profileError) throw profileError;

            // 2. Commit confirmed payload text labels directly to local UI state
            // Update local state to immediately reflect the save, rather
            // than re-fetching from the database.
            setProfile({
                username: cleanUsername,
                display_name: cleanDisplayName,
                avatar_seed: finalAvatarUrl,
                app_role: profile?.app_role || 'teacher',
                active_view: profile?.active_view || 'teacher',
                school_district_name: finalDistrictName || '',
                school_name: finalSchoolName || '',
                district_id: finalDistrictId || '',
                generic_grades_taught: gradeDraft,
            });

            setEditOpen(false);

            // A short 80ms delay before showing the success alert — likely
            // gives the modal's own close animation a moment to visually
            // finish first, so the alert doesn't pop up while the sheet is
            // still mid-slide-down.
            setTimeout(() => {
                triggerAlert('Success', 'Profile permanently synchronized with Supabase cloud storage!');
            }, 80);
        } catch (err: any) {
            console.error('Database save failed:', err);
            triggerAlert('Update Failed', err.message || 'An unexpected database error occurred.');
        } finally {
            setUpdating(false);
        }
    };

    // Same optimistic-update pattern for switching between Teacher and
    // Classic (student-style) views, seen in the OKAGE account screen too.
    const handleToggleAppView = async (targetView: 'classic' | 'teacher') => {
        const previousView = profile?.active_view;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setProfile(prev => prev ? { ...prev, active_view: targetView } : null);

            const { error } = await supabase
                .from('profiles')
                .update({ active_view: targetView })
                .eq('id', user.id);

            if (error) throw error;

            if (targetView === 'classic') {
                router.replace('/dashboard' as any);
            } else {
                router.replace('/' as any);
            }
        } catch (err: any) {
            setProfile(prev => prev ? { ...prev, active_view: previousView || prev.active_view } : null);
            Alert.alert('View Switch Failed', err.message || 'Could not update your workspace view.');
        }
    };

    const handleSignOutAction = async () => {
        confirmAlert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log Out',
                style: 'destructive',
                onPress: () => void signOutAndRedirect(router),
            },
        ]);
    };

    if (loading) {
        return (
            <View style={[accountStyles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                {/* Hero Header */}
                <View style={baseStyles.profileImageContainer}>
                    <Pressable style={baseStyles.avatarEditWrapper} onPress={() => setEditOpen(true)} hitSlop={8}>
                        <View style={baseStyles.avatarRing}>
                            <Image source={{ uri: currentAvatarUrl }} style={baseStyles.profileImage} contentFit="contain" />
                        </View>
                        <View style={baseStyles.avatarEditBadge}>
                            <Ionicons name="pencil" size={16} color="#FFF" />
                        </View>
                    </Pressable>
                    <Text style={baseStyles.profileGreeting}>Welcome back, {profile?.display_name || profile?.username || 'Educator'}</Text>
                    <Text style={baseStyles.profileSubtext}>Educator Portal</Text>
                </View>

                {/* View Switcher */}
                <View style={[accountStyles.viewSwitcherBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[accountStyles.switcherTitle, { color: theme.text }]}>Active App View Workspace</Text>
                    <View style={accountStyles.segmentedBar}>
                        <Pressable style={[accountStyles.segmentToggle, profile?.active_view === 'teacher' && { backgroundColor: theme.accent }]} onPress={() => void handleToggleAppView('teacher')}>
                            <Ionicons name="briefcase" size={14} color={profile?.active_view === 'teacher' ? '#FFF' : theme.text} />
                            <Text style={[accountStyles.segmentLabel, profile?.active_view === 'teacher' ? { color: '#FFF' } : { color: theme.text }]}>Teacher Desk</Text>
                        </Pressable>
                        <Pressable style={[accountStyles.segmentToggle, profile?.active_view === 'classic' && { backgroundColor: theme.accent }]} onPress={() => void handleToggleAppView('classic')}>
                            <Ionicons name="walk" size={14} color={profile?.active_view === 'classic' ? '#FFF' : theme.text} />
                            <Text style={[accountStyles.segmentLabel, profile?.active_view === 'classic' ? { color: '#FFF' } : { color: theme.text }]}>Classic Trail</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Actions */}
                <View style={baseStyles.AccountMain}>
                    <Button label="Sign Out Account" onPress={handleSignOutAction} style={{ backgroundColor: '#FF3B30' }} />
                </View>

                <Text style={baseStyles.acknowledgementText}>
                    The GeoQuestOK app is a partnership between the Oklahoma State Department of Education’s
                    Health & Physical Education Department and the Oklahoma Alliance for Geographic Education.
                    This program works to fulfill the “Walk Across Oklahoma” foundation created by Oklahoma House
                    Bill 1647.
                </Text>
            </ScrollView>

            {/* Customize Edit Sheet */}
            <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={accountStyles.overlay}>
                    <AdaptiveBlur />
                    <Pressable style={accountStyles.dismissBackdrop} onPress={() => setEditOpen(false)} />

                    <View style={accountStyles.sheet}>
                        <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <Text style={accountStyles.modalTitle}>Customize Profile Settings</Text>
                            <View style={accountStyles.modalDivider} />

                            {/* Live avatar preview — gets an accent-colored
                                ring around it specifically when "match
                                public handle" mode is active, as a visual
                                cue for that state. */}
                            <View style={accountStyles.previewImageContainer}>
                                <View style={[accountStyles.previewImageWrapper, isUsingNicknameLook && accountStyles.previewImageWrapperActive]}>
                                    <Image source={{ uri: previewAvatarUrl }} style={{ width: 130, height: 130, borderRadius: 20 }} contentFit="contain" />
                                </View>
                            </View>

                            {/* Left/right arrows to cycle through the 50
                                numbered avatar seed variations. */}
                            <View style={accountStyles.arrowPickerContainer}>
                                <Pressable style={accountStyles.arrowButton} onPress={handlePreviousSeed}>
                                    <Text style={accountStyles.arrowButtonText}>‹</Text>
                                </Pressable>
                                <Pressable style={accountStyles.arrowButton} onPress={handleNextSeed}>
                                    <Text style={accountStyles.arrowButtonText}>›</Text>
                                </Pressable>
                            </View>

                            <Pressable style={[accountStyles.defaultResetButton, isUsingNicknameLook && accountStyles.defaultResetButtonActive]} onPress={handleToggleMatchPublicHandle}>
                                <Text style={[accountStyles.defaultResetText, isUsingNicknameLook && accountStyles.defaultResetTextActive]}>
                                    {isUsingNicknameLook ? '✨ Matching Handle Avatar Active' : '✨ Match Public Handle'}
                                </Text>
                            </Pressable>

                            <Text style={accountStyles.label}>AVATAR VECTOR STYLE</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={accountStyles.scrollerWrapperContainer}>
                                {ART_STYLES.map((s) => (
                                    <Pressable key={s} style={[accountStyles.optionChip, chosenStyle === s && accountStyles.optionChipActive]} onPress={() => setChosenStyle(s)}>
                                        <Text style={[accountStyles.optionChipText, chosenStyle === s && accountStyles.optionChipTextActive]}>{s}</Text>
                                    </Pressable>
                                ))}
                            </ScrollView>

                            <Text style={accountStyles.label}>BACKGROUND THEME COLOR</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={accountStyles.scrollerWrapperContainer}>
                                {BG_COLORS.map((color) => (
                                    <Pressable key={color} style={[accountStyles.colorCircle, { backgroundColor: `#${color}` }, chosenBg === color && accountStyles.colorCircleSelected]} onPress={() => setChosenBg(color)} />
                                ))}
                            </ScrollView>

                            <Text style={accountStyles.label}>ROSTER REAL NAME</Text>
                            <TextInput value={displayNameDraft} onChangeText={setDisplayNameDraft} autoCapitalize="words" style={accountStyles.input} placeholder="e.g. Sarah Jennings" placeholderTextColor={theme.subtext} />

                            <Text style={accountStyles.label}>PUBLIC ACCOUNT HANDLE</Text>
                            <TextInput
                                value={usernameDraft}
                                // Editing the username manually automatically
                                // turns OFF "match public handle" preview
                                // mode — since the user is now typing a new
                                // handle, the avatar shouldn't keep
                                // recalculating live off every keystroke
                                // until they explicitly re-enable that mode.
                                onChangeText={(text) => { setUsernameDraft(text); setIsUsingNicknameLook(false); }}
                                autoCapitalize="none"
                                style={accountStyles.input}
                                placeholder="Nickname Handle"
                                placeholderTextColor={theme.subtext}
                            />

                            {/* District */}
                            <View style={accountStyles.fieldBlock}>
                                <Text style={accountStyles.label}>SCHOOL DISTRICT</Text>
                                <TextInput
                                    value={districtQuery}
                                    onChangeText={handleDistrictChangeText}
                                    // Re-shows the dropdown if the user taps
                                    // back into the field and there are
                                    // already cached results from before
                                    // (avoids forcing a fresh search just to
                                    // see the same list again).
                                    onFocus={() => { if (districtResults.length > 0) setShowDistrictDropdown(true); }}
                                    autoCapitalize="words"
                                    style={accountStyles.input}
                                    placeholder="Type district name (e.g., Norman, Moore, Tulsa)..."
                                    placeholderTextColor={theme.subtext}
                                />
                                {isSearchingDistricts && (
                                    <ActivityIndicator size="small" color={theme.accent} style={accountStyles.inlineLoader} />
                                )}
                                {showDistrictDropdown && districtResults.length > 0 && (
                                    <View style={accountStyles.dropdownWindow}>
                                        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                                            {districtResults.map((item) => (
                                                <Pressable
                                                    key={item.id}
                                                    style={accountStyles.dropdownRow}
                                                    onPress={() => {
                                                        setSelectedDistrict(item);
                                                        setDistrictQuery(item.district_name);
                                                        setShowDistrictDropdown(false);
                                                        // Picking a NEW
                                                        // district clears
                                                        // any previously
                                                        // selected school,
                                                        // since it likely
                                                        // belonged to the
                                                        // old district.
                                                        setSelectedSchool(null);
                                                        setSchoolQuery('');
                                                    }}
                                                >
                                                    <Text style={accountStyles.dropdownRowText}>{item.district_name}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>

                            {/* School */}
                            <View style={accountStyles.fieldBlock}>
                                <Text style={accountStyles.label}>YOUR SCHOOL (OPTIONAL)</Text>
                                <TextInput
                                    value={schoolQuery}
                                    onChangeText={handleSchoolChangeText}
                                    onFocus={() => { if (schoolResults.length > 0) setShowSchoolDropdown(true); }}
                                    autoCapitalize="words"
                                    // The school field is only editable once
                                    // a district has actually been chosen —
                                    // `!!selectedDistrict` converts the
                                    // object-or-null into a strict boolean.
                                    editable={!!selectedDistrict}
                                    style={[accountStyles.input, !selectedDistrict && accountStyles.inputDisabled]}
                                    placeholder={selectedDistrict ? 'Search schools in this district...' : 'Select a district first'}
                                    placeholderTextColor={theme.subtext}
                                />
                                {!selectedDistrict && (
                                    <Text style={accountStyles.helperText}>Choose a school district above to search its schools.</Text>
                                )}
                                {isSearchingSchools && (
                                    <ActivityIndicator size="small" color={theme.accent} style={accountStyles.inlineLoader} />
                                )}
                                {showSchoolDropdown && schoolResults.length > 0 && (
                                    <View style={accountStyles.dropdownWindow}>
                                        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                                            {schoolResults.map((item) => (
                                                <Pressable
                                                    key={item.id}
                                                    style={accountStyles.dropdownRow}
                                                    onPress={() => {
                                                        setSelectedSchool(item);
                                                        setSchoolQuery(item.school_name);
                                                        setShowSchoolDropdown(false);
                                                    }}
                                                >
                                                    <Text style={accountStyles.dropdownRowText}>{item.school_name}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>

                            {/* Grade Level Focus Grid Selector */}
                            <Text style={[accountStyles.label, { marginTop: 16, marginBottom: 8 }]}>
                                GRADE LEVEL FOCUS
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                {(['elementary', 'middle_school', 'high_school', 'split_campus'] as const).map((tier) => (
                                    <Pressable
                                        key={tier}
                                        // Styles are written INLINE here
                                        // (rather than via the accountStyles
                                        // factory above) since this grid was
                                        // apparently added later and each
                                        // cell needs several dynamic,
                                        // per-item conditional values.
                                        style={({ pressed }) => [
                                            {
                                                padding: 12,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: gradeDraft === tier ? theme.accent : theme.border,
                                                // A pale peach/cream tint
                                                // (#FFF9F2) for the selected
                                                // cell's background —
                                                // hardcoded rather than
                                                // theme-driven.
                                                backgroundColor: gradeDraft === tier ? '#FFF9F2' : theme.surface,
                                                opacity: pressed ? 0.8 : 1,
                                                // minWidth: '48%' combined
                                                // with flex: 1 achieves the
                                                // same "2 cells per row"
                                                // wrapping trick seen in
                                                // signup.tsx's grid.
                                                minWidth: '48%',
                                                flex: 1
                                            }
                                        ]}
                                        onPress={() => setGradeDraft(tier)}
                                    >
                                        <Text style={{ fontWeight: gradeDraft === tier ? '700' : '500', color: gradeDraft === tier ? theme.accent : theme.text, fontSize: 13 }}>
                                            {tier === 'elementary' && '👶 Elementary'}
                                            {tier === 'middle_school' && '🎒 Middle School'}
                                            {tier === 'high_school' && '🎓 High School'}
                                            {tier === 'split_campus' && '🔄 Split / Multi-Site'}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </ScrollView>

                        <View style={accountStyles.modalActions}>
                            <Pressable style={[accountStyles.actionButton, accountStyles.cancelButton]} onPress={() => setEditOpen(false)}>
                                <Text style={accountStyles.cancelText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={[accountStyles.actionButton, accountStyles.saveButton]} onPress={() => void saveProfileChanges()}>
                                {updating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={accountStyles.saveText}>Save Changes</Text>}
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
