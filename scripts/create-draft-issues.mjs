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

const { owner, name } = await repoOwnerAndName();
const existing = await fetchAllDraftReviewIssues(owner, name);
const existingIds = new Set();
for (const issue of existing) {
  const match = String(issue.body || '').match(/WP Draft ID:\s*(\d+)/i);
  if (match) existingIds.add(Number.parseInt(match[1], 10));
}

let created = 0;
let skipped = 0;
let failed = 0;
let processed = 0;

for (const draft of drafts) {
  if (existingIds.has(draft.id)) {
    skipped += 1;
    processed += 1;
    if (processed % 50 === 0 || processed === drafts.length) {
      console.log(`Progress: ${processed}/${drafts.length} (created=${created}, skipped=${skipped}, failed=${failed})`);
    }
    continue;
  }

  const title = normalizeTitle(`[Draft] ${draft.title} (WP #${draft.id})`);
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
    processed += 1;
    continue;
  }

  const ok = await ghWithRetry([
    'issue',
    'create',
    '--title',
    title,
    '--body',
    body,
    '--label',
    'draft-review'
  ], 3);

  if (ok) {
    created += 1;
  } else {
    failed += 1;
    console.error(`FAILED issue create for WP Draft ID ${draft.id}: ${title}`);
  }

  processed += 1;
  if (processed % 50 === 0 || processed === drafts.length) {
    console.log(`Progress: ${processed}/${drafts.length} (created=${created}, skipped=${skipped}, failed=${failed})`);
  }
}

console.log(`Drafts evaluated: ${drafts.length}`);
console.log(`Existing skipped: ${skipped}`);
console.log(apply ? `Issues created: ${created}` : 'Dry run only. Use --apply to create issues.');
if (apply) {
  console.log(`Issue create failures: ${failed}`);
}

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
  await execFileAsync('gh', args, { cwd: process.cwd(), timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
}

async function ghJson(args) {
  const { stdout } = await execFileAsync('gh', args, { cwd: process.cwd(), timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout || '[]');
}

async function ghWithRetry(args, attempts) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await gh(args);
      return true;
    } catch (error) {
      const message = String(error?.stderr || error?.message || error);
      if (i >= attempts) {
        console.error(`gh command failed after ${attempts} attempts: ${message.slice(0, 300)}`);
        return false;
      }
      await sleep(1500 * i);
    }
  }
  return false;
}

function normalizeTitle(title) {
  const clean = String(title || '').replace(/\s+/g, ' ').trim();
  return clean.length <= 240 ? clean : `${clean.slice(0, 236)}...`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function repoOwnerAndName() {
  const { stdout } = await execFileAsync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    { cwd: process.cwd(), timeout: 30000 }
  );
  const [owner, name] = String(stdout || '').trim().split('/');
  if (!owner || !name) {
    throw new Error(`Unable to resolve repository owner/name from output: ${stdout}`);
  }
  return { owner, name };
}

async function fetchAllDraftReviewIssues(owner, name) {
  const issues = [];
  let cursor = null;

  while (true) {
    const query = `
      query($owner: String!, $name: String!, $after: String) {
        repository(owner: $owner, name: $name) {
          issues(
            first: 100,
            after: $after,
            labels: ["draft-review"],
            orderBy: { field: CREATED_AT, direction: ASC }
          ) {
            nodes {
              number
              title
              body
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`];
    if (cursor) {
      args.push('-f', `after=${cursor}`);
    }

    const { stdout } = await execFileAsync('gh', args, {
      cwd: process.cwd(),
      timeout: 30000,
      maxBuffer: 50 * 1024 * 1024
    });

    const payload = JSON.parse(stdout || '{}');
    const conn = payload?.data?.repository?.issues;
    if (!conn) break;
    issues.push(...(conn.nodes || []));

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return issues;
}
