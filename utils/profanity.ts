// utils/profanity.ts
import { Filter } from 'bad-words';

const filter = new Filter();

/**
 * Validates whether a public nickname complies with safety rules.
 * @param name The username string being evaluated.
 * @param dbWhitelist Dynamic whitelist words from the teacher.
 * @param remoteBannedWords Dynamic array of custom banned words fetched live from Supabase.
 */
export function checkIsUsernameAppropriate(
    name: string,
    dbWhitelist: string[],
    remoteBannedWords: string[]
): boolean {
    const rawTrimmed = name.trim();

    // --- LAYER 1: STRICT CHARACTER ALLOWANCE ---
    const invalidCharRegex = /[^\p{L}\s-]/u;
    if (invalidCharRegex.test(rawTrimmed)) {
        return false;
    }

    // --- LAYER 2: TEXT NORMALIZATION ---
    const normalizedForScan = rawTrimmed
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();

    // --- LAYER 3: TEACHER GLOBAL WHITELIST BYPASS ---
    if (dbWhitelist.some(safeWord => normalizedForScan.includes(safeWord.toLowerCase()))) {
        return true;
    }

    // --- LAYER 4: BASE DICTIONARY SCAN ---
    if (filter.isProfane(normalizedForScan)) {
        return false;
    }

    // --- LAYER 5: DYNAMIC REMOTE BANNED WORDS SCAN ---
    // Scan against the words pulled live from your Supabase banned_words table
    const containsRemoteBadWord = remoteBannedWords.some(badWord => {
        const cleanBadWord = badWord.toLowerCase().trim();
        if (!cleanBadWord) return false;

        // Match using boundaries to avoid breaking legitimate names like Kieran
        const regex = new RegExp(`\\b${cleanBadWord}\\b|${cleanBadWord}`, 'i');
        return regex.test(normalizedForScan);
    });

    return !containsRemoteBadWord;
}