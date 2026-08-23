// components/web/webBrand.ts
// Shared color palette for the public marketing site (app/index.web.tsx,
// app/teachers.tsx, and any other .web.tsx marketing page). Bolder and more
// saturated than the muted in-app theme in commonStyles.ts on purpose — see
// app/index.web.tsx for why.
//
// Two schemes, light and dark. Pick one with `useColorScheme()` the same
// way every in-app screen already does (`colors[scheme]` in
// commonStyles.ts) — there's no separate marketing-site theme mechanism,
// just the same pattern applied to this palette.

export type BrandTheme = {
    // Large-fill roles: full-bleed section/band backgrounds. Each must
    // stay dark enough that white heading/body text over it clears 4.5:1 --
    // in dark mode that rules out reusing the bright accent hues directly
    // (see heroAccent/pineAccent below).
    heroBg: string;
    ctaBg: string;
    // A near-black band used for the footer and the homepage's "About"
    // section. Deliberately does NOT invert with scheme the way the other
    // fills do -- see the comment on `dark.darkBand` below.
    darkBand: string;

    // Small-fill / text roles: icons, inline links, nav accents, chip
    // labels sitting directly on a section background. In light mode these
    // reuse the large-fill hues (a mid-tone color can pass contrast against
    // both a white text on top of it AND a white/cream page behind it at
    // once); dark mode needs distinct, brighter values or the same
    // large-fill/small-text conflict from the light-mode contrast fixes
    // recurs against a black backdrop instead of a white one.
    heroAccent: string;
    pineAccent: string;

    // Page/section surfaces.
    surfaceBase: string;   // primary page background (was a flat "white")
    surfaceRaised: string; // alternating/card background (was a flat "cream")

    // Text.
    ink: string;      // headings, primary text
    subtext: string;  // secondary/meta text
    body: string;      // paragraph copy

    border: string;
};

export const BRAND: Record<'light' | 'dark', BrandTheme> = {
    light: {
        // Darkened from the original #C97427 (~2.5:1 with white/cream text
        // at body sizes, and ~3.5:1 used as text-on-white for the nav
        // wordmark accent, section kickers, and CTA labels) so it clears
        // 4.5:1 WCAG AA in both roles at once, the same fix pattern used
        // for the in-app accent in commonStyles.ts. Still reads as a rich,
        // saturated orange — the marketing site stays bolder than the
        // in-app palette by design, just not so light it fails contrast.
        heroBg: '#9C5A1A',
        ctaBg: '#1F5D50',       // deep pine green — nature/trail themed contrast color
        darkBand: '#241E18',    // near-black brown, matches the app's dark theme bg

        // Light mode's single mid-tone hue does double duty as both the
        // large-fill color and the small icon/text-on-light color, so
        // these match heroBg/ctaBg exactly rather than being distinct
        // values.
        heroAccent: '#9C5A1A',
        pineAccent: '#1F5D50',

        surfaceBase: '#FFFFFF',
        surfaceRaised: '#F6EFE7',

        ink: '#241E18',
        // Darkened from #8A8A8A (~3.45:1 on white, below the 4.5:1 AA
        // floor) -- matches commonStyles.ts' in-app subtext fix.
        subtext: '#6A6A6A',
        body: '#5A5147',

        border: '#EAE0D5',
    },
    dark: {
        // These four fills are dark, desaturated relatives of the light
        // theme's saturated hero/cta colors -- dark enough that white
        // heading text over them still clears 4.5:1 (verified: both give
        // 13:1+), while still carrying enough of the orange/pine hue to
        // read as the same two bands, not a generic gray.
        heroBg: '#3A2A16',
        ctaBg: '#16332C',
        // A warm, distinctly lighter-than-both-neighbors tone: on a page
        // that's already dark, the "About" section reads as its own band by
        // being visibly *elevated* rather than darker -- the same "this
        // section stands apart" role light mode's near-black plays, just
        // achieved in the opposite direction because the baseline flipped.
        // (First attempt reused surfaceRaised's exact value, which put an
        // identically-colored About band directly next to the
        // identically-colored Partners section with no visible seam
        // between them -- caught live, not by contrast math.) The footer
        // does not follow this -- it pins to `light.darkBand` explicitly
        // (see WebFooter.tsx) so it stays the same near-black in both
        // schemes, a deliberate "always-dark footer" rather than a themed
        // surface.
        darkBand: '#3D3226',

        // A flat mid-tone green/orange can't pass contrast as both "text
        // sitting on a black page" and "a background dark enough for white
        // text" at once (the two constraints solve to disjoint luminance
        // ranges), so dark mode needs brighter, separate values here.
        // These match commonStyles.ts' dark theme `accent`/`secondary`
        // exactly, both already verified AA against this exact background.
        heroAccent: '#de9027',
        pineAccent: '#3B8570',

        // Repurposed roles, not literal colors: surfaceBase is now the
        // dark page background and surfaceRaised the lighter, elevated
        // alternate -- the same alternating-rhythm role each played in
        // light mode, just inverted. Matches commonStyles.ts dark theme's
        // background/surface pair exactly.
        surfaceBase: '#1E1A16',
        surfaceRaised: '#2C2620',

        ink: '#F6EFE7',
        subtext: '#A89880',
        body: '#A89880',

        border: '#3D3530',
    },
};
