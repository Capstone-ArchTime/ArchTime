import type { ArchitectureView } from './types.ts';

// Names and text of what the Architecture Map exports (SVG, PNG, HTML, JSON). A view's own title is the commit title
// ("Merge pull request #44 from ..."), which says nothing about what the picture shows, so files and image titles are
// built from the workspace, the snapshot and the day instead.

export interface ExportMeta {
  /** Workspace name, or the sample's name. */
  workspace?: string;
  /** Snapshot (commit) hash; absent for samples. */
  hash?: string;
  /** The snapshot's date (ISO). When absent or invalid the day of the export is used. */
  date?: string;
  /** Full commit message; only its first line is used, and only as a subtitle. */
  commitTitle?: string;
  /** Name of the component whose inside is drawn, when the inner view is open. */
  detail?: string;
  sample?: boolean;
}

const FILE_BASE_MAX = 80;
const TITLE_MAX = 90;
const SUBTITLE_MAX = 72;

/** Lower-case ASCII with dashes: accents are dropped (Vietnamese included), anything else unsafe in a file name goes. */
export function slug(text: string, max = 40): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, max).replace(/-+$/g, '');
}

/** "2026-10-28" from the snapshot's own ISO text (no time zone shifts it), else from a real date, else the day of export. */
export function isoDay(date: string | undefined, now: Date): string {
  const own = date && /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(date.trim());
  if (own && Number.isFinite(Date.parse(own[1]))) return own[1];
  const parsed = date ? new Date(date) : null;
  return (parsed && Number.isFinite(parsed.getTime()) ? parsed : now).toISOString().slice(0, 10);
}

const shortHash = (hash?: string) => (hash ? hash.replace(/[^A-Za-z0-9]/g, '').slice(0, 7).toLowerCase() : '');
const clean = (text: string) => [...text].map(ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim();
const ellipsis = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text);

/** "shop-backend-a1b2c3d-2026-10-28" (samples: "shophub-sample-2026-10-30"; inner view: "...-inside-order-service"). No extension. */
export function exportFileBase(meta: ExportMeta, now: Date = new Date()): string {
  const detail = meta.detail ? slug(meta.detail, 24) : '';
  const tail = [shortHash(meta.hash) || (meta.sample ? 'sample' : ''), isoDay(meta.date, now), ...(detail ? ['inside', detail] : [])].filter(Boolean).join('-');
  // The workspace gives way first, so the snapshot and the day that identify the file are never cut off.
  const name = slug(meta.workspace ?? '', Math.min(40, Math.max(8, FILE_BASE_MAX - tail.length - 1))) || 'architecture';
  return `${name}-${tail}`;
}

/** "Shop Backend · a1b2c3d · 2026-10-28" with the commit's first line as a subtitle when it fits. */
export function exportCaption(meta: ExportMeta, now: Date = new Date()): { title: string; subtitle?: string } {
  const tail = [shortHash(meta.hash) || (meta.sample ? 'Sample' : ''), isoDay(meta.date, now), ...(meta.detail ? [`inside ${ellipsis(clean(meta.detail), 32)}`] : [])].filter(Boolean);
  const fixed = tail.join(' · ').length + 3;
  const name = ellipsis(clean(meta.workspace ?? ''), Math.max(12, Math.min(48, TITLE_MAX - fixed))) || 'Architecture';
  const title = [name, ...tail].join(' · ');
  const first = clean((meta.commitTitle ?? '').split('\n')[0]);
  return first && first.length <= SUBTITLE_MAX ? { title, subtitle: first } : { title };
}

/** Height of the band an export adds above the diagram for its caption: none without one, taller with a subtitle. */
export const captionHeight = (caption?: { subtitle?: string } | null) => (caption ? (caption.subtitle ? 58 : 40) : 0);

/** Browsers refuse canvases past about 16k pixels a side or very many pixels; shrink the PNG to stay inside, never enlarge. */
export const MIN_PNG_SCALE = 0.25;
export function pngScale(width: number, height: number, preferred = 2, maxSide = 16384, maxPixels = 64_000_000): number {
  if (!(width > 0) || !(height > 0)) return preferred;
  return Math.min(preferred, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** One self-contained file: the diagram plus the verified data it was drawn from. */
export function standaloneHtml(svg: string, view: ArchitectureView, background: string, title = view.title): string {
  const svgBody = svg.replace(/^<\?xml[^>]*\?>\s*/, '');
  // "<" is escaped so no text in the data can close the script; U+2028/2029 are escaped for older engines.
  const data = JSON.stringify(view).replace(/</g, '\\u003c');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>\n<style>body{margin:0;background:${escapeHtml(background)};font-family:Inter,system-ui,sans-serif}main{overflow:auto;padding:16px}svg{max-width:none;height:auto}</style></head>\n<body><main>${svgBody}</main>\n<script type="application/json" id="archtime-view">${data}</script></body></html>\n`;
}
