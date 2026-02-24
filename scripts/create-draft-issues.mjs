#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const reportPath = path.resolve(args.report ?? 'data/migration-report.json');
const limit = args.limit ? Number.parseInt(args.limit, 10) : 0;

const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const drafts = [...(report.drafts ?? [])];

if (!drafts.length) {
  console.log('No draft entries found in report.');
  process.exit(0);
}

if (limit > 0) {
  drafts.splice(limit);
}

await ensureLabel('draft-review', 'E99695', 'WordPress draft requiring editorial decision');

const existing = await ghJson([
  'issue',
  'list',
  '--state',
  'all',
  '--label',
  'draft-review',
  '--limit',
  '1000',
  '--json',
  'number,title,body'
]);

const existingIds = new Set();
for (const issue of existing) {
  const match = String(issue.body || '').match(/WP Draft ID:\s*(\d+)/i);
  if (match) existingIds.add(Number.parseInt(match[1], 10));
}

let created = 0;
let skipped = 0;

for (const draft of drafts) {
  if (existingIds.has(draft.id)) {
    skipped += 1;
    continue;
  }

  const title = `[Draft] ${draft.title} (WP #${draft.id})`;
  const body = [
    `WP Draft ID: ${draft.id}`,
    `Type: ${draft.type}`,
    `Status: ${draft.status}`,
    `Path (planned): ${draft.path}`,
    `Legacy URL: ${draft.legacyUrl || 'N/A'}`,
    `Generated File: ${draft.outputFile}`,
    '',
    'Editorial decision checklist:',
    '- [ ] Keep and publish',
    '- [ ] Rewrite then publish',
    '- [ ] Archive/remove'
  ].join('\n');

  if (!apply) {
    console.log(`DRY RUN: would create issue: ${title}`);
    continue;
  }

  await gh([
    'issue',
    'create',
    '--title',
    title,
    '--body',
    body,
    '--label',
    'draft-review'
  ]);

  created += 1;
}

console.log(`Drafts evaluated: ${drafts.length}`);
console.log(`Existing skipped: ${skipped}`);
console.log(apply ? `Issues created: ${created}` : 'Dry run only. Use --apply to create issues.');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.split('=');
    if (inlineValue === undefined) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key.slice(2)] = true;
      } else {
        out[key.slice(2)] = next;
        i += 1;
      }
    } else {
      out[key.slice(2)] = inlineValue;
    }
  }
  return out;
}

async function ensureLabel(name, color, description) {
  try {
    await gh(['label', 'create', name, '--color', color, '--description', description]);
  } catch {
    // Label already exists.
  }
}

async function gh(args) {
  await execFileAsync('gh', args, { cwd: process.cwd() });
}

async function ghJson(args) {
  const { stdout } = await execFileAsync('gh', args, { cwd: process.cwd() });
  return JSON.parse(stdout || '[]');
}
