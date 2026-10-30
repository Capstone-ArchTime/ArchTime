import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import DiagramSvg from './DiagramSvg';
import type { DiagramSvgProps } from './DiagramSvg';
import type { ArchitectureView } from '@/features/architecture/types';
import { MIN_PNG_SCALE, captionHeight, pngScale, standaloneHtml } from '@/features/architecture/export-file';
import { downloadText } from '@/features/download';

type StaticProps = Pick<DiagramSvgProps, 'scene' | 'layout' | 'theme' | 'title' | 'caption'>;

export { standaloneHtml };

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

export async function svgToPng(svg: string, width: number, height: number, background: string, preferredScale = 2): Promise<Blob> {
  const scale = pngScale(width, height, preferredScale);
  if (scale < MIN_PNG_SCALE) throw new Error('This diagram is too large for a PNG image. Export it as SVG instead.');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The diagram could not be rendered to an image.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The browser could not create the PNG (the diagram may be too large).'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type ExportFormat = 'svg' | 'png' | 'html' | 'json';
/**
 * `fileBase` names the file (no extension); the title and subtitle drawn in the image come from `props.caption`.
 * Neither is taken from the view's own title, which is the commit title.
 */
export async function exportDiagram(format: ExportFormat, props: StaticProps, view: ArchitectureView, background: string, fileBase: string) {
  if (format === 'json') { downloadText(`${fileBase}.json`, JSON.stringify(view, null, 2)); return; }
  const svg = await diagramSvg(props);
  if (format === 'svg') downloadText(`${fileBase}.svg`, svg, 'image/svg+xml');
  else if (format === 'html') downloadText(`${fileBase}.html`, standaloneHtml(svg, view, background, [props.caption?.title ?? props.title, props.caption?.subtitle].filter(Boolean).join(' · ')), 'text/html');
  else downloadBlob(`${fileBase}.png`, await svgToPng(svg, props.layout.width, props.layout.height + captionHeight(props.caption), background));
}
