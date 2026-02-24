#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright';

const WP_EXPORT_URL = 'https://blog.hichee.com/wp-admin/export.php';
const dataDir = path.resolve('data');
const rawDir = path.join(dataDir, 'raw');
const storageStatePath = path.join(dataDir, 'wp-storage-state.json');

await fs.mkdir(rawDir, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  acceptDownloads: true,
  storageState: await fileExists(storageStatePath) ? storageStatePath : undefined
});

const page = await context.newPage();
await page.goto(WP_EXPORT_URL, { waitUntil: 'domcontentloaded' });

if (page.url().includes('wp-login.php')) {
  console.log('WordPress login is required. Complete login in the opened browser window.');
  await waitForEnter('Press Enter here after login completes...');
  await page.goto(WP_EXPORT_URL, { waitUntil: 'domcontentloaded' });
}

if (page.url().includes('wp-login.php')) {
  console.error('Still on login screen. Aborting export.');
  await browser.close();
  process.exit(1);
}

const allContent = page.locator('#all');
if (await allContent.count()) {
  await allContent.check();
}

const downloadButton = await locateExportButton(page);
if (!downloadButton) {
  const debugPath = path.join(rawDir, 'export-page-debug.html');
  await fs.writeFile(debugPath, await page.content(), 'utf8');
  const buttonTexts = await page
    .locator('button, input[type="submit"], input[type="button"], a.button')
    .allTextContents();
  console.error('Could not locate "Download Export File" button.');
  console.error(`Current URL: ${page.url()}`);
  console.error(`Buttons seen: ${JSON.stringify(buttonTexts.map((t) => t.trim()).filter(Boolean))}`);
  console.error(`Saved debug HTML: ${debugPath}`);
  await browser.close();
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(rawDir, `wordpress-export-${timestamp}.xml`);
const waitDownload = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
const waitXmlResponse = page.waitForResponse(
  (response) => {
    if (response.status() !== 200) return false;
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    return (
      url.includes('download=true') ||
      contentType.includes('text/xml') ||
      contentType.includes('application/xml')
    );
  },
  { timeout: 20_000 }
).catch(() => null);

await downloadButton.click();

const [download, xmlResponse] = await Promise.all([waitDownload, waitXmlResponse]);

if (download) {
  await download.saveAs(target);
} else if (xmlResponse) {
  const xmlText = await xmlResponse.text();
  await fs.writeFile(target, xmlText, 'utf8');
} else {
  const xmlText = await page.evaluate(async () => {
    const form = document.querySelector('form');
    if (!form) return null;

    const formData = new FormData(form);
    if (!formData.has('download')) {
      formData.set('download', 'Download Export File');
    }

    const action = form.getAttribute('action') || window.location.href;
    const response = await fetch(action, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    const text = await response.text();
    return text;
  });

  if (xmlText && (xmlText.startsWith('<?xml') || xmlText.includes('<rss') || xmlText.includes('<wxr_version'))) {
    await fs.writeFile(target, xmlText, 'utf8');
  } else {
    const debugPath = path.join(rawDir, `export-failure-${timestamp}.html`);
    await fs.writeFile(debugPath, await page.content(), 'utf8');
    throw new Error(
      `Export click completed but no XML was detected. URL=${page.url()} debug=${debugPath}`
    );
  }
}

await context.storageState({ path: storageStatePath });
await browser.close();

console.log(`Saved export: ${target}`);
console.log(`Saved auth state: ${storageStatePath}`);

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

async function locateExportButton(page) {
  const candidates = [
    '#download',
    'input#download',
    'input[name="export"]',
    'button:has-text("Download Export File")',
    'input[value="Download Export File"]',
    'button:has-text("Download")'
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      return locator;
    }
  }

  return null;
}
