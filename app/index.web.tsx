// app/index.web.tsx
// The public marketing landing page for GeoQuestOK. Metro/Expo Router
// resolve platform-specific file extensions before the plain extension, so
// on web builds this file replaces app/index.tsx for the "/" route — the
// native app (iOS/Android) still uses app/index.tsx untouched.
//
// Unlike the native launch screen (a compact onboarding carousel styled
// like the rest of the app's mobile UI), this is meant to read as a real
// marketing website — closer to something like Duolingo's homepage than an
// app screen. A logged-in visitor essentially never sees this: the global
// auth listener in app/_layout.tsx fires on initial load and redirects
// straight to the right dashboard before this page matters. This page is
// only for the first-time / logged-out visitor, explaining what the
// project is and pointing them at Sign Up / Log In.
//
// This is intentionally structured as clearly separated sections (Hero,
// Features, About, Partners, CTA, Footer) so more project content can be
// dropped in over time without restructuring the page.

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
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

// Local copies of the sponsor logos (downscaled from the original
// marketing site's multi-megapixel source files to a sane bundled size).
const OKAGE_LOGO = require('../assets/images/sponsors/okage-logo.webp');
const OSDE_LOGO = require('../assets/images/sponsors/osde-logo.png');
const OHS_LOGO = require('../assets/images/sponsors/ohs-logo.jpg');

const FEATURES = [
    {
        id: 'explore',
        icon: 'map-outline',
        title: 'Explore Real Oklahoma Trails',
        body: 'Twelve interactive trails span the state, from the Black Mesa heights in the panhandle to the pine forests of the east. Every mile you log moves you further down the path.',
    },
    {
        id: 'learn',
        icon: 'book-outline',
        title: 'Learn As You Go',
        body: "Pass landmarks along your trail and unlock bite-sized lessons on Oklahoma's geography, history, and culture — built around real OSDE curriculum standards.",
    },
    {
        id: 'motivate',
        icon: 'trophy-outline',
        title: 'Stay Motivated',
        body: 'Log miles from a pedometer, smartwatch, or by hand. Earn badges for milestones and climb the leaderboard against classmates and friends.',
    },
];

const SPONSORS = [
    { id: 'okage', name: 'Oklahoma Alliance for Geographic Education', source: OKAGE_LOGO, url: 'https://okageweb.org/' },
    { id: 'osde', name: 'Oklahoma State Department of Education', source: OSDE_LOGO, url: 'https://oklahoma.gov/education.html' },
    { id: 'ohs', name: 'Oklahoma Historical Society', source: OHS_LOGO, url: 'https://www.okhistory.org/' },
];

export default function WebLandingPage() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth >= 900;

    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => { /* no-op: best-effort external link */ });
    };

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.rootContent} showsVerticalScrollIndicator={false}>

            <WebNav active="home" />

            {/* ── HERO ────────────────────────────────────────────── */}
            <View style={[styles.hero, { backgroundColor: BRAND.heroBg }]}>
                <View style={[styles.heroInner, isWide && styles.heroInnerWide]}>
                    <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
                        <Text style={styles.heroKicker}>A FREE PROGRAM FOR OKLAHOMA STUDENTS</Text>
                        <Text style={[styles.heroTitle, { fontSize: isWide ? 60 : 38 }]}>Walk Across{'\n'}Oklahoma.</Text>
                        <Text style={[styles.heroSubtitle, { fontSize: isWide ? 19 : 16 }]}>
                            Turn every mile into a lesson. Track real steps, unlock real landmarks, and explore the
                            geography and history of your state — one trail at a time.
                        </Text>
                        <View style={[styles.heroActions, isWide && { flexDirection: 'row' }]}>
                            <Pressable onPress={() => router.push('/signup')} style={styles.heroPrimaryBtn}>
                                <Text style={styles.heroPrimaryBtnText}>Get Started — It&apos;s Free</Text>
                            </Pressable>
                            <Pressable onPress={() => router.push('/login')} style={styles.heroSecondaryBtn}>
                                <Text style={styles.heroSecondaryBtnText}>I Already Have an Account</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.heroTrust}>Backed by OKAGE, the Oklahoma State Department of Education & the Oklahoma Historical Society</Text>
                    </View>

                    {/* Decorative hero art — built from shapes/icons since no
                        illustration assets exist yet, rather than a photo. */}
                    <View style={[styles.heroArtWrap, isWide && styles.heroArtWrapWide]}>
                        <View style={styles.heroArtBlob}>
                            <Ionicons name="walk" size={104} color="#FFFFFF" />
                        </View>
                        <View style={[styles.heroChip, { top: 6, left: -6 }]}>
                            <Ionicons name="location" size={22} color={BRAND.heroBg} />
                        </View>
                        <View style={[styles.heroChip, { bottom: 18, right: -10 }]}>
                            <Ionicons name="trophy" size={22} color={BRAND.heroBg} />
                        </View>
                        <View style={[styles.heroChip, { top: '48%', right: -18 }]}>
                            <Ionicons name="book" size={20} color={BRAND.heroBg} />
                        </View>
                    </View>
                </View>
            </View>

            {/* ── FEATURES ────────────────────────────────────────── */}
            <View style={[styles.section, { backgroundColor: BRAND.white }]}>
                <View style={styles.sectionInner}>
                    <Text style={styles.sectionKicker}>WHY GEOQUESTOK</Text>
                    <Text style={[styles.sectionHeading, { fontSize: isWide ? 34 : 26 }]}>Fitness, geography, and history in one walk.</Text>

                    <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
                        {FEATURES.map((feature) => (
                            <View key={feature.id} style={[styles.featureCard, isWide && styles.featureCardWide]}>
                                <View style={styles.featureIconBadge}>
                                    <Ionicons name={feature.icon as any} size={28} color={BRAND.heroBg} />
                                </View>
                                <Text style={styles.featureTitle}>{feature.title}</Text>
                                <Text style={styles.featureBody}>{feature.body}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ── ABOUT / MISSION ─────────────────────────────────── */}
            <View style={[styles.section, { backgroundColor: BRAND.darkBand }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionKicker, { color: '#D8B98C' }]}>THE PROJECT</Text>
                    <Text style={[styles.sectionHeading, { color: BRAND.white, fontSize: isWide ? 34 : 26 }]}>
                        Two decades in the making.
                    </Text>
                    <Text style={[styles.aboutBody, { maxWidth: isWide ? 720 : undefined }]}>
                        Walk Across Oklahoma began in 2005 as part of the Oklahoma Kids Fitness Challenge Act, which
                        called for virtual trails pairing physical activity with lessons in geography and history.
                        Two decades later, OKAGE and OSDE are finally bringing it to life — giving every Oklahoma
                        student a way to log real miles and unlock real places, all in one app.
                    </Text>
                    <Text style={[styles.aboutMore, { maxWidth: isWide ? 720 : undefined }]}>
                        More on the project&apos;s story, partners, and the trails themselves is on the way.
                    </Text>
                </View>
            </View>

            {/* ── PARTNERS ────────────────────────────────────────── */}
            <View style={[styles.section, { backgroundColor: BRAND.cream }]}>
                <View style={styles.sectionInner}>
                    <Text style={styles.sectionKicker}>BUILT WITH SUPPORT FROM</Text>
                    <View style={[styles.sponsorRow, isWide && { flexDirection: 'row' }]}>
                        {SPONSORS.map((sponsor) => (
                            <Pressable
                                key={sponsor.id}
                                onPress={() => openExternalLink(sponsor.url)}
                                style={({ pressed }) => [styles.sponsorCard, pressed && { opacity: 0.7 }]}
                            >
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
            <View style={[styles.section, { backgroundColor: BRAND.white, paddingVertical: 56 }]}>
                <View style={styles.sectionInner}>
                    <View style={[styles.teacherBanner, isWide && styles.teacherBannerWide]}>
                        <View style={styles.teacherBannerText}>
                            <Text style={styles.teacherBannerKicker}>FOR EDUCATORS</Text>
                            <Text style={[styles.teacherBannerHeading, { fontSize: isWide ? 26 : 21 }]}>Teaching in Oklahoma?</Text>
                            <Text style={styles.teacherBannerBody}>
                                Free curriculum, classroom rosters, built-in quizzes, and reporting — made for K-12 teachers, youth leaders, and higher-ed instructors.
                            </Text>
                        </View>
                        <Pressable onPress={() => router.push('/teachers' as any)} style={styles.teacherBannerButton}>
                            <Text style={styles.teacherBannerButtonText}>For Teachers →</Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* ── FINAL CTA BAND ──────────────────────────────────── */}
            <View style={[styles.ctaBand, { backgroundColor: BRAND.ctaBg }]}>
                <Text style={[styles.ctaHeading, { fontSize: isWide ? 34 : 24 }]}>Ready to start your walk?</Text>
                <Pressable onPress={() => router.push('/signup')} style={styles.ctaButton}>
                    <Text style={styles.ctaButtonText}>Create Your Free Account</Text>
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
    heroInner: { width: '100%', maxWidth: 1160, alignSelf: 'center', flexDirection: 'column' },
    heroInnerWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroCopy: { width: '100%' },
    heroCopyWide: { width: '54%' },
    heroKicker: { color: '#FFE8CC', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginBottom: 14 },
    heroTitle: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', lineHeight: undefined, marginBottom: 18 },
    heroSubtitle: { color: '#FFF3E4', lineHeight: 26, marginBottom: 28, maxWidth: 520 },
    heroActions: { flexDirection: 'column', gap: 14, marginBottom: 22 },
    heroPrimaryBtn: { backgroundColor: '#241E18', paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
    heroPrimaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    heroSecondaryBtn: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', paddingVertical: 16, paddingHorizontal: 26, borderRadius: 12, alignItems: 'center' },
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

    // SECTION SHELL
    section: { width: '100%', paddingVertical: 72, paddingHorizontal: 24 },
    sectionInner: { width: '100%', maxWidth: 1160, alignSelf: 'center', alignItems: 'flex-start' },
    sectionKicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: BRAND.heroBg, marginBottom: 10 },
    sectionHeading: { fontFamily: 'Georgia', fontWeight: '800', color: BRAND.ink, marginBottom: 32 },

    // FEATURES
    featureGrid: { width: '100%', gap: 20 },
    featureGridWide: { flexDirection: 'row' },
    featureCard: {
        flex: 1,
        backgroundColor: BRAND.cream,
        borderRadius: 20,
        padding: 28,
        borderWidth: 1,
        borderColor: BRAND.border,
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
    featureTitle: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 19, color: BRAND.ink, marginBottom: 10 },
    featureBody: { fontSize: 14.5, lineHeight: 22, color: '#5A5147' },

    // ABOUT
    aboutBody: { fontSize: 16, lineHeight: 26, color: '#EFE6DA', marginBottom: 16 },
    aboutMore: { fontSize: 13.5, lineHeight: 20, color: '#B79E7C', fontStyle: 'italic' },

    // SPONSORS
    sponsorRow: { width: '100%', flexDirection: 'column', flexWrap: 'wrap', gap: 16, marginTop: 4 },
    sponsorCard: {
        backgroundColor: BRAND.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BRAND.border,
        paddingVertical: 18,
        paddingHorizontal: 28,
        height: 88,
        width: 220,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sponsorLogo: { width: '100%', height: '100%' },

    // TEACHER CALLOUT
    teacherBanner: {
        width: '100%',
        backgroundColor: BRAND.ctaBg,
        borderRadius: 24,
        padding: 32,
        gap: 22,
    },
    teacherBannerWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 32 },
    teacherBannerText: { flex: 1 },
    teacherBannerKicker: { color: '#D7EBE4', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },
    teacherBannerHeading: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
    teacherBannerBody: { fontSize: 14, lineHeight: 21, color: '#E4F0EC', maxWidth: 480 },
    teacherBannerButton: { backgroundColor: '#FFFFFF', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignSelf: 'flex-start' },
    teacherBannerButtonText: { color: BRAND.ctaBg, fontWeight: '800', fontSize: 14.5 },

    // FINAL CTA
    ctaBand: { width: '100%', paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
    ctaHeading: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 24, textAlign: 'center' },
    ctaButton: { backgroundColor: '#FFFFFF', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 12 },
    ctaButtonText: { color: BRAND.ctaBg, fontWeight: '800', fontSize: 15 },
});
