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

const downloadButton = page.locator('#download');
if (!(await downloadButton.count())) {
  console.error('Could not locate "Download Export File" button.');
  await browser.close();
  process.exit(1);
}

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 120_000 }),
  downloadButton.click()
]);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(rawDir, `wordpress-export-${timestamp}.xml`);
await download.saveAs(target);

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
