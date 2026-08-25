// app/teachers.tsx
//
// WHAT THIS SCREEN IS: a marketing/info page aimed specifically at
// teachers, school administrators, and youth/club leaders — a deeper pitch
// for the classroom side of GeoQuestOK than the general homepage gives.
//
// HOW IT'S REACHED: Expo Router maps a file at app/teachers.tsx directly to
// the route "/teachers" — the file's name (minus .tsx) becomes the URL
// path. app/index.web.tsx's "Ready to use GeoQuestOK in your classroom?"
// banner links here via `router.push('/teachers' as any)`, and WebNav
// (the shared top nav bar) presumably links here too.
//
// WHAT THIS FILE DOES: renders a single scrollable page — a hero band, a
// classroom-features grid, a 3-step "getting started" list, a collapsible
// FAQ accordion, an outbound "additional resources" link list, and a final
// call-to-action band — finishing with the shared footer. Every button
// either pushes the user to /signup or /login via expo-router's
// router.push(), or opens an external URL via React Native's Linking API.
// There's no data fetching or Supabase usage anywhere on this screen — all
// the copy (CLASSROOM_FEATURES, GETTING_STARTED_STEPS, FAQ_ITEMS,
// RESOURCE_LINKS below) is hardcoded directly in this file. The one bit of
// local interactivity is the FAQ accordion, tracked with a single
// useState hook (see openFaqId below).

// EDITING THIS PAGE: the FAQ_ITEMS and RESOURCE_LINKS arrays below are the
// two things most likely to change over time — edit the text in those
// arrays directly, no JSX/layout knowledge needed. Everything else follows
// the same section pattern as app/index.web.tsx (hero band, white/cream
// alternating sections, closing CTA band, shared footer).

import { Ionicons } from '@expo/vector-icons';
// useRouter() is expo-router's hook for *programmatic* navigation —
// calling router.push('/signup') etc. from inside an onPress handler,
// rather than using a declarative <Link> element.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    // Linking is React Native's API for opening URLs outside the app —
    // used below to send the FAQ/resource links to an external website in
    // the device/browser's normal web browser.
    Linking,
    // Pressable is React Native's generic "make anything tappable"
    // wrapper — used throughout this file for every button, FAQ row, and
    // outbound link.
    Pressable,
    // ScrollView lets its content scroll vertically when it's taller than
    // the screen — the whole page is wrapped in one, same as index.web.tsx.
    ScrollView,
    // StyleSheet.create() is React Native's way of defining reusable style
    // objects, grouped by section near the bottom of this file.
    StyleSheet,
    // Text is required in React Native to render any visible text.
    Text,
    // useColorScheme() reports whether the device/browser is currently in
    // light or dark mode, re-rendering automatically if it changes.
    useColorScheme,
    // useWindowDimensions() returns the current window width/height and
    // re-renders this component whenever the window is resized — this is
    // what drives the `isWide` responsive breakpoint below.
    useWindowDimensions,
    // View is React Native's basic layout container, the equivalent of a
    // plain <div>.
    View,
} from 'react-native';
// Shared web-only chrome, reused across every page of the marketing site.
import WebFooter from '../components/web/WebFooter';
import WebNav from '../components/web/WebNav';
// BRAND is the light/dark color-token object for this public-facing
// marketing site's visual identity (distinct from the app's main
// colors/commonStyles theme used inside the authenticated app).
import { BRAND } from '../components/web/webBrand';

// What GeoQuestOK actually gives a classroom, grounded in the real
// teacher-facing screens (classes, curriculum, reports). Kept as plain
// data (rather than four hardcoded JSX blocks) so the "CLASSROOM FEATURES"
// section further down can render it with one `.map()` call — `icon`
// values are Ionicons glyph names.
const CLASSROOM_FEATURES = [
    {
        id: 'classes',
        icon: 'people-outline',
        title: 'Classroom Management',
        body: 'Use the teacher dashboard to create classes and manage rosters.',
    },
    {
        id: 'curriculum',
        icon: 'library-outline',
        title: 'Curriculum & Standards',
        body: 'Each trail comes with cross-curricular lessons aligned to Oklahoma State Department of Education standards.',
    },
    {
        id: 'quizzes',
        icon: 'help-circle-outline',
        title: 'Built-In Quizzes',
        body: "Assign standards aligned quizzes to track your students learning.",
    },
    {
        id: 'reports',
        icon: 'bar-chart-outline',
        title: 'Reporting & Grades',
        body: 'Monitor and export student grades, fitness results, and activity logs.',
    },
];

// The 3-step onboarding list shown in the "GETTING STARTED" section.
// Rendered via `.map()` too, with each step's array index used to number
// it (1, 2, 3) in the JSX below rather than storing the number here.
const GETTING_STARTED_STEPS = [
    {
        id: 'signup',
        title: 'Sign Up as an Educator',
        body: 'Choose K-12 teacher, school administrator, youth/scout leader, or higher-ed instructor at signup for a targeted experience. Make sure to add your school name to be included in district reporting.',
    },
    {
        id: 'class',
        title: 'Create Your First Class',
        body: 'Create a class and share it with your students to join.',
    },
    {
        id: 'trail',
        title: 'Assign a Trail & Track Progress',
        body: 'Pick a trail, then assign quizzes. Everything else is automatically graded within the app.',
    },
];

// EDIT THESE: each item is one collapsible FAQ row. `linkLabel`/`linkUrl`
// are optional — add them to end an answer with a tappable outbound link.
const FAQ_ITEMS = [
    {
        id: 'cost',
        question: 'Is GeoQuestOK free for my classroom?',
        answer: "Yes. GeoQuestOK is a free program backed by the Oklahoma Alliance for Geographic Education and the Oklahoma State Department of Education. There is never any cost to your school or district.",
    },
    {
        id: 'grades',
        question: 'What grade levels is this designed for?',
        answer: "The program is built for K-12 classrooms, with content that flexes from elementary through high school. You'll pick your primary grade tier when you sign up.",
    },
    {
        id: 'standards',
        question: 'Does it align with Oklahoma state standards?',
        answer: 'Yes. Trails come with cross-curricular lesson guides tied to Oklahoma State Department of Education standards across physical education, science, mathematics, english language arts, and social studies.',
    },
    {
        id: 'logging',
        question: 'How do students log their miles?',
        answer: "Students log their miles manually using distances calculated from a pedometer, smartwatch, or how many times they went around a track. GeoQuestOK does not directly connect to smartwatches or other automatic health tracking. ",
    },
    {
        id: 'activities',
        question: 'Can students log physical activity other than walking?',
        answer: "Yes. Students can log walking, running, swimming, cycling, and dancing. They are also able to log any other physical activity as `other`",
    },
    {
        id: 'tracking',
        question: "Can I track my students' progress?",
        answer: 'Yes. The Reports tab gives you per-student quiz grades, fitness results, and a day-by-day activity log, plus schoolwide and district-wide totals.',
    },
    {
        id: 'teacher-tracking',
        question: "I want to participate alongside my students. Can I also log my walking distances?",
        answer: 'Teachers can use GeoQuestOK alongside their students. Switch to `Classic Trail` view from your teacher account page to log miles the same way students do. To appear on your class leaderboard, join your own class using the same class code your students use to join.',
    },
    {
        id: 'not-a-teacher',
        question: "I'm not a classroom teacher. Can I still sign up?",
        answer: 'Yes. Signup also supports school administrators, youth and scout group leaders, each with their own setup path.',
    },

    {
        id: 'number-students',
        question: "How many students can I have in each class? How many classes can I have?",
        answer: 'There is no limit to the number of classes you can create or the number of students enrolled in each one.',
    },
    {
        id: 'more-than-one-school',
        question: "What if I teach at more than one school?",
        answer: 'The GeoQuestOK app will prompt you to select a primary school site upon account registration. However, you are able to change the school site that each individual class is associated with, allowing you to create classes at your secondary site.',
    },
    {
        id: 'student-info',
        question: "How is student information managed? Who has access to student data?",
        answer: 'Minimal student information is collected by GeoQuestOK. All data is stored in a private database hosted by supabase. Teachers are able to view data only from students enrolled in their classes. Site administrators, such as principals, are able to view summarized activity data for each student in their school. This only includes the total distance walked and Presidential Physical Fitness Challenge compliance. District level administrators, such as superintendents, can view the total distance walked by each class and school in their district, but cannot see any individual student data. The Oklahoma Alliance for Geographic Education and the Oklahoma State Department of Education are able to view aggregate walking distances per school, but cannot see information from individual classes or students. For additional information, please view our privacy policy.',
        linkLabel: 'View the GeoQuestOK privacy policy',
        linkUrl: 'https://okageweb.org/',
    },




    {
        id: 'about-okage',
        question: 'Who runs this program?',
        answer: 'GeoQuestOK is a project of the Oklahoma Alliance for Geographic Education (OKAGE), in partnership with the Oklahoma State Department of Education and the Oklahoma Historical Society.',
        linkLabel: 'Visit the OKAGE website',
        linkUrl: 'https://geoquestok.org/privacy-policy',
    },
];

// EDIT THESE: add more resource links as they come up — same shape,
// { label, url }. Rendered as tappable outbound links in the "ADDITIONAL
// RESOURCES" section, each opening its `url` via Linking.openURL().
const RESOURCE_LINKS = [
    { id: 'okage', label: 'Oklahoma Alliance for Geographic Education', url: 'https://okageweb.org/' },
    { id: 'osde', label: 'Oklahoma State Department of Education', url: 'https://oklahoma.gov/education.html' },
];

// The default export is the actual screen component that Expo Router
// renders for the "/teachers" route (see the file-level comment at top).
// It takes no props and renders the full scrollable teacher-info page.
export default function TeachersInfoPage() {
    // Gives this component access to expo-router's imperative navigation
    // methods — used below as router.push('/signup') / router.push('/login')
    // when a hero/CTA button is tapped.
    const router = useRouter();
    // Destructures just `width` out of the hook's {width, height} object.
    // Re-renders this component whenever the browser window is resized.
    const { width: windowWidth } = useWindowDimensions();
    // `?? 'light'` supplies a fallback since useColorScheme() can return
    // null before the system preference is known.
    const scheme = useColorScheme() ?? 'light';
    // Looks up the full set of color tokens for whichever scheme is active.
    const theme = BRAND[scheme];
    // The same 900px responsive breakpoint used throughout index.web.tsx:
    // anything 900px or wider switches several sections from a stacked
    // mobile layout to a wider desktop one.
    const isWide = windowWidth >= 900;
    // Tracks which single FAQ row (if any) is currently expanded, by its
    // `id`. Starts pre-opened on the FIRST FAQ item (FAQ_ITEMS[0]?.id) so
    // the accordion doesn't look empty/unused on first load; `null` means
    // no answer text is currently showing. Only one row can be open at a
    // time — clicking a different question's row replaces this value
    // rather than appending to a list, which is what collapses whichever
    // row was previously open.
    const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

    // Opens an external (off-app) URL — used both for FAQ answer links and
    // the "ADDITIONAL RESOURCES" list. Linking.openURL() returns a Promise
    // that rejects if the URL can't be opened; the .catch() here silently
    // swallows that failure since an external link failing to open isn't
    // critical to anything else on this page.
    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => { /* no-op: best-effort external link */ });
    };

    return (
        <ScrollView style={[styles.root, { backgroundColor: theme.surfaceBase }]} contentContainerStyle={styles.rootContent} showsVerticalScrollIndicator={false}>

            <WebNav active="teachers" />

            {/* ── HERO ────────────────────────────────────────────── */}
            <View style={[styles.hero, { backgroundColor: theme.ctaBg }]}>
                <View style={styles.heroInner}>
                    {/* This page's one h1, matching the same fix and
                        rationale as app/index.web.tsx -- a site-wide gap,
                        not specific to the homepage. */}
                    <Text style={[styles.heroTitle, { fontSize: isWide ? 52 : 34 }]} accessibilityRole="header" aria-level={1}>Bring GeoQuestOK to your classroom</Text>
                    <Text style={[styles.heroSubtitle, { fontSize: isWide ? 18 : 15.5 }]}>
                        Free, standards-aligned, and built for K-12 classrooms across Oklahoma.
                    </Text>
                    <View style={[styles.heroActions, isWide && { flexDirection: 'row' }]}>
                        {/* Same primary-button pattern as index.web.tsx:
                            near-black in light mode, bright accent + dark
                            text in dark mode so it doesn't fade into an
                            already-dark hero band. Previously this button
                            used the orange heroBg fill regardless of scheme
                            -- an inconsistency with the homepage's button
                            that this pass also resolves. */}
                        <Pressable onPress={() => router.push('/signup')} style={[styles.heroPrimaryBtn, scheme === 'dark' && { backgroundColor: theme.heroAccent }]} accessibilityRole="link">
                            <Text style={[styles.heroPrimaryBtnText, scheme === 'dark' && { color: BRAND.light.darkBand }]}>Sign Up as an Educator</Text>
                        </Pressable>
                        <Pressable onPress={() => router.push('/login')} style={styles.heroSecondaryBtn} accessibilityRole="link">
                            <Text style={styles.heroSecondaryBtnText}>Already Have an Account? Log In</Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* ── CLASSROOM FEATURES ──────────────────────────────── */}
            {/* One h2 heading followed by a grid of cards built by mapping
                over the CLASSROOM_FEATURES array declared near the top of
                this file. */}
            <View style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 32 : 25 }]} accessibilityRole="header" aria-level={2}>Built with everything you need</Text>

                    <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
                        {/* .map() renders one <View> card per entry in
                            CLASSROOM_FEATURES. `key={feature.id}` is
                            required by React for list rendering — it uses
                            each feature's stable `id` field rather than the
                            array index, so React can correctly track which
                            card is which across re-renders. */}
                        {CLASSROOM_FEATURES.map((feature) => (
                            <View key={feature.id} style={[styles.featureCard, isWide && styles.featureCardWide, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
                                <View style={[styles.featureIconBadge, scheme === 'dark' && { backgroundColor: theme.border }]}>
                                    <Ionicons name={feature.icon as any} size={26} color={theme.pineAccent} />
                                </View>
                                <Text style={[styles.featureTitle, { color: theme.ink }]}>{feature.title}</Text>
                                <Text style={[styles.featureBody, { color: theme.body }]}>{feature.body}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── GETTING STARTED ─────────────────────────────────── */}
            {/* A numbered 3-step list built from GETTING_STARTED_STEPS.
                `.map((step, index) => ...)` uses the second callback
                argument (the array index) to compute a display number —
                `index + 1` turns the zero-based array position (0, 1, 2)
                into the human-friendly "1", "2", "3" shown in each badge. */}
            <View style={[styles.section, { backgroundColor: theme.surfaceRaised }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 32 : 25 }]} accessibilityRole="header" aria-level={2}>Set up is as easy as 1 2 3</Text>

                    <View style={[styles.stepsList, isWide && styles.stepsListWide]}>
                        {GETTING_STARTED_STEPS.map((step, index) => (
                            <View key={step.id} style={[styles.stepRow, isWide && styles.stepRowWide]}>
                                <View style={styles.stepNumberBadge}>
                                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                                </View>
                                <View style={styles.stepTextBlock}>
                                    <Text style={[styles.stepTitle, { color: theme.ink }]}>{step.title}</Text>
                                    <Text style={[styles.stepBody, { color: theme.body }]}>{step.body}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── FAQ ─────────────────────────────────────────────── */}
            {/* A collapsible accordion built from FAQ_ITEMS. Each row's
                open/closed state is derived from comparing `openFaqId`
                (the single piece of state declared above) against this
                row's own `item.id` — so only ONE row can ever be expanded
                at a time, and tapping an already-open row's question
                collapses it by setting openFaqId back to null. */}
            <View style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 32 : 25 }]} accessibilityRole="header" aria-level={2}>Questions? We have answers!</Text>

                    <View style={[styles.faqList, { borderTopColor: theme.border }]}>
                        {FAQ_ITEMS.map((item) => {
                            // Whether THIS specific row is the currently-open
                            // one — recalculated for every item on every
                            // render of this component.
                            const isOpen = openFaqId === item.id;
                            return (
                                <View key={item.id} style={[styles.faqRow, { borderBottomColor: theme.border }]}>
                                    {/* Tapping the question row toggles this
                                        row's open state: if it's already
                                        open, close it (null); otherwise open
                                        THIS row (which implicitly closes
                                        whatever other row was open, since
                                        openFaqId can only hold one id at a
                                        time). aria-expanded tells assistive
                                        tech whether the answer below is
                                        currently visible. */}
                                    <Pressable
                                        onPress={() => setOpenFaqId(isOpen ? null : item.id)}
                                        style={styles.faqQuestionRow}
                                        accessibilityRole="button"
                                        aria-expanded={isOpen}
                                    >
                                        <Text style={[styles.faqQuestionText, { color: theme.ink }]}>{item.question}</Text>
                                        <Ionicons
                                            name={isOpen ? 'remove' : 'add'}
                                            size={20}
                                            color={theme.pineAccent}
                                        />
                                    </Pressable>
                                    {/* The answer text (and, for the last
                                        FAQ item, an outbound "Visit the
                                        OKAGE website" link) only renders at
                                        all while this row is open — when
                                        `isOpen` is false this whole block
                                        evaluates to false/nothing, so it
                                        isn't just hidden, it isn't mounted. */}
                                    {isOpen && (
                                        <View style={styles.faqAnswerBlock}>
                                            <Text style={[styles.faqAnswerText, { color: theme.body }]}>{item.answer}</Text>
                                            {/* linkUrl/linkLabel are optional
                                                fields on FAQ_ITEMS — most rows
                                                don't have them, so this link
                                                only renders for the one item
                                                (about-okage) that does. */}
                                            {item.linkUrl && (
                                                <Pressable onPress={() => openExternalLink(item.linkUrl)} accessibilityRole="link">
                                                    <Text style={[styles.faqAnswerLink, { color: theme.pineAccent }]}>{item.linkLabel} →</Text>
                                                </Pressable>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </View>
            </View>

            {/* ── ADDITIONAL RESOURCES ────────────────────────────── */}
            {/* Renders one tappable outbound link per entry in
                RESOURCE_LINKS. Tapping calls openExternalLink() (defined
                above), which hands the URL off to the OS/browser via
                Linking. The `style` prop here is a FUNCTION, not a plain
                object — Pressable supports passing a function that
                receives { pressed } so the row can dim slightly (opacity
                0.7) while actively being pressed. */}
            <View style={[styles.section, { backgroundColor: theme.surfaceRaised }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 32 : 25, marginBottom: 20 }]} accessibilityRole="header" aria-level={2}>Learn more beyond the app.</Text>

                    <View style={styles.resourceList}>
                        {RESOURCE_LINKS.map((resource) => (
                            <Pressable
                                key={resource.id}
                                onPress={() => openExternalLink(resource.url)}
                                style={({ pressed }) => [styles.resourceRow, pressed && { opacity: 0.7 }]}
                                accessibilityRole="link"
                            >
                                <Ionicons name="open-outline" size={18} color={theme.pineAccent} />
                                <Text style={[styles.resourceLabel, { color: theme.ink }]}>{resource.label}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── FINAL CTA BAND ──────────────────────────────────── */}
            {/* Last chance to convert a scrolling teacher/administrator
                into a signup, right before the shared footer — mirrors
                index.web.tsx's own final CTA band. */}
            <View style={[styles.ctaBand, { backgroundColor: theme.heroBg }]}>
                <Text style={[styles.ctaHeading, { fontSize: isWide ? 34 : 24 }]} accessibilityRole="header" aria-level={2}>Ready to bring GeoQuestOK to your classroom?</Text>
                <Pressable onPress={() => router.push('/signup')} style={styles.ctaButton} accessibilityRole="link">
                    <Text style={styles.ctaButtonText}>Sign Up as an Educator</Text>
                </Pressable>
            </View>

            {/* Shared footer, reused across the whole marketing site. */}
            <WebFooter />
        </ScrollView>
    );
}

// StyleSheet.create() groups every style object this screen uses into one
// place, organized below by which section of the page each group belongs
// to (mirrors index.web.tsx's own section-by-section style grouping).
const styles = StyleSheet.create({
    // -- root scroll container styles --
    root: { flex: 1 },
    rootContent: { flexGrow: 1 },

    // -- HERO band styles (headline, subtitle, CTA buttons) --
    hero: { width: '100%', paddingVertical: 64, paddingHorizontal: 24 },
    // maxWidth matches sectionInner below (and the homepage hero) so the
    // headline's left edge lines up with every other section on the page
    // instead of sitting in its own narrower, more-centered column.
    heroInner: { width: '100%', maxWidth: 1160, alignSelf: 'center', alignItems: 'flex-start' },
    heroTitle: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 18 },
    heroSubtitle: { color: '#E4F0EC', lineHeight: 26, marginBottom: 28, maxWidth: 660 },
    heroActions: { flexDirection: 'column', gap: 14 },
    heroPrimaryBtn: { backgroundColor: '#241E18', paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
    heroPrimaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    heroSecondaryBtn: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
    heroSecondaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

    // SECTION SHELL
    section: { width: '100%', paddingVertical: 64, paddingHorizontal: 24 },
    sectionInner: { width: '100%', maxWidth: 1000, alignSelf: 'center', alignItems: 'flex-start' },
    sectionHeading: { fontFamily: 'Georgia', fontWeight: '800', marginBottom: 32 },

    // CLASSROOM FEATURES
    featureGrid: { width: '100%', gap: 18 },
    featureGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
    featureCard: {
        flex: 1,
        minWidth: 220,
        borderRadius: 20,
        padding: 26,
        borderWidth: 1,
    },
    featureCardWide: { flexBasis: '46%' },
    featureIconBadge: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    featureTitle: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 18, marginBottom: 8 },
    featureBody: { fontSize: 14, lineHeight: 21 },

    // GETTING STARTED
    stepsList: { width: '100%', gap: 24 },
    stepsListWide: { flexDirection: 'row', gap: 32 },
    stepRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
    stepRowWide: { flex: 1, flexDirection: 'column', gap: 14 },
    // Pinned to BRAND.light.ctaBg rather than theme.ctaBg -- this is a
    // small solid-fill badge with white text on top, not a section
    // background, and the light-mode pine already gives that white text
    // 7.6:1 regardless of what's behind the badge, so it doesn't need (or
    // benefit from) switching with scheme the way the section fills do.
    stepNumberBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: BRAND.light.ctaBg,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    stepNumberText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    stepTextBlock: { flex: 1 },
    stepTitle: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 16.5, marginBottom: 6 },
    stepBody: { fontSize: 13.5, lineHeight: 20 },

    // FAQ
    faqList: { width: '100%', borderTopWidth: 1 },
    faqRow: { borderBottomWidth: 1, paddingVertical: 18 },
    faqQuestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
    faqQuestionText: { flex: 1, fontFamily: 'Georgia', fontWeight: '700', fontSize: 16 },
    faqAnswerBlock: { marginTop: 12, paddingRight: 32 },
    faqAnswerText: { fontSize: 14.5, lineHeight: 22 },
    faqAnswerLink: { fontSize: 14, fontWeight: '700', marginTop: 10 },

    // RESOURCES
    resourceList: { width: '100%', gap: 4 },
    resourceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    resourceLabel: { fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },

    // FINAL CTA
    ctaBand: { width: '100%', paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
    ctaHeading: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 24, textAlign: 'center' },
    ctaButton: { backgroundColor: '#FFFFFF', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 12 },
    // Pinned to BRAND.light.pineAccent -- this pill is always white
    // regardless of scheme, so its label is too (same reasoning as
    // index.web.tsx's teacherBannerButtonText/ctaButtonText).
    ctaButtonText: { color: BRAND.light.pineAccent, fontWeight: '800', fontSize: 15 },
});
