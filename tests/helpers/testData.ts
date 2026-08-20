/**
 * Identifiers for records the suite creates.
 *
 * Every record a test creates gets a tagged, unique name so it is obvious in
 * the app's UI that it came from automation, and so a failed run leaves a
 * traceable trail instead of anonymous junk. The timestamp makes the id sortable
 * and tells you when it was created.
 */

/** Marks a record as test-generated. Searchable in the app under test. */
export const ID_PREFIX = 'EM-';

let sequence = 0;

/** UTC, compact and sortable: 20260819-190812 */
function timestamp(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/**
 * A unique identifier for one record, e.g. `EM-20260819-190812-w0-1`.
 *
 * Unique across a parallel run: the worker index disambiguates two workers that
 * land in the same second, and the counter disambiguates within a worker.
 *
 * @param label optional short suffix to say what the record is, e.g. 'order'.
 */
export function uniqueId(label?: string): string {
  sequence += 1;
  const worker = process.env.TEST_WORKER_INDEX ?? '0';
  const suffix = label ? `-${label}` : '';
  return `${ID_PREFIX}${timestamp()}-w${worker}-${sequence}${suffix}`;
}

/**
 * Identifier shared by everything one worker creates, useful for grouping or
 * cleanup. Note this is per worker process, not per run - if a single id for
 * the whole run is needed, set it once in a globalSetup and read it from env.
 */
export const RUN_ID = `${ID_PREFIX}${timestamp()}-w${process.env.TEST_WORKER_INDEX ?? '0'}`;

/** True if a value looks like something this suite created. */
export function isTestGenerated(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().startsWith(ID_PREFIX);
}
