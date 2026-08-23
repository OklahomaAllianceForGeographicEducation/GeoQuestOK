// app/(okage-tabs)/index.tsx
// This is the home/dashboard screen for the "okage" role's tab group. Any
// folder name wrapped in parentheses, like "(okage-tabs)", is a "route
// group" in Expo Router — the parentheses tell the router "organize these
// files together but don't add '(okage-tabs)' to the actual URL path."
// Because this file is named "index.tsx", it's the default screen shown
// when the user lands on the (okage-tabs) group with no further path.

// Ionicons is a bundled icon font (from Expo's vector-icons package) — lets
// us render named icons (like "library-outline") as React components.
import { Ionicons } from '@expo/vector-icons';

// Navigation hook for pushing new screens.
import { useRouter } from 'expo-router';

// useEffect: run code after render (here, to load the user's display name).
// useState: local component state.
import { useEffect, useState } from 'react';

// Core React Native UI building blocks used on this screen.
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

// Shared color palette. Note the "../../" — two levels up, since this file
// is nested inside app/(okage-tabs)/, so it needs to climb out of both
// that folder and app/ to reach commonStyles.ts at the project root.
import { colors, Theme } from '../../commonStyles';

// Supabase client, same relative-path reasoning as above.
import { supabase } from '../../utils/supabase';

// Describes one row in the list of dashboard "quick link" cards below.
type QuickLink = {
    // A unique identifier used as React's `key` prop when rendering the list.
    key: string;
    // Bold headline shown on the card.
    title: string;
    // Smaller supporting text shown under the title.
    description: string;
    // Name of the Ionicons icon to display (kept as a plain `string` type
    // here rather than a stricter icon-name union, so it's not fully
    // type-checked against Ionicons' actual valid icon names).
    icon: string;
    // The exact route this card navigates to when tapped. Using a union of
    // string literals (rather than a generic `string`) means TypeScript
    // will catch a typo like '/(okage-tabs)/contnet' at compile time.
    path: '/(okage-tabs)/content' | '/(okage-tabs)/quizzes' | '/(okage-tabs)/standards' | '/(okage-tabs)/reports';
};

// The actual data for the four dashboard cards, defined once outside the
// component (so it isn't recreated on every render — it's just a plain
// constant array).
const QUICK_LINKS: QuickLink[] = [
    {
        key: 'content',
        title: 'Edit Trail & Lesson Content',
        description: 'Update trail descriptions and cross-curricular lesson guides.',
        icon: 'library-outline',
        path: '/(okage-tabs)/content',
    },
    {
        key: 'quizzes',
        title: 'Manage Quiz Questions',
        description: 'Add or edit the quiz questions tied to trail landmarks.',
        icon: 'help-circle-outline',
        path: '/(okage-tabs)/quizzes',
    },
    {
        key: 'standards',
        title: 'Standards Library',
        description: 'Search Oklahoma Academic Standards by code, keyword, subject, or grade.',
        icon: 'ribbon-outline',
        path: '/(okage-tabs)/standards',
    },
    {
        key: 'reports',
        title: 'Statewide Mileage Report',
        description: 'See how many miles each enrolled school has walked.',
        icon: 'documents-outline',
        path: '/(okage-tabs)/reports',
    },
];

export default function OkageDashboard() {
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);
    const router = useRouter();

    // Shown in the "Welcome, ___" heading. Defaults to a generic label
    // until we've actually loaded the logged-in user's real name.
    const [displayName, setDisplayName] = useState('OKAGE Staff');

    // Whether we're still fetching the user's profile info.
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                // Ask Supabase who is currently authenticated. Destructures
                // straight down to `user` from the nested response shape.
                const { data: { user } } = await supabase.auth.getUser();

                // If somehow nobody is logged in, bail out early (loading
                // stays true only until the `finally` block runs below, so
                // it still gets set to false — this just skips the profile
                // lookup).
                if (!user) return;

                const { data } = await supabase
                    .from('profiles')
                    .select('display_name, username')
                    .eq('id', user.id)
                    // .maybeSingle() is like .single() but returns `null`
                    // instead of throwing an error if no row (or more than
                    // one) is found — safer when a matching row isn't
                    // guaranteed to exist.
                    .maybeSingle();

                // Prefer display_name, fall back to username, fall back to
                // the generic default if both are empty.
                if (data) setDisplayName(data.display_name || data.username || 'OKAGE Staff');
            } catch (err) {
                // Log to the developer console; the user just sees the
                // generic 'OKAGE Staff' label instead of a crash.
                console.error('OKAGE dashboard load error:', err);
            } finally {
                setLoading(false);
            }
        }
        void load();
    }, []);

    // Full-screen spinner while we fetch the user's name.
    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                // Hides the little scrollbar indicator that would normally
                // appear on the right edge while scrolling, for a cleaner
                // look.
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.kicker, { color: theme.accent }]}>OKAGE CONTENT TEAM</Text>
                {/* Template literal-style embedding: {displayName} inserts
                    the current state value directly into the text. */}
                <Text style={[styles.mainHeading, { color: theme.text }]} accessibilityRole="header">Welcome, {displayName}</Text>
                <Text style={[styles.introText, { color: theme.subtext }]}>
                    Use these tools to keep trail content, lesson guides, and quiz questions up to date across the app.
                    Nothing here shows individual student information.
                </Text>

                {/* Render one tappable card per entry in QUICK_LINKS. */}
                {QUICK_LINKS.map((link) => (
                    <Pressable
                        key={link.key}
                        style={({ pressed }) => [
                            styles.card,
                            { backgroundColor: theme.surface, borderColor: theme.border },
                            // Dim the card slightly while actively pressed.
                            pressed && { opacity: 0.8 },
                        ]}
                        // Navigate to this card's target route. `as any`
                        // sidesteps a TypeScript route-typing mismatch
                        // (same pattern seen in app/_layout.tsx).
                        onPress={() => router.push(link.path as any)}
                        accessibilityRole="button"
                        accessibilityLabel={link.title}
                        accessibilityHint={link.description}
                    >
                        {/* A small circular badge behind the icon. */}
                        <View style={[styles.iconCircle, { backgroundColor: theme.background, borderColor: theme.border }]}>
                            <Ionicons name={link.icon as any} size={20} color={theme.accent} />
                        </View>
                        {/* flex: 1 makes this middle section stretch to
                            fill all the leftover horizontal space between
                            the icon circle and the chevron arrow, pushing
                            the arrow to the far right edge of the card. */}
                        <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>{link.title}</Text>
                            <Text style={[styles.cardDescription, { color: theme.subtext }]}>{link.description}</Text>
                        </View>
                        {/* A right-pointing arrow icon, hinting the card is
                            tappable/navigable, similar to a list item on iOS. */}
                        <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 6 },
    mainHeading: { fontSize: 26, fontWeight: '800', marginBottom: 4, fontFamily: 'Georgia' },
    introText: { fontSize: 14, lineHeight: 19, marginBottom: 20 },
    card: {
        // Lays out this card's children (icon circle, text block, chevron)
        // in a horizontal row instead of React Native's default vertical
        // (column) stacking.
        flexDirection: 'row',
        // Vertically centers the icon/text/chevron relative to each other
        // within the row.
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        // `gap` adds 12px of space between each direct child of this row
        // (icon circle, text block, chevron) without needing manual
        // margins on each one individually.
        gap: 12,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    iconCircle: {
        width: 40,
        height: 40,
        // Exactly half of width/height (40 / 2 = 20) turns a square into a
        // perfect circle — this is the standard trick for circular views
        // in React Native, since there's no dedicated "circle" shape.
        borderRadius: 20,
        borderWidth: 1,
        justifyContent: 'center', // center the icon vertically
        alignItems: 'center',     // center the icon horizontally
    },
    cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
    // 12.5 — React Native allows fractional pixel values; this is a very
    // slightly smaller size than a round 13, likely fine-tuned by eye.
    cardDescription: { fontSize: 12.5, lineHeight: 17 },
});
