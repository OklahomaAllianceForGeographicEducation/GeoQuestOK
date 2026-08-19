// app/signup.tsx
// Streamlined Account Creation focusing on overarching District assignments.
// Individual building and youth group isolation happens on class creation.
// This is the most complex form in the app: it branches into very
// different fields depending on whether the user is signing up as a
// student, K-12 teacher, K-12 admin, youth/scout leader, or professor.

import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebContainer from '../components/WebContainer';
import { ensureProfileRow } from '../lib/profiles';
// A profanity/appropriateness filter used to reject inappropriate usernames.
import { checkIsUsernameAppropriate } from '../utils/profanity';
import { supabase } from '../utils/supabase';

// The top-level account type choice.
type PrimaryRoleType = 'student' | 'educator';
// If 'educator' is picked, which specific kind of educator they are — each
// leads to a different set of follow-up fields.
type EducatorSubGroup = 'k12_teacher' | 'k12_admin' | 'youth_leader' | 'professor';
// Which grade range this educator primarily works with.
type GradeRangeMetric = 'elementary' | 'middle_school' | 'high_school' | 'split_campus' | 'not_applicable';
// Whether a teacher wants to land on the normal ("classic"/student-style)
// view or the dedicated teacher dashboard by default after signing up.
type TeacherViewPreference = 'classic' | 'teacher';

// A district search result row.
type RegistryDistrict = {
    id: string;
    district_name: string;
};

// A school search result row.
type RegistrySchool = {
    id: string;
    school_name: string;
};

export default function SignUp() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    // A list of banned words fetched from the database, used ALONGSIDE
    // whatever built-in word list checkIsUsernameAppropriate already has,
    // so moderators can add new banned terms without shipping an app
    // update.
    const [remoteBannedWords, setRemoteBannedWords] = useState<string[]>([]);

    // Role Segmentation Controls
    const [primaryRole, setPrimaryRole] = useState<PrimaryRoleType>('student');
    const [educatorType, setEducatorType] = useState<EducatorSubGroup>('k12_teacher');
    const [genericGrades, setGenericGrades] = useState<GradeRangeMetric>('elementary');
    const [teacherViewPreference, setTeacherViewPreference] = useState<TeacherViewPreference>('teacher');
    // Free-text organization name, used for youth-leader and professor
    // signups (troop name, university name) instead of the district/school
    // lookup used by K-12 roles.
    const [organizationName, setOrganizationName] = useState('');
    // Only used by professors — their department or subject focus.
    const [courseFocus, setCourseFocus] = useState('');

    // District Input & Async Results
    // The raw text currently typed into the district search box.
    const [districtQuery, setDistrictQuery] = useState('');
    // The matching districts returned from the live search.
    const [districtResults, setDistrictResults] = useState<RegistryDistrict[]>([]);
    // The district the user has actually confirmed/picked (as opposed to
    // just typed text that might not match anything).
    const [selectedDistrict, setSelectedDistrict] = useState<RegistryDistrict | null>(null);
    const [showDistrictDropdown, setShowDistrictDropdown] = useState(false);
    const [isSearchingDistricts, setIsSearchingDistricts] = useState(false);
    const [districtSearchError, setDistrictSearchError] = useState<string | null>(null);

    // School Input & Async Results
    // Same pattern as the district search, but scoped to schools WITHIN
    // the already-selected district.
    const [schoolQuery, setSchoolQuery] = useState('');
    const [schoolResults, setSchoolResults] = useState<RegistrySchool[]>([]);
    const [selectedSchool, setSelectedSchool] = useState<RegistrySchool | null>(null);
    const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
    const [isSearchingSchools, setIsSearchingSchools] = useState(false);
    const [schoolSearchError, setSchoolSearchError] = useState<string | null>(null);

    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Fetch the live banned words data collection on mounting layout
    useEffect(() => {
        async function loadBannedWords() {
            if (!supabase) return;
            const { data, error } = await supabase.from('banned_words').select('word');
            if (data && !error) setRemoteBannedWords(data.map(row => row.word));
        }
        void loadBannedWords();
    }, []);

    // Debounced lookup engine querying the Oklahoma Districts Database Table
    // Re-runs whenever the district search text OR the selected district
    // changes.
    useEffect(() => {
        // Skip searching entirely if: the query is too short to be
        // meaningful (fewer than 2 characters), OR the current query text
        // exactly matches the name of the district that's already
        // selected (meaning the user just picked something from the
        // dropdown and the text box updated to match — no need to
        // re-search in that case).
        if (districtQuery.trim().length < 2 || selectedDistrict?.district_name === districtQuery) {
            setDistrictResults([]);
            setShowDistrictDropdown(false);
            return;
        }
        // Debounce: wait 300ms after the user stops typing before
        // actually querying, same pattern used in the standards search
        // screen.
        const delayFn = setTimeout(async () => {
            if (!supabase) return;
            setIsSearchingDistricts(true);
            setDistrictSearchError(null);
            try {
                // Race against a timeout so a hung request can't leave the
                // spinner stuck forever with no way to pick a district --
                // this is exactly what happened during testing over a weak
                // connection.
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('TIMEOUT')), 10000);
                });
                const { data, error } = await Promise.race([
                    supabase
                        .from('districts_registry')
                        .select('id, district_name')
                        // .ilike() is a case-INsensitive pattern match. The
                        // `%` characters are SQL wildcards meaning "any
                        // characters here" — so this matches any district name
                        // that CONTAINS the typed text anywhere in it, not just
                        // ones that start with it.
                        .ilike('district_name', `%${districtQuery}%`)
                        // Cap results at 10 matches, since this is a live
                        // autocomplete dropdown, not a full search results page.
                        .limit(10),
                    timeoutPromise,
                ]);

                if (data && !error) {
                    setDistrictResults(data);
                    setShowDistrictDropdown(true);
                } else if (error) {
                    setDistrictSearchError(error.message || 'District search failed.');
                }
            } catch (err: any) {
                console.error("Failed querying district registries matrix:", err);
                setDistrictSearchError(
                    err?.message === 'TIMEOUT'
                        ? 'District search timed out. Check your connection and try again.'
                        : 'District search failed. Check your connection and try again.'
                );
            } finally {
                setIsSearchingDistricts(false);
            }
        }, 300);
        // Cancel the pending search if the query changes again before the
        // 300ms timer fires (standard debounce cleanup).
        return () => clearTimeout(delayFn);
    }, [districtQuery, selectedDistrict]);

    // Debounced lookup engine querying schools from ONLY the chosen district
    useEffect(() => {
        // This search additionally requires a district to already be
        // selected (schools are always scoped to one district) — and uses
        // a shorter minimum length (1 character instead of 2), since
        // school names within a single district are a much smaller set to
        // search through.
        if (!selectedDistrict || schoolQuery.trim().length < 1 || selectedSchool?.school_name === schoolQuery) {
            setSchoolResults([]);
            setShowSchoolDropdown(false);
            return;
        }
        const delayFn = setTimeout(async () => {
            if (!supabase) return;
            setIsSearchingSchools(true);
            setSchoolSearchError(null);
            try {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('TIMEOUT')), 10000);
                });
                const { data, error } = await Promise.race([
                    supabase
                        .from('schools_registry')
                        .select('id, school_name')
                        // Narrows results to just this district's schools
                        // before applying the text search.
                        .eq('district_id', selectedDistrict.id)
                        .ilike('school_name', `%${schoolQuery}%`)
                        .limit(10),
                    timeoutPromise,
                ]);

                if (data && !error) {
                    setSchoolResults(data);
                    setShowSchoolDropdown(true);
                } else if (error) {
                    setSchoolSearchError(error.message || 'School search failed.');
                }
            } catch (err: any) {
                console.error("Failed querying school registries matrix:", err);
                setSchoolSearchError(
                    err?.message === 'TIMEOUT'
                        ? 'School search timed out. Check your connection and try again.'
                        : 'School search failed. Check your connection and try again.'
                );
            } finally {
                setIsSearchingSchools(false);
            }
        }, 300);
        return () => clearTimeout(delayFn);
    }, [schoolQuery, selectedDistrict, selectedSchool]);

    // Same web-vs-native alert helper pattern as app/login.tsx.
    const showAlert = (title: string, message: string) => {
        console.warn(`[ALERT] ${title}: ${message}`);
        if (Platform.OS === 'web') alert(`${title}\n\n${message}`);
        else Alert.alert(title, message);
    };

    async function signUpWithEmail() {
        const cleanUsername = username.trim();
        const cleanDisplayName = displayName.trim();
        const cleanOrganizationName = organizationName.trim();
        const cleanCourseFocus = courseFocus.trim();

        if (!cleanDisplayName || !cleanUsername || !email.trim() || !password) {
            showAlert("Missing Fields", "Please make sure all basic identification fields are populated.");
            return;
        }

        if (password.length < 6) {
            showAlert("Weak Password", "Password must be at least 6 characters.");
            return;
        }

        if (password !== confirmPassword) {
            showAlert("Passwords Don't Match", "Please make sure both password fields match.");
            return;
        }

        // `emptyList` is passed as a required argument to
        // checkIsUsernameAppropriate but is always empty here — likely a
        // parameter meant for a per-call additional word list that this
        // screen doesn't use, relying only on the built-in list + the
        // remoteBannedWords fetched above.
        const emptyList: string[] = [];
        if (!checkIsUsernameAppropriate(cleanUsername, emptyList, remoteBannedWords)) {
            showAlert("Inappropriate Nickname", "Please pick a school appropriate nickname.");
            return;
        }

        setLoading(true);
        try {
            // These 5 variables accumulate exactly what gets saved to the
            // new profile row, computed based on which role/sub-role path
            // the user is on. They default to plain student values and
            // only get overridden inside the `if (primaryRole ===
            // 'educator')` branch below.
            let databaseRole: 'student' | 'teacher' | 'admin' | 'professor' = 'student';
            let initialView: 'classic' | 'teacher' | 'admin' | 'professor' = 'classic';
            // The actual school BUILDING name -- only k12 teachers have one
            // (admins, youth leaders, and professors operate at the
            // district/organization level, with no individual building).
            let resolvedSchoolName = null as string | null;
            // The district or organization name, shown wherever the UI
            // labels something "district" (e.g. the Reports screen header).
            let resolvedDistrictName = null as string | null;
            let resolvedDistrictId = null as string | null;
            let resolvedGrades: string | null = null;

            if (primaryRole === 'educator') {
                // Each educator sub-type has its OWN required fields and
                // maps to different final database values — this is the
                // core branching logic of the whole signup form.
                if (educatorType === 'k12_teacher') {
                    if (!selectedDistrict) {
                        showAlert("District Required", "Please search for and select your school district.");
                        setLoading(false);
                        return;
                    }
                    if (!selectedSchool) {
                        showAlert("School Required", "Please search for and select your assigned school building.");
                        setLoading(false);
                        return;
                    }
                    databaseRole = 'teacher';
                    // Teachers get to choose (via teacherViewPreference)
                    // whether they land on the teacher dashboard or the
                    // student-style view by default.
                    initialView = teacherViewPreference;
                    resolvedSchoolName = selectedSchool.school_name;
                    resolvedDistrictName = selectedDistrict.district_name;
                    resolvedDistrictId = selectedDistrict.id;
                    resolvedGrades = genericGrades;
                } else if (educatorType === 'k12_admin') {
                    if (!selectedDistrict) {
                        showAlert("District Required", "Please search for and select your school district.");
                        setLoading(false);
                        return;
                    }
                    databaseRole = 'admin';
                    // Admins always default straight to the admin view —
                    // no teacherViewPreference choice for them.
                    initialView = 'admin';
                    // Admins manage a whole district rather than one
                    // building, so there's no individual school name --
                    // resolvedSchoolName stays null.
                    resolvedDistrictName = selectedDistrict.district_name;
                    resolvedDistrictId = selectedDistrict.id;
                    resolvedGrades = genericGrades;
                } else if (educatorType === 'youth_leader') {
                    if (!cleanOrganizationName) {
                        showAlert("Organization Required", "Please enter your troop, club, or youth organization name.");
                        setLoading(false);
                        return;
                    }
                    databaseRole = 'teacher';
                    initialView = 'teacher';
                    // Youth leaders aren't tied to any school district
                    // registry at all — their free-typed organization name
                    // fills the "district" slot instead, and
                    // resolvedDistrictId is left as null.
                    resolvedDistrictName = cleanOrganizationName;
                    resolvedGrades = 'community_youth';
                } else if (educatorType === 'professor') {
                    if (!cleanOrganizationName) {
                        showAlert("Institution Required", "Please enter your college, department, or program name.");
                        setLoading(false);
                        return;
                    }
                    databaseRole = 'professor';
                    initialView = 'professor';
                    resolvedDistrictName = cleanOrganizationName;
                    // Falls back to a generic 'higher_ed' label if the
                    // professor left the optional department/focus field
                    // blank.
                    resolvedGrades = cleanCourseFocus || 'higher_ed';
                }
            }

            // The actual account-creation work is wrapped in its own async
            // function so it can be raced against a timeout below. Without
            // this, a hung request anywhere in this sequence (signUp
            // itself, or the ensureProfileRow write right after it) would
            // leave "Saving Records..." spinning forever with no feedback
            // -- even though the account may have already been created
            // server-side, as happened during testing.
            const performSignUp = async () => {
                // Create the actual Supabase Auth account. The
                // `options.data` object becomes the new user's
                // `user_metadata` — a place Supabase lets you stash extra
                // signup-time info directly on the auth user record itself,
                // separate from the "profiles" table row created afterward.
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            username: cleanUsername,
                            app_role: databaseRole,
                            active_view: initialView,
                        }
                    }
                });

                // TEMP DIAGNOSTIC LOGGING
                console.log('[signUp] error:', error, 'session present:', !!data?.session, 'identities:', data?.user?.identities?.length);

                if (error) {
                    showAlert("Sign Up Error", error.message);
                    return;
                }

                if (data.user) {
                    // `any` type here means this object's shape isn't
                    // strictly checked against ensureProfileRow's expected
                    // parameter type — a looser way of passing this data
                    // through.
                    const profileDataParams: any = {
                        userId: data.user.id,
                        email: data.user.email,
                        username: cleanUsername,
                        display_name: cleanDisplayName,
                        app_role: databaseRole,
                        active_view: initialView,
                        district_id: resolvedDistrictId,
                        school_district_name: resolvedDistrictName,
                        school_name: resolvedSchoolName,
                        generic_grades_taught: resolvedGrades
                    };

                    // Await this creation explicitly so database writes complete BEFORE redirection
                    await ensureProfileRow(profileDataParams);
                }

                // Supabase returns a null session when email confirmation is
                // required before the account becomes fully active — in that
                // case, send the user to the login screen with instructions
                // rather than trying to treat them as already logged in.
                if (data.session === null) {
                    console.log('[signUp] session is null -- showing Confirm Email alert and routing to /login');
                    showAlert("Confirm Email", "Please click the link sent to your email to verify your account.");
                    router.replace('/login');
                } else {
                    // If automatically logged in, send them to index route to recalculate view boundaries
                    console.log('[signUp] session present -- routing to /');
                    router.replace('/');
                }
            };

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), 15000);
            });

            await Promise.race([performSignUp(), timeoutPromise]);
        } catch (err: any) {
            if (err.message === 'TIMEOUT') {
                showAlert(
                    "Sign Up Timed Out",
                    "This is taking longer than expected. Check your internet connection and try again. If your account was actually created, try logging in instead of signing up again."
                );
            } else {
                showAlert("Unexpected Error", err.message || "An exception occurred during registration routing.");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}
        >
            <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
              <WebContainer maxWidth={520} style={{ width: '100%' }}>
                <Text style={styles.title}>Walk Across Oklahoma</Text>

                {/* Primary Segment Selection */}
                <Text style={styles.sectionLabel}>CHOOSE YOUR ACCOUNT TYPE</Text>
                {/* A custom 2-option "radio button" style selector — React
                    Native has no built-in radio button component, so this
                    is hand-built from Pressable + a circular View that
                    fills in when selected. */}
                <View style={styles.radioGroup}>
                    <Pressable
                        style={[styles.radioCard, primaryRole === 'student' && styles.radioCardActive]}
                        onPress={() => setPrimaryRole('student')}
                    >
                        <View style={[styles.radioCircle, primaryRole === 'student' && styles.radioCircleActive]} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.radioTitle, primaryRole === 'student' && styles.radioTitleActive]}>Student</Text>
                            <Text style={styles.radioSubtitle}>Use the standard trail, mileage, and leaderboard experience.</Text>
                        </View>
                    </Pressable>

                    <Pressable
                        style={[styles.radioCard, primaryRole === 'educator' && styles.radioCardActive]}
                        onPress={() => setPrimaryRole('educator')}
                    >
                        <View style={[styles.radioCircle, primaryRole === 'educator' && styles.radioCircleActive]} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.radioTitle, primaryRole === 'educator' && styles.radioTitleActive]}>Teacher / Leader</Text>
                            <Text style={styles.radioSubtitle}>Add school or organization details for reporting, classes, and activities.</Text>
                        </View>
                    </Pressable>
                </View>

                {/* Conditional Sub-Group Layout Questions for Educators/Leaders */}
                {/* This entire block, and everything inside it, only
                    renders when 'educator' is selected above — this is
                    where the form dramatically expands with additional
                    role-specific questions. */}
                {primaryRole === 'educator' && (
                    <View style={styles.subGroupContainer}>
                        <Text style={styles.sectionLabel}>WHICH BEST DESCRIBES YOUR ROLE?</Text>
                        <View style={{ gap: 8 }}>
                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'k12_teacher' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('k12_teacher')}
                            >
                                <Text style={[styles.roleText, educatorType === 'k12_teacher' && styles.activeCellText]}>🎒 K-12 Classroom Teacher</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'k12_admin' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('k12_admin')}
                            >
                                <Text style={[styles.roleText, educatorType === 'k12_admin' && styles.activeCellText]}>🏫 K-12 Principal or District Admin</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'youth_leader' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('youth_leader')}
                            >
                                <Text style={[styles.roleText, educatorType === 'youth_leader' && styles.activeCellText]}>🏕️ Club, Scout, or Youth Program Leader</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'professor' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('professor')}
                            >
                                <Text style={[styles.roleText, educatorType === 'professor' && styles.activeCellText]}>🎓 Higher Education Educator</Text>
                            </Pressable>
                        </View>
                    </View>
                )}


                <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>

                <Text style={styles.fieldLabel}>FULL NAME</Text>
                <TextInput
                    style={styles.input}
                    placeholder="First & Last Name (For Official Records)"
                    placeholderTextColor="#757584"
                    value={displayName}
                    onChangeText={setDisplayName}
                    // Auto-capitalizes the first letter of EACH word (as
                    // opposed to just the first letter of the whole
                    // field), appropriate for a full name.
                    autoCapitalize="words"
                    // Disables the OS's spelling autocorrect, since names
                    // often aren't real dictionary words and autocorrect
                    // could mangle them.
                    autoCorrect={false}
                />

                <Text style={styles.fieldLabel}>NICKNAME</Text>
                <TextInput
                    style={styles.input}
                    placeholder="App Nickname (Public Standings)"
                    placeholderTextColor="#757584"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                <Text style={styles.fieldLabel}>EMAIL</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor="#757584"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Password (6+ characters)"
                    placeholderTextColor="#757584"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={true}
                />

                <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Re-enter Password"
                    placeholderTextColor="#757584"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={true}
                />

                {/* Only youth leaders and professors see an organization
                    name field — K-12 roles use the district/school
                    registry lookup instead (further below), and students
                    don't need this field at all. */}
                {primaryRole === 'educator' && (educatorType === 'youth_leader' || educatorType === 'professor') && (
                    <>
                        <Text style={styles.sectionLabel}>
                            {educatorType === 'youth_leader' ? 'ORGANIZATION NAME' : 'COLLEGE OR UNIVERSITY NAME'}
                        </Text>
                        <TextInput
                            style={styles.input}
                            placeholder={educatorType === 'youth_leader' ? 'e.g. Troop 271 or YMCA Adventure Club' : 'e.g. University of Oklahoma'}
                            placeholderTextColor="#757584"
                            value={organizationName}
                            onChangeText={setOrganizationName}
                            autoCapitalize="words"
                        />
                        {/* An even more specific nested condition: ONLY
                            professors (not youth leaders) also see this
                            extra department/focus field. */}
                        {educatorType === 'professor' && (
                            <>
                                <Text style={styles.sectionLabel}>DEPARTMENT OR FOCUS</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. Geography or Education"
                                    placeholderTextColor="#757584"
                                    value={courseFocus}
                                    onChangeText={setCourseFocus}
                                    autoCapitalize="words"
                                />
                            </>
                        )}
                    </>
                )}

                {/* SCHOOL DISTRICT REGISTRY INTERFACE ASSIGNMENT */}
                {/* Shown for k12_teacher and k12_admin only — these are
                    the two roles tied to a real school district in the
                    registry database. */}
                {primaryRole === 'educator' && (educatorType === 'k12_teacher' || educatorType === 'k12_admin') && (
                    // zIndex: 100 on this whole section ensures its
                    // floating autocomplete dropdown (below) visually
                    // layers ABOVE any content that comes after it in the
                    // form (like the grade-tier grid), rather than being
                    // hidden underneath it.
                    <View style={{ zIndex: 100 }}>
                        <Text style={styles.sectionLabel}> SCHOOL DISTRICT</Text>
                        {/* position: 'relative' here is what allows the
                            dropdown below (which uses position: 'absolute'
                            inside its own style) to position itself
                            relative to THIS box, rather than relative to
                            the whole screen. */}
                        <View style={{ position: 'relative', zIndex: 100 }}>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g., Norman, Moore, Tulsa..."
                                placeholderTextColor="#757584"
                                value={districtQuery}
                                autoCorrect={false}
                                onChangeText={(t) => {
                                    setDistrictQuery(t);
                                    // If the user had already picked a
                                    // district but then edits the text
                                    // away from that exact match, clear
                                    // the selection (and any dependent
                                    // school selection too, since it no
                                    // longer applies to a confirmed
                                    // district).
                                    if (selectedDistrict && t !== selectedDistrict.district_name) {
                                        setSelectedDistrict(null);
                                        setSelectedSchool(null);
                                        setSchoolQuery('');
                                    }
                                }}
                            />
                            {isSearchingDistricts && <ActivityIndicator size="small" color="#007AFF" style={styles.inlineLoader} />}

                            {showDistrictDropdown && districtResults.length > 0 && (
                                <ScrollView
                                    style={styles.dropdownFloatingWindow}
                                    keyboardShouldPersistTaps="handled"
                                    // Required on Android (and harmless on
                                    // iOS) to let a ScrollView work
                                    // properly when it's nested inside
                                    // another scrollable container (the
                                    // outer signup form ScrollView) —
                                    // without it, touches meant for this
                                    // inner dropdown list can get
                                    // swallowed by the outer scroll view
                                    // instead.
                                    nestedScrollEnabled={true}
                                >
                                    {districtResults.map((d) => (
                                        <Pressable
                                            key={d.id}
                                            style={styles.dropdownRow}
                                            onPress={() => {
                                                setSelectedDistrict(d);
                                                setDistrictQuery(d.district_name);
                                                setShowDistrictDropdown(false);
                                            }}
                                        >
                                            <Text style={styles.rowTitle}>{d.district_name}</Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            )}
                            {districtSearchError && <Text style={styles.searchErrorText}>{districtSearchError}</Text>}
                        </View>

                        {/* CONDITIONAL ASSIGNED SCHOOL LOOKUP BOX */}
                        {/* Only teachers (not admins) pick an individual
                            school — admins operate at the district level,
                            so this whole section is skipped for them. It
                            also only appears once a district has actually
                            been selected. */}
                        {selectedDistrict && educatorType === 'k12_teacher' && (
                            <View style={{ zIndex: 90, marginTop: 4 }}>
                                <Text style={styles.sectionLabel}>ASSIGNED SCHOOL BUILDING</Text>
                                <View style={{ position: 'relative', zIndex: 90 }}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g., Lincoln Elementary or High School"
                                        autoCorrect={false}
                                        placeholderTextColor="#757584"
                                        value={schoolQuery}
                                        onChangeText={(t) => {
                                            setSchoolQuery(t);
                                            if (selectedSchool && t !== selectedSchool.school_name) {
                                                setSelectedSchool(null);
                                            }
                                        }}
                                    />
                                    {isSearchingSchools && <ActivityIndicator size="small" color="#007AFF" style={styles.inlineLoader} />}

                                    {showSchoolDropdown && schoolResults.length > 0 && (
                                        <ScrollView
                                            style={styles.dropdownFloatingWindow}
                                            keyboardShouldPersistTaps="handled"
                                            nestedScrollEnabled={true}
                                        >
                                            {schoolResults.map((s) => (
                                                <Pressable
                                                    key={s.id}
                                                    style={styles.dropdownRow}
                                                    onPress={() => {
                                                        setSelectedSchool(s);
                                                        setSchoolQuery(s.school_name);
                                                        setShowSchoolDropdown(false);
                                                    }}
                                                >
                                                    <Text style={styles.rowTitle}>{s.school_name}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    )}
                                    {schoolSearchError && <Text style={styles.searchErrorText}>{schoolSearchError}</Text>}
                                </View>
                            </View>
                        )}

                        {/* HIGH LEVEL REPORTING METRIC DROPDOWN */}
                        <Text style={styles.sectionLabel}>PRIMARY TRACKING GRADE TIER</Text>
                        {/* A 2x2-ish grid of grade-tier options (rendered
                            via flexWrap rather than a fixed grid layout —
                            see gridCell's `minWidth: '45%'` below, which
                            forces roughly 2 cells per row since 2 × 45% +
                            gap ≈ 100%). */}
                        <View style={styles.gridContainer}>
                            {(['elementary', 'middle_school', 'high_school', 'split_campus'] as GradeRangeMetric[]).map((tier) => (
                                <Pressable
                                    key={tier}
                                    style={[styles.gridCell, genericGrades === tier && styles.activeGridCell]}
                                    onPress={() => setGenericGrades(tier)}
                                >
                                    {/* Same "only one of these actually
                                        renders text" trick seen in the
                                        teacher reports tab-label logic —
                                        each line only shows if `tier`
                                        matches its specific value. */}
                                    <Text style={[styles.gridCellText, genericGrades === tier && styles.activeGridCellText]}>
                                        {tier === 'elementary' && '👶 Elementary'}
                                        {tier === 'middle_school' && '🎒 Middle School'}
                                        {tier === 'high_school' && '🎓 High School'}
                                        {tier === 'split_campus' && '🔄 Split / Multi-Site'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                        {/* Safe Spacer ensuring layout detachment from email/password items */}
                        <View style={{ height: 12 }} />
                    </View>
                )}



                <Pressable style={[styles.button, loading && { backgroundColor: '#cccccc' }]} onPress={signUpWithEmail} disabled={loading}>
                    <Text style={styles.buttonText}>{loading ? "Saving Records..." : "Register Profile"}</Text>
                </Pressable>

                <Link href="/login" asChild>
                    <Pressable style={{ marginTop: 24, marginBottom: 16 }}>
                        <Text style={{ color: '#007AFF', textAlign: 'center', fontWeight: '600' }}>
                            Already registered? Click here to Log In
                        </Text>
                    </Pressable>
                </Link>
              </WebContainer>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    // flexGrow: 1 (instead of flex: 1) on a ScrollView's
    // contentContainerStyle lets the content grow to fill the screen when
    // it's shorter than the viewport (enabling justifyContent: 'center' to
    // actually center it), while still allowing the container to grow
    // TALLER than the screen and scroll when the form's content is long
    // (as it is here with all the educator fields expanded).
    scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: '#1C1C1E' },
    sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: '#8E8E93', marginBottom: 10, marginTop: 12 },
    fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: '#8E8E93', marginBottom: 4 },
    // NOTE: formContextLabel is defined but never actually used anywhere
    // in the component above — dead/unused style.
    formContextLabel: { fontSize: 11, fontWeight: '700', color: '#007AFF', marginBottom: 6, marginTop: 4 },
    radioGroup: { gap: 10, marginBottom: 12 },
    radioCard: {
        flexDirection: 'row',
        // 'flex-start' (rather than 'center') vertically aligns the radio
        // circle to the TOP of the card, matching where the title text
        // starts, rather than centering it against the taller multi-line
        // subtitle text below the title.
        alignItems: 'flex-start',
        gap: 12,
        borderWidth: 1,
        borderColor: '#D1D1D6',
        backgroundColor: '#F9F9FB',
        borderRadius: 14,
        padding: 14
    },
    radioCardActive: { backgroundColor: '#E8F2FF', borderColor: '#007AFF' },
    radioCircle: {
        width: 18,
        height: 18,
        borderRadius: 9, // half of 18 → circle
        borderWidth: 2,
        borderColor: '#8E8E93',
        // A small top margin nudges the circle down slightly to visually
        // align with the first line of the title text next to it, rather
        // than sitting flush with the very top edge of the card.
        marginTop: 2
    },
    // When active, the circle both changes its border color AND fills in
    // solid blue — the classic "filled radio dot" look.
    radioCircleActive: { borderColor: '#007AFF', backgroundColor: '#007AFF' },
    radioTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
    radioTitleActive: { color: '#005BBB' },
    radioSubtitle: { fontSize: 12, color: '#636366', lineHeight: 17 },
    subGroupRowTab: { width: '100%', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#F2F2F7', borderRadius: 10, alignItems: 'flex-start' },
    activeSubGroupTab: { backgroundColor: '#007AFF' },
    roleText: { fontSize: 13, fontWeight: '600', color: '#636366' },
    // NOTE: activeRoleText is defined but never referenced in the
    // component — activeCellText is used instead for the same purpose
    // (they're nearly identical styles). Another small piece of dead code.
    activeRoleText: { color: '#fff', fontWeight: '700' },
    activeCellText: { color: '#fff', fontWeight: '700' },
    subGroupContainer: { marginTop: 4, marginBottom: 12 },
    // NOTE: viewPreferenceCard, radioRow, smallPill, smallPillActive,
    // smallPillText, and smallPillTextActive are all defined below but
    // none of them are referenced anywhere in the component's JSX above —
    // this looks like leftover styling from an earlier version of the form
    // that had a visible teacherViewPreference picker (the state variable
    // `teacherViewPreference` still exists and is used when saving, just
    // with no UI control left to actually change it from its 'teacher'
    // default).
    viewPreferenceCard: { backgroundColor: '#F2F7FF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#CFE0FF', marginBottom: 12 },
    radioRow: { flexDirection: 'row', gap: 8 },
    smallPill: { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D1D6' },
    smallPillActive: { borderColor: '#007AFF', backgroundColor: '#007AFF' },
    smallPillText: { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
    smallPillTextActive: { color: '#fff' },
    helperText: { fontSize: 12, color: '#636366', marginTop: 10, lineHeight: 17 },
    input: { borderWidth: 1, borderColor: '#757584', padding: 14, borderRadius: 10, marginBottom: 14, fontSize: 15, backgroundColor: '#FAFAFA' },
    // Positions the small loading spinner absolutely within its parent
    // (the `position: 'relative'` wrapper View around each search
    // TextInput), placing it inside the right edge of the input box
    // itself rather than as a separate element below/beside it.
    inlineLoader: { position: 'absolute', right: 14, top: 16, zIndex: 110 },
    dropdownFloatingWindow: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#757584',
        borderRadius: 10,
        // A NEGATIVE top margin pulls the dropdown up slightly to overlap
        // with/sit flush right against the bottom of the input box above
        // it (offsetting the input's own marginBottom: 14), so there's no
        // visible gap between the text field and its dropdown results.
        marginTop: -10,
        marginBottom: 14,
        // Caps the dropdown's height so a long list of matches scrolls
        // internally rather than pushing the rest of the form down the
        // screen.
        maxHeight: 180,
        overflow: 'hidden',
        // Android shadow depth, giving the floating dropdown a subtle
        // "elevated above the page" look.
        elevation: 4,
        zIndex: 999
    },
    dropdownRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
    searchErrorText: { fontSize: 12, color: '#D70015', marginTop: 6, lineHeight: 16 },
    rowTitle: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 60 },
    gridCell: {
        flex: 1,
        // minWidth: '45%' forces each cell to take up at least 45% of the
        // row's width — since two cells at 45% each (90% total) plus the
        // 8px gap comfortably fit in one row, but a third cell wouldn't
        // fit, this naturally wraps the 4 grade-tier options into a 2x2
        // grid without manually specifying rows.
        minWidth: '45%',
        padding: 12,
        backgroundColor: '#F2F2F7',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        // A transparent border (rather than no border at all) is used so
        // the cell's SIZE doesn't shift by 1px when it becomes active and
        // gains a visible colored border — reserving the space for that
        // border up front keeps the layout stable.
        borderColor: 'transparent'
    },
    activeGridCell: { backgroundColor: '#FFF', borderColor: '#007AFF' },
    gridCellText: { fontSize: 12, fontWeight: '600', color: '#1C1C1E' },
    activeGridCellText: { color: '#007AFF', fontWeight: '700' },
    button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
