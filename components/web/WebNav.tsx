// components/web/WebNav.tsx
// Shared top nav bar for the public marketing site — used by app/index.web.tsx
// and app/teachers.web.tsx (and any future .web.tsx marketing page) so the
// site's primary links live in one place instead of being copy-pasted.

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { BRAND } from './webBrand';

type Props = {
    // Which nav link (if any) to underline as the current page.
    active?: 'home' | 'teachers';
};

export default function WebNav({ active }: Props) {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    // Below this, the four nav items (wordmark + 3 links) no longer fit on
    // one row -- confirmed by measuring the actual rendered nav at 375px,
    // where "Sign Up" was left ~90% off-screen with no wrap and no way to
    // reach it. Collapses to a hamburger + dropdown instead.
    const isWide = windowWidth >= 640;
    const [menuOpen, setMenuOpen] = useState(false);

    const links = (
        <>
            <Pressable
                onPress={() => { setMenuOpen(false); router.push('/teachers' as any); }}
                style={styles.navTextLinkWrap}
                accessibilityRole="link"
            >
                <Text style={[styles.navTextLink, { color: theme.ink }, active === 'teachers' && { color: theme.heroAccent }]}>
                    For Teachers
                </Text>
            </Pressable>
            <Pressable
                onPress={() => { setMenuOpen(false); router.push('/login'); }}
                style={styles.navTextLinkWrap}
                accessibilityRole="link"
            >
                <Text style={[styles.navTextLink, { color: theme.ink }]}>Log In</Text>
            </Pressable>
            <Pressable
                onPress={() => { setMenuOpen(false); router.push('/signup'); }}
                style={[styles.navSignupBtn, { backgroundColor: theme.heroBg }]}
                accessibilityRole="link"
            >
                <Text style={styles.navSignupText}>Sign Up</Text>
            </Pressable>
        </>
    );

    return (
        <View style={[styles.nav, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.border }]}>
            <View style={styles.navInner}>
                {/* Previously an unpadded Pressable -- measured 132.6x23px
                    live, well under the 44px touch-target guideline every
                    sibling link on this bar already meets. paddingVertical
                    12 clears it without visibly growing the wordmark's
                    footprint (the negative marginVertical offsets the
                    padding so surrounding layout doesn't shift). */}
                <Pressable onPress={() => router.push('/')} accessibilityRole="link" style={styles.navWordmarkWrap}>
                    <Text style={[styles.navWordmark, { color: theme.ink }]}>GeoQuest<Text style={{ color: theme.heroAccent }}>OK</Text></Text>
                </Pressable>
                {isWide ? (
                    <View style={styles.navLinks}>{links}</View>
                ) : (
                    <Pressable
                        onPress={() => setMenuOpen((open) => !open)}
                        style={styles.navMenuButton}
                        accessibilityRole="button"
                        accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={menuOpen}
                    >
                        {/* A plain three-line glyph instead of an icon-font
                            dependency -- this file has no icon import today
                            and one row of hamburger lines doesn't need one. */}
                        <View style={[styles.navMenuBar, { backgroundColor: theme.ink }]} />
                        <View style={[styles.navMenuBar, { backgroundColor: theme.ink }]} />
                        <View style={[styles.navMenuBar, { backgroundColor: theme.ink }]} />
                    </Pressable>
                )}
            </View>
            {!isWide && menuOpen && (
                <View style={[styles.navMobileMenu, { borderTopColor: theme.border }]}>{links}</View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    nav: { width: '100%', borderBottomWidth: 1 },
    navInner: {
        width: '100%',
        maxWidth: 1160,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 16,
    },
    navWordmarkWrap: { paddingVertical: 12, marginVertical: -12 },
    navWordmark: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 20 },
    // gap plus each link sharing the same paddingVertical/paddingHorizontal
    // box (navTextLinkWrap) keeps "For Teachers", "Log In", and the "Sign
    // Up" pill all vertically centered on the same baseline.
    navLinks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    // paddingVertical 15 (was 10) so these clear the 44px touch-target
    // guideline -- measured 43px at 14, previously ~37px at the original 10.
    navTextLinkWrap: { paddingVertical: 15, paddingHorizontal: 14 },
    navTextLink: { fontWeight: '700', fontSize: 14 },
    navSignupBtn: { paddingVertical: 15, paddingHorizontal: 20, borderRadius: 999 },
    navSignupText: { fontWeight: '700', fontSize: 14, color: '#FFFFFF' },
    // Hamburger toggle -- 44x44 tap target per the same guideline.
    navMenuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', gap: 5 },
    navMenuBar: { width: 22, height: 2, borderRadius: 1 },
    navMobileMenu: {
        borderTopWidth: 1,
        paddingHorizontal: 24,
        paddingVertical: 12,
        gap: 4,
    },
});
