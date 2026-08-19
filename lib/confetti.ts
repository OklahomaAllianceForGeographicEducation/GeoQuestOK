// lib/confetti.ts
// Config for the celebratory confetti burst shown when a student unlocks a
// badge (see components/ConfettiBurst.tsx, wired in via
// components/BadgeUnlockProvider.tsx). Editing this file is the only thing
// needed to change what shows up in the burst -- add, remove, or reorder
// entries freely.
//
// Most confetti pieces are plain colored squares/circles. A small fraction
// instead render one of the "special" particles below. Each entry is
// either a plain emoji string (renders everywhere, no image hosting
// needed) or a real custom image, written as { uri: '...' } instead of a
// string -- e.g. a shoe or panda graphic uploaded to Supabase Storage
// (the same badge-stickers bucket used for badge images works fine, or
// any other public image URL).
export type ConfettiSpecial = string | { uri: string };

export const CONFETTI_SPECIALS: ConfettiSpecial[] = [
    '👟', // shoe
    '🥾', // hiking boot
    '🧭', // compass
    '🗺️', // map
    '🏅', // medal
    '⭐',
    '🍃',
    // Example of a real custom image instead of an emoji:
    // { uri: 'https://pylcsytqrhwylhallzav.supabase.co/storage/v1/object/public/badge-stickers/confetti-panda.png' },
];

// Roughly what fraction of particles in a burst use a special shape/image
// instead of a plain colored square/circle -- keep this fairly low so the
// specials read as a fun surprise rather than the whole effect.
export const SPECIAL_PARTICLE_CHANCE = 0.18;

// Plain confetti colors, pulled from the app's own palette so the effect
// feels on-brand rather than generic red/green/blue confetti.
export const CONFETTI_COLORS = ['#DE9027', '#4E3629', '#C5A059', '#2D4A22', '#E07A5F', '#5C8A8A'];
