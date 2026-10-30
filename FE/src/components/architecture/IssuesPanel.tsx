import { Tooltip } from 'antd';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { Issue, IssueAction, IssueSeverity, IssueSummary } from '@/features/architecture/issues';

// Red for high, amber for medium, slate for low; text colours are chosen to read on the #11161b panels.
const TONE: Record<IssueSeverity | 'hint', { bar: string; text: string; label: string; chip: string }> = {
  high: { bar: '#ef4444', text: 'text-[#fca5a5]', label: 'High', chip: 'border-[#ef4444]/60 bg-[#7f1d1d]/40 text-[#fca5a5]' },
  medium: { bar: '#f59e0b', text: 'text-[#fcd34d]', label: 'Medium', chip: 'border-[#f59e0b]/60 bg-[#78350f]/40 text-[#fcd34d]' },
  low: { bar: '#64748b', text: 'text-slate-300', label: 'Low', chip: 'border-[#64748b]/70 bg-[#1e293b]/60 text-slate-300' },
  hint: { bar: '#3b82f6', text: 'text-[#93c5fd]', label: 'Tip', chip: '' },
};

const breakdown = (s: IssueSummary) => (['high', 'medium', 'low'] as const).filter(k => s.bySeverity[k]).map(k => `${s.bySeverity[k]} ${TONE[k].label.toLowerCase()}`).join(', ');

/** Always on the canvas, also in full screen: how many problems there are, coloured by the worst, and a way to the list. */
export function IssuesChip({ summary, verified, onClick, className = '' }: { summary: IssueSummary; verified: string; onClick: () => void; className?: string }) {
  const tone = summary.worst ? TONE[summary.worst].chip : 'border-[#22c55e]/50 bg-[#14532d]/40 text-[#86efac]';
  return <Tooltip placement="bottom" title={<span>{summary.count ? `${summary.label}: ${breakdown(summary)}. Click to read them.` : 'Nothing wrong was found. Click for the details.'}<br />✓ Consistent with the import graph: {verified}</span>}>
    <button type="button" data-overlay onClick={onClick} aria-label={`${summary.label}. Open the list`}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur hover:brightness-125 ${tone} ${className}`}>
      {summary.count ? <TriangleAlert size={13} aria-hidden /> : <CircleCheck size={13} aria-hidden />}
      {summary.label}
    </button>
  </Tooltip>;
}

const ACTION_LABEL: Record<IssueAction, (issue: Issue) => string> = {
  'set-reference': issue => (issue.kind === 'hint' ? 'Set reference architecture' : 'Review reference'),
  regenerate: () => 'Regenerate components',
};

function Card({ issue, active, onShow, onAction }: { issue: Issue; active: boolean; onShow: (issue: Issue) => void; onAction?: (action: IssueAction) => void }) {
  const tone = TONE[issue.kind === 'hint' ? 'hint' : issue.severity];
  const showable = issue.components.length > 0 || issue.edges.length > 0;
  return <li data-issue={issue.id} data-severity={issue.kind === 'hint' ? 'hint' : issue.severity} className={`flex overflow-hidden rounded border bg-[#11161b] ${active ? 'border-[#3b82f6]' : 'border-[#242527]'}`}>
    <span aria-hidden className="w-1 shrink-0" style={{ background: tone.bar }} />
    <div className="min-w-0 flex-1 space-y-1.5 p-2.5 text-xs">
      <p className="flex items-start gap-2">
        <span className={`mt-px shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider ${tone.text}`}>{tone.label}</span>
        <span className="text-[13px] font-semibold leading-snug text-slate-100">{issue.title}</span>
      </p>
      <p className="leading-relaxed text-slate-300">{issue.explanation}</p>
      <p className="leading-relaxed text-slate-300"><span className="font-semibold text-[#93c5fd]">What to do: </span>{issue.suggestion}</p>
      {(showable || (issue.action && onAction)) && <div className="flex flex-wrap gap-2 pt-1">
        {showable && <button type="button" onClick={() => onShow(issue)} className="h-7 border border-[#3b82f6]/50 px-2.5 text-[11px] font-bold text-[#93c5fd] hover:bg-[#3b82f6]/10 hover:text-[#bfdbfe]">Show in diagram</button>}
        {issue.action && onAction && <button type="button" onClick={() => onAction(issue.action!)} className="h-7 bg-[#1d4ed8] px-2.5 text-[11px] font-bold text-white hover:bg-[#1e40af]">{ACTION_LABEL[issue.action](issue)}</button>}
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
  return <section id="architecture-issues" aria-label="Issues" className="space-y-2">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-300">{inner ? 'Issues for the whole map' : 'Issues'}</h3>
      <span className={`text-xs font-medium ${summary.worst ? TONE[summary.worst].text : 'text-[#4ade80]'}`}>{summary.label}{summary.count ? ` · ${breakdown(summary)}` : ''}</span>
    </div>
    {!problems.length && <p className="flex items-start gap-2 rounded border border-[#14532d] bg-[#14532d]/20 p-2.5 text-xs leading-relaxed text-[#86efac]">
      <CircleCheck size={14} className="mt-px shrink-0" aria-hidden /><span>Nothing wrong was found. Consistent with the import graph: {verified}.</span></p>}
    {problems.length > 0 && <ul className="space-y-2" aria-label="Problems">{problems.map(i => <Card key={i.id} issue={i} active={i.id === activeId} onShow={onShow} onAction={onAction} />)}</ul>}
    {hints.length > 0 && <>
      <h4 className="pt-1 text-[10px] font-mono uppercase tracking-wider text-slate-300">Suggestions</h4>
      <ul className="space-y-2" aria-label="Suggestions">{hints.map(i => <Card key={i.id} issue={i} active={i.id === activeId} onShow={onShow} onAction={onAction} />)}</ul>
    </>}
  </section>;
}
