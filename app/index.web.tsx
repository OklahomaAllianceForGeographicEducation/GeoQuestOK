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
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import WebFooter from '../components/web/WebFooter';
import WebNav from '../components/web/WebNav';
import { BRAND } from '../components/web/webBrand';


const OKAGE_LOGO = require('../assets/images/sponsors/okage-logo.webp');
const OSDE_LOGO = require('../assets/images/sponsors/osde-logo.png');

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

const SPONSORS = [
    { id: 'okage', name: 'Oklahoma Alliance for Geographic Education', source: OKAGE_LOGO, url: 'https://okageweb.org/' },
    { id: 'osde', name: 'Oklahoma State Department of Education', source: OSDE_LOGO, url: 'https://oklahoma.gov/education.html' }
];

export default function WebLandingPage() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    const isWide = windowWidth >= 900;

    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => { /* no-op: best-effort external link */ });
    };

    return (
        <ScrollView style={[styles.root, { backgroundColor: theme.surfaceBase }]} contentContainerStyle={styles.rootContent} showsVerticalScrollIndicator={false}>

            <WebNav active="home" />

            {/* ── HERO ────────────────────────────────────────────── */}
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
            <View style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
                <View style={styles.sectionInner}>
                    <Text style={[styles.sectionHeading, { color: theme.ink, fontSize: isWide ? 34 : 26 }]} accessibilityRole="header" aria-level={2}>Fitness, geography, and history, one trail at a time.</Text>

                    <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
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
                        <Pressable onPress={() => router.push('/teachers' as any)} style={styles.teacherBannerButton} accessibilityRole="link">
                            <Text style={styles.teacherBannerButtonText}>For Teachers →</Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* ── FINAL CTA BAND ──────────────────────────────────── */}
            <View style={[styles.ctaBand, { backgroundColor: theme.ctaBg }]}>
                <Text style={[styles.ctaHeading, { fontSize: isWide ? 34 : 24 }]} accessibilityRole="header" aria-level={2}>Ready to start your walk?</Text>
                <Pressable onPress={() => router.push('/signup')} style={styles.ctaButton} accessibilityRole="link">
                    <Text style={styles.ctaButtonText}>Create Your Free Account</Text>
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

    // SECTION SHELL
    section: { width: '100%', paddingVertical: 72, paddingHorizontal: 24 },
    sectionInner: { width: '100%', maxWidth: 1160, alignSelf: 'center', alignItems: 'flex-start' },
    sectionHeading: { fontFamily: 'Georgia', fontWeight: '800', marginBottom: 32 },

    // FEATURES
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

    // ABOUT
    aboutBody: { fontSize: 16, lineHeight: 26, color: '#EFE6DA', marginBottom: 16 },

    // SPONSORS -- two cards that split the row evenly (flex: 1 each) so
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

    // TEACHER CALLOUT
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

    // FINAL CTA
    ctaBand: { width: '100%', paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
    ctaHeading: { fontFamily: 'Georgia', fontWeight: '800', color: '#FFFFFF', marginBottom: 24, textAlign: 'center' },
    ctaButton: { backgroundColor: '#FFFFFF', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 12 },
    // Pinned to BRAND.light.pineAccent for the same reason as
    // teacherBannerButtonText -- this pill is always white too.
    ctaButtonText: { color: BRAND.light.pineAccent, fontWeight: '800', fontSize: 15 },
});
