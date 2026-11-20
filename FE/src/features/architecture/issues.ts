import { cycles } from './queries.ts';
import { ROLE_LABEL } from './scene.ts';
import type { RefineReceipt, ViewQuality } from './api.ts';
import type { ArchitectureView, ValidationIssue } from './types.ts';
import { message } from '../../i18n/define.ts';
import { translateOr } from '../../i18n/index.ts';
import { ISSUE_TEXT } from './issue-messages.ts';

const t = (key: Parameters<typeof message<typeof ISSUE_TEXT.en>>[1], params?: Record<string, string | number>) => message(ISSUE_TEXT, key, params);
/** A component role in the page language (ROLE_LABEL keeps the English names). */
const roleName = (role: keyof typeof ROLE_LABEL) => translateOr(`archRole.${role}`, ROLE_LABEL[role]);

// What is wrong with an architecture view, and what to do about it, in plain words. Built only from data the view
// already carries (the measures of BE/src/domain/architecture/quality.ts, the verifier's warnings, the layout check and
// the mapping's state); nothing here is guessed by a model, so the same data always gives the same text.

export type IssueSeverity = 'high' | 'medium' | 'low';
export type IssueType =
  | 'cycle' | 'upward' | 'upward-more' | 'deviation' | 'drift' | 'ungrounded' | 'unbalanced' | 'stale' | 'layout'
  | 'view-warning' | 'ai-fallback' | 'ai-notes' | 'no-reference';
/** A problem is counted and coloured; a hint only suggests a next step and never counts as an issue. */
export type IssueKind = 'problem' | 'hint';
/** Buttons an issue card can offer on top of "Show in diagram"; the page decides what they do. */
export type IssueAction = 'set-reference' | 'regenerate';

export interface Issue {
  id: string;
  type: IssueType;
  kind: IssueKind;
  severity: IssueSeverity;
  title: string;
  /** What it means. */
  explanation: string;
  /** A concrete next step. */
  suggestion: string;
  /** Component ids to highlight. */
  components: string[];
  edges: string[];
  action?: IssueAction;
}

export interface IssueInput {
  view: Pick<ArchitectureView, 'components' | 'edges'>;
  /** Absent for samples and older servers: then only what the view itself shows (loops, warnings) is reported. */
  quality?: ViewQuality | null;
  /** The verifier's warnings (errors stop the view from being drawn at all). */
  warnings?: ValidationIssue[];
  layoutIssues?: ValidationIssue[];
  /** The snapshot changed after the components were made. */
  stale?: boolean;
  receipt?: Pick<RefineReceipt, 'accepted' | 'fallbackReason' | 'notes'> | null;
  /** The person may regenerate the components and edit the reference architecture. */
  canEdit?: boolean;
}

/** Where a measure turns into a finding. Scores are 0..1, higher is better. */
export const THRESHOLDS = {
  /** Agreement with the reference architecture: below `high` is a clear deviation, below `medium` a visible one. */
  agreementHigh: 0.5, agreementMedium: 0.8,
  /** Agreement with the previous snapshot. */
  stabilityMedium: 0.5, stabilityLow: 0.8,
  /** Share of names the paths support; below this it is a pattern, not a slip. */
  groundingMedium: 0.5,
  /** Below this most dependencies between layers point the wrong way. */
  layeringHigh: 0.5,
  balanceLow: 0.5,
  /** Upward dependencies listed one by one; the rest are rolled into a single card. */
  upwardListed: 5,
} as const;

const RANK: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
const TYPE_ORDER: IssueType[] = ['cycle', 'deviation', 'upward', 'upward-more', 'ungrounded', 'stale', 'drift', 'unbalanced', 'ai-fallback', 'view-warning', 'layout', 'ai-notes', 'no-reference'];

const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** "A, B and C", or "A, B, C and 2 more". */
export function nameList(names: string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return t('and', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] });
  const rest = names.length - max;
  return t('andMore', { first: names.slice(0, max).join(', '), rest });
}
const edgeId = (view: IssueInput['view'], source: string, target: string) => view.edges.find(e => e.source === source && e.target === target)?.id;

interface Draft { issue: Issue; magnitude: number }

export function issuesFor(input: IssueInput): Issue[] {
  const { view, quality, canEdit = false } = input;
  const byId = new Map(view.components.map(c => [c.id, c]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const drafts: Draft[] = [];
  const add = (issue: Omit<Issue, 'kind' | 'components' | 'edges'> & Partial<Pick<Issue, 'kind' | 'components' | 'edges'>>, magnitude = 0) =>
    drafts.push({ issue: { kind: 'problem', components: [], edges: [], ...issue }, magnitude });
  const maintainer = (yes: string, no: string) => (canEdit ? yes : no);

  // Dependency loops: from the server's measure when there is one, otherwise from the drawing itself.
  const loops = (quality ? quality.acyclicity.cycles : cycles(view.edges)).map(g => g.filter(id => byId.has(id))).filter(g => g.length > 1);
  for (const group of loops) {
    const inside = view.edges.filter(e => group.includes(e.source) && group.includes(e.target));
    const weakest = [...inside].sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id))[0];
    const names = group.map(name);
    add({
      id: `cycle:${[...group].sort().join('+')}`, type: 'cycle', severity: 'high',
      title: t('cycleTitle', { names: nameList(names) }),
      explanation: t('cycleExplanation', { names: nameList(names) }),
      suggestion: t('cycleSuggestion') + (weakest ? t('cycleWeakest', { from: name(weakest.source), to: name(weakest.target), weight: weakest.weight, deps: plural(weakest.weight, 'dependency', 'dependencies') }) : ''),
      components: group, edges: inside.map(e => e.id),
    }, group.length);
  }

  if (quality) {
    // Dependencies that point up the layers (a repository calling a controller).
    const violations = [...quality.layering.violations].filter(v => byId.has(v.source) && byId.has(v.target))
      .sort((a, b) => b.weight - a.weight || `${a.source}>${a.target}`.localeCompare(`${b.source}>${b.target}`));
    const upward: IssueSeverity = quality.layering.score < THRESHOLDS.layeringHigh ? 'high' : 'medium';
    for (const v of violations.slice(0, THRESHOLDS.upwardListed)) {
      const from = byId.get(v.source)!, to = byId.get(v.target)!;
      add({
        id: `upward:${v.source}>${v.target}`, type: 'upward', severity: upward,
        title: t('upwardTitle', { from: from.name, to: to.name }),
        explanation: t('upwardExplanation', { from: from.name, fromRole: roleName(from.role), to: to.name, toRole: roleName(to.role), weight: v.weight, deps: plural(v.weight, 'dependency', 'dependencies') }),
        suggestion: t('upwardSuggestion', { from: from.name, to: to.name }),
        components: [v.source, v.target], edges: [edgeId(view, v.source, v.target)].filter((x): x is string => !!x),
      }, v.weight);
    }
    const rest = violations.slice(THRESHOLDS.upwardListed);
    if (rest.length) {
      const weight = rest.reduce((n, v) => n + v.weight, 0);
      add({
        id: `upward-more:${rest.map(v => `${v.source}>${v.target}`).join(',')}`, type: 'upward-more', severity: upward,
        title: t('upwardMoreTitle', { n: rest.length, deps: plural(rest.length, 'dependency', 'dependencies') }),
        explanation: t('upwardMoreExplanation', { n: rest.length, arrows: plural(rest.length, 'arrow points', 'arrows point'), weight, deps: plural(weight, 'dependency', 'dependencies'), from: name(rest[0].source), to: name(rest[0].target) }),
        suggestion: t('upwardMoreSuggestion'),
        components: [...new Set(rest.flatMap(v => [v.source, v.target]))], edges: rest.map(v => edgeId(view, v.source, v.target)).filter((x): x is string => !!x),
      }, weight);
    }

    // Against the team's reference architecture, the intended design.
    const agreement = quality.agreement;
    if (agreement && agreement.score < THRESHOLDS.agreementMedium) {
      add({
        id: 'deviation', type: 'deviation', severity: agreement.score < THRESHOLDS.agreementHigh ? 'high' : 'medium',
        title: t('deviationTitle'),
        explanation: t('deviationExplanation', { pct: pct(agreement.score), common: agreement.common }),
        suggestion: maintainer(t('deviationSuggestionEdit'), t('deviationSuggestionView')),
        ...(canEdit ? { action: 'set-reference' as const } : {}),
      }, 1 - agreement.score);
    } else if (!agreement && canEdit) {
      add({
        id: 'no-reference', type: 'no-reference', kind: 'hint', severity: 'low',
        title: t('noReferenceTitle'),
        explanation: t('noReferenceExplanation'),
        suggestion: t('noReferenceSuggestion'),
        action: 'set-reference',
      });
    }

    // Against the previous snapshot.
    const stability = quality.stability;
    if (stability && stability.score < THRESHOLDS.stabilityLow) {
      add({
        id: 'drift', type: 'drift', severity: stability.score < THRESHOLDS.stabilityMedium ? 'medium' : 'low',
        title: t('driftTitle'),
        explanation: t('driftExplanation', { pct: pct(stability.score), common: stability.common }),
        suggestion: t('driftSuggestion'),
      }, 1 - stability.score);
    }

    // Names the paths do not support: possibly invented by a model, or too vague to check.
    const ungrounded = quality.grounding.ungrounded;
    if (ungrounded.length) {
      const named = new Set(ungrounded);
      const ids = view.components.filter(c => named.has(c.name)).map(c => c.id);
      add({
        id: `ungrounded:${[...ungrounded].sort().join('|')}`, type: 'ungrounded', severity: quality.grounding.score < THRESHOLDS.groundingMedium ? 'medium' : 'low',
        title: ungrounded.length === 1 ? t('ungroundedOne', { name: ungrounded[0] }) : t('ungroundedMany', { n: ungrounded.length }),
        explanation: t('ungroundedExplanation', { names: nameList(ungrounded.map(n => `"${n}"`)), has: plural(ungrounded.length, 'has', 'have'), nameWord: plural(ungrounded.length, 'name', 'names') }),
        suggestion: maintainer(t('ungroundedSuggestionEdit'), t('ungroundedSuggestionView')),
        components: ids, ...(canEdit ? { action: 'regenerate' as const } : {}),
      }, ungrounded.length);
    }

    // One component holding most of the files.
    const total = view.components.reduce((n, c) => n + c.memberIds.length, 0);
    const biggest = [...view.components].sort((a, b) => b.memberIds.length - a.memberIds.length || a.id.localeCompare(b.id))[0];
    if (quality.balance < THRESHOLDS.balanceLow && biggest && total > 0 && view.components.length > 1) {
      add({
        id: `unbalanced:${biggest.id}`, type: 'unbalanced', severity: 'low',
        title: t('unbalancedTitle', { name: biggest.name }),
        explanation: t('unbalancedExplanation', { name: biggest.name, pct: pct(biggest.memberIds.length / total), n: biggest.memberIds.length, total }),
        suggestion: t('unbalancedSuggestion', { name: biggest.name }),
        components: [biggest.id],
      }, 1 - quality.balance);
    }
  }

  if (input.stale) {
    add({
      id: 'stale', type: 'stale', severity: 'medium',
      title: t('staleTitle'),
      explanation: t('staleExplanation'),
      suggestion: maintainer(t('staleSuggestionEdit'), t('staleSuggestionView')),
      ...(canEdit ? { action: 'regenerate' as const } : {}),
    });
  }

  const receipt = input.receipt;
  if (receipt && !receipt.accepted) {
    add({
      id: 'ai-fallback', type: 'ai-fallback', severity: 'low',
      title: t('fallbackTitle'),
      explanation: t('fallbackExplanation', { reason: receipt.fallbackReason ?? t('fallbackNoAnswer') }),
      suggestion: maintainer(t('fallbackSuggestionEdit'), t('fallbackSuggestionView')),
    });
  } else if (receipt?.notes?.length) {
    add({
      id: 'ai-notes', type: 'ai-notes', kind: 'hint', severity: 'low',
      title: t('notesTitle'),
      explanation: receipt.notes.slice(0, 3).join(' '),
      suggestion: t('notesSuggestion'),
    });
  }

  for (const w of input.warnings ?? []) {
    const e = w.evidence ?? {};
    if (w.code === 'V002' && typeof e.count === 'number' && typeof e.min === 'number' && typeof e.max === 'number') {
      const few = e.count < e.min;
      add({
        id: `warning:${w.code}`, type: 'view-warning', severity: 'low',
        title: few ? t('fewTitle') : t('manyTitle'),
        explanation: t('countExplanation', { count: e.count, componentWord: plural(e.count, 'component', 'components'), min: e.min, max: e.max }),
        suggestion: few ? t('fewSuggestion') : t('manySuggestion'),
      });
    } else {
      add({
        id: `warning:${w.code}:${w.subject}`, type: 'view-warning', severity: 'low',
        title: t('checkTitle', { code: w.code }), explanation: w.message,
        suggestion: t('checkSuggestion'),
      });
    }
  }

  const layout = input.layoutIssues ?? [];
  if (layout.length) {
    const overlapping = [...new Set(layout.filter(i => i.code === 'L001').flatMap(i => i.subject.split(',')))].filter(id => byId.has(id));
    const codes = [...new Set(layout.map(i => i.code))].sort();
    add({
      id: 'layout', type: 'layout', severity: 'low',
      title: t('layoutTitle'),
      explanation: t('layoutExplanation', { n: layout.length, overlaps: plural(layout.length, 'overlap or crossing was', 'overlaps or crossings were'), codes: codes.join(', ') }),
      suggestion: t('layoutSuggestion'),
      components: overlapping,
    }, layout.length);
  }

  return drafts.sort((a, b) =>
    RANK[a.issue.severity] - RANK[b.issue.severity]
    || Number(a.issue.kind === 'hint') - Number(b.issue.kind === 'hint')
    || TYPE_ORDER.indexOf(a.issue.type) - TYPE_ORDER.indexOf(b.issue.type)
    || b.magnitude - a.magnitude
    || a.issue.id.localeCompare(b.issue.id)).map(d => d.issue);
}

export interface IssueSummary {
  /** Problems only; hints are not counted. */
  count: number;
  hints: number;
  worst: IssueSeverity | null;
  bySeverity: Record<IssueSeverity, number>;
  /** "No issues", "1 issue", "3 issues". */
  label: string;
}

export function summarize(issues: Issue[]): IssueSummary {
  const bySeverity: Record<IssueSeverity, number> = { high: 0, medium: 0, low: 0 };
  let hints = 0;
  for (const i of issues) { if (i.kind === 'hint') hints++; else bySeverity[i.severity]++; }
  const count = bySeverity.high + bySeverity.medium + bySeverity.low;
  const worst = bySeverity.high ? 'high' : bySeverity.medium ? 'medium' : bySeverity.low ? 'low' : null;
  return { count, hints, worst, bySeverity, label: count === 0 ? t('noIssues') : t('issues', { count }) };
}

/** How "Show in diagram" highlights an issue with the viewer's existing selections; null when there is nothing to show. */
export type ShowPlan = { kind: 'focus'; id: string } | { kind: 'edge'; id: string } | { kind: 'set'; nodes: string[]; edges: string[] } | null;

export function planShow(issue: Pick<Issue, 'components' | 'edges'>): ShowPlan {
  const { components, edges } = issue;
  if (!components.length && !edges.length) return null;
  if (edges.length === 1 && components.length <= 2) return { kind: 'edge', id: edges[0] };
  if (components.length === 1 && !edges.length) return { kind: 'focus', id: components[0] };
  return { kind: 'set', nodes: components, edges };
}
