// components/tour/TourTarget.tsx
// Wrap any single element (a button, a tab bar icon, a section) with this
// to make it a spotlight-able guided-tour target. `id` must match a step's
// `targetKey` in lib/onboarding.ts exactly.

import { ReactNode, useEffect, useRef } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useTourTargetsContext } from '../../lib/tourTargets';

type TourTargetProps = {
    id: string;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
};

export default function TourTarget({ id, children, style }: TourTargetProps) {
    const { register, unregister } = useTourTargetsContext();
    const ref = useRef<View>(null);

    useEffect(() => {
        register(id, ref);
        return () => unregister(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    return (
        // collapsable={false} keeps Android from flattening this View out
        // of the native tree, which would otherwise make measureInWindow
        // fail silently.
        <View ref={ref} collapsable={false} style={style}>
            {children}
        </View>
    );
}
