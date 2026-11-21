import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Progress, Select, Spin, Tag, Tooltip } from 'antd';
import { MAP_KIND, computedMapKind } from '@/features/canonical-map';
import { ArrowLeft, ChevronDown, Pickaxe, RefreshCw, Sparkles, Workflow } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { roleHome } from '@/auth/permissions';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ArchitectureViewer from '@/components/architecture/ArchitectureViewer';
import LayersPanel from '@/components/architecture/LayersPanel';
import ModelPicker, { RunUsage } from '@/components/architecture/ModelPicker';
import QualityPanel from '@/components/architecture/QualityPanel';
import AccountMenu from '@/components/AccountMenu';
import MiningPanel from '@/components/MiningPanel';
import { FIXTURES, getFixture } from '@/features/architecture/fixtures';
import { getLineage } from '@/features/architecture/api';
import type { RefineReceipt } from '@/features/architecture/api';
import { EVOLUTION_MARK, evolutionAt, historyOf } from '@/features/architecture/evolution';
import type { Evolution, LineagePayload } from '@/features/architecture/evolution';
import type { ExportMeta } from '@/features/architecture/export-file';
import type { IssueAction } from '@/features/architecture/issues';
import { parseHash } from '@/features/architecture/url-state';
import type { ViewerState } from '@/features/architecture/url-state';
import { useFocusMode } from '@/features/architecture/useFocusMode';
import { useHash, useProjectArchitecture } from '@/features/architecture/useProjectArchitecture';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { getWorkspace } from '@/features/workspace-summary';
import { formatDate, formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  aiRefinement: 'AI refinement', accepted: 'Accepted after {count} attempts', accepted_one: 'Accepted after 1 attempt', namesOnly: ' (names only)', namesOnlyNarrowed: ' (names only: {narrowed})', moved: '; {pct}% of files moved',
  noAnswer: 'No usable AI answer; the grouping by dependencies is shown. Verifier codes per attempt:',
  evolution: 'Evolution', firstSnapshot: 'The first snapshot with components: nothing earlier to compare with.', since: 'Since {hash}', noChange: ': no component was added, split, merged, renamed or removed.', gone: 'GONE',
  matchedFiles: 'Matched through the files each component holds. A split or merge needs files added, deleted or moved, as in Compare.',
  workspace: 'Workspace', pageTitle: '{title} · Architecture · ArchTime', sample: 'Sample · {label}',
  refine: 'Refine with AI', group: 'Group with AI', aiUnavailable: 'AI refinement is not available', sendsPaths: 'Sends file paths to {host} ({model}); asks first', usesLocal: 'Uses {model} on {host}; nothing leaves your network',
  architecture: 'Architecture', computed: 'Computed, not the canonical map. The canonical map is the component diagram a maintainer confirms.', snapshot: 'Snapshot {hash}', generated: ' · generated {date}',
  howMade: 'How these components were made', madeAi: 'Grouped by dependency clustering, then named and refined by an AI model; the answer was verified, and every arrow still comes from file dependencies.',
  madeCluster: 'Grouped by dependency clustering and named from folder names.', quality: 'Quality', aboutSample: 'About this sample',
  sampleBody: 'A hand-built example that follows the same rules as real output. Open one of your workspaces to see its own architecture.',
  backLabel: 'Back to the previous page', back: 'Back', homeLabel: 'ArchTime: dashboard', switchLabel: 'Switch workspace (now {title})', snapshotLabel: 'Snapshot', latest: 'Latest snapshot',
  readOnlyTip: 'Only maintainers of this workspace can mine it or define its architecture with AI.', readOnly: 'Read only', mineTip: "Scan and mine the repository's history", mine: 'Mine',
  regenerateTip: 'Group the files again by their dependencies (no AI)', regenerate: 'Regenerate', details: 'Workspace details', compare: 'Compare revisions', usage: 'AI usage',
  dashboard: 'Dashboard', workspaces: 'Workspaces', allArch: 'All architectures', more: 'More', snapshots: 'Snapshots', loading: 'Loading architecture…',
  loadFailed: 'Could not load the architecture', retry: 'Retry', noComponents: 'No components for this snapshot yet', groupHint: 'Group its files into components to draw the architecture.',
  notGrouped: 'A maintainer of this workspace has not grouped its files yet.', groupFiles: 'Group files into components', unknownSample: 'Unknown sample',
}, {
  aiRefinement: 'Tinh chỉnh bằng AI', accepted: 'Được chấp nhận sau {count} lần thử', namesOnly: ' (chỉ đặt tên)', namesOnlyNarrowed: ' (chỉ đặt tên: {narrowed})', moved: '; {pct}% tệp được chuyển chỗ',
  noAnswer: 'Không có câu trả lời AI dùng được; đang hiển thị cách nhóm theo phụ thuộc. Mã kiểm chứng của từng lần thử:',
  evolution: 'Tiến hoá', firstSnapshot: 'Ảnh chụp đầu tiên có thành phần: chưa có gì trước đó để so sánh.', since: 'Từ {hash}', noChange: ': không có thành phần nào được thêm, tách, gộp, đổi tên hay xoá.', gone: 'ĐÃ XOÁ',
  matchedFiles: 'Đối chiếu theo các tệp mỗi thành phần chứa. Tách hay gộp cần có tệp được thêm, xoá hoặc chuyển chỗ, như trong So sánh.',
  workspace: 'Không gian làm việc', pageTitle: '{title} · Kiến trúc · ArchTime', sample: 'Bản mẫu · {label}',
  refine: 'Tinh chỉnh bằng AI', group: 'Nhóm bằng AI', aiUnavailable: 'Chưa dùng được tính năng tinh chỉnh bằng AI', sendsPaths: 'Gửi đường dẫn tệp tới {host} ({model}); sẽ hỏi trước', usesLocal: 'Dùng {model} trên {host}; không có gì rời khỏi mạng của bạn',
  architecture: 'Kiến trúc', computed: 'Được tính tự động, chưa phải bản đồ chính thức. Bản đồ chính thức là sơ đồ thành phần do người bảo trì xác nhận.', snapshot: 'Ảnh chụp {hash}', generated: ' · tạo lúc {date}',
  howMade: 'Các thành phần này được tạo thế nào', madeAi: 'Được nhóm bằng phân cụm phụ thuộc, sau đó mô hình AI đặt tên và tinh chỉnh; câu trả lời đã được kiểm chứng, và mọi mũi tên vẫn lấy từ phụ thuộc giữa các tệp.',
  madeCluster: 'Được nhóm bằng phân cụm phụ thuộc và đặt tên theo tên thư mục.', quality: 'Chất lượng', aboutSample: 'Về bản mẫu này',
  sampleBody: 'Một ví dụ dựng tay theo đúng quy tắc của kết quả thật. Hãy mở một không gian làm việc của bạn để xem kiến trúc của nó.',
  backLabel: 'Quay lại trang trước', back: 'Quay lại', homeLabel: 'ArchTime: tổng quan', switchLabel: 'Đổi không gian làm việc (hiện tại: {title})', snapshotLabel: 'Ảnh chụp', latest: 'Ảnh chụp mới nhất',
  readOnlyTip: 'Chỉ người bảo trì mới chạy mining hoặc định nghĩa kiến trúc bằng AI được.', readOnly: 'Chỉ xem', mineTip: 'Quét và chạy mining lịch sử repository', mine: 'Mining',
  regenerateTip: 'Nhóm lại các tệp theo phụ thuộc (không dùng AI)', regenerate: 'Tạo lại', details: 'Chi tiết không gian làm việc', compare: 'So sánh phiên bản', usage: 'Mức dùng AI',
  dashboard: 'Tổng quan', workspaces: 'Không gian làm việc', allArch: 'Mọi kiến trúc', more: 'Thêm', snapshots: 'Ảnh chụp', loading: 'Đang tải kiến trúc…',
  loadFailed: 'Không tải được kiến trúc', retry: 'Thử lại', noComponents: 'Ảnh chụp này chưa có thành phần nào', groupHint: 'Hãy nhóm các tệp thành thành phần để vẽ kiến trúc.',
  notGrouped: 'Người bảo trì chưa nhóm các tệp của không gian làm việc này.', groupFiles: 'Nhóm tệp thành các thành phần', unknownSample: 'Không có bản mẫu này',
});

const SAMPLE_IDS = new Set(FIXTURES.map(f => f.id));
const sectionTitle = 'text-[10px] font-mono uppercase tracking-wider text-[var(--at-muted)]';

function ReceiptSummary({ receipt }: { receipt: RefineReceipt }) {
  const failed = receipt.attempts.filter(a => !a.ok).length;
  const m = useMessages(MSG);
  return <section className="space-y-2 text-xs">
    <h3 className={sectionTitle}>{m('aiRefinement')}</h3>
    <RunUsage key={receipt.runId ?? receipt.model} receipt={receipt} />
    {receipt.accepted
      ? <p className="text-[var(--at-muted)]">{m('accepted', { count: failed + 1 })}{receipt.mode === 'name-only' ? (receipt.narrowed ? m('namesOnlyNarrowed', { narrowed: receipt.narrowed }) : m('namesOnly')) : receipt.movedRatio !== undefined ? m('moved', { pct: Math.round(receipt.movedRatio * 100) }) : ''}.</p>
      // The Issues list explains the fallback; the attempts' verifier codes stay here for whoever digs deeper.
      : <div className="text-[var(--at-muted)]">
        <p>{m('noAnswer')}</p>
        <ol className="mt-1 list-decimal pl-4">{receipt.attempts.map(a => <li key={a.n}>{a.issues.slice(0, 2).map(i => i.code).join(', ') || 'ok'}</li>)}</ol>
      </div>}
  </section>;
}

/** What changed in the components since the previous snapshot that has them; the names focus the component on the map. */
function EvolutionSummary({ evolution, onFocus }: { evolution: Evolution; onFocus: (componentId: string) => void }) {
  const { previous, items } = evolution;
  const m = useMessages(MSG);
  return <section className="space-y-2 text-xs" aria-label={m('evolution')}>
    <h3 className={sectionTitle}>{m('evolution')}</h3>
    {!previous && <p className="text-[var(--at-muted)]">{m('firstSnapshot')}</p>}
    {previous && <p className="text-[var(--at-muted)]">{m.rich('since', { hash: <code key="h">{previous.hash.slice(0, 7)}</code> })}{previous.date ? ` (${formatDate(previous.date)})` : ''}{items.length ? '' : m('noChange')}</p>}
    {items.length > 0 && <ul className="space-y-1">{items.map((item, i) => {
      const mark = item.kind === 'kept' || item.kind === 'removed' ? null : EVOLUTION_MARK[item.kind];
      return <li key={i} className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded-full border px-1 font-mono text-[11px] font-bold" style={mark ? { borderColor: mark.color, color: mark.color } : undefined}>{mark?.label ?? m('gone')}</span>
        {item.componentIds.length
          ? <button type="button" className="text-left text-[var(--at-text)] hover:text-[var(--at-text-strong)] hover:underline" onClick={() => onFocus(item.componentIds[0])}>{item.text}</button>
          : <span className="text-[var(--at-muted)]">{item.text}</span>}
      </li>;
    })}</ul>}
    {previous && <p className="text-[11px] leading-snug text-[var(--at-muted)]">{m('matchedFiles')}</p>}
  </section>;
}

/**
 * A project's architecture as a full-screen workspace, like a design tool's editor: a top bar for the file (project,
 * snapshot, AI), layers on the left, the artboard, and properties on the right. Samples open here too.
 */
export default function ArchitectureWorkspace() {
  const { projectId: routeProject, sampleId } = useParams();
  const navigate = useNavigate();
  const w = useMessages(MSG);
  const [hash, commit] = useHash();
  const parsed = parseHash(hash, { views: SAMPLE_IDS });
  const sample = sampleId ? getFixture(sampleId) : undefined;
  const projectId = sample ? undefined : routeProject;
  const snapshotParam = parsed.snapshot;
  const arch = useProjectArchitecture(projectId, snapshotParam);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [mining, setMining] = useState(false);
  // Mining, grouping files and the AI are maintainer work; the server refuses them to members who only read. Hidden until known.
  const [maintains, setMaintains] = useState<{ projectId: string; yes: boolean } | null>(null);
  const canMaintain = !!projectId && maintains?.projectId === projectId && maintains.yes;
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    getWorkspace(projectId, controller.signal).then(w => setMaintains({ projectId, yes: w.canMaintain })).catch(() => { /* stays read-only; the page reports its own load errors */ });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal).then(setProjects).catch(() => { /* the switcher is optional */ });
    return () => controller.abort();
  }, []);

  // The lineage covers every snapshot with components; it changes when a grouping is made or redone.
  const [lineage, setLineage] = useState<{ projectId: string; data: LineagePayload } | null>(null);
  const mappingVersion = arch.payload?.mapping?.createdAt;
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    getLineage(projectId, controller.signal).then(data => setLineage({ projectId, data })).catch(() => { /* the marks are optional; the map stays usable */ });
    return () => controller.abort();
  }, [projectId, mappingVersion]);
  const lineageData = lineage && lineage.projectId === projectId ? lineage.data : null;

  const project = projects.find(p => p.id === projectId);
  const title = sample ? sample.label.split(':')[0] : project?.name ?? w('workspace');
  const pageTitle = w('pageTitle', { title });
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);

  const base: ViewerState = useMemo(() => (projectId ? { project: projectId, ...(snapshotParam ? { snapshot: snapshotParam } : {}) } : { view: sample?.id }), [projectId, snapshotParam, sample?.id]);
  const payload = arch.payload;
  const view = sample?.view ?? (payload?.status === 'ready' ? payload.view : null);
  const busy = !!arch.refining || arch.generating;
  const viewedSnapshot = snapshotParam ?? payload?.snapshot?.id;
  const evolution = useMemo(() => (payload?.status === 'ready' ? evolutionAt(lineageData, viewedSnapshot) : null), [payload?.status, lineageData, viewedSnapshot]);
  // Full screen hides this header too, so it only counts while there is a drawing to leave it from.
  const fullScreen = useFocusMode();
  const focusMode = fullScreen.focus && !!view;

  // What the Issues list is built from, besides the view itself.
  const issueContext = useMemo(() => ({ quality: payload?.quality ?? null, stale: payload?.mapping?.stale ?? false, receipt: payload?.mapping?.receipt ?? null, canEdit: canMaintain }), [payload, canMaintain]);
  const openReference = useRef<(() => void) | null>(null);
  const onIssueAction = (action: IssueAction) => {
    if (action === 'regenerate') { if (!busy) void arch.generate(); } else openReference.current?.();
  };
  // Exports are named after the workspace and snapshot, not after the view's title (which is the commit title).
  const snapshot = payload?.snapshot;
  const exportInfo = useMemo<ExportMeta>(() => (sample ? { workspace: title, sample: true } : { workspace: title, hash: snapshot?.hash, date: snapshot?.date, commitTitle: snapshot?.title }), [sample, title, snapshot]);

  // Back to where the person came from; a link opened directly goes to the workspace's details (or all architectures).
  const { user } = useAuth();
  const home = user ? roleHome[user.role] : '/dashboard';
  const goBack = () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
    else navigate(projectId ? `/project?projectId=${encodeURIComponent(projectId)}` : '/architecture');
  };

  const switcher = {
    items: [
      ...projects.map(p => ({ key: `p:${p.id}`, label: p.name })),
      ...(projects.length ? [{ type: 'divider' as const }] : []),
      ...FIXTURES.map(f => ({ key: `s:${f.id}`, label: <span className="text-[var(--at-muted)]">{w('sample', { label: f.label })}</span> })),
    ],
    onClick: ({ key }: { key: string }) => navigate(key.startsWith('p:') ? `/workspace/${key.slice(2)}` : `/workspace/sample/${key.slice(2)}`),
  };

  const aiControls = () => {
    const llm = payload?.llm;
    const button = <Button size="small" type="primary" icon={<Sparkles size={13} />} aria-label={payload?.status === 'ready' ? w('refine') : w('group')} disabled={!llm?.enabled || busy} loading={!!arch.refining} onClick={arch.refine}>
      <span className="hidden sm:inline">{payload?.status === 'ready' ? w('refine') : w('group')}</span>
    </Button>;
    if (!llm?.enabled) return <Tooltip title={llm?.reason ?? w('aiUnavailable')}><span>{button}</span></Tooltip>;
    const t = arch.target();
    return <>
      <span className="hidden lg:inline-flex"><ModelPicker models={arch.models} value={arch.modelChoice} onChange={arch.setModelChoice} disabled={busy} /></span>
      <Tooltip title={t.external ? w('sendsPaths', { host: t.host ?? '', model: t.model ?? '' }) : w('usesLocal', { host: t.host ?? '', model: t.model ?? '' })}>{button}</Tooltip>
    </>;
  };

  // The long explanations sit in collapsed disclosures; an out-of-date snapshot is an issue card (with its Regenerate button), not a box here.
  const mapKind = computedMapKind(payload?.mapping?.generator);
  const overview = payload?.status === 'ready' && payload.view && projectId ? <>
    <section className="space-y-1.5 text-xs">
      <h3 className={sectionTitle}>{w('architecture')}</h3>
      {mapKind && <p><Tooltip title={MAP_KIND[mapKind].description}><Tag color={MAP_KIND[mapKind].color}>{MAP_KIND[mapKind].label}</Tag></Tooltip>
        <span className="text-[var(--at-muted)]">{w('computed')}</span></p>}
      <p className="text-[var(--at-muted)]">{w.rich('snapshot', { hash: <code key="h">{payload.snapshot?.hash}</code> })}{payload.mapping ? w('generated', { date: formatDateTime(payload.mapping.createdAt) }) : ''}</p>
      <details className="text-[var(--at-muted)]">
        <summary className="cursor-pointer select-none text-[var(--at-muted)] hover:text-[var(--at-text-strong)]">{w('howMade')}</summary>
        <p className="mt-1.5 leading-relaxed">{payload.mapping?.generator === 'cluster+llm'
          ? w('madeAi')
          : w('madeCluster')}</p>
      </details>
    </section>
    {evolution && <EvolutionSummary evolution={evolution} onFocus={id => commit({ ...base, focus: id })} />}
    {payload.quality && <section className="space-y-2"><h3 className={sectionTitle}>{w('quality')}</h3>
      <QualityPanel projectId={projectId} quality={payload.quality} view={payload.view} onSaved={arch.reload} canEdit={canMaintain} openEditorRef={openReference} /></section>}
    {payload.mapping?.receipt && <ReceiptSummary receipt={payload.mapping.receipt} />}
  </> : sample ? <details className="text-xs text-[var(--at-muted)]">
    <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wider text-[var(--at-muted)] hover:text-[var(--at-text-strong)]">{w('aboutSample')}</summary>
    <p className="mt-1.5 leading-relaxed">{w('sampleBody')}</p></details> : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-text)]">
      {!focusMode && <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--at-line)] bg-[var(--at-chrome)] px-3">
        <button type="button" onClick={goBack} aria-label={w('backLabel')} title={w('back')}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--at-line)] px-3 text-sm text-[var(--at-text)] hover:bg-[var(--at-hover)]">
          <ArrowLeft size={15} aria-hidden="true" /><span className="hidden sm:inline">{w('back')}</span>
        </button>
        <Link to={home} className="ml-1 shrink-0 font-bold tracking-tight text-[var(--at-link)] hover:text-[var(--at-text-strong)]" aria-label={w('homeLabel')}>Arch<span className="text-[var(--at-text-strong)]">Time</span></Link>
        <span className="text-[var(--at-muted)]" aria-hidden="true">/</span>
        <Dropdown trigger={['click']} menu={switcher}>
          <button type="button" className="flex min-w-0 max-w-56 items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-sm font-medium hover:bg-[var(--at-hover)]" aria-label={w('switchLabel', { title })}>
            <span className="truncate">{title}</span> <ChevronDown size={14} className="shrink-0 text-[var(--at-muted)]" />
          </button>
        </Dropdown>
        {projectId && <Select size="small" variant="borderless" aria-label={w('snapshotLabel')} className="hidden w-44 shrink-0 md:inline-flex" placeholder={w('latest')} allowClear value={snapshotParam}
          options={arch.snapshots.map(s => ({ value: s.id, label: `${s.hash} · ${s.title.split('\n')[0].slice(0, 40)}` }))}
          onChange={(id?: string) => commit({ project: projectId, ...(id ? { snapshot: id } : {}) }, true)} />}

        {/* The "Consistent with the import graph: N components, M dependencies" check lives in the Issues chip and the overview, not here. */}
        {arch.refining && <div className="mx-auto hidden min-w-0 items-center gap-3 whitespace-nowrap text-xs text-[var(--at-muted)] xl:flex" role="status">
          <span className="flex items-center gap-2"><Sparkles size={13} className="text-[var(--at-link)]" /> {arch.refining.stage}<Progress percent={arch.refining.progress} size="small" showInfo={false} className="!m-0 w-24" status="active" /></span>
        </div>}

        <div className={`ml-auto flex shrink-0 items-center gap-2 ${arch.refining ? 'xl:ml-0' : ''}`}>
          {projectId && !canMaintain && maintains?.projectId === projectId && <Tooltip title={w('readOnlyTip')}><span className="rounded border border-[var(--at-line)] px-2 py-0.5 text-xs text-[var(--at-muted)]">{w('readOnly')}</span></Tooltip>}
          {canMaintain && <Tooltip title={w('mineTip')}><Button size="small" icon={<Pickaxe size={13} />} aria-label={w('mine')} onClick={() => setMining(true)}><span className="hidden lg:inline">{w('mine')}</span></Button></Tooltip>}
          {canMaintain && payload && aiControls()}
          {canMaintain && payload?.status === 'ready' && <Tooltip title={w('regenerateTip')}><Button size="small" icon={<RefreshCw size={13} />} aria-label={w('regenerate')} loading={arch.generating} disabled={busy} onClick={() => void arch.generate()} /></Tooltip>}
          <Dropdown trigger={['click']} menu={{ items: [
            ...(projectId ? [
              { key: 'detail', label: <Link to={`/project?projectId=${projectId}`}>{w('details')}</Link> },
              { key: 'compare', label: <Link to={`/compare?projectId=${projectId}`}>{w('compare')}</Link> },
              { key: 'usage', label: <Link to="/ai-usage">{w('usage')}</Link> },
              { type: 'divider' as const },
            ] : []),
            { key: 'dashboard', label: <Link to={home}>{w('dashboard')}</Link> },
            { key: 'workspaces', label: <Link to="/projects">{w('workspaces')}</Link> },
            { key: 'maps', label: <Link to="/architecture">{w('allArch')}</Link> },
          ] }}><Button size="small" aria-label={w('more')}>⋯</Button></Dropdown>
          <div className="flex h-8 w-8 items-center justify-center"><div className="scale-[0.8]"><AccountMenu onNavigate={() => {}} /></div></div>
        </div>
      </header>}

      <main className="relative min-h-0 flex-1">
        {view && <ArchitectureViewer view={view} base={base} hash={hash} commit={commit} overview={overview}
          focusMode={focusMode} onFocusMode={fullScreen.set} issueContext={issueContext} onIssueAction={onIssueAction} exportInfo={exportInfo}
          projectId={projectId} mappingVersion={payload?.mapping?.createdAt}
          marks={evolution?.marks} historyFor={id => historyOf(lineageData, viewedSnapshot, id)}
          {...(projectId ? { snapshots: arch.snapshots, snapshotId: snapshotParam ?? payload?.snapshot?.id, onSnapshot: (id: string) => commit({ project: projectId, snapshot: id }, true) } : {})} />}

        {/* No drawing for this snapshot (yet): keep the snapshot list, like a design file's pages, so another can be opened. */}
        {projectId && !view && arch.snapshots.length > 0 && <aside aria-label={w('snapshots')} className="absolute inset-y-0 left-0 z-10 hidden w-72 border-r border-[var(--at-line)] bg-[var(--at-chrome)] lg:block">
          <LayersPanel snapshots={arch.snapshots} snapshotId={snapshotParam ?? payload?.snapshot?.id} onSnapshot={id => commit({ project: projectId, snapshot: id }, true)} />
        </aside>}
        {projectId && arch.current?.status === 'loading' && <div role="status" className="flex h-full flex-col items-center justify-center gap-3"><Spin /><p className="text-sm text-[var(--at-muted)]">{w('loading')}</p></div>}
        {projectId && arch.current?.status === 'error' && <div className="mx-auto max-w-xl p-10">
          <Alert type="error" showIcon title={w('loadFailed')} description={arch.current.message}
            action={<div className="flex gap-2"><Button onClick={arch.reload}>{w('retry')}</Button>{canMaintain && <Button onClick={() => setMining(true)}>{w('mine')}</Button>}</div>} />
        </div>}
        {/* Centred in the space left of the snapshot list, which sits over the left of the canvas on wide screens. */}
        {projectId && payload?.status === 'missing' && <div className={`flex h-full items-center justify-center p-6 ${arch.snapshots.length ? 'lg:pl-72' : ''}`}>
          <section aria-labelledby="no-components-title" className="w-full max-w-md rounded-2xl border border-[var(--at-line)] bg-[var(--at-solid)] p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--at-panel-2)] text-[var(--at-link)]"><Workflow size={22} aria-hidden="true" /></span>
            <h2 id="no-components-title" className="mt-4 text-lg font-semibold text-[var(--at-text)]">{w('noComponents')}</h2>
            {payload.snapshot && <p className="mt-2 truncate text-sm text-[var(--at-muted)]" title={payload.snapshot.title}>
              <code className="text-[var(--at-link)]">{payload.snapshot.hash}</code> · {payload.snapshot.title.split('\n')[0]}
            </p>}
            <p className="mt-3 text-sm text-[var(--at-muted)]">{canMaintain ? w('groupHint') : w('notGrouped')}</p>
            {canMaintain && <Button type="primary" className="mt-6" loading={arch.generating} disabled={busy} onClick={() => void arch.generate()}>{w('groupFiles')}</Button>}
          </section>
        </div>}
        {sampleId && !sample && <div className="p-10"><Alert type="error" showIcon title={w('unknownSample')} action={<Link to="/architecture"><Button>{w('allArch')}</Button></Link>} /></div>}
      </main>

      {mining && canMaintain && projectId && <MiningPanel project={{ id: projectId, name: title }} open onClose={() => setMining(false)} onChanged={arch.reload} />}
    </div>
  );
}
