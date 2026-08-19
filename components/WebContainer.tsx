// components/WebContainer.tsx
// Centers screen content within a max-width column on wide web viewports
// (Chromebooks/laptops) so cards, forms, and lists don't stretch edge-to-
// edge across a 1300px+ browser window. On native iOS/Android (and narrow
// web windows) this renders as a plain pass-through with no extra layout.

import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

type Props = {
    children: React.ReactNode;
    maxWidth?: number;
    style?: StyleProp<ViewStyle>;
};

export default function WebContainer({ children, maxWidth = 1000, style }: Props) {
    const { isWideWeb } = useResponsive(maxWidth);

    if (!isWideWeb) {
        return <>{children}</>;
    }

    return (
        <View style={[{ width: '100%', maxWidth, alignSelf: 'center' }, style]}>
            {children}
        </View>
    );
}
