// scripts/import-quiz-geojson.mjs
// Convert a landmark GeoJSON file (Point features, carrying either a
// `properties.quizzes.{elementary,middle,high}` block -- the original
// per-feature-object format -- or a `properties.quizBank` array -- the
// newer OAS-standards-aligned format used by later trail exports) into a
// SQL file that:
//   1) updates trails.landmarks_geojson with the informational content, and
//   2) upserts quiz_questions rows for any grade band that has wrong answers.
//
// A single landmark's quizBank can carry more than one question for the same
// grade band (e.g. a Reading question and a Social Studies question both at
// "Elementary (3-5)"). Since quiz_questions has a unique (trail_id,
// landmark_id, grade_band) constraint, the 2nd+ question for the same
// landmark+band gets a "-2", "-3", ... suffix appended to landmark_id so all
// of them can be stored.
//
// If you're maintaining `landmarks_geojson` yourself (e.g. pasting it directly
// into the Supabase table editor), pass --questions-only to skip step 1
// entirely and only touch the quiz_questions table.
//
// Usage: node scripts/import-quiz-geojson.mjs <trailId> <path-to-geojson> [outputPath] [--questions-only]

import fs from 'fs';
import path from 'path';
import process from 'process';

const flags = process.argv.slice(2).filter((arg) => arg.startsWith('--'));
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const questionsOnly = flags.includes('--questions-only');

const trailId = positionalArgs[0];
const inputPath = positionalArgs[1];
const outputPath = positionalArgs[2] ?? path.resolve(process.cwd(), 'supabase', 'quiz-questions.upsert.sql');

const GRADE_BANDS = ['elementary', 'middle', 'high'];

if (!trailId || !inputPath) {
    console.error('Usage: node scripts/import-quiz-geojson.mjs <trailId> <path-to-geojson> [outputPath] [--questions-only]');
    process.exit(1);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sqlString(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJsonb(value) {
    return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function sqlTextArray(values) {
    if (!Array.isArray(values) || values.length === 0) return 'ARRAY[]::text[]';
    return `ARRAY[${values.map(sqlString).join(', ')}]::text[]`;
}

function sqlNullable(value) {
    return value === null || value === undefined || value === '' ? 'null' : sqlString(value);
}

// Strip quiz content out of a feature, keeping the informational fields the
// student-facing map/landmark popups already know how to render.
function toInformationalFeature(feature) {
    const properties = {
        title: feature.properties?.title ?? 'Landmark',
        description: feature.properties?.description ?? null,
        funFact: feature.properties?.funFact ?? null,
        NearestMile: feature.properties?.NearestMile ?? 0,
        category: feature.properties?.category ?? null,
    };
    // A few newer exports (e.g. the OKC Jaunt trail) attach a hero image to
    // the welcome/intro landmark; lib/landmarks.ts reads properties.image,
    // so carry it through when present instead of silently dropping it.
    if (feature.properties?.image) {
        properties.image = feature.properties.image;
    }
    return {
        type: 'Feature',
        id: feature.id,
        geometry: feature.geometry,
        properties,
    };
}

// Original format: properties.quizzes.{elementary,middle,high}, each a
// single { type, question, answer, wrongAnswers, standard } object.
function buildQuizRowsFromQuizzesBlock(trailId, feature) {
    const rows = [];
    const landmarkId = String(feature.id);
    const landmarkTitle = feature.properties?.title ?? 'Landmark';
    const quizzes = feature.properties?.quizzes ?? {};

    for (const band of GRADE_BANDS) {
        const quiz = quizzes[band];
        if (!quiz) continue;

        const wrongAnswers = Array.isArray(quiz.wrongAnswers) ? quiz.wrongAnswers.filter(Boolean) : [];
        if (!quiz.question || !quiz.answer || wrongAnswers.length === 0) {
            console.warn(
                `Skipping ${landmarkTitle} (feature ${landmarkId}, ${band}): missing question/answer/wrongAnswers. ` +
                'Add a "wrongAnswers" array to this band before re-running the import.'
            );
            continue;
        }

        rows.push({
            trail_id: trailId,
            landmark_id: landmarkId,
            landmark_title: landmarkTitle,
            grade_band: band,
            subject: quiz.type ?? 'general',
            standard_code: quiz.standard ?? null,
            question: quiz.question,
            correct_answer: quiz.answer,
            wrong_answers: wrongAnswers,
        });
    }

    return rows;
}

// Newer format: properties.quizBank, an array of
// { subject, gradeBand, standardCode, standardLabel, question, correctAnswer,
//   distractors }. gradeBand is a display string like "Elementary (3-5)"
// rather than the bare 'elementary' | 'middle' | 'high' key the DB expects,
// and a single landmark can carry more than one question per grade band.
function mapQuizBankGradeBand(rawGradeBand) {
    if (typeof rawGradeBand !== 'string') return null;
    if (rawGradeBand.includes('Elementary')) return 'elementary';
    if (rawGradeBand.includes('Middle')) return 'middle';
    if (rawGradeBand.includes('High')) return 'high';
    return null;
}

function buildQuizRowsFromQuizBank(trailId, feature) {
    const rows = [];
    const landmarkIdBase = String(feature.id);
    const landmarkTitle = feature.properties?.title ?? 'Landmark';
    const quizBank = Array.isArray(feature.properties?.quizBank) ? feature.properties.quizBank : [];

    // Tracks how many questions have been emitted so far for each grade
    // band on this landmark, so the 2nd/3rd/... question at the same band
    // gets a distinguishing landmark_id suffix instead of colliding on the
    // (trail_id, landmark_id, grade_band) unique constraint.
    const seenPerBand = {};

    for (const quiz of quizBank) {
        const band = mapQuizBankGradeBand(quiz.gradeBand);
        if (!band) {
            console.warn(`Skipping ${landmarkTitle} (feature ${landmarkIdBase}): unrecognized gradeBand "${quiz.gradeBand}".`);
            continue;
        }

        const wrongAnswers = Array.isArray(quiz.distractors) ? quiz.distractors.filter(Boolean) : [];
        if (!quiz.question || !quiz.correctAnswer || wrongAnswers.length === 0) {
            console.warn(
                `Skipping ${landmarkTitle} (feature ${landmarkIdBase}, ${band}): missing question/correctAnswer/distractors.`
            );
            continue;
        }

        seenPerBand[band] = (seenPerBand[band] ?? 0) + 1;
        const landmarkId = seenPerBand[band] > 1 ? `${landmarkIdBase}-${seenPerBand[band]}` : landmarkIdBase;

        rows.push({
            trail_id: trailId,
            landmark_id: landmarkId,
            landmark_title: landmarkTitle,
            grade_band: band,
            subject: (quiz.subject ?? 'general').trim().toLowerCase(),
            standard_code: quiz.standardCode ?? null,
            question: quiz.question,
            correct_answer: quiz.correctAnswer,
            wrong_answers: wrongAnswers,
        });
    }

    return rows;
}

function buildQuizRows(trailId, feature) {
    return Array.isArray(feature.properties?.quizBank)
        ? buildQuizRowsFromQuizBank(trailId, feature)
        : buildQuizRowsFromQuizzesBlock(trailId, feature);
}

function writeSql(filePath, { trailId, landmarksGeojson, quizRows, questionsOnly }) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const lines = [];

    lines.push('-- Generated by scripts/import-quiz-geojson.mjs. Paste into the Supabase SQL editor.');
    lines.push('begin;');
    lines.push('');

    if (questionsOnly) {
        lines.push('-- --questions-only was passed: landmarks_geojson was left untouched.');
        lines.push('');
    } else {
        lines.push(
            `update public.trails set landmarks_geojson = ${sqlJsonb(landmarksGeojson)} where id = ${sqlString(trailId)};`
        );
        lines.push('');
    }

    if (quizRows.length > 0) {
        const columns = [
            'trail_id',
            'landmark_id',
            'landmark_title',
            'grade_band',
            'subject',
            'standard_code',
            'question',
            'correct_answer',
            'wrong_answers',
        ];

        const valueLines = quizRows.map((row) => {
            const values = [
                sqlString(row.trail_id),
                sqlString(row.landmark_id),
                sqlString(row.landmark_title),
                sqlString(row.grade_band),
                sqlString(row.subject),
                sqlNullable(row.standard_code),
                sqlString(row.question),
                sqlString(row.correct_answer),
                sqlTextArray(row.wrong_answers),
            ].join(', ');
            return `(${values})`;
        });

        const updateColumns = columns
            .filter((c) => !['trail_id', 'landmark_id', 'grade_band'].includes(c))
            .map((c) => `${c} = excluded.${c}`)
            .join(', ');

        lines.push(
            `insert into public.quiz_questions (${columns.join(', ')}) values\n${valueLines.join(',\n')}\n` +
            `on conflict (trail_id, landmark_id, grade_band) do update set ${updateColumns};`
        );
        lines.push('');
    } else {
        lines.push('-- No quiz_questions rows generated: no feature had a "wrongAnswers" array yet.');
        lines.push('');
    }

    lines.push('commit;');

    fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

const source = readJson(inputPath);
if (!source || source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection with a features array.');
}

const landmarksGeojson = questionsOnly
    ? null
    : {
          type: 'FeatureCollection',
          features: source.features.map(toInformationalFeature),
      };

const quizRows = source.features.flatMap((feature) => buildQuizRows(trailId, feature));

writeSql(outputPath, { trailId, landmarksGeojson, quizRows, questionsOnly });

console.log(
    questionsOnly
        ? `Wrote ${quizRows.length} quiz question row(s) for trail "${trailId}" to ${outputPath} (landmarks_geojson untouched)`
        : `Wrote ${source.features.length} landmark(s) and ${quizRows.length} quiz question row(s) for trail "${trailId}" to ${outputPath}`
);
