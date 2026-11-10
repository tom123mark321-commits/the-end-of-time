import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(resolve('时间的尽头.html')).href);
  await page.waitForFunction(() => window.__chronos?.frames > 20, { timeout: 45000 });
  assert.equal(errors.length, 0);
  await page.screenshot({ path: 'test-results/standalone.png' });
  console.log('PASS: standalone HTML runs directly from file:// without a server');
} finally { await browser.close(); }
