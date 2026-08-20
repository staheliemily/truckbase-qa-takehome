import { test, expect } from '@playwright/test';
import { OrdersList } from './pages/OrdersList';
import { InvoicesView } from './pages/InvoicesView';
import { createOrder, ORDER_RATE } from './helpers/orderFactory';
import { normalizeMoney } from './helpers/money';
import { assertConsistentAcrossViews } from './helpers/consistency';

/**
 * TC-02 - an order's rate survives invoicing.
 *
 * Creates its own order rather than relying on TC-01 having run, so the two can
 * run in either order, in parallel, or on their own.
 */
test('TC-02 order rate is preserved through invoicing', async ({ page }) => {
  const ordersList = new OrdersList(page);
  const invoices = new InvoicesView(page);

  const { orderNumber, reference } = await createOrder(page);

  await test.step('raise the invoice', async () => {
    // createOrder leaves the session on the new order's detail page, which is
    // where the invoice is raised from - no list lookup needed to get here.
    await invoices.openInvoiceDialog();

    // The dialog is the last point before an invoice exists, so check it is
    // this order's and carries the order's rate before committing.
    await expect(invoices.dialog).toContainText(`Order: #${orderNumber}`);
    await expect(invoices.dialog).toContainText(reference);
    await expect(invoices.dialogRateField).toHaveValue(ORDER_RATE);
    await expect(invoices.sendInvoiceField).toHaveValue('false');

    // Service is required even though Save is enabled without it.
    await invoices.setChargeTypeToLinehaulFlatRate();
    await invoices.save();
  });

  // Compare against what the app stored, not the constant typed in, so a
  // failure says which link broke: form -> order, or order -> invoice.
  await ordersList.goto();
  const rateOnOrder = await ordersList.rateInRow(orderNumber);

  // PRIMARY: the one that bills money. A rate that drifts between order and
  // invoice is silent until a customer disputes it.
  await invoices.goto();
  await expect
    .poll(async () => normalizeMoney(await invoices.invoiceAmount(orderNumber)), {
      message: `Invoice for order #${orderNumber} should bill the order's rate (${rateOnOrder})`,
    })
    .toBe(normalizeMoney(rateOnOrder));

  // Soft: failing alone means invoicing is fine and creation is at fault.
  expect
    .soft(normalizeMoney(rateOnOrder), `Order #${orderNumber} should store the rate as entered`)
    .toBe(normalizeMoney(ORDER_RATE));

  // A count, not a boolean: catches a duplicate invoice as well as a missing one.
  await expect
    .poll(() => invoices.invoiceCountForOrder(orderNumber), {
      message: `Order #${orderNumber} should have exactly one invoice`,
    })
    .toBe(1);

  // Rows match on the app's id; the reference rules out an invoice raised
  // against the wrong order.
  expect
    .soft(
      await invoices.referenceOnInvoice(orderNumber),
      `The invoice for order #${orderNumber} should carry this run's reference`,
    )
    .toBe(reference);

  // NOT the comparison originally specified: that is order overlay vs list row,
  // and the overlay has no known rate selector yet.
  await expect(async () => {
    await ordersList.goto();
    const rowRate = await ordersList.rateInRow(orderNumber);

    await invoices.goto();
    const invoiceRate = await invoices.invoiceAmount(orderNumber);

    assertConsistentAcrossViews(
      [
        { view: 'Orders list row', values: { rate: rowRate } },
        { view: 'Invoice', values: { rate: invoiceRate } },
      ],
      { recordLabel: `order #${orderNumber}` },
    );
  }).toPass();

  // "Invoice Created" is the app's wording, read off an invoiced order.
  await ordersList.goto();
  await expect
    .poll(() => ordersList.invoiceStatus(orderNumber), {
      message: `Order #${orderNumber} should show as invoiced`,
    })
    .toBe('Invoice Created');
});
