/**
 * Money normalization for cross-view comparisons.
 *
 * The same amount is rendered differently depending on where the app shows it:
 * `$1,200.00` on an order, `1200` in a table cell, `1,200.0` in an export.
 * Comparing those as strings produces failures that are about formatting
 * rather than about the product. These helpers reduce a displayed amount to an
 * exact integer number of cents so the comparison is about the value.
 *
 * Cents, not floats: `0.1 + 0.2` is the classic reason a rate of `1200.30`
 * compares unequal to itself after a round trip. Parsing is done on the digit
 * strings, so no binary floating point is involved until the caller asks for
 * it.
 *
 * Unparseable input throws rather than returning 0. A helper that quietly
 * turns "N/A" or an empty cell into zero would let "invoice amount equals
 * order rate" pass while both were blank, which is the exact bug this suite
 * exists to catch.
 */

/** Thrown when a value cannot be read as an amount of money. */
export class MoneyParseError extends Error {
  /** The value as it was displayed, kept for the failure message. */
  readonly raw: unknown;

  // Written out rather than declared as a constructor parameter property, so
  // the file stays type-strippable and runs under plain `node` as well as
  // through Playwright's transpiler.
  constructor(raw: unknown, detail: string) {
    super(`Cannot read ${JSON.stringify(raw)} as a money value: ${detail}`);
    this.name = 'MoneyParseError';
    this.raw = raw;
  }
}

/**
 * Characters that carry no value: whitespace (`\s` covers the non-breaking
 * and narrow spaces some tables use), currency symbols, and currency codes
 * such as `USD`, which the letter range removes.
 */
const NOISE = /[\s$€£¥₹A-Za-z]/g;

/**
 * Parses a displayed amount into an exact integer number of cents.
 *
 * Handles the shapes a TMS is likely to render:
 * `$1,200.00`, `1200`, `1,200.0`, `USD 1 200.00`, `-$50.25`, `($50.25)`,
 * `50.25-`. Parentheses and a leading or trailing minus all mean negative.
 *
 * Separator convention: when both `.` and `,` appear, whichever comes last is
 * the decimal separator and the other is grouping - that reads `1,200.00` and
 * `1.200,00` correctly without needing a locale. When only a comma appears it
 * is a decimal separator if exactly two digits follow it at the end
 * (`1,50`), and grouping otherwise (`1,200`). A lone `.` is a decimal point,
 * which is the US convention this app under test uses.
 *
 * Fractions longer than two digits are rounded half-up, away from zero.
 *
 * @throws MoneyParseError if the value is empty, or holds no digits.
 */
export function toCents(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new MoneyParseError(raw, 'not a finite number');
    }
    // Through the same digit-string path as displayed values, so the two entry
    // points agree. `Math.round(raw * 100)` looks equivalent and is not: it
    // rounds half toward +Infinity on a float, making toCents(1.005) 100 while
    // toCents('1.005') is 101.
    return toCents(raw.toFixed(3));
  }
  if (raw === null || raw === undefined) {
    throw new MoneyParseError(raw, 'value is missing');
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new MoneyParseError(raw, 'value is empty');
  }

  // Parentheses are an accounting negative and must be read before the noise
  // strip removes them.
  const parenthesized = /^\(.*\)$/.test(trimmed);

  let body = trimmed.replace(NOISE, '');

  const trailingMinus = body.endsWith('-');
  if (trailingMinus) {
    body = body.slice(0, -1);
  }
  const leadingMinus = body.startsWith('-') || body.startsWith('−');
  if (leadingMinus) {
    body = body.slice(1);
  }
  body = body.replace(/[()+]/g, '');

  if (!/[0-9]/.test(body)) {
    throw new MoneyParseError(raw, 'contains no digits');
  }
  if (/[^0-9.,]/.test(body)) {
    throw new MoneyParseError(raw, 'contains characters that are not part of a number');
  }

  const negative = parenthesized || leadingMinus || trailingMinus;
  const { whole, fraction } = splitOnDecimalSeparator(body, raw);

  const wholeDigits = digitsOfWholePart(whole, raw);

  const magnitude = BigInt(wholeDigits === '' ? '0' : wholeDigits) * 100n + roundToCents(fraction, raw);
  const cents = Number(negative ? -magnitude : magnitude);

  if (!Number.isSafeInteger(cents)) {
    throw new MoneyParseError(raw, 'value is too large to compare exactly');
  }
  return cents;
}

/**
 * Strips grouping separators from the whole part, rejecting anything that is
 * not grouped in thousands.
 *
 * Worth being strict here: with the separators simply deleted, `1.2.3` would
 * read as `123` and a garbled cell would compare equal to a real amount. A
 * value this helper cannot explain is a failure, not a number.
 */
function digitsOfWholePart(whole: string, raw: unknown): string {
  if (/^[0-9]*$/.test(whole)) {
    return whole;
  }

  const separators = new Set(whole.match(/[.,]/g) ?? []);
  if (separators.size !== 1) {
    throw new MoneyParseError(raw, 'mixes grouping separators');
  }
  const separator = [...separators][0] === '.' ? '\\.' : ',';
  if (!new RegExp(`^[0-9]{1,3}(${separator}[0-9]{3})+$`).test(whole)) {
    throw new MoneyParseError(raw, 'grouping separators are not in thousands positions');
  }
  return whole.replace(/[.,]/g, '');
}

/** Splits the numeric body into its whole and fractional parts. */
function splitOnDecimalSeparator(body: string, raw: unknown): { whole: string; fraction: string } {
  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');

  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0) {
    decimalAt = body.indexOf('.') === lastDot ? lastDot : -1; // several dots means grouping
  } else if (lastComma >= 0) {
    // A single comma with exactly two trailing digits is a decimal comma;
    // anything else is grouping.
    decimalAt = body.indexOf(',') === lastComma && /,\d{2}$/.test(body) ? lastComma : -1;
  }

  if (decimalAt < 0) {
    return { whole: body, fraction: '' };
  }

  const fraction = body.slice(decimalAt + 1);
  if (/[.,]/.test(fraction)) {
    throw new MoneyParseError(raw, 'more than one decimal separator');
  }
  return { whole: body.slice(0, decimalAt), fraction };
}

/** Turns a fraction digit string into cents, rounding half-up. */
function roundToCents(fraction: string, raw: unknown): bigint {
  if (fraction === '') {
    return 0n;
  }
  if (!/^[0-9]+$/.test(fraction)) {
    throw new MoneyParseError(raw, 'malformed decimal part');
  }
  const padded = fraction.padEnd(3, '0');
  const cents = BigInt(padded.slice(0, 2));
  const next = Number(padded[2]);
  return next >= 5 ? cents + 1n : cents;
}

/**
 * Canonical `1200.00` form, for assertion messages and for comparing with
 * `toEqual`. Always two decimals, no symbol, no grouping.
 */
export function normalizeMoney(raw: string | number | null | undefined): string {
  return formatCents(toCents(raw));
}

/** Renders cents back as `-1200.00`. Internal to normalizeMoney. */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const magnitude = Math.abs(cents);
  return `${sign}${Math.trunc(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`;
}

