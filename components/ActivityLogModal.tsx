// components/ActivityLogModal.tsx
//
// A popup (React Native `Modal`) used to let a student log a physical
// activity (walking, running, biking, etc.) and convert it into miles for
// their trail progress. It is opened by a parent screen (e.g. the
// dashboard/fitness tab) which controls its `visible` prop and supplies an
// `onSubmit` callback to actually persist the logged activity (typically a
// Supabase write) once the student taps "Log Activity".
//
// Shape of the UI: a rounded "sheet" card centered over a dimmed backdrop,
// containing:
//   - a row of activity type pills (walking/running/biking/etc, from
//     lib/activityTypes.ts's ACTIVITY_OPTIONS),
//   - an optional row of unit toggles (e.g. steps vs. minutes) when an
//     activity supports more than one input unit,
//   - a numeric entry area for the amount (a real text field on web, a
//     hand-built tap keypad on native -- see the `isWeb` split below),
//   - a live preview of how many miles that amount converts to,
//   - a row of "quick amount" pills for common values, and
//   - a submit button that calls `onSubmit` with the computed result.
//
// This component is one of three near-identical sibling "numeric entry"
// modals in this folder (see MileageLogModal.tsx and
// NumericEntryModal.tsx) -- they share the same overall sheet layout and
// web/native input-method split, but this one is specialized for
// activity-type + unit selection with mile conversion built in.

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { colors, Theme } from '../commonStyles';
import { ACTIVITY_OPTIONS, ActivityKey, getActivityConfig, getUnitConfig, InputUnit, milesForActivity } from '../lib/activityTypes';

// The final value handed to `onSubmit` once the student taps "Log
// Activity": which activity they picked, the raw amount they entered, the
// unit that amount is in, and the amount already converted to miles (so the
// caller doesn't have to redo that conversion itself).
type ActivityLogResult = {
    activityType: ActivityKey;
    amount: number;
    unit: InputUnit;
    miles: number;
};

// Props for ActivityLogModal:
// - visible: whether the Modal is shown. Controlled entirely by the parent
//   screen -- this component has no internal open/close state of its own.
// - onClose: called whenever the modal should be dismissed (tapping the
//   Close button). Parent is expected to flip `visible` back to false.
// - onSubmit: called with the finished ActivityLogResult once the student
//   submits a valid (> 0) amount. May return a Promise -- the modal shows a
//   "Saving..." state and disables the submit button while it resolves.
// - accentColor: optional highlight color used for selected pills, the
//   Close button, and the submit button, so the caller can theme this modal
//   per screen (e.g. a different accent for different trail themes).
//   Defaults to a fixed orange.
// - title: optional heading text shown at the top of the sheet. Defaults to
//   "Log Activity".
// - initialActivity: which activity type is pre-selected when the modal
//   opens. Defaults to 'walking'.
type ActivityLogModalProps = {
    visible: boolean;
    onClose: () => void;
    onSubmit: (result: ActivityLogResult) => Promise<void> | void;
    accentColor?: string;
    title?: string;
    initialActivity?: ActivityKey;
};

// Web has a physical/on-screen OS keyboard behind a real text field, so
// typing works there. Native keeps the original hand-built tap keypad --
// this screen intentionally looks and behaves identically to before on
// iOS/Android; only the web experience changes.
const isWeb = Platform.OS === 'web';

// Rows of keys for the native-only hand-built numeric keypad (see the
// `!isWeb` branch in the JSX below). '⌫' is rendered as a backspace key.
const keypadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '⌫'],
];

// Human-readable labels for each InputUnit, used on the unit-toggle pills.
const UNIT_LABELS: Record<InputUnit, string> = {
    steps: 'Steps',
    minutes: 'Minutes',
    miles: 'Miles',
};

// Shorter unit label used next to the quick-amount pills (e.g. "500 steps"
// vs. "500 min") where space is tighter than the full toggle labels above.
function shortUnitLabel(unit: InputUnit): string {
    if (unit === 'steps') return 'steps';
    if (unit === 'miles') return 'mi';
    return 'min';
}

// Strips anything that isn't a digit or a decimal point, and collapses
// multiple decimal points down to just the first one -- keeps the field's
// value always parseable by parseFloat() no matter what a device keyboard
// (or a paste) throws at it.
function sanitizeNumericText(text: string): string {
    const digitsAndDots = text.replace(/[^0-9.]/g, '');
    const [whole, ...rest] = digitsAndDots.split('.');
    return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}

// ActivityLogModal
// The exported component itself. Renders a Modal (see props doc above for
// what each prop controls) that lets a student pick an activity type, a
// unit, and an amount, previews the mile conversion live, and calls
// `onSubmit` with the finished result.
// Returns: a React Native <Modal> containing the sheet UI described in the
// file-level comment above.
export default function ActivityLogModal({
    visible,
    onClose,
    onSubmit,
    accentColor = '#FF5722',
    title = 'Log Activity',
    initialActivity = 'walking',
}: ActivityLogModalProps) {
    // useColorScheme() reports the OS/app light-or-dark preference;
    // `?? 'light'` covers the brief moment it can be null/undefined before
    // that preference is known, so `colors[scheme]` is always a valid
    // lookup. `getStyles(theme)` (defined below) builds a fresh
    // theme-colored StyleSheet for whichever scheme is active.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // -- React state --
    // activityType: which activity pill is currently selected (walking,
    // running, biking, etc). Drives which units/quick-amounts are shown.
    const [activityType, setActivityType] = useState<ActivityKey>(initialActivity);
    // selectedUnit: which input unit (steps/minutes/miles) the amount below
    // is currently measured in. Initialized to the activity's first
    // supported unit.
    const [selectedUnit, setSelectedUnit] = useState<InputUnit>(getActivityConfig(initialActivity).units[0].unit);
    // custom: the raw amount typed/tapped in so far, kept as a STRING (not
    // a number) so a field can be legitimately empty, or mid-way through
    // typing a decimal like "12." without losing the trailing dot.
    const [custom, setCustom] = useState('');
    // isSaving: true while the async onSubmit() call (below) is in flight.
    // Disables the submit button and swaps its label to "Saving..." so a
    // student can't double-submit by tapping twice.
    const [isSaving, setIsSaving] = useState(false);
    // inputRef: a handle to the web-only <TextInput> so it can be
    // imperatively focused (see the effects/handlers below) without going
    // through state.
    const inputRef = useRef<TextInput>(null);
    const { height: windowHeight } = useWindowDimensions();
    // A percentage maxHeight on the sheet doesn't reliably resolve on web
    // (it depends on every ancestor in the Modal's portal DOM chain also
    // having a definite height, which isn't guaranteed) -- computing a
    // real pixel cap here sidesteps that entirely, on both platforms.
    const sheetMaxHeight = Math.min(760, windowHeight * 0.94);
    // The ScrollView gets its OWN explicit maxHeight (sheet's cap minus its
    // fixed top/bottom padding) rather than flex: 1. flex: 1 only resolves
    // against a parent with a definite height; sheet's height here is
    // otherwise auto (content-sized, just capped by maxHeight), and in
    // that auto-height context flex: 1 (flexBasis: 0) can collapse the
    // ScrollView to zero instead of filling it -- which is exactly what
    // was happening on native (only the absolutely-positioned Close button
    // was visible). A plain maxHeight has no such ambiguity.
    const scrollMaxHeight = sheetMaxHeight - 48;

    // Derived (recomputed every render, not stored in state) values used
    // throughout the JSX below:
    // - config: the full ActivityKey config (units, quick amounts, icon,
    //   etc.) for whichever activity is currently selected.
    // - unitConfig: the config specifically for the currently selected unit
    //   (e.g. its quick-amount presets).
    // - amount: `custom` parsed to a number, defaulting to 0 if it isn't a
    //   valid number yet (e.g. empty string, or just "-").
    // - previewMiles: `amount` converted to miles using this activity/unit
    //   combo's conversion rule, shown live under the input field.
    const config = getActivityConfig(activityType);
    const unitConfig = getUnitConfig(activityType, selectedUnit);
    const amount = parseFloat(custom) || 0;
    const previewMiles = milesForActivity(activityType, selectedUnit, amount);

    // Resets the modal's inner state whenever it opens or closes, and
    // (web only) focuses the text input shortly after opening.
    // Dependency array [visible, initialActivity]: re-runs whenever the
    // modal is toggled open/closed, or whenever the parent changes which
    // activity should be pre-selected (e.g. opening this modal from a
    // different "log activity" entry point).
    useEffect(() => {
        if (visible) {
            // Re-sync to the initial activity/unit and clear any leftover
            // amount from a previous time this modal was opened.
            setActivityType(initialActivity);
            setSelectedUnit(getActivityConfig(initialActivity).units[0].unit);
            setCustom('');
            if (isWeb) {
                // setTimeout(..., 0) defers the focus() call to just after
                // this render commits and the <TextInput> actually exists
                // in the DOM -- calling focus() synchronously here could
                // target a node that isn't mounted yet.
                const focusDelay = setTimeout(() => inputRef.current?.focus(), 0);
                // Cleanup cancels the pending focus if the effect re-runs
                // (or the component unmounts) before the timeout fires.
                return () => clearTimeout(focusDelay);
            }
        } else {
            // Modal just closed: clear the amount and any stuck saving
            // state so the next time it opens it starts fresh.
            setCustom('');
            setIsSaving(false);
        }
    }, [visible, initialActivity]);

    // Fired when the student taps a different activity pill. Switches the
    // selected activity, resets the unit to that activity's first
    // supported unit (since the previous unit might not apply to the new
    // activity), and clears whatever amount had been entered so it isn't
    // misread against the new activity/unit.
    const handleActivityChange = (key: ActivityKey) => {
        setActivityType(key);
        setSelectedUnit(getActivityConfig(key).units[0].unit);
        setCustom('');
        if (isWeb) inputRef.current?.focus();
    };

    // Fired when the student taps a different unit toggle (e.g. switching
    // from "steps" to "minutes" for the same activity). Clears the amount
    // since a number typed for one unit rarely makes sense in another.
    const handleUnitChange = (unit: InputUnit) => {
        setSelectedUnit(unit);
        setCustom('');
        if (isWeb) inputRef.current?.focus();
    };

    // Native-only hand-built keypad handler: appends/removes a character
    // from `custom` in response to a tap on one of the keypadRows keys.
    // - Ignores a second '.' if one is already present (a numeric value can
    //   only have one decimal point).
    // - Caps the field at 6 characters (ignoring backspace) so the amount
    //   can't grow unreasonably long.
    // - 'delete' (mapped from the '⌫' key below) removes the last
    //   character instead of appending.
    const handleKeyPress = (val: string) => {
        if (val === '.' && custom.includes('.')) return;
        if (custom.length >= 6 && val !== 'delete') return;

        if (val === 'delete') {
            setCustom((prev) => prev.slice(0, -1));
        } else {
            setCustom((prev) => prev + val);
        }
    };

    // Quick-add pills only fill in the amount -- they never submit on their
    // own, so students have a moment to see the converted mile total (e.g.
    // how many steps equal a mile) before anything is logged.
    const handleQuickAmount = (amt: number) => {
        setCustom(String(amt));
    };

    // Fired when the student taps "Log Activity" (or submits the web text
    // field). Guards against double-submits (isSaving) and against
    // submitting a non-positive amount. Sets isSaving true so the button
    // shows "Saving..." and is disabled while `onSubmit` (supplied by the
    // parent, typically a Supabase write) is in flight, then closes the
    // modal on success. The `finally` ensures isSaving is reset even if
    // onSubmit throws, so the button doesn't stay stuck disabled.
    const handleSubmit = async () => {
        if (isSaving || amount <= 0) return;
        setIsSaving(true);
        try {
            await onSubmit({
                activityType,
                amount,
                unit: selectedUnit,
                miles: milesForActivity(activityType, selectedUnit, amount),
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        // Modal is React Native's built-in component for rendering content
        // above everything else in the view hierarchy (similar to a portal
        // on web) -- it takes over the screen until dismissed.
        // `animationType="slide"` slides the content up from the bottom;
        // `transparent` lets the custom dimmed `overlay` View below show
        // through instead of an opaque native background;
        // `onRequestClose` is required on Android (it's what the hardware
        // back button triggers).
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
                    <Pressable
                        style={[styles.closeButton, { backgroundColor: accentColor }]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                    >
                        <Text style={styles.closeButtonText}>Close</Text>
                    </Pressable>

                    {/* An explicit maxHeight (see scrollMaxHeight above) is
                        what makes this ScrollView actually bounded, so long
                        content scrolls INSIDE the card instead of the
                        card's overflow: 'hidden' just silently chopping it
                        off. */}
                    <ScrollView
                        style={[styles.scrollArea, { maxHeight: scrollMaxHeight }]}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Text style={styles.title} numberOfLines={1}>
                            {title}
                        </Text>

                        {/* flexWrap (rather than a horizontal scroll) keeps
                            every activity option fully visible up front --
                            no pill can ever end up clipped at the card's
                            edge with no visible way to reach it. */}
                        <View style={styles.activityRow}>
                            {ACTIVITY_OPTIONS.map((opt) => {
                                const selected = opt.key === activityType;
                                return (
                                    <Pressable
                                        key={opt.key}
                                        style={[styles.activityPill, selected && { backgroundColor: accentColor, borderColor: accentColor }]}
                                        onPress={() => handleActivityChange(opt.key)}
                                        accessibilityRole="button"
                                        accessibilityLabel={opt.label}
                                        accessibilityState={{ selected }}
                                    >
                                        <Ionicons name={opt.icon as any} size={16} color={selected ? '#FFF' : theme.text} />
                                        <Text style={[styles.activityPillText, selected && { color: '#FFF' }]}>{opt.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Unit toggle row only renders when the currently
                            selected activity supports more than one input
                            unit (e.g. walking might support both "steps"
                            and "minutes") -- activities with a single fixed
                            unit skip this row entirely rather than showing
                            a pointless single-option toggle. */}
                        {config.units.length > 1 && (
                            <View style={styles.unitToggleRow}>
                                {config.units.map((u) => {
                                    const selected = u.unit === selectedUnit;
                                    return (
                                        <Pressable
                                            key={u.unit}
                                            style={[styles.unitToggle, selected && { backgroundColor: accentColor, borderColor: accentColor }]}
                                            onPress={() => handleUnitChange(u.unit)}
                                            accessibilityRole="button"
                                            accessibilityLabel={UNIT_LABELS[u.unit]}
                                            accessibilityState={{ selected }}
                                        >
                                            <Text style={[styles.unitToggleText, selected && { color: '#FFF' }]}>{UNIT_LABELS[u.unit]}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}

                        {isWeb ? (
                            // Real text field (device/physical keyboard) --
                            // web-only. autoFocus + the ref-based focus() in
                            // the effect above mean typing can start the
                            // instant the modal opens, no click needed.
                            <>
                                <TextInput
                                    ref={inputRef}
                                    autoFocus
                                    style={styles.textInput}
                                    value={custom}
                                    onChangeText={(text) => setCustom(sanitizeNumericText(text))}
                                    placeholder={`0 ${selectedUnit}`}
                                    placeholderTextColor={theme.subtext}
                                    keyboardType="decimal-pad"
                                    returnKeyType="done"
                                    selectTextOnFocus
                                    onSubmitEditing={() => void handleSubmit()}
                                />
                                <Text style={styles.previewText}>
                                    ≈ {previewMiles.toFixed(2)} mi
                                </Text>
                            </>
                        ) : (
                            // Native: a read-only-looking display of `custom`
                            // (or a placeholder when empty), driven entirely
                            // by the tap keypad rendered further down.
                            <View style={styles.inputField}>
                                <Text style={{ fontSize: 18, fontWeight: '600', color: custom ? theme.text : theme.subtext, textAlign: 'center', lineHeight: 30 }}>
                                    {custom || `0 ${selectedUnit}`}
                                </Text>
                                <Text style={styles.previewText}>
                                    ≈ {previewMiles.toFixed(2)} mi
                                </Text>
                            </View>
                        )}

                        {/* Quick-amount pills: common preset values for the
                            currently selected unit (e.g. common step
                            counts), sourced from unitConfig so they change
                            automatically when the activity/unit changes. */}
                        <View style={styles.quickActionRow}>
                            {unitConfig.quickAmounts.map((amt) => (
                                <Pressable
                                    key={amt}
                                    style={styles.quickActionPill}
                                    onPress={() => handleQuickAmount(amt)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${amt.toLocaleString()} ${shortUnitLabel(selectedUnit)}`}
                                >
                                    <Text style={styles.quickActionPillText}>
                                        {amt.toLocaleString()} {shortUnitLabel(selectedUnit)}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        {/* Native-only hand-built numeric keypad -- hidden
                            entirely on web, where the real <TextInput>
                            above already brings up the OS/on-screen
                            keyboard. Each key calls handleKeyPress with its
                            digit/dot, or 'delete' for the backspace key. */}
                        {!isWeb && (
                            <View style={styles.grid}>
                                {keypadRows.map((row, idx) => (
                                    <View key={idx} style={styles.row}>
                                        {row.map((key) => (
                                            <Pressable
                                                key={key}
                                                style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                                                onPress={() => handleKeyPress(key === '⌫' ? 'delete' : key)}
                                                accessibilityRole="button"
                                                accessibilityLabel={key === '⌫' ? 'Backspace' : key === '.' ? 'Decimal point' : key}
                                            >
                                                <Text style={styles.keyText}>{key}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                ))}
                            </View>
                        )}

                        <Pressable
                            style={[styles.submitButton, { backgroundColor: accentColor }]}
                            disabled={isSaving || amount <= 0}
                            onPress={() => void handleSubmit()}
                            accessibilityRole="button"
                            accessibilityLabel="Log Activity"
                        >
                            <Text style={styles.submitText}>{isSaving ? 'Saving...' : 'Log Activity'}</Text>
                        </Pressable>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// Theme-aware style factory (see commonStyles.ts's Theme type) -- called
// once per render inside the component so every fill/text/border color
// tracks the active light/dark scheme instead of being frozen at hex
// literals that only ever looked right in light mode.
const getStyles = (theme: Theme) => StyleSheet.create({
    // -- overlay/sheet container styles --
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(44,30,23,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    sheet: {
        backgroundColor: theme.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.border,
        paddingTop: 24,
        paddingBottom: 24,
        width: '100%',
        maxWidth: 560,
        alignItems: 'center',
        marginBottom: Platform.OS === 'ios' ? 34 : 20,
        overflow: 'hidden',
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
    },
    scrollArea: {
        width: '100%',
    },
    scrollContent: {
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    // -- title/text styles --
    title: {
        fontSize: 20,
        fontFamily: 'Georgia',
        fontWeight: '800',
        color: theme.text,
        marginBottom: 14,
        marginTop: 6,
        textAlign: 'center',
        width: '100%',
        // Matching padding on both sides keeps the centered title clear of
        // the absolutely-positioned Close button in the top-right corner
        // (paddingLeft mirrors it purely so the text stays visually
        // centered, even though nothing sits on the left).
        paddingHorizontal: 90,
    },
    // -- activity pill row styles --
    activityRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        paddingBottom: 4,
        marginBottom: 12,
    },
    activityPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 18,
    },
    activityPillText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.text,
    },
    // -- unit toggle row styles --
    unitToggleRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    unitToggle: {
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        paddingVertical: 7,
        paddingHorizontal: 16,
        borderRadius: 14,
    },
    unitToggleText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.text,
    },
    // -- amount input styles (web text field / native display field) --
    textInput: {
        height: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        paddingHorizontal: 16,
        fontSize: 18,
        fontWeight: '600',
        color: theme.text,
        textAlign: 'center',
    },
    inputField: {
        minHeight: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 6,
        justifyContent: 'center',
        marginBottom: 12,
    },
    previewText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.subtext,
        textAlign: 'center',
        marginTop: 6,
        marginBottom: 12,
    },
    // -- close button styles --
    closeButton: {
        position: 'absolute',
        top: 14,
        right: 16,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 14,
        zIndex: 10,
    },
    closeButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFF',
        letterSpacing: 0.5,
    },
    // -- quick-amount pill styles --
    quickActionRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 6,
        width: '100%',
        maxWidth: 280,
        alignSelf: 'center',
    },
    quickActionPill: {
        backgroundColor: theme.background,
        borderWidth: 1,
        borderColor: theme.border,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 16,
        flex: 1,
        alignItems: 'center',
    },
    quickActionPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.text,
    },
    // -- native tap-keypad styles --
    grid: {
        width: '100%',
        maxWidth: 280,
        gap: 8,
        alignSelf: 'center',
        marginTop: 12,
    },
    row: {
        flexDirection: 'row',
        gap: 8,
    },
    key: {
        flex: 1,
        height: 44,
        backgroundColor: theme.background,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    keyPressed: {
        backgroundColor: theme.border,
    },
    keyText: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.text,
    },
    // -- submit button styles --
    submitButton: {
        marginTop: 16,
        height: 46,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        maxWidth: 280,
        alignSelf: 'center',
    },
    submitText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
});
