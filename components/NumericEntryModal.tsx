import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

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

export default function NumericEntryModal({
    visible,
    onClose,
    onSubmit,
    accentColor = '#FF5722',
    title = 'Enter Value',
    suffix = '',
    mode = 'number',
}: NumericEntryModalProps) {
    const [custom, setCustom] = useState('');
    const [minutes, setMinutes] = useState('');
    const [seconds, setSeconds] = useState('');
    // Native-only: which clock box the shared tap keypad is currently
    // typing into.
    const [activeClockField, setActiveClockField] = useState<'min' | 'sec'>('min');
    const [isSaving, setIsSaving] = useState(false);
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

    useEffect(() => {
        if (visible) {
            setCustom('');
            setMinutes('');
            setSeconds('');
            setActiveClockField('min');
            if (isWeb) {
                const focusDelay = setTimeout(() => inputRef.current?.focus(), 0);
                return () => clearTimeout(focusDelay);
            }
        } else {
            setCustom('');
            setMinutes('');
            setSeconds('');
            setIsSaving(false);
        }
    }, [visible, mode]);

    const totalFromClock = (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0);
    const currentValue = mode === 'minuteSeconds' ? totalFromClock : parseFloat(custom) || 0;

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

    const handleMinutesChange = (text: string) => {
        const cleaned = sanitizeClockPart(text);
        setMinutes(cleaned);
        // Auto-advance to seconds once 2 digits are in, so a student can
        // keep typing straight through without reaching for the field.
        if (cleaned.length === 2) secondsRef.current?.focus();
    };

    // Native tap-keypad: digits/delete append to whichever plain numeric
    // field is active (the single `custom` field, or one of the two clock
    // boxes), mirroring the original single-keypad interaction.
    const handleKeyPress = (val: string) => {
        if (mode === 'minuteSeconds') {
            const setActive = activeClockField === 'min' ? setMinutes : setSeconds;
            const currentActive = activeClockField === 'min' ? minutes : seconds;
            if (val === 'delete') {
                setActive(currentActive.slice(0, -1));
                return;
            }
            const next = sanitizeClockPart(currentActive + val);
            setActive(next);
            if (activeClockField === 'min' && next.length === 2) {
                setActiveClockField('sec');
            }
            return;
        }

        if (val === '.' && custom.includes('.')) return;
        if (custom.length >= 6 && val !== 'delete') return;
        if (val === 'delete') {
            setCustom((prev) => prev.slice(0, -1));
        } else {
            setCustom((prev) => prev + val);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
                    <Pressable style={[styles.closeButton, { backgroundColor: accentColor }]} onPress={onClose}>
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
                                            placeholderTextColor="#8E8E93"
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
                                            placeholderTextColor="#8E8E93"
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
                                        >
                                            <Text style={[styles.clockValueText, !seconds && styles.clockValueTextPlaceholder]}>{seconds || '00'}</Text>
                                        </Pressable>
                                    )}
                                    <Text style={styles.clockLabelText}>sec</Text>
                                </View>
                            </View>
                        ) : isWeb ? (
                            <TextInput
                                ref={inputRef}
                                autoFocus
                                style={styles.textInput}
                                value={custom}
                                onChangeText={(text) => setCustom(sanitizeNumericText(text))}
                                placeholder={`0${suffix ? ` ${suffix}` : ''}`}
                                placeholderTextColor="#8E8E93"
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectTextOnFocus
                                onSubmitEditing={() => void handleSubmit(currentValue)}
                            />
                        ) : (
                            <View style={styles.inputField}>
                                <Text style={{ fontSize: 18, fontWeight: '600', color: custom ? '#4E3629' : '#8E8E93', textAlign: 'center', lineHeight: 44 }}>
                                    {custom ? `${custom}${suffix ? ` ${suffix}` : ''}` : `0${suffix ? ` ${suffix}` : ''}`}
                                </Text>
                            </View>
                        )}

                        {!isWeb && (
                            <View style={styles.grid}>
                                {keypadRows.map((row, idx) => (
                                    <View key={idx} style={styles.row}>
                                        {row.map((key) => (
                                            <Pressable
                                                key={key}
                                                style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                                                onPress={() => handleKeyPress(key === '⌫' ? 'delete' : key)}
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
                        >
                            <Text style={styles.submitText}>{isSaving ? 'Saving...' : 'Continue'}</Text>
                        </Pressable>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(44,30,23,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#DDD9D0',
        paddingTop: 24,
        paddingBottom: 24,
        width: '100%',
        maxWidth: 420,
        alignItems: 'center',
        marginBottom: Platform.OS === 'ios' ? 34 : 20,
        overflow: 'hidden',
        shadowColor: '#000',
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
    title: {
        fontSize: 20,
        fontFamily: 'Georgia',
        fontWeight: '800',
        color: '#4E3629',
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
    textInput: {
        height: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DDD9D0',
        borderRadius: 8,
        paddingHorizontal: 16,
        fontSize: 18,
        fontWeight: '600',
        color: '#4E3629',
        textAlign: 'center',
        marginBottom: 8,
    },
    inputField: {
        height: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DDD9D0',
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: 'center',
        marginBottom: 16,
    },
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
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DDD9D0',
        borderRadius: 8,
        fontSize: 24,
        fontWeight: '700',
        color: '#4E3629',
        textAlign: 'center',
    },
    clockInputTappable: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    clockValueText: {
        fontSize: 24,
        fontWeight: '700',
        color: '#4E3629',
    },
    clockValueTextPlaceholder: {
        color: '#8E8E93',
    },
    clockColon: {
        fontSize: 24,
        fontWeight: '700',
        color: '#4E3629',
        marginTop: 14,
    },
    clockLabelText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#8E8E93',
    },
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
        backgroundColor: '#F4F1EA',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    keyPressed: {
        backgroundColor: '#E5E1D4',
    },
    keyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#4E3629',
    },
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
