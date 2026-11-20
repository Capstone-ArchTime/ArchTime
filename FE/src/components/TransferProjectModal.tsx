import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Modal, Select, Spin } from 'antd';
import { listOrganizations } from '@/features/organizations-api';
import type { Organization } from '@/features/organizations-api';
import { accessWarning, previewTransfer, transferBlocker, transferProject } from '@/features/project-transfer';
import type { TransferPreview } from '@/features/project-transfer';

/** Move a personal workspace into an organization the person owns (RF-11, UC-29). */
export default function TransferProjectModal({ project, onClose, onMoved }: { project: { id: string; name: string }; onClose: () => void; onMoved: () => void }) {
  const { message } = App.useApp();
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string>();
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listOrganizations(controller.signal)
      .then(list => setOrganizations(list.filter(o => o.myRole === 'owner')))
      .catch(cause => { if (!controller.signal.aborted) { setOrganizations([]); setProblem(cause instanceof Error ? cause.message : 'Could not load your organizations.'); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    previewTransfer(project.id, organizationId, controller.signal)
      .then(next => { setPreview(next); setProblem(null); })
      .catch(cause => { if (!controller.signal.aborted) setProblem(cause instanceof Error ? cause.message : 'Could not check the move.'); });
    return () => controller.abort();
  }, [project.id, organizationId]);

  const blocker = preview ? transferBlocker(preview) : null;
  const warning = preview ? accessWarning(preview) : null;

  async function move() {
    if (!organizationId) return;
    setMoving(true);
    try {
      await transferProject(project.id, organizationId);
      message.success(`${project.name} now belongs to ${preview?.organization.name ?? 'the organization'}.`);
      onMoved();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'The workspace could not be moved.');
    } finally { setMoving(false); }
  }

  return <Modal open title={`Move ${project.name} into an organization`} okText="Move workspace" onCancel={onClose} onOk={move} confirmLoading={moving}
    okButtonProps={{ disabled: !preview || !!blocker || preview.organization.id !== organizationId, danger: !!warning }} destroyOnHidden>
    <div className="space-y-4">
      <p className="text-sm text-[var(--at-muted)]">The commit history, evidence, component diagram with its paths, rules, decisions and findings move with it. Its members keep their roles, but an organization's workspaces are visible to the organization's members only. This cannot be undone from here.</p>
      {organizations === null
        ? <div className="py-4 flex justify-center"><Spin /></div>
        : !organizations.length
          ? <Alert type="info" showIcon title="You do not own an organization." description={<><Link to="/organizations" onClick={onClose}>Create an organization</Link> first; only its owners can move workspaces into it.</>} />
          : <div>
            <label htmlFor="transfer-organization" className="block text-xs text-[var(--at-muted)] mb-1">Organization</label>
            <Select id="transfer-organization" className="w-full" placeholder="Choose an organization you own" value={organizationId}
              onChange={value => { setPreview(null); setProblem(null); setOrganizationId(value); }}
              options={organizations.map(o => ({ value: o.id, label: o.name }))} />
          </div>}
      {organizationId && !preview && !problem && <div className="py-2 flex justify-center"><Spin size="small" /></div>}
      {blocker && <Alert type="error" showIcon title={blocker} />}
      {!blocker && warning && <Alert type="warning" showIcon title={warning} />}
      {preview && !blocker && !warning && <Alert type="success" showIcon title={`Everyone with access now is a member of ${preview.organization.name}: nobody loses access.`} />}
      {problem && <Alert type="error" showIcon title={problem} />}
    </div>
  </Modal>;
}
