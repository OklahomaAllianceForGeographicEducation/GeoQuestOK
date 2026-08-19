// scripts/import-trails.mjs
// Convert a GeoJSON file into either JSON rows or a SQL upsert statement for
// the `trails` table. This script owns route/metadata columns only — it never
// overwrites `name`, `image_url`, or `landmarks_geojson` on an existing trail
// row (those are curated separately: names via trails.metadata.update.sql,
// images via scripts/import-trail-images.mjs, landmarks via
// scripts/import-quiz-geojson.mjs or manual entry). New trail rows still get
// starting values for those columns; only re-running this against a trail
// that already exists is safe now.
//
// Usage: node scripts/import-trails.mjs <path-to-geojson> [outputPath] [--trail=<id>]
// Pass --trail=<id> to only touch one trail's row, leaving all others alone.

import fs from 'fs';
import path from 'path';
import process from 'process';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const trailFilterArg = process.argv.slice(2).find((arg) => arg.startsWith('--trail='));
const trailFilter = trailFilterArg ? trailFilterArg.slice('--trail='.length) : null;

const inputPath = positionalArgs[0] ?? '/Users/aholderbaum/Downloads/trails.geojson';
const outputPath = positionalArgs[1] ?? path.resolve(process.cwd(), 'supabase', 'trails.upsert.sql');

// Columns this script populates on brand-new trail rows, but never overwrites
// on a trail that already exists — they're curated through other processes.
const PRESERVE_ON_CONFLICT = new Set(['name', 'image_url', 'landmarks_geojson']);

// Read and parse a JSON file.
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Write pretty-printed JSON to disk.
function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

// Build a SQL upsert statement for the trails table.
function writeSql(filePath, rows) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const columns = [
        'id',
        'name',
        'miles',
        'difficulty',
        'route',
        'highlights',
        'historical_focus',
        'map_url',
        'image_url',
        'route_geojson',
        'landmarks_geojson',
        'is_active',
    ];

    const sqlTextArray = (value) => {
        if (!Array.isArray(value) || value.length === 0) return 'ARRAY[]::text[]';
        const items = value.map((item) => `'${String(item).replace(/'/g, "''")}'`).join(', ');
        return `ARRAY[${items}]::text[]`;
    };

    const sqlValue = (column, value) => {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'number') return String(value);
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (column === 'highlights') {
            return sqlTextArray(value);
        }
        if (typeof value === 'object') {
            return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
        }
        return `'${String(value).replace(/'/g, "''")}'`;
    };

    const lines = rows.map((row) => {
        const values = [
            row.id,
            row.name,
            row.miles,
            row.difficulty,
            row.route,
            row.highlights,
            row.historical_focus,
            row.map_url,
            row.image_url,
            row.route_geojson,
            row.landmarks_geojson,
            row.is_active,
        ].map((value, index) => sqlValue(columns[index], value)).join(', ');

        return `(${values})`;
    });

    const updateColumns = columns
        .filter((column) => column !== 'id' && !PRESERVE_ON_CONFLICT.has(column))
        .map((column) => `${column} = excluded.${column}`)
        .join(', ');

    const sql = `insert into public.trails (${columns.join(', ')}) values\n${lines.join(',\n')}\non conflict (id) do update set ${updateColumns};\n`;
    fs.writeFileSync(filePath, sql);
}

// Pick the stable grouping key for a GeoJSON feature.
function getTrailKey(feature) {
    const trailId = feature?.properties?.trail_id;
    if (trailId === undefined || trailId === null || trailId === '') {
        return String(feature?.id ?? 'unknown');
    }
    return String(trailId);
}

// Group route features into one database row per trail.
function buildRows(featureCollection) {
    if (!featureCollection || featureCollection.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
        throw new Error('Expected a GeoJSON FeatureCollection with a features array.');
    }

    const groups = new Map();

    for (const feature of featureCollection.features) {
        const key = getTrailKey(feature);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(feature);
    }

    return [...groups.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([trailId, features]) => {
            const first = features[0];
            const props = first?.properties ?? {};

            return {
                id: trailId,
                name: props.name ?? `Trail ${trailId}`,
                miles: Number(props.total_miles ?? 0),
                difficulty: props.difficulty ?? 'Moderate',
                route: props.route ?? '',
                highlights: props.highlights ?? [],
                historical_focus: props.historical_focus ?? null,
                map_url: props.map_url ?? null,
                image_url: props.image_url ?? null,
                route_geojson: {
                    type: 'FeatureCollection',
                    features,
                },
                landmarks_geojson: null,
                is_active: true,
            };
        });
}

// Script entry point: read the source file and emit the requested output.
const source = readJson(inputPath);
let rows = buildRows(source);

if (trailFilter) {
    rows = rows.filter((row) => row.id === trailFilter);
    if (rows.length === 0) {
        throw new Error(`--trail=${trailFilter} matched no trail in the source file.`);
    }
}

if (outputPath.endsWith('.json')) {
    writeJson(outputPath, rows);
} else {
    writeSql(outputPath, rows);
}

console.log(`Wrote ${rows.length} trail row(s) to ${outputPath}`);
