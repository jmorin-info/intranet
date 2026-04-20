/**
 * Defensive validation helpers for query-param → Prisma enum/pagination mapping.
 *
 * Prevents Prisma crashes when a raw query-string value is passed directly to
 * a `where` clause that expects a strict enum value (e.g. `status: 'OPEN,IN_PROGRESS'`).
 *
 * ISO 27001 A.8.26 — Input validation applied at the service boundary.
 */

/**
 * Validate a single string value against a set of allowed enum values.
 * Returns the value if valid, otherwise `undefined`.
 */
export function validateEnum<T extends string>(
  value: string | undefined | null,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Parse a potentially comma-separated string filter into a Prisma-compatible
 * enum filter. Returns:
 *   - `undefined`       if no valid value remains after filtering
 *   - `value`           (single string) when exactly one valid value
 *   - `{ in: [...] }`   when multiple valid values
 */
export function parseEnumFilter<T extends string>(
  value: string | undefined | null,
  allowed: readonly T[],
): T | { in: T[] } | undefined {
  if (!value) return undefined;

  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return { in: parts };
}

/**
 * Safe parseInt with a guaranteed numeric fallback.
 * Returns `defaultValue` when the input is undefined, empty, or NaN.
 */
export function safeParseInt(
  value: string | undefined | null,
  defaultValue: number,
): number {
  if (value === undefined || value === null || value === '') return defaultValue;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : defaultValue;
}
