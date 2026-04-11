#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(args.manifest ?? 'output/wp-content-manifest.json');
const baselineOrigin = args.baseline ?? 'https://blog.hichee.com';
const candidateOrigin = args.candidate ?? 'https://newblog.hichee.com';
const reportPath = path.resolve(args.report ?? 'output/wp-content-parity-report.json');
const concurrency = toPositiveInt(args.concurrency, 16);
const limit = toPositiveInt(args.limit, 0);
const timeoutMs = toPositiveInt(args.timeout, 10_000);

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
let keys = Array.isArray(manifest.keys) ? [...manifest.keys] : [];

if (limit > 0) {
  keys = keys.slice(0, limit);
}

const report = {
  generatedAt: new Date().toISOString(),
  manifestPath,
  baselineOrigin,
  candidateOrigin,
  totalKeys: keys.length,
  checked: 0,
  baseline200CandidateNon200: [],
  statusMismatches: [],
  contentTypeMismatches: [],
  errors: []
};

await mapWithConcurrency(keys, concurrency, async (key) => {
  try {
    const [baseline, candidate] = await Promise.all([
      fetchHead(`${baselineOrigin}${key}`, timeoutMs),
      fetchHead(`${candidateOrigin}${key}`, timeoutMs)
    ]);

    if (baseline.status !== candidate.status) {
      report.statusMismatches.push({
        key,
        baselineStatus: baseline.status,
        candidateStatus: candidate.status
      });
    }

    if (baseline.status === 200 && candidate.status !== 200) {
      report.baseline200CandidateNon200.push({
        key,
        baselineStatus: baseline.status,
        candidateStatus: candidate.status
      });
    }

    if (
      baseline.status === 200 &&
      candidate.status === 200 &&
      baseline.contentType &&
      candidate.contentType &&
      baseline.contentType !== candidate.contentType
    ) {
      report.contentTypeMismatches.push({
        key,
        baselineContentType: baseline.contentType,
        candidateContentType: candidate.contentType
      });
    }
  } catch (error) {
    report.errors.push({
      key,
      error: String(error)
    });
  }

  report.checked += 1;
  if (report.checked % 250 === 0 || report.checked === keys.length) {
    console.log(`Parity progress: ${report.checked}/${keys.length}`);
  }
});

report.summary = {
  statusMismatchCount: report.statusMismatches.length,
  regressionCount: report.baseline200CandidateNon200.length,
  contentTypeMismatchCount: report.contentTypeMismatches.length,
  errorCount: report.errors.length
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`Parity report written: ${reportPath}`);
console.log(`Baseline 200 / candidate non-200: ${report.summary.regressionCount}`);
console.log(`Status mismatches: ${report.summary.statusMismatchCount}`);
console.log(`Content-Type mismatches: ${report.summary.contentTypeMismatchCount}`);
console.log(`Errors: ${report.summary.errorCount}`);

if (report.summary.regressionCount > 0 || report.summary.errorCount > 0) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const [key, inlineValue] = arg.split('=');
    if (inlineValue !== undefined) {
      out[key.slice(2)] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key.slice(2)] = true;
      continue;
    }

    out[key.slice(2)] = next;
    i += 1;
  }
  return out;
}

function toPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchHead(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });

    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(list, workerCount, worker) {
  let index = 0;

  const workers = Array.from({ length: Math.max(1, workerCount) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= list.length) {
        return;
      }

      await worker(list[current]);
    }
  });

  await Promise.all(workers);
}
