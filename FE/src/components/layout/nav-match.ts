/**
 * The navigation item a page belongs to: the item for exactly that path, else the one with the longest path the page is
 * inside (so /learning/abc/def belongs to /learning), else none. A path only counts as a parent at a "/" boundary, so
 * /project is not inside /projects.
 */
export function matchNavItem<T extends { path: string }>(items: readonly T[], pathname: string): T | undefined {
  const exact = items.find(item => item.path === pathname);
  if (exact) return exact;
  return items
    .filter(item => pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
