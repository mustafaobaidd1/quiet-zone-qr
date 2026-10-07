import { expect, type Page } from '@playwright/test';

export async function open(page: Page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** Screen position of a point given in normalised symbol coordinates (0–1 over the modules). */
export async function symbolPoint(page: Page, nx: number, ny: number) {
  const svg = page.getByTestId('qr-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('QR code not visible');
  const version = Number(await svg.getAttribute('data-version'));
  const size = 17 + 4 * version;
  const total = size + 8; // 4-module quiet zone on each side
  return {
    x: box.x + ((4 + nx * size) / total) * box.width,
    y: box.y + ((4 + ny * size) / total) * box.height,
  };
}

/** Drag the pointer through points in normalised symbol coordinates. */
export async function drag(page: Page, points: [number, number][]) {
  const start = await symbolPoint(page, ...points[0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    const q = await symbolPoint(page, ...p);
    await page.mouse.move(q.x, q.y, { steps: 6 });
  }
  await page.mouse.up();
}

export async function chooseTool(page: Page, tool: string) {
  await page.locator(`[data-tool="${tool}"]`).click();
  await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed', 'true');
}

export const headline = (page: Page) => page.getByTestId('status-headline');
export const detail = (page: Page) => page.getByTestId('status-detail');

/** Sum of the error counts shown by the block meters. */
export async function meterErrors(page: Page): Promise<number[]> {
  return page
    .getByTestId('block-meter')
    .evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-errors'))));
}
