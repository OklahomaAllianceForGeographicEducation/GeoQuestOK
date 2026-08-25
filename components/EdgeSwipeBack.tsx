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

// How wide (in points) the invisible touch-catching strip is, measured from
// the left edge of its parent. Only touches starting inside this strip are
// considered for the swipe-back gesture.
const EDGE_WIDTH = 24;
// Minimum horizontal drag distance (in points) for a slow swipe to still
// count as "swipe back" even if it wasn't flicked quickly.
const DISMISS_DISTANCE = 60;
// Minimum horizontal velocity (points/second) for a quick flick to count as
// "swipe back" even if it didn't travel very far.
const DISMISS_VELOCITY = 800;

// Props (inline type, not a separate alias):
// - onSwipeBack: callback fired once, when the pan gesture ends and either
//   the distance or velocity threshold was met. Typically wired to
//   navigation.goBack() or closing a modal/subpage.
// - topOffset: pixels to inset the strip from the top of its parent, so it
//   doesn't cover a pinned header that should keep its own touch handling.
//   Defaults to 0 (strip covers the full parent height).
//
// EdgeSwipeBack
// A gesture-only component: it renders no visible UI (the View has no
// background/content) but attaches a react-native-gesture-handler Pan
// gesture to a thin, absolutely-positioned strip along the left edge of
// its parent. This recreates the iOS system "swipe from left edge to go
// back" gesture for screens/subpages that don't get it for free.
// Returns: a GestureDetector wrapping a single (invisible) positioned View.
export default function EdgeSwipeBack({ onSwipeBack, topOffset = 0 }: { onSwipeBack: () => void; topOffset?: number }) {
    // Gesture.Pan() creates a "pan" (drag) gesture recognizer from
    // react-native-gesture-handler. Each chained method configures how it
    // behaves:
    //   - runOnJS(true): gesture-handler normally runs gesture callbacks on
    //     the UI thread (for performance with Reanimated); this forces the
    //     .onEnd callback to run on the JS thread instead, which is
    //     required here since onSwipeBack is a plain JS function/prop, not
    //     a "worklet".
    //   - activeOffsetX(10): the gesture only "activates" (starts capturing
    //     the touch) once the finger has moved at least 10 points
    //     horizontally -- this avoids hijacking simple taps.
    //   - failOffsetY([-20, 20]): if the touch moves more than 20 points
    //     vertically (up or down) before activating horizontally, the
    //     gesture fails and gives the touch back to whatever's underneath
    //     (e.g. a ScrollView), so vertical scrolling near the edge still
    //     works.
    //   - onEnd(e): fires when the finger lifts. `e.translationX` is the
    //     total horizontal distance dragged; `e.velocityX` is the release
    //     speed. If either threshold is exceeded, the swipe is considered a
    //     deliberate "go back" gesture and onSwipeBack() fires.
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
        // GestureDetector is react-native-gesture-handler's wrapper that
        // attaches a configured gesture (built above) to the native view
        // it wraps -- without it, `gesture` would just be a plain
        // JS object with no effect on touches.
        <GestureDetector gesture={gesture}>
            <View style={[styles.edge, { top: topOffset }]} />
        </GestureDetector>
    );
}

// -- layout styles: positions the invisible touch-catching strip --
const styles = StyleSheet.create({
    edge: {
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: EDGE_WIDTH,
        // Keeps this strip above sibling content in the paint order so its
        // touches aren't swallowed by whatever is rendered after it in JSX
        // (see the file-level comment above about sibling paint order).
        zIndex: 20,
    },
});
