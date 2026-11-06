// components/ProgramPartners.tsx
// Partner logos (Oklahoma Rural Health Transformation Program, OKAGE, and
// the Oklahoma State Department of Education) plus the shared partnership /
// CMS funding disclosure, shown at the bottom of every account (settings)
// screen. Replaces the acknowledgement paragraph each account screen used to
// copy-paste inline.
//
// The logos sit on a fixed white card in both themes -- the source files
// have white backgrounds baked in, so dropping them straight onto the dark
// theme's surface would show hard white rectangles. The logos are
// deliberately not tappable: these screens are used by students, so we
// don't add off-app links here (the public website's sponsor cards link out
// instead).

import { Image } from 'expo-image';
import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import PartnershipAcknowledgement from './PartnershipAcknowledgement';

const RURAL_HEALTH_LOGO = require('../assets/images/sponsors/ok-rural-health-logo.jpg');
const OKAGE_LOGO = require('../assets/images/sponsors/okage-logo.webp');
const OSDE_LOGO = require('../assets/images/sponsors/osde-logo.png');

type Props = {
    borderColor: string;
    // Style for the disclosure text (each screen passes its existing
    // baseStyles.acknowledgementText so spacing/colour stay as they were).
    textStyle?: StyleProp<TextStyle>;
    // Overrides for the outer wrapper -- e.g. okage-account's ScrollView
    // already pads its content, so it zeroes the default side gutter.
    style?: StyleProp<ViewStyle>;
};

export default function ProgramPartners({ borderColor, textStyle, style }: Props) {
    return (
        <View style={[styles.wrapper, style]}>
            <View style={[styles.card, { borderColor }]}>
                <Image
                    source={RURAL_HEALTH_LOGO}
                    style={styles.ruralHealthLogo}
                    contentFit="contain"
                    accessibilityLabel="Oklahoma Rural Health Transformation Program logo"
                />
                <View style={styles.logoRow}>
                    <Image
                        source={OKAGE_LOGO}
                        style={styles.okageLogo}
                        contentFit="contain"
                        accessibilityLabel="Oklahoma Alliance for Geographic Education logo"
                    />
                    <Image
                        source={OSDE_LOGO}
                        style={styles.osdeLogo}
                        contentFit="contain"
                        accessibilityLabel="Oklahoma State Department of Education logo"
                    />
                </View>
            </View>
            {/* The wrapper already supplies the side gutter, so trim the
                caller's acknowledgementText padding to keep the (now much
                longer) disclosure from being squeezed on phones. */}
            <PartnershipAcknowledgement style={[textStyle, { paddingHorizontal: 4 }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { paddingHorizontal: 24 },
    card: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: 420,
        marginTop: 28,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: '#FFFFFF',
        gap: 14,
    },
    // Matches the source file's 1733x603 aspect ratio.
    ruralHealthLogo: { width: '100%', aspectRatio: 1733 / 603 },
    logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
    okageLogo: { width: 72, height: 72 },
    // 360x128 source.
    osdeLogo: { width: 180, height: 64 },
});
