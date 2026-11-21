import { Tooltip } from 'antd';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { Issue, IssueAction, IssueSeverity, IssueSummary } from '@/features/architecture/issues';
import { Details } from '@/components/PageHeader';
import { message, useMessages } from '@/i18n/define';
import { ARCH } from './messages';

// Danger for high, warn for medium, muted for low: theme tokens, so every look keeps them readable.
const TONE: Record<IssueSeverity | 'hint', { bar: string; text: string; label: string; chip: string }> = {
  high: { bar: 'var(--at-danger)', text: 'text-[var(--at-danger-text)]', label: 'High', chip: 'border-[var(--at-danger)]/60 bg-[var(--at-danger)]/15 text-[var(--at-danger-text)]' },
  medium: { bar: 'var(--at-warn)', text: 'text-[var(--at-warn)]', label: 'Medium', chip: 'border-[var(--at-warn)]/60 bg-[var(--at-warn)]/15 text-[var(--at-warn)]' },
  low: { bar: 'var(--at-line-strong)', text: 'text-[var(--at-muted)]', label: 'Low', chip: 'border-[var(--at-line-strong)] bg-[var(--at-panel-2)] text-[var(--at-muted)]' },
  hint: { bar: 'var(--at-accent)', text: 'text-[var(--at-link)]', label: 'Tip', chip: '' },
};

const breakdown = (s: IssueSummary) => (['high', 'medium', 'low'] as const).filter(k => s.bySeverity[k]).map(k => `${s.bySeverity[k]} ${message(ARCH, k).toLowerCase()}`).join(', ');

/** Always on the canvas, also in full screen: how many problems there are, coloured by the worst, and a way to the list. */
export function IssuesChip({ summary, verified, onClick, className = '' }: { summary: IssueSummary; verified: string; onClick: () => void; className?: string }) {
  const m = useMessages(ARCH);
  const tone = summary.worst ? TONE[summary.worst].chip : 'border-[var(--at-success)]/50 bg-[var(--at-success)]/15 text-[var(--at-success)]';
  return <Tooltip placement="bottom" title={<span>{summary.count ? m('issuesTip', { label: summary.label, breakdown: breakdown(summary) }) : m('issuesNone')}<br />{m('consistent', { verified })}</span>}>
    <button type="button" data-overlay onClick={onClick} aria-label={m('openList', { label: summary.label })}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur hover:brightness-125 ${tone} ${className}`}>
      {summary.count ? <TriangleAlert size={13} aria-hidden /> : <CircleCheck size={13} aria-hidden />}
      {summary.label}
    </button>
  </Tooltip>;
}

const ACTION_LABEL: Record<IssueAction, (issue: Issue) => string> = {
  'set-reference': issue => message(ARCH, issue.kind === 'hint' ? 'setReference' : 'reviewReference'),
  regenerate: () => message(ARCH, 'regenerate'),
};

function Card({ issue, active, onShow, onAction }: { issue: Issue; active: boolean; onShow: (issue: Issue) => void; onAction?: (action: IssueAction) => void }) {
  const tone = TONE[issue.kind === 'hint' ? 'hint' : issue.severity];
  const showable = issue.components.length > 0 || issue.edges.length > 0;
  return <li data-issue={issue.id} data-severity={issue.kind === 'hint' ? 'hint' : issue.severity} className={`flex overflow-hidden rounded border bg-[var(--at-panel)] ${active ? 'border-[var(--at-accent)]' : 'border-[var(--at-line)]'}`}>
    <span aria-hidden className="w-1 shrink-0" style={{ background: tone.bar }} />
    <div className="min-w-0 flex-1 space-y-1.5 p-2.5 text-xs">
      <p className="flex items-start gap-2">
        <span className={`mt-px shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider ${tone.text}`}>{message(ARCH, issue.kind === 'hint' ? 'tip' : issue.severity)}</span>
        <span className="text-[13px] font-semibold leading-snug text-[var(--at-text)]">{issue.title}</span>
      </p>
      <Details bodyClassName="text-xs" defaultOpen={active}>
        <p className="text-[var(--at-muted)]">{issue.explanation}</p>
        <p className="text-[var(--at-muted)]"><span className="font-semibold text-[var(--at-link)]">{message(ARCH, 'whatToDo')}</span>{issue.suggestion}</p>
      </Details>
      {(showable || (issue.action && onAction)) && <div className="flex flex-wrap gap-2 pt-1">
        {showable && <button type="button" onClick={() => onShow(issue)} className="h-7 border border-[var(--at-accent)]/50 px-2.5 text-[11px] font-bold text-[var(--at-link)] hover:bg-[var(--at-accent)]/10 hover:text-[var(--at-link-hover)]">{message(ARCH, 'showInDiagram')}</button>}
        {issue.action && onAction && <button type="button" onClick={() => onAction(issue.action!)} className="h-7 bg-[var(--at-fill)] px-2.5 text-[11px] font-bold text-[var(--at-on-fill)] hover:bg-[var(--at-fill-hover)]">{ACTION_LABEL[issue.action](issue)}</button>}
      </div>}
    </div>
  </li>;
}

/** The first thing in the right panel when nothing is selected: every problem as a card, worst first, with what to do. */
export default function IssuesPanel({ issues, summary, verified, activeId, inner = false, onShow, onAction }: {
  issues: Issue[]; summary: IssueSummary; verified: string; activeId?: string;
  /** The inner (class) view is open: the list is still that of the whole component map. */
  inner?: boolean;
  onShow: (issue: Issue) => void; onAction?: (action: IssueAction) => void;
}) {
  const problems = issues.filter(i => i.kind === 'problem');
  const hints = issues.filter(i => i.kind === 'hint');
  return <section id="architecture-issues" aria-label={message(ARCH, 'issues')} className="space-y-2">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-[var(--at-muted)]">{inner ? message(ARCH, 'issuesWhole') : message(ARCH, 'issues')}</h3>
      <span className={`text-xs font-medium ${summary.worst ? TONE[summary.worst].text : 'text-[var(--at-success)]'}`}>{summary.label}{summary.count ? ` · ${breakdown(summary)}` : ''}</span>
    </div>
    {!problems.length && <p className="flex items-start gap-2 rounded border border-[var(--at-success)]/40 bg-[var(--at-success)]/10 p-2.5 text-xs leading-relaxed text-[var(--at-success)]">
      <CircleCheck size={14} className="mt-px shrink-0" aria-hidden /><span>Nothing wrong was found. Consistent with the import graph: {verified}.</span></p>}
    {problems.length > 0 && <ul className="space-y-2" aria-label={message(ARCH, 'problems')}>{problems.map(i => <Card key={i.id} issue={i} active={i.id === activeId} onShow={onShow} onAction={onAction} />)}</ul>}
    {hints.length > 0 && <>
      <h4 className="pt-1 text-[10px] font-mono uppercase tracking-wider text-[var(--at-muted)]">{message(ARCH, 'suggestions')}</h4>
      <ul className="space-y-2" aria-label={message(ARCH, 'suggestions')}>{hints.map(i => <Card key={i.id} issue={i} active={i.id === activeId} onShow={onShow} onAction={onAction} />)}</ul>
    </>}
  </section>;
}
