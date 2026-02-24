#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { XMLParser } from 'fast-xml-parser';

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input ?? await latestRawExportPath());

const outputDirs = {
  posts: path.resolve('src/content/posts'),
  pages: path.resolve('src/content/pages'),
  drafts: path.resolve('src/content/drafts')
};

const reportPath = path.resolve(args.report ?? 'data/migration-report.json');
const taxonomyPath = path.resolve(args.taxonomy ?? 'src/data/taxonomy.json');

await prepareOutputDirs(outputDirs);

const xml = await fs.readFile(inputPath, 'utf8');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  parseTagValue: false,
  trimValues: false
});

const parsed = parser.parse(xml);
const channel = parsed?.rss?.channel;
const items = toArray(channel?.item);

const attachmentsById = new Map();
const pagesById = new Map();
const postLikeItems = [];
const categoryNameBySlug = new Map();
const tagNameBySlug = new Map();

for (const item of items) {
  const postType = text(item['wp:post_type']);
  const wpId = toInt(text(item['wp:post_id']));

  if (postType === 'attachment') {
    const attachedFile = findMeta(item, '_wp_attached_file');
    const attachmentUrl = text(item['wp:attachment_url']) || text(item.guid);
    attachmentsById.set(wpId, {
      id: wpId,
      url: attachmentUrl,
      attachedFile,
      title: text(item.title)
    });
    continue;
  }

  if (postType !== 'post' && postType !== 'page') {
    continue;
  }

  const categories = [];
  const tags = [];
  for (const cat of toArray(item.category)) {
    const domain = cat?.['@_domain'];
    const nicename = normalizeSlug(cat?.['@_nicename'] ?? text(cat));
    const label = text(cat).trim();
    if (!nicename) continue;

    if (domain === 'category') {
      categories.push(nicename);
      if (label) categoryNameBySlug.set(nicename, label);
    }

    if (domain === 'post_tag') {
      tags.push(nicename);
      if (label) tagNameBySlug.set(nicename, label);
    }
  }

  const entry = {
    id: wpId,
    postType,
    status: normalizeStatus(text(item['wp:status'])),
    title: text(item.title).trim() || `Untitled ${postType} ${wpId}`,
    slug: normalizeSlug(text(item['wp:post_name'])) || `wp-${wpId}`,
    date: pickDate(text(item['wp:post_date_gmt']), text(item['wp:post_date'])),
    updatedDate: pickDate(text(item['wp:post_modified_gmt']), text(item['wp:post_modified'])),
    excerpt: text(item['excerpt:encoded']).trim(),
    content: text(item['content:encoded']),
    legacyUrl: text(item.link).trim(),
    parentId: toInt(text(item['wp:post_parent'])),
    categories: unique(categories),
    tags: unique(tags),
    thumbnailId: toInt(findMeta(item, '_thumbnail_id')),
    rawStatus: text(item['wp:status']).trim()
  };

  postLikeItems.push(entry);
  if (postType === 'page') {
    pagesById.set(entry.id, entry);
  }
}

const usedFilenames = new Set();
const drafts = [];
const publishedPosts = [];
const publishedPages = [];

for (const entry of postLikeItems) {
  const pathValue = entry.postType === 'page'
    ? ensureSlashes(resolvePagePath(entry, pagesById))
    : ensureSlashes(entry.slug);

  const featuredImage = attachmentsById.get(entry.thumbnailId)?.url;
  const frontmatter = {
    title: entry.title,
    path: pathValue,
    date: entry.date,
    updatedDate: entry.updatedDate,
    description: excerptToDescription(entry.excerpt),
    legacyUrl: entry.legacyUrl || undefined,
    wordpressId: entry.id,
    status: entry.status,
    categories: entry.categories,
    tags: entry.tags,
    featuredImage: featuredImage || undefined,
    featuredImageAlt: undefined,
    draft: entry.status !== 'publish',
    contentType: entry.postType
  };

  const body = entry.content?.trim() || '';
  const fileText = matter.stringify(body, frontmatter);

  const collection = entry.status === 'publish'
    ? (entry.postType === 'post' ? 'posts' : 'pages')
    : 'drafts';

  const basename = collection === 'drafts'
    ? `${entry.postType}-${entry.slug}-${entry.id}`
    : `${entry.slug}-${entry.id}`;

  const filename = uniqueFilename(`${safeFilename(basename)}.md`, usedFilenames);
  const outputPath = path.join(outputDirs[collection], filename);
  await fs.writeFile(outputPath, fileText, 'utf8');

  const summary = {
    id: entry.id,
    title: entry.title,
    status: entry.status,
    rawStatus: entry.rawStatus,
    type: entry.postType,
    path: pathValue,
    legacyUrl: entry.legacyUrl,
    date: entry.date,
    outputFile: path.relative(process.cwd(), outputPath)
  };

  if (collection === 'drafts') {
    drafts.push(summary);
  } else if (collection === 'posts') {
    publishedPosts.push(summary);
  } else {
    publishedPages.push(summary);
  }
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.mkdir(path.dirname(taxonomyPath), { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  source: inputPath,
  counts: {
    totalItems: postLikeItems.length,
    postsPublished: publishedPosts.length,
    pagesPublished: publishedPages.length,
    drafts: drafts.length,
    attachments: attachmentsById.size
  },
  publishedPosts,
  publishedPages,
  drafts,
  attachments: Array.from(attachmentsById.values())
};

const taxonomy = {
  categories: Object.fromEntries(Array.from(categoryNameBySlug.entries()).sort()),
  tags: Object.fromEntries(Array.from(tagNameBySlug.entries()).sort())
};

await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
await fs.writeFile(taxonomyPath, JSON.stringify(taxonomy, null, 2), 'utf8');

console.log(`Converted WXR: ${inputPath}`);
console.log(`Published posts: ${publishedPosts.length}`);
console.log(`Published pages: ${publishedPages.length}`);
console.log(`Draft entries: ${drafts.length}`);
console.log(`Attachment entries: ${attachmentsById.size}`);
console.log(`Report: ${reportPath}`);
console.log(`Taxonomy map: ${taxonomyPath}`);

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

async function latestRawExportPath() {
  const rawDir = path.resolve('data/raw');
  let entries = [];
  try {
    entries = await fs.readdir(rawDir, { withFileTypes: true });
  } catch {
    throw new Error(
      'No WordPress export found. Run `yarn migrate:download:wxr` or pass --input <file>.'
    );
  }

  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.xml'))
    .map((entry) => path.join(rawDir, entry.name))
    .sort();

  if (!candidates.length) {
    throw new Error(
      'No XML export found in data/raw. Run `yarn migrate:download:wxr` or pass --input <file>.'
    );
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

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => text(item)).join('');
  if (typeof value === 'object') {
    if (typeof value['#text'] === 'string') return value['#text'];
    if (typeof value.__cdata === 'string') return value.__cdata;
  }
  return '';
}

function toInt(value) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(status) {
  return (status || 'draft').trim().toLowerCase();
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pickDate(primary, fallback) {
  const candidate = (primary && primary !== '0000-00-00 00:00:00') ? primary : fallback;
  const date = new Date(candidate || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function resolvePagePath(page, pagesById, seen = new Set()) {
  if (!page || !page.slug) return '/';
  if (!page.parentId || !pagesById.has(page.parentId)) {
    return page.slug;
  }

  if (seen.has(page.id)) {
    return page.slug;
  }

  seen.add(page.id);
  const parent = pagesById.get(page.parentId);
  const parentPath = resolvePagePath(parent, pagesById, seen);
  return `${parentPath}/${page.slug}`.replace(/\/+/g, '/');
}

function ensureSlashes(pathValue) {
  const clean = String(pathValue || '').replace(/^\/|\/$/g, '');
  if (!clean) return '/';
  return `/${clean}/`;
}

function findMeta(item, key) {
  const postMeta = toArray(item['wp:postmeta']);
  for (const entry of postMeta) {
    if (text(entry['wp:meta_key']) === key) {
      return text(entry['wp:meta_value']);
    }
  }
  return '';
}

function excerptToDescription(excerpt) {
  if (!excerpt) return undefined;
  const plain = excerpt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return undefined;
  return plain.slice(0, 220);
}

function safeFilename(name) {
  return name
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

  let n = 2;
  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  while (usedSet.has(`${base}-${n}${ext}`)) {
    n += 1;
  }
  const next = `${base}-${n}${ext}`;
  usedSet.add(next);
  return next;
}
