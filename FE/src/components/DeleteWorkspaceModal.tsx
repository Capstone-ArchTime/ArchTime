import { Fragment, useState } from 'react';
import { Alert, Input, Modal } from 'antd';
import { deleteConfirmed } from '@/features/delete-workspace';
import { useT } from '@/i18n';

/**
 * Asks before a workspace is deleted. Deleting removes the workspace and everything made in it and cannot be undone, so
 * the owner types its name first (a misplaced click on the trash icon then does nothing).
 */
export default function DeleteWorkspaceModal({ project, busy, onCancel, onConfirm }: {
  project: { id: string; name: string };
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const confirmed = deleteConfirmed(typed, project.name);
  const name = <strong className="text-[var(--at-text)] break-all">{project.name}</strong>;
  return <Modal open title={t('delete.title', { name: project.name })} okText={t('delete.confirm')} cancelText={t('common.cancel')} onCancel={busy ? undefined : onCancel} onOk={onConfirm}
    confirmLoading={busy} okButtonProps={{ danger: true, disabled: !confirmed }} cancelButtonProps={{ disabled: busy }} destroyOnHidden>
    <div className="space-y-4">
      <Alert type="error" showIcon title={t('delete.warning')} description={t('delete.body')} />
      <div>
        <label htmlFor="delete-workspace-name" className="block text-sm text-[var(--at-muted)] mb-1">
          {t.rich('delete.typeName', { name }).map((part, index) => <Fragment key={index}>{part}</Fragment>)}
        </label>
        <Input id="delete-workspace-name" value={typed} autoComplete="off" spellCheck={false} disabled={busy} autoFocus
          onChange={event => setTyped(event.target.value)} onPressEnter={() => { if (confirmed && !busy) onConfirm(); }} />
      </div>
    </div>
  </Modal>;
}
