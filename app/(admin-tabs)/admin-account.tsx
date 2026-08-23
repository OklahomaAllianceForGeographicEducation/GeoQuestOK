// app/(admin-tabs)/admin-account.tsx
// District Admin's account screen: identity + district assignment display,
// and sign out. No view switcher -- District Administrators don't preview
// the Teacher or Student experience; that capability lives on the Site
// Administrator account screen instead (lib/access.ts's
// getAllowedTeacherViews returns only ['admin'] for this role).

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, getGlobalStyles, Theme } from '../../commonStyles';
import { confirmAlert } from '../../lib/confirmAlert';
import { signOutAndRedirect } from '../../lib/auth';
import { requestTourReplay } from '../../lib/onboarding';
import { supabase } from '../../utils/supabase';

type AdminProfile = {
    display_name: string | null;
    username: string | null;
    email: string | null;
    school_district_name: string | null;
};

export default function AdminAccount() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const baseStyles = getGlobalStyles(theme);
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<AdminProfile | null>(null);

    const loadProfile = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('profiles')
                .select('display_name, username, school_district_name')
                .eq('id', user.id)
                .maybeSingle();

            setProfile({
                display_name: data?.display_name ?? null,
                username: data?.username ?? null,
                email: user.email ?? null,
                school_district_name: data?.school_district_name ?? null,
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadProfile();
        }, [loadProfile])
    );

    const handleSignOutAction = () => {
        confirmAlert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => void signOutAndRedirect(router) },
        ]);
    };

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                <View style={baseStyles.profileImageContainer}>
                    <View style={[baseStyles.avatarRing]}>
                        <View style={[styles.iconAvatar, { backgroundColor: theme.surface }]}>
                            <Ionicons name="business" size={44} color={theme.accent} />
                        </View>
                    </View>
                    <Text style={baseStyles.profileGreeting} accessibilityRole="header">
                        {profile?.display_name || profile?.username || 'District Administrator'}
                    </Text>
                    <Text style={baseStyles.profileSubtext}>District Administrator</Text>
                </View>

                <View style={baseStyles.AccountMain}>
                    <View style={[baseStyles.card]}>
                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DISTRICT</Text>
                        <Text style={[styles.fieldValue, { color: theme.text }]}>{profile?.school_district_name || 'Not assigned'}</Text>

                        <View style={[baseStyles.divider, { marginVertical: 14 }]} />

                        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>EMAIL</Text>
                        <Text style={[styles.fieldValue, { color: theme.text }]}>{profile?.email || '—'}</Text>
                    </View>

                    <Text style={[styles.helperText, { color: theme.subtext }]}>
                        District/school/class-level reporting only — this account never has access to individual student names, ids, or activity.
                    </Text>

                    <Pressable
                        onPress={() => requestTourReplay('admin')}
                        style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.accent }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Replay Tour</Text>
                    </Pressable>

                    <Pressable
                        onPress={handleSignOutAction}
                        // paddingVertical 13 (not 10) clears the 44px touch-
                        // target floor -- same fix already applied to this
                        // exact button on student-account.tsx and
                        // teacher-account.tsx after an /impeccable critique
                        // round caught 10 measuring 39px live.
                        style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.error }}
                        accessibilityRole="button"
                    >
                        <Text style={{ color: theme.error, fontWeight: '600', fontSize: 14 }}>Sign Out</Text>
                    </Pressable>
                </View>

                <Text style={baseStyles.acknowledgementText}>
                    The GeoQuestOK app is a partnership between the Oklahoma State Department of Education’s
                    Health & Physical Education Department and the Oklahoma Alliance for Geographic Education.
                    This program works to fulfill the “Walk Across Oklahoma” foundation created by Oklahoma House
                    Bill 1647.
                </Text>
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    iconAvatar: { width: 106, height: 106, borderRadius: 53, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
    fieldValue: { fontSize: 16, fontWeight: '600', fontFamily: 'Georgia' },
    helperText: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
});
