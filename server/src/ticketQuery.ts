// Issue 2-5 (Lab 2) — BR-17: pagination never errors on a bad `page`/`pageSize`, it clamps to a
// safe default instead (api-spec.md §4).
export function clampPage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

const ALLOWED_PAGE_SIZES = [10, 25, 50];

export function clampPageSize(raw: unknown): number {
  const n = Number(raw);
  return ALLOWED_PAGE_SIZES.includes(n) ? n : 10;
}
