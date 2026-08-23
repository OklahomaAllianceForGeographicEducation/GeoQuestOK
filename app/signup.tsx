// app/signup.tsx
// Streamlined Account Creation focusing on overarching District assignments.
// Individual building and youth group isolation happens on class creation.
// This is the most complex form in the app: it branches into very
// different fields depending on whether the user is signing up as a
// student, K-12 teacher, Site Administrator (principal), District
// Administrator, or youth/scout leader.

import { Link, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
    View,
    useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, Theme } from '../commonStyles';
import Button from '../components/Button';
import WebContainer from '../components/WebContainer';
import { resolveAppShellPath } from '../lib/access';
// A profanity/appropriateness filter used to reject inappropriate usernames.
import { checkIsUsernameAppropriate } from '../utils/profanity';
import { supabase } from '../utils/supabase';

// The top-level account type choice.
type PrimaryRoleType = 'student' | 'educator';
// If 'educator' is picked, which specific kind of educator they are — each
// leads to a different set of follow-up fields. The Higher Education
// Educator ('professor') option is removed for now; District Administrator
// takes its place in the list. K-12 Principal/District Admin (the old
// 'k12_admin') is now Site Administrator, scoped to one school building
// rather than a whole district -- see the branching in signUpWithEmail
// below for what each now maps to.
type EducatorSubGroup = 'k12_teacher' | 'site_admin' | 'youth_leader' | 'district_admin';
// Which grade range this educator primarily works with.
type GradeRangeMetric = 'elementary' | 'middle_school' | 'high_school' | 'split_campus' | 'not_applicable';
// Whether a teacher wants to land on the normal ("classic"/student-style)
// view or the dedicated teacher dashboard by default after signing up.
type TeacherViewPreference = 'classic' | 'teacher';

// A district search result row. email_domain is only ever shown as a hint
// (the actual check happens server-side in supabase/functions/
// create-account) -- null/empty means that district hasn't been set up for
// Teacher/Site Admin/District Admin signup yet.
type RegistryDistrict = {
    id: string;
    district_name: string;
    email_domain: string | null;
};

// A school search result row.
type RegistrySchool = {
    id: string;
    school_name: string;
};

export default function SignUp() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    // Inline, near-the-button replacement for what used to be a generic
    // alert()/Alert.alert() for every validation and request failure on
    // this form. There's no inline success state: a successful signup
    // either navigates away immediately or (email confirmation required)
    // needs to survive the redirect to /login, so that one case stays a
    // blocking alert below.
    const [formError, setFormError] = useState<string | null>(null);
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
    // Free-text organization name, used for youth-leader signups (troop
    // name) instead of the district/school lookup used by K-12 roles.
    const [organizationName, setOrganizationName] = useState('');

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
    // Lets a validation error scroll the form back to the top -- on the
    // expanded educator path the error banner sits screens below the
    // fields it might be naming, with no way to see both at once.
    const scrollRef = useRef<ScrollView>(null);

    // Whenever a new validation/request error appears, scroll back to the
    // top so the user sees the fields again instead of just the banner
    // sitting near the submit button, several screens below on the
    // expanded educator path.
    useEffect(() => {
        if (formError) {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        }
    }, [formError]);

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
                        .select('id, district_name, email_domain')
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
        // Guard against a double-tap firing two concurrent sign-up
        // requests while the first one is still in flight (the shared
        // Button component has no built-in disabled state; this used to
        // be handled by disabling the hand-rolled Pressable directly).
        if (loading) {
            return;
        }

        const cleanUsername = username.trim();
        const cleanDisplayName = displayName.trim();
        const cleanOrganizationName = organizationName.trim();

        if (!cleanDisplayName || !cleanUsername || !email.trim() || !password) {
            setFormError("Fill in your name, nickname, email, and password to continue.");
            return;
        }

        if (password.length < 6) {
            setFormError("Password must be at least 6 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setFormError("Passwords don't match. Re-type them to confirm.");
            return;
        }

        // `emptyList` is passed as a required argument to
        // checkIsUsernameAppropriate but is always empty here — likely a
        // parameter meant for a per-call additional word list that this
        // screen doesn't use, relying only on the built-in list + the
        // remoteBannedWords fetched above.
        const emptyList: string[] = [];
        if (!checkIsUsernameAppropriate(cleanUsername, emptyList, remoteBannedWords)) {
            setFormError("That nickname isn't allowed. Pick a different, school-appropriate nickname.");
            return;
        }

        // Client-side pre-checks only, purely so a missing district/school/
        // organization name gets caught instantly instead of after a round
        // trip -- the create-account Edge Function (supabase/functions/
        // create-account) re-validates all of this itself and is the
        // actually-trusted copy, since a client-only check can be bypassed
        // by anyone calling the function directly.
        if (primaryRole === 'educator') {
            if ((educatorType === 'k12_teacher' || educatorType === 'site_admin' || educatorType === 'district_admin') && !selectedDistrict) {
                setFormError("Search for and select your school district before continuing.");
                return;
            }
            if (educatorType === 'k12_teacher' && !selectedSchool) {
                setFormError("Search for and select your assigned school building before continuing.");
                return;
            }
            if (educatorType === 'site_admin' && !selectedSchool) {
                setFormError("Search for and select the school you administer before continuing.");
                return;
            }
            if (educatorType === 'youth_leader' && !cleanOrganizationName) {
                setFormError("Enter your troop, club, or youth organization name before continuing.");
                return;
            }
        }

        setFormError(null);
        setLoading(true);
        try {
            // The actual account-creation work is wrapped in its own async
            // function so it can be raced against a timeout below. Without
            // this, a hung request would leave "Saving Records..." spinning
            // forever with no feedback -- even though the account may have
            // already been created server-side, as happened during testing.
            const performSignUp = async () => {
                // create-account (supabase/functions/create-account) does
                // everything signUp() + ensureProfileRow() used to do here,
                // PLUS the two things neither of those could do alone: it
                // recomputes role/district/school server-side rather than
                // trusting this client, and -- for K-12 Teacher/Site Admin/
                // District Admin signups -- it checks the entered email's
                // domain against districts_registry.email_domain and either
                // leaves the account requiring email confirmation (Student
                // and Club/Scout/Youth Leader signups skip that step
                // entirely) or blocks the signup outright if the district
                // has no email domain on file yet. See
                // EMAIL_VERIFICATION_SETUP.md for the full picture.
                const { data, error } = await supabase.functions.invoke('create-account', {
                    body: {
                        email,
                        password,
                        username: cleanUsername,
                        displayName: cleanDisplayName,
                        primaryRole,
                        educatorType: primaryRole === 'educator' ? educatorType : undefined,
                        districtId: selectedDistrict?.id ?? null,
                        districtName: selectedDistrict?.district_name ?? null,
                        schoolName: selectedSchool?.school_name ?? null,
                        organizationName: cleanOrganizationName || null,
                        grades: genericGrades,
                        teacherViewPreference,
                    },
                });

                if (error) {
                    // supabase.functions.invoke() surfaces a non-2xx
                    // response as this generic FunctionsHttpError rather
                    // than handing back the JSON body directly -- the
                    // actual { status: 'error', message } payload the
                    // function returned is on error.context, which is a
                    // Response object that still needs its body read.
                    let message = error.message || 'Could not create your account. Try again.';
                    try {
                        const body = await error.context?.json?.();
                        if (body?.message) message = body.message;
                    } catch {
                        // Fall back to error.message above if the error
                        // response body isn't valid JSON for some reason.
                    }
                    setFormError(message);
                    return;
                }

                if (data?.status === 'pending_verification') {
                    console.log('[signUp] pending_verification -- showing Confirm Email alert and routing to /login');
                    showAlert(
                        'Confirm Your School Email',
                        'Please click the link sent to your school email address to activate your account, then log in.'
                    );
                    router.replace('/login');
                    return;
                }

                if (data?.status === 'confirmed') {
                    // Not immediately signed in yet -- create-account used
                    // the admin API to create this account server-side, so
                    // this client still needs its own normal sign-in call
                    // to actually establish a session here.
                    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                    if (signInError) {
                        showAlert('Account Created', 'Your account was created -- please log in.');
                        router.replace('/login');
                        return;
                    }
                    // Route straight to the role's actual shell rather than
                    // "/" -- databaseRole/initialView come back from the
                    // function itself, so there's no need to round-trip
                    // through app/_layout.tsx's async auth listener the way
                    // routing to "/" would. That indirection is also what
                    // used to strand users on the web marketing homepage
                    // (see login.tsx for the full explanation): "/" is a
                    // session-aware screen on native but a static marketing
                    // page on web, so racing an async redirect against it
                    // could leave a signed-in user looking logged-out.
                    const shellPath = resolveAppShellPath({ app_role: data.databaseRole, active_view: data.initialView });
                    console.log('[signUp] confirmed -- routing to', shellPath);
                    router.replace(shellPath);
                    return;
                }

                setFormError('Something unexpected happened creating your account. Try again.');
            };

            // 20s (was 15s) -- this now involves an extra network round
            // trip on the pre-confirmed path (the Edge Function call, then
            // a follow-up signInWithPassword) compared to the old direct
            // signUp() call.
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), 20000);
            });

            await Promise.race([performSignUp(), timeoutPromise]);
        } catch (err: any) {
            if (err.message === 'TIMEOUT') {
                setFormError(
                    "This is taking longer than expected. Check your internet connection and try again. If your account was actually created, try logging in instead of signing up again."
                );
            } else {
                setFormError(err.message || "Something went wrong creating your account. Try again.");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}
        >
            <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
              <WebContainer maxWidth={520} style={{ width: '100%' }}>
                <Text style={styles.title}>Walk Across Oklahoma</Text>

                {/* Rendered here (top of form) rather than near the submit
                    button on purpose: scrollRef's scroll-to-top-on-error
                    effect above only actually shows the user this message
                    if it lives somewhere that scrolling to the top brings
                    into view. It used to sit next to the button, where a
                    scroll-to-top hid it instead of revealing it -- the
                    opposite of what the scroll was for. */}
                {formError && <Text style={styles.formError}>{formError}</Text>}

                {/* Same partnership acknowledgement shown on login.tsx and
                    reset-password.tsx (and the student/teacher account
                    screens) -- placed here near the top, not the bottom,
                    since this is the screen where someone commits an
                    email, password, and (for educators) a real school
                    district, making it the highest-scrutiny moment in the
                    flow to carry no trust signal at all. */}
                <Text style={styles.acknowledgementText}>
                    The GeoQuestOK app is a partnership between the Oklahoma State Department of Education’s
                    Health & Physical Education Department and the Oklahoma Alliance for Geographic Education.
                    This program works to fulfill the “Walk Across Oklahoma” foundation created by Oklahoma House
                    Bill 1647.
                </Text>

                {/* Primary Segment Selection */}
                <Text style={styles.sectionLabel}>Choose your account type</Text>
                {/* A custom 2-option "radio button" style selector — React
                    Native has no built-in radio button component, so this
                    is hand-built from Pressable + a circular View that
                    fills in when selected. */}
                <View style={styles.radioGroup}>
                    <Pressable
                        style={[styles.radioCard, primaryRole === 'student' && styles.radioCardActive]}
                        onPress={() => setPrimaryRole('student')}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: primaryRole === 'student' }}
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
                        accessibilityRole="radio"
                        accessibilityState={{ checked: primaryRole === 'educator' }}
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
                        <Text style={styles.sectionLabel}>Which best describes your role?</Text>
                        <View style={{ gap: 8 }}>
                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'k12_teacher' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('k12_teacher')}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: educatorType === 'k12_teacher' }}
                            >
                                <Text style={[styles.roleText, educatorType === 'k12_teacher' && styles.activeCellText]}>🎒 K-12 Classroom Teacher</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'site_admin' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('site_admin')}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: educatorType === 'site_admin' }}
                            >
                                <Text style={[styles.roleText, educatorType === 'site_admin' && styles.activeCellText]}>🏫 Site Administrator (Principal)</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'youth_leader' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('youth_leader')}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: educatorType === 'youth_leader' }}
                            >
                                <Text style={[styles.roleText, educatorType === 'youth_leader' && styles.activeCellText]}>🏕️ Club, Scout, or Youth Program Leader</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.subGroupRowTab, educatorType === 'district_admin' && styles.activeSubGroupTab]}
                                onPress={() => setEducatorType('district_admin')}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: educatorType === 'district_admin' }}
                            >
                                <Text style={[styles.roleText, educatorType === 'district_admin' && styles.activeCellText]}>🏛️ District Administrator</Text>
                            </Pressable>
                        </View>
                    </View>
                )}


                <Text style={styles.sectionLabel}>Personal information</Text>

                <Text style={styles.fieldLabel}>Full name</Text>
                <TextInput
                    style={styles.input}
                    placeholder="First & Last Name (For Official Records)"
                    placeholderTextColor={theme.subtext}
                    value={displayName}
                    onChangeText={(t) => { setDisplayName(t); setFormError(null); }}
                    // Auto-capitalizes the first letter of EACH word (as
                    // opposed to just the first letter of the whole
                    // field), appropriate for a full name.
                    autoCapitalize="words"
                    // Disables the OS's spelling autocorrect, since names
                    // often aren't real dictionary words and autocorrect
                    // could mangle them.
                    autoCorrect={false}
                />

                <Text style={styles.fieldLabel}>Nickname</Text>
                <TextInput
                    style={styles.input}
                    placeholder="App Nickname (Public Standings)"
                    placeholderTextColor={theme.subtext}
                    value={username}
                    onChangeText={(t) => { setUsername(t); setFormError(null); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                    style={styles.input}
                    placeholder="you@school.org"
                    placeholderTextColor={theme.subtext}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setFormError(null); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                />

                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Password (6+ characters)"
                    placeholderTextColor={theme.subtext}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setFormError(null); }}
                    secureTextEntry={true}
                    textContentType="newPassword"
                    autoComplete="new-password"
                />

                <Text style={styles.fieldLabel}>Confirm password</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Re-enter Password"
                    placeholderTextColor={theme.subtext}
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setFormError(null); }}
                    secureTextEntry={true}
                    textContentType="newPassword"
                    autoComplete="new-password"
                />

                {/* Only youth leaders see an organization name field — K-12
                    roles (including both admin types) use the
                    district/school registry lookup instead (further
                    below), and students don't need this field at all. */}
                {primaryRole === 'educator' && educatorType === 'youth_leader' && (
                    <>
                        <Text style={styles.sectionLabel}>Organization name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Troop 271 or YMCA Adventure Club"
                            placeholderTextColor={theme.subtext}
                            value={organizationName}
                            onChangeText={setOrganizationName}
                            autoCapitalize="words"
                        />
                    </>
                )}

                {/* SCHOOL DISTRICT REGISTRY INTERFACE ASSIGNMENT */}
                {/* Shown for k12_teacher, site_admin, and district_admin —
                    the three roles tied to a real school district in the
                    registry database. */}
                {primaryRole === 'educator' && (educatorType === 'k12_teacher' || educatorType === 'site_admin' || educatorType === 'district_admin') && (
                    // zIndex: 100 on this whole section ensures its
                    // floating autocomplete dropdown (below) visually
                    // layers ABOVE any content that comes after it in the
                    // form (like the grade-tier grid), rather than being
                    // hidden underneath it.
                    <View style={{ zIndex: 100 }}>
                        <Text style={styles.sectionLabel}>School district</Text>
                        {/* position: 'relative' here is what allows the
                            dropdown below (which uses position: 'absolute'
                            inside its own style) to position itself
                            relative to THIS box, rather than relative to
                            the whole screen. */}
                        <View style={{ position: 'relative', zIndex: 100 }}>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g., Norman, Moore, Tulsa..."
                                placeholderTextColor={theme.subtext}
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
                            {isSearchingDistricts && <ActivityIndicator size="small" color={theme.accent} style={styles.inlineLoader} />}

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
                                                setFormError(null);
                                            }}
                                        >
                                            <Text style={styles.rowTitle}>{d.district_name}</Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            )}
                            {districtSearchError && <Text style={styles.searchErrorText}>{districtSearchError}</Text>}
                            {/* Hint only -- the actual email-domain check
                                happens server-side in
                                supabase/functions/create-account. Shown for
                                every educator sub-type that reaches this
                                section (k12_teacher, site_admin,
                                district_admin all require a verified school
                                email); youth_leader never gets here. */}
                            {selectedDistrict && (
                                selectedDistrict.email_domain ? (
                                    <Text style={[styles.domainHintText, { color: theme.subtext }]}>
                                        Sign up with your school email ending in @{selectedDistrict.email_domain.split(',')[0].trim()} — you’ll need to confirm it before your account activates.
                                    </Text>
                                ) : (
                                    <Text style={[styles.domainHintText, { color: theme.error }]}>
                                        This district isn’t set up for staff signup yet. Contact OKAGE support before continuing.
                                    </Text>
                                )
                            )}
                        </View>

                        {/* CONDITIONAL ASSIGNED SCHOOL LOOKUP BOX */}
                        {/* Teachers and Site Administrators (principals)
                            each pick one individual school — District
                            Administrators operate at the district level,
                            so this whole section is skipped for them. It
                            also only appears once a district has actually
                            been selected. */}
                        {selectedDistrict && (educatorType === 'k12_teacher' || educatorType === 'site_admin') && (
                            <View style={{ zIndex: 90, marginTop: 4 }}>
                                <Text style={styles.sectionLabel}>
                                    {educatorType === 'site_admin' ? 'School you administer' : 'Assigned school building'}
                                </Text>
                                <View style={{ position: 'relative', zIndex: 90 }}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g., Lincoln Elementary or High School"
                                        autoCorrect={false}
                                        placeholderTextColor={theme.subtext}
                                        value={schoolQuery}
                                        onChangeText={(t) => {
                                            setSchoolQuery(t);
                                            if (selectedSchool && t !== selectedSchool.school_name) {
                                                setSelectedSchool(null);
                                            }
                                        }}
                                    />
                                    {isSearchingSchools && <ActivityIndicator size="small" color={theme.accent} style={styles.inlineLoader} />}

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
                                                        setFormError(null);
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
                        <Text style={styles.sectionLabel}>Primary tracking grade tier</Text>
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
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: genericGrades === tier }}
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

                <Button
                    label={loading ? "Saving Records..." : "Register Profile"}
                    onPress={signUpWithEmail}
                    style={[{ marginTop: 10 }, loading && { opacity: 0.6 }]}
                />

                <Link href="/login" asChild>
                    <Pressable style={{ marginTop: 24, marginBottom: 16 }}>
                        <Text style={{ color: theme.accent, textAlign: 'center', fontWeight: '600' }}>
                            Already registered? Click here to Log In
                        </Text>
                    </Pressable>
                </Link>
              </WebContainer>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    // flexGrow: 1 (instead of flex: 1) on a ScrollView's
    // contentContainerStyle lets the content grow to fill the screen when
    // it's shorter than the viewport (enabling justifyContent: 'center' to
    // actually center it), while still allowing the container to grow
    // TALLER than the screen and scroll when the form's content is long
    // (as it is here with all the educator fields expanded).
    scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.background },
    title: { fontFamily: 'Georgia', fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', color: theme.text },
    // Matches commonStyles.ts' acknowledgementText / login.tsx's copy of
    // it, but with a tighter bottom margin since it sits mid-form here
    // rather than as the very last element on the screen.
    acknowledgementText: {
        fontSize: 11,
        lineHeight: 16,
        color: theme.subtext,
        textAlign: 'center',
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    // Section headers keep the italic Georgia caption -- at 15px it reads
    // like a field-guide section divider and is used sparingly (one per
    // group), so the slant stays legible and distinctive.
    sectionLabel: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15, fontWeight: '700', letterSpacing: 0.2, color: theme.text, marginBottom: 10, marginTop: 12 },
    // Per-field labels are upright Georgia, not italic -- at 13px the
    // slant fought legibility more than it added voice (see login.tsx).
    fieldLabel: { fontFamily: 'Georgia', fontSize: 13, fontWeight: '600', letterSpacing: 0.2, color: theme.subtext, marginBottom: 4 },
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
        borderColor: theme.border,
        backgroundColor: theme.surface,
        borderRadius: 14,
        padding: 14
    },
    radioCardActive: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
    radioCircle: {
        width: 18,
        height: 18,
        borderRadius: 9, // half of 18 → circle
        borderWidth: 2,
        borderColor: theme.subtext,
        // A small top margin nudges the circle down slightly to visually
        // align with the first line of the title text next to it, rather
        // than sitting flush with the very top edge of the card.
        marginTop: 2
    },
    // When active, the circle both changes its border color AND fills in
    // solid accent — the classic "filled radio dot" look.
    radioCircleActive: { borderColor: theme.accent, backgroundColor: theme.accent },
    // Georgia now, matching the field/section labels next to it -- this
    // used to default to the system font, which is exactly the seam
    // where the new italic labels started clashing with un-migrated text.
    radioTitle: { fontFamily: 'Georgia', fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4 },
    radioTitleActive: { color: theme.accent },
    radioSubtitle: { fontSize: 12, color: theme.subtext, lineHeight: 17 },
    subGroupRowTab: { width: '100%', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, alignItems: 'flex-start' },
    activeSubGroupTab: { backgroundColor: theme.accent, borderColor: theme.accent },
    roleText: { fontFamily: 'Georgia', fontSize: 13, fontWeight: '600', color: theme.subtext },
    activeCellText: { color: '#fff', fontWeight: '700' },
    subGroupContainer: { marginTop: 4, marginBottom: 12 },
    input: {
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        fontSize: 16,
        color: theme.text,
        fontFamily: 'Georgia',
        marginBottom: 14,
    },
    // Positions the small loading spinner absolutely within its parent
    // (the `position: 'relative'` wrapper View around each search
    // TextInput), placing it inside the right edge of the input box
    // itself rather than as a separate element below/beside it.
    inlineLoader: { position: 'absolute', right: 14, top: 16, zIndex: 110 },
    dropdownFloatingWindow: {
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
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
    dropdownRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
    searchErrorText: { fontSize: 12, color: theme.error, marginTop: 6, lineHeight: 16 },
    domainHintText: { fontSize: 12, marginTop: 6, lineHeight: 16, fontStyle: 'italic' },
    formError: { fontSize: 13, color: theme.error, textAlign: 'center', lineHeight: 18, marginTop: 8, marginBottom: 12 },
    rowTitle: { fontFamily: 'Georgia', fontSize: 14, fontWeight: '600', color: theme.text },
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
        backgroundColor: theme.surface,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.border
    },
    activeGridCell: { backgroundColor: theme.surface, borderColor: theme.accent },
    gridCellText: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '600', color: theme.text },
    activeGridCellText: { color: theme.accent, fontWeight: '700' },
});
