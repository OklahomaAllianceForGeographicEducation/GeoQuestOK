// components/web/WebFooter.tsx
// Shared footer for the public marketing site — used by app/index.web.tsx
// and app/teachers.web.tsx (and any future .web.tsx marketing page).

import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BRAND } from './webBrand';

export default function WebFooter() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth >= 900;

    return (
        // Pinned to BRAND.light.darkBand deliberately -- the footer is
        // already a dark band regardless of site theme (a common, deliberate
        // "always-dark footer" pattern), so it doesn't switch with scheme
        // the way the rest of the marketing site now does. See the note on
        // dark.darkBand in webBrand.ts.
        <View style={[styles.footer, { backgroundColor: BRAND.light.darkBand }]}>
            <View style={[styles.footerInner, isWide && { flexDirection: 'row' }]}>
                <View style={styles.footerBrandBlock}>
                    <Text style={styles.footerWordmark}>GeoQuestOK</Text>
                    <Text style={styles.footerTagline}>Blending fitness, geography, and history for Oklahoma students. </Text>
                </View>
                {/* No Contact link for now: the /contact page (backed by a
                    new Supabase table + RLS policy) was pulled since a raw
                    SQL table isn't the org's preferred way to receive these
                    -- and its predecessor, a personal Gmail mailto:, is a
                    known trust-signal problem, so it isn't reinstated here
                    either. Revisit once there's a real destination for it. */}
                <View style={styles.footerLinksBlock}>
                    <Pressable onPress={() => router.push('/teachers' as any)} style={styles.footerLinkWrap} accessibilityRole="link"><Text style={styles.footerLink}>For Teachers</Text></Pressable>
                    <Pressable onPress={() => router.push('/login')} style={styles.footerLinkWrap} accessibilityRole="link"><Text style={styles.footerLink}>Log In</Text></Pressable>
                    <Pressable onPress={() => router.push('/signup')} style={styles.footerLinkWrap} accessibilityRole="link"><Text style={styles.footerLink}>Sign Up</Text></Pressable>
                </View>
            </View>
            <Text style={styles.footerCopyright}>© 2026 Oklahoma Alliance for Geographic Education. All rights reserved.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    footer: { width: '100%', paddingVertical: 48, paddingHorizontal: 24 },
    footerInner: { width: '100%', maxWidth: 1160, alignSelf: 'center', flexDirection: 'column', justifyContent: 'space-between', gap: 32, marginBottom: 32 },
    footerBrandBlock: { maxWidth: 380 },
    footerWordmark: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 20, color: '#FFFFFF', marginBottom: 10 },
    footerTagline: { fontSize: 13.5, lineHeight: 20, color: '#B79E7C' },
    // Negative margin offsets footerLinkWrap's own padding so the row's
    // visible spacing/alignment looks the same as before -- the padding
    // grows the tap target without widening the gap the eye reads.
    footerLinksBlock: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginRight: -12 },
    // Previously the Pressable had no padding at all -- just the raw 14px
    // text line-height, ~17-20px tall, well under the 44px touch-target
    // guideline (and smaller than the nav's own already-marginal links).
    // Measured 41px at paddingVertical 12, 43px at 13; bumped to 14 to
    // clear 44px with margin.
    footerLinkWrap: { paddingVertical: 14, paddingHorizontal: 12 },
    footerLink: { color: '#EFE6DA', fontSize: 14, fontWeight: '600' },
    footerCopyright: {
        fontSize: 11.5,
        // Lightened from #8A7A63 (~4.0:1 against darkBand, just under the
        // 4.5:1 AA floor) to clear it.
        color: '#9C8C74',
        textAlign: 'center',
        width: '100%',
        maxWidth: 1160,
        alignSelf: 'center',
    },
});
