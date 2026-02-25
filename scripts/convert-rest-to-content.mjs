#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input ?? await latestRestExportPath());
const reportPath = path.resolve(args.report ?? 'data/migration-report.json');
const taxonomyPath = path.resolve(args.taxonomy ?? 'src/data/taxonomy.json');
const redirectsPath = path.resolve(args.redirects ?? 'data/redirects.csv');
const redirectsExtrasPath = path.resolve(args.redirectExtras ?? 'data/redirects.extra.csv');
const redirectsRulesPath = path.resolve(args.redirectRules ?? 'public/_redirects');

const outputDirs = {
  posts: path.resolve('src/content/posts'),
  pages: path.resolve('src/content/pages'),
  drafts: path.resolve('src/content/drafts')
};

await prepareOutputDirs(outputDirs);

const source = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const posts = source.posts ?? [];
const pages = source.pages ?? [];
const allEntries = [...posts, ...pages];

const categoriesById = new Map((source.categories ?? []).map((cat) => [Number(cat.id), normalizeSlug(cat.slug || cat.name)]));
const tagsById = new Map((source.tags ?? []).map((tag) => [Number(tag.id), normalizeSlug(tag.slug || tag.name)]));
const mediaById = new Map((source.media ?? []).map((item) => [Number(item.id), item]));

const pageById = new Map(pages.map((entry) => [Number(entry.id), entry]));

const usedFilenames = new Set();
const publishedPosts = [];
const publishedPages = [];
const drafts = [];
const redirects = [];

for (const entry of allEntries) {
  const postType = entry.type === 'page' ? 'page' : 'post';
  const status = String(entry.status || 'draft').toLowerCase();
  const title = cleanText(extractRendered(entry.title)) || `Untitled ${postType} ${entry.id}`;
  const slug = normalizeSlug(entry.slug) || `wp-${entry.id}`;

  const pathValue = postType === 'page'
    ? ensureSlashes(resolvePagePath(entry, pageById))
    : ensureSlashes(slug);

  const categories = (entry.categories || []).map((id) => categoriesById.get(Number(id))).filter(Boolean);
  const tags = (entry.tags || []).map((id) => tagsById.get(Number(id))).filter(Boolean);

  const featuredMedia = mediaById.get(Number(entry.featured_media || 0));
  const featuredImage = featuredMedia?.source_url;
  const featuredImageAlt = cleanText(featuredMedia?.alt_text || extractRendered(featuredMedia?.title)) || undefined;

  const frontmatter = compactObject({
    title,
    path: pathValue,
    date: toIso(entry.date_gmt || entry.date),
    updatedDate: toIso(entry.modified_gmt || entry.modified),
    description: excerptToDescription(extractRendered(entry.excerpt)),
    legacyUrl: entry.link || undefined,
    wordpressId: Number(entry.id),
    status,
    categories,
    tags,
    featuredImage,
    featuredImageAlt,
    draft: status !== 'publish',
    contentType: postType
  });

  const body = sanitizeBodyHtml(extractRendered(entry.content) || '', { postType });
  const fileText = matter.stringify(body, frontmatter);

  const collection = status === 'publish' ? (postType === 'post' ? 'posts' : 'pages') : 'drafts';
  const basename = collection === 'drafts'
    ? `${postType}-${slug}-${entry.id}`
    : `${slug}-${entry.id}`;
  const filename = uniqueFilename(`${safeFilename(basename)}.md`, usedFilenames);
  const outputPath = path.join(outputDirs[collection], filename);

  await fs.writeFile(outputPath, fileText, 'utf8');

  const summary = {
    id: Number(entry.id),
    title,
    status,
    rawStatus: String(entry.status || ''),
    type: postType,
    path: pathValue,
    legacyUrl: entry.link || '',
    date: frontmatter.date,
    outputFile: path.relative(process.cwd(), outputPath)
  };

  if (collection === 'drafts') {
    drafts.push(summary);
  } else if (collection === 'posts') {
    publishedPosts.push(summary);
  } else {
    publishedPages.push(summary);
  }

  const fromPath = toPathname(entry.link);
  const toPath = pathValue;
  if (status === 'publish' && fromPath && fromPath !== '/' && toPath && fromPath !== toPath) {
    redirects.push({ from: fromPath, to: toPath });
  }
}

const taxonomy = {
  categories: Object.fromEntries((source.categories ?? []).map((item) => [normalizeSlug(item.slug || item.name), item.name]).sort()),
  tags: Object.fromEntries((source.tags ?? []).map((item) => [normalizeSlug(item.slug || item.name), item.name]).sort())
};

const report = {
  generatedAt: new Date().toISOString(),
  source: inputPath,
  counts: {
    totalItems: allEntries.length,
    postsPublished: publishedPosts.length,
    pagesPublished: publishedPages.length,
    drafts: drafts.length,
    attachments: source.media?.length || 0
  },
  publishedPosts,
  publishedPages,
  drafts,
  attachments: (source.media ?? []).map((item) => ({
    id: Number(item.id),
    url: item.source_url,
    attachedFile: item.media_details?.file || '',
    title: extractRendered(item.title)
  }))
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.mkdir(path.dirname(taxonomyPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
await fs.writeFile(taxonomyPath, JSON.stringify(taxonomy, null, 2), 'utf8');

const extraRedirects = await loadRedirectCsv(redirectsExtrasPath);
const uniqueRedirects = dedupeRedirects([...redirects, ...extraRedirects]);
await fs.writeFile(
  redirectsPath,
  ['from,to', ...uniqueRedirects.map((r) => `${csvEscape(r.from)},${csvEscape(r.to)}`)].join('\n'),
  'utf8'
);
await fs.mkdir(path.dirname(redirectsRulesPath), { recursive: true });
await fs.writeFile(
  redirectsRulesPath,
  [
    '# Generated from data/redirects.csv by scripts/convert-rest-to-content.mjs',
    ...uniqueRedirects.map((r) => `${r.from} ${r.to} 301`)
  ].join('\n') + '\n',
  'utf8'
);

console.log(`Converted REST export: ${inputPath}`);
console.log(`Published posts: ${publishedPosts.length}`);
console.log(`Published pages: ${publishedPages.length}`);
console.log(`Draft entries: ${drafts.length}`);
console.log(`Featured media records: ${source.media?.length || 0}`);
console.log(`Report: ${reportPath}`);
console.log(`Taxonomy map: ${taxonomyPath}`);
console.log(`Redirects CSV: ${redirectsPath}`);
console.log(`Extra redirects loaded: ${extraRedirects.length} (${redirectsExtrasPath})`);
console.log(`Cloudflare redirects file: ${redirectsRulesPath}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.split('=');
    const value = inlineValue ?? argv[i + 1];
    if (!inlineValue) i += 1;
    out[key.slice(2)] = value;
  }
  return out;
}

async function latestRestExportPath() {
  const rawDir = path.resolve('data/raw');
  const entries = await fs.readdir(rawDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('wp-rest-export-') && entry.name.endsWith('.json'))
    .map((entry) => path.join(rawDir, entry.name))
    .sort();

  if (!candidates.length) {
    throw new Error('No REST export file found. Run `node scripts/export-wp-rest.mjs` first.');
  }

  return candidates[candidates.length - 1];
}

async function prepareOutputDirs(dirs) {
  for (const directory of Object.values(dirs)) {
    await fs.rm(directory, { recursive: true, force: true });
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, '.gitkeep'), '', 'utf8');
  }
}

function normalizeSlug(value) {
  const decoded = decodeURIComponentSafe(String(value || ''));
  return decoded
    .trim()
    .toLowerCase()
    .replace(/%ef%bf%bc/gi, '')
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/(?:-?ef-bf-bc)+$/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

function extractRendered(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return String(value.rendered || value.raw || '').trim();
  }
  return '';
}

function toIso(dateString) {
  const date = new Date(dateString || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function excerptToDescription(excerptHtml) {
  const plain = decodeHtmlEntities(String(excerptHtml || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return undefined;
  return plain.slice(0, 220);
}

function sanitizeBodyHtml(html, { postType } = {}) {
  let out = String(html || '');

  // Remove AddToAny share-widget markup that bloats imported post bodies.
  out = out.replace(/<center>\s*<div[^>]*class="[^"]*addtoany_shortcode[^"]*"[\s\S]*?<\/center>\s*<\/p>/gi, '');
  out = out.replace(/<div[^>]*class="[^"]*addtoany_shortcode[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi, '');
  out = out.replace(/<script[^>]*src="[^"]*addtoany[^"]*"[\s\S]*?<\/script>/gi, '');

  if (postType === 'post') {
    // Remove Ultimate Post Grid widget blocks injected into article bodies.
    out = out.replace(
      /<div[^>]*class="[^"]*ultp-post-grid-block[^"]*"[\s\S]*?<div[^>]*class="[^"]*pagination-block-html[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi,
      ''
    );
  }

  out = out
    .replace(/^\s*<\/p>\s*/i, '')
    .replace(/<\/p>\s*<\/p>/gi, '</p>')
    .trim();

  return out;
}

function cleanText(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };

  return String(value || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#([0-9]+);?/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function resolvePagePath(page, pageById, seen = new Set()) {
  const slug = normalizeSlug(page.slug) || `page-${page.id}`;
  const parentId = Number(page.parent || 0);

  if (!parentId || !pageById.has(parentId)) return slug;
  if (seen.has(Number(page.id))) return slug;

  seen.add(Number(page.id));
  const parent = pageById.get(parentId);
  const parentPath = resolvePagePath(parent, pageById, seen);
  return `${parentPath}/${slug}`.replace(/\/+/g, '/');
}

function ensureSlashes(pathValue) {
  const clean = String(pathValue || '').replace(/^\/|\/$/g, '');
  return clean ? `/${clean}/` : '/';
}

function safeFilename(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function uniqueFilename(filename, usedSet) {
  if (!usedSet.has(filename)) {
    usedSet.add(filename);
    return filename;
  }

  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  let n = 2;
  while (usedSet.has(`${base}-${n}${ext}`)) {
    n += 1;
  }
  const next = `${base}-${n}${ext}`;
  usedSet.add(next);
  return next;
}

function toPathname(url) {
  try {
    const parsed = new URL(url);
    return ensureSlashes(parsed.pathname);
  } catch {
    return '';
  }
}

function dedupeRedirects(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row?.from || !row?.to) continue;
    const from = ensureSlashes(row.from);
    const to = ensureSlashes(row.to);
    if (from === '/' || from === to) continue;
    const key = `${from}=>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

async function loadRedirectCsv(csvPath) {
  try {
    const raw = await fs.readFile(csvPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^from,to$/i.test(line))
      .map((line) => {
        const idx = line.indexOf(',');
        if (idx === -1) return null;
        const from = line.slice(0, idx).trim().replace(/^"|"$/g, '');
        const to = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
        if (!from || !to) return null;
        return { from, to };
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function csvEscape(value) {
  const str = String(value || '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function compactObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
}
