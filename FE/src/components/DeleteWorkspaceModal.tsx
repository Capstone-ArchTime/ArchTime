import { useState } from 'react';
import { Alert, Input, Modal } from 'antd';
import { deleteConfirmed } from '@/features/delete-workspace';

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
  const [typed, setTyped] = useState('');
  const confirmed = deleteConfirmed(typed, project.name);
  return <Modal open title={`Delete ${project.name}?`} okText="Delete workspace" onCancel={busy ? undefined : onCancel} onOk={onConfirm}
    confirmLoading={busy} okButtonProps={{ danger: true, disabled: !confirmed }} cancelButtonProps={{ disabled: busy }} destroyOnHidden>
    <div className="space-y-4">
      <Alert type="error" showIcon title="This cannot be undone."
        description="The workspace is removed with its mined commits, evidence, architecture, rules, decisions, reports, chats and pending invitations. Its members lose access." />
      <div>
        <label htmlFor="delete-workspace-name" className="block text-sm text-[var(--at-muted)] mb-1">
          Type <strong className="text-[var(--at-text)] break-all">{project.name}</strong> to confirm
        </label>
        <Input id="delete-workspace-name" value={typed} autoComplete="off" spellCheck={false} disabled={busy} autoFocus
          onChange={event => setTyped(event.target.value)} onPressEnter={() => { if (confirmed && !busy) onConfirm(); }} />
      </div>
    </div>
  </Modal>;
}
