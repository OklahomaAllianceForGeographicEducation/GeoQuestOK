// app/teachers.tsx
// "For Teachers" info page on the public marketing site — reached from the
// nav/footer "For Teachers" link on app/index.web.tsx. Unlike index.web.tsx,
// this route has no competing native screen to protect, so it's a plain
// .tsx rather than a .web.tsx split (Expo Router's static web export
// requires a non-platform-specific fallback file for any route that isn't
// the root "/", so splitting it the same way as index.web.tsx would need
// an unused app/teachers.tsx anyway). Nothing in the native tab
// navigators links here, so a native user never encounters it in practice.
//
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
        body: 'Create classes, manage rosters, and toggle student anonymity — all from one teacher dashboard.',
    },
    {
        id: 'curriculum',
        icon: 'library-outline',
        title: 'Curriculum & Standards',
        body: 'Every trail comes with a cross-curricular lesson guide aligned to Oklahoma State Department of Education standards.',
    },
    {
        id: 'quizzes',
        icon: 'help-circle-outline',
        title: 'Built-In Quizzes',
        body: "Assign a trail's quiz questions to your class and track results as students complete them.",
    },
    {
        id: 'reports',
        icon: 'bar-chart-outline',
        title: 'Reporting & Grades',
        body: 'Per-student quiz grades, fitness results, and activity logs — plus school and district-wide totals, exportable to PDF.',
    },
];

const GETTING_STARTED_STEPS = [
    {
        id: 'signup',
        title: 'Sign Up as an Educator',
        body: 'Choose K-12 teacher, school administrator, youth/scout leader, or higher-ed instructor at signup — each gets a tailored setup.',
    },
    {
        id: 'class',
        title: 'Create Your First Class',
        body: 'Build a roster in minutes and share it with your students to join.',
    },
    {
        id: 'trail',
        title: 'Assign a Trail & Track Progress',
        body: 'Pick from twelve trails, assign it to your class, and watch the reports roll in.',
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
    { id: 'okage', label: 'OKAGE — Oklahoma Alliance for Geographic Education', url: 'https://okageweb.org/' },
    { id: 'osde', label: 'Oklahoma State Department of Education', url: 'https://oklahoma.gov/education.html' },
];

export default function TeachersInfoPage() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth >= 900;
    const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => { /* no-op: best-effort external link */ });
    };

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.rootContent} showsVerticalScrollIndicator={false}>

            <WebNav active="teachers" />

            {/* ── HERO ────────────────────────────────────────────── */}
            <View style={[styles.hero, { backgroundColor: BRAND.ctaBg }]}>
                <View style={styles.heroInner}>
                    <Text style={styles.heroKicker}>FOR TEACHERS &amp; YOUTH LEADERS</Text>
                    <Text style={[styles.heroTitle, { fontSize: isWide ? 52 : 34 }]}>Bring Walk Across{'\n'}Oklahoma to your classroom.</Text>
                    <Text style={[styles.heroSubtitle, { fontSize: isWide ? 18 : 15.5 }]}>
                        Free, standards-aligned, and built for K-12 classrooms across Oklahoma — with rosters, curriculum, quizzes, and grading in one place.
                    </Text>
                    <View style={[styles.heroActions, isWide && { flexDirection: 'row' }]}>
                        <Pressable onPress={() => router.push('/signup')} style={styles.heroPrimaryBtn}>
                            <Text style={styles.heroPrimaryBtnText}>Sign Up as an Educator</Text>
                        </Pressable>
                        <Pressable onPress={() => router.push('/login')} style={styles.heroSecondaryBtn}>
                            <Text style={styles.heroSecondaryBtnText}>Already Have an Account? Log In</Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* ── CLASSROOM FEATURES ──────────────────────────────── */}
            <View style={[styles.section, { backgroundColor: BRAND.white }]}>
                <View style={styles.sectionInner}>
                    <Text style={styles.sectionKicker}>WHAT YOU GET</Text>
                    <Text style={[styles.sectionHeading, { fontSize: isWide ? 32 : 25 }]}>Everything a classroom needs, built in.</Text>

                    <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
                        {CLASSROOM_FEATURES.map((feature) => (
                            <View key={feature.id} style={[styles.featureCard, isWide && styles.featureCardWide]}>
                                <View style={styles.featureIconBadge}>
                                    <Ionicons name={feature.icon as any} size={26} color={BRAND.ctaBg} />
                                </View>
                                <Text style={styles.featureTitle}>{feature.title}</Text>
                                <Text style={styles.featureBody}>{feature.body}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── GETTING STARTED ─────────────────────────────────── */}
            <View style={[styles.section, { backgroundColor: BRAND.cream }]}>
                <View style={styles.sectionInner}>
                    <Text style={styles.sectionKicker}>GETTING STARTED</Text>
                    <Text style={[styles.sectionHeading, { fontSize: isWide ? 32 : 25 }]}>Up and running in three steps.</Text>

                    <View style={[styles.stepsList, isWide && styles.stepsListWide]}>
                        {GETTING_STARTED_STEPS.map((step, index) => (
                            <View key={step.id} style={[styles.stepRow, isWide && styles.stepRowWide]}>
                                <View style={styles.stepNumberBadge}>
                                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                                </View>
                                <View style={styles.stepTextBlock}>
                                    <Text style={styles.stepTitle}>{step.title}</Text>
                                    <Text style={styles.stepBody}>{step.body}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── FAQ ─────────────────────────────────────────────── */}
            <View style={[styles.section, { backgroundColor: BRAND.white }]}>
                <View style={styles.sectionInner}>
                    <Text style={styles.sectionKicker}>FAQ</Text>
                    <Text style={[styles.sectionHeading, { fontSize: isWide ? 32 : 25 }]}>Common questions from educators.</Text>

                    <View style={styles.faqList}>
                        {FAQ_ITEMS.map((item) => {
                            const isOpen = openFaqId === item.id;
                            return (
                                <View key={item.id} style={styles.faqRow}>
                                    <Pressable
                                        onPress={() => setOpenFaqId(isOpen ? null : item.id)}
                                        style={styles.faqQuestionRow}
                                    >
                                        <Text style={styles.faqQuestionText}>{item.question}</Text>
                                        <Ionicons
                                            name={isOpen ? 'remove' : 'add'}
                                            size={20}
                                            color={BRAND.ctaBg}
                                        />
                                    </Pressable>
                                    {isOpen && (
                                        <View style={styles.faqAnswerBlock}>
                                            <Text style={styles.faqAnswerText}>{item.answer}</Text>
                                            {item.linkUrl && (
                                                <Pressable onPress={() => openExternalLink(item.linkUrl)}>
                                                    <Text style={styles.faqAnswerLink}>{item.linkLabel} →</Text>
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
            <View style={[styles.section, { backgroundColor: BRAND.cream }]}>
                <View style={styles.sectionInner}>
                    <Text style={styles.sectionKicker}>ADDITIONAL RESOURCES</Text>
                    <Text style={[styles.sectionHeading, { fontSize: isWide ? 32 : 25, marginBottom: 20 }]}>Learn more beyond the app.</Text>

                    <View style={styles.resourceList}>
                        {RESOURCE_LINKS.map((resource) => (
                            <Pressable
                                key={resource.id}
                                onPress={() => openExternalLink(resource.url)}
                                style={({ pressed }) => [styles.resourceRow, pressed && { opacity: 0.7 }]}
                            >
                                <Ionicons name="open-outline" size={18} color={BRAND.ctaBg} />
                                <Text style={styles.resourceLabel}>{resource.label}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── FINAL CTA BAND ──────────────────────────────────── */}
            <View style={[styles.ctaBand, { backgroundColor: BRAND.heroBg }]}>
                <Text style={[styles.ctaHeading, { fontSize: isWide ? 34 : 24 }]}>Ready to bring GeoQuestOK to your classroom?</Text>
                <Pressable onPress={() => router.push('/signup')} style={styles.ctaButton}>
                    <Text style={styles.ctaButtonText}>Sign Up as an Educator</Text>
                </Pressable>
            </View>

            <WebFooter />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BRAND.white },
    rootContent: { flexGrow: 1 },

    // HERO
    hero: { width: '100%', paddingVertical: 64, paddingHorizontal: 24 },
    heroInner: { width: '100%', maxWidth: 800, alignSelf: 'center', alignItems: 'flex-start' },
    heroKicker: { color: '#D7EBE4', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginBottom: 14 },
    heroTitle: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 18 },
    heroSubtitle: { color: '#E4F0EC', lineHeight: 26, marginBottom: 28, maxWidth: 560 },
    heroActions: { flexDirection: 'column', gap: 14 },
    heroPrimaryBtn: { backgroundColor: BRAND.heroBg, paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
    heroPrimaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    heroSecondaryBtn: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
    heroSecondaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

    // SECTION SHELL
    section: { width: '100%', paddingVertical: 64, paddingHorizontal: 24 },
    sectionInner: { width: '100%', maxWidth: 1000, alignSelf: 'center', alignItems: 'flex-start' },
    sectionKicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: BRAND.ctaBg, marginBottom: 10 },
    sectionHeading: { fontFamily: 'Georgia', fontWeight: '800', color: BRAND.ink, marginBottom: 32 },

    // CLASSROOM FEATURES
    featureGrid: { width: '100%', gap: 18 },
    featureGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
    featureCard: {
        flex: 1,
        minWidth: 220,
        backgroundColor: BRAND.cream,
        borderRadius: 20,
        padding: 26,
        borderWidth: 1,
        borderColor: BRAND.border,
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
    featureTitle: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 18, color: BRAND.ink, marginBottom: 8 },
    featureBody: { fontSize: 14, lineHeight: 21, color: '#5A5147' },

    // GETTING STARTED
    stepsList: { width: '100%', gap: 24 },
    stepsListWide: { flexDirection: 'row', gap: 32 },
    stepRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
    stepRowWide: { flex: 1, flexDirection: 'column', gap: 14 },
    stepNumberBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: BRAND.ctaBg,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    stepNumberText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    stepTextBlock: { flex: 1 },
    stepTitle: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 16.5, color: BRAND.ink, marginBottom: 6 },
    stepBody: { fontSize: 13.5, lineHeight: 20, color: '#5A5147' },

    // FAQ
    faqList: { width: '100%', borderTopWidth: 1, borderTopColor: BRAND.border },
    faqRow: { borderBottomWidth: 1, borderBottomColor: BRAND.border, paddingVertical: 18 },
    faqQuestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
    faqQuestionText: { flex: 1, fontFamily: 'Georgia', fontWeight: '700', fontSize: 16, color: BRAND.ink },
    faqAnswerBlock: { marginTop: 12, paddingRight: 32 },
    faqAnswerText: { fontSize: 14.5, lineHeight: 22, color: '#5A5147' },
    faqAnswerLink: { fontSize: 14, fontWeight: '700', color: BRAND.ctaBg, marginTop: 10 },

    // RESOURCES
    resourceList: { width: '100%', gap: 4 },
    resourceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    resourceLabel: { fontSize: 15, fontWeight: '600', color: BRAND.ink, textDecorationLine: 'underline' },

    // FINAL CTA
    ctaBand: { width: '100%', paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
    ctaHeading: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 24, textAlign: 'center' },
    ctaButton: { backgroundColor: '#FFFFFF', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 12 },
    ctaButtonText: { color: BRAND.heroBg, fontWeight: '800', fontSize: 15 },
});
