// lib/activityTypes.ts
// Converts a logged activity (steps, minutes, or miles) into the shared
// "miles" unit that drives trail progress, using simplified average
// equivalences — similar in spirit to how Apple Fitness turns different
// workouts into one shared "move" credit. Everything is still stored and
// compared as miles; these helpers just handle the conversion + friendly
// display text.
//
// FILE OVERVIEW:
// This is a pure, no-network, no-Supabase module (unlike most other files in
// lib/) -- it's purely client-side configuration + formatting logic for the
// activity-logging UI (e.g. components/MileageLogModal.tsx,
// components/NumericEntryModal.tsx). It defines:
//   - ActivityKey / InputUnit: the closed sets of activity types and input
//     units the app supports.
//   - ACTIVITY_OPTIONS: the master list of activities, each with which
//     input units it accepts and quick-pick shortcut amounts for each.
//   - getActivityConfig / getUnitConfig: lookups into ACTIVITY_OPTIONS.
//   - milesForActivity: the actual unit-conversion math (X units -> miles).
//   - formatMilesShort / formatActivitySummary / formatActivityJournalLine:
//     human-readable text formatting for logged amounts.

// The activities a student can log. 'other' is a catch-all for anything not
// covered by the named categories.
export type ActivityKey = 'walking' | 'running' | 'swimming' | 'cycling' | 'dancing' | 'other';
// The units a logged amount can be entered in. Whichever unit is chosen, the
// amount is converted to 'miles' via milesForActivity before being stored
// (see lib/activity.ts's logMilesActivity).
export type InputUnit = 'steps' | 'minutes' | 'miles';

// Describes one input unit option for an activity: how to convert an amount
// in that unit into miles, and which round-number amounts to offer as
// one-tap "quick add" buttons in the UI.
type UnitConfig = {
    unit: InputUnit;
    perMile: number; // how many of this unit equal 1 mile (1 for 'miles' itself)
    quickAmounts: number[];
};

// Describes one loggable activity type: its identifying key, its display
// label and icon (an Ionicons name string, used directly by <Ionicons name=.../>
// in the UI), and which input units it can be logged in.
type ActivityConfig = {
    key: ActivityKey;
    label: string;
    icon: string;
    units: UnitConfig[]; // first entry is the default input mode for this activity
};

// Shared unit configs, reused across multiple activities below so the
// step/mile/minute conversion factors and quick-pick amounts stay consistent
// (e.g. every activity that accepts minutes uses the same 20-minutes-per-mile
// approximation and the same 10/20/30 quick amounts).
const STEPS_UNIT: UnitConfig = { unit: 'steps', perMile: 2000, quickAmounts: [2000, 5000, 10000] };
const MILES_UNIT: UnitConfig = { unit: 'miles', perMile: 1, quickAmounts: [1, 2, 5] };
const MINUTES_UNIT: UnitConfig = { unit: 'minutes', perMile: 20, quickAmounts: [10, 20, 30] };

// The full, ordered list of loggable activities shown in the activity-log
// UI. For each activity, `units[0]` is the default/pre-selected input mode
// (e.g. walking defaults to logging by steps, but can switch to miles;
// swimming only ever offers minutes).
export const ACTIVITY_OPTIONS: ActivityConfig[] = [
    { key: 'walking', label: 'Walking', icon: 'walk', units: [STEPS_UNIT, MILES_UNIT] },
    { key: 'running', label: 'Running', icon: 'footsteps', units: [MILES_UNIT, MINUTES_UNIT] },
    { key: 'cycling', label: 'Cycling', icon: 'bicycle', units: [MILES_UNIT, MINUTES_UNIT] },
    { key: 'swimming', label: 'Swimming', icon: 'water', units: [MINUTES_UNIT] },
    { key: 'dancing', label: 'Dancing', icon: 'musical-notes', units: [MINUTES_UNIT] },
    { key: 'other', label: 'Other', icon: 'ellipsis-horizontal', units: [MINUTES_UNIT] },
];

/**
 * Looks up the full ActivityConfig (label, icon, accepted units) for an
 * activity key.
 *
 * @param key - The activity key to look up (e.g. 'walking'). Accepts a
 *   loosely-typed `string | null | undefined` as well as the strict
 *   ActivityKey, since callers often pass a value straight out of
 *   Supabase/route params where TypeScript can't guarantee it's already one
 *   of the known keys.
 * @returns The matching ActivityConfig from ACTIVITY_OPTIONS. If `key`
 *   doesn't match any known activity (including when it's null/undefined),
 *   falls back to `ACTIVITY_OPTIONS[0]` (walking) rather than returning
 *   undefined -- so callers never have to null-check the result.
 *
 * No side effects -- pure lookup against the local ACTIVITY_OPTIONS array,
 * no network/Supabase calls.
 */
export function getActivityConfig(key: ActivityKey | string | null | undefined): ActivityConfig {
    return ACTIVITY_OPTIONS.find((a) => a.key === key) ?? ACTIVITY_OPTIONS[0];
}

/**
 * Looks up the UnitConfig (conversion factor + quick-add amounts) for one
 * specific activity + input-unit combination -- e.g. "walking, logged in
 * steps".
 *
 * @param key - The activity key (see getActivityConfig for typing/fallback
 *   behavior).
 * @param unit - Which input unit's config to find within that activity's
 *   `units` list (e.g. 'steps', 'minutes', 'miles'). Optional/nullable
 *   because a caller may not have a unit selected yet.
 * @returns The specific unit config for an activity + unit pair, falling
 *   back to the activity's default (first) unit in its `units` array if the
 *   requested unit isn't offered for that activity (e.g. asking for
 *   'steps' on 'swimming', which only accepts minutes).
 *
 * No side effects -- pure lookup, no network calls.
 */
export function getUnitConfig(key: ActivityKey | string | null | undefined, unit?: InputUnit | string | null): UnitConfig {
    const config = getActivityConfig(key);
    return config.units.find((u) => u.unit === unit) ?? config.units[0];
}

/**
 * Converts a raw logged amount (in whatever unit the student entered) into
 * the shared "miles" unit that trail progress is stored and compared in.
 *
 * @param key - Which activity this amount was logged under (determines the
 *   conversion factor via getUnitConfig, e.g. walking-by-steps vs.
 *   walking-by-miles use different `perMile` values).
 * @param unit - Which unit `amount` is expressed in (e.g. 'steps').
 * @param amount - The raw number the student entered, in `unit`'s units
 *   (e.g. 10000 for "10,000 steps").
 * @returns `amount` divided by that unit's `perMile` conversion factor, i.e.
 *   the equivalent number of miles. Returns exactly `0` (rather than
 *   throwing) if `amount` is not a finite, positive number -- e.g. NaN,
 *   Infinity, zero, or negative input all safely become 0 miles logged.
 *
 * No side effects -- pure arithmetic, no network calls. This is the
 * function every caller of logMilesActivity (lib/activity.ts) is expected
 * to run first, to turn a UI-entered amount into the `miles` value that
 * actually gets written to the activity_logs table.
 */
export function milesForActivity(key: ActivityKey | string, unit: InputUnit | string, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount / getUnitConfig(key, unit).perMile;
}

/**
 * Formats a raw miles value as a short, human-friendly number string, with
 * no trailing zeroes and no unit suffix (see formatAmount below for the
 * version that appends "mile(s)").
 *
 * @param miles - The raw miles value to format (e.g. 3.10000001 from
 *   floating-point summation, or 5 exactly).
 * @returns A string with at most 2 decimal places: whole numbers render
 *   with none (e.g. "5"), and fractional values are rounded to 2 decimals
 *   with a single trailing zero stripped (e.g. 3.10 -> "3.1", but 3.14
 *   stays "3.14" since only one trailing zero is ever stripped by the
 *   regex). This intentionally does not strip a trailing zero that isn't
 *   the last character, matching how this value is meant to be read at a
 *   glance rather than as a precise measurement.
 *
 * No side effects -- pure string formatting.
 */
export function formatMilesShort(miles: number): string {
    const rounded = Math.round(miles * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, '');
}

// Formats a raw (unit, amount) pair as a human-readable phrase describing
// the ORIGINAL entry the student made -- e.g. "10,000 steps", "3 miles", or
// "1 hour 20 minutes". Not exported; only formatActivitySummary below calls
// this. Each unit branch:
//   - 'steps': rounds to a whole number and adds thousands separators via
//     toLocaleString (e.g. 10000 -> "10,000 steps").
//   - 'miles': reuses formatMilesShort for the number, then singularizes
//     "mile" vs "miles" depending on whether the formatted value is exactly 1.
//   - anything else (minutes): converts total minutes into an hours+minutes
//     breakdown, omitting the hour part entirely if there are none, and
//     omitting the minutes part if they're exactly 0 (e.g. 90 -> "1 hour 30
//     minutes", 60 -> "1 hour", 45 -> "45 minutes").
function formatAmount(unit: InputUnit, amount: number): string {
    if (unit === 'steps') {
        return `${Math.round(amount).toLocaleString()} steps`;
    }
    if (unit === 'miles') {
        const milesStr = formatMilesShort(amount);
        return `${milesStr} ${Number(milesStr) === 1 ? 'mile' : 'miles'}`;
    }
    const totalMinutes = Math.round(amount);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
    if (minutes === 0) return hourPart;
    return `${hourPart} ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Builds a short phrase describing a logged activity in its ORIGINAL
 * (pre-conversion) unit, e.g. "1 hour of swimming", "10,000 steps of
 * walking", or "3 miles of cycling". Used as the human-readable "what you
 * actually did" half of a journal line (see formatActivityJournalLine).
 *
 * @param activityType - The activity key the entry was logged under (e.g.
 *   'swimming'). Loosely typed to accept whatever raw value came back from
 *   Supabase.
 * @param amount - The raw amount originally entered (before mile
 *   conversion), or null/undefined if not recorded.
 * @param unit - The unit `amount` is in, or null/undefined if not recorded.
 * @returns The formatted phrase, or an empty string if any of
 *   activityType/amount/unit is missing/falsy (there's nothing meaningful
 *   to summarize without all three -- note this also means a genuine `0`
 *   amount is treated the same as "missing" and produces an empty string).
 *
 * No side effects -- pure formatting, delegates to getActivityConfig and
 * the local formatAmount helper.
 */
export function formatActivitySummary(activityType: ActivityKey | string | null | undefined, amount: number | null | undefined, unit: InputUnit | string | null | undefined): string {
    if (!activityType || !amount || !unit) return '';
    const config = getActivityConfig(activityType);
    return `${formatAmount(unit as InputUnit, amount)} of ${config.label.toLowerCase()}`;
}

/**
 * Builds the full, one-line journal sentence shown for a single logged
 * activity entry, combining the converted miles credit with the original
 * entry's summary, e.g. "3 miles logged for 1 hour of swimming."
 *
 * @param activityType - The activity key the entry was logged under, or
 *   null/undefined.
 * @param amount - The raw, pre-conversion amount originally entered, or
 *   null/undefined.
 * @param unit - The unit `amount` is in, or null/undefined.
 * @param miles - The already-converted miles value this entry counted for
 *   (i.e. the value actually stored in activity_logs.miles). Always
 *   required/known, unlike the other three params.
 * @returns A sentence of the form "<X> mile(s) logged for <summary>." when
 *   a summary can be built (see formatActivitySummary for when it can't),
 *   or the shorter "<X> mile(s) logged." when activityType/amount/unit
 *   aren't available (e.g. older rows that predate storing the original
 *   input).
 *
 * No side effects -- pure formatting.
 */
export function formatActivityJournalLine(
    activityType: string | null | undefined,
    amount: number | null | undefined,
    unit: string | null | undefined,
    miles: number
): string {
    const milesStr = formatMilesShort(miles);
    const milesLabel = `${milesStr} ${Number(milesStr) === 1 ? 'mile' : 'miles'}`;
    const summary = formatActivitySummary(activityType, amount, unit);
    return summary ? `${milesLabel} logged for ${summary}.` : `${milesLabel} logged.`;
}
