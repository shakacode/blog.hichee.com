#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright';

const SITE = 'https://blog.hichee.com';
const DASHBOARD_URL = `${SITE}/wp-admin/index.php`;
const dataDir = path.resolve('data');
const rawDir = path.join(dataDir, 'raw');
const storageStatePath = path.join(dataDir, 'wp-storage-state.json');
const userDataDir = path.join(dataDir, 'wp-browser-profile');

await fs.mkdir(rawDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false
});
if (await fileExists(storageStatePath)) {
  await context.addCookies(JSON.parse(await fs.readFile(storageStatePath, 'utf8')).cookies || []);
}
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

if (page.url().includes('wp-login.php')) {
  console.log('WordPress login is required. Complete login in the opened browser window.');
  await waitForEnter('Press Enter here after login completes...');
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
}

if (page.url().includes('wp-login.php')) {
  throw new Error('Still on wp-login.php after confirmation. Aborting.');
}

const nonce = await page.evaluate(() => {
  // @ts-ignore
  if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
  const scripts = [...document.querySelectorAll('script')]
    .map((s) => s.textContent || '')
    .filter(Boolean);
  for (const script of scripts) {
    const match = script.match(/"nonce":"([a-zA-Z0-9]+)"/);
    if (match) return match[1];
  }
  return '';
});

const statuses = 'publish,draft,pending,future,private';

const posts = await fetchAll(page, `${SITE}/wp-json/wp/v2/posts?context=edit&status=${statuses}&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,excerpt,content,categories,tags,featured_media,parent`);
const pages = await fetchAll(page, `${SITE}/wp-json/wp/v2/pages?context=edit&status=${statuses}&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,excerpt,content,categories,tags,featured_media,parent`);
const categories = await fetchAll(page, `${SITE}/wp-json/wp/v2/categories?context=edit&hide_empty=false&_fields=id,name,slug,count`);
const tags = await fetchAll(page, `${SITE}/wp-json/wp/v2/tags?context=edit&hide_empty=false&_fields=id,name,slug,count`);

const featuredIds = [...new Set([...posts, ...pages].map((item) => Number(item.featured_media || 0)).filter((id) => id > 0))];
const media = [];
for (const chunk of chunkArray(featuredIds, 100)) {
  const include = chunk.join(',');
  const result = await fetchAll(
    page,
    `${SITE}/wp-json/wp/v2/media?context=edit&include=${include}&per_page=100&_fields=id,source_url,alt_text,media_details,title`
  );
  media.push(...result);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = path.join(rawDir, `wp-rest-export-${timestamp}.json`);

const payload = {
  generatedAt: new Date().toISOString(),
  noncePresent: Boolean(nonce),
  counts: {
    posts: posts.length,
    pages: pages.length,
    categories: categories.length,
    tags: tags.length,
    featuredMedia: media.length
  },
  posts,
  pages,
  categories,
  tags,
  media
};

await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
await context.storageState({ path: storageStatePath });
await context.close();

console.log(`Saved REST export: ${outPath}`);
console.log(`Counts: ${JSON.stringify(payload.counts)}`);

async function fetchAll(page, baseUrl) {
  const results = [];
  let currentPage = 1;
  let totalPages = null;

  while (true) {
    const pageUrl = withPage(baseUrl, currentPage);
    const response = await fetchPageJson(page, pageUrl);

    if (!response.ok) {
      if (response.status === 400 && /invalid_page_number/i.test(response.bodyText)) {
        break;
      }
      throw new Error(`REST request failed (${response.status}) for ${pageUrl}: ${response.bodyText.slice(0, 240)}`);
    }

    if (!Array.isArray(response.data)) {
      throw new Error(`Expected array response for ${pageUrl}`);
    }

    results.push(...response.data);

    if (totalPages == null) {
      totalPages = Number.parseInt(response.headers.totalPages || '1', 10);
      if (!Number.isFinite(totalPages) || totalPages < 1) {
        totalPages = 1;
      }
    }

    if (currentPage >= totalPages || response.data.length === 0) {
      break;
    }

    currentPage += 1;
  }

  return results;
}

function withPage(url, pageNum) {
  const joiner = url.includes('?') ? '&' : '?';
  if (/([?&])page=\d+/.test(url)) {
    return url.replace(/([?&])page=\d+/, `$1page=${pageNum}`);
  }
  if (!/([?&])per_page=/.test(url)) {
    return `${url}${joiner}per_page=100&page=${pageNum}`;
  }
  return `${url}${joiner}page=${pageNum}`;
}

async function fetchPageJson(page, url) {
  return page.evaluate(async (requestUrl) => {
    // @ts-ignore
    const nonce = window.wpApiSettings?.nonce || '';
    const headers = {
      Accept: 'application/json'
    };
    if (nonce) {
      headers['X-WP-Nonce'] = nonce;
    }

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const bodyText = await response.text();
    let data = null;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      headers: {
        total: response.headers.get('x-wp-total') || '',
        totalPages: response.headers.get('x-wp-totalpages') || ''
      },
      bodyText,
      data
    };
  }, url);
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(prompt);
  } finally {
    rl.close();
  }
}
