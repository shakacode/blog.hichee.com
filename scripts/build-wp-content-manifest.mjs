#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(args.root ?? 'dist');
const outPath = path.resolve(args.out ?? 'output/wp-content-manifest.json');
const localRoot = path.resolve(args.localRoot ?? 'public');

const keys = new Set();
const filesScanned = { count: 0 };

walk(rootDir, (file) => {
  filesScanned.count += 1;

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }

  const matches = text.match(/(?:https?:\/\/(?:blog|newblog)\.hichee\.com)?\/wp-content\/[^\s"'<>),?#]+/gi) ?? [];
  for (const match of matches) {
    keys.add(normalizeKey(match));
  }
});

const keyList = [...keys].sort();
const localKeys = new Set(listLocalKeys(localRoot));
const missingLocalKeys = keyList.filter((key) => !localKeys.has(key));

const output = {
  generatedAt: new Date().toISOString(),
  rootDir,
  localRoot,
  filesScanned: filesScanned.count,
  totalKeys: keyList.length,
  localKeyCount: localKeys.size,
  missingLocalCount: missingLocalKeys.length,
  keys: keyList,
  missingLocalKeys
};

await fsp.mkdir(path.dirname(outPath), { recursive: true });
await fsp.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

console.log(`Manifest written: ${outPath}`);
console.log(`Files scanned: ${filesScanned.count}`);
console.log(`Total wp-content keys: ${keyList.length}`);
console.log(`Missing local keys: ${missingLocalKeys.length}`);

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

function normalizeKey(value) {
  return value.replace(/^https?:\/\/(?:blog|newblog)\.hichee\.com/i, '');
}

function walk(dir, visitor) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visitor);
      continue;
    }
    if (entry.isFile()) {
      visitor(fullPath);
    }
  }
}

function listLocalKeys(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const discovered = [];

  walk(root, (file) => {
    const rel = `/${path.relative(root, file).split(path.sep).join('/')}`;
    if (rel.startsWith('/wp-content/')) {
      discovered.push(rel);
    }
  });

  return discovered.sort();
}
