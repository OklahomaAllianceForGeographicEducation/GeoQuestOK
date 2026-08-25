// components/RoutePreviewMap.tsx
//
// FILE OVERVIEW
// -------------
// Component: RoutePreviewMap (default export)
// Platform: SHARED entry point / manual platform switch. Note this is a
//   DIFFERENT mechanism from the TrailMap.native.tsx / TrailMap.web.tsx pair
//   elsewhere in this codebase, where Metro's bundler automatically picks
//   the right file based on filename suffix (`.native.tsx` vs `.web.tsx`)
//   whenever something imports the extensionless `./TrailMap`. Here, BOTH
//   RoutePreviewMap.native.tsx and RoutePreviewMap.web.tsx exist too, but
//   this file explicitly checks `Platform.OS` at runtime and manually
//   `require()`s whichever one applies, rather than relying on Metro's
//   automatic suffix resolution. Both approaches achieve the same practical
//   goal (only the platform-appropriate map implementation ends up in the
//   bundle each runtime actually loads), just wired up differently.
// Responsibility: acts purely as a router -- it has no UI or logic of its
//   own. Whatever imports `./RoutePreviewMap` gets back whichever of
//   RoutePreviewMap.web.tsx (browser, Leaflet-based) or
//   RoutePreviewMap.native.tsx (iOS/Android, react-native-maps-based) is
//   correct for the current platform. This is the trail-preview thumbnail
//   map shown on the Trails screen (letting a student see a small snapshot
//   of a route before picking it), distinct from the bigger interactive
//   TrailMap used once a trail is actively being walked.

import { Platform } from 'react-native';

// `Platform.OS` is a React Native global telling you what platform this
// code is currently running on ('web', 'ios', or 'android'). Checking it
// here picks one implementation and assigns it to the `RoutePreviewMap`
// constant below.
const RoutePreviewMap =
    Platform.OS === 'web'
        // The platform-specific files are intentionally loaded with require so
        // each runtime only pulls in the map implementation it can support.
        // Using `require(...)` (a synchronous, runtime call) instead of a
        // top-level `import` here is deliberate: a static `import` at the
        // top of the file would be evaluated (and thus bundled) for EVERY
        // platform regardless of the `Platform.OS` check below, dragging
        // both react-leaflet (web-only) and react-native-maps (native-only)
        // into every build. Because `require()` executes as normal runtime
        // code inside this conditional, only the branch that actually runs
        // gets its module pulled in.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ? require('./RoutePreviewMap.web').default
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        : require('./RoutePreviewMap.native').default;

// Re-export whichever implementation was selected above as this module's
// default export, so callers can simply write
// `import RoutePreviewMap from '../components/RoutePreviewMap'` without
// ever needing to know or care which platform they're on.
export default RoutePreviewMap;
