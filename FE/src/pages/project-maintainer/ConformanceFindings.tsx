import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Empty, Input, Modal, Progress, Segmented, Select, Spin, Tag, Tooltip } from 'antd';
import { Mail, RefreshCw, ScanSearch, Sparkles } from 'lucide-react';
import { WorkspacePage } from './workspace';
import { panel } from './workspace-store';
import {
  DECISIONS, FINDING_TYPES, decideFinding, explainFinding, fetchFindings, fetchOverview, findingTitle, isRunning, latestCheck, notifyFindings, notifyMessage, runCheck, startProblem,
} from '@/features/conformance';
import type { DecisionKind, Finding, Overview } from '@/features/conformance';
import { markFindingsSeen } from '@/features/unread-findings';
import { trackJobs } from '@/features/background-jobs';
import { formatDate, formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  reopened: 'Finding reopened.', marked: 'Marked as {label}.', decideFailed: 'Could not save the decision.', explainFailed: 'Could not explain this finding.', error: 'error', warning: 'warning',
  outdatedTip: 'The last check no longer finds this: the diagram or the rules changed since.', outdated: 'Outdated', imports: '{count} imports in {files}', imports_one: '1 import in {files}', files: '{count} files', files_one: '1 file',
  noFile: 'No file makes this dependency', commit: ' · commit', reopen: 'Reopen', hideExplanation: 'Hide explanation', explanation: 'Explanation', explain: 'Explain', decidedOn: '{label} on {date}',
  carried: ' (carried over from commit {hash})', filesToLook: 'Files to look at', importsWord: 'imports', more: 'and {n} more.',
  aiBy: 'AI explanation by {model}, {date}. Check it against the files before acting.', askAgain: 'Ask again', decideTitle: '{verb} this finding', save: 'Save', why: 'Why? Everyone who meets this finding later reads it.',
  checkFailed: 'Could not load the conformance check.', findingsFailed: 'Could not load the findings.', mailFailed: 'Could not send the e-mail.',
  running: 'The check is running in the background. You can leave this page and keep working: you will be told when it finishes.', retry: 'Retry',
  notConfirmed: 'The component diagram is not confirmed yet.', notConfirmedBody: 'The check compares the code with the confirmed diagram. {link} and confirm it first.', openDiagram: 'Open the Component Diagram',
  noPaths: 'No paths mapped for: {list}.', noPathsBody: 'Files of these components are not checked. Add path prefixes in the {link}.', diagram: 'Component Diagram',
  stale: 'The diagram or the rules changed since some commits were checked. Run the check to update their findings.', waiting: 'The check is waiting to start.', checkingStage: 'Checking in the background: {stage}',
  leave: 'You can leave this page and keep working; you will be told when it finishes. The findings below update when it does.', lastFailed: 'The last check failed.',
  afterBaseline: 'Commits after the baseline {hash} are checked.', everyCommit: 'The diagram was confirmed before anything was mined: every commit is checked.',
  mailTip: 'E-mail the owner, the maintainers and the organization owner about open findings nobody was told about yet. Each finding is e-mailed once; this also happens by itself after every fetch or mine.',
  mail: 'E-mail new findings', checkAll: 'Check everything again', checking: 'Checking…', run: 'Run check', noneChecked: 'No commit has been checked yet. Run the check, or mine new commits.', nothing: 'Nothing checked yet.',
  commitLabel: 'Commit', findingsCount: '{count} findings', findingsCount_one: '1 finding', recheck: ' · needs re-check', which: 'Which findings', open: 'Open', decided: 'Decided', all: 'All',
  summary: '{files} files checked, {unmapped} outside every component · {errors} · {warnings} · checked {date}', errors: '{count} errors', errors_one: '1 error', warnings: '{count} warnings', warnings_one: '1 warning',
  unresolved: ' · {count} rules name a component the diagram no longer has', unresolved_one: ' · 1 rule names a component the diagram no longer has', noOpen: 'No open findings for this commit.', noFindings: 'No findings to show.',
  title: 'Conformance Findings', intro: 'Where new commits break the confirmed component diagram.',
  details: 'Each new commit is checked for forbidden, missing and undeclared dependencies, and for messages that break the commit convention ({format}, {task}, {arch}). Every finding lists the files behind it.',
}, {
  reopened: 'Đã mở lại phát hiện.', marked: 'Đã đánh dấu là {label}.', decideFailed: 'Không lưu được quyết định.', explainFailed: 'Không giải thích được phát hiện này.', error: 'lỗi', warning: 'cảnh báo',
  outdatedTip: 'Lần kiểm tra gần nhất không còn thấy điều này: sơ đồ hoặc quy tắc đã thay đổi từ đó.', outdated: 'Đã cũ', imports: '{count} import trong {files}', files: '{count} tệp',
  noFile: 'Không tệp nào tạo ra phụ thuộc này', commit: ' · commit', reopen: 'Mở lại', hideExplanation: 'Ẩn giải thích', explanation: 'Giải thích', explain: 'Giải thích', decidedOn: '{label} lúc {date}',
  carried: ' (kế thừa từ commit {hash})', filesToLook: 'Các tệp cần xem', importsWord: 'import', more: 'và {n} mục nữa.',
  aiBy: 'Giải thích AI bởi {model}, {date}. Hãy đối chiếu với các tệp trước khi hành động.', askAgain: 'Hỏi lại', decideTitle: '{verb} phát hiện này', save: 'Lưu', why: 'Vì sao? Mọi người gặp phát hiện này sau đều sẽ đọc.',
  checkFailed: 'Không tải được kết quả kiểm tra tuân thủ.', findingsFailed: 'Không tải được các phát hiện.', mailFailed: 'Không gửi được e-mail.',
  running: 'Việc kiểm tra đang chạy nền. Bạn có thể rời trang và tiếp tục làm việc: bạn sẽ được báo khi xong.', retry: 'Thử lại',
  notConfirmed: 'Sơ đồ thành phần chưa được xác nhận.', notConfirmedBody: 'Việc kiểm tra so sánh mã với sơ đồ đã xác nhận. {link} và xác nhận trước.', openDiagram: 'Mở Sơ đồ thành phần',
  noPaths: 'Chưa ánh xạ đường dẫn cho: {list}.', noPathsBody: 'Tệp của các thành phần này không được kiểm tra. Hãy thêm tiền tố đường dẫn trong {link}.', diagram: 'Sơ đồ thành phần',
  stale: 'Sơ đồ hoặc quy tắc đã thay đổi kể từ khi một số commit được kiểm tra. Hãy chạy kiểm tra để cập nhật phát hiện.', waiting: 'Việc kiểm tra đang chờ bắt đầu.', checkingStage: 'Đang kiểm tra nền: {stage}',
  leave: 'Bạn có thể rời trang và tiếp tục làm việc; bạn sẽ được báo khi xong. Các phát hiện bên dưới sẽ cập nhật khi đó.', lastFailed: 'Lần kiểm tra gần nhất thất bại.',
  afterBaseline: 'Các commit sau mốc chuẩn {hash} được kiểm tra.', everyCommit: 'Sơ đồ được xác nhận trước khi có gì được mining: mọi commit đều được kiểm tra.',
  mailTip: 'Gửi e-mail cho chủ sở hữu, người bảo trì và chủ tổ chức về các phát hiện mở chưa ai được báo. Mỗi phát hiện chỉ được gửi một lần; việc này cũng tự chạy sau mỗi lần lấy hoặc mining.',
  mail: 'Gửi e-mail phát hiện mới', checkAll: 'Kiểm tra lại toàn bộ', checking: 'Đang kiểm tra…', run: 'Chạy kiểm tra', noneChecked: 'Chưa commit nào được kiểm tra. Hãy chạy kiểm tra, hoặc mining commit mới.', nothing: 'Chưa kiểm tra gì.',
  commitLabel: 'Commit', findingsCount: '{count} phát hiện', recheck: ' · cần kiểm tra lại', which: 'Phát hiện nào', open: 'Mở', decided: 'Đã quyết', all: 'Tất cả',
  summary: '{files} tệp được kiểm tra, {unmapped} nằm ngoài mọi thành phần · {errors} · {warnings} · kiểm tra lúc {date}', errors: '{count} lỗi', warnings: '{count} cảnh báo',
  unresolved: ' · {count} quy tắc nhắc tới thành phần không còn trong sơ đồ', noOpen: 'Commit này không có phát hiện mở nào.', noFindings: 'Không có phát hiện để hiển thị.',
  title: 'Phát hiện tuân thủ', intro: 'Những chỗ commit mới vi phạm sơ đồ thành phần đã xác nhận.',
  details: 'Mỗi commit mới được kiểm tra các phụ thuộc bị cấm, thiếu hoặc chưa khai báo, và các thông điệp vi phạm quy ước commit ({format}, {task}, {arch}). Mỗi phát hiện liệt kê các tệp đứng sau nó.',
});

type Status = 'open' | 'decided' | 'all';
const shown = 20;
const when = (iso: string) => formatDateTime(iso);

function FindingCard({ finding, project, onChange }: { finding: Finding; project: string; onChange: (next: Finding) => void }) {
  const { message } = App.useApp();
  const [deciding, setDeciding] = useState<DecisionKind | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [open, setOpen] = useState(false);
  const m = useMessages(MSG);
  const type = FINDING_TYPES[finding.type];

  async function decide(kind: DecisionKind | 'reopen', text = '') {
    setBusy(true);
    try {
      onChange(await decideFinding(project, finding.id, kind, text));
      setDeciding(null); setNote('');
      message.success(kind === 'reopen' ? m('reopened') : m('marked', { label: DECISIONS[kind].label.toLowerCase() }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : m('decideFailed'));
    } finally { setBusy(false); }
  }
  async function explain(refresh = false) {
    setExplaining(true);
    try { onChange(await explainFinding(project, finding.id, refresh)); setOpen(true); }
    catch (error) { message.error(error instanceof Error ? error.message : m('explainFailed')); }
    finally { setExplaining(false); }
  }

  return <article className={`${panel} space-y-3`} aria-label={findingTitle(finding)}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tag color={finding.severity === 'error' ? 'red' : 'gold'}>{finding.severity === 'error' ? m('error') : m('warning')}</Tag>
          <Tooltip title={type.help}><Tag>{type.label}</Tag></Tooltip>
          {finding.decision && <Tooltip title={finding.decision.note || DECISIONS[finding.decision.kind].help}><Tag color={DECISIONS[finding.decision.kind].color}>{DECISIONS[finding.decision.kind].label}</Tag></Tooltip>}
          {finding.outdated && <Tooltip title={m('outdatedTip')}><Tag>{m('outdated')}</Tag></Tooltip>}
        </div>
        <h4 className="font-semibold break-words">{findingTitle(finding)}</h4>
        <p className="text-xs text-[var(--at-muted)]">
          {finding.files.length ? m('imports', { count: finding.importCount, files: m('files', { count: finding.files.length }) }) : m('noFile')}{m('commit')} <code>{finding.snapshotHash}</code>
        </p>
      </div>
      <div className="flex flex-wrap gap-1 shrink-0">
        {finding.decision
          ? <Button size="small" loading={busy} onClick={() => decide('reopen')}>{m('reopen')}</Button>
          : (Object.keys(DECISIONS) as DecisionKind[]).map(kind => <Tooltip key={kind} title={DECISIONS[kind].help}><Button size="small" danger={kind === 'fix'} disabled={busy} onClick={() => (DECISIONS[kind].needsNote ? setDeciding(kind) : decide(kind))}>{DECISIONS[kind].verb}</Button></Tooltip>)}
        <Button size="small" icon={<Sparkles size={13} />} loading={explaining} onClick={() => (finding.explanation ? setOpen(v => !v) : explain())}>{finding.explanation ? (open ? m('hideExplanation') : m('explanation')) : m('explain')}</Button>
      </div>
    </div>

    {finding.decision && <p className="text-xs text-[var(--at-muted)]">
      {m('decidedOn', { label: DECISIONS[finding.decision.kind].label, date: when(finding.decision.at) })}{finding.decision.inheritedFrom ? m('carried', { hash: finding.decision.inheritedFrom }) : ''}{finding.decision.note ? `: ${finding.decision.note}` : '.'}
    </p>}

    {finding.files.length > 0 && <details>
      <summary className="cursor-pointer text-sm">{m('filesToLook')}</summary>
      <ul className="mt-2 space-y-1 text-xs font-mono break-all">
        {finding.imports.slice(0, shown).map(i => <li key={`${i.from}>${i.to}`}>{i.from} <span className="text-[var(--at-muted)]">{m('importsWord')}</span> {i.to}</li>)}
      </ul>
      {finding.importCount > shown && <p className="text-xs text-[var(--at-muted)] mt-1">{m('more', { n: finding.importCount - shown })}</p>}
    </details>}

    {open && finding.explanation && <div className="border-l-2 border-[var(--at-link)] pl-3 space-y-2">
      <p className="text-sm whitespace-pre-wrap">{finding.explanation.text}</p>
      <p className="text-xs text-[var(--at-muted)]">{m('aiBy', { model: finding.explanation.model, date: when(finding.explanation.at) })} <Button type="link" size="small" className="!p-0" loading={explaining} onClick={() => explain(true)}>{m('askAgain')}</Button></p>
    </div>}

    <Modal title={deciding ? m('decideTitle', { verb: DECISIONS[deciding].verb }) : ''} open={deciding !== null} okText={deciding ? DECISIONS[deciding].verb : m('save')} confirmLoading={busy}
      okButtonProps={{ disabled: !note.trim() }} onOk={() => deciding && decide(deciding, note)} onCancel={() => { setDeciding(null); setNote(''); }}>
      <p className="text-sm mb-3">{deciding && DECISIONS[deciding].help}</p>
      <label htmlFor={`note-${finding.id}`} className="block text-xs text-[var(--at-muted)] mb-1">{m('why')}</label>
      <Input.TextArea id={`note-${finding.id}`} rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
    </Modal>
  </article>;
}

function Findings({ project }: { project: string }) {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | undefined>();
  const [status, setStatus] = useState<Status>('open');
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [revision, setRevision] = useState(0);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    fetchOverview(project, controller.signal)
      .then(next => {
        setOverview(next);
        // Keep the commit the person was looking at if it is still there; otherwise show the newest one.
        setSnapshotId(current => (current && next.checks.some(c => c.snapshotId === current) ? current : latestCheck(next.checks)?.snapshotId));
        setError(null);
        // Opening the findings is reading them (MSG26): the badge and the overview notice stop counting them.
        void markFindingsSeen(project);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'checkFailed')); });
    return () => controller.abort();
  }, [project, revision]);

  useEffect(() => {
    if (!snapshotId) return;
    const controller = new AbortController();
    fetchFindings(project, { snapshotId, status: status === 'all' ? undefined : status }, controller.signal)
      .then(setFindings)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'findingsFailed')); });
    return () => controller.abort();
  }, [project, snapshotId, status, revision]);

  const [mailing, setMailing] = useState(false);
  async function emailNow() {
    setMailing(true);
    try {
      const { kind, text } = notifyMessage(await notifyFindings(project));
      message[kind](text, kind === 'success' || kind === 'info' ? 4 : 8);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('mailFailed'));
    } finally { setMailing(false); }
  }

  // The check runs as a background job on the server: follow it here while it runs, then load what it found.
  const checking = isRunning(overview?.job);
  useEffect(() => {
    if (!checking) return;
    const timer = setInterval(() => {
      fetchOverview(project)
        .then(next => { setOverview(next); if (!isRunning(next.job)) setRevision(v => v + 1); })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [checking, project]);

  async function check(force: boolean) {
    setRunning(true);
    try {
      const { jobId } = await runCheck(project, force);
      trackJobs(jobId);
      message.info(m('running'), 6);
      setRevision(v => v + 1);
    } catch (cause) {
      message.error(startProblem(cause), 8);
    } finally { setRunning(false); }
  }

  if (error && !overview) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setRevision(v => v + 1)}>{m('retry')}</Button>} />;
  if (!overview) return <div className="py-20 flex justify-center"><Spin /></div>;

  const selected = overview.checks.find(c => c.snapshotId === snapshotId) ?? null;
  const anyStale = overview.checks.some(c => c.stale);
  return <div className="space-y-5">
    {!overview.confirmed && <Alert type="warning" showIcon title={m('notConfirmed')}
      description={<>{m.rich('notConfirmedBody', { link: <Link key="l" to={`/project-maintainer/component-diagram?project=${project}`}>{m('openDiagram')}</Link> })}</>} />}
    {overview.confirmed && overview.componentsWithoutPaths.length > 0 && <Alert type="info" showIcon title={m('noPaths', { list: overview.componentsWithoutPaths.join(', ') })}
      description={<>{m.rich('noPathsBody', { link: <Link key="l" to={`/project-maintainer/component-diagram?project=${project}`}>{m('diagram')}</Link> })}</>} />}
    {anyStale && <Alert type="info" showIcon title={m('stale')} />}
    {error && <Alert type="error" showIcon closable title={error} onClose={() => setError(null)} />}
    {checking && overview.job && <Alert type="info" showIcon title={overview.job.status === 'queued' ? m('waiting') : m('checkingStage', { stage: overview.job.stage })}
      description={<div className="space-y-1"><Progress percent={Math.round(overview.job.progress)} size="small" status="active" /><p>{m('leave')}</p></div>} />}
    {overview.job?.status === 'failed' && <Alert type="error" showIcon closable title={m('lastFailed')} description={overview.job.stage.replace(/^Failed:\s*/, '')} />}

    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="text-sm text-[var(--at-muted)]">
        {overview.confirmed && (overview.baselineCommit
          ? <>{m.rich('afterBaseline', { hash: <code key="h">{overview.baselineCommit.slice(0, 7)}</code> })}</>
          : <>{m('everyCommit')}</>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Tooltip title={m('mailTip')}>
          <Button icon={<Mail size={14} />} loading={mailing} disabled={!overview.confirmed || running} onClick={() => void emailNow()}>{m('mail')}</Button>
        </Tooltip>
        <Button icon={<RefreshCw size={14} />} disabled={!overview.confirmed || running || checking} onClick={() => check(true)}>{m('checkAll')}</Button>
        <Button type="primary" icon={<ScanSearch size={14} />} loading={running || checking} disabled={!overview.confirmed} onClick={() => check(false)}>{checking ? m('checking') : m('run')}</Button>
      </div>
    </div>

    {!overview.checks.length
      ? <div className={panel}><Empty description={overview.confirmed ? m('noneChecked') : m('nothing')} /></div>
      : <>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-96">
            <label htmlFor="conformance-commit" className="block text-xs text-[var(--at-muted)] mb-1">{m('commitLabel')}</label>
            <Select id="conformance-commit" className="w-full" value={snapshotId} onChange={value => { setFindings(null); setSnapshotId(value); }}
              options={overview.checks.map(c => ({ value: c.snapshotId, label: `${c.snapshotHash} · ${formatDate(c.commitDate)} · ${m('findingsCount', { count: c.counts.findings })}${c.stale ? m('recheck') : ''}` }))} />
          </div>
          <Segmented<Status> aria-label={m('which')} value={status} onChange={value => { setFindings(null); setStatus(value); }} options={[{ value: 'open', label: m('open') }, { value: 'decided', label: m('decided') }, { value: 'all', label: m('all') }]} />
        </div>
        {selected && <p className="text-xs text-[var(--at-muted)]">
          {m('summary', { files: selected.counts.files, unmapped: selected.counts.unmappedFiles, errors: m('errors', { count: selected.counts.errors }), warnings: m('warnings', { count: selected.counts.warnings }), date: when(selected.checkedAt) })}
          {selected.unresolvedRules.length > 0 && m('unresolved', { count: selected.unresolvedRules.length })}
        </p>}
        {findings === null
          ? <div className="py-10 flex justify-center"><Spin /></div>
          : !findings.length
            ? <div className={panel}><Empty description={status === 'open' ? m('noOpen') : m('noFindings')} /></div>
            : <div className="space-y-3">{findings.map(f => <FindingCard key={f.id} finding={f} project={project}
              onChange={next => setFindings(list => (list ?? []).map(x => (x.id === next.id ? next : x)).filter(x => status === 'all' || (status === 'open') === !x.decision))} />)}</div>}
      </>}
  </div>;
}

export default function ConformanceFindings() {
  const m = useMessages(MSG);
  return <WorkspacePage title={m('title')} description={m('intro')}
    details={<p>{m.rich('details', { format: <code key="f">type(scope): summary</code>, task: <code key="t">Task:</code>, arch: <code key="a">Arch-Change:</code> })}</p>}>
    {project => <Findings key={project} project={project} />}
  </WorkspacePage>;
}
