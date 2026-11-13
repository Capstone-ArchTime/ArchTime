import { useState } from 'react';
import { Button, Drawer, Empty, Input, Tag } from 'antd';
import { ArrowLeft, ArrowRight, FileCode2, Search } from 'lucide-react';
import type { CompareFile, FileLink, FileStatus } from '@/features/compare-graph';
import { OTHER, filesOfGroup } from '@/features/compare-graph';

const STATUS: Record<FileStatus, { label: string; color: string; text: string }> = {
  added: { label: 'Added', color: 'green', text: 'New in the newer revision.' },
  removed: { label: 'Removed', color: 'red', text: 'Gone from the newer revision.' },
  changed: { label: 'Imports changed', color: 'gold', text: 'In both revisions; what it imports changed.' },
  same: { label: 'Unchanged', color: 'default', text: 'In both revisions with the same imports.' },
};
const LINK_MARK: Record<FileLink['status'], { mark: string; className: string; label: string }> = {
  added: { mark: '+', className: 'text-green-300', label: 'added in the newer revision' },
  removed: { mark: '−', className: 'text-red-300', label: 'removed in the newer revision' },
  same: { mark: '·', className: 'text-[var(--at-muted)]', label: 'in both revisions' },
};
const nameOf = (path: string) => path.split('/').pop() ?? path;
const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

function Links({ title, hint, links, onOpen, known }: { title: string; hint: string; links: FileLink[]; onOpen: (path: string) => void; known: (path: string) => boolean }) {
  return <section className="space-y-2">
    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--at-muted)]">{title} <span className="normal-case tracking-normal">({links.length})</span></h4>
    <p className="text-xs text-[var(--at-muted)]">{hint}</p>
    {links.length ? <ul className="space-y-1">
      {links.map(l => { const m = LINK_MARK[l.status]; return <li key={l.path}>
        <button type="button" disabled={!known(l.path)} onClick={() => onOpen(l.path)} aria-label={`${l.path}, ${m.label}`}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--at-panel-2)] disabled:cursor-default disabled:hover:bg-transparent">
          <span aria-hidden="true" className={`w-3 shrink-0 text-center font-bold ${m.className}`}>{m.mark}</span>
          <span className="min-w-0 truncate"><span className="text-[var(--at-text)]">{nameOf(l.path)}</span> <span className="text-[var(--at-muted)]">{dirOf(l.path)}</span></span>
        </button>
      </li>; })}
    </ul> : <p className="text-xs text-[var(--at-muted)]">None.</p>}
  </section>;
}

function FileDetail({ file, onOpen, known }: { file: CompareFile; onOpen: (path: string) => void; known: (path: string) => boolean }) {
  const s = STATUS[file.status];
  return <div className="space-y-5">
    <div className="space-y-2">
      <p className="break-all font-mono text-sm text-[var(--at-text)]">{file.path}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={s.color}>{s.label}</Tag>
        {file.type && <Tag>{file.type}</Tag>}
        <span className="text-xs text-[var(--at-muted)]">Before: {file.inBase ? 'present' : 'not there'} · After: {file.inTarget ? 'present' : 'not there'}</span>
      </div>
      <p className="text-xs text-[var(--at-muted)]">{s.text}</p>
    </div>
    <Links title="Imports" hint="Files this one uses. + added, − removed between the two revisions." links={file.imports} onOpen={onOpen} known={known} />
    <Links title="Imported by" hint="Files that use this one." links={file.importedBy} onOpen={onOpen} known={known} />
    <p className="border-t border-[var(--at-line)] pt-3 text-[11px] text-[var(--at-muted)]">
      Read from the imports mined at the two commits. A file whose code changed without touching its imports shows as unchanged here; its commits are on the Changes &amp; Evidence page.
    </p>
  </div>;
}

/** The files of one folder box of the Compare drawing, and the details of one file: its imports before and after. */
export default function CompareFilesDrawer({ group, file, files, onFile, onClose }: {
  group: string | null; file: string | null; files: Map<string, CompareFile>;
  onFile: (path: string | null) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const open = !!group;
  const list = group ? filesOfGroup(files, group, query) : [];
  const total = group ? filesOfGroup(files, group).length : 0;
  const current = file ? files.get(file) : undefined;
  const folderName = group === OTHER ? 'Other folders' : group ?? '';
  const known = (path: string) => files.has(path);
  return <Drawer open={open} onClose={() => { setQuery(''); onClose(); }} size={520} destroyOnHidden
    title={current ? <span className="flex items-center gap-2"><FileCode2 size={16} aria-hidden="true" />{nameOf(current.path)}</span> : <span>{folderName} <span className="text-sm font-normal text-[var(--at-muted)]">· {total} file{total === 1 ? '' : 's'}</span></span>}>
    {current ? <div className="space-y-4">
      <Button size="small" icon={<ArrowLeft size={14} />} onClick={() => onFile(null)}>All files in {current.group === OTHER ? 'other folders' : current.group}</Button>
      <FileDetail file={current} onOpen={onFile} known={known} />
    </div> : <div className="space-y-3">
      <Input allowClear prefix={<Search size={14} aria-hidden="true" />} placeholder="Find a file" aria-label="Find a file in this folder" value={query} onChange={e => setQuery(e.target.value)} />
      {list.length ? <ul className="space-y-1" aria-label={`Files in ${folderName}`}>
        {list.map(f => { const s = STATUS[f.status]; return <li key={f.path}>
          <button type="button" onClick={() => onFile(f.path)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--at-panel-2)]">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[var(--at-text)]">{nameOf(f.path)}</span>
              <span className="block truncate text-xs text-[var(--at-muted)]">{dirOf(f.path)} · {f.imports.length} imports · used by {f.importedBy.length}</span>
            </span>
            {f.status !== 'same' && <Tag color={s.color} className="!m-0 shrink-0">{s.label}</Tag>}
            <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--at-muted)]" />
          </button>
        </li>; })}
      </ul> : <Empty description={query ? 'No file matches.' : 'No files.'} />}
    </div>}
  </Drawer>;
}
