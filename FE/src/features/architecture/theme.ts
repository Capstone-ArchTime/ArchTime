import type { ComponentRole, Provenance } from './types.ts';

export interface DiagramTheme {
  name: 'dark' | 'light';
  background: string;
  card: string;
  cardStroke: string;
  text: string;
  muted: string;
  edge: string;
  edgeDim: string;
  cycle: string;
  route: string;
  focus: string;
  badgeFill: string;
  role: Record<ComponentRole, string>;
  tag: Record<Provenance, string>;
  sans: string;
  mono: string;
}

const sans = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const mono = '"JetBrains Mono", ui-monospace, Menlo, monospace';

export const DARK: DiagramTheme = {
  name: 'dark', background: '#080b0e', card: '#11161b', cardStroke: '#2a3441', text: '#f4f4f6', muted: '#94a3b8', edge: '#5b7186', edgeDim: '#27303a',
  cycle: '#ef4444', route: '#f59e0b', focus: '#3b82f6', badgeFill: '#161d24',
  role: { controller: '#3b82f6', service: '#a78bfa', repository: '#34d399', entity: '#fbbf24', gateway: '#fb7185', config: '#94a3b8', util: '#60a5fa', external: '#fb923c', other: '#64748b' },
  tag: { FACT: '#22c55e', INFERENCE: '#f59e0b', UNKNOWN: '#94a3b8' }, sans, mono,
};

export const LIGHT: DiagramTheme = {
  name: 'light', background: '#ffffff', card: '#f8fafc', cardStroke: '#cbd5e1', text: '#0f172a', muted: '#475569', edge: '#64748b', edgeDim: '#e2e8f0',
  cycle: '#dc2626', route: '#d97706', focus: '#0284c7', badgeFill: '#e2e8f0',
  role: { controller: '#0284c7', service: '#7c3aed', repository: '#059669', entity: '#b45309', gateway: '#e11d48', config: '#475569', util: '#0369a1', external: '#c2410c', other: '#475569' },
  tag: { FACT: '#15803d', INFERENCE: '#b45309', UNKNOWN: '#475569' }, sans, mono,
};

/** The dark diagram inside the developer-analyst "frost" look: misty slate, light edges, softer role colours. */
export const FROST: DiagramTheme = {
  name: 'dark', background: '#1d242a', card: '#273038', cardStroke: '#5a6773', text: '#eef2f8', muted: '#b4c0ce', edge: '#8a9aac', edgeDim: '#38424c',
  cycle: '#f87171', route: '#f0c27e', focus: '#e4eaf5', badgeFill: '#2f3943',
  role: { controller: '#9db3dc', service: '#bca9f2', repository: '#7fd8b6', entity: '#f0cf7a', gateway: '#f39aac', config: '#b4c0ce', util: '#a9c6ee', external: '#f2b083', other: '#8f9cab' },
  tag: { FACT: '#86efac', INFERENCE: '#f0c27e', UNKNOWN: '#b4c0ce' }, sans: '"Montserrat", system-ui, sans-serif', mono,
};

export const THEMES = { dark: DARK, light: LIGHT } as const;
