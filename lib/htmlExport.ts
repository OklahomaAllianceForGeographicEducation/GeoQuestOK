// lib/htmlExport.ts
// Shared helper for the three PDF-export report screens
// ((admin-tabs)/reports.tsx, (teacher-tabs)/reports.tsx,
// (okage-tabs)/reports.tsx), each of which builds a raw HTML string for
// Print.printAsync by interpolating real user-entered names (class names,
// teacher names, school/district names) directly into template literals.
// None of those interpolations were escaped -- a class a teacher named
// something like "Mrs. Lee's 3rd & 4th Period" would break the exported
// PDF's HTML structure (a bare "&" isn't valid inside HTML text), and a
// name containing "<" or ">" could inject real markup into an otherwise
// plain-text report. Caught during a pre-alpha /impeccable harden pass.

// Escapes the five characters that are meaningful in HTML text content.
// Order matters: "&" must be escaped first, or the "&" this function itself
// inserts for the other four replacements would get double-escaped.
export function escapeHtml(value: unknown): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
