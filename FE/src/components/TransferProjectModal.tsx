import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Modal, Select, Spin } from 'antd';
import { listOrganizations } from '@/features/organizations-api';
import type { Organization } from '@/features/organizations-api';
import { accessWarning, previewTransfer, transferBlocker, transferProject } from '@/features/project-transfer';
import type { TransferPreview } from '@/features/project-transfer';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  orgsFailed: 'Could not load your organizations.', checkFailed: 'Could not check the move.', moved: '{name} now belongs to {org}.', theOrg: 'the organization', moveFailed: 'The workspace could not be moved.',
  title: 'Move {name} into an organization', move: 'Move workspace',
  intro: "The commit history, evidence, component diagram with its paths, rules, decisions and findings move with it. Its members keep their roles, but an organization's workspaces are visible to the organization's members only. This cannot be undone from here.",
  noOrg: 'You do not own an organization.', createOrg: 'Create an organization', firstOwners: '{link} first; only its owners can move workspaces into it.', organization: 'Organization', choose: 'Choose an organization you own',
  nobodyLoses: 'Everyone with access now is a member of {org}: nobody loses access.',
}, {
  orgsFailed: 'Không tải được các tổ chức của bạn.', checkFailed: 'Không kiểm tra được việc chuyển.', moved: '{name} giờ thuộc về {org}.', theOrg: 'tổ chức', moveFailed: 'Không chuyển được không gian làm việc.',
  title: 'Chuyển {name} vào một tổ chức', move: 'Chuyển không gian làm việc',
  intro: 'Lịch sử commit, bằng chứng, sơ đồ thành phần cùng các lộ trình, quy tắc, quyết định và phát hiện sẽ chuyển theo. Thành viên giữ nguyên vai trò, nhưng không gian làm việc của tổ chức chỉ thành viên tổ chức mới thấy. Không thể hoàn tác từ đây.',
  noOrg: 'Bạn chưa sở hữu tổ chức nào.', createOrg: 'Tạo tổ chức', firstOwners: '{link} trước; chỉ chủ sở hữu mới chuyển được không gian làm việc vào đó.', organization: 'Tổ chức', choose: 'Chọn một tổ chức bạn sở hữu',
  nobodyLoses: 'Mọi người đang có quyền truy cập đều là thành viên của {org}: không ai mất quyền truy cập.',
});

/** Move a personal workspace into an organization the person owns (RF-11, UC-29). */
export default function TransferProjectModal({ project, onClose, onMoved }: { project: { id: string; name: string }; onClose: () => void; onMoved: () => void }) {
  const { message } = App.useApp();
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string>();
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    listOrganizations(controller.signal)
      .then(list => setOrganizations(list.filter(o => o.myRole === 'owner')))
      .catch(cause => { if (!controller.signal.aborted) { setOrganizations([]); setProblem(cause instanceof Error ? cause.message : translate(MSG, 'orgsFailed')); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    previewTransfer(project.id, organizationId, controller.signal)
      .then(next => { setPreview(next); setProblem(null); })
      .catch(cause => { if (!controller.signal.aborted) setProblem(cause instanceof Error ? cause.message : translate(MSG, 'checkFailed')); });
    return () => controller.abort();
  }, [project.id, organizationId]);

  const blocker = preview ? transferBlocker(preview) : null;
  const warning = preview ? accessWarning(preview) : null;

  async function move() {
    if (!organizationId) return;
    setMoving(true);
    try {
      await transferProject(project.id, organizationId);
      message.success(m('moved', { name: project.name, org: preview?.organization.name ?? m('theOrg') }));
      onMoved();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : m('moveFailed'));
    } finally { setMoving(false); }
  }

  return <Modal open title={m('title', { name: project.name })} okText={m('move')} onCancel={onClose} onOk={move} confirmLoading={moving}
    okButtonProps={{ disabled: !preview || !!blocker || preview.organization.id !== organizationId, danger: !!warning }} destroyOnHidden>
    <div className="space-y-4">
      <p className="text-sm text-[var(--at-muted)]">{m('intro')}</p>
      {organizations === null
        ? <div className="py-4 flex justify-center"><Spin /></div>
        : !organizations.length
          ? <Alert type="info" showIcon title={m('noOrg')} description={<>{m.rich('firstOwners', { link: <Link key="l" to="/organizations" onClick={onClose}>{m('createOrg')}</Link> })}</>} />
          : <div>
            <label htmlFor="transfer-organization" className="block text-xs text-[var(--at-muted)] mb-1">{m('organization')}</label>
            <Select id="transfer-organization" className="w-full" placeholder={m('choose')} value={organizationId}
              onChange={value => { setPreview(null); setProblem(null); setOrganizationId(value); }}
              options={organizations.map(o => ({ value: o.id, label: o.name }))} />
          </div>}
      {organizationId && !preview && !problem && <div className="py-2 flex justify-center"><Spin size="small" /></div>}
      {blocker && <Alert type="error" showIcon title={blocker} />}
      {!blocker && warning && <Alert type="warning" showIcon title={warning} />}
      {preview && !blocker && !warning && <Alert type="success" showIcon title={m('nobodyLoses', { org: preview.organization.name })} />}
      {problem && <Alert type="error" showIcon title={problem} />}
    </div>
  </Modal>;
}
