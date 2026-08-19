// components/web/WebNav.tsx
// Shared top nav bar for the public marketing site — used by app/index.web.tsx
// and app/teachers.web.tsx (and any future .web.tsx marketing page) so the
// site's primary links live in one place instead of being copy-pasted.

import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from './webBrand';

type Props = {
    // Which nav link (if any) to underline as the current page.
    active?: 'home' | 'teachers';
};

export default function WebNav({ active }: Props) {
    const router = useRouter();

    return (
        <View style={[styles.nav, { borderBottomColor: BRAND.border }]}>
            <View style={styles.navInner}>
                <Pressable onPress={() => router.push('/')}>
                    <Text style={styles.navWordmark}>GeoQuest<Text style={{ color: BRAND.heroBg }}>OK</Text></Text>
                </Pressable>
                <View style={styles.navLinks}>
                    <Pressable onPress={() => router.push('/teachers' as any)} style={styles.navTextLinkWrap}>
                        <Text style={[styles.navTextLink, active === 'teachers' && { color: BRAND.heroBg }]}>
                            For Teachers
                        </Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/login')} style={styles.navTextLinkWrap}>
                        <Text style={styles.navTextLink}>Log In</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/signup')} style={[styles.navSignupBtn, { backgroundColor: BRAND.heroBg }]}>
                        <Text style={styles.navSignupText}>Sign Up</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    nav: { width: '100%', borderBottomWidth: 1, backgroundColor: BRAND.white },
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
    navWordmark: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 20, color: BRAND.ink },
    // gap plus each link sharing the same paddingVertical/paddingHorizontal
    // box (navTextLinkWrap) keeps "For Teachers", "Log In", and the "Sign
    // Up" pill all vertically centered on the same baseline.
    navLinks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    navTextLinkWrap: { paddingVertical: 10, paddingHorizontal: 14 },
    navTextLink: { fontWeight: '700', fontSize: 14, color: BRAND.ink },
    navSignupBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999 },
    navSignupText: { fontWeight: '700', fontSize: 14, color: '#FFFFFF' },
});
