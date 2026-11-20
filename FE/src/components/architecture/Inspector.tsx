import { Fragment } from 'react';
import { Tag } from 'antd';
import { Link } from 'react-router-dom';
import type { ArchitectureView } from '@/features/architecture/types';
import type { Scene } from '@/features/architecture/scene';
import { ROLE_LABEL } from '@/features/architecture/scene';
import type { DiagramTheme } from '@/features/architecture/theme';
import type { Highlight } from '@/features/architecture/highlight';
import { IMPACT_NOTE, commitsTouchingComponent, componentDelta, deltaText, evidenceLink, shortDate, shortHash } from '@/features/evidence-bridge';
import type { CommitImpactsState } from '@/features/useCommitImpacts';
import { translateOr } from '@/i18n';
import { defineMessages, useMessages } from '@/i18n/define';

// The label tells how a component's ROLE was decided, never how well the component is proven: ArchTime's own grouping is always computed.
const MSG = defineMessages({
  helpFACT: 'Set by hand, as in the samples. ArchTime does not give this label to components it computes.',
  helpINFERENCE: 'The role was decided from folder names that matched a known pattern, or by an AI model reading file paths. It is a best guess, not read from the code.',
  helpUNKNOWN: 'No role could be decided from the folder names or file paths.',
  loadFailed: 'Could not load the commits ({message}).', tryAgain: 'Try again', looking: 'Looking through the recent commits…',
  notGrouped: 'This snapshot is not grouped into components yet, so commits cannot be matched to this one.',
  noChanges: 'No recorded changes to this component in the {n} most recent commits.', openEvidence: 'Open the evidence for commit {hash}', untitled: 'Untitled change',
  andMore: 'and {n} more among the recent commits', skipped: '{count} recent commits have no mined snapshot and could not be checked.', skipped_one: '1 recent commit has no mined snapshot and could not be checked.',
  impactNote: 'INFERENCE: computed by comparing mined snapshots.',
  changedIn: 'Changed in commits', routeDetails: 'Route details', routes: 'Routes', routesHint: 'Directed dependency paths, shortest first. The shortest is drawn in amber.',
  shortest: 'Shortest', alternative: 'Alternative {n}', hops: '{count} hops', hops_one: '1 hop',
  dependencyDetails: 'Dependency details', dependency: 'Dependency', backFile: '{count} file-level dependencies back this arrow.', backFile_one: '1 file-level dependency backs this arrow.',
  backClass: '{count} class-level dependencies back this arrow.', backClass_one: '1 class-level dependency backs this arrow.', evidence: 'Evidence',
  staticFile: 'Static import analysis, file level (the line is not recorded).', staticClass: 'Static import analysis (the line is not recorded).',
  componentDetails: 'Component details', component: 'Component', showFiles: 'SHOW {count} FILES', showFiles_one: 'SHOW 1 FILE', showClasses: 'SHOW {count} CLASSES', showClasses_one: 'SHOW 1 CLASS',
  dependsOn: 'Depends on ({n})', usedBy: 'Used by ({n})', details: 'Details', outside: 'Outside component', file: 'File', class: 'Class',
  summary: 'Diagram summary', overview: 'Overview', files: 'Files', classes: 'Classes',
  consistentTip: 'Every arrow can be traced to the mined import edges. This checks the drawing against the mined data, not against the repository itself.', consistent: '✓ Consistent with the import graph',
  overviewFile: ' · {nodes} components, {edges} dependencies. Every arrow is computed from file-level dependencies; select one to see them.',
  overviewClass: ' · {nodes} components, {edges} dependencies. Every arrow is computed from class-level dependencies; select one to see them.',
  innerFiles: '{n} files. Dashed boxes are components outside this one.', innerClasses: '{n} classes. Dashed boxes are components outside this one.',
  howTo: 'How to read this',
  how1: 'Click a box to focus it; double-click (or Shift + Enter) to show what is inside.',
  how2: 'Rows are architectural tiers; arrows point from the dependent to what it uses.',
  how3: 'Dashed arrows point upward, against the tier order; red arrows are circular dependencies.',
  how4: 'FACT / INFERENCE / UNKNOWN shows how a component\'s role was decided: folder names matched, or an AI model reading file paths. It does not say how well the component is proven.',
  how5: 'The grouping into components is computed from import dependencies, so it is an inference. The dependencies and the commits behind it are the facts.',
  none: 'None', showDeps: 'Show {n} dependencies to {label}',
}, {
  helpFACT: 'Được đặt thủ công, như trong các bản mẫu. ArchTime không gắn nhãn này cho thành phần do nó tự tính.',
  helpINFERENCE: 'Vai trò được suy ra từ tên thư mục khớp một mẫu đã biết, hoặc do mô hình AI đọc đường dẫn tệp. Đây là phỏng đoán tốt nhất, không đọc từ mã.',
  helpUNKNOWN: 'Không suy ra được vai trò từ tên thư mục hay đường dẫn tệp.',
  loadFailed: 'Không tải được các commit ({message}).', tryAgain: 'Thử lại', looking: 'Đang xem các commit gần đây…',
  notGrouped: 'Ảnh chụp này chưa được nhóm thành các thành phần, nên chưa đối chiếu commit với thành phần này được.',
  noChanges: 'Không có thay đổi nào được ghi nhận cho thành phần này trong {n} commit gần nhất.', openEvidence: 'Mở bằng chứng của commit {hash}', untitled: 'Thay đổi không có tiêu đề',
  andMore: 'và thêm {n} commit gần đây', skipped: '{count} commit gần đây chưa có ảnh chụp đã mining nên chưa kiểm tra được.',
  impactNote: 'INFERENCE: tính bằng cách so sánh các ảnh chụp đã mining.',
  changedIn: 'Thay đổi trong các commit', routeDetails: 'Chi tiết đường đi', routes: 'Đường đi', routesHint: 'Các đường phụ thuộc có hướng, ngắn nhất trước. Đường ngắn nhất được tô màu hổ phách.',
  shortest: 'Ngắn nhất', alternative: 'Phương án {n}', hops: '{count} bước',
  dependencyDetails: 'Chi tiết phụ thuộc', dependency: 'Phụ thuộc', backFile: '{count} phụ thuộc mức tệp tạo nên mũi tên này.',
  backClass: '{count} phụ thuộc mức lớp tạo nên mũi tên này.', evidence: 'Bằng chứng',
  staticFile: 'Phân tích import tĩnh, mức tệp (không ghi lại số dòng).', staticClass: 'Phân tích import tĩnh (không ghi lại số dòng).',
  componentDetails: 'Chi tiết thành phần', component: 'Thành phần', showFiles: 'HIỆN {count} TỆP', showClasses: 'HIỆN {count} LỚP',
  dependsOn: 'Phụ thuộc vào ({n})', usedBy: 'Được dùng bởi ({n})', details: 'Chi tiết', outside: 'Thành phần bên ngoài', file: 'Tệp', class: 'Lớp',
  summary: 'Tóm tắt sơ đồ', overview: 'Tổng quan', files: 'Tệp', classes: 'Lớp',
  consistentTip: 'Mọi mũi tên đều truy được về các cạnh import đã mining. Việc này kiểm tra hình vẽ theo dữ liệu đã mining, không theo repository.', consistent: '✓ Khớp với đồ thị import',
  overviewFile: ' · {nodes} thành phần, {edges} phụ thuộc. Mỗi mũi tên được tính từ các phụ thuộc mức tệp; chọn một mũi tên để xem.',
  overviewClass: ' · {nodes} thành phần, {edges} phụ thuộc. Mỗi mũi tên được tính từ các phụ thuộc mức lớp; chọn một mũi tên để xem.',
  innerFiles: '{n} tệp. Các hộp viền đứt là thành phần bên ngoài thành phần này.', innerClasses: '{n} lớp. Các hộp viền đứt là thành phần bên ngoài thành phần này.',
  howTo: 'Cách đọc sơ đồ',
  how1: 'Bấm vào một hộp để tập trung vào nó; bấm đúp (hoặc Shift + Enter) để xem bên trong.',
  how2: 'Mỗi hàng là một tầng kiến trúc; mũi tên đi từ phần phụ thuộc tới phần được dùng.',
  how3: 'Mũi tên nét đứt đi ngược lên, trái thứ tự tầng; mũi tên đỏ là phụ thuộc vòng.',
  how4: 'FACT / INFERENCE / UNKNOWN cho biết vai trò của thành phần được quyết định thế nào: khớp tên thư mục, hay do mô hình AI đọc đường dẫn tệp. Nhãn này không nói thành phần được chứng minh tốt đến đâu.',
  how5: 'Việc nhóm thành các thành phần được tính từ phụ thuộc import, nên đó là suy luận. Các phụ thuộc và commit đứng sau mới là sự thật.',
  none: 'Không có', showDeps: 'Xem {n} phụ thuộc tới {label}',
});

const heading = 'text-[10px] font-mono uppercase tracking-wider text-[var(--at-muted)] mb-2';
/** Recent commits shown for one component; the list asked from the server is longer. */
const COMMITS_SHOWN = 5;
const roleName = (role: keyof typeof ROLE_LABEL) => translateOr(`archRole.${role}`, ROLE_LABEL[role]);

/** The commits that changed the viewed snapshot's components; absent for samples, which belong to no workspace. */
export interface CommitSource { projectId: string; state: CommitImpactsState; onRetry: () => void }

/** A file-level view names things by their relative path, the class view by the last part of the dotted name. */
const evidenceName =(unit: ArchitectureView['unit'], id: string) => (unit === 'file' ? id : id.split('.').pop() ?? id);

/**
 * "Changed in commits" for one component: the recent commits whose change touched it, found by comparing mined snapshots
 * (so it is an inference, and says so). Loading, failure and "not grouped" never hide the rest of the inspector.
 */
export function ChangedInCommits({ projectId, componentId, state, onRetry }: { projectId: string; componentId: string } & Pick<CommitSource, 'state' | 'onRetry'>) {
  const m = useMessages(MSG);
  let body;
  if (state.status === 'error') {
    body = <p className="text-xs text-slate-300">{m('loadFailed', { message: state.message })} <button type="button" onClick={onRetry} className="text-[var(--at-link)] underline hover:text-[var(--at-link-hover)]">{m('tryAgain')}</button></p>;
  } else if (state.status !== 'done') {
    body = <p role="status" className="text-xs text-[var(--at-muted)]">{m('looking')}</p>;
  } else if (!state.impacts.grouped) {
    body = <p className="text-xs text-[var(--at-muted)]">{m('notGrouped')}</p>;
  } else {
    const all = commitsTouchingComponent(state.impacts, componentId);
    const shown = all.slice(0, COMMITS_SHOWN);
    body = <>
      {!shown.length && <p className="text-xs text-[var(--at-muted)]">{m('noChanges', { n: state.impacts.commits.length })}</p>}
      {shown.length > 0 && <ul className="space-y-1.5">{shown.map(c => {
        const delta = deltaText(componentDelta(c, componentId));
        return <li key={c.evidenceId || c.commit} className="border border-[var(--at-line)] p-2 text-xs">
          <div className="flex items-center gap-2">
            <Link to={evidenceLink(projectId, c.commit)} aria-label={m('openEvidence', { hash: shortHash(c.commit) })} className="shrink-0 border border-[var(--at-accent)]/50 px-1.5 font-mono text-[var(--at-link)] hover:bg-[var(--at-accent)]/10 hover:text-[var(--at-link-hover)]">{shortHash(c.commit)}</Link>
            <span className="min-w-0 truncate text-slate-200" title={c.title}>{c.title || m('untitled')}</span>
          </div>
          <div className="mt-0.5 text-[var(--at-muted)]">{[shortDate(c.date), delta].filter(Boolean).join(' · ')}</div>
        </li>;
      })}</ul>}
      {all.length > shown.length && <p className="mt-1 text-xs text-[var(--at-muted)]">{m('andMore', { n: all.length - shown.length })}</p>}
      {state.impacts.skipped > 0 && <p className="mt-1 text-xs text-[var(--at-muted)]">{m('skipped', { count: state.impacts.skipped })}</p>}
      <p className="mt-2 text-[11px] leading-snug text-[var(--at-muted)]">{m.language === 'en' ? IMPACT_NOTE : m('impactNote')}</p>
    </>;
  }
  return <section aria-label={m('changedIn')}><h3 className={heading}>{m('changedIn')}</h3>{body}</section>;
}

export default function Inspector({ view, scene, theme, selectedNode, selectedEdge, highlight, onSelectNode, onSelectEdge, onOpen, commits }: {
  view: ArchitectureView; scene: Scene; theme: DiagramTheme; selectedNode?: string; selectedEdge?: string; highlight: Highlight;
  onSelectNode: (id: string) => void; onSelectEdge: (id: string) => void; onOpen: (componentId: string) => void;
  commits?: CommitSource;
}) {
  const m = useMessages(MSG);
  const nameOf = (id: string) => scene.nodes.find(n => n.id === id)?.title ?? id;
  const edge = scene.edges.find(e => e.id === selectedEdge);
  const component = scene.mode === 'components' ? view.components.find(c => c.id === selectedNode) : undefined;
  const classNode = scene.mode === 'classes' ? scene.nodes.find(n => n.id === selectedNode) : undefined;
  const fileUnit = view.unit === 'file';

  if (highlight.routes.length) {
    return <aside aria-label={m('routeDetails')} className="space-y-4">
      <div><h3 className={heading}>{m('routes')}</h3><p className="text-xs text-[var(--at-muted)]">{m('routesHint')}</p></div>
      <ol className="space-y-2">{highlight.routes.map((r, i) => <li key={r.edges.join()} className="border border-[var(--at-line)] p-2 text-xs">
        <span className="text-[var(--at-muted)]">{i === 0 ? m('shortest') : m('alternative', { n: i })} · {m('hops', { count: r.edges.length })}</span>
        <div className="mt-1 leading-relaxed">{r.nodes.map((n, j) => <span key={n + j}>{j > 0 && <span className="text-[var(--at-muted)]"> → </span>}<button type="button" className="underline decoration-dotted" onClick={() => onSelectNode(n)}>{nameOf(n)}</button></span>)}</div>
      </li>)}</ol>
    </aside>;
  }
  if (edge) {
    return <aside aria-label={m('dependencyDetails')} className="space-y-4">
      <div><h3 className={heading}>{m('dependency')}</h3>
        <p className="text-sm font-semibold">{nameOf(edge.source)} <span className="text-[var(--at-muted)]">→</span> {nameOf(edge.target)}</p>
        <p className="text-xs text-[var(--at-muted)] mt-1">{m(fileUnit ? 'backFile' : 'backClass', { count: edge.weight })}</p></div>
      <div className="flex flex-wrap gap-1">{Object.entries(edge.kinds).map(([k, n]) => <Tag key={k}>{k} × {n}</Tag>)}</div>
      <div><h3 className={heading}>{m('evidence')}</h3>
        <ul className="space-y-1.5 max-h-80 overflow-auto pr-1">{edge.evidence.map((ev, i) => <li key={i} className="text-xs border border-[var(--at-line)] p-2">
          <div className="font-mono break-all">{evidenceName(view.unit, ev.fromClass)} → {evidenceName(view.unit, ev.toClass)}</div>
          <div className="text-[var(--at-muted)] mt-0.5 break-all">{ev.kind} · {ev.path}{ev.line ? `:${ev.line}` : ''}</div></li>)}</ul>
          {edge.evidence.some(ev => !ev.line) && <p className="mt-2 text-xs text-[var(--at-muted)]">{m(fileUnit ? 'staticFile' : 'staticClass')}</p>}</div>
    </aside>;
  }

  if (component) {
    const outgoing = view.edges.filter(e => e.source === component.id);
    const incoming = view.edges.filter(e => e.target === component.id);
    const members = view.classes.filter(c => c.componentId === component.id);
    return <aside aria-label={m('componentDetails')} className="space-y-4">
      <div>
        <h3 className={heading}>{m('component')}</h3>
        <p className="text-base font-semibold" style={{ color: theme.role[component.role] }}>{component.name}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1"><Tag>{roleName(component.role)}</Tag><Tag color={component.label === 'FACT' ? 'green' : component.label === 'INFERENCE' ? 'gold' : 'default'}>{component.label}</Tag></div>
        <p className="text-xs text-[var(--at-muted)] mt-1">{m(`help${component.label}`)}</p>
        <p className="text-sm mt-3 leading-relaxed">{component.description}</p>
      </div>
      <button type="button" onClick={() => onOpen(component.id)} className="w-full h-9 border border-[var(--at-accent)]/50 text-[var(--at-link)] text-xs font-bold hover:bg-[var(--at-accent)]/10">{m(fileUnit ? 'showFiles' : 'showClasses', { count: members.length })}</button>
      <List title={m('dependsOn', { n: outgoing.length })} items={outgoing.map(e => ({ id: e.target, label: nameOf(e.target), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
      <List title={m('usedBy', { n: incoming.length })} items={incoming.map(e => ({ id: e.source, label: nameOf(e.source), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
      {commits && <ChangedInCommits projectId={commits.projectId} componentId={component.id} state={commits.state} onRetry={commits.onRetry} />}
    </aside>;
  }

  if (classNode) {
    const cls = view.classes.find(c => c.id === classNode.id);
    const out = scene.edges.filter(e => e.source === classNode.id);
    const inn = scene.edges.filter(e => e.target === classNode.id);
    return <aside aria-label={m('details')} className="space-y-4">
      <div><h3 className={heading}>{classNode.kind === 'neighbour' ? m('outside') : fileUnit ? m('file') : m('class')}</h3><p className="text-base font-semibold">{classNode.title}</p>
        {cls && <p className="text-xs text-[var(--at-muted)] mt-1 break-all">{cls.path}</p>}</div>
      <List title={m('dependsOn', { n: out.length })} items={out.map(e => ({ id: e.target, label: nameOf(e.target), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
      <List title={m('usedBy', { n: inn.length })} items={inn.map(e => ({ id: e.source, label: nameOf(e.source), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
    </aside>;
  }

  return <aside aria-label={m('summary')} className="space-y-4">
    <div><h3 className={heading}>{scene.mode === 'components' ? m('overview') : fileUnit ? m('files') : m('classes')}</h3>
      <p className="text-sm leading-relaxed">{scene.mode === 'components'
        ? <><span className="text-[var(--at-success)]" title={m('consistentTip')}>{m('consistent')}</span>{m(fileUnit ? 'overviewFile' : 'overviewClass', { nodes: scene.nodes.length, edges: scene.edges.length })}</>
        : <>{m(fileUnit ? 'innerFiles' : 'innerClasses', { n: scene.nodes.filter(n => n.kind === 'class').length })}</>}</p></div>
    <details className="group text-xs">
      <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wider text-slate-300 hover:text-white">{m('howTo')}</summary>
      <ul className="mt-2 space-y-1 leading-relaxed text-slate-300">
        {(['how1', 'how2', 'how3', 'how4', 'how5'] as const).map(key => <Fragment key={key}><li>{m(key)}</li></Fragment>)}
      </ul>
    </details>
  </aside>;
}

function List({ title, items, onNode, onEdge }: { title: string; items: { id: string; label: string; edge: string; weight: number }[]; onNode: (id: string) => void; onEdge: (id: string) => void }) {
  const m = useMessages(MSG);
  if (!items.length) return <div><h3 className={heading}>{title}</h3><p className="text-xs text-[var(--at-muted)]">{m('none')}</p></div>;
  return <div><h3 className={heading}>{title}</h3><ul className="space-y-1">{items.map(i => <li key={i.edge} className="flex items-center justify-between gap-2 text-xs">
    <button type="button" className="text-left hover:underline" onClick={() => onNode(i.id)}>{i.label}</button>
    <button type="button" aria-label={m('showDeps', { n: i.weight, label: i.label })} className="font-mono text-[var(--at-muted)] border border-[var(--at-line)] px-1.5 hover:border-[var(--at-accent)]" onClick={() => onEdge(i.edge)}>{i.weight}</button></li>)}</ul></div>;
}
