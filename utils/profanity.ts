// utils/profanity.ts
//
// Content-moderation helpers for anything a student can freely type that
// other people (classmates, teachers) might see: their public nickname/
// display name and free-text fields like a class name. Both exported
// functions are almost certainly called from form-submission handlers
// (e.g. an "edit your username" screen, or a teacher's "create a class"
// screen) to validate/reject input *before* it's saved to Supabase, so
// this module has no side effects of its own -- it just answers yes/no
// questions about a string.
//
// Two related but different checks are exported:
//   - checkIsUsernameAppropriate(name, dbWhitelist, remoteBannedWords):
//     the strict, multi-layer check for public display names. Only
//     accepts letters/spaces/hyphens at all, then runs whitelist/
//     dictionary/remote-banned-word layers on top.
//   - containsProfanity(text): a lighter, dictionary-only scan (still
//     leetspeak-aware) for fields that legitimately need digits/
//     punctuation and so can't use the strict character allowlist above.
//
// Both build on the third-party `bad-words` package's dictionary matcher,
// patched with a small hand-rolled leetspeak normalizer (see
// LEETSPEAK_MAP/resolveLeetspeak below) to close a known bypass gap.

import { Filter } from 'bad-words';

// `bad-words`'s exported Filter class does the actual dictionary lookup --
// isProfane() checks a string against its built-in list of disallowed
// words. One shared instance is created here and reused by both exported
// functions below (rather than constructing a new Filter on every call).
const filter = new Filter();

// `bad-words`' Filter.isProfane() only does plain lowercase substring/
// whole-word matching -- it doesn't catch leetspeak ("sh1t", "$hit"),
// letting a student trivially bypass moderation with common character
// substitutions. Found by an /impeccable audit.
//
// Considered swapping the whole dictionary engine to `obscenity` (a
// leetspeak/confusables-aware matcher, already an installed-but-unused
// dependency at the time) instead of patching around `bad-words`, but its
// package.json `exports` map only allows importing the top-level barrel
// (`import ... from 'obscenity'`), and that barrel's `__exportStar`
// re-export chain crashes at module-init time under this app's Metro
// bundler ("Cannot read properties of undefined (reading 'DataSet')",
// inside its own preset/english.js) -- confirmed the identical import
// works fine under plain Node (both CJS `require()` and ESM `import`), so
// this is a Metro-specific incompatibility in the package, not a bug in
// how it was being used, and there's no supported way to import around the
// crashing file given the exports map. `obscenity` has been removed
// again. This hand-rolled substitution map instead handles just the
// specific leetspeak gap the audit found, with zero new dependencies and
// no bundler-compatibility risk.
//
// Deliberately NOT also collapsing whitespace/punctuation to catch spaced-
// out bypasses ("s h i t"): that's a strictly harder problem (it risks
// collapsing legitimate multi-word names into a false positive, e.g. "Ana
// Lyst" -> "analyst", which contains "anal" -- tested and confirmed this
// exact failure mode while evaluating `obscenity`'s equivalent
// `skipNonAlphabeticTransformer`, which its own maintainers ship disabled
// by default for the same reason). containsProfanity (class names) has no
// whitelist escape hatch for a wrongly-flagged false positive, so that
// tradeoff isn't worth it here either.
// Lookup table mapping each "leetspeak" character to the plain letter it
// visually/phonetically stands in for. Only the characters that actually
// appear as keys here get substituted -- anything else passes through
// resolveLeetspeak() unchanged (see the `?? char` fallback below).
const LEETSPEAK_MAP: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '$': 's',
    '@': 'a',
    '!': 'i',
    '+': 't',
};

// Rewrites every leetspeak character in `text` to its plain-letter
// equivalent using LEETSPEAK_MAP, so that e.g. "sh1t" or "$hit" both
// normalize to "shit" before being run through the dictionary filter.
// The regex character class `[013457$8@!+]` lists exactly the characters
// LEETSPEAK_MAP has replacements for -- String.replace's callback form
// runs once per match, looking up the matched character (`char`) in the
// map; the `?? char` fallback is a safety net (it would only matter if the
// regex and the map's keys ever drifted out of sync) so an unmapped
// character is left as-is instead of becoming `undefined`.
// Note this only handles digit/symbol substitutions -- it does not
// collapse repeated letters or spaced-out bypasses (see the file-level
// discussion above on why that's a deliberate scope limit).
function resolveLeetspeak(text: string): string {
    return text.replace(/[013457$8@!+]/g, (char) => LEETSPEAK_MAP[char] ?? char);
}

/**
 * Validates whether a public nickname complies with safety rules.
 *
 * Runs `name` through five layers in order, short-circuiting (returning
 * immediately) as soon as any layer produces a definitive answer. This
 * "layer" structure means later layers only ever run on input that passed
 * every earlier layer, so each one can assume the checks above it already
 * happened.
 *
 * @param name The username string being evaluated.
 * @param dbWhitelist Dynamic whitelist words from the teacher.
 * @param remoteBannedWords Dynamic array of custom banned words fetched live from Supabase.
 * @returns true if the name is allowed, false if it should be rejected.
 */
// The same character allowance checkIsUsernameAppropriate's Layer 1 below
// enforces (letters, spaces, hyphens only — deliberately no digits, since
// digits are how leetspeak profanity evasion works, e.g. "a$$3"), exposed
// separately so callers can tell "you used a character we don't allow"
// apart from "that reads as an inappropriate word" and show an accurate
// message instead of one generic "not allowed" for both. Call this BEFORE
// checkIsUsernameAppropriate so the more specific reason wins.
export function hasDisallowedCharacters(name: string): boolean {
    return /[^\p{L}\s-]/u.test(name.trim());
}

export function checkIsUsernameAppropriate(
    name: string,
    dbWhitelist: string[],
    remoteBannedWords: string[]
): boolean {
    // Strip leading/trailing whitespace first so e.g. "  Ana  " and "Ana"
    // are treated identically by every layer below.
    const rawTrimmed = name.trim();

    // --- LAYER 1: STRICT CHARACTER ALLOWANCE ---
    // Note: this already structurally blocks digit-based leetspeak for
    // usernames specifically (digits aren't `\p{L}`), so resolveLeetspeak
    // below only ever has symbol characters ($ @ ! +) left to act on here
    // -- it's the digit-permitting containsProfanity (class names) below
    // where it does real work.
    //
    // The regex `/[^\p{L}\s-]/u` reads as "any character that is NOT
    // (`^` inside `[...]` negates the class) a Unicode letter (`\p{L}`,
    // requires the `u` flag), whitespace (`\s`), or a literal hyphen
    // (`-`)". So a name containing a digit, an emoji, an underscore, or
    // punctuation like `$`/`@` fails this test and the whole function
    // returns false immediately -- those characters are never even
    // reachable by the leetspeak/dictionary layers below. See
    // hasDisallowedCharacters above -- same check, exposed separately so
    // callers can report this specific reason distinctly.
    if (hasDisallowedCharacters(rawTrimmed)) {
        return false;
    }

    // --- LAYER 2: TEXT NORMALIZATION ---
    // Three normalization steps chained together, innermost-first:
    //   1. .normalize('NFD') decomposes accented characters into a base
    //      letter plus a separate combining-accent mark (e.g. "é" becomes
    //      the letter "e" followed by a combining acute-accent codepoint).
    //   2. .replace(/\p{M}/gu, '') then strips out those combining marks
    //      (`\p{M}` = Unicode "Mark" category), leaving just the plain
    //      base letters -- so "Ánά" and "Ana" normalize to the same text,
    //      preventing accented characters from being used to dodge the
    //      dictionary match.
    //   3. .toLowerCase() makes the scan case-insensitive.
    // The result is then run through resolveLeetspeak() (defined above)
    // to fold any remaining leetspeak symbols back to plain letters too.
    const normalizedForScan = resolveLeetspeak(
        rawTrimmed
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
    );

    // --- LAYER 3: TEACHER GLOBAL WHITELIST BYPASS ---
    // If the normalized name contains any teacher-approved "safe word"
    // (e.g. a name that happens to look like it contains a flagged
    // substring but is legitimate), it's allowed through immediately --
    // this deliberately runs *before* the dictionary scan below, so a
    // whitelisted word always wins even if it would otherwise also match
    // the profanity dictionary.
    if (dbWhitelist.some(safeWord => normalizedForScan.includes(safeWord.toLowerCase()))) {
        return true;
    }

    // --- LAYER 4: BASE DICTIONARY SCAN ---
    // Falls back to the shared `bad-words` Filter instance (constructed
    // once, at module scope, above) to check the normalized text against
    // its built-in profanity dictionary.
    if (filter.isProfane(normalizedForScan)) {
        return false;
    }

    // --- LAYER 5: DYNAMIC REMOTE BANNED WORDS SCAN ---
    // Scan against the words pulled live from your Supabase banned_words table
    //
    // `.some(...)` returns true as soon as any single banned word matches,
    // short-circuiting the rest of the array -- so this is checking "is
    // there at least one banned word present in the name".
    const containsRemoteBadWord = remoteBannedWords.some(badWord => {
        const cleanBadWord = badWord.toLowerCase().trim();
        if (!cleanBadWord) return false;

        // Escape regex metacharacters before building a pattern from this
        // word -- it comes from the Supabase-managed banned_words table
        // (teacher/admin-controlled, not raw student input), but an
        // unescaped entry containing e.g. `(a+)+` could still construct a
        // slow/pathological pattern or throw at RegExp construction time.
        // Found by an /impeccable audit.
        // `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` finds every character
        // that is special in regex syntax (., *, +, ?, etc.) and prefixes
        // each one with a backslash (`\\$&` inserts a literal backslash
        // before the whole matched character, `$&` meaning "the matched
        // text"), so the banned word is treated as literal text to search
        // for rather than as a regex pattern to execute.
        const escapedBadWord = cleanBadWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Match using boundaries to avoid breaking legitimate names like Kieran
        //
        // NOTE (worth double-checking): this builds
        // `\b<word>\b|<word>` -- a word-boundary-anchored alternative OR'd
        // with a second, plain/unanchored copy of the exact same word. Since
        // any substring match found by the plain `<word>` alternative is a
        // superset of what `\b<word>\b` alone would match (the boundary
        // version is strictly more restrictive), the unanchored `|<word>`
        // branch always succeeds whenever the boundary branch would, and
        // also succeeds in cases the boundary branch would have rejected.
        // In other words, as written this regex behaves the same as a
        // plain unanchored substring search -- the `\b...\b` half doesn't
        // currently change which strings match, even though the comment
        // above describes boundary-only matching as the intent.
        const regex = new RegExp(`\\b${escapedBadWord}\\b|${escapedBadWord}`, 'i');
        return regex.test(normalizedForScan);
    });

    // Invert: the function returns whether the name is *appropriate*, so
    // "no remote bad word was found" (false) becomes "appropriate" (true).
    return !containsRemoteBadWord;
}

/**
 * Base profanity dictionary scan for free-text fields (e.g. a class name)
 * that legitimately contain digits/punctuation and so can't use
 * checkIsUsernameAppropriate's strict letters-only character allowlist --
 * which is exactly why this one needs resolveLeetspeak even more than that
 * function does: a plain-substring scan here would miss "cl4ss n4me" the
 * way it used to. Deliberately lighter than checkIsUsernameAppropriate:
 * normalization + the dictionary scan only, no remote banned-words list.
 *
 * @param text Free-form text to scan (e.g. a class name). Unlike
 *   checkIsUsernameAppropriate, digits and punctuation are allowed through
 *   unchanged here -- only the profanity dictionary check (after
 *   normalization) can reject the text.
 * @returns true if `text` is considered profane (i.e. the caller should
 *   reject it), false if it passed the scan.
 */
export function containsProfanity(text: string): boolean {
    // Same three-step normalization as LAYER 2 above (decompose accents,
    // strip the accent marks, lowercase), then leetspeak-resolved, before
    // being checked against the shared dictionary filter.
    const normalized = resolveLeetspeak(
        text
            .trim()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
    );
    return filter.isProfane(normalized);
}
