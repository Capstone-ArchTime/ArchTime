const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const JS_TO_TS: Record<string, string[]> = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };

/**
 * Maps an import specifier (already joined with the importing file's folder) to a file in the snapshot.
 * Handles extension-less imports, directory indexes and TypeScript's habit of writing `./x.js` for `x.ts`.
 * Returns null for anything that is not a file of the repository (npm packages, built-ins).
 */
export function resolveImportTarget(files: ReadonlySet<string>, target: string): string | null {
  const base = target.replace(/\/+$/, '');
  if (files.has(base)) return base;
  const ext = /\.[a-z]+$/i.exec(base)?.[0].toLowerCase();
  const stem = ext && JS_TO_TS[ext] ? base.slice(0, -ext.length) : null;
  if (stem) for (const alt of JS_TO_TS[ext!]) if (files.has(stem + alt)) return stem + alt;
  for (const e of SOURCE_EXTENSIONS) if (files.has(base + e)) return base + e;
  for (const e of SOURCE_EXTENSIONS) if (files.has(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}
