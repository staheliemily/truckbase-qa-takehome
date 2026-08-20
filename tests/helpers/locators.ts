/** Escapes a value for embedding in a locator regex, so `.` and `+` in a
 * reference cannot change what the pattern matches. */
export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
