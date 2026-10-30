import { cycles } from './queries.ts';
import { ROLE_LABEL } from './scene.ts';
import type { RefineReceipt, ViewQuality } from './api.ts';
import type { ArchitectureView, ValidationIssue } from './types.ts';

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
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} and ${rest} more`;
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
      title: `Circular dependency between ${nameList(names)}`,
      explanation: `${nameList(names)} depend on each other in a loop, so none of them can be understood, tested or changed on its own.`,
      suggestion: `Break the loop by moving the shared part to a lower layer, or invert one dependency behind an interface.${weakest ? ` The weakest link, and the easiest to cut, is ${name(weakest.source)} → ${name(weakest.target)} (${weakest.weight} ${plural(weakest.weight, 'dependency', 'dependencies')} in the code).` : ''}`,
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
        title: `Upward dependency: ${from.name} → ${to.name}`,
        explanation: `${from.name} (${ROLE_LABEL[from.role]}) depends on ${to.name} (${ROLE_LABEL[to.role]}), which sits in a higher layer. Lower layers should not know about higher ones. ${v.weight} ${plural(v.weight, 'dependency', 'dependencies')} in the code.`,
        suggestion: `Point the dependency down: let ${to.name} call ${from.name} instead, or move what ${from.name} needs from ${to.name} into a lower layer or behind an interface that ${from.name} owns.`,
        components: [v.source, v.target], edges: [edgeId(view, v.source, v.target)].filter((x): x is string => !!x),
      }, v.weight);
    }
    const rest = violations.slice(THRESHOLDS.upwardListed);
    if (rest.length) {
      const weight = rest.reduce((n, v) => n + v.weight, 0);
      add({
        id: `upward-more:${rest.map(v => `${v.source}>${v.target}`).join(',')}`, type: 'upward-more', severity: upward,
        title: `${rest.length} more upward ${plural(rest.length, 'dependency', 'dependencies')}`,
        explanation: `${rest.length} further ${plural(rest.length, 'arrow points', 'arrows point')} from a lower layer to a higher one (${weight} ${plural(weight, 'dependency', 'dependencies')} in the code), for example ${name(rest[0].source)} → ${name(rest[0].target)}.`,
        suggestion: 'Fix the biggest ones above first; the rest often disappear once the shared code sits in a lower layer.',
        components: [...new Set(rest.flatMap(v => [v.source, v.target]))], edges: rest.map(v => edgeId(view, v.source, v.target)).filter((x): x is string => !!x),
      }, weight);
    }

    // Against the team's reference architecture, the intended design.
    const agreement = quality.agreement;
    if (agreement && agreement.score < THRESHOLDS.agreementMedium) {
      add({
        id: 'deviation', type: 'deviation', severity: agreement.score < THRESHOLDS.agreementHigh ? 'high' : 'medium',
        title: 'Differs from the intended architecture',
        explanation: `Compared with the reference architecture your team saved, the grouping matches only ${pct(agreement.score)} (over ${agreement.common} files). Files sit in different components than that reference describes.`,
        suggestion: maintainer(
          'Review which files moved (open a component to see its files). If the design changed on purpose, update the reference architecture; if the code drifted, move the files back.',
          'The code may have drifted from the design. A maintainer of this workspace can review which files moved and either fix the code or update the reference architecture.'),
        ...(canEdit ? { action: 'set-reference' as const } : {}),
      }, 1 - agreement.score);
    } else if (!agreement && canEdit) {
      add({
        id: 'no-reference', type: 'no-reference', kind: 'hint', severity: 'low',
        title: 'No reference architecture to compare with',
        explanation: 'ArchTime cannot say whether the code follows the intended design, because no reference architecture covers these files.',
        suggestion: 'Describe how your team sees the system (one component per line with its folders) and every snapshot will be checked against it.',
        action: 'set-reference',
      });
    }

    // Against the previous snapshot.
    const stability = quality.stability;
    if (stability && stability.score < THRESHOLDS.stabilityLow) {
      add({
        id: 'drift', type: 'drift', severity: stability.score < THRESHOLDS.stabilityMedium ? 'medium' : 'low',
        title: 'Grouping changed a lot since the previous snapshot',
        explanation: `Only ${pct(stability.score)} of the grouping agrees with the previous snapshot (compared over ${stability.common} files), so components were reshuffled.`,
        suggestion: 'If the code was restructured on purpose there is nothing to do. Otherwise compare the two snapshots (Compare revisions) and check which components changed.',
      }, 1 - stability.score);
    }

    // Names the paths do not support: possibly invented by a model, or too vague to check.
    const ungrounded = quality.grounding.ungrounded;
    if (ungrounded.length) {
      const named = new Set(ungrounded);
      const ids = view.components.filter(c => named.has(c.name)).map(c => c.id);
      add({
        id: `ungrounded:${[...ungrounded].sort().join('|')}`, type: 'ungrounded', severity: quality.grounding.score < THRESHOLDS.groundingMedium ? 'medium' : 'low',
        title: ungrounded.length === 1 ? `The name "${ungrounded[0]}" is not supported by its files` : `${ungrounded.length} component names are not supported by their files`,
        explanation: `${nameList(ungrounded.map(n => `"${n}"`))} ${plural(ungrounded.length, 'has', 'have')} no word that appears in the file paths inside, so the ${plural(ungrounded.length, 'name', 'names')} may be invented or too vague to trust.`,
        suggestion: maintainer(
          'Rename them to match the folders they contain, or regenerate the components to get names taken from the paths.',
          'Ask a maintainer of this workspace to rename them or regenerate the components.'),
        components: ids, ...(canEdit ? { action: 'regenerate' as const } : {}),
      }, ungrounded.length);
    }

    // One component holding most of the files.
    const total = view.components.reduce((n, c) => n + c.memberIds.length, 0);
    const biggest = [...view.components].sort((a, b) => b.memberIds.length - a.memberIds.length || a.id.localeCompare(b.id))[0];
    if (quality.balance < THRESHOLDS.balanceLow && biggest && total > 0 && view.components.length > 1) {
      add({
        id: `unbalanced:${biggest.id}`, type: 'unbalanced', severity: 'low',
        title: `${biggest.name} holds most of the files`,
        explanation: `${biggest.name} contains ${pct(biggest.memberIds.length / total)} of all files (${biggest.memberIds.length} of ${total}), so the map says little about what is inside it.`,
        suggestion: `Split ${biggest.name} into smaller components by responsibility (the folders inside it are a good start), or regenerate the grouping.`,
        components: [biggest.id],
      }, 1 - quality.balance);
    }
  }

  if (input.stale) {
    add({
      id: 'stale', type: 'stale', severity: 'medium',
      title: 'The components are out of date',
      explanation: 'The snapshot changed after these components were made, so the map may not show the latest files.',
      suggestion: maintainer('Regenerate the components so they match the current files.', 'Ask a maintainer of this workspace to regenerate the components.'),
      ...(canEdit ? { action: 'regenerate' as const } : {}),
    });
  }

  const receipt = input.receipt;
  if (receipt && !receipt.accepted) {
    add({
      id: 'ai-fallback', type: 'ai-fallback', severity: 'low',
      title: 'The AI refinement was not used',
      explanation: `${receipt.fallbackReason ?? 'No answer passed verification.'} The grouping by dependencies is shown instead.`,
      suggestion: maintainer('Try "Refine with AI" again or pick another model. The grouping shown is still valid.', 'Ask a maintainer to try again with another model. The grouping shown is still valid.'),
    });
  } else if (receipt?.notes?.length) {
    add({
      id: 'ai-notes', type: 'ai-notes', kind: 'hint', severity: 'low',
      title: 'Notes from the AI refinement',
      explanation: receipt.notes.slice(0, 3).join(' '),
      suggestion: 'Nothing to fix; these notes explain choices made while refining.',
    });
  }

  for (const w of input.warnings ?? []) {
    const e = w.evidence ?? {};
    if (w.code === 'V002' && typeof e.count === 'number' && typeof e.min === 'number' && typeof e.max === 'number') {
      const few = e.count < e.min;
      add({
        id: `warning:${w.code}`, type: 'view-warning', severity: 'low',
        title: few ? 'Few components' : 'Many components',
        explanation: `The map has ${e.count} ${plural(e.count, 'component', 'components')}; a readable map usually has ${e.min} to ${e.max}.`,
        suggestion: few
          ? 'Small projects can be fine. If the boxes hide detail, split the largest component or regenerate the grouping.'
          : 'Merge closely related components or regenerate the grouping so the map stays readable.',
      });
    } else {
      add({
        id: `warning:${w.code}:${w.subject}`, type: 'view-warning', severity: 'low',
        title: `Check ${w.code}`, explanation: w.message,
        suggestion: 'The data is usable, but have a maintainer look at this warning.',
      });
    }
  }

  const layout = input.layoutIssues ?? [];
  if (layout.length) {
    const overlapping = [...new Set(layout.filter(i => i.code === 'L001').flatMap(i => i.subject.split(',')))].filter(id => byId.has(id));
    const codes = [...new Set(layout.map(i => i.code))].sort();
    add({
      id: 'layout', type: 'layout', severity: 'low',
      title: 'The drawing has layout problems',
      explanation: `${layout.length} ${plural(layout.length, 'overlap or crossing was', 'overlaps or crossings were')} found while drawing (${codes.join(', ')}). The dependencies and counts are still correct; only the picture is affected.`,
      suggestion: 'Press 0 to fit the diagram again and use the dependency lists for exact details. Export the data (JSON) if you need to report it.',
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
  return { count, hints, worst, bySeverity, label: count === 0 ? 'No issues' : `${count} ${plural(count, 'issue', 'issues')}` };
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
