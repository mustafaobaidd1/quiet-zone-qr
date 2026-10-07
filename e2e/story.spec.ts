import { expect, test } from '@playwright/test';
import { open } from './helpers';

const STEPS = ['bits', 'codewords', 'rs', 'interleave', 'placement', 'mask', 'format', 'recovery'];

test.describe('story mode', () => {
  test('steps through all eight steps with Next and Previous', async ({ page }) => {
    await open(page);
    const panel = page.getByTestId('story-panel');
    await panel.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('story-prev')).toBeDisabled();
    for (let i = 0; i < STEPS.length; i++) {
      await expect(panel).toHaveAttribute('data-step', STEPS[i]);
      await expect(page.getByTestId('story-tab').nth(i)).toHaveAttribute('aria-selected', 'true');
      if (i < STEPS.length - 1) await page.getByTestId('story-next').click();
    }
    await expect(page.getByTestId('story-next')).toBeDisabled();
    await page.getByTestId('story-prev').click();
    await expect(panel).toHaveAttribute('data-step', 'format');
  });

  test('arrow keys move between step tabs', async ({ page }) => {
    await open(page);
    await page.getByTestId('story-tab').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('story-panel')).toHaveAttribute('data-step', 'rs');
    await page.keyboard.press('End');
    await expect(page.getByTestId('story-panel')).toHaveAttribute('data-step', 'recovery');
  });

  test('HELLO WORLD at level Q reproduces the published example in the story', async ({ page }) => {
    await open(page);
    await page.getByTestId('message').fill('HELLO WORLD');
    // The radio sits under a styled label; on phones the floating tool bar can cover it.
    await page.getByTestId('level-Q').evaluate((el) => (el as HTMLInputElement).click());
    await expect(page.getByTestId('level-Q')).toBeChecked();
    await page.getByTestId('story-tab').nth(2).click();
    await page.getByRole('button', { name: 'Show all' }).click();
    // Thonky / CVUT: 168 72 22 82 217 54 156 0 46 15 180 122 16
    await expect(page.getByTestId('rs-ec')).toHaveText(
      ['A8', '48', '16', '52', 'D9', '36', '9C', '00', '2E', '0F', 'B4', '7A', '10'].join(''),
    );
    await page.getByTestId('story-tab').nth(5).click();
    await expect(page.getByRole('button', { name: 'Mask 6, penalty 314, lowest' })).toBeVisible();
  });

  test('the recovery step follows the damage', async ({ page }) => {
    await open(page);
    const panel = page.getByTestId('story-panel');
    await page.getByTestId('story-tab').nth(7).click();
    await expect(panel).toContainText('Not all zero: the block contains errors.');
    await expect(panel).toContainText('Berlekamp–Massey');

    // Remove the damage (the tool bar sits with the code at the top of the page).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByTestId('scratch-for-me').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('scratch-for-me')).toBeVisible();
    await page.getByTestId('scratch-for-me').click();
    await expect(page.getByTestId('scratch-for-me')).toHaveCount(0);
    await expect(panel).toContainText('Not all zero: the block contains errors.');
  });
});

test.describe('how it works', () => {
  test('the GF(256) calculator multiplies and divides with logarithms', async ({ page }) => {
    await open(page);
    const calc = page.locator('#how-gf');
    await calc.scrollIntoViewIfNeeded();
    await expect(calc.locator('.eq strong')).toHaveText('143');
    await calc.locator('select').selectOption('div');
    await calc.locator('input').first().fill('143');
    await expect(calc.locator('.eq strong')).toHaveText('83');
    await calc.locator('input').first().fill('300');
    await expect(calc.getByText('a must be 0–255')).toBeVisible();
  });

  test('equations are typeset when they scroll into view', async ({ page }) => {
    await open(page);
    await page.locator('#how-rs').scrollIntoViewIfNeeded();
    await expect(page.locator('#how-rs [data-typeset="true"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
