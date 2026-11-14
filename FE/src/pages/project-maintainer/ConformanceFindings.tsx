import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Empty, Input, Modal, Segmented, Select, Spin, Tag, Tooltip } from 'antd';
import { RefreshCw, ScanSearch, Sparkles } from 'lucide-react';
import { WorkspacePage } from './workspace';
import { panel } from './workspace-store';
import {
  DECISIONS, FINDING_TYPES, decideFinding, explainFinding, fetchFindings, fetchOverview, findingTitle, latestCheck, runCheck,
} from '@/features/conformance';
import type { DecisionKind, Finding, Overview } from '@/features/conformance';
import { markFindingsSeen } from '@/features/unread-findings';

type Status = 'open' | 'decided' | 'all';
const shown = 20;
const when = (iso: string) => new Date(iso).toLocaleString();

function FindingCard({ finding, project, onChange }: { finding: Finding; project: string; onChange: (next: Finding) => void }) {
  const { message } = App.useApp();
  const [deciding, setDeciding] = useState<DecisionKind | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [open, setOpen] = useState(false);
  const type = FINDING_TYPES[finding.type];

  async function decide(kind: DecisionKind | 'reopen', text = '') {
    setBusy(true);
    try {
      onChange(await decideFinding(project, finding.id, kind, text));
      setDeciding(null); setNote('');
      message.success(kind === 'reopen' ? 'Finding reopened.' : `Marked as ${DECISIONS[kind].label.toLowerCase()}.`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not save the decision.');
    } finally { setBusy(false); }
  }
  async function explain(refresh = false) {
    setExplaining(true);
    try { onChange(await explainFinding(project, finding.id, refresh)); setOpen(true); }
    catch (error) { message.error(error instanceof Error ? error.message : 'Could not explain this finding.'); }
    finally { setExplaining(false); }
  }

  return <article className={`${panel} space-y-3`} aria-label={findingTitle(finding)}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tag color={finding.severity === 'error' ? 'red' : 'gold'}>{finding.severity}</Tag>
          <Tooltip title={type.help}><Tag>{type.label}</Tag></Tooltip>
          {finding.decision && <Tooltip title={finding.decision.note || DECISIONS[finding.decision.kind].help}><Tag color={DECISIONS[finding.decision.kind].color}>{DECISIONS[finding.decision.kind].label}</Tag></Tooltip>}
          {finding.outdated && <Tooltip title="The last check no longer finds this: the diagram or the rules changed since."><Tag>Outdated</Tag></Tooltip>}
        </div>
        <h4 className="font-semibold break-words">{findingTitle(finding)}</h4>
        <p className="text-xs text-[var(--at-muted)]">
          {finding.files.length ? `${finding.importCount} import${finding.importCount === 1 ? '' : 's'} in ${finding.files.length} file${finding.files.length === 1 ? '' : 's'}` : 'No file makes this dependency'} · commit <code>{finding.snapshotHash}</code>
        </p>
      </div>
      <div className="flex flex-wrap gap-1 shrink-0">
        {finding.decision
          ? <Button size="small" loading={busy} onClick={() => decide('reopen')}>Reopen</Button>
          : (Object.keys(DECISIONS) as DecisionKind[]).map(kind => <Tooltip key={kind} title={DECISIONS[kind].help}><Button size="small" danger={kind === 'fix'} disabled={busy} onClick={() => (DECISIONS[kind].needsNote ? setDeciding(kind) : decide(kind))}>{DECISIONS[kind].verb}</Button></Tooltip>)}
        <Button size="small" icon={<Sparkles size={13} />} loading={explaining} onClick={() => (finding.explanation ? setOpen(v => !v) : explain())}>{finding.explanation ? (open ? 'Hide explanation' : 'Explanation') : 'Explain'}</Button>
      </div>
    </div>

    {finding.decision && <p className="text-xs text-[var(--at-muted)]">
      {DECISIONS[finding.decision.kind].label} on {when(finding.decision.at)}{finding.decision.inheritedFrom ? ` (carried over from commit ${finding.decision.inheritedFrom})` : ''}{finding.decision.note ? `: ${finding.decision.note}` : '.'}
    </p>}

    {finding.files.length > 0 && <details>
      <summary className="cursor-pointer text-sm">Files to look at</summary>
      <ul className="mt-2 space-y-1 text-xs font-mono break-all">
        {finding.imports.slice(0, shown).map(i => <li key={`${i.from}>${i.to}`}>{i.from} <span className="text-[var(--at-muted)]">imports</span> {i.to}</li>)}
      </ul>
      {finding.importCount > shown && <p className="text-xs text-[var(--at-muted)] mt-1">and {finding.importCount - shown} more.</p>}
    </details>}

    {open && finding.explanation && <div className="border-l-2 border-[var(--at-link)] pl-3 space-y-2">
      <p className="text-sm whitespace-pre-wrap">{finding.explanation.text}</p>
      <p className="text-xs text-[var(--at-muted)]">AI explanation by {finding.explanation.model}, {when(finding.explanation.at)}. Check it against the files before acting. <Button type="link" size="small" className="!p-0" loading={explaining} onClick={() => explain(true)}>Ask again</Button></p>
    </div>}

    <Modal title={deciding ? `${DECISIONS[deciding].verb} this finding` : ''} open={deciding !== null} okText={deciding ? DECISIONS[deciding].verb : 'Save'} confirmLoading={busy}
      okButtonProps={{ disabled: !note.trim() }} onOk={() => deciding && decide(deciding, note)} onCancel={() => { setDeciding(null); setNote(''); }}>
      <p className="text-sm mb-3">{deciding && DECISIONS[deciding].help}</p>
      <label htmlFor={`note-${finding.id}`} className="block text-xs text-[var(--at-muted)] mb-1">Why? Everyone who meets this finding later reads it.</label>
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
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the conformance check.'); });
    return () => controller.abort();
  }, [project, revision]);

  useEffect(() => {
    if (!snapshotId) return;
    const controller = new AbortController();
    fetchFindings(project, { snapshotId, status: status === 'all' ? undefined : status }, controller.signal)
      .then(setFindings)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the findings.'); });
    return () => controller.abort();
  }, [project, snapshotId, status, revision]);

  async function check(force: boolean) {
    setRunning(true);
    try {
      const result = await runCheck(project, force);
      const found = result.checked.reduce((n, c) => n + c.findings, 0);
      message.success(result.checked.length
        ? `Checked ${result.checked.length} commit${result.checked.length === 1 ? '' : 's'}: ${found} finding${found === 1 ? '' : 's'}.`
        : 'Nothing new to check: every commit after the baseline was already checked against this diagram and these rules.');
      setRevision(v => v + 1);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'The check failed.');
    } finally { setRunning(false); }
  }

  if (error && !overview) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setRevision(v => v + 1)}>Retry</Button>} />;
  if (!overview) return <div className="py-20 flex justify-center"><Spin /></div>;

  const selected = overview.checks.find(c => c.snapshotId === snapshotId) ?? null;
  const anyStale = overview.checks.some(c => c.stale);
  return <div className="space-y-5">
    {!overview.confirmed && <Alert type="warning" showIcon title="The component diagram is not confirmed yet."
      description={<>The check compares the code with the confirmed diagram. <Link to={`/project-maintainer/component-diagram?project=${project}`}>Open the Component Diagram</Link> and confirm it first.</>} />}
    {overview.confirmed && overview.componentsWithoutPaths.length > 0 && <Alert type="info" showIcon title={`No paths mapped for: ${overview.componentsWithoutPaths.join(', ')}.`}
      description={<>Files of these components are not checked. Add path prefixes in the <Link to={`/project-maintainer/component-diagram?project=${project}`}>Component Diagram</Link>.</>} />}
    {anyStale && <Alert type="info" showIcon title="The diagram or the rules changed since some commits were checked. Run the check to update their findings." />}
    {error && <Alert type="error" showIcon closable title={error} onClose={() => setError(null)} />}

    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="text-sm text-[var(--at-muted)]">
        {overview.confirmed && (overview.baselineCommit
          ? <>Commits after the baseline <code>{overview.baselineCommit.slice(0, 7)}</code> are checked.</>
          : <>The diagram was confirmed before anything was mined: every commit is checked.</>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<RefreshCw size={14} />} disabled={!overview.confirmed || running} onClick={() => check(true)}>Check everything again</Button>
        <Button type="primary" icon={<ScanSearch size={14} />} loading={running} disabled={!overview.confirmed} onClick={() => check(false)}>Run check</Button>
      </div>
    </div>

    {!overview.checks.length
      ? <div className={panel}><Empty description={overview.confirmed ? 'No commit has been checked yet. Run the check, or mine new commits.' : 'Nothing checked yet.'} /></div>
      : <>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-96">
            <label htmlFor="conformance-commit" className="block text-xs text-[var(--at-muted)] mb-1">Commit</label>
            <Select id="conformance-commit" className="w-full" value={snapshotId} onChange={value => { setFindings(null); setSnapshotId(value); }}
              options={overview.checks.map(c => ({ value: c.snapshotId, label: `${c.snapshotHash} · ${new Date(c.commitDate).toLocaleDateString()} · ${c.counts.findings} finding${c.counts.findings === 1 ? '' : 's'}${c.stale ? ' · needs re-check' : ''}` }))} />
          </div>
          <Segmented<Status> aria-label="Which findings" value={status} onChange={value => { setFindings(null); setStatus(value); }} options={[{ value: 'open', label: 'Open' }, { value: 'decided', label: 'Decided' }, { value: 'all', label: 'All' }]} />
        </div>
        {selected && <p className="text-xs text-[var(--at-muted)]">
          {selected.counts.files} files checked, {selected.counts.unmappedFiles} outside every component · {selected.counts.errors} error{selected.counts.errors === 1 ? '' : 's'}, {selected.counts.warnings} warning{selected.counts.warnings === 1 ? '' : 's'} · checked {when(selected.checkedAt)}
          {selected.unresolvedRules.length > 0 && ` · ${selected.unresolvedRules.length} rule${selected.unresolvedRules.length === 1 ? ' names' : 's name'} a component the diagram no longer has`}
        </p>}
        {findings === null
          ? <div className="py-10 flex justify-center"><Spin /></div>
          : !findings.length
            ? <div className={panel}><Empty description={status === 'open' ? 'No open findings for this commit.' : 'No findings to show.'} /></div>
            : <div className="space-y-3">{findings.map(f => <FindingCard key={f.id} finding={f} project={project}
              onChange={next => setFindings(list => (list ?? []).map(x => (x.id === next.id ? next : x)).filter(x => status === 'all' || (status === 'open') === !x.decision))} />)}</div>}
      </>}
  </div>;
}

export default function ConformanceFindings() {
  return <WorkspacePage title="Conformance Findings" description="Where the code of each new commit departs from the confirmed component diagram: forbidden, missing and undeclared dependencies, with the files behind each.">
    {project => <Findings key={project} project={project} />}
  </WorkspacePage>;
}
