import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, FileCode, GitCommit, Network, X } from 'lucide-react';
import {
  countedItems, evidenceHref, parseAnswer, toggleDetail,
  type AnswerSegment, type ChatEvidence, type CitedItem, type EvidenceDetail,
} from '@/features/chat-answer';

const mono = { fontFamily: '"JetBrains Mono", monospace' };

const LABEL_STYLES = {
  FACT: 'bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/30',
  INFERENCE: 'bg-[var(--at-warn)]/15 text-[var(--at-warn)] border-[var(--at-warn)]/30',
  UNKNOWN: 'bg-[var(--at-muted)]/15 text-[var(--at-muted)] border-[var(--at-muted)]/30'
} as const;

const CHIP = 'px-2 py-1 border text-[10px] font-mono flex items-center gap-1';
const CHIP_IDLE = 'bg-[var(--at-line)]/50 border-[var(--at-line)]';
const CHIP_OPEN = 'bg-[var(--at-accent)]/15 border-[var(--at-accent)]/70';
const FOCUSABLE = 'cursor-pointer transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--at-accent)]';
const CHIP_HOVER = 'hover:border-[var(--at-accent)]/60 hover:bg-[var(--at-accent)]/10';
const COMMIT_LINK = 'font-mono text-[11px] text-[var(--at-link)] underline decoration-dotted underline-offset-2 hover:bg-[var(--at-accent)]/10';

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

function Deps({ added, removed }: { added: number; removed: number }) {
  return <><span className="text-[#22c55e]">+{added}</span> / <span className="text-[#ef4444]">-{removed}</span></>;
}

interface ChipButtonProps { expanded: boolean; controls: string; label: string; tone: string; onClick: () => void; children: ReactNode }
function ChipButton({ expanded, controls, label, tone, onClick, children }: ChipButtonProps) {
  return (
    <button
      type="button" onClick={onClick} aria-expanded={expanded} aria-controls={controls} aria-label={label}
      className={`${CHIP} ${expanded ? CHIP_OPEN : CHIP_IDLE} ${FOCUSABLE} ${CHIP_HOVER} ${tone}`} style={mono}
    >
      {children}
    </button>
  );
}

function CommitCard({ item, commit, projectId }: { item: CitedItem | undefined; commit: string; projectId: string }) {
  if (!item) return <p className="text-xs text-[var(--at-muted)] pr-8">No further details were recorded for <code style={mono}>{commit}</code>.</p>;
  const snapshotOnly = item.kind === 'snapshot';
  return (
    <div className="space-y-3 pr-8">
      <div>
        <span className="px-2 py-1 bg-[var(--at-warn)]/10 border border-[var(--at-warn)]/20 text-[var(--at-warn)] text-[9px] font-mono font-bold uppercase tracking-widest inline-block mb-2" style={mono}>{item.type}</span>
        <h4 className="text-sm font-bold text-[var(--at-text)] leading-snug break-words">{item.title}</h4>
        <p className="mt-1 text-[10px] text-[var(--at-muted)] font-mono" style={mono}>{[item.commit, when(item.date), item.author].filter(Boolean).join(' · ')}</p>
      </div>
      {item.summary && <p className="text-xs text-[var(--at-muted)] leading-relaxed">{item.summary}</p>}
      {snapshotOnly && <p className="text-xs text-[var(--at-warn)] leading-relaxed">Snapshot only: no architectural change evidence was recorded for this commit, so it is not counted in the totals above.</p>}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-[var(--at-text)]" style={mono}>
        <span>{item.files} files{snapshotOnly ? ' in snapshot' : ' changed'}</span>
        <span><Deps {...item.dependencies} /> deps</span>
      </p>
      {item.sourceFiles.length > 0 && (
        <ul className="border border-[var(--at-line)] divide-y divide-[var(--at-line)] max-h-48 overflow-y-auto">
          {item.sourceFiles.map(file => (
            <li key={file} className="px-3 py-1.5 text-xs font-mono text-[var(--at-text)] truncate" style={mono} title={file}>{file}</li>
          ))}
          {item.moreFiles > 0 && <li className="px-3 py-1.5 text-[10px] text-[var(--at-muted)]">+{item.moreFiles} more files</li>}
        </ul>
      )}
      {!snapshotOnly && (
        <Link to={evidenceHref(projectId, item.commit)} className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--at-link)] hover:underline uppercase" style={mono}>
          Open in Changes &amp; Evidence <ExternalLink size={10} />
        </Link>
      )}
    </div>
  );
}

interface BreakdownProps { title: string; rows: CitedItem[]; skipped: number; total: ReactNode; onPick: (commit: string) => void; detail: (item: CitedItem) => ReactNode; extra?: (item: CitedItem) => ReactNode }
function Breakdown({ title, rows, skipped, total, onPick, detail, extra }: BreakdownProps) {
  return (
    <div className="pr-8">
      <h4 className="text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-widest mb-2" style={mono}>{title}</h4>
      <ul className="divide-y divide-[var(--at-line)]">
        {rows.map(item => (
          <li key={item.commit} className="py-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onPick(item.commit)} aria-label={`Show evidence for commit ${item.commit}`} className={`${COMMIT_LINK} ${FOCUSABLE}`} style={mono}>{item.commit}</button>
              <span className="flex-1 min-w-0 truncate text-xs text-[var(--at-text)]" title={item.title}>{item.title}</span>
              <span className="shrink-0 text-xs font-mono text-[var(--at-muted)]" style={mono}>{detail(item)}</span>
            </div>
            {extra?.(item)}
          </li>
        ))}
      </ul>
      <p className="mt-2 pt-2 border-t border-[var(--at-line)] text-xs font-mono text-[var(--at-text)]" style={mono}>{total}</p>
      {skipped > 0 && (
        <p className="mt-1 text-[10px] text-[var(--at-muted)]">
          {skipped} cited {skipped === 1 ? 'commit has' : 'commits have'} a snapshot but no change evidence and {skipped === 1 ? 'is' : 'are'} not counted.
        </p>
      )}
    </div>
  );
}

interface PanelProps {
  id: string; innerRef: Ref<HTMLDivElement>; detail: EvidenceDetail; evidence: ChatEvidence; items: CitedItem[]; projectId: string;
  onPick: (commit: string) => void; onClose: () => void;
}
function DetailPanel({ id, innerRef, detail, evidence, items, projectId, onPick, onClose }: PanelProps) {
  const rows = countedItems(items);
  const skipped = items.length - rows.length;
  return (
    <div ref={innerRef} id={id} role="region" aria-label="Evidence details" className="relative mt-3 bg-[var(--at-page)] border border-[var(--at-line)] p-4">
      <button type="button" onClick={onClose} aria-label="Close evidence details" className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-[var(--at-muted)] hover:text-[var(--at-text)] hover:bg-[var(--at-line)] ${FOCUSABLE}`}>
        <X size={14} />
      </button>
      {detail.kind === 'commit' && <CommitCard item={items.find(item => item.commit === detail.commit)} commit={detail.commit} projectId={projectId} />}
      {detail.kind === 'files' && (
        <Breakdown
          title="Files changed in the cited commits" rows={rows} skipped={skipped} onPick={onPick}
          detail={item => `${item.files} files`}
          extra={item => item.sourceFiles.length > 0 && (
            <p className="mt-1 text-[10px] font-mono text-[var(--at-muted)] truncate" style={mono} title={item.sourceFiles.join('\n')}>
              {item.sourceFiles.slice(0, 3).join(', ')}{item.files > 3 ? ` +${item.files - 3} more` : ''}
            </p>
          )}
          total={`Total: ${evidence.files} files across ${rows.length} ${rows.length === 1 ? 'commit' : 'commits'}`}
        />
      )}
      {detail.kind === 'deps' && (
        <Breakdown
          title="Dependency changes in the cited commits" rows={rows} skipped={skipped} onPick={onPick}
          detail={item => <Deps {...item.dependencies} />}
          total={<>Total: <Deps {...evidence.dependencies} /> deps</>}
        />
      )}
    </div>
  );
}

interface Props { content: string; evidence?: ChatEvidence | null; projectId: string }

/** An answer from the assistant: labels as badges, and cited commits, files and dependencies that open what is behind them. */
export default function AssistantMessage({ content, evidence, projectId }: Props) {
  const items = evidence?.items ?? [];
  const interactive = items.length > 0;
  const [detail, setDetail] = useState<EvidenceDetail | null>(null);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);

  const toggle = (next: EvidenceDetail) => setDetail(current => toggleDetail(current, next));
  const isOpen = (kind: EvidenceDetail['kind'], commit?: string) =>
    detail?.kind === kind && (detail.kind !== 'commit' || detail.commit === commit);

  useEffect(() => {
    if (!detail) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    panel.current?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }, [detail]);

  const renderSegments = (segments: AnswerSegment[]): ReactNode[] => segments.map((segment, index) => {
    if (segment.kind === 'bold') {
      return <strong key={index} className="font-semibold">{renderSegments(segment.children)}</strong>;
    }
    if (segment.kind === 'label') {
      return <span key={index} className={`inline-block px-1.5 mr-1 border text-[10px] font-semibold tracking-wider align-middle ${LABEL_STYLES[segment.value]}`} style={mono}>{segment.value}</span>;
    }
    if (segment.kind === 'code') {
      return <code key={index} className="px-1 bg-[var(--at-line)]/60 text-[var(--at-link)] text-[12px]" style={mono}>{segment.value}</code>;
    }
    if (segment.kind === 'commit') {
      const label = `Show evidence for commit ${segment.commit}`;
      return interactive ? (
        <button
          key={index} type="button" onClick={() => toggle({ kind: 'commit', commit: segment.commit })}
          aria-expanded={isOpen('commit', segment.commit)} aria-controls={panelId} aria-label={label}
          className={`px-1 bg-[var(--at-accent)]/10 text-[var(--at-link)] text-[12px] underline decoration-dotted underline-offset-2 hover:bg-[var(--at-accent)]/25 ${FOCUSABLE}`} style={mono}
        >
          {segment.value}
        </button>
      ) : (
        <Link key={index} to={evidenceHref(projectId, segment.commit)} aria-label={label} className="px-1 bg-[var(--at-accent)]/10 text-[var(--at-link)] text-[12px] underline decoration-dotted underline-offset-2 hover:bg-[var(--at-accent)]/25" style={mono}>
          {segment.value}
        </Link>
      );
    }
    return <Fragment key={index}>{segment.value}</Fragment>;
  });

  return (
    <>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--at-text)]">
        {parseAnswer(content, evidence?.commits).map((block, index) => {
          if (block.kind === 'heading') {
            return <p key={index} className="font-semibold break-words">{renderSegments(block.segments)}</p>;
          }
          if (block.kind === 'table') {
            return (
              <div key={index} className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {block.header.map((cell, column) => (
                        <th key={column} scope="col" className="px-3 py-2 text-left font-semibold bg-[var(--at-panel-2)] border border-[var(--at-line)] whitespace-nowrap">{renderSegments(cell)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, column) => (
                          <td key={column} className="px-3 py-2 align-top border border-[var(--at-line)] break-words">{renderSegments(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          return <p key={index} className="whitespace-pre-wrap break-words">{renderSegments(block.segments)}</p>;
        })}
      </div>

      {evidence && (
        <div className="mt-4 pt-4 border-t border-[var(--at-line)]">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={12} className="text-[#22c55e]" />
            <span className="text-[10px] font-mono font-semibold text-[#22c55e] uppercase tracking-wider" style={mono}>Evidence cited</span>
            {interactive && <span className="text-[10px] text-[var(--at-muted)]">Select a commit, file count or dependency count for details</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {evidence.commits.map(commit => interactive ? (
              <ChipButton
                key={commit} expanded={isOpen('commit', commit)} controls={panelId} label={`Show evidence for commit ${commit}`}
                tone="text-[var(--at-link)]" onClick={() => toggle({ kind: 'commit', commit })}
              >
                <GitCommit size={10} /> {commit}
              </ChipButton>
            ) : (
              <Link key={commit} to={evidenceHref(projectId, commit)} aria-label={`Show evidence for commit ${commit}`} className={`${CHIP} ${CHIP_IDLE} ${CHIP_HOVER} ${FOCUSABLE} text-[var(--at-link)]`} style={mono}>
                <GitCommit size={10} /> {commit}
              </Link>
            ))}
            {evidence.files > 0 && (interactive ? (
              <ChipButton
                expanded={isOpen('files')} controls={panelId} label={`Show the ${evidence.files} files changed in the cited commits`}
                tone="text-[var(--at-muted)]" onClick={() => toggle({ kind: 'files' })}
              >
                <FileCode size={10} /> {evidence.files} files
              </ChipButton>
            ) : (
              <span className={`${CHIP} ${CHIP_IDLE} text-[var(--at-muted)]`} style={mono}><FileCode size={10} /> {evidence.files} files</span>
            ))}
            {(evidence.dependencies.added > 0 || evidence.dependencies.removed > 0) && (interactive ? (
              <ChipButton
                expanded={isOpen('deps')} controls={panelId} label={`Show dependency changes (+${evidence.dependencies.added}/-${evidence.dependencies.removed} deps)`}
                tone="text-[var(--at-muted)]" onClick={() => toggle({ kind: 'deps' })}
              >
                <Network size={10} /> +{evidence.dependencies.added}/-{evidence.dependencies.removed} deps
              </ChipButton>
            ) : (
              <span className={`${CHIP} ${CHIP_IDLE} text-[var(--at-muted)]`} style={mono}><Network size={10} /> +{evidence.dependencies.added}/-{evidence.dependencies.removed} deps</span>
            ))}
          </div>
          {interactive && detail && (
            <DetailPanel
              id={panelId} innerRef={panel} detail={detail} evidence={evidence} items={items} projectId={projectId}
              onPick={commit => setDetail({ kind: 'commit', commit })} onClose={() => setDetail(null)}
            />
          )}
        </div>
      )}
    </>
  );
}
