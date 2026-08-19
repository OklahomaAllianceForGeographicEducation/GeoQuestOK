import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ACTIVITY_OPTIONS, ActivityKey, getActivityConfig, getUnitConfig, InputUnit, milesForActivity } from '../lib/activityTypes';

type ActivityLogResult = {
    activityType: ActivityKey;
    amount: number;
    unit: InputUnit;
    miles: number;
};

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

const keypadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '⌫'],
];

const UNIT_LABELS: Record<InputUnit, string> = {
    steps: 'Steps',
    minutes: 'Minutes',
    miles: 'Miles',
};

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

export default function ActivityLogModal({
    visible,
    onClose,
    onSubmit,
    accentColor = '#FF5722',
    title = 'Log Activity',
    initialActivity = 'walking',
}: ActivityLogModalProps) {
    const [activityType, setActivityType] = useState<ActivityKey>(initialActivity);
    const [selectedUnit, setSelectedUnit] = useState<InputUnit>(getActivityConfig(initialActivity).units[0].unit);
    const [custom, setCustom] = useState('');
    const [isSaving, setIsSaving] = useState(false);
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

    const config = getActivityConfig(activityType);
    const unitConfig = getUnitConfig(activityType, selectedUnit);
    const amount = parseFloat(custom) || 0;
    const previewMiles = milesForActivity(activityType, selectedUnit, amount);

    useEffect(() => {
        if (visible) {
            setActivityType(initialActivity);
            setSelectedUnit(getActivityConfig(initialActivity).units[0].unit);
            setCustom('');
            if (isWeb) {
                const focusDelay = setTimeout(() => inputRef.current?.focus(), 0);
                return () => clearTimeout(focusDelay);
            }
        } else {
            setCustom('');
            setIsSaving(false);
        }
    }, [visible, initialActivity]);

    const handleActivityChange = (key: ActivityKey) => {
        setActivityType(key);
        setSelectedUnit(getActivityConfig(key).units[0].unit);
        setCustom('');
        if (isWeb) inputRef.current?.focus();
    };

    const handleUnitChange = (unit: InputUnit) => {
        setSelectedUnit(unit);
        setCustom('');
        if (isWeb) inputRef.current?.focus();
    };

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
                                    >
                                        <Ionicons name={opt.icon as any} size={16} color={selected ? '#FFF' : '#4E3629'} />
                                        <Text style={[styles.activityPillText, selected && { color: '#FFF' }]}>{opt.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {config.units.length > 1 && (
                            <View style={styles.unitToggleRow}>
                                {config.units.map((u) => {
                                    const selected = u.unit === selectedUnit;
                                    return (
                                        <Pressable
                                            key={u.unit}
                                            style={[styles.unitToggle, selected && { backgroundColor: accentColor, borderColor: accentColor }]}
                                            onPress={() => handleUnitChange(u.unit)}
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
                                    placeholderTextColor="#8E8E93"
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
                            <View style={styles.inputField}>
                                <Text style={{ fontSize: 18, fontWeight: '600', color: custom ? '#4E3629' : '#8E8E93', textAlign: 'center', lineHeight: 30 }}>
                                    {custom || `0 ${selectedUnit}`}
                                </Text>
                                <Text style={styles.previewText}>
                                    ≈ {previewMiles.toFixed(2)} mi
                                </Text>
                            </View>
                        )}

                        <View style={styles.quickActionRow}>
                            {unitConfig.quickAmounts.map((amt) => (
                                <Pressable key={amt} style={styles.quickActionPill} onPress={() => handleQuickAmount(amt)}>
                                    <Text style={styles.quickActionPillText}>
                                        {amt.toLocaleString()} {shortUnitLabel(selectedUnit)}
                                    </Text>
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
                            disabled={isSaving || amount <= 0}
                            onPress={() => void handleSubmit()}
                        >
                            <Text style={styles.submitText}>{isSaving ? 'Saving...' : 'Log Activity'}</Text>
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
        borderColor: '#C8C4B7',
        backgroundColor: '#FFFFFF',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 18,
    },
    activityPillText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4E3629',
    },
    unitToggleRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    unitToggle: {
        borderWidth: 1,
        borderColor: '#C8C4B7',
        backgroundColor: '#FFFFFF',
        paddingVertical: 7,
        paddingHorizontal: 16,
        borderRadius: 14,
    },
    unitToggleText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4E3629',
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
    },
    inputField: {
        minHeight: 46,
        width: '100%',
        maxWidth: 260,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 6,
        justifyContent: 'center',
        marginBottom: 12,
    },
    previewText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#8E8E93',
        textAlign: 'center',
        marginTop: 6,
        marginBottom: 12,
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
        maxWidth: 280,
        alignSelf: 'center',
    },
    quickActionPill: {
        backgroundColor: '#F4F1EA',
        borderWidth: 1,
        borderColor: '#C8C4B7',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 16,
        flex: 1,
        alignItems: 'center',
    },
    quickActionPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#4E3629',
    },
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
