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

export type TargetRect = { x: number; y: number; width: number; height: number };

type TargetRefObject = RefObject<View | null>;

type TourTargetsContextValue = {
    register: (id: string, ref: TargetRefObject) => void;
    unregister: (id: string) => void;
    measure: (id: string) => Promise<TargetRect | null>;
    // Best-effort: asks the target's nearest scrollable ancestor to bring
    // it into view. Returns true if it actually asked for a scroll (the
    // caller should wait a beat and re-measure), false if there was
    // nothing to do (e.g. native, where a DOM scrollIntoView doesn't
    // exist) or no target registered under this id.
    scrollIntoView: (id: string) => boolean;
};

const TourTargetsContext = createContext<TourTargetsContextValue | null>(null);

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

export function useTourTargetsContext(): TourTargetsContextValue {
    const ctx = useContext(TourTargetsContext);
    if (!ctx) {
        throw new Error('useTourTargetsContext must be used within a TourTargetsProvider (see app/_layout.tsx)');
    }
    return ctx;
}
