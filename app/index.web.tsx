// app/index.web.tsx
//
// WHAT THIS FILE IS: the marketing/landing homepage shown to visitors on
// the WEB build of GeoQuestOK, before they've signed in.
//
// HOW IT'S REACHED: Expo Router turns file paths under app/ into URL
// routes. A file literally named "index" maps to the route for its
// folder — here, the root folder — so this screen is what renders at "/".
//
// WHY THIS FILE EXISTS SEPARATELY FROM app/index.tsx: Expo Router (built on
// top of Metro, React Native's bundler) supports "platform extensions" —
// if a file is named `something.web.tsx`, Metro/Expo Router will
// automatically prefer THAT file over the plain `something.tsx` whenever
// it's building for the web platform specifically. Native builds (iOS/
// Android) never see this file at all; they fall back to app/index.tsx
// instead. This lets the same route ("/") show two completely different
// screens depending on platform: a static, SEO-friendly marketing page
// here on web (visitors landing on a browser expect a normal homepage),
// versus whatever app/index.tsx does for a native app install (typically
// an onboarding flow or a redirect into the authenticated app shell).
// There's no special import or config needed to opt into this — naming
// the file "index.web.tsx" is the entire mechanism.
//
// WHAT THIS FILE DOES: renders a single scrollable page with a hero
// banner, a 3-up feature grid, an "about" mission blurb, sponsor logos,
// a callout banner aimed at teachers, and a final call-to-action band —
// finishing with a shared footer. All the buttons on this page either
// push the user to /signup, /login, or /teachers using expo-router's
// imperative router.push(), or open an external sponsor URL in the
// device's browser via React Native's Linking API. There's no data
// fetching or Supabase usage on this screen at all — every bit of copy
// (FEATURES, SPONSORS arrays below) is hardcoded directly in this file.

import { Ionicons } from '@expo/vector-icons';
// expo-image's <Image> is a drop-in replacement for React Native's built-in
// Image component, with better caching, smoother crossfades, and a
// `contentFit` prop (used below) that's equivalent to CSS's `object-fit`.
import { Image } from 'expo-image';
// useRouter() is expo-router's hook for *programmatic* navigation — i.e.
// navigating in response to code (like a button's onPress), as opposed to
// expo-router's <Link> component, which is used for purely declarative,
// always-there navigation elements (like a nav bar link).
import { useRouter } from 'expo-router';
import React from 'react';
import {
    // Linking is React Native's API for opening URLs outside the app —
    // here, used to send sponsor logo taps to an external website in the
    // device/browser's normal web browser rather than inside the app.
    Linking,
    // Pressable is React Native's generic "make anything tappable"
    // wrapper — the modern replacement for the older TouchableOpacity/
    // TouchableHighlight components. It has no visual style of its own
    // until you give it one, and can optionally receive a function (not
    // just a plain object) as its `style` prop to react to press state
    // (see the `pressed` param used further down in this file).
    Pressable,
    // ScrollView is a container that lets its content scroll vertically
    // (or horizontally) when it's taller/wider than the screen — this
    // whole page is wrapped in one since the marketing page has far more
    // content than fits in one viewport.
    ScrollView,
    // StyleSheet.create() is React Native's way of defining reusable style
    // objects (similar in spirit to CSS classes). It doesn't do anything
    // magical at runtime beyond a small performance optimization — you
    // could pass plain JS objects to `style` instead, but StyleSheet is
    // the idiomatic convention.
    StyleSheet,
    // Text is required in React Native to render any visible text at all
    // — unlike the web, you can't just drop a raw string into a View.
    Text,
    // useColorScheme() is a React Native hook that reports whether the
    // device/browser is currently in light or dark mode, updating
    // automatically if the user changes it while the app is open.
    useColorScheme,
    // useWindowDimensions() is a hook that returns the current screen/
    // window width and height, and — critically — re-renders the
    // component automatically whenever the window is resized (e.g. a
    // browser window being dragged wider). That's what makes the
    // responsive "isWide" layout switch below actually reactive on web.
    useWindowDimensions,
    // View is React Native's basic layout container — the equivalent of a
    // plain <div>, used throughout this file to group and position things
    // with Flexbox.
    View,
} from 'react-native';
// Shared web-only chrome: the footer strip and the top navigation bar,
// each presumably reused across every page in the web marketing site
// (this one, teachers.tsx, privacy-policy.tsx, terms.tsx, etc.).
import WebFooter from '../components/web/WebFooter';
import WebNav from '../components/web/WebNav';
// BRAND is a light/dark color-token object (distinct from the app's main
// `colors`/`commonStyles` theme used elsewhere) specifically for this
// public-facing marketing site's own visual identity.
import { BRAND } from '../components/web/webBrand';

// require(...) is Metro's (React Native's bundler) way of importing a
// static local image file so it can be bundled and referenced by the
// <Image> component below. These are evaluated once, at module-load time,
// rather than being re-required on every render.
const OKAGE_LOGO = require('../assets/images/sponsors/okage-logo.webp');
const OSDE_LOGO = require('../assets/images/sponsors/osde-logo.png');

// The three feature cards shown in the "Fitness, geography, and history"
// section further down. Kept as plain data (rather than three separate
// hardcoded JSX blocks) so the section can be rendered with one `.map()`
// call below — adding a fourth feature later just means adding one more
// object to this array, no JSX changes required. `icon` values are
// Ionicons glyph names (see https://icons.expo.fyi for the full set).
const FEATURES = [
    {
        id: 'explore',
        icon: 'map-outline',
        title: 'Explore Real Oklahoma Landmarks',
        body: `Multiple interactive trails span the state, from Black Mesa in the panhandle to eastern pine forests. Every mile you walk unlocks more of Oklahoma's rich history.`,
    },
    {
        id: 'learn',
        icon: 'book-outline',
        title: 'Learn As You Go',
        body: "Pass landmarks along your trail and unlock lessons on Oklahoma's geography, history, culture and more."
    },
    {
        id: 'motivate',
        icon: 'trophy-outline',
        title: 'Stay Motivated',
        body: 'Log miles from a pedometer, smartwatch, or by hand. Earn badges for milestones and climb the leaderboard against classmates and friends.',
    },
];

// The two program sponsors shown as clickable logos in the "Built with
// Support from" section. Same data-driven pattern as FEATURES above —
// `source` holds the require()'d image asset, `url` is where tapping the
// logo should take the visitor.
const SPONSORS = [
    { id: 'okage', name: 'Oklahoma Alliance for Geographic Education', source: OKAGE_LOGO, url: 'https://okageweb.org/' },
    { id: 'osde', name: 'Oklahoma State Department of Education', source: OSDE_LOGO, url: 'https://oklahoma.gov/education.html' }
];

// The default export is the actual screen component that Expo Router
// renders for the "/" route on web (see the file-level comment at top).
// It takes no props (screen components rendered by the router never do —
// route params would come via expo-router's useLocalSearchParams() hook
// instead, not used here) and renders the full scrollable marketing page.
export default function WebLandingPage() {
    // Gives this component access to expo-router's imperative navigation
    // methods — used below as router.push('/signup') etc. when a button is
    // tapped.
    const router = useRouter();
    // Destructures just the `width` field out of the hook's returned
    // {width, height} object, renaming it to `windowWidth` for clarity.
    const { width: windowWidth } = useWindowDimensions();
    // `?? 'light'` supplies a fallback: useColorScheme() can technically
    // return null (e.g. before the system preference is known), and 'light'
    // is a safe default rather than leaving `scheme` possibly null.
    const scheme = useColorScheme() ?? 'light';
    // Looks up the full set of color tokens (backgrounds, text colors,
    // accents, etc.) for whichever scheme ('light' or 'dark') is active.
    const theme = BRAND[scheme];
    // The single responsive breakpoint this whole page uses: anything
    // 900px or wider is treated as "wide" (roughly tablet/desktop), and
    // switches many sections from a stacked, single-column mobile layout
    // to a side-by-side one. Recalculated automatically on every render
    // because useWindowDimensions() re-renders this component whenever the
    // window is resized.
    const isWide = windowWidth >= 900;

    // Opens an external (off-app) URL, used for the sponsor logos further
    // down. Linking.openURL() returns a Promise that rejects if the URL
    // can't be opened (e.g. blocked by the browser/OS) — the .catch() here
    // just swallows that failure silently rather than showing an error,
    // since a sponsor link failing to open isn't critical to anything else
    // on the page.
    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => { /* no-op: best-effort external link */ });
    };

    return (
        // The whole page is one big ScrollView so it can be taller than the
        // viewport and scroll normally, like any ordinary web page.
        // showsVerticalScrollIndicator={false} just hides the little
        // scrollbar/thumb indicator, purely a visual preference.
        <ScrollView style={[styles.root, { backgroundColor: theme.surfaceBase }]} contentContainerStyle={styles.rootContent} showsVerticalScrollIndicator={false}>

            {/* Shared top navigation bar. `active="home"` presumably tells
                WebNav to visually highlight the "Home" nav link as the
                current page. */}
            <WebNav active="home" />

            {/* ── HERO ────────────────────────────────────────────── */}
            {/* The big top banner: headline, subtitle, two CTA buttons, and
                a small decorative art blob. `isWide` (see above) switches
                this between a stacked mobile layout and a two-column
                desktop one via heroInnerWide. */}
            <View style={[styles.hero, { backgroundColor: theme.heroBg }]}>
                <View style={[styles.heroInner, isWide && styles.heroInnerWide]}>
                    <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
                        {/* The page's one h1 -- everything else below is an
                            h2, giving screen-reader users real heading
                            landmarks to navigate by (previously zero
                            semantic headings existed anywhere on the page). */}
                        <Text style={[styles.heroTitle, { fontSize: isWide ? 60 : 38 }]} accessibilityRole="header" aria-level={1}>Walk Across{'\n'}Oklahoma.</Text>
                        <Text style={[styles.heroSubtitle, { fontSize: isWide ? 19 : 16 }]}>
                            Make every step count by exploring the real geography and history of Oklahoma.
                        </Text>
                        <View style={[styles.heroActions, isWide && { flexDirection: 'row' }]}>
                            {/* Primary button inverts in dark mode -- a
                                near-black espresso fill reads fine against
                                the bright light-mode hero band, but would
                                nearly vanish against dark mode's already-dark
                                one, so dark mode swaps to a bright accent
                                fill with dark text instead (verified 6.7:1). */}
                            {/* router.push('/signup') is expo-router's imperative
                                navigation: calling this function changes the
                                URL/screen, the same way tapping a <Link
                                href="/signup"> would, but triggered from
                                inside an onPress handler instead of a
                                declarative link element. accessibilityRole
                                "link" tells screen readers/assistive tech
                                this Pressable behaves like a hyperlink. */}
                            <Pressable onPress={() => router.push('/signup')} style={[styles.heroPrimaryBtn, scheme === 'dark' && { backgroundColor: theme.heroAccent }]} accessibilityRole="link">
                                <Text style={[styles.heroPrimaryBtnText, scheme === 'dark' && { color: BRAND.light.darkBand }]}>Get Started — It&apos;s Free</Text>
                            </Pressable>
                            {/* Same "lighten a patch of the band" technique
                                as the light-mode default, just with a
                                brighter overlay in dark mode since the band
                                itself is already dark (verified 9.4:1). */}
                            <Pressable onPress={() => router.push('/login')} style={[styles.heroSecondaryBtn, scheme === 'dark' && { backgroundColor: 'rgba(255,255,255,0.12)' }]} accessibilityRole="link">
                                <Text style={styles.heroSecondaryBtnText}>I Already Have an Account</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.heroTrust}>Backed by the Oklahoma State Department of Education and the Oklahoma Alliance for Geographic Education</Text>
                    </View>

                    <View style={[styles.heroArtWrap, isWide && styles.heroArtWrapWide]}>
                        <View style={styles.heroArtBlob}>
                            <Ionicons name="walk" size={104} color="#FFFFFF" />
                        </View>
                        <View style={[styles.heroChip, { top: 6, left: -6 }]}>
                            <Ionicons name="location" size={22} color={theme.heroAccent} />
                        </View>
                        <View style={[styles.heroChip, { bottom: 18, right: -10 }]}>
                            <Ionicons name="trophy" size={22} color={theme.heroAccent} />
                        </View>
                        <View style={[styles.heroChip, { top: '48%', right: -18 }]}>
                            <Ionicons name="book" size={20} color={theme.heroAccent} />
                        </View>
                    </View>
                </View>
            </View>

            {/* ── FEATURES ────────────────────────────────────────── */}
            {/* One h2 heading (aria-level 2) followed by a grid of cards
                built by mapping over the FEATURES array declared near the
                top of this file — each object in that array becomes one
                card below. */}
            <View style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 34 : 26 }]} accessibilityRole="header" aria-level={2}>Fitness, geography, and history, one trail at a time.</Text>

                    <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
                        {/* .map() renders one <View> card per entry in
                            FEATURES. The `key={feature.id}` prop is required
                            by React whenever you render a list like this —
                            it helps React efficiently track which item is
                            which across re-renders, using each feature's
                            stable `id` field rather than its array index. */}
                        {FEATURES.map((feature) => (
                            <View key={feature.id} style={[styles.featureCard, isWide && styles.featureCardWide, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
                                <View style={[styles.featureIconBadge, scheme === 'dark' && { backgroundColor: theme.border }]}>
                                    <Ionicons name={feature.icon as any} size={28} color={theme.heroAccent} />
                                </View>
                                <Text style={[styles.featureTitle, { color: theme.ink }]}>{feature.title}</Text>
                                <Text style={[styles.featureBody, { color: theme.body }]}>{feature.body}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── ABOUT / MISSION ─────────────────────────────────── */}
            {/* Simple static text block, no data-driven list here — just a
                heading + one paragraph on a dark background band. */}
            <View style={[styles.section, { backgroundColor: theme.darkBand }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: BRAND.light.surfaceBase, fontSize: isWide ? 34 : 26 }]} accessibilityRole="header" aria-level={2}>
                        Designed for Oklahomans, by Oklahomans.
                    </Text>
                    <Text style={[styles.aboutBody, { maxWidth: isWide ? 720 : undefined }]}>
                        GeoQuestOK is made in Oklahoma, with Oklahoma students and educators in mind. Each trail was created to focus on what makes our state great. All lessons follow Oklahoma Academic Standards, making them ready for use in the classroom.
                    </Text>

                </View>
            </View>

            {/* ── PARTNERS ────────────────────────────────────────── */}
            {/* Renders one tappable sponsor logo per entry in SPONSORS.
                Tapping a logo calls openExternalLink() (defined above),
                which hands the URL off to the OS/browser via Linking.
                Note the `style` prop here is a FUNCTION, not a plain
                object — Pressable supports passing a function that
                receives { pressed } (whether the element is currently
                being pressed down) so the style can react to touch state,
                here dimming the opacity to 0.7 while pressed. */}
            <View style={[styles.section, { backgroundColor: theme.surfaceRaised }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.heroAccent, fontSize: isWide ? 34 : 26 }]} accessibilityRole="header" aria-level={2}>
                        Built with Support from  </Text>
                    <View style={[styles.sponsorRow, isWide && styles.sponsorRowWide]}>
                        {SPONSORS.map((sponsor) => (
                            <Pressable
                                key={sponsor.id}
                                onPress={() => openExternalLink(sponsor.url)}
                                style={({ pressed }) => [styles.sponsorCard, isWide && styles.sponsorCardWide, { backgroundColor: theme.surfaceBase, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                                accessibilityRole="link"
                                accessibilityLabel={`${sponsor.name} — opens in a new tab`}
                            >
                                {/* contentFit="contain" (expo-image's
                                    equivalent of CSS object-fit: contain)
                                    scales the logo down to fit inside its
                                    box while preserving its aspect ratio,
                                    rather than stretching or cropping it. */}
                                <Image
                                    source={sponsor.source}
                                    style={styles.sponsorLogo}
                                    contentFit="contain"
                                    accessibilityLabel={`${sponsor.name} logo`}
                                />
                            </Pressable>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── TEACHER CALLOUT ─────────────────────────────────── */}
            {/* A single highlighted banner pointing visitors toward the
                dedicated /teachers info page (app/teachers.tsx), rather
                than straight to signup — teachers get a fuller explanation
                of classroom features there first. */}
            <View style={[styles.section, { backgroundColor: theme.surfaceBase, paddingVertical: 56 }]}>
                <View style={styles.sectionInner}>
                    <View style={[styles.teacherBanner, isWide && styles.teacherBannerWide, { backgroundColor: theme.heroBg }]}>
                        <View style={styles.teacherBannerText}>
                            <Text style={[styles.teacherBannerHeading, { fontSize: isWide ? 26 : 21 }]} accessibilityRole="header" aria-level={2}>Ready to use GeoQuestOK in your classroom?</Text>
                            <Text style={styles.teacherBannerBody}>
                                Free curriculum, classroom rosters, built-in quizzes, and reporting. All made for K-12 teachers, youth leaders, and school administrators.
                            </Text>
                        </View>
                        {/* Button pill stays white regardless of scheme, so
                            its label stays pinned to the light-mode pine
                            value rather than following theme.pineAccent --
                            the dark-mode bright pine reads fine on a dark
                            page but fails AA (4.4:1) as text on this always
                            -white pill. */}
                        {/* `as any` sidesteps expo-router's typed-routes
                            checking for this literal path — used when
                            TypeScript can't otherwise confirm '/teachers' is
                            a valid known route string. */}
                        <Pressable onPress={() => router.push('/teachers' as any)} style={styles.teacherBannerButton} accessibilityRole="link">
                            <Text style={styles.teacherBannerButtonText}>For Teachers →</Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* ── FINAL CTA BAND ──────────────────────────────────── */}
            {/* Last chance to convert a scrolling visitor into a signup,
                right before the footer. */}
            <View style={[styles.ctaBand, { backgroundColor: theme.ctaBg }]}>
                <Text style={[styles.ctaHeading, { fontSize: isWide ? 34 : 24 }]} accessibilityRole="header" aria-level={2}>Ready to start your walk?</Text>
                <Pressable onPress={() => router.push('/signup')} style={styles.ctaButton} accessibilityRole="link">
                    <Text style={styles.ctaButtonText}>Create Your Free Account</Text>
                </Pressable>
            </View>

            {/* Shared footer, presumably with legal links (Privacy Policy,
                Terms), reused across the whole marketing site. */}
            <WebFooter />
        </ScrollView>
    );
}

// StyleSheet.create() groups every style object this screen uses into one
// place, organized below by which section of the page each group belongs
// to (the // COMMENTS already split them by section — HERO, SECTION SHELL,
// FEATURES, ABOUT, SPONSORS, TEACHER CALLOUT, FINAL CTA).
const styles = StyleSheet.create({
    // -- root scroll container styles --
    root: { flex: 1 },
    rootContent: { flexGrow: 1 },

    // -- HERO band styles (headline, subtitle, CTA buttons, decorative art) --
    hero: { width: '100%', paddingVertical: 64, paddingHorizontal: 24 },
    heroInner: { width: '100%', maxWidth: 1160, alignSelf: 'center', flexDirection: 'column' },
    heroInnerWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroCopy: { width: '100%' },
    heroCopyWide: { width: '54%' },
    heroTitle: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', lineHeight: undefined, marginBottom: 18 },
    heroSubtitle: { color: '#FFF3E4', lineHeight: 26, marginBottom: 28, maxWidth: 520 },
    heroActions: { flexDirection: 'column', gap: 14, marginBottom: 22 },
    heroPrimaryBtn: { backgroundColor: '#241E18', paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
    heroPrimaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    // A translucent WHITE fill here (as this used to be) lightens the
    // already-mid-toned hero background back up under the button, dropping
    // white label text to ~2.8:1 -- failing AA even after darkening heroBg
    // itself. A translucent BLACK fill instead darkens the patch under the
    // button, keeping the ghost/secondary look while clearing 4.5:1.
    heroSecondaryBtn: { backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
    heroSecondaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
    heroTrust: { color: '#FFE8CC', fontSize: 12.5, lineHeight: 18, maxWidth: 460 },

    heroArtWrap: { alignSelf: 'center', marginTop: 48, width: 220, height: 220, position: 'relative' },
    heroArtWrapWide: { marginTop: 0 },
    heroArtBlob: {
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroChip: {
        position: 'absolute',
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 4,
    },

    // -- SECTION SHELL: shared wrapper styles reused by every content
    // section below (padding, max-width centering, heading typography) --
    section: { width: '100%', paddingVertical: 72, paddingHorizontal: 24 },
    sectionInner: { width: '100%', maxWidth: 1160, alignSelf: 'center', alignItems: 'flex-start' },
    sectionHeading: { fontFamily: 'Georgia', fontWeight: '800', marginBottom: 32 },

    // -- FEATURES: the 3-card grid styles --
    featureGrid: { width: '100%', gap: 20 },
    featureGridWide: { flexDirection: 'row' },
    featureCard: {
        flex: 1,
        borderRadius: 20,
        padding: 28,
        borderWidth: 1,
    },
    featureCardWide: { minWidth: 0 },
    featureIconBadge: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
    },
    featureTitle: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 19, marginBottom: 10 },
    featureBody: { fontSize: 14.5, lineHeight: 22 },

    // -- ABOUT: the single mission-statement paragraph on the dark band --
    aboutBody: { fontSize: 16, lineHeight: 26, color: '#EFE6DA', marginBottom: 16 },

    // -- SPONSORS -- two cards that split the row evenly (flex: 1 each) so
    // together they stretch across the same width as the green teacher
    // banner below, rather than sitting as small fixed-size boxes.
    sponsorRow: { width: '100%', flexDirection: 'column', gap: 20, marginTop: 4 },
    sponsorRowWide: { flexDirection: 'row', gap: 24 },
    sponsorCard: {
        width: '100%',
        height: 150,
        borderRadius: 20,
        borderWidth: 1,
        paddingVertical: 28,
        paddingHorizontal: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sponsorCardWide: { flex: 1, width: undefined, height: 180 },
    sponsorLogo: { width: '100%', height: '100%' },

    // -- TEACHER CALLOUT: the highlighted banner promoting /teachers --
    teacherBanner: {
        width: '100%',
        borderRadius: 24,
        padding: 32,
        gap: 22,
    },
    teacherBannerWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 32 },
    teacherBannerText: { flex: 1 },
    teacherBannerHeading: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
    teacherBannerBody: { fontSize: 14, lineHeight: 21, color: '#E4F0EC', maxWidth: 480 },
    teacherBannerButton: { backgroundColor: '#FFFFFF', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignSelf: 'flex-start' },
    // Pinned to BRAND.light.pineAccent (see the button's own comment
    // above) -- the pill stays white regardless of scheme, so its label
    // does too.
    teacherBannerButtonText: { color: BRAND.light.pineAccent, fontWeight: '800', fontSize: 14.5 },

    // -- FINAL CTA: the closing band right before the footer --
    ctaBand: { width: '100%', paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
    ctaHeading: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 24, textAlign: 'center' },
    ctaButton: { backgroundColor: '#FFFFFF', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 12 },
    // Pinned to BRAND.light.pineAccent for the same reason as
    // teacherBannerButtonText -- this pill is always white too.
    ctaButtonText: { color: BRAND.light.pineAccent, fontWeight: '800', fontSize: 15 },
});
