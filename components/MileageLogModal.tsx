import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

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

export default function MileageLogModal({
    visible,
    onClose,
    onSubmit,
    accentColor = '#FF5722',
    title = 'Log Your Progress',
}: MileageLogModalProps) {
    const [custom, setCustom] = useState('');
    const [isSaving, setIsSaving] = useState(false);
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

    useEffect(() => {
        if (visible) {
            setCustom('');
            if (isWeb) {
                const focusDelay = setTimeout(() => inputRef.current?.focus(), 0);
                return () => clearTimeout(focusDelay);
            }
        } else {
            setCustom('');
            setIsSaving(false);
        }
    }, [visible]);

    const handleKeyPress = (val: string) => {
        if (val === '.' && custom.includes('.')) return;
        if (custom.length >= 6 && val !== 'delete') return;

        if (val === 'delete') {
            setCustom((prev) => prev.slice(0, -1));
        } else {
            setCustom((prev) => prev + val);
        }
    };

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
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            {/* Tapping the dimmed backdrop closes the modal; the sheet
                below is a Pressable that stops that tap from bubbling back
                up to this one, so tapping inside it doesn't close it. */}
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={[styles.sheet, { maxHeight: sheetMaxHeight }]} onPress={(e) => e.stopPropagation()}>
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

                        {isWeb ? (
                            <TextInput
                                ref={inputRef}
                                autoFocus
                                style={styles.textInput}
                                value={custom}
                                onChangeText={(text) => setCustom(sanitizeNumericText(text))}
                                placeholder="0.00 miles"
                                placeholderTextColor="#8E8E93"
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectTextOnFocus
                                onSubmitEditing={() => {
                                    const val = parseFloat(custom);
                                    if (!isNaN(val) && val > 0) void handleSubmit(val);
                                }}
                            />
                        ) : (
                            <View style={styles.inputField}>
                                <Text style={{ fontSize: 18, fontWeight: '600', color: custom ? '#4E3629' : '#8E8E93', textAlign: 'center', lineHeight: 44 }}>
                                    {custom || '0.00 miles'}
                                </Text>
                            </View>
                        )}

                        <View style={styles.quickActionRow}>
                            {[1, 3, 5].map((amt) => (
                                <Pressable key={amt} style={styles.quickActionPill} onPress={() => handleSubmit(amt)}>
                                    <Text style={styles.quickActionPillText}>+{amt} mi</Text>
                                </Pressable>
                            ))}
                        </View>

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
                            disabled={isSaving || !custom || parseFloat(custom) === 0}
                            onPress={async () => {
                                const val = parseFloat(custom);
                                if (!isNaN(val) && val > 0) {
                                    await handleSubmit(val);
                                }
                            }}
                        >
                            <Text style={styles.submitText}>{isSaving ? 'Saving...' : 'Log Miles'}</Text>
                        </Pressable>
                    </ScrollView>
                </Pressable>
            </Pressable>
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
        backgroundColor: '#FAF9F5',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#C8C4B7',
        paddingTop: 24,
        paddingBottom: 24,
        width: '100%',
        maxWidth: 560,
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
        // Matching padding on both sides keeps the centered title clear of
        // the absolutely-positioned Close button in the top-right corner
        // (paddingLeft mirrors it purely so the text stays visually
        // centered, even though nothing sits on the left).
        paddingHorizontal: 90,
    },
    textInput: {
        height: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        borderRadius: 8,
        paddingHorizontal: 16,
        fontSize: 18,
        fontWeight: '600',
        color: '#4E3629',
        textAlign: 'center',
        marginBottom: 16,
    },
    inputField: {
        height: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: 'center',
        marginBottom: 16,
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
        backgroundColor: '#F4F1EA',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        flex: 1,
        alignItems: 'center',
    },
    quickActionPillText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4E3629',
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
