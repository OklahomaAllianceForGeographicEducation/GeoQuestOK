// app/teachers.tsx

// EDITING THIS PAGE: the FAQ_ITEMS and RESOURCE_LINKS arrays below are the
// two things most likely to change over time — edit the text in those
// arrays directly, no JSX/layout knowledge needed. Everything else follows
// the same section pattern as app/index.web.tsx (hero band, white/cream
// alternating sections, closing CTA band, shared footer).

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import WebFooter from '../components/web/WebFooter';
import WebNav from '../components/web/WebNav';
import { BRAND } from '../components/web/webBrand';

// What GeoQuestOK actually gives a classroom, grounded in the real
// teacher-facing screens (classes, curriculum, reports).
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
        answer: "Yes. GeoQuestOK is a free program backed by the Oklahoma Alliance for Geographic Education and the Oklahoma State Department of Education — there's no cost to your school or district.",
    },
    {
        id: 'grades',
        question: 'What grade levels is this designed for?',
        answer: "The program is built for K-12 classrooms, with content that flexes from elementary through high school. You'll pick your primary grade tier when you sign up.",
    },
    {
        id: 'standards',
        question: 'Does it align with Oklahoma state standards?',
        answer: 'Yes. Trails come with cross-curricular lesson guides tied to Oklahoma State Department of Education standards across PE, health, and social studies.',
    },
    {
        id: 'logging',
        question: 'How do students log their miles?',
        answer: "From a pedometer, a smartwatch, or by entering distance manually — whatever's available in your classroom or at home.",
    },
    {
        id: 'tracking',
        question: "Can I track my students' progress?",
        answer: 'Yes. The Reports tab gives you per-student quiz grades, fitness results, and a day-by-day activity log, plus schoolwide and district-wide totals — all exportable to PDF.',
    },
    {
        id: 'not-a-teacher',
        question: "I'm not a classroom teacher — can I still sign up?",
        answer: 'Yes. Signup also supports school administrators, youth and scout group leaders, and higher-education instructors, each with their own setup path.',
    },
    {
        id: 'about-okage',
        question: 'Who runs this program?',
        answer: 'GeoQuestOK is a project of the Oklahoma Alliance for Geographic Education (OKAGE), in partnership with the Oklahoma State Department of Education and the Oklahoma Historical Society.',
        linkLabel: 'Visit the OKAGE website',
        linkUrl: 'https://okageweb.org/',
    },
];

// EDIT THESE: add more resource links as they come up — same shape,
// { label, url }.
const RESOURCE_LINKS = [
    { id: 'okage', label: 'Oklahoma Alliance for Geographic Education', url: 'https://okageweb.org/' },
    { id: 'osde', label: 'Oklahoma State Department of Education', url: 'https://oklahoma.gov/education.html' },
];

export default function TeachersInfoPage() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    const isWide = windowWidth >= 900;
    const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

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
            <View style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 32 : 25 }]} accessibilityRole="header" aria-level={2}>Built with everything you need</Text>

                    <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
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
            <View style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 32 : 25 }]} accessibilityRole="header" aria-level={2}>Questions? We have answers!</Text>

                    <View style={[styles.faqList, { borderTopColor: theme.border }]}>
                        {FAQ_ITEMS.map((item) => {
                            const isOpen = openFaqId === item.id;
                            return (
                                <View key={item.id} style={[styles.faqRow, { borderBottomColor: theme.border }]}>
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
                                    {isOpen && (
                                        <View style={styles.faqAnswerBlock}>
                                            <Text style={[styles.faqAnswerText, { color: theme.body }]}>{item.answer}</Text>
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
            <View style={[styles.ctaBand, { backgroundColor: theme.heroBg }]}>
                <Text style={[styles.ctaHeading, { fontSize: isWide ? 34 : 24 }]} accessibilityRole="header" aria-level={2}>Ready to bring GeoQuestOK to your classroom?</Text>
                <Pressable onPress={() => router.push('/signup')} style={styles.ctaButton} accessibilityRole="link">
                    <Text style={styles.ctaButtonText}>Sign Up as an Educator</Text>
                </Pressable>
            </View>

            <WebFooter />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    rootContent: { flexGrow: 1 },

    // HERO
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
