import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { chooseTool, detail, drag, headline, meterErrors, open, symbolPoint } from './helpers';

const require = createRequire(import.meta.url);

test.describe('workbench', () => {
  test('opens on a torn code that is still readable', async ({ page }) => {
    await open(page);
    await expect(headline(page)).toHaveText('Still readable');
    await expect(detail(page)).toHaveText('5 errors corrected in block 1, 3 in block 2.');
    expect(await meterErrors(page)).toEqual([5, 3]);
    await expect(page.getByTestId('decoded-text')).toHaveText(
      'https://mustafaobaidd1.github.io/quiet-zone-qr/',
    );
  });

  test('typing text updates the code', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByTestId('message').fill('HELLO WORLD');
    await expect(page.getByTestId('qr-svg')).toHaveAttribute('data-version', '1');
    await expect(page.getByTestId('encode-status')).toContainText('Version 1');
    await expect(page.getByTestId('encode-status')).toContainText('alphanumeric');
    await expect(page.getByTestId('decoded-text')).toHaveText('HELLO WORLD');
    await expect(headline(page)).toHaveText('Readable');

    await page
      .getByTestId('message')
      .fill('https://example.com/a-much-longer-address-needs-more-modules');
    await expect(page.getByTestId('qr-svg')).not.toHaveAttribute('data-version', '1');
  });

  test('scratching flips modules and updates the status', async ({ page }) => {
    await open(page);
    await chooseTool(page, 'scratch');
    const before = (await meterErrors(page)).reduce((a, b) => a + b, 0);
    const changedBefore = Number(await page.getByTestId('qr-svg').getAttribute('data-changed'));
    await drag(page, [
      [0.3, 0.35],
      [0.42, 0.4],
      [0.55, 0.36],
    ]);
    await expect
      .poll(async () => Number(await page.getByTestId('qr-svg').getAttribute('data-changed')))
      .toBeGreaterThan(changedBefore);
    await expect
      .poll(async () => {
        if ((await headline(page).textContent()) === 'Unreadable') return Number.POSITIVE_INFINITY;
        return (await meterErrors(page)).reduce((a, b) => a + b, 0);
      })
      .toBeGreaterThan(before);
  });

  test('pushing past the limit shows the unreadable state, and undo recovers', async ({ page }) => {
    await open(page);
    await page.locator('button[aria-controls="noise-panel"]').click();
    await page.locator('#noise-p').fill('0.2');
    await page.getByTestId('apply-noise').click();
    await expect(headline(page)).toHaveText('Unreadable');
    await expect(detail(page)).toHaveText(/^Block \d has \d+ errors, it can fix at most 9\./);
    await expect(page.getByTestId('decoded-text')).toHaveText('Nothing could be read.');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(headline(page)).toHaveText('Still readable');
  });

  test('a sticker fails as errors but reads as erasures', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await chooseTool(page, 'sticker');
    await drag(page, [
      [0.3, 0.3],
      [0.72, 0.72],
    ]);
    await expect(headline(page)).toHaveText('Unreadable');
    await page.getByText('Erasure decoding').click();
    await expect(headline(page)).toHaveText('Still readable');
    await expect(detail(page)).toContainText('erasure');
  });

  test('tearing a corner and clearing the damage', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(headline(page)).toHaveText('Readable');
    await chooseTool(page, 'tear');
    const p = await symbolPoint(page, 0.2, 0.1);
    await page.mouse.click(p.x, p.y);
    await expect(headline(page)).not.toHaveText('Readable');
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(headline(page)).toHaveText('Readable');
  });

  test('keyboard: arrows move a cursor and Enter applies the tool', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await chooseTool(page, 'scratch');
    await page.getByTestId('qr-svg').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('probe')).toContainText('Row');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('qr-svg')).toHaveAttribute('data-changed', '1');
  });

  test('hovering a module explains its role', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover needs a mouse');
    await open(page);
    const p = await symbolPoint(page, 1 / 33, 1 / 33);
    await page.mouse.move(p.x + 2, p.y + 2);
    await expect(page.getByTestId('probe')).toContainText('Finder pattern');
  });
});

test.describe('encoder states', () => {
  test('empty input', async ({ page }) => {
    await open(page);
    await page.getByTestId('message').fill('');
    await expect(page.getByTestId('placeholder')).toContainText('Type something to encode');
    await expect(headline(page)).toHaveText('Nothing to decode');
    await page.getByRole('button', { name: 'Use the page address' }).click();
    await expect(page.getByTestId('qr-svg')).toBeVisible();
  });

  test('invalid characters for a forced mode, with a fix', async ({ page }) => {
    await open(page);
    await page.getByTestId('message').fill('Order 123');
    await page.getByTestId('mode').selectOption('numeric');
    await expect(page.getByRole('alert')).toContainText('Numeric mode cannot encode “O”');
    await page.getByRole('button', { name: 'Switch to Auto' }).click();
    await expect(page.getByTestId('qr-svg')).toBeVisible();
  });

  test('too long for the chosen level: switch level, or trim to fit', async ({ page }) => {
    await open(page);
    // 2900 bytes fit only version 40-L (2953 bytes); level M holds at most 2331.
    await page.getByTestId('message').fill('x'.repeat(2900));
    await expect(page.getByRole('alert')).toContainText('Too long for any QR code at level M');
    await page.getByRole('button', { name: 'Use level L' }).click();
    await expect(page.getByTestId('qr-svg')).toHaveAttribute('data-version', '40');

    await page.getByTestId('message').fill('x'.repeat(3000));
    await expect(page.getByRole('alert')).toContainText('Too long for any QR code at level L');
    await page.getByRole('button', { name: 'Trim to fit' }).click();
    await expect(page.getByTestId('qr-svg')).toHaveAttribute('data-version', '40');
    await expect(page.getByTestId('message')).toHaveValue('x'.repeat(2953));
  });
});

test.describe('export', () => {
  test('SVG and PNG downloads are the undamaged code and decode with jsQR', async ({ page }) => {
    await open(page);
    const svgDownload = page.waitForEvent('download');
    await page.getByTestId('export-svg').click();
    const svg = await svgDownload;
    expect(svg.suggestedFilename()).toBe('quiet-zone-qr-v4-M.svg');
    const svgText = await readFile(await svg.path(), 'utf8');
    expect(svgText).toMatch(/^<svg[^>]+viewBox="0 0 41 41"/);
    await expect(page.getByTestId('toast')).toContainText('Saved quiet-zone-qr-v4-M.svg');

    const pngDownload = page.waitForEvent('download');
    await page.getByTestId('export-png').click();
    const png = await pngDownload;
    expect(png.suggestedFilename()).toBe('quiet-zone-qr-v4-M.png');
    const b64 = (await readFile(await png.path())).toString('base64');

    // Decode the exported PNG in the page with jsQR (a devDependency, injected only here).
    await page.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') });
    const text = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, img.width, img.height);
      const jsQR = (
        window as unknown as {
          jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
        }
      ).jsQR;
      return jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
    }, b64);
    expect(text).toBe('https://mustafaobaidd1.github.io/quiet-zone-qr/');
  });
});
