// components/TrailMap.d.ts
//
// FILE OVERVIEW
// -------------
// What is a `.d.ts` file? It's a TypeScript "ambient declaration" file: it
// contains ONLY type information, never any actual runtime code (no
// function bodies, no JSX, no imports that get bundled). Nothing in this
// file is ever executed -- it exists purely so the TypeScript compiler
// (and your editor's autocomplete/type-checking) knows the *shape* of a
// value that is actually implemented somewhere else, in a way TypeScript
// can't figure out on its own.
//
// Why is one needed here specifically? Metro (the React Native/Expo
// bundler) supports "platform-specific extensions": when code elsewhere
// writes `import TrailMap from './TrailMap'` (no extension, no `.native`
// or `.web` suffix), Metro automatically picks ONE of:
//   - TrailMap.native.tsx  -- used on iOS and Android
//   - TrailMap.web.tsx     -- used in the browser
// at bundle time, per-platform. This is Metro's platform-extension
// resolution convention -- there is no single "components/TrailMap.tsx"
// file that both of those funnel through; the extensionless import IS the
// shared name both platform files answer to.
//
// The problem: TypeScript's own module resolution (used for type-checking
// and editor tooling, separate from Metro's bundling step) doesn't
// understand Metro's platform-suffix convention. Without this file, a plain
// `import TrailMap from './TrailMap'` would fail to resolve at the
// type-checking level even though Metro resolves it fine at bundle/runtime.
// This file plugs that gap: it declares that a module literally named
// `./TrailMap` exists and describes its exported shape, so both
// `TrailMap.native.tsx` and `TrailMap.web.tsx` are treated as satisfying the
// same contract from every other file's point of view.
//
// The contract itself here is intentionally loose: `props: any` and a
// return type of `JSX.Element` just says "this is a React component that
// takes some props object and renders something" -- it does not enumerate
// individual prop names/types (contrast this with the two implementations,
// TrailMap.native.tsx and TrailMap.web.tsx, which both destructure a
// specific set of named props like walkedCoords, remainingCoords,
// allLandmarks, trailCoords, trailRegion, userPosition, milesWalked,
// mapRef, dStyles, theme, onLandmarkPress, and onRecenter -- this .d.ts
// file just doesn't enforce that shape at the type level).
declare const TrailMap: (props: any) => JSX.Element;
export default TrailMap;
