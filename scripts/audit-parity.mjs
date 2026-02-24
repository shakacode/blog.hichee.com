#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const args = parseArgs(process.argv.slice(2));
const oldBase = (args.oldBase || 'https://blog.hichee.com').replace(/\/+$/, '');
const newBase = (args.newBase || 'https://blog-hichee-com-git.pages.dev').replace(/\/+$/, '');
const maxRoutes = args.maxRoutes ? Number.parseInt(args.maxRoutes, 10) : 0;
const profileDir = path.resolve(args.profileDir || 'data/wp-browser-profile');
const distDir = path.resolve(args.distDir || 'dist');
const auditDir = path.resolve(args.auditDir || 'data/audit');

await fs.mkdir(auditDir, { recursive: true });

const routes = await loadRoutes(distDir);
if (!routes.length) {
  console.error('No routes found in dist directory.');
  process.exit(1);
}

if (maxRoutes > 0 && Number.isFinite(maxRoutes)) {
  routes.splice(maxRoutes);
}

console.log(`Audit target oldBase=${oldBase}`);
console.log(`Audit target newBase=${newBase}`);
console.log(`Routes to audit=${routes.length}`);

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});

const oldPage = await context.newPage();
const newPage = await context.newPage();

const results = [];
for (let i = 0; i < routes.length; i += 1) {
  const route = routes[i];
  const oldUrl = `${oldBase}${route}`;
  const newUrl = `${newBase}${route}`;

  const [oldData, newData] = await Promise.all([
    inspectPage(oldPage, oldUrl, true),
    inspectPage(newPage, newUrl, false),
  ]);

  const issues = comparePages(route, oldData, newData);
  results.push({
    route,
    oldUrl,
    newUrl,
    old: oldData,
    new: newData,
    issues,
  });

  const done = i + 1;
  if (done % 20 === 0 || done === routes.length) {
    const failing = results.filter((row) => row.issues.length > 0).length;
    console.log(`Progress ${done}/${routes.length} (issues=${failing})`);
  }
}

await context.close();

const summary = buildSummary(results);
const stamp = timestamp();
const jsonPath = path.join(auditDir, `parity-${stamp}.json`);
const mdPath = path.join(auditDir, `parity-${stamp}.md`);

await fs.writeFile(
  jsonPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      oldBase,
      newBase,
      routeCount: routes.length,
      summary,
      results,
    },
    null,
    2
  )
);

await fs.writeFile(mdPath, renderMarkdown(summary, results, oldBase, newBase));

console.log(`Wrote JSON report: ${jsonPath}`);
console.log(`Wrote Markdown report: ${mdPath}`);
console.log(`Summary: ${JSON.stringify(summary)}`);

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

async function loadRoutes(distRoot) {
  const routes = new Set();
  await walk(distRoot, async (filePath) => {
    if (!filePath.endsWith('index.html')) return;
    const rel = path.relative(distRoot, filePath).replace(/\\/g, '/');
    if (rel === 'index.html') {
      routes.add('/');
      return;
    }
    if (!rel.endsWith('/index.html')) return;
    const route = `/${rel.slice(0, -'/index.html'.length)}/`;
    routes.add(route.replace(/\/{2,}/g, '/'));
  });
  return [...routes].sort();
}

async function walk(dir, visitor) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, visitor);
      continue;
    }
    await visitor(fullPath);
  }
}

async function inspectPage(page, url, challengeAware) {
  const maxAttempts = challengeAware ? 4 : 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      });
      await page.waitForTimeout(challengeAware ? 900 : 250);

      const details = await page.evaluate(() => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const textWords = (value) => clean(value).split(/\s+/).filter(Boolean).length;
        const bodyText = clean(document.body?.innerText || '');
        const main = document.querySelector('main') || document.body;
        const entryContent =
          document.querySelector('.entry-content') ||
          document.querySelector('.td-post-content') ||
          document.querySelector('.post-content') ||
          null;
        const mainArticles = Array.from(document.querySelectorAll('main > article'));
        const singleMainArticle = mainArticles.length === 1 ? mainArticles[0] : null;
        const primaryNode = entryContent || singleMainArticle || main;
        const primaryText = clean(primaryNode?.innerText || '');
        const h1 = clean(document.querySelector('h1')?.textContent || '');
        const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
        const title = clean(document.title || '');
        const imageCount = Array.from(document.images || []).filter((img) => String(img.src || '').trim().length > 0).length;
        const primaryImageCount = primaryNode
          ? Array.from(primaryNode.querySelectorAll('img')).filter((img) => String(img.src || '').trim().length > 0).length
          : 0;
        return {
          title,
          h1,
          canonical,
          bodyWords: textWords(bodyText),
          primaryWords: textWords(primaryText),
          imageCount,
          primaryImageCount,
          sample: bodyText.slice(0, 280),
        };
      });

      const status = response?.status() ?? null;
      const finalUrl = page.url();
      const looksBlocked =
        status === 403 ||
        /just a moment|attention required|cf-mitigated|captcha/i.test(`${details.title} ${details.sample}`);

      if (looksBlocked && attempt < maxAttempts && challengeAware) {
        await page.waitForTimeout(2500 * attempt);
        continue;
      }

      return {
        status,
        finalUrl,
        ...details,
        blocked: looksBlocked,
        error: null,
      };
    } catch (error) {
      lastError = String(error?.message || error);
      if (attempt < maxAttempts) {
        await page.waitForTimeout(2000 * attempt);
        continue;
      }
    }
  }

  return {
    status: null,
    finalUrl: url,
    title: '',
    h1: '',
    canonical: '',
    bodyWords: 0,
    primaryWords: 0,
    imageCount: 0,
    primaryImageCount: 0,
    sample: '',
    blocked: false,
    error: lastError || 'Unknown navigation error',
  };
}

function comparePages(route, oldData, newData) {
  const issues = [];

  if (oldData.error) issues.push('old:error');
  if (newData.error) issues.push('new:error');
  if (oldData.blocked) issues.push('old:blocked');

  if (oldData.status === 200 && newData.status !== 200) {
    issues.push('status:new_not_200');
  }
  if (oldData.status === 404 && newData.status === 200) {
    issues.push('status:old_404_new_200');
  }

  const oldTitle = normalizeTitle(oldData.title);
  const newTitle = normalizeTitle(newData.title);
  if (oldTitle && newTitle) {
    const similarity = tokenSimilarity(oldTitle, newTitle);
    if (similarity < 0.30) {
      issues.push('title:mismatch');
    }
  }

  const oldWords = oldData.primaryWords || oldData.bodyWords;
  const newWords = newData.primaryWords || newData.bodyWords;
  if (route !== '/' && oldWords >= 120) {
    const ratio = oldWords === 0 ? 0 : newWords / oldWords;
    if (ratio < 0.45) issues.push('content:too_short');
    if (ratio > 2.2) issues.push('content:too_long');
  }

  const oldImages = oldData.primaryImageCount || oldData.imageCount;
  const newImages = newData.primaryImageCount || newData.imageCount;
  if (route !== '/' && oldImages > 0 && newImages === 0 && oldWords >= 120) {
    issues.push('images:dropped');
  }

  if (oldData.h1 && !newData.h1) {
    issues.push('h1:missing');
  }

  if (route === '/' && newData.status !== 200) {
    issues.push('home:bad_status');
  }

  return issues;
}

function normalizeTitle(raw) {
  const value = String(raw || '')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&amp;/g, '&')
    .trim();

  const withoutSite = value
    .replace(/\s*[-|]\s*the hichee blog.*$/i, '')
    .replace(/\s*[-|]\s*hichee.*$/i, '')
    .trim();

  return withoutSite
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(String(left).split(' ').filter(Boolean));
  const rightTokens = new Set(String(right).split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const denom = Math.max(leftTokens.size, rightTokens.size);
  return overlap / denom;
}

function buildSummary(rows) {
  const withIssues = rows.filter((row) => row.issues.length > 0);
  const issueCounts = {};
  for (const row of withIssues) {
    for (const issue of row.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }
  return {
    total: rows.length,
    ok: rows.length - withIssues.length,
    withIssues: withIssues.length,
    issueCounts,
  };
}

function renderMarkdown(summary, rows, oldBaseUrl, newBaseUrl) {
  const lines = [];
  lines.push('# Full Parity Audit');
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Old base: ${oldBaseUrl}`);
  lines.push(`- New base: ${newBaseUrl}`);
  lines.push(`- Total routes audited: ${summary.total}`);
  lines.push(`- Routes without issues: ${summary.ok}`);
  lines.push(`- Routes with issues: ${summary.withIssues}`);
  lines.push('');

  lines.push('## Issue Counts');
  if (Object.keys(summary.issueCounts).length === 0) {
    lines.push('- None');
  } else {
    for (const [key, count] of Object.entries(summary.issueCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${key}: ${count}`);
    }
  }
  lines.push('');

  lines.push('## Routes With Issues');
  const badRows = rows.filter((row) => row.issues.length > 0);
  if (!badRows.length) {
    lines.push('- None');
  } else {
    for (const row of badRows) {
      lines.push(`- ${row.route} :: ${row.issues.join(', ')}`);
      lines.push(
        `  old=${row.old.status} title="${trim(row.old.title)}" words=${row.old.primaryWords || row.old.bodyWords} images=${row.old.primaryImageCount || row.old.imageCount}`
      );
      lines.push(
        `  new=${row.new.status} title="${trim(row.new.title)}" words=${row.new.primaryWords || row.new.bodyWords} images=${row.new.primaryImageCount || row.new.imageCount}`
      );
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function trim(value, limit = 100) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}

function timestamp() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}
