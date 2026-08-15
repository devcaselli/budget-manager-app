/**
 * Exhaustiveness guard for `switch` statements over a union/discriminated type.
 * Placing `default: assertNever(value)` in a switch's default branch makes
 * TypeScript raise a compile error the moment a new union member is added and
 * left unhandled — `value` can only type-check as `never` once every other
 * case has narrowed it away.
 *
 * Throws at runtime only if an unnarrowed value somehow reaches here (e.g. a
 * value crossing an `any`/unsafe-cast boundary) — a defensive backstop, not
 * the primary purpose of this function.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled union member: ${JSON.stringify(value)}`);
}
