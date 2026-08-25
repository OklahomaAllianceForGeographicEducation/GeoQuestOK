// components/web/LegalPageLayout.tsx
// Shared shell for the public-facing legal pages (app/privacy-policy.tsx,
// app/terms.tsx) -- same WebNav/WebFooter/BRAND system as the rest of the
// marketing site (see app/teachers.tsx), just a single-column prose layout
// instead of the marketing pages' hero/feature/FAQ sections, since legal
// text doesn't fit that shape.
//
// Exports a handful of small style-consistent building blocks
// (Heading/Paragraph/Bullet/InfoCard) so the two page files can stay plain,
// readable JSX instead of each hand-rolling paragraph/list styling.

import React from 'react';
import { ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import WebFooter from './WebFooter';
import WebNav from './WebNav';
import { BRAND } from './webBrand';

type LegalPageLayoutProps = {
    title: string;
    effectiveDate: string;
    children: React.ReactNode;
};

/**
 * LegalPageLayout -- the page "shell" for a legal document page (Privacy
 * Policy, Terms and Conditions). A legal page file (e.g. app/terms.tsx)
 * renders `<LegalPageLayout title="..." effectiveDate="...">` and puts its
 * actual legal prose as `children` inside it, using the LegalIntro/
 * LegalHeading/LegalParagraph/etc. building blocks exported below to format
 * that prose consistently.
 *
 * Structurally this renders, top to bottom inside one scrollable page:
 *   1. WebNav (shared site nav bar)
 *   2. A title header band (page title + "Effective Date: ...")
 *   3. `children` (the actual legal text, centered and width-capped)
 *   4. WebFooter (shared site footer)
 *
 * Props:
 *   title - the page's H1 heading text (e.g. "Privacy Policy").
 *   effectiveDate - a human-readable date string shown under the title,
 *     e.g. "Effective Date: January 1, 2026".
 *   children - the page's actual legal content, typically a mix of the
 *     Legal* helper components exported further down this file.
 *
 * Returns: the full scrollable page (nav + header + content + footer) as
 * one JSX tree.
 */
export default function LegalPageLayout({ title, effectiveDate, children }: LegalPageLayoutProps) {
    const { width: windowWidth } = useWindowDimensions();
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    const isWide = windowWidth >= 900;

    return (
        <ScrollView style={[styles.root, { backgroundColor: theme.surfaceBase }]} contentContainerStyle={styles.rootContent} showsVerticalScrollIndicator={false}>
            <WebNav />

            <View style={[styles.header, { backgroundColor: theme.surfaceRaised, borderBottomColor: theme.border }]}>
                <View style={styles.headerInner}>
                    <Text style={[styles.title, { color: theme.ink, fontSize: isWide ? 40 : 28 }]} accessibilityRole="header" aria-level={1}>{title}</Text>
                    <Text style={[styles.effectiveDate, { color: theme.subtext }]}>Effective Date: {effectiveDate}</Text>
                </View>
            </View>

            <View style={styles.content}>
                <View style={styles.contentInner}>
                    {children}
                </View>
            </View>

            <WebFooter />
        </ScrollView>
    );
}

// Reusable prose building blocks -- shared between privacy-policy.tsx and
// terms.tsx so both pages read/format the same way.

// The opening "lede" paragraph at the top of a legal page, right below the
// title header (e.g. the one-sentence summary before "1. Information We
// Collect" begins). Larger and with more bottom margin than a regular
// LegalParagraph (see legalStyles.intro vs legalStyles.paragraph below) so
// it visually reads as the page's introduction, not just another paragraph.
// Props: `children` -- the intro text itself. Returns: a single styled
// <Text> node using the current color scheme's `body` text color.
export function LegalIntro({ children }: { children: React.ReactNode }) {
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    return <Text style={[legalStyles.intro, { color: theme.body }]}>{children}</Text>;
}

// A numbered top-level section heading (e.g. "2. Information We Collect").
// Rendered as an accessible level-2 header (`accessibilityRole="header"`,
// `aria-level={2}` -- the page title itself, rendered by LegalPageLayout
// above, is level 1) so screen readers and browser "jump to heading"
// navigation can both traverse the document's section structure correctly.
// Props: `children` -- the heading text. Returns: a single styled <Text>
// heading node colored with the current scheme's `ink` (heading) color.
export function LegalHeading({ children }: { children: React.ReactNode }) {
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    return <Text style={[legalStyles.heading, { color: theme.ink }]} accessibilityRole="header" aria-level={2}>{children}</Text>;
}

// A standard body paragraph of legal prose. This is the default, most
// commonly used building block on these pages -- most of the document's
// text is expected to be wrapped in this rather than the other, more
// specialized helpers below. Props: `children` -- the paragraph text.
// Returns: a single styled <Text> node using the current scheme's `body`
// text color.
export function LegalParagraph({ children }: { children: React.ReactNode }) {
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    return <Text style={[legalStyles.paragraph, { color: theme.body }]}>{children}</Text>;
}

// A smaller sub-header within a numbered section (e.g. "Account
// information" under "2. Information We Collect") -- one step down from
// LegalHeading, no top margin of its own since it always follows a
// LegalHeading or another paragraph directly.
export function LegalSubheading({ children }: { children: React.ReactNode }) {
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    return <Text style={[legalStyles.subheading, { color: theme.ink }]}>{children}</Text>;
}

// Renders a plain bulleted list -- a manual bullet-dot Text plus the item's
// text side by side in a row, repeated once per entry in `items`. React
// Native has no native <ul>/<li> elements (there's no HTML/DOM on iOS or
// Android), so any "list" has to be built out of plain Views/Texts like
// this, arranged with flexbox instead of list-style-type CSS.
// Props: `items` -- an array of React nodes, one per bullet row (usually
// just plain strings). Returns: a <View> containing one row per item, each
// row pairing a "•" glyph (colored with the scheme's pine accent) with the
// item's own text.
export function LegalBulletList({ items }: { items: React.ReactNode[] }) {
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    return (
        <View style={legalStyles.bulletList}>
            {items.map((item, index) => (
                <View key={index} style={legalStyles.bulletRow}>
                    <Text style={[legalStyles.bulletDot, { color: theme.pineAccent }]}>{'•'}</Text>
                    <Text style={[legalStyles.bulletText, { color: theme.body }]}>{item}</Text>
                </View>
            ))}
        </View>
    );
}

// A small bordered card for short structured metadata -- used for the
// Operator/Contact block on the Privacy Policy page.
export function LegalInfoCard({ children }: { children: React.ReactNode }) {
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    return (
        <View style={[legalStyles.infoCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
            {children}
        </View>
    );
}

// Renders the "who can see your data" role/visibility breakdown as stacked
// role-label + description rows -- React Native has no native <table>, and
// stacking reads better than a real table at narrow widths anyway.
export function LegalRoleTable({ rows }: { rows: { role: string; sees: string }[] }) {
    const scheme = useColorScheme() ?? 'light';
    const theme = BRAND[scheme];
    return (
        <View style={[legalStyles.roleTable, { borderColor: theme.border }]}>
            {rows.map((row, index) => (
                <View key={row.role} style={[legalStyles.roleRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                    <Text style={[legalStyles.roleLabel, { color: theme.pineAccent }]}>{row.role}</Text>
                    <Text style={[legalStyles.roleSees, { color: theme.body }]}>{row.sees}</Text>
                </View>
            ))}
        </View>
    );
}

// Styles for the outer page shell (scroll container + title header band +
// content wrapper) rendered directly by LegalPageLayout above.
const styles = StyleSheet.create({
    // -- scroll root --
    // The ScrollView itself, plus its contentContainerStyle (flexGrow: 1
    // lets short pages still stretch to fill the viewport instead of
    // leaving the footer stranded mid-screen).
    root: { flex: 1 },
    rootContent: { flexGrow: 1 },

    // -- title header band --
    // The colored strip below WebNav holding the page's H1 title and
    // "Effective Date" line. headerInner width-caps and centers the text
    // block the same way contentInner does below, so the title lines up
    // with the body content beneath it.
    header: { width: '100%', paddingVertical: 40, paddingHorizontal: 24, borderBottomWidth: 1 },
    headerInner: { width: '100%', maxWidth: 780, alignSelf: 'center' },
    title: { fontFamily: 'Georgia', fontWeight: '800', marginBottom: 10 },
    effectiveDate: { fontSize: 14, fontWeight: '600' },

    // -- content wrapper --
    // Centers and width-caps `children` (the actual legal prose) at 780px
    // so lines of text don't stretch uncomfortably wide on a large desktop
    // viewport.
    content: { width: '100%', paddingVertical: 48, paddingHorizontal: 24 },
    contentInner: { width: '100%', maxWidth: 780, alignSelf: 'center' },
});

// Styles for the reusable prose building blocks (LegalIntro, LegalHeading,
// etc.) exported above -- kept in a separate StyleSheet from `styles` since
// these are a distinct, content-focused set used by the two legal page
// files rather than by LegalPageLayout's own shell markup.
const legalStyles = StyleSheet.create({
    // -- typography --
    // Font sizing/spacing for the intro lede, section headings/
    // subheadings, and regular body paragraphs, in descending order of
    // visual weight.
    intro: { fontSize: 15.5, lineHeight: 25, marginBottom: 28 },
    heading: { fontFamily: 'Georgia', fontWeight: '800', fontSize: 21, marginTop: 36, marginBottom: 14 },
    subheading: { fontWeight: '800', fontSize: 15.5, marginTop: 18, marginBottom: 8 },
    paragraph: { fontSize: 15, lineHeight: 24, marginBottom: 14 },

    // -- bullet list --
    // The hand-built list layout used by LegalBulletList: a column of rows
    // (bulletRow), each pairing a "•" glyph (bulletDot) with its text
    // (bulletText, flex: 1 so it wraps instead of overflowing).
    bulletList: { marginBottom: 14, gap: 8 },
    bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    bulletDot: { fontSize: 15, lineHeight: 24 },
    bulletText: { flex: 1, fontSize: 15, lineHeight: 24 },

    // -- info card --
    // The bordered metadata box used by LegalInfoCard.
    infoCard: { borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 28, gap: 4 },

    // -- role table --
    // The stacked role/visibility rows used by LegalRoleTable: an outer
    // bordered box (roleTable) containing one roleRow per entry, each with
    // a bold roleLabel and its roleSees description.
    roleTable: { borderWidth: 1, borderRadius: 16, marginBottom: 14, overflow: 'hidden' },
    roleRow: { paddingVertical: 16, paddingHorizontal: 18, gap: 4 },
    roleLabel: { fontWeight: '800', fontSize: 14.5 },
    roleSees: { fontSize: 14.5, lineHeight: 21 },
});
