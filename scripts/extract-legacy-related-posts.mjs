#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = parseArgs(process.argv.slice(2));
const reportPath = path.resolve(args.report ?? 'data/migration-report.json');
const outputPath = path.resolve(args.output ?? 'src/data/legacy-related-posts.json');
const base = (args.base ?? 'https://blog.hichee.com').replace(/\/+$/, '');
const baseUrl = new URL(base);
const concurrency = Math.max(1, Number.parseInt(args.concurrency ?? '8', 10) || 8);
const maxRoutes = Math.max(0, Number.parseInt(args.maxRoutes ?? '0', 10) || 0);

const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
let routes = [...new Set((report.publishedPosts ?? []).map((post) => normalizeRoutePath(post.path)).filter(Boolean))].sort();

if (maxRoutes > 0) {
  routes = routes.slice(0, maxRoutes);
}

if (!routes.length) {
  console.error(`No published post routes found in ${reportPath}`);
  process.exit(1);
}

console.log(`Fetching legacy related posts from ${base}`);
console.log(`Routes: ${routes.length}, concurrency: ${concurrency}`);

const relatedByRoute = {};
const failures = [];
let nextIndex = 0;
let completed = 0;

const workers = Array.from({ length: Math.min(concurrency, routes.length) }, () => runWorker());
await Promise.all(workers);

const sortedOutput = Object.fromEntries(
  Object.keys(relatedByRoute)
    .sort()
    .map((route) => [route, relatedByRoute[route]])
);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(sortedOutput, null, 2)}\n`, 'utf8');

const coveredRoutes = Object.keys(sortedOutput).length;
const routesWithAny = routes.filter((route) => Array.isArray(relatedByRoute[route]) && relatedByRoute[route].length > 0).length;
const sixPlusRoutes = Object.values(sortedOutput).filter((items) => Array.isArray(items) && items.length >= 6).length;

console.log(`Wrote: ${outputPath}`);
console.log(`Covered routes: ${coveredRoutes}/${routes.length}`);
console.log(`Routes with related posts: ${routesWithAny}/${routes.length}`);
console.log(`Routes with >= 6 related posts: ${sixPlusRoutes}`);

if (failures.length) {
  console.warn(`Failures: ${failures.length}`);
  for (const failure of failures.slice(0, 20)) {
    console.warn(`- ${failure.route}: ${failure.error}`);
  }
}

async function runWorker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= routes.length) return;

    const route = routes[index];
    const url = `${base}${route}`;

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; legacy-related-extractor/1.0)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const relatedPaths = extractRelatedPaths(html, route);
      if (relatedPaths.length > 0) {
        relatedByRoute[route] = relatedPaths;
      }
    } catch (error) {
      failures.push({
        route,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    completed += 1;
    if (completed % 25 === 0 || completed === routes.length) {
      console.log(`Progress ${completed}/${routes.length}`);
    }
  }
}

function extractRelatedPaths(html, currentRoute) {
  const relatedStart = html.search(/class=(["'])[^"']*\bentry-related\b[^"']*\1/i);
  if (relatedStart === -1) return [];

  const tail = html.slice(relatedStart);
  const endIndex = findRelatedSectionEnd(tail);
  const section = endIndex === -1 ? tail : tail.slice(0, endIndex);

  const matches = section.matchAll(
    /<h[23][^>]*class=(["'])[^"']*\bentry-title\b[^"']*\1[^>]*>\s*<a[^>]*href=(["'])([^"']+)\2/gi
  );

  const out = [];
  const seen = new Set();

  for (const [, , , hrefRaw] of matches) {
    const normalizedPath = normalizeRelatedHref(hrefRaw);
    if (!normalizedPath) continue;
    if (normalizedPath === currentRoute) continue;
    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);
    out.push(normalizedPath);
    if (out.length >= 6) break;
  }

  return out;
}

function findRelatedSectionEnd(sectionHtml) {
  const endMarkers = ['<!-- #comments -->', '<section id="comments"', '<div id="comments"'];
  let endIndex = -1;
  for (const marker of endMarkers) {
    const markerIndex = sectionHtml.indexOf(marker);
    if (markerIndex === -1) continue;
    if (endIndex === -1 || markerIndex < endIndex) {
      endIndex = markerIndex;
    }
  }
  return endIndex;
}

function normalizeRelatedHref(rawHref) {
  const cleaned = decodeHtmlAttribute(String(rawHref || ''))
    .replace(/%ef%bf%bc/gi, '')
    .replace(/\uFFFC/g, '')
    .trim();

  if (!cleaned) return '';
  if (cleaned.startsWith('#')) return '';
  if (cleaned.startsWith('mailto:') || cleaned.startsWith('tel:') || cleaned.startsWith('javascript:')) return '';

  let parsed;
  try {
    parsed = new URL(cleaned, baseUrl);
  } catch {
    return '';
  }

  if (parsed.hostname !== baseUrl.hostname) return '';
  const route = normalizeRoutePath(parsed.pathname);
  if (!route || route === '/') return '';

  if (
    route.startsWith('/author/') ||
    route.startsWith('/category/') ||
    route.startsWith('/tag/') ||
    route.startsWith('/wp-admin/') ||
    route.startsWith('/wp-content/') ||
    route.startsWith('/wp-json/')
  ) {
    return '';
  }

  return route;
}

function normalizeRoutePath(inputPath) {
  const raw = String(inputPath || '')
    .replace(/%ef%bf%bc/gi, '')
    .replace(/\uFFFC/g, '')
    .split('#')[0]
    .split('?')[0]
    .trim();

  if (!raw) return '';
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&#038;|&#38;/gi, '&')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.split('=');
    const name = key.slice(2);
    if (inlineValue !== undefined) {
      out[name] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[name] = true;
    } else {
      out[name] = next;
      i += 1;
    }
  }
  return out;
}
