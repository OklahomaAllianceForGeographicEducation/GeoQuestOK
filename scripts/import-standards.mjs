// scripts/import-standards.mjs
// Merge one or more standards JSON files (each an array of
// { code, subject, grade_level, strand, description }, as produced by the
// PDF extraction pass) into a set of small, self-contained SQL upsert files
// for standards_library -- small enough to paste into the Supabase SQL
// editor one at a time. Each output file is its own begin/commit transaction
// with a uniquely numbered filename, so running them (in any order, even
// re-running one) never overwrites data from another file -- every insert
// uses ON CONFLICT (code, subject, grade_level) DO UPDATE.
//
// Usage: node scripts/import-standards.mjs <inputDir-or-file...> [--out-dir <dir>] [--max-rows <n>] [--max-chars <n>]

import fs from 'fs';
import path from 'path';
import process from 'process';

const args = process.argv.slice(2);

function flagValue(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
}

const outDir = path.resolve(process.cwd(), flagValue('--out-dir', path.join('supabase', 'standards-library-upsert')));
const maxRowsPerFile = Number(flagValue('--max-rows', 200));
const maxCharsPerFile = Number(flagValue('--max-chars', 90000));

const flagArgs = new Set(['--out-dir', '--max-rows', '--max-chars']);
const inputs = args.filter((a, i) => {
    if (flagArgs.has(a)) return false;
    if (i > 0 && flagArgs.has(args[i - 1])) return false;
    return true;
});

if (inputs.length === 0) {
    console.error('Usage: node scripts/import-standards.mjs <inputDir-or-file...> [--out-dir <dir>] [--max-rows <n>] [--max-chars <n>]');
    process.exit(1);
}

function sqlString(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNullable(value) {
    return value === null || value === undefined || String(value).trim() === '' ? 'null' : sqlString(String(value).trim());
}

function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'subject';
}

function collectJsonFiles(inputPath) {
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
        return fs
            .readdirSync(inputPath)
            .filter((f) => f.endsWith('.json'))
            .map((f) => path.join(inputPath, f));
    }
    return [inputPath];
}

const files = inputs.flatMap(collectJsonFiles);

const rows = [];
const seen = new Set();
let skipped = 0;

for (const file of files) {
    const sourceDocument = path.basename(file, '.json');
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.error(`Skipping ${file}: invalid JSON (${err.message})`);
        continue;
    }
    if (!Array.isArray(parsed)) {
        console.error(`Skipping ${file}: expected a top-level JSON array.`);
        continue;
    }

    for (const item of parsed) {
        const code = item?.code?.toString().trim();
        const subject = item?.subject?.toString().trim();
        const gradeLevel = item?.grade_level?.toString().trim();
        const description = item?.description?.toString().trim();
        if (!code || !subject || !gradeLevel || !description) {
            skipped += 1;
            continue;
        }

        // Some subjects legitimately reuse the same code across different
        // grade bands (e.g. PE's "PLE.6-12.1" for both "6th-8th Grade" and
        // "9th-12th Grade") -- those are distinct standards, not duplicates,
        // so grade_level is part of the identity key, matching the table's
        // (code, subject, grade_level) unique constraint.
        const key = `${subject}::${code}::${gradeLevel}`;
        if (seen.has(key)) {
            skipped += 1;
            continue;
        }
        seen.add(key);

        rows.push({
            code,
            subject,
            grade_level: gradeLevel,
            strand: item?.strand ?? null,
            description,
            source_document: sourceDocument,
        });
    }
}

if (rows.length === 0) {
    console.error('No valid standard rows found across the given input(s).');
    process.exit(1);
}

const columns = ['code', 'subject', 'grade_level', 'strand', 'description', 'source_document'];

function rowValueLine(row) {
    const values = [
        sqlString(row.code),
        sqlString(row.subject),
        sqlString(row.grade_level),
        sqlNullable(row.strand),
        sqlString(row.description),
        sqlNullable(row.source_document),
    ].join(', ');
    return `(${values})`;
}

const updateColumns = columns
    .filter((c) => !['code', 'subject', 'grade_level'].includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

// Group rows by subject (alphabetical, stable) so each file only ever holds
// one subject's worth of standards, then split any subject that's still too
// big for one file into numbered parts.
const bySubject = new Map();
for (const row of rows) {
    if (!bySubject.has(row.subject)) bySubject.set(row.subject, []);
    bySubject.get(row.subject).push(row);
}
const subjects = [...bySubject.keys()].sort();

const chunks = []; // { subject, partIndex, partCount, rows }
for (const subject of subjects) {
    const subjectRows = bySubject.get(subject);
    const groups = [[]];
    let currentChars = 0;

    for (const row of subjectRows) {
        const line = rowValueLine(row);
        const currentGroup = groups[groups.length - 1];
        const wouldOverflow = currentGroup.length >= maxRowsPerFile || (currentChars + line.length > maxCharsPerFile && currentGroup.length > 0);
        if (wouldOverflow) {
            groups.push([]);
            currentChars = 0;
        }
        groups[groups.length - 1].push(line);
        currentChars += line.length;
    }

    groups.forEach((groupLines, idx) => {
        chunks.push({ subject, partIndex: idx + 1, partCount: groups.length, lines: groupLines });
    });
}

// Fully regenerate the output directory so a re-run never leaves stale part
// files behind from a previous chunking pass.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const pad = String(chunks.length).length;
const manifestLines = [
    `Standards Library upsert -- ${chunks.length} file(s), ${rows.length} total row(s) (${skipped} skipped as invalid/duplicate).`,
    'Run supabase/standards-library-schema.sql first if you have not already.',
    'Paste and run each file below into the Supabase SQL editor, in any order -- every insert uses',
    'ON CONFLICT (code, subject, grade_level) DO UPDATE, so re-running any file (or all of them again later) is safe.',
    '',
];

chunks.forEach((chunk, i) => {
    const seq = String(i + 1).padStart(pad, '0');
    const slug = slugify(chunk.subject);
    const partSuffix = chunk.partCount > 1 ? `-part${chunk.partIndex}of${chunk.partCount}` : '';
    const fileName = `${seq}-${slug}${partSuffix}.sql`;

    const body = [
        `-- Generated by scripts/import-standards.mjs. Paste into the Supabase SQL editor.`,
        `-- ${chunk.subject}${chunk.partCount > 1 ? ` (part ${chunk.partIndex} of ${chunk.partCount})` : ''} -- ${chunk.lines.length} row(s). File ${i + 1} of ${chunks.length}.`,
        `-- Safe to re-run: uses ON CONFLICT (code, subject, grade_level) DO UPDATE.`,
        `begin;`,
        ``,
        `insert into public.standards_library (${columns.join(', ')}) values`,
        `${chunk.lines.join(',\n')}`,
        `on conflict (code, subject, grade_level) do update set ${updateColumns};`,
        ``,
        `commit;`,
        ``,
    ].join('\n');

    fs.writeFileSync(path.join(outDir, fileName), body);
    manifestLines.push(`  ${fileName}  (${chunk.lines.length} rows)`);
});

fs.writeFileSync(path.join(outDir, '00-README.txt'), manifestLines.join('\n') + '\n');

console.log(
    `Wrote ${rows.length} standard row(s) from ${files.length} input file(s) into ${chunks.length} SQL file(s) in ${outDir} ` +
    `(${skipped} skipped as invalid/duplicate). See 00-README.txt for the full list.`
);
