// Class names shared by the administrators' console pages, following DESIGN.md (frost look). They paint only with the
// --at-* variables, so they read correctly in either theme.
import { featurePanel } from '@/components/FeaturePage';

/** Card and section titles: the Title style (20px, bold). */
export const sectionTitle = 'text-xl font-bold leading-tight';
/** Small captions over figures and fields: the Label style (11px, semibold, spaced-out capitals). */
export const statLabel = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--at-muted)]';
/** A stat card: a glass panel with the roomier 24px padding. */
export const statCard = featurePanel.replace('p-5', 'p-6');
/** A panel inside a panel: Glass Raised. */
export const nestedPanel = 'border border-[var(--at-line)] bg-[var(--at-panel-2)] p-4';
/** Glass frame around a table that sits straight on the page. */
export const tablePanel = featurePanel.replace('p-5', 'p-2 sm:p-3');
/** Secondary pill link: glass, ice-link text, a brighter edge on hover. */
export const pillLink = 'inline-flex items-center gap-1 rounded-full border border-[var(--at-line)] px-4 py-2 text-sm text-[var(--at-link)] transition-colors hover:border-[var(--at-link)] hover:bg-[var(--at-panel-2)] hover:text-[var(--at-link-hover)]';
/** Provider marks: pale ice tones instead of saturated hues (The Ice, Not Neon Rule). */
export const providerDot = (provider: string) => `inline-block h-2 w-2 shrink-0 rounded-full ${provider === 'anthropic' ? 'bg-[var(--at-link)]' : provider === 'gemini' ? 'bg-[var(--at-accent)]' : 'bg-[var(--at-muted)]'}`;
