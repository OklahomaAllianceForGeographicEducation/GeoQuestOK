// app/index.tsx
// This is the ROOT route ("/") of the app — the very first screen shown to
// a logged-out visitor. It's a marketing/onboarding carousel with a
// collapsible login form at the bottom, plus an automatic redirect if the
// visitor already has an active session.
//
// NOTE: on web builds, app/index.web.tsx takes priority over this file for
// the same "/" route (Metro/Expo Router resolve platform-specific
// extensions first) — that file is the full marketing landing page shown
// to first-time web visitors. This screen remains the native app's launch
// screen (and web's fallback if index.web.tsx is ever removed).

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    // These two are TypeScript types describing the shape of the event
    // object React Native's ScrollView gives us on every scroll tick —
    // used to strongly type the `event` parameter in handleScroll below.
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useColorScheme,
    useWindowDimensions,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../commonStyles';
import { supabase } from '../utils/supabase';
import { resolveAppShellPath } from '../lib/access';
import { showAlert } from '../lib/confirmAlert';
import { Sentry } from '../lib/sentry';

// The content for the three onboarding carousel slides, defined as a plain
// array of objects so the render code below can simply .map() over it
// instead of repeating nearly-identical JSX three times.
const CAROUSEL_SLIDES = [
    {
        id: 'slide1',
        icon: 'map-outline',
        title: 'Virtually Walk Oklahoma',
        description: 'An immersive educational fitness journey. Walk actual paths, track physical steps, and explore your state landmark by landmark.',
        tag: 'EXPLORE'
    },
    {
        id: 'slide2',
        icon: 'trail-sign-outline',
        title: 'Discover Paths Across the State',
        description: 'From Black Mesa state heights to eastern pine tree lines, travel past virtual checkpoints filled with geography, geology, environment, and history lessons.',
        tag: 'LEARN'
    },
    {
        id: 'slide3',
        icon: 'journal-outline',
        title: 'Earn Badges',
        description: 'Unlock virtual stickers inside your field logbook by clearing fitness benchmarks and passing localized outdoor checkpoint quizzes.',
        tag: 'EARN'
    }
];

export default function LaunchIntroductionScreen() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isWideLayout = Platform.OS === 'web' && windowWidth >= 900;
    const frameWidth = isWideLayout ? Math.min(windowWidth, 1080) : windowWidth;
    const pagePaddingHorizontal = isWideLayout ? 48 : 36;
    const pageTopPadding = isWideLayout ? 40 : 32;
    const titleFontSize = isWideLayout ? 26 : 18;
    const slideTitleFontSize = isWideLayout ? 26 : 20;
    const slideDescFontSize = isWideLayout ? 15 : 13;
    const slideDescLineHeight = isWideLayout ? 23 : 20;
    const slideDescMaxWidth = isWideLayout ? 640 : undefined;
    const bottomSheetMinHeight = isWideLayout ? Math.max(windowHeight * 0.24, 270) : windowHeight * 0.25;
    const bottomSheetPadding = isWideLayout ? 32 : 24;
    const bottomSheetRadius = isWideLayout ? 28 : 24;

    // Which carousel slide (0, 1, or 2) is currently centered on screen —
    // drives which dot indicator is highlighted below the carousel.
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    // Whether the bottom sheet is showing the "Sign In / Create Account"
    // buttons (false) or the actual email/password login form (true).
    const [isFormVisible, setIsFormVisible] = useState(false);

    // Login form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // NOTE: this screen used to have its own mount-time session check here
    // that redirected to '/dashboard' if a session already existed. That
    // duplicated (and conflicted with) app/_layout.tsx's global
    // onAuthStateChange listener, which already handles this exact case on
    // every auth state change -- including the initial one -- and routes by
    // actual role instead of hardcoding student's '/dashboard' for
    // everyone. Having two independent redirect systems racing against the
    // same AsyncStorage-backed session writes (see utils/supabase.js) was
    // sending teachers back into a dashboard-shaped screen right after
    // signing out. Removed in favor of the single source of truth in
    // _layout.tsx.

    // Fired continuously while the user drags/swipes the horizontal
    // carousel ScrollView, used to figure out which slide is currently
    // the "active" one for the dot indicators below.
    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        // How far (in pixels) the ScrollView's content has been scrolled
        // horizontally from its starting position.
        const contentOffsetX = event.nativeEvent.contentOffset.x;
        // Since each slide is exactly SCREEN_WIDTH wide (see slidePage
        // style below) and pagingEnabled snaps scrolling to full-page
        // increments, dividing the offset by the screen width gives the
        // current slide's index. Math.round smooths out any tiny
        // in-between values while the page is actively snapping into place.
        const index = Math.round(contentOffsetX / frameWidth);
        setCurrentSlideIndex(index);
    };

    const executeLogin = async () => {
        // .trim() strips whitespace so a field containing only spaces
        // still counts as "empty."
        if (!email.trim() || !password.trim()) {
            showAlert("Missing Fields", "Please populate both fields to sign into your trail account.");
            return;
        }

        try {
            setLoading(true);

            // The actual login logic is wrapped in its own async function
            // so it can be raced against a timeout below, without
            // needing a separate named function outside executeLogin.
            const performLogin = async () => {
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password: password,
                });
                if (authError) throw authError;

                if (authData?.session?.user) {
                    // Fetch the user profile to look up their assigned role.
                    // Routed through the same resolveAppShellPath() helper
                    // login.tsx uses -- this form used to hand-roll its own
                    // role branching that only special-cased 'student' and
                    // 'okage' and sent every other role (including 'admin'
                    // and 'site_admin', which each have their own dedicated
                    // shell) to '/(teacher-tabs)'. That branching also raced
                    // app/_layout.tsx's own onAuthStateChange-driven
                    // redirect on the same signInWithPassword() call;
                    // reusing the shared resolver means both redirects now
                    // converge on the same destination regardless of which
                    // one wins the race. Found by an /impeccable audit.
                    const { data: profile, error: profileError } = await supabase
                        .from('profiles')
                        .select('app_role, active_view')
                        .eq('id', authData.session.user.id)
                        .maybeSingle();

                    if (profileError) throw profileError;

                    router.replace(resolveAppShellPath(profile) as any);
                }
            };

            // Never let a hung network request leave the button stuck on
            // "Logging in..." forever with no feedback.
            // Same 15-second race-against-a-timeout pattern used in
            // app/login.tsx — whichever finishes first (the real login, or
            // this timeout) determines what happens next.
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), 15000);
            });

            await Promise.race([performLogin(), timeoutPromise]);
        } catch (err: any) {
            Sentry.captureException(err);
            if (err.message === 'TIMEOUT') {
                showAlert(
                    "Login Timed Out",
                    "This is taking longer than expected. Check your internet connection (try switching between Wi-Fi and cellular data) and try again."
                );
            } else {
                showAlert("Sign In Failed", err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            // paddingTop/paddingBottom use the device's safe-area insets
            // directly on this outermost container (rather than a nested
            // View), since this screen has no separate header/nav bar of
            // its own to handle that spacing.
            style={[styles.canvas, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
        >
            <View style={[styles.pageFrame, { width: frameWidth }]}>
                {/* BRAND HEADER BANNER */}
                <View style={styles.headerArea}>
                    <Text style={[styles.kickerText, { color: theme.subtext }]}>GeoQuestOK • Est. 2026</Text>
                    <Text style={[styles.titleText, { color: theme.text, fontSize: titleFontSize }]}>WALK ACROSS OKLAHOMA</Text>
                    {/* A short decorative horizontal bar/underline beneath the
                        title, purely visual. */}
                    <View style={[styles.dividerDecor, { backgroundColor: theme.accent }]} />
                </View>

                {/* BROCHURE SLIDER FRAME */}
                <View style={styles.carouselContainer}>
                    <ScrollView
                    // Scrolls left-right instead of up-down.
                    horizontal
                    // Makes the ScrollView "snap" to whole-page increments
                    // when the user releases a swipe, rather than stopping
                    // wherever momentum happens to run out — this is what
                    // makes each slide fill the screen cleanly like a
                    // classic onboarding carousel.
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={handleScroll}
                    // How often (in milliseconds) onScroll fires while
                    // actively scrolling. 16 ≈ once per screen frame at 60
                    // frames per second, giving smooth, responsive dot-
                    // indicator updates without flooding with events more
                    // often than the screen can even redraw.
                    scrollEventThrottle={16}
                >
                        {CAROUSEL_SLIDES.map((slide) => (
                            <View key={slide.id} style={[styles.slidePage, { width: frameWidth, paddingHorizontal: pagePaddingHorizontal, paddingTop: pageTopPadding }]}>
                                {/* Static Top-anchored Icon Shield */}
                                <View style={[styles.iconShield, { borderColor: theme.border, backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
                                    <Ionicons name={slide.icon as any} size={36} color={theme.accent} />
                                </View>

                                <Text style={[styles.slideTag, { color: theme.accent }]}>{slide.tag}</Text>

                                {/* Fixed structural alignment wrapper for copy layout blocks */}
                                <View style={styles.textBlock}>
                                    <Text style={[styles.slideTitle, { color: theme.text, fontSize: slideTitleFontSize }]}>{slide.title}</Text>
                                    <Text
                                        style={[
                                            styles.slideDesc,
                                            {
                                                color: theme.text,
                                                fontSize: slideDescFontSize,
                                                lineHeight: slideDescLineHeight,
                                                maxWidth: slideDescMaxWidth,
                                            }
                                        ]}
                                    >
                                        {slide.description}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    {/* DOT INDICATORS */}
                    <View style={styles.indicatorContainer}>
                        {/* We only need each slide's INDEX here, not its data,
                            so the first destructured parameter is thrown away
                            with `_` (a common convention for "I don't need
                            this argument"). */}
                        {CAROUSEL_SLIDES.map((_, idx) => (
                            <View
                                key={idx}
                                style={[
                                    styles.dot,
                                    // The currently active dot is wider (16px)
                                    // and accent-colored; inactive dots are
                                    // narrow (6px) and a neutral border color —
                                    // a common "pill grows when active" pattern
                                    // for page indicators.
                                    currentSlideIndex === idx
                                        ? { backgroundColor: theme.accent, width: 16 }
                                        : { backgroundColor: theme.border, width: 6 }
                                ]}
                            />
                        ))}
                    </View>
                </View>

                {/* BASE SHEET CONTAINER - Set to take up ~25% of the viewport height */}
                <View
                    style={[
                        styles.bottomSheet,
                        {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            shadowColor: theme.shadow,
                            minHeight: bottomSheetMinHeight,
                            padding: bottomSheetPadding,
                            borderTopLeftRadius: bottomSheetRadius,
                            borderTopRightRadius: bottomSheetRadius,
                        }
                    ]}
                >
                {/* Ternary swaps between two whole panels: the initial
                    "Sign In / Create Account" buttons, or (once
                    isFormVisible flips to true) the actual login form. */}
                {!isFormVisible ? (
                    <View style={styles.actionPanel}>
                        <Text style={[styles.sheetTitle, { color: theme.text }]}>Ready to map your trail journey?</Text>

                        {/* Stacking column format for larger, longer buttons */}
                        <View style={styles.buttonStackColumn}>
                            <Pressable
                                style={[styles.actionBtnStacked, { backgroundColor: theme.accent }]}
                                onPress={() => setIsFormVisible(true)}
                            >
                                <Text style={styles.actionBtnText}>Sign In</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.actionBtnStacked, { backgroundColor: theme.secondary }]}
                                onPress={() => router.push('/signup')}
                            >
                                <Text style={styles.actionBtnText}>Create Account</Text>
                            </Pressable>
                        </View>
                    </View>
                ) : (
                    <View style={styles.formContainer}>
                        <View style={styles.formHeaderRow}>
                            <Text style={[styles.formTitle, { color: theme.text }]}>Enter Account Information</Text>
                            <Pressable
                                style={{ paddingVertical: 14, marginVertical: -10 }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                onPress={() => setIsFormVisible(false)}
                            >
                                <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Back to Info</Text>
                            </Pressable>
                        </View>

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>EMAIL</Text>
                        <TextInput
                            style={[styles.textInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
                            accessibilityLabel="Email"
                            placeholder="Email"
                            placeholderTextColor={theme.subtext}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="emailAddress"
                            autoComplete="email"
                            value={email}
                            onChangeText={setEmail}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 12 }]}>PASSWORD</Text>
                        <TextInput
                            style={[styles.textInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
                            accessibilityLabel="Password"
                            placeholder="Password"
                            placeholderTextColor={theme.subtext}
                            secureTextEntry
                            autoCapitalize="none"
                            textContentType="password"
                            autoComplete="password"
                            value={password}
                            onChangeText={setPassword}
                        />

                        <Pressable
                            style={[styles.submitBtn, { backgroundColor: theme.accent }]}
                            onPress={() => void executeLogin()}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Log In</Text>}
                        </Pressable>
                    </View>
                )}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    canvas: { flex: 1 },
    pageFrame: { flex: 1, width: '100%', alignSelf: 'center' },
    headerArea: { alignItems: 'center', marginTop: 10, paddingHorizontal: 24 },
    // fontSize: 8 is extremely small — this "kicker" line (a small
    // eyebrow/tagline above the main title) is meant to be a subtle detail,
    // not something meant to be easily read from a distance.
    kickerText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
    titleText: { fontSize: 18, fontWeight: '800', fontFamily: 'Georgia', letterSpacing: 0.5 },
    // A thin (2px tall), short (36px wide) rounded bar used as a
    // decorative divider under the title.
    dividerDecor: { height: 2, width: 36, marginTop: 8, borderRadius: 1 },

    carouselContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // Each slide fills the responsive frame width so paging still snaps
    // cleanly while the content stays centered on wider browser windows.
    slidePage: { alignItems: 'center' },
    iconShield: {
        width: 72,
        height: 72,
        borderRadius: 36, // half of 72 → perfect circle
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        // The next 5 properties define a soft drop shadow beneath this
        // circular icon badge. shadowColor/shadowOffset/shadowOpacity/
        // shadowRadius are iOS-specific shadow properties; `elevation` is
        // the Android equivalent (Android ignores the iOS shadow* props
        // and uses elevation instead) — both are included so the shadow
        // shows up correctly on either platform.
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 }, // shadow is offset 2px downward, not sideways
        shadowOpacity: 0.05, // very subtle — only 5% opacity
        shadowRadius: 4,     // how blurred/soft the shadow edge is
        elevation: 2         // Android shadow depth (roughly analogous)
    },
    slideTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 16 },
    // minHeight: 140 reserves consistent vertical space for the title +
    // description text block across all three slides, even though slide
    // descriptions are different lengths — this keeps the icon shield and
    // dot indicators from jumping up/down as the user swipes between
    // slides with shorter or longer text.
    textBlock: { minHeight: 140, alignItems: 'center', width: '100%' },
    slideTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'Georgia', marginBottom: 8, textAlign: 'center' },
    slideDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12, fontFamily: 'Georgia' },

    indicatorContainer: { flexDirection: 'row', gap: 6, marginVertical: 12 },
    // Base dot style — width is overridden per-dot inline (6 or 16) based
    // on whether it's the active slide, as seen in the render code above.
    dot: { height: 6, borderRadius: 3 },

    bottomSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        // No border on the bottom edge, since the sheet extends flush to
        // the very bottom of the screen (borderBottomWidth: 0 overrides
        // the borderWidth: 1 set just above it for that one edge only).
        borderBottomWidth: 0,
        // A shadow that projects UPWARD (negative height offset: -4)
        // rather than downward, since this sheet sits at the bottom of the
        // screen and should look like it's "floating" above the content
        // behind it.
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 4
    },
    actionPanel: { alignItems: 'center', width: '100%' },
    sheetTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
    // NOTE: sheetSubtitle is defined here but never actually referenced
    // anywhere in the component above — dead/unused style, presumably left
    // over from an earlier version of this screen that had a subtitle line.
    sheetSubtitle: { fontSize: 12, textAlign: 'center', lineHeight: 17, paddingHorizontal: 10, marginBottom: 16 },

    buttonStackColumn: { flexDirection: 'column', gap: 10, width: '100%' },
    actionBtnStacked: { width: '100%', height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    actionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

    formContainer: { width: '100%' },
    formHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    formTitle: { fontSize: 15, fontWeight: '800' },
    fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
    textInput: { borderWidth: 1, borderRadius: 10, height: 42, paddingHorizontal: 12, fontSize: 14 },
    submitBtn: { height: 44, borderRadius: 12, marginTop: 16, alignItems: 'center', justifyContent: 'center' },
    submitBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 }
});
