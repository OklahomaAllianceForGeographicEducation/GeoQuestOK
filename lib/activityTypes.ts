// lib/activityTypes.ts
// Converts a logged activity (steps, minutes, or miles) into the shared
// "miles" unit that drives trail progress, using simplified average
// equivalences — similar in spirit to how Apple Fitness turns different
// workouts into one shared "move" credit. Everything is still stored and
// compared as miles; these helpers just handle the conversion + friendly
// display text.

export type ActivityKey = 'walking' | 'running' | 'swimming' | 'cycling' | 'dancing' | 'other';
export type InputUnit = 'steps' | 'minutes' | 'miles';

type UnitConfig = {
    unit: InputUnit;
    perMile: number; // how many of this unit equal 1 mile (1 for 'miles' itself)
    quickAmounts: number[];
};

type ActivityConfig = {
    key: ActivityKey;
    label: string;
    icon: string;
    units: UnitConfig[]; // first entry is the default input mode for this activity
};

const STEPS_UNIT: UnitConfig = { unit: 'steps', perMile: 2000, quickAmounts: [2000, 5000, 10000] };
const MILES_UNIT: UnitConfig = { unit: 'miles', perMile: 1, quickAmounts: [1, 2, 5] };
const MINUTES_UNIT: UnitConfig = { unit: 'minutes', perMile: 20, quickAmounts: [10, 20, 30] };

export const ACTIVITY_OPTIONS: ActivityConfig[] = [
    { key: 'walking', label: 'Walking', icon: 'walk', units: [STEPS_UNIT, MILES_UNIT] },
    { key: 'running', label: 'Running', icon: 'footsteps', units: [MILES_UNIT, MINUTES_UNIT] },
    { key: 'cycling', label: 'Cycling', icon: 'bicycle', units: [MILES_UNIT, MINUTES_UNIT] },
    { key: 'swimming', label: 'Swimming', icon: 'water', units: [MINUTES_UNIT] },
    { key: 'dancing', label: 'Dancing', icon: 'musical-notes', units: [MINUTES_UNIT] },
    { key: 'other', label: 'Other', icon: 'ellipsis-horizontal', units: [MINUTES_UNIT] },
];

export function getActivityConfig(key: ActivityKey | string | null | undefined): ActivityConfig {
    return ACTIVITY_OPTIONS.find((a) => a.key === key) ?? ACTIVITY_OPTIONS[0];
}

// The specific unit config for an activity + unit pair, falling back to the
// activity's default (first) unit if the requested one isn't offered.
export function getUnitConfig(key: ActivityKey | string | null | undefined, unit?: InputUnit | string | null): UnitConfig {
    const config = getActivityConfig(key);
    return config.units.find((u) => u.unit === unit) ?? config.units[0];
}

export function milesForActivity(key: ActivityKey | string, unit: InputUnit | string, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount / getUnitConfig(key, unit).perMile;
}

export function formatMilesShort(miles: number): string {
    const rounded = Math.round(miles * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, '');
}

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

// e.g. "1 hour of swimming" or "10,000 steps of walking" or "3 miles of cycling"
export function formatActivitySummary(activityType: ActivityKey | string | null | undefined, amount: number | null | undefined, unit: InputUnit | string | null | undefined): string {
    if (!activityType || !amount || !unit) return '';
    const config = getActivityConfig(activityType);
    return `${formatAmount(unit as InputUnit, amount)} of ${config.label.toLowerCase()}`;
}

// e.g. "3 miles logged for 1 hour of swimming."
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
