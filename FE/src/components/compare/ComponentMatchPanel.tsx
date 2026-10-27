import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, GitMerge } from 'lucide-react';
import { CHANGE_KINDS, CHANGE_LABELS, changeRows, hasStructuralChange, linkStrength } from '@/features/component-matching';
import type { ChangeKind, ChangeRow, ComponentMatchResult, MatchedComponent } from '@/features/component-matching';
import { serializeHash } from '@/features/architecture/url-state';

const mono = { fontFamily: '"JetBrains Mono", monospace' };

const COLORS: Record<ChangeKind, string> = {
  split: '#ffb03a', merged: '#ffb03a', restructured: '#ffb03a', added: '#22c55e', removed: '#ef4444', renamed: '#93c5fd', kept: '#94a3b8',
};

const FILES_SHOWN = 20;

function Badge({ kind }: { kind: ChangeKind }) {
  const color = COLORS[kind];
  return (
    <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest border" style={{ ...mono, color, borderColor: `${color}33`, background: `${color}1a` }}>
      {CHANGE_LABELS[kind]}
    </span>
  );
}

function Names({ list }: { list: MatchedComponent[] }) {
  if (!list.length) return <span className="text-[#94a3b8]">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {list.map((c, i) => (
        <span key={c.id} className="text-[#f4f4f6]">
          {c.name} <span className="text-[10px] text-[#94a3b8] font-mono" style={mono}>({c.files} files)</span>
          {i < list.length - 1 && <span className="text-[#94a3b8]">,</span>}
        </span>
      ))}
    </span>
  );
}

function Files({ files }: { files: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, FILES_SHOWN);
  return (
    <>
      <ul className="mt-1 space-y-0.5 text-[11px] font-mono text-[#94a3b8] break-all" style={mono}>
        {shown.map(f => <li key={f}>{f}</li>)}
      </ul>
      {files.length > FILES_SHOWN && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-1 text-[11px] text-[#93c5fd] hover:underline">
          {all ? 'Show fewer' : `Show all ${files.length} files`}
        </button>
      )}
    </>
  );
}

function Row({ row }: { row: ChangeRow }) {
  const shared = row.links.reduce((n, l) => n + l.shared.length, 0);
  return (
    <div className="p-5 hover:bg-[#161d24]/50 transition-colors">
      <div className="flex items-center gap-2 mb-2"><Badge kind={row.kind} /></div>
      <div className="text-sm font-bold flex flex-wrap items-center gap-2 mb-1">
        <Names list={row.before} />
        <ArrowRight size={14} className="text-[#93c5fd] shrink-0" aria-label="became" />
        <Names list={row.after} />
      </div>
      <p className="text-xs text-[#94a3b8]">{row.explanation}</p>
      {row.links.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-[#93c5fd] select-none">Evidence: {shared} shared {shared === 1 ? 'file' : 'files'}</summary>
          <div className="mt-2 space-y-3 border-l border-[#242527] pl-3">
            {row.links.map(l => (
              <div key={`${l.before}>${l.after}`}>
                <div className="text-xs text-[#f4f4f6]">{l.beforeName} → {l.afterName}</div>
                <div className="text-[11px] text-[#94a3b8]">{linkStrength(l)}</div>
                <Files files={l.shared} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const workspaceLink = (projectId: string, snapshotId: string) => `/workspace/${projectId}${serializeHash({ project: projectId, snapshot: snapshotId })}`;

export default function ComponentMatchPanel({ projectId, baseId, targetId, result, error, loading }: {
  projectId: string;
  baseId: string;
  targetId: string;
  result: ComponentMatchResult | null;
  error: string | null;
  loading: boolean;
}) {
  const [showKept, setShowKept] = useState(false);

  const header = (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase flex items-center gap-2">
        <GitMerge size={16} className="text-[#93c5fd]" />
        Component Matching
      </h3>
      <p className="text-xs text-[#94a3b8] mt-1 max-w-3xl">
        Which component became which. Components are matched through the files they share, not by name, so a component
        renamed by a new grouping is still recognised.
      </p>
    </div>
  );

  if (loading) {
    return <section className="shrink-0">{header}<div className="bg-[#11161b] border border-[#242527] p-5 text-xs text-[#94a3b8]">Matching components…</div></section>;
  }
  if (error) {
    return (
      <section className="shrink-0">
        {header}
        <div className="bg-[#11161b] border border-[#ffb03a]/30 p-5 text-xs text-[#f4f4f6] space-y-3" role="status">
          <div className="flex items-start gap-2"><AlertTriangle size={14} className="text-[#ffb03a] shrink-0 mt-0.5" /><span>{error}</span></div>
          <div className="flex flex-wrap gap-4">
            <Link className="text-[#93c5fd] hover:underline" to={workspaceLink(projectId, baseId)}>Open base revision in workspace</Link>
            <Link className="text-[#93c5fd] hover:underline" to={workspaceLink(projectId, targetId)}>Open target revision in workspace</Link>
          </div>
        </div>
      </section>
    );
  }
  if (!result) return null;

  const rows = changeRows(result);
  const kept = rows.filter(r => !r.structural).length;
  const visible = showKept ? rows : rows.filter(r => r.structural);
  const { summary, files } = result.matching;
  const swapped = result.before.snapshot.id !== baseId;
  const stale = [result.before, result.after].filter(s => s.stale).map(s => s.snapshot.hash);

  return (
    <section className="shrink-0" aria-label="Component matching">
      {header}

      {(swapped || stale.length > 0) && (
        <div className="mb-3 space-y-1 text-xs text-[#ffb03a]">
          {swapped && <p>The target revision is older than the base, so it is shown as "before".</p>}
          {stale.length > 0 && <p>The components of {stale.join(' and ')} were grouped from an older analysis; regenerate them in the workspace for an exact match.</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {CHANGE_KINDS.filter(k => summary[k] > 0).map(k => (
          <div key={k} className="flex items-center gap-2 bg-[#161d24] border border-[#242527] px-3 py-2">
            <Badge kind={k} />
            <span className="text-sm font-bold font-mono text-[#f4f4f6]" style={mono}>{summary[k]}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 bg-[#161d24] border border-[#242527] px-3 py-2 text-[11px] text-[#94a3b8] font-mono" style={mono}>
          <span>{files.common} files kept</span>
          {files.moved > 0 && <span>{files.moved} moved</span>}
          <span className="text-[#22c55e]">+{files.added}</span>
          <span className="text-[#ef4444]">-{files.removed}</span>
        </div>
      </div>

      {!hasStructuralChange(summary) && (
        <p className="mb-3 text-xs text-[#94a3b8]">No structural change: every component continues with the same files.</p>
      )}

      <div className="bg-[#11161b] border border-[#242527] overflow-hidden divide-y divide-[#242527]">
        {visible.map(r => <Row key={r.key} row={r} />)}
        {kept > 0 && (
          <button type="button" onClick={() => setShowKept(v => !v)} className="w-full p-3 text-xs text-[#93c5fd] hover:bg-[#161d24]/50 text-left">
            {showKept ? 'Hide unchanged components' : `Show ${kept} unchanged ${kept === 1 ? 'component' : 'components'}`}
          </button>
        )}
      </div>

      {result.matching.moves.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-[#93c5fd] select-none">
            {result.matching.moves.length} files treated as moved (same unique file name in a new folder)
          </summary>
          <ul className="mt-2 space-y-0.5 text-[11px] font-mono text-[#94a3b8] break-all" style={mono}>
            {result.matching.moves.map(m => <li key={m.from}>{m.from} → {m.to}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
