// components/web/WebFooter.tsx
// Shared footer for the public marketing site — used by app/index.web.tsx
// and app/teachers.web.tsx (and any future .web.tsx marketing page).

import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BRAND } from './webBrand';

export default function WebFooter() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth >= 900;

    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => { /* no-op: best-effort external link */ });
    };

    return (
        <View style={[styles.footer, { backgroundColor: BRAND.darkBand }]}>
            <View style={[styles.footerInner, isWide && { flexDirection: 'row' }]}>
                <View style={styles.footerBrandBlock}>
                    <Text style={styles.footerWordmark}>GeoQuestOK</Text>
                    <Text style={styles.footerTagline}>Walk Across Oklahoma — a free geography &amp; fitness program for Oklahoma students.</Text>
                </View>
                <View style={styles.footerLinksBlock}>
                    <Pressable onPress={() => router.push('/teachers' as any)}><Text style={styles.footerLink}>For Teachers</Text></Pressable>
                    <Pressable onPress={() => router.push('/login')}><Text style={styles.footerLink}>Log In</Text></Pressable>
                    <Pressable onPress={() => router.push('/signup')}><Text style={styles.footerLink}>Sign Up</Text></Pressable>
                    <Pressable onPress={() => openExternalLink('mailto:noahmlholderbaum@gmail.com')}>
                        <Text style={styles.footerLink}>Contact</Text>
                    </Pressable>
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
    footerLinksBlock: { flexDirection: 'row', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' },
    footerLink: { color: '#EFE6DA', fontSize: 14, fontWeight: '600' },
    footerCopyright: {
        fontSize: 11.5,
        color: '#8A7A63',
        textAlign: 'center',
        width: '100%',
        maxWidth: 1160,
        alignSelf: 'center',
    },
});
