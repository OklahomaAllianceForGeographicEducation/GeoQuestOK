// lib/trails.ts
// Trail data helpers. These functions fetch and normalize rows from Supabase
// so the UI can work with a predictable shape.

import { supabase } from '../utils/supabase';

export type TrailDifficulty =
    | 'Easiest'
    | 'Easy'
    | 'Easy-Moderate'
    | 'Moderate'
    | 'Moderate-Difficult'
    | 'Difficult'
    | 'Very Difficult'
    | 'Most Difficult';

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

export type TrailDetails = TrailSummary & {
    routeGeojson: any;
    landmarksGeojson: any;
    isActive: boolean;
};

// Format a trail distance for display.
export function formatMiles(miles: number): string {
    return Number.isFinite(miles) ? miles.toFixed(2) : '0.00';
}

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
export async function fetchTrailList(): Promise<TrailSummary[]> {
    const { data, error } = await supabase
        .from('trails')
        .select('id, name, miles, difficulty, route, highlights, historical_focus, image_url')
        .eq('is_active', true)
        .order('miles', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => normalizeTrail(row as TrailRow));
}

// OKAGE-facing: update the descriptive (non-structural) fields of a trail.
// Mileage, difficulty, geometry, and active status are deliberately excluded
// since they drive trail-unlock math rather than being plain display copy.
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
export async function fetchTrailDetails(id: string) {
    const { data, error } = await supabase
        .from('trails')
        .select('id, name, miles, difficulty, route_geojson, landmarks_geojson') // Ensure these match your DB columns
        .eq('id', id)
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
