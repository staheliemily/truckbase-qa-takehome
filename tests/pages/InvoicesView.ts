import type { Locator, Page } from '@playwright/test';
import { statSync } from 'node:fs';
import { DataGrid } from '../helpers/dataGrid';
import { waitForAppShell, FIRST_PAINT_TIMEOUT } from '../helpers/appReady';
import { expect } from '@playwright/test';

/**
 * The invoices view.
 *
 * This is the thinnest page object in the suite, and deliberately so. The
 * recording ends one click after `View invoice`: it gets to the invoice and
 * stops. Nothing inside the invoice - no amount, no order reference, no list
 * of invoices, no status - was ever clicked, so there is no recorded selector
 * for any of it.
 *
 * That is why the reader methods below throw instead of returning something.
 * Guessing at, say, `getByText(/Total/)` would produce a test that passes for
 * the wrong reason, which is worse than one that says what it needs.
 *
 * The steps that ARE here come from this tail of the recording:
 *
 *     getByRole('button', { name: 'Create' }).nth(1)
 *     getByRole('button', { name: 'Save' })
 *     getByRole('button', { name: 'Order: #17, Customer order: #' })
 *     getByRole('button', { name: 'Open' }).first()
 *     getByRole('option', { name: 'Linehaul flat rate' })
 *     getByRole('button', { name: 'Save' })
 *     .tid-load-menu__button  ->  'View invoice'
 *
 * What that sequence means is genuinely ambiguous. `Create` .nth(1) is
 * positional and unnamed beyond "Create", and it is not clear whether it
 * creates the invoice, a charge line, or a document. The method names below
 * describe the clicks rather than asserting an interpretation of them.
 */
export class InvoicesView {
  readonly page: Page;
  readonly grid: DataGrid;

  constructor(page: Page) {
    this.page = page;
    this.grid = new DataGrid(page);
  }

  /** The invoices area, reached from the sidebar. */
  async goto(): Promise<void> {
    await waitForAppShell(this.page);
    await this.page.getByRole('menuitem').filter({ hasText: 'Invoices' }).first().click();
    await this.grid.ready();
  }

  // --- Locators -----------------------------------------------------------

  /**
   * The invoice "Create" button in the overlay's Generate Documents section.
   *
   * The recording's `getByRole('button', { name: 'Create' }).nth(1)` is wrong
   * twice over. Role names match on a substring, so it also matches the filter
   * panel's "Created date" and "Created from Quote" buttons, and index 1 lands
   * on a filter chip. Even with `exact: true` the index is unsafe: the
   * Generate Documents section renders a Create per document, and an order
   * that is already invoiced has one fewer.
   *
   * So this anchors on the invoice row's own description instead - position
   * and order state stop mattering.
   */
  get createButton(): Locator {
    return this.page
      .locator('.generate-rate-con__docs-container')
      .filter({ hasText: 'Create and or send an invoice for this order' })
      .getByRole('button', { name: 'Create', exact: true });
  }

  /**
   * `exact: true` matters here too: a bare 'Save' also matches the orders
   * grid's "Save view" button behind the dialog.
   */
  get saveButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Save', exact: true }).first();
  }

  /** The charge type option the recording chose. */
  get linehaulFlatRateOption(): Locator {
    return this.page.getByRole('option', { name: 'Linehaul flat rate' });
  }

  // --- Actions ------------------------------------------------------------

  /** The invoice dialog opened by the Create button. */
  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  /** Create opens a "Send invoice to <customer>" dialog; the charge type must
   * be set inside it before saving, not after as the recording's click order
   * suggests. */
  async openInvoiceDialog(): Promise<void> {
    await this.createButton.click();
    await expect(this.dialog, 'Invoice dialog did not open').toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
  }

  /** The rate the dialog pre-fills from the order. Name carries a random suffix. */
  get dialogRateField(): Locator {
    return this.dialog.locator('input[name^="rate-"]').first();
  }

  /** Collapsed order line, e.g. "Order: #34, Customer order: #0820...". */
  get orderLineToggle(): Locator {
    return this.dialog.getByRole('button', { name: /Order: #\d+/ }).first();
  }

  /** Off by default; this suite must never turn it on. */
  get sendInvoiceField(): Locator {
    return this.dialog.locator('input[name="sendInvoice"]');
  }

  /**
   * Sets the invoice line's Service.
   *
   * Required, though nothing in the UI says so: Save is enabled without it and
   * clicking Save silently does nothing. Matched on the field's own "Please
   * select" text - the recording's `getByRole('button', { name: 'Open' })` does
   * not exist inside this dialog.
   */
  async setChargeTypeToLinehaulFlatRate(): Promise<void> {
    // The order line is collapsed and its Service row does not exist until it
    // is expanded. This is the recording's
    // `getByRole('button', { name: 'Order: #17, Customer order: #' })` - a
    // control inside this dialog, not on the orders list as it first appeared.
    await this.orderLineToggle.click();

    // Only now does the Service autocomplete exist, with the "Open" toggle the
    // recording clicked next.
    await this.dialog.getByRole('button', { name: 'Open', exact: true }).first().click();
    await this.linehaulFlatRateOption.click();
  }

  /** Saves the dialog. Refuses if the dialog is set to send. */
  async save(): Promise<void> {
    // If a required field were missing, Save would be disabled - fail on that
    // rather than on a click that silently does nothing.
    await expect(this.saveButton, 'Save is disabled: the dialog is incomplete').toBeEnabled();

    await expect(
      this.sendInvoiceField,
      'Refusing to save: dialog is set to send the invoice, which this suite must not do',
    ).toHaveValue('false');

    await this.saveButton.click();
    await expect(this.dialog, 'Invoice dialog did not close after saving').toBeHidden({
      timeout: FIRST_PAINT_TIMEOUT,
    });
  }

  // --- Viewing and downloading ---------------------------------------------

  /**
   * Opens the invoice viewer from the invoices grid row menu.
   *
   * The row menu also offers "Mark as paid" and "Edit or send". Neither is
   * touched here: one changes financial state, the other can email the
   * customer.
   */
  async openInvoiceViewer(orderNumber: string): Promise<void> {
    const rowId = await this.grid.rowIdByFieldValue('loadId', orderNumber);
    await this.grid.cell(rowId, 'menu').getByRole('button').first().click();
    await this.page.getByRole('menuitem').filter({ hasText: 'View invoice' }).first().click();
    await expect(this.downloadButton, 'Invoice viewer did not open').toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
  }

  /** Icon button in the viewer. Its accessible name is lowercase "download". */
  get downloadButton(): Locator {
    return this.page.getByRole('button', { name: 'download', exact: true });
  }

  /**
   * Downloads the open invoice and returns the saved file.
   *
   * The download event has to be awaited alongside the click, not after it -
   * the browser can finish the download before the next line runs.
   */
  async downloadInvoice(): Promise<{ filename: string; bytes: number }> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadButton.click(),
    ]);

    const path = await download.path();
    if (!path) {
      throw new Error(`Download "${download.suggestedFilename()}" produced no file on disk.`);
    }
    return { filename: download.suggestedFilename(), bytes: statSync(path).size };
  }

  // --- Readers -------------------------------------------------------------

  /**
   * The invoice total for an order, from the invoices grid `amount` column.
   *
   * Invoices carry the order's `customerOrderNumber`, which is what ties an
   * invoice back to the order this run created.
   */
  async invoiceAmount(orderNumber: string): Promise<string> {
    const rowId = await this.grid.rowIdByFieldValue('loadId', orderNumber);
    return this.grid.cellText(rowId, 'amount');
  }

  /**
   * How many invoices exist for this order.
   *
   * A count rather than a boolean: "expected true, received false" says
   * nothing, and a boolean cannot tell a missing invoice apart from a
   * duplicated one. Billing an order twice is its own defect.
   */
  async invoiceCountForOrder(orderNumber: string): Promise<number> {
    await this.grid.ready();
    return (await this.grid.rowIdsByFieldValue('loadId', orderNumber)).length;
  }

  /**
   * The customer reference carried on the invoice.
   *
   * Cross-checks the link: rows are found by the app's `loadId`, so matching
   * the reference too proves the invoice belongs to this order rather than
   * having a coincidentally equal id.
   */
  async referenceOnInvoice(orderNumber: string): Promise<string> {
    const rowId = await this.grid.rowIdByFieldValue('loadId', orderNumber);
    return this.grid.cellText(rowId, 'customerOrderNumber');
  }

  /** The invoice's own status, e.g. "Created". */
  async invoiceStatus(orderNumber: string): Promise<string> {
    const rowId = await this.grid.rowIdByFieldValue('loadId', orderNumber);
    return this.grid.cellText(rowId, 'status');
  }
}
