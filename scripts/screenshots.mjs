// Captures README screenshots and the social preview image from the production build.
// Usage: npm run build && npm run screenshots
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const shots = [
  { file: 'docs/screenshots/desktop.png', width: 1440, height: 900, scale: 1 },
  { file: 'docs/screenshots/tablet.png', width: 834, height: 1112, scale: 1 },
  { file: 'docs/screenshots/mobile.png', width: 390, height: 844, scale: 2 },
  // The social preview hides the tool rows, which the 630 px crop would cut in half.
  { file: 'public/og-image.png', width: 1200, height: 630, scale: 1, hide: '.toolbar, .export' },
];

const server = await preview();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('Preview server did not report a URL');

try {
  await mkdir('docs/screenshots', { recursive: true });
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  });
  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: shot.scale,
    });
    await page.goto(url);
    await page.waitForSelector('html[data-ready="true"]', { timeout: 30_000 });
    if (shot.hide)
      await page.addStyleTag({ content: `${shot.hide} { visibility: hidden !important; }` });
    // Give animations and simulations a moment to reach a representative frame.
    await page.waitForTimeout(Number(process.env.SHOT_DELAY ?? 2500));
    await page.screenshot({ path: shot.file });
    await page.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
} finally {
  await server.close();
}
