import { test, expect } from '@playwright/test';
import { OrdersList } from './pages/OrdersList';
import { createOrder, ORDER_RATE } from './helpers/orderFactory';
import { normalizeMoney } from './helpers/money';

/**
 * TC-01 - an order is created with the rate it was given, and reads back the
 * same from the orders list.
 *
 * Stops short of invoicing on purpose: if this fails, TC-02's failure tells you
 * nothing you did not already know here.
 */
test('TC-01 an order is created with the rate it was given', async ({ page }) => {
  const ordersList = new OrdersList(page);

  const order = await createOrder(page);

  await ordersList.goto();
  await expect
    .poll(() => ordersList.orderCount(order.orderNumber), {
      message: `The orders list should hold exactly one order #${order.orderNumber}`,
    })
    .toBe(1);

  // The rate the app stored, compared as cents so formatting is not the subject.
  await expect
    .poll(async () => normalizeMoney(await ordersList.rateInRow(order.orderNumber)), {
      message: `Order #${order.orderNumber} should store the rate it was given`,
    })
    .toBe(normalizeMoney(ORDER_RATE));

  // Soft: what makes this run's order identifiable to a human afterwards.
  expect
    .soft(
      await ordersList.referenceInRow(order.orderNumber),
      `Customer order # should read back as typed for order #${order.orderNumber}`,
    )
    .toBe(order.reference);

  // A brand new order has not been billed yet.
  expect
    .soft(
      await ordersList.invoiceStatus(order.orderNumber),
      `A new order #${order.orderNumber} should not be invoiced yet`,
    )
    .toBe('Not invoiced');
});
