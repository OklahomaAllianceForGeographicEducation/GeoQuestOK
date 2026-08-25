// lib/trails.ts
// Trail data helpers. These functions fetch and normalize rows from Supabase
// so the UI can work with a predictable shape.
//
// FILE OVERVIEW (for someone new to this codebase):
// A "trail" is the central concept of this app -- a real Oklahoma hiking
// trail that students virtually walk by logging miles (see
// app/(tabs)/fitness.tsx and lib/activity.ts). Each trail has display
// metadata (name, mileage, difficulty, description) stored as plain
// columns, plus two GeoJSON blobs (`route_geojson`, `landmarks_geojson`)
// describing its physical path and points of interest -- those blobs are
// further processed by lib/landmarks.ts into plain coordinate/landmark
// lists for map rendering. This file is the data-access layer for the
// `trails` table: fetching, normalizing snake_case rows into camelCase,
// and a couple of OKAGE-only update functions.
//
// Exports:
//   - `TrailDifficulty` -- the fixed set of difficulty labels a trail can have.
//   - `TrailSummary` -- the camelCase shape used for trail list views.
//   - `TrailDetails` -- TrailSummary plus the raw GeoJSON fields and active flag.
//   - `formatMiles(miles)` -- consistent 2-decimal mileage display formatting.
//   - `fetchTrailList()` -- every active trail, ascending by mileage.
//   - `updateTrailInfo(id, fields)` -- OKAGE edit of descriptive-only fields.
//   - `fetchTrailDetails(id)` -- single trail's full record including GeoJSON.
//   - `updateTrailGeojson(id, fields)` -- OKAGE edit of route/landmark geometry.

import { supabase } from '../utils/supabase';

// The fixed set of difficulty labels a trail can be tagged with, matching
// whatever check constraint/enum the `trails.difficulty` column enforces
// in the database. Ordered here roughly from easiest to hardest, though
// TypeScript union types don't preserve or enforce that ordering anywhere
// at runtime -- it's just a readability convention in this list.
export type TrailDifficulty =
    | 'Easiest'
    | 'Easy'
    | 'Easy-Moderate'
    | 'Moderate'
    | 'Moderate-Difficult'
    | 'Difficult'
    | 'Very Difficult'
    | 'Most Difficult';

// The camelCase, UI-friendly shape of one trail's display/list-view data
// (no GeoJSON geometry -- see TrailDetails below for the fuller shape used
// when a single trail's map needs to be rendered).
// Fields:
//   - id: stable row identifier.
//   - name: the trail's display name.
//   - miles: total trail length in miles.
//   - difficulty: one of the TrailDifficulty labels above.
//   - route: free-text description of the trail's route/setting.
//   - highlights: a list of short highlight/feature strings shown as bullet points.
//   - historicalFocus: free-text blurb on the trail's historical/cultural theme.
//   - image_url: optional cover image URL for the trail (kept snake_case here,
//     matching the database column name directly rather than being renamed
//     to camelCase like the other fields on this type).
export type TrailSummary = {
    id: string;
    name: string;
    miles: number;
    difficulty: TrailDifficulty;
    route: string;
    highlights: string[];
    historicalFocus: string;
    image_url?: string | null;

};

// Everything in TrailSummary, plus the raw GeoJSON geometry needed to
// actually render the trail's path and landmarks on a map (see
// lib/landmarks.ts's geojsonLineToCoords/geojsonPointsToLandmarks, which
// consume these two fields), and whether the trail is currently active.
export type TrailDetails = TrailSummary & {
    routeGeojson: any; // Raw GeoJSON FeatureCollection describing the trail's walkable path.
    landmarksGeojson: any; // Raw GeoJSON FeatureCollection describing the trail's points of interest.
    isActive: boolean;
};

// Formats a trail's mileage for consistent display (always exactly two
// decimal places, e.g. 12 -> "12.00").
// Parameters:
//   - miles: the raw mileage number to format.
// Returns: a display string; falls back to "0.00" if `miles` isn't a
// finite number (e.g. NaN/Infinity from bad/missing data), rather than
// rendering "NaN" in the UI.
// Side effects: none -- pure function.
export function formatMiles(miles: number): string {
    return Number.isFinite(miles) ? miles.toFixed(2) : '0.00';
}

// The raw snake_case shape of a `trails` table row as returned by Supabase.
// Numeric/nullable fields are typed loosely here (e.g. `miles: number |
// string`) to reflect that Postgres numeric types can come back as strings
// over the wire, and several text columns can be legitimately null in the
// database even though the normalized TrailSummary shape always provides a
// fallback.
type TrailRow = {
    id: string;
    name: string;
    miles: number | string;
    difficulty: TrailDifficulty;
    route: string | null;
    highlights: string[] | null;
    historical_focus: string | null;
    map_url: string | null;
    image_url: string | null;
    route_geojson?: any;
    landmarks_geojson?: any;
    is_active?: boolean | null;
};

// Convert the database row into the UI-friendly `TrailSummary` shape.
// Parameters:
//   - row: one raw TrailRow as returned by Supabase.
// Returns: a TrailSummary with numeric fields coerced via `Number(...)` and
// nullable text/array fields defaulted to an empty string/array so the UI
// never has to null-check these fields itself.
// Side effects: none -- pure function.
function normalizeTrail(row: TrailRow): TrailSummary {
    return {
        id: String(row.id),
        name: row.name,
        miles: Number(row.miles),
        difficulty: row.difficulty,
        route: row.route ?? '',
        highlights: row.highlights ?? [],
        historicalFocus: row.historical_focus ?? '',
        image_url: row.image_url ?? '',

    };
}

// Fetch the active trail list in ascending mileage order.
// Parameters: none.
// Returns: a Promise resolving to a TrailSummary[] for every trail where
// `is_active = true`, sorted shortest-to-longest by miles -- this is the
// order the student trail-picker (app/trails.tsx) displays them in.
// Side effects: one Supabase SELECT against `trails`. Throws the raw
// Supabase error if the query fails.
export async function fetchTrailList(): Promise<TrailSummary[]> {
    const { data, error } = await supabase
        .from('trails')
        // Only the columns TrailSummary/normalizeTrail actually use are
        // requested -- notably NOT route_geojson/landmarks_geojson, which
        // can be large and aren't needed for a list view.
        .select('id, name, miles, difficulty, route, highlights, historical_focus, image_url')
        // Soft-delete/visibility flag -- an inactive trail (e.g. retired or
        // not-yet-published) is excluded from the student-facing list
        // entirely, though its row still exists in the database.
        .eq('is_active', true)
        .order('miles', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => normalizeTrail(row as TrailRow));
}

// OKAGE-facing: update the descriptive (non-structural) fields of a trail.
// Mileage, difficulty, geometry, and active status are deliberately excluded
// since they drive trail-unlock math rather than being plain display copy.
// Parameters:
//   - id: the trail's row id to update.
//   - fields: the new values for route description, highlights list,
//     historical focus blurb, and cover image URL.
// Returns: a Promise that resolves once the update completes (no data
// returned to the caller).
// Side effects: one Supabase UPDATE against `trails`, filtered to the given
// `id`. An empty `imageUrl` string is stored as `null` rather than an empty
// string. Throws the raw Supabase error on failure.
export async function updateTrailInfo(
    id: string,
    fields: { route: string; highlights: string[]; historicalFocus: string; imageUrl: string }
) {
    const { error } = await supabase
        .from('trails')
        .update({
            route: fields.route,
            highlights: fields.highlights,
            historical_focus: fields.historicalFocus,
            image_url: fields.imageUrl || null,
        })
        .eq('id', id);

    if (error) throw error;
}

// Fetch the full record for a single trail, including GeoJSON fields.
// Parameters:
//   - id: the trail's row id to fetch.
// Returns: a Promise resolving to the raw Supabase row (spread as-is) PLUS
// two extra camelCase aliases (`routeGeojson`, `landmarksGeojson`) for the
// snake_case GeoJSON columns -- note this does NOT go through
// normalizeTrail/TrailSummary, so callers get a slightly different (looser,
// partially snake_case) shape than fetchTrailList's results. Throws if no
// row matches `id` (via `.single()`, which errors on zero OR more-than-one
// matching rows) or if the query otherwise fails.
// Side effects: one Supabase SELECT against `trails`, filtered to the given
// `id`.
export async function fetchTrailDetails(id: string) {
    const { data, error } = await supabase
        .from('trails')
        .select('id, name, miles, difficulty, route_geojson, landmarks_geojson') // Ensure these match your DB columns
        .eq('id', id)
        // `.single()` expects EXACTLY one matching row -- it errors (rather
        // than returning null) if zero or more than one row matches, which
        // is appropriate here since `id` is a primary key.
        .single();

    if (error) throw error;

    return {
        ...data,
        // Map database naming to your component's expected camelCase names
        routeGeojson: data.route_geojson,
        landmarksGeojson: data.landmarks_geojson
    };
}

// OKAGE-facing: overwrite a trail's route/landmark geometry. Unlike
// updateTrailInfo above, this deliberately touches the columns that drive
// trail-unlock mileage math -- the RLS policy (trails_update_okage in
// supabase/okage-role.sql) allows it at the row level already, so the only
// guard is at the UI layer (components/TrailLandmarksEditor.tsx), which
// warns staff before anything here gets called.
// Parameters:
//   - id: the trail's row id to update.
//   - fields: the new raw GeoJSON blobs for the route path and landmark points.
// Returns: a Promise that resolves once the update completes.
// Side effects: one Supabase UPDATE against `trails`, filtered to the given
// `id`, overwriting `route_geojson`/`landmarks_geojson` entirely (not a
// merge -- callers must supply the full, already-edited GeoJSON). Throws
// the raw Supabase error on failure. No server-side validation of the
// GeoJSON shape happens here -- malformed geometry saved through this
// function would only be caught later, by consumers like
// lib/landmarks.ts's parsing functions.
export async function updateTrailGeojson(id: string, fields: { routeGeojson: any; landmarksGeojson: any }) {
    const { error } = await supabase
        .from('trails')
        .update({
            route_geojson: fields.routeGeojson,
            landmarks_geojson: fields.landmarksGeojson,
        })
        .eq('id', id);

    if (error) throw error;
}
