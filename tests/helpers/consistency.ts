/**
 * Cross-view consistency checking.
 *
 * The interesting bugs in an order -> invoicing workflow are rarely "the page
 * failed to load" - they are the same record reading differently depending on
 * where you look at it: a total that is right on the order but stale on the
 * invoice, a status that never propagated to the list view. These helpers take
 * readings of one record from several views and fail with a message that names
 * the view that disagreed, so the report says what is wrong rather than just
 * that something is.
 */

/** A snapshot of one record as displayed by a single view. */
export interface ViewReading {
  /** Human-readable name of where this was read, e.g. 'Invoice detail'. */
  view: string;
  /** Field name -> value as displayed. Missing/absent fields may be null. */
  values: Readonly<Record<string, string | number | null | undefined>>;
}

export interface ConsistencyOptions {
  /**
   * Only compare these fields. Defaults to every field present in any reading,
   * which also catches a field one view renders and another silently drops.
   */
  fields?: readonly string[];
  /** Label for the record under test, included in the failure message. */
  recordLabel?: string;
}

/** One field on which the views did not agree. */
export interface Discrepancy {
  field: string;
  /** Normalized value -> the views that displayed it. */
  groups: Array<{ normalized: string; raw: string[]; views: string[] }>;
}

const MISSING = '<missing>';

/**
 * Collapses display formatting that carries no meaning.
 *
 * Currency and numeric text has `$`, thousands separators and whitespace
 * stripped, then compares numerically - so `$1,200.00`, `1200`, and `1 200.00`
 * are the same value, and `(1,200.00)` is -1200. Everything else only has its
 * whitespace collapsed; case and punctuation are preserved, because
 * `Delivered` vs `delivered` in two views is a real inconsistency worth seeing.
 */
export function normalizeValue(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return MISSING;

  // Non-breaking spaces are common in currency-formatted table cells.
  const text = String(raw).replace(/\u00a0/g, ' ').trim();
  if (text === '') return MISSING;

  const stripped = text.replace(/[$,\s]/g, '');
  const parenthesized = /^\((.+)\)$/.exec(stripped);
  const candidate = parenthesized ? `-${parenthesized[1]}` : stripped;

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(candidate)) {
    const asNumber = Number(candidate);
    if (Number.isFinite(asNumber)) return String(asNumber);
  }

  return text.replace(/\s+/g, ' ');
}

/**
 * Compares readings without throwing. Useful when a test wants to report every
 * inconsistency it can find rather than stopping at the first.
 */
export function findDiscrepancies(
  readings: readonly ViewReading[],
  options: ConsistencyOptions = {},
): Discrepancy[] {
  if (readings.length < 2) {
    throw new Error(
      `Cross-view comparison needs at least 2 readings, got ${readings.length}. ` +
        'Read the record from a second view before comparing.',
    );
  }

  const duplicateView = readings
    .map((r) => r.view)
    .find((view, i, all) => all.indexOf(view) !== i);
  if (duplicateView) {
    throw new Error(
      `Two readings share the view name "${duplicateView}". View names must be ` +
        'unique, otherwise the failure message cannot say which one disagreed.',
    );
  }

  const fields =
    options.fields ?? [...new Set(readings.flatMap((r) => Object.keys(r.values)))];

  const discrepancies: Discrepancy[] = [];

  for (const field of fields) {
    const byNormalized = new Map<string, { raw: string[]; views: string[] }>();

    for (const reading of readings) {
      const rawValue = reading.values[field];
      const normalized = normalizeValue(rawValue);
      const group = byNormalized.get(normalized) ?? { raw: [], views: [] };
      group.raw.push(rawValue === null || rawValue === undefined ? MISSING : String(rawValue));
      group.views.push(reading.view);
      byNormalized.set(normalized, group);
    }

    if (byNormalized.size > 1) {
      discrepancies.push({
        field,
        groups: [...byNormalized].map(([normalized, group]) => ({
          normalized,
          raw: [...new Set(group.raw)],
          views: group.views,
        })),
      });
    }
  }

  return discrepancies;
}

/**
 * Throws if the same record reads differently in any of the given views.
 *
 * @example
 * assertConsistentAcrossViews([
 *   { view: 'Order detail', values: { total: '$1,200.00', status: 'Invoiced' } },
 *   { view: 'Invoice list', values: { total: '1200', status: 'Invoiced' } },
 * ], { recordLabel: orderRef });
 */
export function assertConsistentAcrossViews(
  readings: readonly ViewReading[],
  options: ConsistencyOptions = {},
): void {
  const discrepancies = findDiscrepancies(readings, options);
  if (discrepancies.length === 0) return;

  throw new Error(formatDiscrepancies(discrepancies, readings, options.recordLabel));
}

/** Builds the failure message. Exported so tests can attach it to a report. */
export function formatDiscrepancies(
  discrepancies: readonly Discrepancy[],
  readings: readonly ViewReading[],
  recordLabel?: string,
): string {
  const subject = recordLabel ? `record ${recordLabel}` : 'record';
  const viewList = readings.map((r) => r.view).join(', ');

  const lines: string[] = [
    `Cross-view inconsistency for ${subject}: ` +
      `${discrepancies.length} field(s) disagree across ${readings.length} views (${viewList}).`,
  ];

  for (const { field, groups } of discrepancies) {
    // Point at the odd one out when there is exactly one, which is the common
    // case: n-1 views agree and one is stale or wrong.
    const sorted = [...groups].sort((a, b) => b.views.length - a.views.length);
    const majority = sorted[0];
    if (!majority) continue; // Unreachable: a discrepancy always has >= 2 groups.
    const rest = sorted.slice(1);
    const lone = rest.length === 1 ? rest[0] : undefined;
    const singleOutlier =
      lone && lone.views.length === 1 && majority.views.length > 1 ? lone.views[0] : undefined;

    lines.push('');
    lines.push(
      singleOutlier
        ? `  "${field}": ${singleOutlier} disagreed with the other ${majority.views.length} view(s).`
        : `  "${field}": views split ${sorted.length} ways.`,
    );

    for (const group of sorted) {
      const raw = group.raw.join(' / ');
      const shown = raw === group.normalized ? raw : `${raw}  (normalized: ${group.normalized})`;
      lines.push(`    ${shown}  <- ${group.views.join(', ')}`);
    }
  }

  return lines.join('\n');
}
