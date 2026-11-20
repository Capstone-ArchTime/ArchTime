import { useMemo, useState } from 'react';
import { Button, ConfigProvider, Drawer, Empty, Input, Tag } from 'antd';
import { ArrowLeft, ArrowRight, FileCode2, Search } from 'lucide-react';
import type { CompareFile, FileLink, FileStatus } from '@/features/compare-graph';
import { OTHER, filesOfGroup } from '@/features/compare-graph';
import { defineMessages, message, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  added: 'Added', addedText: 'New in the newer revision.', removed: 'Removed', removedText: 'Gone from the newer revision.',
  changed: 'Imports changed', changedText: 'In both revisions; what it imports changed.', same: 'Unchanged', sameText: 'In both revisions with the same imports.',
  linkAdded: 'added in the newer revision', linkRemoved: 'removed in the newer revision', linkSame: 'in both revisions', none: 'None.',
  presence: 'Before: {before} · After: {after}', present: 'present', absent: 'not there', imports: 'Imports', importsHint: 'Files this one uses. + added, − removed between the two revisions.',
  importedBy: 'Imported by', importedByHint: 'Files that use this one.',
  readFrom: 'Read from the imports mined at the two commits. A file whose code changed without touching its imports shows as unchanged here; its commits are on the Changes & Evidence page.',
  otherFolders: 'Other folders', fileCount: '· {count} files', fileCount_one: '· 1 file', allIn: 'All files in {folder}', otherLower: 'other folders',
  find: 'Find a file', findLabel: 'Find a file in this folder', filesIn: 'Files in {folder}', fileLine: '{dir} · {imports} imports · used by {used}',
  noMatch: 'No file matches.', noFiles: 'No files.', more: 'Show {n} more of {rest}',
}, {
  added: 'Thêm', addedText: 'Mới có ở phiên bản mới hơn.', removed: 'Xoá', removedText: 'Không còn ở phiên bản mới hơn.',
  changed: 'Đổi import', changedText: 'Có ở cả hai phiên bản; các import đã thay đổi.', same: 'Không đổi', sameText: 'Có ở cả hai phiên bản với cùng các import.',
  linkAdded: 'được thêm ở phiên bản mới hơn', linkRemoved: 'bị xoá ở phiên bản mới hơn', linkSame: 'có ở cả hai phiên bản', none: 'Không có.',
  presence: 'Trước: {before} · Sau: {after}', present: 'có', absent: 'không có', imports: 'Import', importsHint: 'Các tệp mà tệp này dùng. + thêm, − xoá giữa hai phiên bản.',
  importedBy: 'Được import bởi', importedByHint: 'Các tệp dùng tệp này.',
  readFrom: 'Lấy từ các import đã mining ở hai commit. Tệp có mã đổi mà không đụng tới import sẽ hiện là không đổi ở đây; các commit của nó nằm ở trang Thay đổi & Bằng chứng.',
  otherFolders: 'Thư mục khác', fileCount: '· {count} tệp', allIn: 'Mọi tệp trong {folder}', otherLower: 'thư mục khác',
  find: 'Tìm tệp', findLabel: 'Tìm tệp trong thư mục này', filesIn: 'Các tệp trong {folder}', fileLine: '{dir} · {imports} import · được dùng bởi {used}',
  noMatch: 'Không có tệp nào khớp.', noFiles: 'Không có tệp.', more: 'Hiện thêm {n} trong {rest}',
});

const STATUS: Record<FileStatus, { label: 'added' | 'removed' | 'changed' | 'same'; color: string; text: 'addedText' | 'removedText' | 'changedText' | 'sameText' }> = {
  added: { label: 'added', color: 'green', text: 'addedText' },
  removed: { label: 'removed', color: 'red', text: 'removedText' },
  changed: { label: 'changed', color: 'gold', text: 'changedText' },
  same: { label: 'same', color: 'default', text: 'sameText' },
};
const LINK_MARK: Record<FileLink['status'], { mark: string; className: string; label: 'linkAdded' | 'linkRemoved' | 'linkSame' }> = {
  added: { mark: '+', className: 'text-green-300', label: 'linkAdded' },
  removed: { mark: '−', className: 'text-red-300', label: 'linkRemoved' },
  same: { mark: '·', className: 'text-[var(--at-muted)]', label: 'linkSame' },
};
/** Files rendered at a time; a folder can hold hundreds. */
const PAGE = 100;
/** The drawer slides in faster than antd's default 0.3 s, so a click on a folder answers at once (nested: the page theme is kept). */
const FAST = { token: { motionDurationSlow: '0.15s', motionDurationMid: '0.1s' } };
const nameOf = (path: string) => path.split('/').pop() ?? path;
const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

function Links({ title, hint, links, onOpen, known }: { title: string; hint: string; links: FileLink[]; onOpen: (path: string) => void; known: (path: string) => boolean }) {
  return <section className="space-y-2">
    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--at-muted)]">{title} <span className="normal-case tracking-normal">({links.length})</span></h4>
    <p className="text-xs text-[var(--at-muted)]">{hint}</p>
    {links.length ? <ul className="space-y-1">
      {links.map(l => { const m = LINK_MARK[l.status]; return <li key={l.path}>
        <button type="button" disabled={!known(l.path)} onClick={() => onOpen(l.path)} aria-label={`${l.path}, ${message(MSG, m.label)}`}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--at-panel-2)] disabled:cursor-default disabled:hover:bg-transparent">
          <span aria-hidden="true" className={`w-3 shrink-0 text-center font-bold ${m.className}`}>{m.mark}</span>
          <span className="min-w-0 truncate"><span className="text-[var(--at-text)]">{nameOf(l.path)}</span> <span className="text-[var(--at-muted)]">{dirOf(l.path)}</span></span>
        </button>
      </li>; })}
    </ul> : <p className="text-xs text-[var(--at-muted)]">{message(MSG, 'none')}</p>}
  </section>;
}

function FileDetail({ file, onOpen, known }: { file: CompareFile; onOpen: (path: string) => void; known: (path: string) => boolean }) {
  const s = STATUS[file.status];
  const m = useMessages(MSG);
  return <div className="space-y-5">
    <div className="space-y-2">
      <p className="break-all font-mono text-sm text-[var(--at-text)]">{file.path}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={s.color}>{m(s.label)}</Tag>
        {file.type && <Tag>{file.type}</Tag>}
        <span className="text-xs text-[var(--at-muted)]">{m('presence', { before: file.inBase ? m('present') : m('absent'), after: file.inTarget ? m('present') : m('absent') })}</span>
      </div>
      <p className="text-xs text-[var(--at-muted)]">{m(s.text)}</p>
    </div>
    <Links title={m('imports')} hint={m('importsHint')} links={file.imports} onOpen={onOpen} known={known} />
    <Links title={m('importedBy')} hint={m('importedByHint')} links={file.importedBy} onOpen={onOpen} known={known} />
    <p className="border-t border-[var(--at-line)] pt-3 text-[11px] text-[var(--at-muted)]">
      {m('readFrom')}
    </p>
  </div>;
}

/** The files of one folder box of the Compare drawing, and the details of one file: its imports before and after. */
export default function CompareFilesDrawer({ group, file, files, onFile, onClose }: {
  group: string | null; file: string | null; files: Map<string, CompareFile>;
  onFile: (path: string | null) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const m = useMessages(MSG);
  // How many files are shown, per folder: another folder starts again at one page.
  const [paging, setPaging] = useState<{ group: string | null; limit: number }>({ group, limit: PAGE });
  const limit = paging.group === group ? paging.limit : PAGE;
  const setLimit = (next: (n: number) => number) => setPaging({ group, limit: next(limit) });
  const open = !!group;
  // The folder's files are sorted once per folder; typing only filters that list. A big folder renders a page at a time.
  const all = useMemo(() => (group ? filesOfGroup(files, group) : []), [files, group]);
  const list = useMemo(() => { const q = query.trim().toLowerCase(); return q ? all.filter(f => f.path.toLowerCase().includes(q)) : all; }, [all, query]);
  const total = all.length;
  const current = file ? files.get(file) : undefined;
  const folderName = group === OTHER ? m('otherFolders') : group ?? '';
  const known = (path: string) => files.has(path);
  return <ConfigProvider theme={FAST}><Drawer open={open} onClose={() => { setQuery(''); setLimit(() => PAGE); onClose(); }} size={520} destroyOnHidden
    title={current ? <span className="flex items-center gap-2"><FileCode2 size={16} aria-hidden="true" />{nameOf(current.path)}</span> : <span>{folderName} <span className="text-sm font-normal text-[var(--at-muted)]">{m('fileCount', { count: total })}</span></span>}>
    {current ? <div className="space-y-4">
      <Button size="small" icon={<ArrowLeft size={14} />} onClick={() => onFile(null)}>{m('allIn', { folder: current.group === OTHER ? m('otherLower') : current.group })}</Button>
      <FileDetail file={current} onOpen={onFile} known={known} />
    </div> : <div className="space-y-3">
      <Input allowClear prefix={<Search size={14} aria-hidden="true" />} placeholder={m('find')} aria-label={m('findLabel')} value={query} onChange={e => setQuery(e.target.value)} />
      {list.length ? <ul className="space-y-1" aria-label={m('filesIn', { folder: folderName })}>
        {list.slice(0, limit).map(f => { const s = STATUS[f.status]; return <li key={f.path}>
          <button type="button" onClick={() => onFile(f.path)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--at-panel-2)]">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[var(--at-text)]">{nameOf(f.path)}</span>
              <span className="block truncate text-xs text-[var(--at-muted)]">{m('fileLine', { dir: dirOf(f.path), imports: f.imports.length, used: f.importedBy.length })}</span>
            </span>
            {f.status !== 'same' && <Tag color={s.color} className="!m-0 shrink-0">{m(s.label)}</Tag>}
            <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--at-muted)]" />
          </button>
        </li>; })}
      </ul> : <Empty description={query ? m('noMatch') : m('noFiles')} />}
      {list.length > limit && <Button block onClick={() => setLimit(n => n + PAGE)}>{m('more', { n: Math.min(PAGE, list.length - limit), rest: list.length - limit })}</Button>}
    </div>}
  </Drawer></ConfigProvider>;
}
