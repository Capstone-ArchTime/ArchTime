import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import DiagramSvg from './DiagramSvg';
import type { DiagramSvgProps } from './DiagramSvg';
import type { ArchitectureView } from '@/features/architecture/types';
import { downloadText } from '@/features/download';

type StaticProps = Pick<DiagramSvgProps, 'scene' | 'layout' | 'theme' | 'title'>;

/**
 * Renders the whole diagram with no viewer state (no dimming, focus or selection) into a detached node and
 * serializes it as a standalone SVG document. (react-dom/server is avoided: it would bloat the shared React chunk.)
 */
export async function diagramSvg(props: StaticProps): Promise<string> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden';
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(DiagramSvg, { ...props, interactive: false, showWeights: true, idPrefix: 'export' })));
    const svg = host.querySelector('svg');
    if (!svg) throw new Error('The diagram could not be rendered.');
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}\n`;
  } finally {
    root.unmount();
    host.remove();
  }
}

export const safeName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'architecture';

export async function svgToPng(svg: string, width: number, height: number, background: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The diagram could not be rendered to an image.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG export failed.'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One self-contained file: the diagram plus the verified data it was drawn from. */
export function standaloneHtml(svg: string, view: ArchitectureView, background: string): string {
  const svgBody = svg.replace(/^<\?xml[^>]*\?>\s*/, '');
  const data = JSON.stringify(view).replace(/</g, '\\u003c');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(view.title)}</title>\n<style>body{margin:0;background:${background};font-family:Inter,system-ui,sans-serif}main{overflow:auto;padding:16px}svg{max-width:none;height:auto}</style></head>\n<body><main>${svgBody}</main>\n<script type="application/json" id="archtime-view">${data}</script></body></html>\n`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportFormat = 'svg' | 'png' | 'html' | 'json';
export async function exportDiagram(format: ExportFormat, props: StaticProps, view: ArchitectureView, background: string) {
  const base = safeName(props.title);
  if (format === 'json') { downloadText(`${base}.json`, JSON.stringify(view, null, 2)); return; }
  const svg = await diagramSvg(props);
  if (format === 'svg') downloadText(`${base}.svg`, svg, 'image/svg+xml');
  else if (format === 'html') downloadText(`${base}.html`, standaloneHtml(svg, view, background), 'text/html');
  else downloadBlob(`${base}.png`, await svgToPng(svg, props.layout.width, props.layout.height, background));
}
