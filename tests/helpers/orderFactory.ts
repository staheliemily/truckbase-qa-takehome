import { expect, type Page } from '@playwright/test';
import { OrderForm } from '../pages/OrderForm';
import { numericOrderReference } from './testData';

/** Seed data the recording used, and the rate under test. */
export const SEED = {
  customer: 'Acme Broker',
  pickupLocation: 'HQ',
  deliveryLocation: 'Stop 2',
  thirdStopLocation: 'Stop 3',
  driver: 'Sam Driver',
  truck: 'Truck 1',
} as const;

/** Fixed, not randomised: a rate that changes per run is harder to reproduce. */
export const ORDER_RATE = '1234.56';

export interface CreatedOrder {
  /** The number the app assigned, e.g. "29". Every later lookup keys off it. */
  orderNumber: string;
  /** What this run typed into "Customer order #". */
  reference: string;
  /** The rate the form was given. */
  rate: string;
}

/**
 * Creates one order and returns what identifies it.
 *
 * Shared so both specs can start from a real order without one depending on
 * the other having run. The cost is one order per test rather than per run -
 * if that matters more than independence, promote this to a worker-scoped
 * fixture and share a single order across the tests in a worker.
 */
export async function createOrder(page: Page, rate: string = ORDER_RATE): Promise<CreatedOrder> {
  const orderForm = new OrderForm(page);
  const reference = numericOrderReference();
  const { pickupDay, deliveryDay, thirdStopDay } = upcomingStopDays();

  await orderForm.open();
  await expect(orderForm.rateField, 'Order form did not open').toBeVisible();

  await orderForm.selectCustomer(SEED.customer);

  await orderForm.setCustomerOrderNumber(reference);
  // Catches a field that silently rejects or truncates, here rather than as a
  // missing row several steps later.
  await expect(orderForm.customerOrderNumberField).toHaveValue(reference);

  await orderForm.setRate(rate);
  await expect(orderForm.rateField).toHaveValue(rate);

  await orderForm.setPickupStop(SEED.pickupLocation, pickupDay);
  await orderForm.setDeliveryStop(SEED.deliveryLocation, deliveryDay);

  await orderForm.assignDriver(SEED.driver);
  await orderForm.assignTruck(SEED.truck);

  // The recording could not create the order without a third stop; whether
  // that is required is unconfirmed.
  await orderForm.addThirdStop(SEED.thirdStopLocation, thirdStopDay);

  const orderNumber = await orderForm.submit();
  expect(orderNumber, 'App should assign an order number').toMatch(/^\d+$/);

  return { orderNumber, reference, rate };
}

/**
 * Day-of-month numbers for the three stops: tomorrow and the two days after.
 *
 * The picker is driven by clicking a `gridcell` named with the day and no
 * month-navigation control was recorded, so a run that would cross a month
 * boundary fails here with a reason instead of clicking the wrong month.
 */
export function upcomingStopDays(): {
  pickupDay: number;
  deliveryDay: number;
  thirdStopDay: number;
} {
  const today = new Date();

  const dayAfter = (offset: number): number => {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);

    if (day.getMonth() !== today.getMonth()) {
      throw new Error(
        'Needs three days after today within the same calendar month, but today is ' +
          `${today.toDateString()}. No month-navigation selector was recorded, so this ` +
          'cannot run in the last three days of a month.',
      );
    }
    return day.getDate();
  };

  return { pickupDay: dayAfter(1), deliveryDay: dayAfter(2), thirdStopDay: dayAfter(3) };
}
