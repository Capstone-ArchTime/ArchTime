export function paginate<T>(items: readonly T[], requestedPage: number, requestedSize: number) {
  const pageSize = Number.isFinite(requestedSize) ? Math.max(1, Math.floor(requestedSize)) : 10;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Number.isFinite(requestedPage) ? Math.max(1, Math.min(pages, Math.floor(requestedPage))) : 1;
  return { items: items.slice((current - 1) * pageSize, current * pageSize), current, pageSize, total: items.length };
}
