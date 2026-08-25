// lib/tourTargets.tsx
// A tiny registry that lets any on-screen control announce itself as a
// guided-tour target, and lets OnboardingTour (components/OnboardingTour.tsx)
// find and measure it on demand. This is what makes the tour an overlay
// that spotlights a real button/tab instead of a generic slideshow.
//
// Usage: wrap the exact control a tour step should point at in
// <TourTarget id="student.logButton">...</TourTarget> (see
// components/tour/TourTarget.tsx). Give that same string as a step's
// `targetKey` in lib/onboarding.ts. One registry is shared by the whole
// app (mounted once in app/_layout.tsx), so ids just need to be unique
// app-wide -- the "student."/"teacher."/etc. prefixes on existing ids are
// there for readability, not for isolation.

import { createContext, ReactNode, RefObject, useContext, useRef } from 'react';
import { View } from 'react-native';

// The on-screen position/size of a registered tour target, in the same
// coordinate space `measureInWindow` reports (absolute window coordinates,
// not relative to any parent) -- exactly what OnboardingTour needs to draw
// its spotlight cutout and position a step's card next to the real control.
export type TargetRect = { x: number; y: number; width: number; height: number };

// A ref to the actual React Native `View` a `<TourTarget>` wraps. Nullable
// because a ref starts out unattached before the component mounts.
type TargetRefObject = RefObject<View | null>;

// The shape of the shared context value every `<TourTarget>` and
// `OnboardingTour` instance reads/writes through. One instance of this
// (created inside TourTargetsProvider below) is shared app-wide.
type TourTargetsContextValue = {
    // Called by a mounting <TourTarget id="..."> to record its View ref
    // under `id` so it can later be measured/scrolled-to by that same id.
    // Parameters: id -- the tour target's unique key; ref -- the View ref
    // to store. Returns: nothing. Side effects: mutates the shared
    // `targets` Map (see below) -- does not trigger a re-render.
    register: (id: string, ref: TargetRefObject) => void;
    // Called by an unmounting <TourTarget> to remove its entry so a stale
    // ref isn't measured/scrolled-to after the component is gone.
    // Parameters: id -- the tour target's key to remove. Returns: nothing.
    unregister: (id: string) => void;
    // Asks the browser/OS to report the current on-screen position and
    // size of whatever View is registered under `id`.
    // Parameters: id -- which registered target to measure.
    // Returns: a Promise resolving to a TargetRect, or null if nothing is
    // currently registered under this id (e.g. the target hasn't mounted
    // yet, or the tour navigated to a route where it doesn't exist).
    // Side effects: calls the native `measureInWindow` layout API, which
    // is asynchronous (hence the Promise) since it may need to wait for
    // the native layout pass to complete.
    measure: (id: string) => Promise<TargetRect | null>;
    // Best-effort: asks the target's nearest scrollable ancestor to bring
    // it into view. Returns true if it actually asked for a scroll (the
    // caller should wait a beat and re-measure), false if there was
    // nothing to do (e.g. native, where a DOM scrollIntoView doesn't
    // exist) or no target registered under this id.
    scrollIntoView: (id: string) => boolean;
};

// The React context object itself. Starts `null` so any consumer that
// forgets to render inside a <TourTargetsProvider> fails loudly (see
// useTourTargetsContext's thrown error below) instead of silently getting
// a no-op implementation.
const TourTargetsContext = createContext<TourTargetsContextValue | null>(null);

// Mounted once near the root of the app (see app/_layout.tsx) to provide
// the shared tour-target registry to every screen beneath it. Any
// <TourTarget> anywhere in the tree registers itself here, and any
// OnboardingTour instance anywhere in the tree can measure/scroll to any
// registered target by id -- neither side needs a direct reference to the
// other.
// Parameters:
//   - children: the app's component tree to render beneath this provider.
// Returns: the children wrapped in this context's Provider.
// Side effects: none of its own beyond providing context; the registry
// itself is mutated by register/unregister/measure/scrollIntoView calls
// from elsewhere in the tree (see TourTargetsContextValue above).
export function TourTargetsProvider({ children }: { children: ReactNode }) {
    // A plain mutable Map in a ref, not React state -- registering a
    // target shouldn't re-render the whole provider subtree, and nothing
    // here needs to react to *which* targets exist, only to read whichever
    // one is asked for at measure() time.
    const targets = useRef(new Map<string, TargetRefObject>()).current;

    const value = useRef<TourTargetsContextValue>({
        register(id, ref) {
            targets.set(id, ref);
        },
        unregister(id) {
            targets.delete(id);
        },
        measure(id) {
            return new Promise((resolve) => {
                const node = targets.get(id)?.current;
                if (!node) {
                    resolve(null);
                    return;
                }
                node.measureInWindow((x: number, y: number, width: number, height: number) => {
                    resolve({ x, y, width, height });
                });
            });
        },
        scrollIntoView(id) {
            // React Native View refs forward to a real DOM node on web
            // (react-native-web), which has the browser's own
            // scrollIntoView -- no native equivalent exists on iOS/Android,
            // so this is a no-op there and those targets just render
            // wherever they already are.
            const node = targets.get(id)?.current as unknown as { scrollIntoView?: (opts?: unknown) => void } | null;
            if (node && typeof node.scrollIntoView === 'function') {
                node.scrollIntoView({ block: 'center', inline: 'nearest' });
                return true;
            }
            return false;
        },
    }).current;

    return <TourTargetsContext.Provider value={value}>{children}</TourTargetsContext.Provider>;
}

// The hook <TourTarget> and OnboardingTour actually use to reach the
// shared registry. A thin wrapper over `useContext` that fails loudly
// instead of silently returning a no-op/undefined value.
// Parameters: none.
// Returns: the TourTargetsContextValue provided by the nearest
// TourTargetsProvider ancestor.
// Side effects: throws an Error if called from a component tree that isn't
// wrapped in a TourTargetsProvider -- this is a programmer-error guard,
// not something expected to happen in normal app usage.
export function useTourTargetsContext(): TourTargetsContextValue {
    const ctx = useContext(TourTargetsContext);
    if (!ctx) {
        throw new Error('useTourTargetsContext must be used within a TourTargetsProvider (see app/_layout.tsx)');
    }
    return ctx;
}
