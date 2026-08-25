// lib/landmarks.ts
// Shared helpers for turning a trail's route/landmark GeoJSON into plain
// coordinate and landmark lists, used by the student map and the OKAGE quiz
// editor's landmark picker.
//
// FILE OVERVIEW (for someone new to this codebase):
// Trails in this app are stored in the database as GeoJSON — a standard
// JSON format for describing geographic shapes (points, lines, polygons).
// This file has NO Supabase calls of its own; it is a pure data-shaping
// module that takes the raw GeoJSON blobs already fetched elsewhere (see
// lib/trails.ts's `routeGeojson`/`landmarksGeojson`) and converts them into
// the simple `{ latitude, longitude }` shapes React Native map components
// (react-native-maps / Leaflet) actually want to render.
//
// Exports:
//   - Types: `Coordinate`, `Landmark`, `ActiveTrail` — the plain shapes the
//     rest of the app consumes.
//   - `geojsonLineToCoords(geojson)` — turns a trail's route geometry
//     (a walking path) into an ordered array of coordinates.
//   - `geojsonPointsToLandmarks(geojson)` — turns a trail's landmark
//     geometry (points of interest along the route) into `Landmark[]`.
// A few private helpers (`toCoordArray`, `pointsClose`, `chainSegments`)
// support the two exports above and are not used outside this file.

// A single lat/lng pair. Note the field order: GeoJSON itself stores
// points as [longitude, latitude] (x, y order), but everywhere in THIS
// app's own code (and the map libraries it uses) points are represented
// as { latitude, longitude } for readability — the conversion from one
// order to the other happens in the functions below.
export type Coordinate = { latitude: number; longitude: number };

// One point of interest along a trail (a "landmark") that a student stops
// at to unlock a lesson/quiz.
export type Landmark = {
    id: string; // Stable identifier, taken from the GeoJSON feature's `id`.
    title: string; // Display name shown on the map/landmark strip.
    description?: string; // Optional longer blurb about the landmark.
    coordinate: Coordinate; // Where this landmark sits on the map.
    mileMarker: number; // Distance along the trail (in miles) this landmark sits at — used to decide when it "unlocks" for a student based on miles walked.
    image?: string; // Optional image URL shown alongside the landmark.
    funFact?: string; // Optional bonus trivia shown after completing the landmark's quiz.
};

// The fully-resolved, ready-to-render version of a trail: its walking path
// as a coordinate list plus its landmarks, both already converted out of
// raw GeoJSON by the functions in this file.
export type ActiveTrail = {
    id: string;
    name: string;
    totalMiles: number;
    routeCoordinates: Coordinate[]; // Ordered points tracing the walkable path, ready to feed straight into a map polyline.
    landmarks: Landmark[];
};

// Converts a raw array of GeoJSON [lng, lat] points into this app's
// { latitude, longitude } Coordinate objects.
// Parameters:
//   - points: an array of raw GeoJSON position tuples (each expected to be
//     `[longitude, latitude]`, possibly with extra elements like elevation
//     which are ignored).
// Returns: a Coordinate[] with any malformed entries silently dropped
// (rather than throwing), since this data is hand-digitized and not
// guaranteed to be perfectly clean.
// Side effects: none — pure function, no network/database access.
function toCoordArray(points: any[]): Coordinate[] {
    return points
        // Keep only entries that actually look like a valid [number, number]
        // point; anything else (null, a short array, non-numeric values) is
        // treated as noise and filtered out rather than crashing the caller.
        .filter((p: any) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
        // GeoJSON order is [longitude, latitude] (i.e. p[0] = lng, p[1] =
        // lat) — this line is where that gets flipped into the
        // { latitude, longitude } shape the rest of the app expects.
        .map((p: any) => ({ latitude: p[1], longitude: p[0] }));
}

// Raw [lng, lat] point equality within a tiny tolerance -- segments drawn
// as separate digitizing passes over the same real path tend to share an
// EXACT endpoint (the tool snapped to the same vertex), but a small
// epsilon guards against harmless floating point noise.
const POINT_EPSILON = 1e-5;

// Compares two raw GeoJSON points (each `[lng, lat]`, NOT yet converted to
// Coordinate objects) and reports whether they're "the same point" within
// POINT_EPSILON of each other in both the longitude and latitude axes.
// Parameters: `a`, `b` — raw `[lng, lat]` tuples.
// Returns: true if both axes differ by less than 1e-5 (about a centimeter
// at these latitudes), false otherwise. No side effects.
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
// Parameters:
//   - segments: the raw `coordinates` array of a GeoJSON MultiLineString —
//     an array of "lines", where each line is itself an array of raw
//     `[lng, lat]` points.
// Returns: a single flattened array of raw `[lng, lat]` points representing
// the longest connected walkable path found, in walking order.
// Side effects: none — pure function; does not mutate the input array (it
// works on a shallow copy via `[...candidates]` / `.slice()`/`.concat()`).
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

    // Sort longest-first (by point count) and seed the growing chain with
    // the single longest remaining piece — this is almost always the "real"
    // main path, with everything else being a fragment that should attach
    // to one of its two ends.
    candidates = [...candidates].sort((a, b) => b.length - a.length);
    let chain = candidates.shift() as any[];

    // Greedily grow `chain` by repeatedly scanning the remaining candidates
    // for one that connects to either end of the chain so far. Each pass
    // through the candidates list can attach at most one segment (the loop
    // `break`s and restarts scanning from the top as soon as one is
    // attached, since attaching a segment can change which end is now
    // adjacent to which other candidate). This keeps going until either no
    // candidates are left, or a full pass finds nothing to attach.
    let changed = true;
    while (changed && candidates.length > 0) {
        changed = false;
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            if (seg.length === 0) continue;
            // Four ways `seg` can connect to the current chain: its start
            // touches the chain's end (append forward), its end touches the
            // chain's end (append reversed), its end touches the chain's
            // start (prepend forward), or its start touches the chain's
            // start (prepend reversed). In every case the shared point is
            // sliced off one side (via `.slice(1)` / `.slice(0, -1)`) so it
            // isn't duplicated in the merged chain.
            if (pointsClose(chain[chain.length - 1], seg[0])) {
                chain = chain.concat(seg.slice(1));
            } else if (pointsClose(chain[chain.length - 1], seg[seg.length - 1])) {
                chain = chain.concat([...seg].reverse().slice(1));
            } else if (pointsClose(chain[0], seg[seg.length - 1])) {
                chain = seg.slice(0, -1).concat(chain);
            } else if (pointsClose(chain[0], seg[0])) {
                chain = [...seg].reverse().slice(0, -1).concat(chain);
            } else {
                // Doesn't touch either end of the chain (yet) -- leave it
                // in `candidates` and keep scanning; it might connect once
                // some other segment has been attached first.
                continue;
            }
            // Remove the segment we just merged in, note that progress was
            // made this pass (so the outer `while` keeps going), and
            // restart the inner scan from the top since the chain's ends
            // have now changed.
            candidates.splice(i, 1);
            changed = true;
            break;
        }
    }
    // Whatever is left in `candidates` at this point never touched either
    // end of the growing chain -- those are the "genuinely disconnected
    // stray segments" mentioned above, and are deliberately dropped by not
    // being included in the returned chain.
    return chain;
}

// Converts a trail's route GeoJSON (a GeoJSON FeatureCollection describing
// the walking path) into an ordered list of Coordinate points suitable for
// drawing a polyline on a map.
// Parameters:
//   - geojson: the raw GeoJSON object as stored in the `trails` table's
//     `route_geojson` column (see lib/trails.ts `TrailDetails.routeGeojson`).
//     Expected to be a FeatureCollection whose first feature's geometry is
//     either a `LineString` (one continuous path) or a `MultiLineString`
//     (multiple disconnected line pieces).
// Returns: a Coordinate[] tracing the walkable path in order, or `[]` if
// the input is missing/malformed in any way (never throws).
// Side effects: none — purely reads the passed-in object, no network calls.
export function geojsonLineToCoords(geojson: any): Coordinate[] {
    // Route GeoJSON is always expected to have exactly one feature (the
    // trail's path); grab it defensively in case `features` is missing/empty.
    const feature = geojson?.features?.[0];
    if (!geojson || !geojson.features || !feature?.geometry?.coordinates) return [];

    const geometry = feature.geometry;

    if (geometry.type === 'LineString') {
        // The simple case: one continuous line, so just convert its points.
        return toCoordArray(geometry.coordinates);
    }

    if (geometry.type === 'MultiLineString') {
        // Several separately-digitized pieces that need to be stitched back
        // into one path first (see chainSegments above), THEN converted.
        const segments: any[][] = geometry.coordinates ?? [];
        return toCoordArray(chainSegments(segments));
    }

    // Fallback for any other geometry shape: flatten recursively. This
    // walks arbitrarily-nested arrays (covers geometry types this app
    // doesn't otherwise expect, like `Polygon` or `MultiPoint`) and collects
    // every leaf that looks like a `[number, number]` position, converting
    // each one to a Coordinate as it's found. Order is not guaranteed to be
    // a sensible walking order for anything other than LineString/
    // MultiLineString, hence why those two get their own dedicated branches
    // above.
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

// Converts a trail's landmark GeoJSON (a GeoJSON FeatureCollection where
// each feature is a Point representing one landmark) into the app's
// `Landmark[]` shape.
// Parameters:
//   - geojson: the raw GeoJSON object from the `trails` table's
//     `landmarks_geojson` column (see lib/trails.ts
//     `TrailDetails.landmarksGeojson`). Each feature is expected to be a
//     GeoJSON Point feature with a `properties` bag holding display info
//     (title, description, NearestMile, image, funFact).
// Returns: a Landmark[], one entry per valid feature, in whatever order the
// features appear in the GeoJSON (NOT necessarily sorted by mile marker —
// callers that need mile order should sort explicitly).
// Side effects: none — pure function, no network calls.
export function geojsonPointsToLandmarks(geojson: any): Landmark[] {
    if (!geojson || !geojson.features) return [];
    return geojson.features
        // Unlike toCoordArray above, this used to assume every feature has
        // valid geometry.coordinates and crashed with a TypeError the
        // moment one didn't -- a real risk given trail landmark geometry is
        // hand-edited by non-engineer OKAGE staff via
        // TrailLandmarksEditor.tsx. That crash happened synchronously
        // inside dashboard.tsx's useMemo, with no error boundary around
        // it, so one malformed landmark blanked the whole student map.
        // Found by an /impeccable audit.
        //
        // This filter keeps only features whose geometry.coordinates is
        // actually a usable [number, number] pair, so one bad hand-edited
        // landmark is silently skipped instead of crashing the whole map.
        .filter((f: any) => {
            const coords = f?.geometry?.coordinates;
            return Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number';
        })
        // For each surviving feature, read its display fields out of
        // GeoJSON's free-form `properties` bag (falling back to sensible
        // defaults when a field is missing) and flip its raw [lng, lat]
        // geometry into this app's { latitude, longitude } Coordinate shape.
        .map((f: any) => ({
            id: String(f.id),
            title: f.properties?.title ?? 'Landmark',
            description: f.properties?.description ?? undefined,
            coordinate: {
                latitude: f.geometry.coordinates[1],
                longitude: f.geometry.coordinates[0],
            },
            // "NearestMile" is the property name OKAGE staff's editing tool
            // writes; it maps to this app's camelCase `mileMarker` field.
            mileMarker: f.properties?.NearestMile ?? 0,
            image: f.properties?.image ?? undefined,
            funFact: f.properties?.funFact ?? undefined,
        }));
}
