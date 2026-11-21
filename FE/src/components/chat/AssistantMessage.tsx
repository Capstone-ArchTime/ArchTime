import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, FileCode, GitCommit, Network, X } from 'lucide-react';
import {
  countedItems, evidenceHref, parseAnswer, toggleDetail,
  type AnswerSegment, type ChatEvidence, type CitedItem, type EvidenceDetail,
} from '@/features/chat-answer';
import { formatDate } from '@/i18n/format';
import { defineMessages, message } from '@/i18n/define';
import type { Params } from '@/i18n';

const MSG = defineMessages({
  noDetails: 'No further details were recorded for {commit}.', snapshotOnly: 'Snapshot only: no architectural change evidence was recorded for this commit, so it is not counted in the totals above.',
  filesInSnapshot: '{count} files in snapshot', filesInSnapshot_one: '1 file in snapshot', filesChanged: '{count} files changed', filesChanged_one: '1 file changed', deps: 'deps',
  moreFiles: '+{n} more files', openEvidence: 'Open in Changes & Evidence', showCommit: 'Show evidence for commit {commit}',
  skipped: '{count} cited commits have a snapshot but no change evidence and are not counted.', skipped_one: '1 cited commit has a snapshot but no change evidence and is not counted.',
  details: 'Evidence details', closeDetails: 'Close evidence details', filesTitle: 'Files changed in the cited commits', files: '{count} files', files_one: '1 file', more: ' +{n} more',
  filesTotal: 'Total: {files} files across {count} commits', filesTotal_one: 'Total: {files} files across 1 commit', depsTitle: 'Dependency changes in the cited commits', total: 'Total:',
  cited: 'Evidence cited', selectHint: 'Select a commit, file count or dependency count for details', showFiles: 'Show the {n} files changed in the cited commits',
  showDeps: 'Show dependency changes (+{added}/-{removed} deps)',
}, {
  noDetails: 'Không có thêm chi tiết nào được ghi lại cho {commit}.', snapshotOnly: 'Chỉ có ảnh chụp: commit này không có bằng chứng thay đổi kiến trúc, nên không được tính vào tổng ở trên.',
  filesInSnapshot: '{count} tệp trong ảnh chụp', filesChanged: '{count} tệp thay đổi', deps: 'phụ thuộc',
  moreFiles: '+{n} tệp nữa', openEvidence: 'Mở trong Thay đổi & Bằng chứng', showCommit: 'Xem bằng chứng cho commit {commit}',
  skipped: '{count} commit được dẫn có ảnh chụp nhưng không có bằng chứng thay đổi nên không được tính.',
  details: 'Chi tiết bằng chứng', closeDetails: 'Đóng chi tiết bằng chứng', filesTitle: 'Tệp thay đổi trong các commit được dẫn', files: '{count} tệp', more: ' +{n} nữa',
  filesTotal: 'Tổng: {files} tệp trên {count} commit', depsTitle: 'Thay đổi phụ thuộc trong các commit được dẫn', total: 'Tổng:',
  cited: 'Bằng chứng được dẫn', selectHint: 'Chọn một commit, số tệp hoặc số phụ thuộc để xem chi tiết', showFiles: 'Xem {n} tệp thay đổi trong các commit được dẫn',
  showDeps: 'Xem thay đổi phụ thuộc (+{added}/-{removed})',
});
const tx = (key: Parameters<typeof message<typeof MSG.en>>[1], params?: Params) => message(MSG, key, params);

const mono = { fontFamily: '"JetBrains Mono", monospace' };

const LABEL_STYLES = {
  FACT: 'bg-[var(--at-success)]/15 text-[var(--at-success)] border-[var(--at-success)]/30',
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
  return Number.isNaN(date.getTime()) ? '' : formatDate(date);
};

function Deps({ added, removed }: { added: number; removed: number }) {
  return <><span className="text-[var(--at-success)]">+{added}</span> / <span className="text-[var(--at-danger)]">-{removed}</span></>;
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
  if (!item) return <p className="text-xs text-[var(--at-muted)] pr-8">{tx('noDetails', { commit })}</p>;
  const snapshotOnly = item.kind === 'snapshot';
  return (
    <div className="space-y-3 pr-8">
      <div>
        <span className="px-2 py-1 bg-[var(--at-warn)]/10 border border-[var(--at-warn)]/20 text-[var(--at-warn)] text-[11px] font-mono font-bold uppercase tracking-widest inline-block mb-2" style={mono}>{item.type}</span>
        <h4 className="text-sm font-bold text-[var(--at-text)] leading-snug break-words">{item.title}</h4>
        <p className="mt-1 text-[10px] text-[var(--at-muted)] font-mono" style={mono}>{[item.commit, when(item.date), item.author].filter(Boolean).join(' · ')}</p>
      </div>
      {item.summary && <p className="text-xs text-[var(--at-muted)] leading-relaxed">{item.summary}</p>}
      {snapshotOnly && <p className="text-xs text-[var(--at-warn)] leading-relaxed">{tx('snapshotOnly')}</p>}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-[var(--at-text)]" style={mono}>
        <span>{tx(snapshotOnly ? 'filesInSnapshot' : 'filesChanged', { count: item.files })}</span>
        <span><Deps {...item.dependencies} /> {tx('deps')}</span>
      </p>
      {item.sourceFiles.length > 0 && (
        <ul className="border border-[var(--at-line)] divide-y divide-[var(--at-line)] max-h-48 overflow-y-auto">
          {item.sourceFiles.map(file => (
            <li key={file} className="px-3 py-1.5 text-xs font-mono text-[var(--at-text)] truncate" style={mono} title={file}>{file}</li>
          ))}
          {item.moreFiles > 0 && <li className="px-3 py-1.5 text-[10px] text-[var(--at-muted)]">{tx('moreFiles', { n: item.moreFiles })}</li>}
        </ul>
      )}
      {!snapshotOnly && (
        <Link to={evidenceHref(projectId, item.commit)} className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--at-link)] hover:underline uppercase" style={mono}>
          {tx('openEvidence')} <ExternalLink size={10} />
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
              <button type="button" onClick={() => onPick(item.commit)} aria-label={tx('showCommit', { commit: item.commit })} className={`${COMMIT_LINK} ${FOCUSABLE}`} style={mono}>{item.commit}</button>
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
          {tx('skipped', { count: skipped })}
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
    <div ref={innerRef} id={id} role="region" aria-label={tx('details')} className="relative mt-3 bg-[var(--at-page)] border border-[var(--at-line)] p-4">
      <button type="button" onClick={onClose} aria-label={tx('closeDetails')} className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-[var(--at-muted)] hover:text-[var(--at-text)] hover:bg-[var(--at-line)] ${FOCUSABLE}`}>
        <X size={14} />
      </button>
      {detail.kind === 'commit' && <CommitCard item={items.find(item => item.commit === detail.commit)} commit={detail.commit} projectId={projectId} />}
      {detail.kind === 'files' && (
        <Breakdown
          title={tx('filesTitle')} rows={rows} skipped={skipped} onPick={onPick}
          detail={item => tx('files', { count: item.files })}
          extra={item => item.sourceFiles.length > 0 && (
            <p className="mt-1 text-[10px] font-mono text-[var(--at-muted)] truncate" style={mono} title={item.sourceFiles.join('\n')}>
              {item.sourceFiles.slice(0, 3).join(', ')}{item.files > 3 ? tx('more', { n: item.files - 3 }) : ''}
            </p>
          )}
          total={tx('filesTotal', { files: evidence.files, count: rows.length })}
        />
      )}
      {detail.kind === 'deps' && (
        <Breakdown
          title={tx('depsTitle')} rows={rows} skipped={skipped} onPick={onPick}
          detail={item => <Deps {...item.dependencies} />}
          total={<>{tx('total')} <Deps {...evidence.dependencies} /> {tx('deps')}</>}
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
      const label = tx('showCommit', { commit: segment.commit });
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
            <CheckCircle2 size={12} className="text-[var(--at-success)]" />
            <span className="text-[10px] font-mono font-semibold text-[var(--at-success)] uppercase tracking-wider" style={mono}>{tx('cited')}</span>
            {interactive && <span className="text-[10px] text-[var(--at-muted)]">{tx('selectHint')}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {evidence.commits.map(commit => interactive ? (
              <ChipButton
                key={commit} expanded={isOpen('commit', commit)} controls={panelId} label={tx('showCommit', { commit })}
                tone="text-[var(--at-link)]" onClick={() => toggle({ kind: 'commit', commit })}
              >
                <GitCommit size={10} /> {commit}
              </ChipButton>
            ) : (
              <Link key={commit} to={evidenceHref(projectId, commit)} aria-label={tx('showCommit', { commit })} className={`${CHIP} ${CHIP_IDLE} ${CHIP_HOVER} ${FOCUSABLE} text-[var(--at-link)]`} style={mono}>
                <GitCommit size={10} /> {commit}
              </Link>
            ))}
            {evidence.files > 0 && (interactive ? (
              <ChipButton
                expanded={isOpen('files')} controls={panelId} label={tx('showFiles', { n: evidence.files })}
                tone="text-[var(--at-muted)]" onClick={() => toggle({ kind: 'files' })}
              >
                <FileCode size={10} /> {tx('files', { count: evidence.files })}
              </ChipButton>
            ) : (
              <span className={`${CHIP} ${CHIP_IDLE} text-[var(--at-muted)]`} style={mono}><FileCode size={10} /> {tx('files', { count: evidence.files })}</span>
            ))}
            {(evidence.dependencies.added > 0 || evidence.dependencies.removed > 0) && (interactive ? (
              <ChipButton
                expanded={isOpen('deps')} controls={panelId} label={tx('showDeps', { added: evidence.dependencies.added, removed: evidence.dependencies.removed })}
                tone="text-[var(--at-muted)]" onClick={() => toggle({ kind: 'deps' })}
              >
                <Network size={10} /> +{evidence.dependencies.added}/-{evidence.dependencies.removed} {tx('deps')}
              </ChipButton>
            ) : (
              <span className={`${CHIP} ${CHIP_IDLE} text-[var(--at-muted)]`} style={mono}><Network size={10} /> +{evidence.dependencies.added}/-{evidence.dependencies.removed} {tx('deps')}</span>
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
