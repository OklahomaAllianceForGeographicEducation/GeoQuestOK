// components/EdgeSwipeBack.tsx
// A thin, invisible strip pinned to the left edge of its parent that
// recognizes the standard iOS-style "swipe from the left edge to go back"
// gesture, calling `onSwipeBack` once the drag passes a distance/velocity
// threshold. Render it as an absolutely-positioned sibling inside whatever
// full-height container holds the "subpage" you want swipeable — it only
// claims touches that START within EDGE_WIDTH of the left edge, so it
// never interferes with scrolling or other touches further into the
// content.
//
// zIndex matters here: React Native paints later siblings on top of
// earlier ones regardless of position type, so if this is rendered before
// a sibling ScrollView/content view in JSX (the natural place to put it),
// that content would otherwise paint over this strip and silently
// swallow the touch before the gesture ever sees it.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const EDGE_WIDTH = 24;
const DISMISS_DISTANCE = 60;
const DISMISS_VELOCITY = 800;

// `topOffset` lets the strip start below a pinned header (e.g. a back
// button bar) it shouldn't overlap, instead of covering the whole parent
// height — pass the header's measured height, or leave it at 0 when
// there's no separate header to avoid (the strip's own container already
// excludes it).
export default function EdgeSwipeBack({ onSwipeBack, topOffset = 0 }: { onSwipeBack: () => void; topOffset?: number }) {
    const gesture = Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX(10)
        .failOffsetY([-20, 20])
        .onEnd((e) => {
            if (e.translationX > DISMISS_DISTANCE || e.velocityX > DISMISS_VELOCITY) {
                onSwipeBack();
            }
        });

    return (
        <GestureDetector gesture={gesture}>
            <View style={[styles.edge, { top: topOffset }]} />
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    edge: {
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: EDGE_WIDTH,
        zIndex: 20,
    },
});
