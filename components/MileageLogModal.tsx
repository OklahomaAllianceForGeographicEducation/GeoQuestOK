// components/MileageLogModal.tsx
//
// A popup (React Native `Modal`) that lets a student log raw mileage
// directly -- no activity type or unit conversion involved, just "how many
// miles did you walk/travel". Opened by a parent screen which controls its
// `visible` prop and supplies an `onSubmit` callback (typically a Supabase
// write) to persist the logged miles once the student submits a value.
//
// Shape of the UI: a rounded "sheet" card centered over a dimmed backdrop,
// containing a numeric entry area (a real text field on web, a hand-built
// tap keypad on native -- see the `isWeb` split below), a row of "+1/+3/+5
// mi" quick-add pills that submit immediately, and a submit button for a
// manually typed amount.
//
// This is one of three near-identical sibling "numeric entry" modals in
// this folder (see ActivityLogModal.tsx and NumericEntryModal.tsx) -- they
// share the same overall sheet layout and web/native input-method split.
// This is the simplest of the three: a single plain number, always in
// miles, with no activity/unit selection step.

import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { colors, Theme } from '../commonStyles';

// Props for MileageLogModal:
// - visible: whether the Modal is shown. Controlled entirely by the parent
//   screen -- this component has no internal open/close state of its own.
// - onClose: called whenever the modal should be dismissed (tapping the
//   backdrop or the Close button). Parent is expected to flip `visible`
//   back to false.
// - onSubmit: called with the finished numeric mileage value once the
//   student submits (either via a quick-add pill or the manual submit
//   button). May return a Promise -- the modal shows a "Saving..." state
//   and disables input while it resolves.
// - accentColor: optional highlight color used for the Close button and the
//   submit button, so the caller can theme this modal per screen. Defaults
//   to a fixed orange.
// - title: optional heading text shown at the top of the sheet. Defaults to
//   "Log Your Progress".
type MileageLogModalProps = {
    visible: boolean;
    onClose: () => void;
    onSubmit: (miles: number) => Promise<void> | void;
    accentColor?: string;
    title?: string;
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

// Strips anything that isn't a digit or a decimal point, and collapses
// multiple decimal points down to just the first one.
function sanitizeNumericText(text: string): string {
    const digitsAndDots = text.replace(/[^0-9.]/g, '');
    const [whole, ...rest] = digitsAndDots.split('.');
    return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}

// MileageLogModal
// The exported component itself. Renders a Modal (see props doc above) that
// lets a student either tap a quick-add mileage pill or type a custom
// amount, then submits that value in miles to the parent's `onSubmit`.
// Returns: a React Native <Modal> containing the sheet UI described in the
// file-level comment above.
export default function MileageLogModal({
    visible,
    onClose,
    onSubmit,
    accentColor = '#FF5722',
    title = 'Log Your Progress',
}: MileageLogModalProps) {
    // useColorScheme() reports the OS/app light-or-dark preference;
    // `?? 'light'` covers the brief moment it can be null/undefined before
    // that preference is known. `getStyles(theme)` (below) builds a fresh
    // theme-colored StyleSheet for whichever scheme is active.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // -- React state --
    // custom: the raw amount typed/tapped in so far, kept as a STRING (not
    // a number) so the field can be legitimately empty, or mid-way through
    // typing a decimal like "3." without losing the trailing dot.
    const [custom, setCustom] = useState('');
    // isSaving: true while the async onSubmit() call (in handleSubmit
    // below) is in flight. Disables the submit button and swaps its label
    // to "Saving..." so a student can't double-submit by tapping twice.
    const [isSaving, setIsSaving] = useState(false);
    // inputRef: a handle to the web-only <TextInput> so it can be
    // imperatively focused (see the effect below) without going through
    // state.
    const inputRef = useRef<TextInput>(null);
    const { height: windowHeight } = useWindowDimensions();
    // A percentage maxHeight on the sheet doesn't reliably resolve on web
    // (it depends on every ancestor in the Modal's portal DOM chain also
    // having a definite height, which isn't guaranteed) -- computing a
    // real pixel cap here sidesteps that entirely, on both platforms.
    const sheetMaxHeight = Math.min(560, windowHeight * 0.85);
    // The ScrollView gets its OWN explicit maxHeight (sheet's cap minus its
    // fixed top/bottom padding) rather than flex: 1. flex: 1 only resolves
    // against a parent with a definite height; sheet's height here is
    // otherwise auto (content-sized, just capped by maxHeight), and in
    // that auto-height context flex: 1 (flexBasis: 0) can collapse the
    // ScrollView to zero instead of filling it -- which is exactly what
    // was happening on native (only the absolutely-positioned Close button
    // was visible). A plain maxHeight has no such ambiguity.
    const scrollMaxHeight = sheetMaxHeight - 48;

    // Resets the entered amount (and any stuck saving state) whenever the
    // modal opens or closes, and (web only) focuses the text input shortly
    // after opening. Dependency array [visible]: this is the only reactive
    // value the effect reads, so it only needs to re-run when the modal is
    // toggled open/closed.
    useEffect(() => {
        if (visible) {
            setCustom('');
            if (isWeb) {
                // setTimeout(..., 0) defers the focus() call to just after
                // this render commits and the <TextInput> actually exists
                // -- calling focus() synchronously here could target a
                // node that isn't mounted yet.
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
    }, [visible]);

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

    // Shared submit path for both the quick-add pills and the manual
    // submit button/keyboard "done" action. Guards against double-submits
    // (isSaving), sets isSaving true so the UI reflects the in-flight write
    // while `onSubmit` (supplied by the parent) resolves, then closes the
    // modal on success. The `finally` ensures isSaving is reset even if
    // onSubmit throws, so the UI doesn't stay stuck disabled.
    const handleSubmit = async (value: number) => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            await onSubmit(value);
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
        // `transparent` lets the custom dimmed overlay below show through
        // instead of an opaque native background; `onRequestClose` is
        // required on Android (it's what the hardware back button
        // triggers).
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            {/* Tapping the dimmed backdrop closes the modal; the sheet
                below is a Pressable that stops that tap from bubbling back
                up to this one, so tapping inside it doesn't close it. */}
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={[styles.sheet, { maxHeight: sheetMaxHeight }]} onPress={(e) => e.stopPropagation()}>
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

                        {isWeb ? (
                            // Real text field (device/physical keyboard) --
                            // web-only. autoFocus + the ref-based focus() in
                            // the effect above mean typing can start the
                            // instant the modal opens, no click needed.
                            // onSubmitEditing (the keyboard's "done"/return
                            // key) parses and submits the typed value
                            // directly, same validation as the submit
                            // button below.
                            <TextInput
                                ref={inputRef}
                                autoFocus
                                style={styles.textInput}
                                value={custom}
                                onChangeText={(text) => setCustom(sanitizeNumericText(text))}
                                placeholder="0.00 miles"
                                placeholderTextColor={theme.subtext}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectTextOnFocus
                                onSubmitEditing={() => {
                                    const val = parseFloat(custom);
                                    if (!isNaN(val) && val > 0) void handleSubmit(val);
                                }}
                            />
                        ) : (
                            // Native: a read-only-looking display of `custom`
                            // (or a placeholder when empty), driven entirely
                            // by the tap keypad rendered further down.
                            <View style={styles.inputField}>
                                <Text style={{ fontSize: 18, fontWeight: '600', color: custom ? theme.text : theme.subtext, textAlign: 'center', lineHeight: 44 }}>
                                    {custom || '0.00 miles'}
                                </Text>
                            </View>
                        )}

                        {/* Quick-add pills: fixed 1/3/5 mile presets that
                            submit IMMEDIATELY on tap (unlike the activity
                            modal's quick-amount pills, which only fill the
                            field) -- there's no unit ambiguity here since
                            everything is already in miles, so there's
                            nothing to preview before committing. */}
                        <View style={styles.quickActionRow}>
                            {[1, 3, 5].map((amt) => (
                                <Pressable
                                    key={amt}
                                    style={styles.quickActionPill}
                                    onPress={() => handleSubmit(amt)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Add ${amt} mile${amt === 1 ? '' : 's'}`}
                                >
                                    <Text style={styles.quickActionPillText}>+{amt} mi</Text>
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

                        {/* Manual submit button for a typed/tapped custom
                            amount. Disabled while saving, or while the
                            field is empty/parses to 0 -- re-parses `custom`
                            at press time (rather than trusting a
                            precomputed value) since it's cheap and keeps
                            this button's validation self-contained. */}
                        <Pressable
                            style={[styles.submitButton, { backgroundColor: accentColor }]}
                            disabled={isSaving || !custom || parseFloat(custom) === 0}
                            onPress={async () => {
                                const val = parseFloat(custom);
                                if (!isNaN(val) && val > 0) {
                                    await handleSubmit(val);
                                }
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Log Miles"
                        >
                            <Text style={styles.submitText}>{isSaving ? 'Saving...' : 'Log Miles'}</Text>
                        </Pressable>
                    </ScrollView>
                </Pressable>
            </Pressable>
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
    // -- title text styles --
    title: {
        fontSize: 20,
        fontFamily: 'Georgia',
        fontWeight: '800',
        color: theme.text,
        marginBottom: 16,
        marginTop: 6,
        textAlign: 'center',
        width: '100%',
        // Matching padding on both sides keeps the centered title clear of
        // the absolutely-positioned Close button in the top-right corner
        // (paddingLeft mirrors it purely so the text stays visually
        // centered, even though nothing sits on the left).
        paddingHorizontal: 90,
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
        marginBottom: 16,
    },
    inputField: {
        height: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: 'center',
        marginBottom: 16,
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
    // -- quick-add pill styles --
    quickActionRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 6,
        width: '100%',
        maxWidth: 260,
        alignSelf: 'center',
    },
    quickActionPill: {
        backgroundColor: theme.background,
        borderWidth: 1,
        borderColor: theme.border,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        flex: 1,
        alignItems: 'center',
    },
    quickActionPillText: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.text,
    },
    // -- native tap-keypad styles --
    grid: {
        width: '100%',
        maxWidth: 280,
        gap: 8,
        alignSelf: 'center',
        marginTop: 8,
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
