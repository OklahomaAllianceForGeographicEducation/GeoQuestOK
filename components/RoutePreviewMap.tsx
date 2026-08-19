// components/RoutePreviewMap.tsx
// Platform switch for the trail preview map shown on the Trails screen.

import { Platform } from 'react-native';

const RoutePreviewMap =
    Platform.OS === 'web'
        // The platform-specific files are intentionally loaded with require so
        // each runtime only pulls in the map implementation it can support.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ? require('./RoutePreviewMap.web').default
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        : require('./RoutePreviewMap.native').default;

export default RoutePreviewMap;
