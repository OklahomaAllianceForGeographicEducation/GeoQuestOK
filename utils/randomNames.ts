// utils/randomNames.ts

const ADJECTIVES = [
    'Swift', 'Clever', 'Sunny', 'Bold', 'Nimble', 'Amused', 'Fearless',
    'Daring', 'Zesty', 'Bright', 'Jolly', 'Spunky', 'Quirky', 'Valiant'
];

const NOUNS = [
    'Hiker', 'Scout', 'Explorer', 'Tracker', 'Walker', 'Ranger', 'Voyager',
    'Runner', 'Pioneer', 'Glider', 'Navigator', 'Trecker', 'Rover', 'Blazer'
];

/**
 * Deterministically maps a student's unique identity to a fun, static nickname combination.
 */
export function getAnonymousName(userId: string): string {
    if (!userId) return 'Anonymous Explorer';

    // Create a simple, robust hash code out of the unique string components
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    const adjIndex = Math.abs(hash) % ADJECTIVES.length;
    const nounIndex = Math.abs(hash + 1) % NOUNS.length;

    return `${ADJECTIVES[adjIndex]}${NOUNS[nounIndex]}`;
}