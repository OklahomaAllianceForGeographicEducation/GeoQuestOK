// components/NumericEntryModal.tsx
//
// A general-purpose popup (React Native `Modal`) for entering a single
// numeric result -- used for things like fitness scores (reps, laps) or a
// timed event (e.g. the one-mile run). Opened by a parent screen which
// controls its `visible` prop and supplies an `onSubmit` callback
// (typically a Supabase write) to persist the value once the student
// submits it.
//
// Unlike its siblings (ActivityLogModal.tsx, which is activity/unit-aware
// with mile conversion, and MileageLogModal.tsx, which is always plain
// miles with quick-add pills), this modal is the generic one: it supports
// two distinct entry `mode`s selected by the caller --
//   - 'number' (default): a single free-typed value (e.g. reps or laps).
//   - 'minuteSeconds': two side-by-side fields (MM / SS) for a timed event,
//     so a student enters a time the way they'd say it out loud instead of
//     having to convert it into raw seconds themselves. The two fields are
//     combined into one total-seconds number before `onSubmit` fires, so
//     callers always receive a single number regardless of mode.
//
// Shape of the UI: a rounded "sheet" card centered over a dimmed backdrop,
// containing the mode-appropriate input (a real text field / two text
// fields on web, a shared hand-built tap keypad on native -- see the
// `isWeb` split below) and a submit button.

import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { colors, Theme } from '../commonStyles';

// Props for NumericEntryModal:
// - visible: whether the Modal is shown. Controlled entirely by the parent
//   screen -- this component has no internal open/close state of its own.
// - onClose: called whenever the modal should be dismissed (tapping the
//   Close button). Parent is expected to flip `visible` back to false.
// - onSubmit: called with the final numeric value once the student submits
//   it. Always reports the value in the same unit regardless of mode -- in
//   'minuteSeconds' mode the two fields are combined into one total-seconds
//   number before this fires, so callers don't need to know or care which
//   mode was used. May return a Promise -- the modal shows a "Saving..."
//   state while it resolves.
// - accentColor: optional highlight color used for the Close button, the
//   active clock field's border (native, minuteSeconds mode), and the
//   submit button. Defaults to a fixed orange.
// - title: optional heading text shown at the top of the sheet. Defaults to
//   "Enter Value".
// - suffix: optional unit label appended after the typed number in
//   'number' mode (e.g. "reps"). Ignored in 'minuteSeconds' mode, which has
//   its own "min"/"sec" labels.
// - mode: 'number' (default) for a single free-typed value, or
//   'minuteSeconds' for the two-field MM:SS clock entry described above.
type NumericEntryModalProps = {
    visible: boolean;
    onClose: () => void;
    // Always reports the final value in the same unit regardless of mode --
    // in 'minuteSeconds' mode the two fields are combined into one total-
    // seconds number before this fires, so callers don't need to know or
    // care which mode was used.
    onSubmit: (value: number) => Promise<void> | void;
    accentColor?: string;
    title?: string;
    suffix?: string;
    // 'number' (default): a single free-typed value, e.g. reps or laps.
    // 'minuteSeconds': two fields (MM / SS) for a timed event like the
    // one-mile run, so students don't have to hand-convert their time into
    // raw seconds before typing it in.
    mode?: 'number' | 'minuteSeconds';
};

// Web has a physical/on-screen OS keyboard behind real text fields, so
// typing works there. Native keeps the original hand-built tap keypad --
// this screen intentionally looks and behaves identically to before on
// iOS/Android; only the web experience changes.
const isWeb = Platform.OS === 'web';

// Rows of keys for the native-only hand-built numeric keypad (see the
// `!isWeb` branch in the JSX below). '⌫' is rendered as a backspace key.
// Shared between both modes -- in 'minuteSeconds' mode it types into
// whichever clock field is currently "active" (see activeClockField state
// and handleKeyPress below).
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

// Digits only, capped at 2 characters and clamped to 0-59 -- used for both
// the minutes and seconds fields so neither can hold something that
// wouldn't make sense as part of a mile-run time.
function sanitizeClockPart(text: string): string {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 2);
    if (digitsOnly === '') return digitsOnly;
    return String(Math.min(59, parseInt(digitsOnly, 10)));
}

// NumericEntryModal
// The exported component itself. Renders a Modal (see props doc above) that
// switches its input UI based on `mode`: a single plain number field, or a
// two-field MM:SS clock entry that gets combined into total seconds before
// `onSubmit` fires.
// Returns: a React Native <Modal> containing the sheet UI described in the
// file-level comment above.
export default function NumericEntryModal({
    visible,
    onClose,
    onSubmit,
    accentColor = '#FF5722',
    title = 'Enter Value',
    suffix = '',
    mode = 'number',
}: NumericEntryModalProps) {
    // useColorScheme() reports the OS/app light-or-dark preference;
    // `?? 'light'` covers the brief moment it can be null/undefined before
    // that preference is known. `getStyles(theme)` (below) builds a fresh
    // theme-colored StyleSheet for whichever scheme is active.
    const scheme = useColorScheme() ?? 'light';
    const theme = colors[scheme];
    const styles = getStyles(theme);

    // -- React state --
    // custom: the raw typed amount for 'number' mode, kept as a STRING (not
    // a number) so the field can be legitimately empty or mid-decimal
    // (e.g. "12.") without losing the trailing dot. Unused in
    // 'minuteSeconds' mode.
    const [custom, setCustom] = useState('');
    // minutes / seconds: the two clock-field strings for 'minuteSeconds'
    // mode, each sanitized to 0-59 by sanitizeClockPart. Unused in 'number'
    // mode.
    const [minutes, setMinutes] = useState('');
    const [seconds, setSeconds] = useState('');
    // Native-only: which clock box the shared tap keypad is currently
    // typing into.
    const [activeClockField, setActiveClockField] = useState<'min' | 'sec'>('min');
    // isSaving: true while the async onSubmit() call (in handleSubmit
    // below) is in flight. Disables the submit button and swaps its label
    // to "Saving..." so a student can't double-submit by tapping twice.
    const [isSaving, setIsSaving] = useState(false);
    // inputRef: handle to the web-only 'number' mode <TextInput>, used to
    // imperatively focus it after the modal opens (see the effect below).
    // secondsRef: handle to the web-only seconds <TextInput> in
    // 'minuteSeconds' mode, used to auto-advance focus once the minutes
    // field is filled (see handleMinutesChange below).
    const inputRef = useRef<TextInput>(null);
    const secondsRef = useRef<TextInput>(null);
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

    // Resets every field (both modes' state, plus which clock field is
    // active) whenever the modal opens or closes, and (web only) focuses
    // the appropriate text input shortly after opening. Dependency array
    // [visible, mode]: also re-runs if the caller changes `mode` while the
    // modal is open, so switching modes doesn't leave stale values from the
    // other mode lying around.
    useEffect(() => {
        if (visible) {
            setCustom('');
            setMinutes('');
            setSeconds('');
            setActiveClockField('min');
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
            // Modal just closed: clear every field and any stuck saving
            // state so the next time it opens it starts fresh.
            setCustom('');
            setMinutes('');
            setSeconds('');
            setIsSaving(false);
        }
    }, [visible, mode]);

    // Derived (recomputed every render) values:
    // - totalFromClock: minutes/seconds combined into a single seconds
    //   count, defaulting missing/invalid parts to 0 so a half-filled clock
    //   still produces a sane (if incomplete) number rather than NaN.
    // - currentValue: whichever of the two entry modes is active, unified
    //   into one number -- this is what actually gets passed to onSubmit.
    const totalFromClock = (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0);
    const currentValue = mode === 'minuteSeconds' ? totalFromClock : parseFloat(custom) || 0;

    // Shared submit path for both modes. Guards against double-submits
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

    // Web-only minutes field handler ('minuteSeconds' mode): sanitizes the
    // typed text to a valid 0-59 clock value, then auto-advances focus to
    // the seconds field once 2 digits are in, so a student can keep typing
    // straight through (e.g. "0630" -> 6 min 30 sec) without reaching for
    // the next field themselves.
    const handleMinutesChange = (text: string) => {
        const cleaned = sanitizeClockPart(text);
        setMinutes(cleaned);
        if (cleaned.length === 2) secondsRef.current?.focus();
    };

    // Native tap-keypad: digits/delete append to whichever plain numeric
    // field is active (the single `custom` field, or one of the two clock
    // boxes), mirroring the original single-keypad interaction.
    const handleKeyPress = (val: string) => {
        if (mode === 'minuteSeconds') {
            // In clock mode, route the tap to whichever of minutes/seconds
            // is currently "active" (see activeClockField state and the
            // tappable clock boxes in the JSX below).
            const setActive = activeClockField === 'min' ? setMinutes : setSeconds;
            const currentActive = activeClockField === 'min' ? minutes : seconds;
            if (val === 'delete') {
                setActive(currentActive.slice(0, -1));
                return;
            }
            const next = sanitizeClockPart(currentActive + val);
            setActive(next);
            // Same auto-advance behavior as handleMinutesChange above, but
            // for the native tap keypad: once minutes reaches 2 digits,
            // switch the active field to seconds so subsequent taps land
            // there instead.
            if (activeClockField === 'min' && next.length === 2) {
                setActiveClockField('sec');
            }
            return;
        }

        // 'number' mode: same append/delete/decimal-guard logic as the
        // other sibling modals' keypad handlers.
        if (val === '.' && custom.includes('.')) return;
        if (custom.length >= 6 && val !== 'delete') return;
        if (val === 'delete') {
            setCustom((prev) => prev.slice(0, -1));
        } else {
            setCustom((prev) => prev + val);
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

                        {mode === 'minuteSeconds' ? (
                            // Two side-by-side clock fields (MM : SS). On
                            // web these are real <TextInput>s that
                            // auto-advance focus; on native they're
                            // Pressable "boxes" that just mark themselves
                            // as the active target for the shared tap
                            // keypad rendered further down (highlighted
                            // with accentColor while active).
                            <View style={styles.clockRow}>
                                <View style={styles.clockField}>
                                    {isWeb ? (
                                        <TextInput
                                            ref={inputRef}
                                            autoFocus
                                            style={styles.clockInput}
                                            value={minutes}
                                            onChangeText={handleMinutesChange}
                                            placeholder="00"
                                            placeholderTextColor={theme.subtext}
                                            keyboardType="number-pad"
                                            maxLength={2}
                                            selectTextOnFocus
                                            returnKeyType="next"
                                            onSubmitEditing={() => secondsRef.current?.focus()}
                                        />
                                    ) : (
                                        <Pressable
                                            style={[styles.clockInput, styles.clockInputTappable, activeClockField === 'min' && { borderColor: accentColor }]}
                                            onPress={() => setActiveClockField('min')}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Minutes, ${minutes || '0'}`}
                                        >
                                            <Text style={[styles.clockValueText, !minutes && styles.clockValueTextPlaceholder]}>{minutes || '00'}</Text>
                                        </Pressable>
                                    )}
                                    <Text style={styles.clockLabelText}>min</Text>
                                </View>
                                <Text style={styles.clockColon}>:</Text>
                                <View style={styles.clockField}>
                                    {isWeb ? (
                                        <TextInput
                                            ref={secondsRef}
                                            style={styles.clockInput}
                                            value={seconds}
                                            onChangeText={(text) => setSeconds(sanitizeClockPart(text))}
                                            placeholder="00"
                                            placeholderTextColor={theme.subtext}
                                            keyboardType="number-pad"
                                            maxLength={2}
                                            selectTextOnFocus
                                            returnKeyType="done"
                                            onSubmitEditing={() => void handleSubmit(currentValue)}
                                        />
                                    ) : (
                                        <Pressable
                                            style={[styles.clockInput, styles.clockInputTappable, activeClockField === 'sec' && { borderColor: accentColor }]}
                                            onPress={() => setActiveClockField('sec')}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Seconds, ${seconds || '0'}`}
                                        >
                                            <Text style={[styles.clockValueText, !seconds && styles.clockValueTextPlaceholder]}>{seconds || '00'}</Text>
                                        </Pressable>
                                    )}
                                    <Text style={styles.clockLabelText}>sec</Text>
                                </View>
                            </View>
                        ) : isWeb ? (
                            // 'number' mode, web: a real text field.
                            // autoFocus + the ref-based focus() in the
                            // effect above mean typing can start the
                            // instant the modal opens.
                            <TextInput
                                ref={inputRef}
                                autoFocus
                                style={styles.textInput}
                                value={custom}
                                onChangeText={(text) => setCustom(sanitizeNumericText(text))}
                                placeholder={`0${suffix ? ` ${suffix}` : ''}`}
                                placeholderTextColor={theme.subtext}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectTextOnFocus
                                onSubmitEditing={() => void handleSubmit(currentValue)}
                            />
                        ) : (
                            // 'number' mode, native: a read-only-looking
                            // display of `custom` (or a placeholder when
                            // empty), driven entirely by the tap keypad
                            // rendered further down.
                            <View style={styles.inputField}>
                                <Text style={{ fontSize: 18, fontWeight: '600', color: custom ? theme.text : theme.subtext, textAlign: 'center', lineHeight: 44 }}>
                                    {custom ? `${custom}${suffix ? ` ${suffix}` : ''}` : `0${suffix ? ` ${suffix}` : ''}`}
                                </Text>
                            </View>
                        )}

                        {/* Native-only hand-built numeric keypad -- hidden
                            entirely on web, where the real <TextInput>(s)
                            above already bring up the OS/on-screen
                            keyboard. Shared between both modes; see
                            handleKeyPress for how it routes taps depending
                            on `mode` and `activeClockField`. */}
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
                            disabled={isSaving || currentValue <= 0}
                            onPress={() => void handleSubmit(currentValue)}
                            accessibilityRole="button"
                            accessibilityLabel="Submit Score"
                        >
                            <Text style={styles.submitText}>{isSaving ? 'Saving...' : 'Continue'}</Text>
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
        maxWidth: 420,
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
        // Keeps the title clear of the absolutely-positioned Close button
        // in the top-right corner. Asymmetric (not mirrored on the left)
        // because this sheet is narrow enough (maxWidth 420) that a full
        // symmetric reserve would force titles like "Enter Your Mile Time"
        // to truncate -- a slightly off-center title reads better than a
        // clipped one.
        paddingRight: 90,
        paddingLeft: 16,
    },
    // -- 'number' mode input styles (web text field / native display field) --
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
        marginBottom: 8,
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
    // -- 'minuteSeconds' mode clock field styles --
    clockRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 8,
    },
    clockField: {
        alignItems: 'center',
        gap: 4,
    },
    clockInput: {
        width: 76,
        height: 56,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        fontSize: 24,
        fontWeight: '700',
        color: theme.text,
        textAlign: 'center',
    },
    clockInputTappable: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    clockValueText: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.text,
    },
    clockValueTextPlaceholder: {
        color: theme.subtext,
    },
    clockColon: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.text,
        marginTop: 14,
    },
    clockLabelText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.subtext,
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
    // -- native tap-keypad styles (shared by both modes) --
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
