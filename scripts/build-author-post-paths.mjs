#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import matter from 'gray-matter';

const args = parseArgs(process.argv.slice(2));
const outPath = path.resolve(args.out ?? 'src/data/author-post-paths.json');
const postsDir = path.resolve(args.postsDir ?? 'src/content/posts');
const wxrDir = path.resolve(args.wxrDir ?? 'data/raw');

const AUTHOR_ALIASES = {
  Tiffany: 'tiffany',
  'alan@rentmoreweeks.com': 'alan',
  'Our Discount Desk': 'our-discount-desk',
  'Our Travel Reporter': 'our-travel-reporter',
};

const ROUTE_ALIASES = new Map([
  ['/where-am-i-24-2/', '/where-am-i-24/'],
]);

const localPosts = await loadLocalPosts(postsDir);
const authorPathMap = await buildAuthorPathMap(wxrDir, localPosts);

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(authorPathMap, null, 2)}\n`);

console.log(`Author post paths written: ${outPath}`);
for (const [slug, routes] of Object.entries(authorPathMap)) {
  console.log(`- ${slug}: ${routes.length}`);
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

async function loadLocalPosts(rootDir) {
  const files = (await fs.readdir(rootDir))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => path.join(rootDir, entry));

  const byWordpressId = new Map();
  const byRoute = new Map();

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const { data } = matter(raw);
    if (data.status !== 'publish' || data.draft === true) continue;

    const wordpressId = String(data.wordpressId ?? '').trim();
    const route = normalizeRoutePath(data.path);
    const dateValue = toTimestamp(data.date);
    if (!route || !dateValue) continue;

    const record = {
      wordpressId,
      route,
      date: dateValue,
    };

    if (wordpressId) byWordpressId.set(wordpressId, record);
    byRoute.set(route, record);
  }

  return { byWordpressId, byRoute };
}

async function buildAuthorPathMap(wxrDir, localPosts) {
  const files = (await fs.readdir(wxrDir))
    .filter((entry) => /^wordpress-export-posts-\d{4}\.xml$/.test(entry))
    .map((entry) => path.join(wxrDir, entry))
    .sort();

  const pathsBySlug = new Map(Object.values(AUTHOR_ALIASES).map((slug) => [slug, new Map()]));

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    for (const item of iterateItems(raw)) {
      const slug = AUTHOR_ALIASES[item.creator];
      if (!slug) continue;
      if (item.postType !== 'post' || item.status !== 'publish') continue;

      const sourceRoute = normalizeRoutePath(item.link);
      const preferred = localPosts.byWordpressId.get(item.wordpressId);
      const fallback = localPosts.byRoute.get(sourceRoute);
      const aliasTarget = ROUTE_ALIASES.get(sourceRoute) ?? '';
      const aliasResolved = aliasTarget ? localPosts.byRoute.get(aliasTarget) : null;
      const resolved = preferred ?? fallback ?? aliasResolved;
      if (!resolved) continue;

      const recordedRoute =
        preferred || fallback || !aliasResolved ? resolved.route : sourceRoute;

      pathsBySlug.get(slug).set(recordedRoute, resolved.date);
    }
  }

  return Object.fromEntries(
    [...pathsBySlug.entries()].map(([slug, routes]) => {
      const orderedRoutes = [...routes.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([route]) => route);
      return [slug, orderedRoutes];
    })
  );
}

function *iterateItems(xml) {
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  for (const match of xml.matchAll(itemRegex)) {
    const item = match[1];
    yield {
      creator: decodeXml(extractCdata(item, 'dc:creator')),
      status: extractCdata(item, 'wp:status'),
      postType: extractCdata(item, 'wp:post_type'),
      wordpressId: extractTag(item, 'wp:post_id'),
      link: decodeXml(extractTag(item, 'link')),
    };
  }
}

function extractCdata(source, tagName) {
  const match = source.match(new RegExp(`<${escapeRegExp(tagName)}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escapeRegExp(tagName)}>`, 'i'));
  return match ? match[1].trim() : '';
}

function extractTag(source, tagName) {
  const match = source.match(new RegExp(`<${escapeRegExp(tagName)}>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, 'i'));
  return match ? match[1].trim() : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#038;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeRoutePath(value) {
  const raw = String(value || '')
    .replace(/https?:\/\/blog\.hichee\.com/i, '')
    .replace(/%ef%bf%bc/gi, '')
    .replace(/\uFFFC/g, '')
    .trim();

  if (!raw) return '';

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
