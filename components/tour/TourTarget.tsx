// components/tour/TourTarget.tsx
// Wrap any single element (a button, a tab bar icon, a section) with this
// to make it a spotlight-able guided-tour target. `id` must match a step's
// `targetKey` in lib/onboarding.ts exactly.
//
// HOW THIS FITS INTO THE ONBOARDING TOUR SYSTEM (see lib/tourTargets.tsx
// for the registry this component talks to, and -- per this file's task
// context -- components/OnboardingTour.tsx for the overlay that actually
// draws the spotlight):
//   1. A single `TourTargetsProvider` is mounted once near the root of the
//      app (app/_layout.tsx) and holds a shared Map of id -> element ref.
//   2. Any screen that has a control worth spotlighting during onboarding
//      wraps just that control in <TourTarget id="some.unique.id">...
//      </TourTarget>. Mounting this component calls `register(id, ref)`,
//      which stores this component's underlying <View> in that shared Map.
//   3. Separately, lib/onboarding.ts presumably defines an ordered list of
//      tour "steps", each with a human-readable message and a `targetKey`
//      string that matches one of these `id`s.
//   4. When the tour is running, OnboardingTour walks through the steps,
//      and for each one asks the shared registry to `measure(targetKey)` --
//      which looks up the live <View> ref registered under that id and
//      calls React Native's `measureInWindow` on it to get its current
//      on-screen x/y/width/height. OnboardingTour then draws a spotlight/
//      highlight overlay positioned at those exact coordinates, so the
//      tour visually points at the real, live control instead of a
//      hard-coded position or a screenshot.
//   5. Because registration/unregistration happens as components mount
//      and unmount (see the useEffect below), this also automatically
//      handles a target disappearing (e.g. navigating to a different tab)
//      -- the registry just won't have that id available to measure.
//
// In short: this component itself does no spotlighting/rendering of the
// tour UI at all -- it is only a thin "announce my location" wrapper. All
// the actual tour logic (ordering steps, drawing the overlay, advancing)
// lives elsewhere.

import { ReactNode, useEffect, useRef } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useTourTargetsContext } from '../../lib/tourTargets';

// Props for TourTarget:
//   id    - the unique string key this element should be registered under.
//           Must exactly match the `targetKey` of whichever onboarding
//           step is supposed to point at this element.
//   children - whatever element(s) this wrapper should render as-is (the
//           button/icon/section being made spotlight-able). TourTarget is
//           a transparent wrapper -- it doesn't add any visual styling of
//           its own beyond the optional `style` prop below.
//   style - passed straight through to the wrapping <View>, so callers can
//           still control layout/positioning of the wrapped element
//           without TourTarget getting in the way.
type TourTargetProps = {
    id: string;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
};

export default function TourTarget({ id, children, style }: TourTargetProps) {
    // Pulls the shared registry functions out of React context (provided
    // by TourTargetsProvider higher up the tree -- see lib/tourTargets.tsx).
    // `register`/`unregister` are the only two this component needs;
    // `measure`/`scrollIntoView` (also on that context) are used by the
    // tour overlay component instead, not here.
    const { register, unregister } = useTourTargetsContext();
    // A ref to the underlying native <View> so the registry can later call
    // measureInWindow() on the actual rendered element. useRef here (rather
    // than useState) is intentional: this ref never needs to trigger a
    // re-render when it's set -- it's just a mutable box the registry
    // reads from on demand.
    const ref = useRef<View>(null);

    useEffect(() => {
        // On mount (or whenever `id` changes): tell the shared registry
        // "this ref is now the element for `id`".
        register(id, ref);
        // Effect cleanup: on unmount (or right before re-registering under
        // a new id), remove this id from the registry so a stale/unmounted
        // ref is never returned to something trying to measure it.
        return () => unregister(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // (Intentionally depends on `id` only, not on `register`/
        // `unregister` themselves -- those come from context and are
        // expected to be stable for the lifetime of the provider.)
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
