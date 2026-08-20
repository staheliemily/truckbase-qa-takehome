import { expect, type Locator, type Page } from '@playwright/test';
import { escapeForRegExp } from '../helpers/locators';
import { ORDERS_URL } from './OrdersList';
import { appearsWithin, gotoAndWait, FIRST_PAINT_TIMEOUT } from '../helpers/appReady';

/**
 * The "New load" order creation form.
 *
 * Locators come from the codegen recording. Autocompletes open via a trailing
 * "Open" button and their options are headings; dates are a "Choose date"
 * button then a `gridcell` named with the day.
 */
export class OrderForm {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
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

  get newLoadButton(): Locator {
    return this.page.getByRole('button', { name: 'New load' });
  }

  get customerOrderNumberField(): Locator {
    return this.page.getByRole('textbox', { name: 'Customer order #' });
  }

  /** Unnamed and unindexed in the recording: the only spinbutton on the form. */
  get rateField(): Locator {
    return this.page.getByRole('spinbutton');
  }

  get createOrderButton(): Locator {
    return this.page.getByRole('button', { name: 'Create order' });
  }

  // --- Actions ------------------------------------------------------------

  /**
   * The order form, waiting for the orders page to be interactive first.
   *
   * Waits on "New load" by name rather than letting the click's own timeout
   * absorb the paint, so a slow render and a missing button fail differently.
   */
  async open(): Promise<void> {
    await gotoAndWait(this.page, ORDERS_URL, this.newLoadButton, { description: 'Orders list' });
    await this.newLoadButton.click();
  }

  /** Positional: `Open`.first() is the customer only while it is the first
   * autocomplete on the page. */
  async selectCustomer(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Open' }).first().click();
    await this.page.getByRole('heading', { name }).click();
  }

  /** The customer's own reference for the order - the suite's run marker. */
  async setCustomerOrderNumber(reference: string): Promise<void> {
    await this.customerOrderNumberField.fill(reference);
  }

  /** Sets the linehaul rate, e.g. '1234.56'. */
  async setRate(amount: string): Promise<void> {
    await this.rateField.fill(amount);
  }

  /** Stop 1 is the only stop control with an id, which is why stops 2 and 3
   * below look nothing like this. */
  async setPickupStop(location: string, dayOfMonth: number): Promise<void> {
    await this.page.locator('#stop-location-1').click();
    await this.page.getByRole('heading', { name: location }).click();

    // Filter text is the stop card's concatenated content; breaks if that copy changes.
    await this.page
      .getByRole('article')
      .filter({ hasText: 'Add stopStop 1Clear' })
      .getByLabel('Choose date')
      .click();
    await this.chooseDay(dayOfMonth);
  }

  /** Scoped to the delivery section by id. */
  async setDeliveryStop(location: string, dayOfMonth: number): Promise<void> {
    await this.page
      .locator('#load-build-delivery-section')
      .getByRole('button', { name: 'Open' })
      .click();
    await this.page.getByRole('heading', { name: location }).click();

    await this.page.getByRole('button', { name: 'Choose date', exact: true }).click();
    await this.chooseDay(dayOfMonth);
  }

  /** The recording could not create the order without a third stop; whether
   * that is required is unconfirmed. `Add stop`.nth(2) is positional. */
  async addThirdStop(location: string, dayOfMonth: number): Promise<void> {
    await this.page.getByRole('button', { name: 'Add stop' }).nth(2).click();

    // Generated MUI class chain keyed on the focused field. Very brittle.
    await this.page
      .locator(
        '.MuiInputBase-root.MuiOutlinedInput-root.MuiInputBase-colorPrimary.MuiInputBase-fullWidth.Mui-focused > .MuiAutocomplete-endAdornment > .MuiButtonBase-root',
      )
      .click();
    await this.page.getByRole('heading', { name: location }).click();

    await this.page.getByRole('button', { name: 'Choose date', exact: true }).click();
    await this.chooseDay(dayOfMonth);
  }

  /** `input[name="driver-1"]` is a name attribute, so it survives restyling. */
  async assignDriver(name: string): Promise<void> {
    await this.page.locator('input[name="driver-1"]').click();
    await this.page.getByRole('heading', { name }).click();
  }

  /** Worst selectors in the recording: an emotion class chain plus a text-filtered
   * div. A `tid-` hook on this field is the highest-value app-side fix. */
  async assignTruck(name: string): Promise<void> {
    await this.page
      .locator(
        '.MuiFormControl-root.MuiFormControl-fullWidth.undefined.tid-autocomplete.css-18tpcgj-MuiFormControl-root > .tid-autocomplete__object-chrome-row > .MuiBox-root.css-j8h7a3 > .MuiAutocomplete-root > .MuiFormControl-root > .MuiInputBase-root > .MuiAutocomplete-endAdornment > .MuiButtonBase-root',
      )
      .click();
    // `.first()` because hasText tests an element's whole subtree: every
    // ancestor div whose text is also exactly the truck name matches too.
    await this.page
      .locator('div')
      .filter({ hasText: new RegExp(`^${escapeForRegExp(name)}$`) })
      .first()
      .click();
  }

  /** The two confirmations are optional: the recording proves they appeared
   * once, not always. */
  async submit(): Promise<string> {
    await this.createOrderButton.click();

    for (const name of ['Ignore and proceed', 'Skip']) {
      await clickIfItAppears(this.page.getByRole('button', { name }));
    }

    // Wait for the order to actually exist before anything navigates away.
    // Creation lands on the new order's detail page, whose header carries an
    // "Order: #<n>" button - the same control the recording clicked. Without
    // this the next navigation can abort the create request in flight, and
    // the order is never findable afterwards.
    await expect(this.createdOrderHeader, 'Order was not created').toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    return this.createdOrderNumber();
  }

  /**
   * The created order's banner, e.g. "Order #20 - Acme Broker Not started".
   *
   * Not the recording's `getByRole('button', { name: 'Order: #17, Customer
   * order: #' })` - no such button exists here. Creation lands on the order
   * detail page and this banner is what confirms it.
   */
  get createdOrderHeader(): Locator {
    return this.page.getByRole('banner').getByText(/Order #\d+/).first();
  }

  /** The order number the app assigned, read from the banner after creation. */
  async createdOrderNumber(): Promise<string> {
    const text = (await this.createdOrderHeader.textContent()) ?? '';
    const match = /Order #(\d+)/.exec(text);
    if (!match?.[1]) {
      throw new Error(`Could not read an order number from the banner text "${text}".`);
    }
    return match[1];
  }

  // --- Internals ----------------------------------------------------------

  /** `exact: true` is load-bearing: without it day 2 also matches 12 and 20-29.
   * No month-navigation control was recorded, so this cannot cross months. */
  private async chooseDay(dayOfMonth: number): Promise<void> {
    await this.page.getByRole('gridcell', { name: String(dayOfMonth), exact: true }).click();
  }
}

/**
 * Clicks something that may or may not appear, without a fixed wait.
 *
 * `locator.isVisible()` is the obvious way to write this and it is wrong: it
 * returns immediately and its `timeout` option is explicitly ignored, so a
 * dialog that takes 50ms to render is missed and the next step fails somewhere
 * unrelated. `expect().toBeVisible()` polls properly, and catching its
 * rejection is what makes the element optional rather than required.
 */
async function clickIfItAppears(target: Locator, timeout = 8_000): Promise<boolean> {
  if (!(await appearsWithin(target, timeout))) return false;
  await target.click();
  return true;
}
