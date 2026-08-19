// lib/landmarks.ts
// Shared helpers for turning a trail's route/landmark GeoJSON into plain
// coordinate and landmark lists, used by the student map and the OKAGE quiz
// editor's landmark picker.

export type Coordinate = { latitude: number; longitude: number };

export type Landmark = {
    id: string;
    title: string;
    description?: string;
    coordinate: Coordinate;
    mileMarker: number;
    image?: string;
    funFact?: string;
};

export type ActiveTrail = {
    id: string;
    name: string;
    totalMiles: number;
    routeCoordinates: Coordinate[];
    landmarks: Landmark[];
};

function toCoordArray(points: any[]): Coordinate[] {
    return points
        .filter((p: any) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
        .map((p: any) => ({ latitude: p[1], longitude: p[0] }));
}

// Raw [lng, lat] point equality within a tiny tolerance -- segments drawn
// as separate digitizing passes over the same real path tend to share an
// EXACT endpoint (the tool snapped to the same vertex), but a small
// epsilon guards against harmless floating point noise.
const POINT_EPSILON = 1e-5;
function pointsClose(a: any[], b: any[]): boolean {
    return Math.abs(a[0] - b[0]) < POINT_EPSILON && Math.abs(a[1] - b[1]) < POINT_EPSILON;
}

// Chains a MultiLineString's separate pieces back into one continuous
// path. Some trails here (e.g. Tallgrass) were digitized across multiple
// drawing sessions, so the real route ended up split into 2-3 pieces that
// share an endpoint where one session picked up where the last left off --
// previously this just took the single LONGEST piece and silently dropped
// the rest, which for Tallgrass cut the route off around mile 57 even
// though its landmarks (and end flag) go all the way to mile 90. This
// starts from the longest piece and greedily attaches any other piece
// that connects to either end of the growing chain, leaving genuinely
// disconnected stray segments (trailhead loops, parking connectors,
// drawing slips) out.
function chainSegments(segments: any[][]): any[] {
    if (segments.length === 0) return [];
    if (segments.length === 1) return segments[0];

    // A segment whose first and last point are (almost) the same is a
    // closed stray loop, not a piece of the walkable path -- drop those
    // before chaining unless every segment is like that. No length cap: a
    // real chain-link segment necessarily has two DIFFERENT endpoints
    // (that's what lets it connect two other pieces together), so any
    // closed loop -- however many points it has -- is an artifact, not a
    // walkable link. Cross Timbers' route had a 17-point closed loop right
    // at the Stillwater trailhead that a length<=6 cap let slip through and
    // get chained onto the front of the route, rendering as a stray jog
    // before the actual walk even started.
    const isStrayLoop = (seg: any[]) => seg.length > 0 && pointsClose(seg[0], seg[seg.length - 1]);
    let candidates = segments.filter((seg) => !isStrayLoop(seg));
    if (candidates.length === 0) candidates = segments;

    candidates = [...candidates].sort((a, b) => b.length - a.length);
    let chain = candidates.shift() as any[];

    let changed = true;
    while (changed && candidates.length > 0) {
        changed = false;
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            if (seg.length === 0) continue;
            if (pointsClose(chain[chain.length - 1], seg[0])) {
                chain = chain.concat(seg.slice(1));
            } else if (pointsClose(chain[chain.length - 1], seg[seg.length - 1])) {
                chain = chain.concat([...seg].reverse().slice(1));
            } else if (pointsClose(chain[0], seg[seg.length - 1])) {
                chain = seg.slice(0, -1).concat(chain);
            } else if (pointsClose(chain[0], seg[0])) {
                chain = [...seg].reverse().slice(0, -1).concat(chain);
            } else {
                continue;
            }
            candidates.splice(i, 1);
            changed = true;
            break;
        }
    }
    return chain;
}

export function geojsonLineToCoords(geojson: any): Coordinate[] {
    const feature = geojson?.features?.[0];
    if (!geojson || !geojson.features || !feature?.geometry?.coordinates) return [];

    const geometry = feature.geometry;

    if (geometry.type === 'LineString') {
        return toCoordArray(geometry.coordinates);
    }

    if (geometry.type === 'MultiLineString') {
        const segments: any[][] = geometry.coordinates ?? [];
        return toCoordArray(chainSegments(segments));
    }

    // Fallback for any other geometry shape: flatten recursively.
    const coords: Coordinate[] = [];
    const pushCoords = (value: any) => {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
            coords.push({ latitude: value[1], longitude: value[0] });
            return;
        }
        for (const item of value) { pushCoords(item); }
    };
    pushCoords(geometry.coordinates);
    return coords;
}

export function geojsonPointsToLandmarks(geojson: any): Landmark[] {
    if (!geojson || !geojson.features) return [];
    return geojson.features.map((f: any) => ({
        id: String(f.id),
        title: f.properties?.title ?? 'Landmark',
        description: f.properties?.description ?? undefined,
        coordinate: {
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
        },
        mileMarker: f.properties?.NearestMile ?? 0,
        image: f.properties?.image ?? undefined,
        funFact: f.properties?.funFact ?? undefined,
    }));
}
