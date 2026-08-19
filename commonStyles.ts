// commonStyles.ts
// Shared theme values and reusable StyleSheet factories used across screens.

import { StyleSheet } from 'react-native';
import type { TrailDifficulty } from './lib/trails';

export type Theme = {
    background: string;
    surface: string;
    text: string;
    subtext: string;
    accent: string;
    accentText: string;
    // A woodsy pine green used sparingly as a second brand color -- the
    // trail itself (route lines, "the path ahead") rather than the user's
    // own progress/actions, which stay in `accent`. Deliberately not used
    // everywhere: one restrained second color reads as sophisticated,
    // three or four start to look busy.
    secondary: string;
    border: string;
    shadow: string;
};

export const colors: Record<'light' | 'dark', Theme> = {

    light: {
        background: '#F6EFE7',
        surface: '#FFFFFF',
        text: '#2C2C2C',
        subtext: '#8A8A8A',
        accent: '#de9027',
        accentText: '#FFFFFF',
        secondary: '#1F5D50',
        border: '#EAE0D5',
        shadow: '#C4A882',
    },
    dark: {
        background: '#1E1A16',
        surface: '#2C2620',
        text: '#F6EFE7',
        subtext: '#A89880',
        accent: '#de9027',
        accentText: '#FFFFFF',
        // Lightened a shade over the light theme's pine green so it stays
        // legible against the dark background instead of receding into it.
        secondary: '#3B8570',
        border: '#3D3530',
        shadow: '#0A0806',
    },
};

export const DIFFICULTY_COLORS: Record<TrailDifficulty, string> = {
    Easiest: '#4CAF50',
    Easy: '#8BC34A',
    'Easy-Moderate': '#CDDC39',
    Moderate: '#FFC107',
    'Moderate-Difficult': '#FF9800',
    Difficult: '#FF5722',
    'Very Difficult': '#E53935',
    'Most Difficult': '#B71C1C',
};

// Build the shared styles used by account-related screens and common cards.
export const getGlobalStyles = (theme: Theme) =>
    StyleSheet.create({
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
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        text: {
            fontSize: 24,
            color: theme.text,
        },
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
            fontWeight: '600',
            color: theme.accentText,
            letterSpacing: 0.4,
        },
        divider: {
            height: 1,
            backgroundColor: theme.border,
            marginVertical: 8,
        },
    });

// Build the styles for the leaderboard screen.
export const getLeaderboardStyles = (theme: Theme) =>
    StyleSheet.create({
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
            backgroundColor: '#FFF8EE',
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

// Build the styles for the dashboard screen.
export const getDashboardStyles = (theme: Theme) =>
    StyleSheet.create({
        // Inside getDashboardStyles in commonStyles.ts

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
            color: '#FFFFFF',
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
            color: '#FFF',
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
            color: '#FFF',
        },

        // Trail complete modal
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

// Build the styles for the trails screen.
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
            color: '#FFFFFF',
            letterSpacing: 0.5,
        },
    });

// Small placeholder avatar used by the leaderboard mock data.
export const testUser = {
    profilePicture: `https://api.dicebear.com/7.x/bottts/svg?seed=test`
};
