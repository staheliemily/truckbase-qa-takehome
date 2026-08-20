import { expect, type Locator, type Page } from '@playwright/test';
import { escapeForRegExp } from './locators';

/**
 * Reading values out of the app's MUI data grids.
 *
 * Two things about these grids make a naive `getByRole('row')` approach fail,
 * both confirmed against the running app:
 *
 * 1. Columns are virtualised. Only the pinned columns
 *    (`__detail_panel_toggle__`, `__check__`, `client`) are in the DOM on
 *    load; `rate`, `invoiceStatus`, `amount` and the rest do not exist until
 *    the grid has been scrolled horizontally. Widening the viewport does not
 *    help - the grid has to actually scroll.
 * 2. One logical row is three DOM elements sharing a `data-id` (left pinned,
 *    scrollable, right pinned). Querying cells within a single row element
 *    only ever finds that section's columns, so lookups go by `data-id`
 *    across the whole grid instead.
 *
 * Cells carry `data-field` attributes matching the API's field names, which
 * are far more durable than positions or generated class names.
 */
export class DataGrid {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Any row carrying a record id. */
  get rows(): Locator {
    return this.page.locator('[role="row"][data-id]');
  }

  /** Waits for the grid to have data, then brings every column into the DOM. */
  async ready(timeout = 120_000): Promise<void> {
    await expect(this.rows.first()).toBeVisible({ timeout });
    await this.revealAllColumns();
  }

  /**
   * Scrolls the grid to the far right so the virtualised columns render.
   *
   * Setting `scrollLeft` directly does not trigger the grid's own
   * virtualisation; a real wheel event does.
   */
  async revealAllColumns(): Promise<void> {
    const scroller = this.page.locator('.MuiDataGrid-virtualScroller').first();
    const box = await scroller.boundingBox();
    if (!box) return;

    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 6; i += 1) {
      await this.page.mouse.wheel(400, 0);
      // The grid renders newly-scrolled columns on the next frame; this waits
      // for that render, not for a fixed duration of the app's choosing.
      await expect
        .poll(async () => this.page.locator('.MuiDataGrid-cell[data-field]').count(), {
          timeout: 5_000,
        })
        .toBeGreaterThan(0);
    }
  }

  /** Cells of `field` reading exactly `value`, among the rows currently rendered. */
  private cellsMatching(field: string, value: string): Locator {
    return this.page
      .locator(`.MuiDataGrid-cell[data-field="${field}"]`)
      .filter({ hasText: new RegExp(`^\\s*${escapeForRegExp(value)}\\s*$`) });
  }

  /**
   * Every row whose `field` cell reads exactly `value`, scanning the whole grid.
   *
   * Rows virtualise vertically as well as horizontally: only the ~11 rows in
   * view exist in the DOM, so counting or searching what is rendered finds a
   * row only if it happens to be on screen. This scrolls top to bottom and
   * collects ids as they render, which is also what makes a duplicate
   * detectable rather than invisible.
   */
  async rowIdsByFieldValue(field: string, value: string): Promise<string[]> {
    await this.revealAllColumns();

    const scroller = this.page.locator('.MuiDataGrid-virtualScroller').first();
    const box = await scroller.boundingBox();
    if (box) {
      await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });

    const found = new Set<string>();
    for (let step = 0; step < 40; step += 1) {
      for (const id of await this.cellsMatching(field, value).evaluateAll((cells) =>
        cells.map((c) => c.closest('[role="row"]')?.getAttribute('data-id')).filter(Boolean),
      )) {
        found.add(id as string);
      }

      const before = await scroller.evaluate((el) => el.scrollTop);
      await this.page.mouse.wheel(0, 600);
      try {
        // Condition-based, not a sleep: if scrollTop stops moving the grid is
        // at the bottom and every row has been seen.
        await expect
          .poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 3_000 })
          .not.toBe(before);
      } catch {
        break;
      }
    }

    return [...found];
  }

  /**
   * The row id for `field` = `value`, in whatever is currently rendered.
   *
   * Short timeout on purpose: this is called once per scroll step, and the
   * default action timeout would spend 45s per miss.
   */
  private async renderedRowId(field: string, value: string): Promise<string | null> {
    try {
      return await this.cellsMatching(field, value)
        .first()
        .evaluate((el) => el.closest('[role="row"]')?.getAttribute('data-id') ?? null, undefined, {
          timeout: 2_000,
        });
    } catch {
      return null;
    }
  }

  /**
   * Scrolls until the matching row renders and stops there, returning its id.
   *
   * Stops rather than scanning on, so the row is still in the DOM for `cell()`
   * to read; continuing would virtualise it straight back out. The check after
   * the loop matters as much as the ones inside it - the last screenful only
   * renders once scrolling has already stopped.
   *
   * @throws if no row matches, naming the field and value.
   */
  async rowIdByFieldValue(field: string, value: string): Promise<string> {
    await this.revealAllColumns();

    const scroller = this.page.locator('.MuiDataGrid-virtualScroller').first();
    const box = await scroller.boundingBox();
    if (box) {
      await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });

    for (let step = 0; step < 40; step += 1) {
      const id = await this.renderedRowId(field, value);
      if (id) return id;

      const before = await scroller.evaluate((el) => el.scrollTop);
      await this.page.mouse.wheel(0, 600);
      try {
        await expect
          .poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 3_000 })
          .not.toBe(before);
      } catch {
        break;
      }
    }

    const atBottom = await this.renderedRowId(field, value);
    if (atBottom) return atBottom;

    throw new Error(`No grid row where ${field} is "${value}", after scanning the whole grid.`);
  }

  /** One cell of a known row. */
  cell(rowId: string, field: string): Locator {
    return this.page.locator(`[role="row"][data-id="${rowId}"] [data-field="${field}"]`).first();
  }

  /** The text of one cell, trimmed. */
  async cellText(rowId: string, field: string): Promise<string> {
    return ((await this.cell(rowId, field).textContent()) ?? '').trim();
  }
}
