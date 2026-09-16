/**
 * Stands in for `next/cache` under `pnpm test`.
 *
 * A server action's cache invalidation is a framework concern; the action's
 * parsing and writes are not, and they are the part worth testing. See
 * test-loader.mjs.
 */
export function refresh() {}
export function revalidatePath() {}
export function revalidateTag() {}
