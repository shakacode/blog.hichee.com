#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';

const args = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(args.manifest ?? 'output/wp-content-manifest.json');
const localRoot = path.resolve(args.localRoot ?? 'public');
const origin = args.origin ?? 'https://blog.hichee.com';
const bucket = args.bucket ?? 'blog-hichee-com-media';
const reportPath = path.resolve(args.report ?? 'output/r2-sync-report.json');
const concurrency = toPositiveInt(args.concurrency, 6);
const limit = toPositiveInt(args.limit, 0);
const retries = toNonNegativeInt(args.retries, 5);
const retryDelayMs = toPositiveInt(args['retry-delay'], 1_500);
const missingLocalOnly = Boolean(args['missing-local-only']);
const accountId = args['account-id'] ?? process.env.CLOUDFLARE_ACCOUNT_ID;

const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
let keys = Array.isArray(manifest.keys) ? [...manifest.keys] : [];

if (missingLocalOnly && Array.isArray(manifest.missingLocalKeys)) {
  keys = [...manifest.missingLocalKeys];
}

if (limit > 0) {
  keys = keys.slice(0, limit);
}

console.log(`Sync source manifest: ${manifestPath}`);
console.log(`Bucket: ${bucket}`);
console.log(`Origin fallback: ${origin}`);
console.log(`Keys selected: ${keys.length}`);
console.log(`Concurrency: ${concurrency}`);
console.log(`Retries: ${retries}`);

const report = {
  startedAt: new Date().toISOString(),
  manifestPath,
  bucket,
  origin,
  localRoot,
  concurrency,
  retries,
  retryDelayMs,
  selectedKeys: keys.length,
  completed: 0,
  uploadedFromLocal: 0,
  uploadedFromOrigin: 0,
  failed: 0,
  failures: []
};

let completed = 0;
await mapWithConcurrency(keys, concurrency, async (key) => {
  try {
    const source = await uploadKeyWithRetry(key);
    if (source === 'local') report.uploadedFromLocal += 1;
    if (source === 'origin') report.uploadedFromOrigin += 1;
  } catch (error) {
    report.failed += 1;
    report.failures.push({
      key,
      error: String(error)
    });
  }

  completed += 1;
  report.completed = completed;
  if (completed % 100 === 0 || completed === keys.length) {
    console.log(`Sync progress: ${completed}/${keys.length}`);
  }
});

report.finishedAt = new Date().toISOString();

await fsp.mkdir(path.dirname(reportPath), { recursive: true });
await fsp.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`Sync report written: ${reportPath}`);
console.log(`Uploaded from local: ${report.uploadedFromLocal}`);
console.log(`Uploaded from origin: ${report.uploadedFromOrigin}`);
console.log(`Failed: ${report.failed}`);

if (report.failed > 0) {
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

function toNonNegativeInt(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

async function uploadLocalFile({ key, localPath, bucket, accountId }) {
  await runWranglerCommand([
    'r2',
    'object',
    'put',
    `${bucket}/${key.replace(/^\//, '')}`,
    '--remote',
    '--file',
    localPath,
    '--content-type',
    guessContentType(key),
    '--cache-control',
    CACHE_CONTROL
  ], accountId);
}

async function uploadStream({ key, stream, bucket, accountId, contentType }) {
  await runWranglerCommand([
    'r2',
    'object',
    'put',
    `${bucket}/${key.replace(/^\//, '')}`,
    '--remote',
    '--pipe',
    '--content-type',
    contentType,
    '--cache-control',
    CACHE_CONTROL
  ], accountId, stream);
}

async function runWranglerCommand(args, accountId, stdinStream) {
  await new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', ...args], {
      env: {
        ...process.env,
        ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {})
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';

    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `wrangler exited with code ${code}`));
    });

    if (!stdinStream) {
      child.stdin.end();
      return;
    }

    stdinStream.on('error', reject);
    stdinStream.pipe(child.stdin);
  });
}

async function uploadKeyWithRetry(key) {
  let attempt = 0;

  while (true) {
    try {
      return await uploadKeyOnce(key);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      attempt += 1;
      const delay = retryDelayMs * (2 ** (attempt - 1));
      console.log(`Retrying ${key} after attempt ${attempt} (${delay}ms)`);
      await sleep(delay);
    }
  }
}

async function uploadKeyOnce(key) {
  const localPath = path.join(localRoot, key.replace(/^\//, ''));
  if (fs.existsSync(localPath)) {
    await uploadLocalFile({
      key,
      localPath,
      bucket,
      accountId
    });
    return 'local';
  }

  const response = await fetch(`${origin}${key}`);
  if (!response.ok || !response.body) {
    throw new Error(`Origin fetch failed with ${response.status} ${response.statusText}`);
  }

  await uploadStream({
    key,
    stream: Readable.fromWeb(response.body),
    bucket,
    accountId,
    contentType: response.headers.get('content-type') ?? guessContentType(key)
  });

  return 'origin';
}

function shouldRetry(error) {
  const text = String(error);
  return text.includes('429') || text.includes('code":971') || text.includes('code 971');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guessContentType(key) {
  const lower = key.toLowerCase();

  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.jpeg') || lower.endsWith('.jpg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.eot')) return 'application/vnd.ms-fontobject';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';

  return 'application/octet-stream';
}
