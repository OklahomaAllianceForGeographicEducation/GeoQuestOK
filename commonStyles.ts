// commonStyles.ts
//
// The app's single shared "design system" file: one light/dark color
// palette (`colors`/`Theme`), one difficulty-badge color scale
// (`DIFFICULTY_COLORS`), and a set of "style factory" functions
// (getGlobalStyles, getLeaderboardStyles, getDashboardStyles,
// getTrailStyles) that build the React Native `StyleSheet`s used by
// specific screens. Nearly every screen file in app/ imports from here
// instead of defining its own colors/StyleSheets inline, which is what
// keeps spacing, fonts, and colors consistent across the whole app.
//
// WHY "FACTORY FUNCTIONS" INSTEAD OF PLAIN STYLESHEET OBJECTS: a screen
// needs different actual color *values* depending on whether the device is
// in light or dark mode, but `StyleSheet.create({...})` can't take a
// variable and react to it changing -- it just freezes whatever object you
// hand it once. So instead of one static StyleSheet, this file exports
// *functions* like `getGlobalStyles(theme)` that a screen calls during its
// own render with the theme object it currently wants (e.g.
// `colors[colorScheme]`), producing a fresh StyleSheet with that theme's
// colors baked in. A typical screen does roughly:
//   const scheme = useColorScheme() ?? 'light';
//   const theme = colors[scheme];
//   const styles = getGlobalStyles(theme);
// and then uses `styles.card`, `styles.button`, etc. as normal.
//
// A plain StyleSheet.create() is used for the color/theme-independent
// parts of this file's own internal usage, but the exported constants
// below are the important surface: `colors` (the theme values) and
// `DIFFICULTY_COLORS` (a fixed color scale that isn't theme-dependent) are
// plain objects, while getGlobalStyles/getLeaderboardStyles/
// getDashboardStyles/getTrailStyles are the theme-aware factory functions
// described above.

import { StyleSheet } from 'react-native';
import type { TrailDifficulty } from './lib/trails';

// The shape of one full color theme (one variant -- light or dark -- of
// the app's palette). Every screen's styles are ultimately built from one
// of these. Grouped here as "surfaces" (backgrounds/cards), "text", and
// "accent/status" colors -- see the `colors` object right below for the
// actual light/dark values.
export type Theme = {
    // -- surfaces --
    background: string; // the screen's outermost background fill
    surface: string;     // cards/raised elements sitting on top of `background`
    // -- text --
    text: string;        // primary heading/body text color
    subtext: string;     // secondary/meta text (captions, timestamps, labels)
    // -- accent / brand --
    accent: string;      // the app's primary brand color -- buttons, highlights, the user's own progress
    accentText: string;  // text/icon color meant to sit *on top of* an `accent`-colored fill (kept as its own token rather than always assuming white/black, since which one is legible flips between light and dark theme)
    // A woodsy pine green used sparingly as a second brand color -- the
    // trail itself (route lines, "the path ahead") rather than the user's
    // own progress/actions, which stay in `accent`. Deliberately not used
    // everywhere: one restrained second color reads as sophisticated,
    // three or four start to look busy.
    secondary: string;
    border: string;      // hairline/divider and outline color for cards, inputs, and separators
    shadow: string;      // shadowColor for elevated cards/buttons (paired with shadowOpacity/shadowRadius on each style)
    // The one error/destructive color used across the auth flow and
    // account screens (sign-out, delete, validation errors). Not part of
    // the original DESIGN.md palette -- added here so the existing
    // '#D70015' (verified 4.72:1+ on the light theme's cream/white) gets a
    // dark-theme counterpart instead of failing AA (2.78:1) against the
    // dark surface it would otherwise sit on unchanged.
    error: string;
};

export const colors: Record<'light' | 'dark', Theme> = {

    light: {
        background: '#F6EFE7',
        surface: '#FFFFFF',
        text: '#2C2C2C',
        // Darkened from the original #8A8A8A (~3.0-3.5:1 against this
        // theme's cream/white) to clear the 4.5:1 WCAG AA floor
        // PRODUCT.md commits to. Verified 4.7:1+ against both.
        subtext: '#6A6A6A',
        // Darkened from the original #de9027 (~2.3-2.6:1 as small text on
        // cream, and as white-on-accent button labels) to clear 4.5:1 AA
        // in both roles at once. Still reads as Prairie Sunset orange,
        // just a deeper, ink-heavy shade of it. Only the light theme
        // needed this: colors.dark.accent already clears AA as inline
        // text against its dark background, and darkening it too would
        // have broken that without fixing anything.
        accent: '#9C5015',
        accentText: '#FFFFFF',
        secondary: '#1F5D50',
        border: '#EAE0D5',
        shadow: '#C4A882',
        error: '#D70015',
    },
    dark: {
        background: '#1E1A16',
        surface: '#2C2620',
        text: '#F6EFE7',
        subtext: '#A89880',
        accent: '#de9027',
        // Was '#FFFFFF' -- correct for the light theme's dark accent fill,
        // wrong here: '#de9027' is the *bright* original hue (kept as-is
        // in dark mode since it already passes AA as inline text on this
        // theme's dark background), and white text on it measures only
        // 2.58:1, failing AA. Confirmed live on the dashboard's "Open
        // Daily Log"/"All Landmarks" buttons via two separate
        // /impeccable critique rounds. Dark ink text on the bright fill
        // (matching the marketing site's identical dark-mode button
        // inversion) clears 6.7:1 instead.
        accentText: '#1E1A16',
        // Lightened a shade over the light theme's pine green so it stays
        // legible against the dark background instead of receding into it.
        secondary: '#3B8570',
        border: '#3D3530',
        shadow: '#0A0806',
        // Brightened from the light theme's #D70015 (2.78:1 against the
        // dark surface, failing AA) to a coral that still reads as the
        // same "error" red. Verified 5.35:1 on dark surface / 6.19:1 on
        // dark background.
        error: '#FF6B5D',
    },
};

// Every difficulty badge renders white text directly on top of one of
// these fills (see difficultyBadgeText/trailSelectBadgeText below). The
// original 8-color scale only cleared 4.5:1 WCAG AA for 'Most Difficult'
// (6.57:1) -- the other seven ranged 1.51:1-4.23:1, failing AA on
// essentially every trail card in the app. Darkened each (same
// hue/saturation, lower lightness) to clear 4.5:1+ against white,
// following the same fix already applied to `accent`/`subtext`/`error`
// above. Found by an /impeccable audit; verified with each color's
// contrast ratio against #FFFFFF below.
export const DIFFICULTY_COLORS: Record<TrailDifficulty, string> = {
    Easiest: '#39843C', // was #4CAF50 (2.78:1) -> 4.60:1
    Easy: '#577D2A', // was #8BC34A (2.10:1) -> 4.78:1
    'Easy-Moderate': '#717B16', // was #CDDC39 (1.51:1) -> 4.63:1
    Moderate: '#916D00', // was #FFC107 (1.63:1) -> 4.81:1
    'Moderate-Difficult': '#A86400', // was #FF9800 (2.16:1) -> 4.66:1
    Difficult: '#DA3400', // was #FF5722 (3.16:1) -> 4.71:1
    'Very Difficult': '#E32723', // was #E53935 (4.23:1) -> 4.59:1
    'Most Difficult': '#B71C1C', // already 6.57:1, unchanged
};

// getGlobalStyles(theme) -- the largest, most widely-reused style factory
// in the app. Builds the StyleSheet backing account-related screens
// (student/teacher/admin account pages) plus the generic "landmark card" /
// "card" / "button" building blocks several other screens borrow from it
// too. Call with the current color theme (e.g. `colors[scheme]`); returns
// a StyleSheet object -- e.g. `styles.card`, `styles.button` -- ready to
// drop into a component's `style={...}` props.
export const getGlobalStyles = (theme: Theme) =>
    StyleSheet.create({
        // -- landmark cards --
        // The small horizontally-scrolling landmark preview cards shown on
        // account/dashboard-adjacent screens (image/placeholder + title +
        // subtitle), plus a "passed" variant with an accent-colored border.
        landmarkScrollContainer: {
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 12,
        },
        landmarkCard: {
            width: 140,
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2,
        },
        landmarkCardPassed: {
            borderColor: theme.accent, // Highlight passed landmarks with accent color
            opacity: 0.8,
        },
        landmarkCardTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: theme.text,
            marginBottom: 4,
        },
        landmarkCardSubtitle: {
            fontSize: 12,
            color: theme.subtext,
        },

        // -- generic layout/typography --
        // A bare full-screen container and a plain large text style, used
        // by simple screens that don't need anything more specific.
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        text: {
            fontSize: 24,
            color: theme.text,
        },

        // -- profile / avatar --
        // The circular profile picture shown at the top of account
        // screens: a container that centers it, the accent-colored
        // "ring" behind the image, the image itself, and a small pencil
        // "edit" badge pinned to its bottom-right corner (avatarEditWrapper
        // gives that badge a `position: 'relative'` anchor to position
        // against).
        profileImageContainer: {
            alignItems: 'center',
            paddingTop: 64,
            paddingBottom: 32,
        },
        // Wraps avatarRing so the small pencil edit badge below has
        // something to position itself against via `position: relative`.
        avatarEditWrapper: {
            position: 'relative',
        },
        avatarRing: {
            width: 112,
            height: 112,
            borderRadius: 56,
            padding: 3,
            backgroundColor: theme.accent,
        },
        profileImage: {
            width: 106,
            height: 106,
            borderRadius: 53,
            borderWidth: 3,
            borderColor: theme.surface,
        },
        // A small circular pencil badge overlaid on the avatar's
        // bottom-right corner -- tapping the whole avatar (or just this
        // badge) opens the customize sheet, replacing what used to be a
        // separate full-width "Customize Avatar" button.
        avatarEditBadge: {
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.accent,
            borderWidth: 3,
            borderColor: theme.background,
            alignItems: 'center',
            justifyContent: 'center',
        },
        profileGreeting: {
            fontFamily: 'Georgia',
            fontSize: 26,
            fontWeight: '700',
            color: theme.text,
            marginTop: 16,
            letterSpacing: 0.3,
            textAlign: 'center',
        },
        profileSubtext: {
            fontSize: 14,
            color: theme.subtext,
            marginTop: 4,
            letterSpacing: 0.5,
        },

        // -- account screen scaffolding --
        // The main scroll/content wrapper for an account screen, and the
        // small-print legal acknowledgement shown near the bottom of it.
        AccountMain: {
            flex: 1,
            paddingHorizontal: 24,
            gap: 12,
        },
        // Small-print partnership/legal acknowledgement shown at the
        // bottom of both the student and teacher account screens.
        acknowledgementText: {
            fontSize: 11,
            lineHeight: 16,
            color: theme.subtext,
            textAlign: 'center',
            paddingHorizontal: 32,
            paddingTop: 24,
            paddingBottom: 16,
        },

        // -- generic card --
        // A reusable rounded, bordered, drop-shadowed surface used for
        // grouping settings/content anywhere a screen needs a "card" look
        // that isn't one of the more specific card styles elsewhere in
        // this file.
        card: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            paddingVertical: 20,
            paddingHorizontal: 24,
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 3,
        },

        // -- buttons --
        // The app's standard primary button: a full-width wrapper, the
        // accent-filled pill itself (with a pressed-state scale/opacity
        // variant for touch feedback), and its label text style.
        buttonContainer: {
            width: '100%',
        },
        button: {
            borderRadius: 14,
            paddingVertical: 16,
            paddingHorizontal: 24,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            backgroundColor: theme.accent,
            shadowColor: theme.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
        },
        buttonPressed: {
            opacity: 0.82,
            transform: [{ scale: 0.98 }],
        },
        buttonText: {
            fontFamily: 'Georgia',
            fontSize: 16,
            fontWeight: '700',
            color: theme.accentText,
            letterSpacing: 0.4,
        },
        // -- divider --
        // A thin 1px horizontal rule for separating stacked sections/rows.
        divider: {
            height: 1,
            backgroundColor: theme.border,
            marginVertical: 8,
        },
    });

// getLeaderboardStyles(theme) -- styles specific to app/(tabs)/
// leaderboard.tsx: the screen header, the tab-strip for switching between
// leaderboard views, a 3-slot "podium" for the top ranked users, and a
// scrollable list of the remaining ranked rows below it. Call with the
// current theme; returns the leaderboard screen's StyleSheet.
export const getLeaderboardStyles = (theme: Theme) =>
    StyleSheet.create({
        // -- screen header --
        header: {
            paddingTop: 64,
            paddingBottom: 20,
            paddingHorizontal: 24,
        },
        headerTitle: {
            fontFamily: 'Georgia',
            fontSize: 32,
            fontWeight: '700',
            color: theme.text,
            letterSpacing: 0.3,
        },
        headerSubtitle: {
            fontSize: 14,
            color: theme.subtext,
            marginTop: 4,
            letterSpacing: 0.5,
        },

        // -- filter tabs --
        // A horizontally-scrolling row of pill-shaped tabs (e.g. "This
        // Week" / "All Time") for switching which leaderboard view is
        // shown; tabActive/tabLabelActive override the base tab/tabLabel
        // styles for whichever one is currently selected.
        tabsScroll: {
            marginBottom: 0,
        },
        tabsContainer: {
            paddingHorizontal: 20,
            gap: 8,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
        },
        tab: {
            paddingVertical: 8,
            paddingHorizontal: 18,
            borderRadius: 20,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
        },
        tabActive: {
            backgroundColor: theme.accent,
            borderColor: theme.accent,
        },
        tabLabel: {
            fontFamily: 'Georgia',
            fontSize: 14,
            color: theme.subtext,
            fontWeight: '600',
        },
        tabLabelActive: {
            color: theme.accentText,
        },

        // Podium wrapper — generous top padding keeps avatars clear of tabs
        podiumContainer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingHorizontal: 12,
            paddingTop: 32,       // clear space below the tab bar
            paddingBottom: 0,
            gap: 6,
        },

        // Each slot stacks: name → score → avatar → base (top-to-bottom)
        podiumSlot: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
        },

        podiumName: {
            fontFamily: 'Georgia',
            fontSize: 12,
            fontWeight: '700',
            color: theme.text,
            textAlign: 'center',
            marginBottom: 2,
            paddingHorizontal: 2,
        },
        podiumScore: {
            fontSize: 10,
            color: theme.subtext,
            marginBottom: 6,
            textAlign: 'center',
        },

        // Avatar ring sits just above the coloured base
        podiumAvatarRing: {
            width: 58,
            height: 58,
            borderRadius: 29,
            borderWidth: 3,
            borderColor: theme.accent,   // overridden per-card with medal colour
            overflow: 'hidden',
            marginBottom: 0,             // flush with top of base
            zIndex: 1,
        },
        podiumAvatar: {
            width: 52,
            height: 52,
            borderRadius: 26,
        },

        // Coloured step — height prop set inline per rank
        podiumBase: {
            width: '100%',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: 8,
        },
        podiumRankLabel: {
            fontSize: 20,
        },

        // -- ranked list --
        // The scrollable card of ranked rows below the podium: an outer
        // bordered/shadowed container (listContainer) holding one `row`
        // per user, with a `rowHighlighted`/`rowNameHighlighted` variant
        // for picking out the current user's own row in the list.
        listContainer: {
            marginHorizontal: 16,
            marginTop: 12,
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 2,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            gap: 12,
        },
        rowHighlighted: {
            // A low-opacity tint of the theme's own accent color, matching
            // the funFactBox pattern below -- reads as "your row" in both
            // themes instead of a fixed pale-cream fill that would show up
            // as a stray light card on the dark background.
            backgroundColor: theme.accent + '14',
        },
        rowRank: {
            fontFamily: 'Georgia',
            fontSize: 16,
            fontWeight: '700',
            width: 36,
            textAlign: 'center',
        },
        rowAvatarRing: {
            width: 40,
            height: 40,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: theme.border,
        },
        rowAvatar: {
            width: 36,
            height: 36,
            borderRadius: 18,
        },
        rowName: {
            flex: 1,
            fontFamily: 'Georgia',
            fontSize: 15,
            color: theme.text,
            fontWeight: '500',
        },
        rowNameHighlighted: {
            color: theme.accent,
            fontWeight: '700',
        },
        rowScore: {
            fontSize: 14,
            color: theme.subtext,
            fontWeight: '600',
        },
        // -- empty state --
        // Shown instead of the list/podium when there's no leaderboard
        // data yet (e.g. no one has logged any activity in the selected
        // time range).
        emptyState: {
            alignItems: 'center',
            paddingVertical: 48,
        },
        emptyText: {
            fontSize: 15,
            color: theme.subtext,
            fontFamily: 'Georgia',
        },
    });

// getDashboardStyles(theme) -- styles for the main app/(tabs)/dashboard.tsx
// screen: the largest and most visually varied of the four factories here,
// covering the header/mileage chip, the trail-progress bar, the map and
// its custom markers, the horizontally-scrolling landmark strip, the "All
// Landmarks" list, and the landmark-detail modal (hero image, fun-fact
// box, mileage-logging presets, and the trail-complete celebration
// screen). Call with the current theme; returns the dashboard's
// StyleSheet.
export const getDashboardStyles = (theme: Theme) =>
    StyleSheet.create({
        // Inside getDashboardStyles in commonStyles.ts

        // -- landmark strip (horizontal scroller) --
        // The small landmark preview cards scrolling horizontally near the
        // top of the dashboard, each showing an image/placeholder, title,
        // and mile marker, with locked/passed visual variants.
        landmarkStrip: {
            paddingHorizontal: 16,
            gap: 16, // Increased gap for better spacing
            paddingBottom: 12,
        },
        landmarkCard: {
            width: 140, // Slightly wider for better image aspect
            backgroundColor: theme.surface,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 2,
            paddingBottom: 10,
        },
        landmarkImagePlaceholder: {
            width: '100%',
            height: 80,
            backgroundColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
        },
        // ... keep other styles

        // -- header + mileage chip --
        // The top row of the dashboard: a greeting + current trail name on
        // the left, and a small rounded "chip" showing the student's total
        // logged mileage on the right.
        header: {
            paddingTop: 64,
            paddingHorizontal: 24,
            paddingBottom: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        headerGreeting: {
            fontSize: 14,
            color: theme.subtext,
            letterSpacing: 0.4,
        },
        headerTrailName: {
            fontFamily: 'Georgia',
            fontSize: 22,
            fontWeight: '700',
            color: theme.text,
            marginTop: 4,
        },
        milesChip: {
            backgroundColor: theme.surface,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 2,
        },
        milesChipValue: {
            fontFamily: 'Georgia',
            fontSize: 20,
            fontWeight: '700',
            color: theme.accent,
        },
        milesChipLabel: {
            fontSize: 11,
            color: theme.subtext,
            marginTop: 1,
        },
        // -- trail progress bar --
        // A thin rounded track (progressTrack) with an accent-colored
        // fill (progressFill) whose width is set inline per-render based
        // on how far along the trail the student has traveled, plus a
        // small right-aligned label underneath.
        progressContainer: {
            paddingHorizontal: 24,
            marginBottom: 16,
        },
        progressTrack: {
            height: 6,
            backgroundColor: theme.border,
            borderRadius: 3,
            overflow: 'hidden',
        },
        progressFill: {
            height: '100%',
            backgroundColor: theme.accent,
            borderRadius: 3,
        },
        progressLabel: {
            fontSize: 11,
            color: theme.subtext,
            marginTop: 5,
            textAlign: 'right',
            letterSpacing: 0.4,
        },

        // -- map + markers --
        // The rounded/bordered map frame, its custom user-location marker
        // (a filled dot with a translucent outer ring), landmark dots
        // (passed vs. future), the flag marker for the trail's end, and
        // the floating "recenter" button overlaid in its bottom-right
        // corner.
        mapContainer: {
            marginHorizontal: 16,
            borderRadius: 20,
            overflow: 'hidden',
            height: 280,
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 4,
        },
        map: {
            flex: 1,
        },
        userMarkerOuter: {
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.accent + 'AA',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: theme.accent,
        },
        userMarkerInner: {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.accent,
        },
        landmarkDot: {
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: '#fff',
        },
        landmarkDotPassed: {
            backgroundColor: theme.accent,
        },
        landmarkDotFuture: {
            backgroundColor: theme.subtext,
        },
        flagMarker: {
            fontSize: 26,
        },
        recenterButton: {
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.surface,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.18,
            shadowRadius: 4,
            elevation: 3,
        },
        recenterIcon: {
            fontSize: 18,
            color: theme.accent,
        },

        // -- log mileage CTA --
        // The prominent "Log Miles" call-to-action button below the map.
        ctaRow: {
            paddingHorizontal: 16,
            marginTop: 16,
            marginBottom: 8,
        },
        logButton: {
            backgroundColor: theme.accent,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            shadowColor: theme.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
        },
        logButtonText: {
            fontFamily: 'Georgia',
            fontSize: 16,
            fontWeight: '700',
            // Was hardcoded '#FFFFFF' rather than the theme.accentText
            // token this exact role exists for -- on logButton's
            // theme.accent fill, that measured 2.58:1 in dark mode
            // (confirmed live via /impeccable critique). Using the token
            // both fixes this and tracks any future accentText change.
            color: theme.accentText,
            letterSpacing: 0.4,
        },
        sectionHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 24,
            marginTop: 20,
            marginBottom: 10,
        },
        // -- section headers --
        // The "Section Title ... See All" row pattern used above both the
        // landmark strip and other dashboard sub-sections.
        sectionTitle: {
            fontFamily: 'Georgia',
            fontSize: 17,
            fontWeight: '700',
            color: theme.text,
        },
        sectionLink: {
            fontSize: 13,
            color: theme.accent,
            fontWeight: '600',
        },

        // -- landmark strip card text/icon --
        // Text and icon styles for the landmarkCard/landmarkImagePlaceholder
        // pair declared earlier in this StyleSheet, plus locked/passed
        // variants layered on top of the base card.
        landmarkCardTitle: {
            fontFamily: 'Georgia',
            fontSize: 12,
            fontWeight: '700',
            color: theme.text,
            paddingHorizontal: 8,
            paddingTop: 8,
            lineHeight: 16,
        },
        landmarkCardMile: {
            fontSize: 10,
            color: theme.subtext,
            paddingHorizontal: 8,
            marginTop: 3,
        },
        landmarkImageIcon: {
            fontSize: 28,
            color: theme.subtext,
        },
        landmarkCardPassed: {
            borderColor: theme.accent,
            opacity: 0.8,
        },
        // A landmark the student hasn't walked far enough to reach yet:
        // dimmed and (in LandmarkCard) untappable, matching the "All
        // Landmarks" list's locked treatment.
        landmarkCardLocked: {
            opacity: 0.45,
        },
        landmarkCardTitleLocked: {
            color: theme.subtext,
        },
        // -- no-landmarks empty state --
        // Shown in place of the landmark strip when the current trail has
        // no landmarks defined yet.
        noLandmarksBox: {
            marginHorizontal: 24,
            marginTop: 16,
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
        },
        noLandmarksText: {
            fontSize: 14,
            color: theme.subtext,
            textAlign: 'center',
            lineHeight: 20,
            fontFamily: 'Georgia',
        },

        // -- "All Landmarks" list --
        // The full vertical list of every landmark on the trail (as
        // opposed to the horizontal preview strip above), each row
        // pairing a small colored dot (passed vs. not) with the
        // landmark's title and mile marker, dimmed when locked (not yet
        // reachable).
        allLandmarkRow: {
            flexDirection: 'row',
            // flex-start (rather than center) keeps the mile marker pinned
            // to the top-right corner of the row instead of drifting to an
            // odd mid-point once the title wraps to two lines.
            alignItems: 'flex-start',
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            gap: 14,
        },
        allLandmarkRowLocked: {
            opacity: 0.45,
        },
        allLandmarkDot: {
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: theme.subtext,
            borderWidth: 2,
            borderColor: theme.border,
        },
        allLandmarkDotPassed: {
            backgroundColor: theme.accent,
            borderColor: theme.accent,
        },
        allLandmarkTitle: {
            fontFamily: 'Georgia',
            fontSize: 15,
            fontWeight: '600',
            color: theme.text,
            // Without a flex value here, a long title has no bounded width
            // to wrap against, so it overflows the row and shoves the mile
            // marker text past the edge of the modal instead of wrapping.
            // flex: 1 makes the title claim all space the row isn't using
            // for the mile marker, so it wraps within that space instead.
            flex: 1,
            lineHeight: 20,
        },
        allLandmarkTitleLocked: {
            color: theme.subtext,
        },
        allLandmarkMile: {
            fontSize: 12,
            color: theme.subtext,
            marginTop: 2,
            // Keeps the mile marker at its natural width and right-aligned
            // instead of being squeezed by the now-wrapping title next to it.
            flexShrink: 0,
            textAlign: 'right',
        },
        allLandmarkArrow: {
            fontSize: 18,
            color: theme.subtext,
        },
        // -- landmark detail modal --
        // The popup sheet shown when a student taps a landmark: a
        // centered overlay/backdrop, the sheet itself (width/height
        // capped so it doesn't stretch edge-to-edge on large screens), a
        // hero image (or placeholder) at the top with a small floating
        // close button, and the scrollable text content below it (title,
        // mile marker, divider, section label, and body text).
        modalOverlay: {
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 30,
        },
        modalSheet: {
            backgroundColor: theme.background,
            borderRadius: 24,
            overflow: 'hidden',
            width: '100%',
            maxWidth: 960,
            maxHeight: 700,
            height: '72%',
        },
        modalHeroImage: {
            width: '100%',
            height: 200,
        },
        modalHeroPlaceholder: {
            width: '100%',
            height: 160,
            backgroundColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        closeButton: {
            position: 'absolute',
            top: 16,
            right: 16,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: 'rgba(0,0,0,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
        },
        closeButtonText: {
            color: '#FFF',
            fontSize: 14,
            fontWeight: '700',
        },
        modalContent: {
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 40,
        },
        modalTitle: {
            fontFamily: 'Georgia',
            fontSize: 22,
            fontWeight: '700',
            color: theme.text,
        },
        modalMile: {
            fontSize: 13,
            color: theme.accent,
            fontWeight: '600',
            marginTop: 4,
        },
        modalDivider: {
            height: 1,
            backgroundColor: theme.border,
            marginVertical: 16,
        },
        modalSectionLabel: {
            fontSize: 11,
            fontWeight: '700',
            color: theme.subtext,
            letterSpacing: 1.2,
            marginBottom: 8,
        },
        modalBodyText: {
            fontSize: 15,
            color: theme.text,
            lineHeight: 22,
        },
        // -- fun fact callout --
        // A left-accent-bordered tinted box inside the landmark modal for
        // a short "did you know" fact about that landmark.
        funFactBox: {
            backgroundColor: theme.accent + '18',
            borderRadius: 12,
            padding: 14,
            borderLeftWidth: 3,
            borderLeftColor: theme.accent,
        },
        funFactText: {
            fontSize: 14,
            color: theme.text,
            lineHeight: 20,
        },

        // -- mileage logging presets (in-modal) --
        // Quick-tap distance preset buttons plus a custom numeric entry
        // row, letting a student log miles walked without leaving the
        // landmark modal.
        presetsRow: {
            flexDirection: 'row',
            gap: 10,
            flexWrap: 'wrap',
        },
        presetButton: {
            backgroundColor: theme.accent,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 18,
        },
        presetButtonText: {
            fontFamily: 'Georgia',
            fontSize: 15,
            fontWeight: '700',
            color: theme.accentText,
        },
        customInputRow: {
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
        },
        customInput: {
            flex: 1,
            backgroundColor: theme.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 16,
            paddingVertical: 13,
            fontSize: 16,
            color: theme.text,
            fontFamily: 'Georgia',
        },
        customLogButton: {
            backgroundColor: theme.accent,
            borderRadius: 12,
            paddingVertical: 13,
            paddingHorizontal: 22,
        },
        customLogButtonText: {
            fontFamily: 'Georgia',
            fontSize: 15,
            fontWeight: '700',
            color: theme.accentText,
        },

        // -- trail complete celebration --
        // The congratulatory header shown when a student finishes an
        // entire trail (emoji + title + subtitle), typically followed by
        // a trail-picker list (trailSelectRow etc. below) to start a new
        // one.
        trailCompleteHeader: {
            alignItems: 'center',
            paddingTop: 32,
            paddingHorizontal: 24,
            paddingBottom: 16,
        },
        trailCompleteEmoji: {
            fontSize: 48,
            marginBottom: 8,
        },
        trailCompleteTitle: {
            fontFamily: 'Georgia',
            fontSize: 26,
            fontWeight: '700',
            color: theme.text,
            marginBottom: 8,
        },
        trailCompleteSubtitle: {
            fontSize: 15,
            color: theme.subtext,
            textAlign: 'center',
            lineHeight: 22,
        },
        trailSelectRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            gap: 12,
        },
        trailSelectName: {
            fontFamily: 'Georgia',
            fontSize: 15,
            fontWeight: '600',
            color: theme.text,
        },
        trailSelectMeta: {
            fontSize: 12,
            color: theme.subtext,
            marginTop: 2,
        },
        trailSelectBadge: {
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 20,
        },
        trailSelectBadgeText: {
            fontSize: 11,
            fontWeight: '700',
            color: '#FFF',
        },
    });

// getTrailStyles(theme) -- styles for app/trails.tsx, the trail-picker
// screen: a scrollable list of trail cards (each with a cover image and a
// difficulty badge overlaid on it, using DIFFICULTY_COLORS above), and a
// bottom-sheet-style modal with the trail's full details, a route preview
// map, and a "select this trail" CTA button. Call with the current theme;
// returns the trails screen's StyleSheet.
export const getTrailStyles = (theme: Theme) =>
    StyleSheet.create({
        // Screen header
        header: {
            paddingTop: 64,
            paddingBottom: 12,
            paddingHorizontal: 24,
        },
        headerTitle: {
            fontFamily: 'Georgia',
            fontSize: 32,
            fontWeight: '700',
            color: theme.text,
            letterSpacing: 0.3,
        },
        headerSubtitle: {
            fontSize: 14,
            color: theme.subtext,
            marginTop: 4,
            letterSpacing: 0.5,
        },

        // Card list
        list: {
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 32,
            gap: 16,
        },

        // Trail card — liquid glass feel: white surface, heavy rounding, soft shadow
        card: {
            backgroundColor: theme.surface,
            borderRadius: 24,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.13,
            shadowRadius: 16,
            elevation: 5,
        },
        cardPressed: {
            opacity: 0.92,
            transform: [{ scale: 0.985 }],
        },
        cardImage: {
            width: '100%',
            height: 180,
        },

        // Difficulty badge overlaid on image (bottom-left)
        difficultyBadge: {
            position: 'absolute',
            top: 148,          // image height - badge height - 12px gap
            left: 14,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 20,
        },
        difficultyBadgeText: {
            fontSize: 11,
            fontWeight: '700',
            color: '#FFFFFF',
            letterSpacing: 0.4,
        },

        // Text below image
        cardBody: {
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 16,
            gap: 4,
        },
        cardTitle: {
            fontFamily: 'Georgia',
            fontSize: 17,
            fontWeight: '700',
            color: theme.text,
        },
        cardMeta: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        cardDistance: {
            fontSize: 13,
            color: theme.accent,
            fontWeight: '600',
        },
        cardRoute: {
            fontSize: 12,
            color: theme.subtext,
            marginTop: 2,
        },

        // ── Modal ──────────────────────────────────────────────
        modalOverlay: {
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
        },
        modalSheet: {
            backgroundColor: theme.background,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            overflow: 'hidden',
            width: '100%',
            maxWidth: 960,
            height: '70%',
            alignSelf: 'center',
        },
        modalImage: {
            width: '100%',
            height: 220,
        },
        closeButton: {
            position: 'absolute',
            top: 16,
            right: 16,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        closeButtonText: {
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: '700',
        },
        modalDiffBadge: {
            position: 'absolute',
            top: 188,
            left: 20,
            paddingVertical: 5,
            paddingHorizontal: 12,
            borderRadius: 20,
        },
        modalScroll: {
            flex: 1,
        },
        modalContent: {
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 40,
        },
        modalTitle: {
            fontFamily: 'Georgia',
            fontSize: 24,
            fontWeight: '700',
            color: theme.text,
            letterSpacing: 0.2,
        },
        modalDistance: {
            fontSize: 15,
            color: theme.accent,
            fontWeight: '600',
            marginTop: 4,
        },
        modalDivider: {
            height: 1,
            backgroundColor: theme.border,
            marginVertical: 16,
        },
        modalSectionLabel: {
            fontSize: 11,
            fontWeight: '700',
            color: theme.subtext,
            letterSpacing: 1.2,
            marginTop: 14,
            marginBottom: 6,
        },
        modalBodyText: {
            fontSize: 15,
            color: theme.text,
            lineHeight: 22,
        },
        modalBullet: {
            fontSize: 15,
            color: theme.text,
            lineHeight: 24,
            paddingLeft: 4,
        },
        previewMapFrame: {
            marginTop: 10,
            height: 180,
            borderRadius: 14,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
        },
        previewLoading: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
        },
        previewLoadingText: {
            fontSize: 13,
            color: theme.subtext,
        },
        mapButton: {
            marginTop: 28,
            backgroundColor: theme.accent,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            shadowColor: theme.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
        },
        mapButtonText: {
            fontFamily: 'Georgia',
            fontSize: 16,
            fontWeight: '700',
            color: theme.accentText,
            letterSpacing: 0.5,
        },
    });

// Small placeholder avatar used by the leaderboard mock data.
export const testUser = {
    profilePicture: `https://api.dicebear.com/7.x/bottts/svg?seed=test`
};
