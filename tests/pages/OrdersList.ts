import type { Locator, Page } from '@playwright/test';
import { escapeForRegExp } from '../helpers/locators';
import { DataGrid } from '../helpers/dataGrid';
import { gotoAndWait } from '../helpers/appReady';

/**
 * The orders list and the order detail overlay it opens.
 *
 * The recording covers navigating here and opening one order. It does not
 * cover reading any value back out - see the `@blocked` methods at the bottom,
 * which say exactly which selector is missing rather than guessing at one.
 *
 * A caution about identifying rows, because the whole "each run creates its
 * own order" design rests on it: the one row the recording touched was
 *
 *     getByRole('button', { name: 'Order: #17, Customer order: #' })
 *
 * The customer order # in that accessible name is EMPTY, even though the
 * recording filled that field with '4243' a few steps earlier. Either the
 * value did not persist, or the name is built before it renders, or codegen
 * captured the name at the wrong moment. Until that is settled, finding a row
 * by the reference this suite typed in is not something to rely on - and if
 * the value really did not persist, that is a finding in its own right.
 */
/** Where the Orders sidebar entry resolves to. */
export const ORDERS_URL = '/orders/all-orders';

export class OrdersList {
  readonly page: Page;
  readonly grid: DataGrid;

  constructor(page: Page) {
    this.page = page;
    this.grid = new DataGrid(page);
  }

  // --- Locators -----------------------------------------------------------

  /**
   * Sidebar entry to the orders area.
   *
   * Matched by hasText rather than accessible name: the sidebar renders
   * unlabelled icons and hides each label with display:none, so the recorded
   * getByText('Orders') resolves to a hidden span and never becomes clickable.
   */
  get ordersNav(): Locator {
    return this.page.getByRole('menuitem').filter({ hasText: 'Orders' });
  }

  /**
   * The `customerOrderNumber` cell of the row for this reference.
   *
   * The recording's `getByRole('button', { name: 'Order: #17, Customer order: #' })`
   * does not exist on the list - that button belongs to the order detail page.
   * The list is a data grid, so rows are matched on the `customerOrderNumber`
   * cell instead. That also settles the empty-reference question from the
   * recording: the value does persist, and reads back as typed.
   */
  referenceCell(reference: string): Locator {
    return this.page
      .locator('.MuiDataGrid-cell[data-field="customerOrderNumber"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeForRegExp(reference)}\\s*$`) })
      .first();
  }

  /**
   * The per-order menu that holds "View invoice".
   *
   * Recorded as a generated MUI class chain, though it does carry a `tid-`
   * hook. `.tid-load-menu__button` alone would be the durable selector; the
   * rest of the chain is codegen noise and could be dropped once someone
   * confirms the hook is unique.
   */
  get loadMenuButton(): Locator {
    return this.page
      .locator(
        '.MuiButtonBase-root.MuiIconButton-root.MuiIconButton-sizeMedium.tid-load-menu__button',
      )
      .first();
  }

  // --- Actions ------------------------------------------------------------

  async goto(): Promise<void> {
    // Direct navigation rather than clicking `ordersNav`. Both reach the same
    // page, but /dashboard - the route the recording passed through - renders
    // as an empty iframe for a restored session, and the sidebar never
    // appears. This route is the one the nav click resolves to anyway.
    await gotoAndWait(this.page, ORDERS_URL, this.page.getByRole('button', { name: 'New load' }), {
      description: 'Orders list',
    });
    await this.grid.ready();
  }

  /** How many rows carry this order number. Exactly one is expected. */
  async orderCount(orderNumber: string): Promise<number> {
    await this.grid.ready();
    return (await this.grid.rowIdsByFieldValue('loadId', orderNumber)).length;
  }

  /** The "Customer order #" as the list shows it, for the round-trip check. */
  async referenceInRow(orderNumber: string): Promise<string> {
    return this.grid.cellText(await this.rowIdFor(orderNumber), 'customerOrderNumber');
  }

  /**
   * Opens the order's detail overlay.
   *
   * The overlay is a query parameter on the list route
   * (`?overview_id=<row id>`), so this navigates rather than clicking. Clicking
   * a row works for a human but not reliably here: rows are virtualised, and
   * scrolling to reach one keeps re-creating the element, so the click waits
   * for something that never becomes stable.
   */
  async openOrder(orderNumber: string): Promise<void> {
    const rowId = await this.rowIdFor(orderNumber);
    await gotoAndWait(this.page, `${ORDERS_URL}?overview_id=${rowId}`, this.overlayBanner, {
      description: `Order #${orderNumber} detail overlay`,
    });
  }

  /** The open overlay's banner, e.g. "Order #20 - Acme Broker". */
  get overlayBanner(): Locator {
    return this.page.getByRole('banner').getByText(/Order #\d+/).first();
  }

  /** Opens the per-order menu and follows it through to the invoice. */
  async viewInvoice(): Promise<void> {
    await this.loadMenuButton.click();
    // .first(): unanchored substring text match, same guard as loadMenuButton.
    await this.page.getByText('View invoice').first().click();
  }

  // --- Readers -------------------------------------------------------------

  /**
   * The rate as shown in the list row.
   *
   * The cell holds two values - `$1,234.56` and `0.53 per mi` - in sibling
   * spans, and its combined textContent (`$1,234.560.53 per mi`) is not a
   * number. The first span is the rate.
   */
  async rateInRow(orderNumber: string): Promise<string> {
    const rowId = await this.rowIdFor(orderNumber);
    return ((await this.grid.cell(rowId, 'rate').locator('span').first().textContent()) ?? '').trim();
  }

  /** The order's invoice status, e.g. "Invoice Created". */
  async invoiceStatus(orderNumber: string): Promise<string> {
    const rowId = await this.rowIdFor(orderNumber);
    return this.grid.cellText(rowId, 'invoiceStatus');
  }

  /** The order number the app assigned, e.g. "17". */
    /**
   * Row lookup by the order number the app assigned.
   *
   * Keyed on `loadId` rather than on the reference this suite typed into
   * "Customer order #": the app's own identifier is guaranteed to exist and to
   * match, where the typed reference depends on that field accepting and
   * returning the value unchanged. Whether it does is checked separately.
   */
  private async rowIdFor(orderNumber: string): Promise<string> {
    await this.grid.ready();
    return this.grid.rowIdByFieldValue('loadId', orderNumber);
  }
}
