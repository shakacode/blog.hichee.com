#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const reportPath = path.resolve(args.report ?? 'data/migration-report.json');
const outPath = path.resolve(args.out ?? 'data/media-manifest.json');
const withHead = Boolean(args['with-head']);
const limit = args.limit ? Number.parseInt(args.limit, 10) : 0;
const concurrency = args.concurrency ? Number.parseInt(args.concurrency, 10) : 12;

const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));

const urlSet = new Set();
for (const attachment of report.attachments ?? []) {
  if (attachment.url) urlSet.add(attachment.url);
}

const contentDirs = ['src/content/posts', 'src/content/pages', 'src/content/drafts'];
for (const dir of contentDirs) {
  const files = await listMarkdownFiles(path.resolve(dir));
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const matches = text.match(/https?:\/\/blog\.hichee\.com\/wp-content\/uploads\/[^\s)"']+/g) ?? [];
    for (const match of matches) {
      urlSet.add(match);
    }
  }
}

let urls = [...urlSet].sort();
if (limit > 0) {
  urls = urls.slice(0, limit);
}

const media = urls.map((url) => ({ url }));

if (withHead) {
  await mapWithConcurrency(media, concurrency, async (entry) => {
    try {
      const response = await fetch(entry.url, { method: 'HEAD' });
      entry.status = response.status;
      entry.contentType = response.headers.get('content-type') ?? undefined;
      const len = response.headers.get('content-length');
      entry.contentLength = len ? Number.parseInt(len, 10) : undefined;
    } catch (error) {
      entry.error = String(error);
    }
    return entry;
  });
}

const totalBytes = media.reduce((sum, item) => sum + (item.contentLength || 0), 0);

const output = {
  generatedAt: new Date().toISOString(),
  sourceReport: reportPath,
  totalUrls: media.length,
  totalBytes,
  totalGigabytes: Number((totalBytes / (1024 ** 3)).toFixed(3)),
  media
};

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

console.log(`Media manifest written: ${outPath}`);
console.log(`Total URLs: ${media.length}`);
if (withHead) {
  console.log(`Estimated total bytes: ${totalBytes}`);
  console.log(`Estimated total GB: ${output.totalGigabytes}`);
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

async function listMarkdownFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listMarkdownFiles(abs)));
      continue;
    }
    if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      out.push(abs);
    }
  }
  return out;
}

async function mapWithConcurrency(list, workerCount, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, workerCount) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= list.length) return;
      // eslint-disable-next-line no-await-in-loop
      await worker(list[current]);
    }
  });
  await Promise.all(workers);
}
