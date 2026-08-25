// app/contact.tsx
// Public contact page, linked from the marketing site footer. Static only
// -- no form, no database table.
//
// EDIT THIS: fill in each box's `email` (and optionally `contactName`)
// below with the real address once you have it. Until an entry contains a
// real "@" address, it renders as plain placeholder text instead of a
// broken mailto: link. `linkLabel`/`linkUrl` are optional -- add them to a
// box to show a separate tappable outbound link (e.g. a request form)
// below its description, same pattern as the FAQ links on app/teachers.tsx.

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import WebFooter from '../components/web/WebFooter';
import WebNav from '../components/web/WebNav';
import { BRAND } from '../components/web/webBrand';

// EDIT THESE: two contact destinations. `contactName` is optional -- leave
// it '' to omit that line entirely. Same for `linkLabel`/`linkUrl`.
const CONTACT_BOXES = [
    {
        id: 'education',
        icon: 'school-outline' as const,
        title: 'Educational Content Questions',
        description: 'Curriculum, standards alignment, trail content, lesson plans, and the Walk Across Oklahoma program itself.',
        linkLabel: 'Request stickers, desk maps & classroom visits',
        linkUrl: 'https://okageweb.org/geoquestok-form',
        contactName: 'Oklahoma Alliance for Geographic Education',
        email: 'okage@ou.edu',
    },
    {
        id: 'technical',
        icon: 'construct-outline' as const,
        title: 'Technical Questions',
        description: 'App bugs, account or login issues, and anything else related to using the GeoQuestOK app itself. App bugs or crashes are automatically logged and will be fixed as soon as possible.',
        linkLabel: '',
        linkUrl: '',
        contactName: 'GeoQuestOK Technical Support Team',
        email: 'support@geoquestok.org',
    },
];

// The main (and only) component this file exports — Expo Router treats
// this as the screen rendered for the "/contact" route. Takes no props
// (it's a route, not a reusable component) and renders the full page:
// nav bar, a header banner, the two contact boxes built from
// CONTACT_BOXES above, and the shared site footer.
export default function ContactPage() {
    // useWindowDimensions() reports the current viewport size and
    // re-renders this component whenever it changes (e.g. rotating a
    // device, or resizing a browser window on web) — used below to decide
    // whether to lay the two contact boxes out side-by-side or stacked.
    const { width: windowWidth } = useWindowDimensions();
    // Same light/dark theme-detection pattern used across the app:
    // useColorScheme() reports the OS/browser's current preference, and
    // `?? 'light'` falls back to light mode if that preference is
    // unavailable (e.g. not yet determined on some platforms).
    const scheme = useColorScheme() ?? 'light';
    // BRAND (from components/web/webBrand.ts) is the marketing site's own
    // color token set, separate from the app's `colors` (commonStyles.ts)
    // theme — this page is part of the public web site, not the
    // authenticated app shell, so it pulls from the marketing palette.
    const theme = BRAND[scheme];
    // Simple breakpoint: anything narrower than 720px logical pixels is
    // treated as a "narrow" (phone-sized) layout; 720px and up gets the
    // wider desktop/tablet treatment (larger title text, boxes side by
    // side instead of stacked).
    const isWide = windowWidth >= 720;

    // Opens a URL in the device's default browser (native) or a new tab
    // (web) via React Native's Linking API. Used for the optional
    // "Request stickers..." outbound link on the education contact box.
    // `.catch(() => {...})` swallows any failure (e.g. no browser
    // available) silently rather than crashing — this is a "best effort"
    // action, not something the rest of the screen depends on succeeding.
    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => { /* no-op: best-effort external link */ });
    };

    return (
        // ScrollView (rather than a plain View) since the page's content
        // — nav, header, two contact boxes, footer — can be taller than
        // the viewport on narrow/phone-sized screens. contentContainerStyle
        // styles the scrollable inner content; `style` styles the outer
        // scroll frame itself. showsVerticalScrollIndicator={false} hides
        // the OS scrollbar for a cleaner marketing-site look.
        <ScrollView style={[styles.root, { backgroundColor: theme.surfaceBase }]} contentContainerStyle={styles.rootContent} showsVerticalScrollIndicator={false}>
            {/* Shared marketing-site top navigation bar, reused across
                every public page (home, teachers, contact, legal pages). */}
            <WebNav />

            {/* Page banner: just a title + one-line subtitle, in its own
                tinted section above the actual contact boxes. */}
            <View style={[styles.header, { backgroundColor: theme.surfaceRaised, borderBottomColor: theme.border }]}>
                <View style={styles.headerInner}>
                    {/* accessibilityRole="header" + aria-level={1} tells
                        assistive tech (screen readers) this text is the
                        page's main <h1>-equivalent heading, even though
                        React Native has no real HTML heading tags of its
                        own. Font size grows on wide layouts (40 vs 28). */}
                    <Text style={[styles.title, { color: theme.ink, fontSize: isWide ? 40 : 28 }]} accessibilityRole="header" aria-level={1}>Contact Us</Text>
                    <Text style={[styles.subtitle, { color: theme.body }]}>
                        Have a question about GeoQuestOK? Reach out to the right team below.
                    </Text>
                </View>
            </View>

            <View style={styles.content}>
                {/* On wide screens, styles.boxGridWide switches this
                    container's flexDirection to 'row' so the two contact
                    boxes sit side by side; on narrow screens they simply
                    stack vertically (the default column direction). */}
                <View style={[styles.boxGrid, isWide && styles.boxGridWide]}>
                    {/* .map() renders one card per entry in the CONTACT_BOXES
                        array defined near the top of this file — adding a
                        new contact destination there is enough to make a
                        third card appear here automatically, no JSX changes
                        needed. */}
                    {CONTACT_BOXES.map((box) => {
                        // Whether this box's `email` field is a genuine
                        // address (contains "@") or just placeholder text
                        // like "coming soon" — determines whether the email
                        // line below renders as a tappable mailto: link or
                        // plain non-interactive text.
                        const isRealEmail = box.email.includes('@');
                        return (
                            <View key={box.id} style={[styles.box, isWide && styles.boxWide, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
                                {/* Circular icon badge — background flips to
                                    a slightly lighter tone in dark mode so
                                    the icon doesn't disappear against a dark
                                    card background. */}
                                <View style={[styles.boxIconBadge, scheme === 'dark' && { backgroundColor: theme.border }]}>
                                    <Ionicons name={box.icon} size={28} color={theme.pineAccent} />
                                </View>
                                <Text style={[styles.boxTitle, { color: theme.ink }]}>{box.title}</Text>
                                <Text style={[styles.boxDescription, { color: theme.body }]}>{box.description}</Text>

                                {/* Optional outbound link (e.g. "Request
                                    stickers, desk maps & classroom visits")
                                    — only rendered at all when this box
                                    actually has a linkUrl set. Tapping it
                                    calls openExternalLink() above rather
                                    than navigating within the app, since
                                    it points at an external site. */}
                                {box.linkUrl ? (
                                    <Pressable
                                        onPress={() => openExternalLink(box.linkUrl)}
                                        // The `pressed` argument here is a
                                        // React Native Pressable feature:
                                        // the style function is called with
                                        // the current press state, letting
                                        // us dim the row to 70% opacity for
                                        // visual feedback while it's held down.
                                        style={({ pressed }) => [styles.boxResourceLinkRow, pressed && { opacity: 0.7 }]}
                                        accessibilityRole="link"
                                    >
                                        <Ionicons name="open-outline" size={16} color={theme.pineAccent} />
                                        <Text style={[styles.boxResourceLinkText, { color: theme.pineAccent }]}>{box.linkLabel}</Text>
                                    </Pressable>
                                ) : null}

                                {/* The named contact person/org for this
                                    box (e.g. "Noah Holderbaum") — omitted
                                    entirely when contactName is an empty
                                    string, rather than showing a blank line. */}
                                {box.contactName ? (
                                    <Text style={[styles.boxContactName, { color: theme.ink }]}>{box.contactName}</Text>
                                ) : null}

                                {/* Final line of each card: a real,
                                    tappable "mailto:" link that opens the
                                    device's email client when the address
                                    is genuine, or plain italic placeholder
                                    text (styled to look clearly
                                    non-interactive) when it isn't yet. */}
                                {isRealEmail ? (
                                    <Pressable
                                        onPress={() => Linking.openURL(`mailto:${box.email}`).catch(() => { /* no-op: best-effort mail client open */ })}
                                        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                                        accessibilityRole="link"
                                    >
                                        <Text style={[styles.boxEmailLink, { color: theme.pineAccent }]}>{box.email}</Text>
                                    </Pressable>
                                ) : (
                                    <Text style={[styles.boxEmailPlaceholder, { color: theme.subtext }]}>{box.email}</Text>
                                )}
                            </View>
                        );
                    })}
                </View>
            </View>

            {/* Shared marketing-site footer (links, copyright, etc.),
                reused across every public page just like WebNav above. */}
            <WebFooter />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    // -- outer scroll container styles --
    root: { flex: 1 },
    // flexGrow: 1 (rather than flex: 1) on contentContainerStyle lets the
    // content stretch to fill the screen when short, while still allowing
    // it to grow taller and scroll when the content is actually longer
    // than the viewport.
    rootContent: { flexGrow: 1 },

    // -- header banner styles ("Contact Us" title + subtitle strip) --
    header: { width: '100%', paddingVertical: 40, paddingHorizontal: 24, borderBottomWidth: 1 },
    // maxWidth: 780 + alignSelf: 'center' caps the text column's width and
    // centers it, so the title/subtitle don't stretch edge-to-edge into
    // unreadably long lines on very wide desktop browsers.
    headerInner: { width: '100%', maxWidth: 780, alignSelf: 'center' },
    title: { fontFamily: 'Georgia', fontWeight: '800', marginBottom: 10 },
    subtitle: { fontSize: 15.5, lineHeight: 24 },

    // -- contact box grid/layout styles --
    content: { width: '100%', paddingVertical: 48, paddingHorizontal: 24 },
    boxGrid: { width: '100%', maxWidth: 780, alignSelf: 'center', gap: 18 },
    // Only applied when isWide is true — flips the grid from a vertical
    // stack (the default) to a horizontal row so the two boxes sit
    // side by side.
    boxGridWide: { flexDirection: 'row' },
    box: { flex: 1, borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'flex-start' },
    // flexBasis: '46%' (rather than exactly 50%) leaves room for the
    // `gap: 18` spacing between the two boxes without them wrapping onto
    // separate rows.
    boxWide: { flexBasis: '46%' },

    // -- individual box content styles (icon, title, description, links) --
    boxIconBadge: {
        width: 56,
        height: 56,
        borderRadius: 16, // rounded-square badge, not a full circle
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
    },
    boxTitle: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 19, marginBottom: 10 },
    boxDescription: { fontSize: 14.5, lineHeight: 22, marginBottom: 14 },
    boxResourceLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
    boxResourceLinkText: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
    boxContactName: { fontSize: 14.5, fontWeight: '700', marginBottom: 4 },
    boxEmailLink: { fontSize: 15.5, fontWeight: '700', textDecorationLine: 'underline' },
    // fontStyle: 'italic' visually signals "not clickable yet" for the
    // placeholder-text case (email box entries with no "@" set).
    boxEmailPlaceholder: { fontSize: 14, fontStyle: 'italic' },
});
