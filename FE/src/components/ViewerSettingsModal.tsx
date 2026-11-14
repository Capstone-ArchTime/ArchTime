import { useEffect, useState } from 'react';
import { Alert, App, InputNumber, Modal, Skeleton, Switch } from 'antd';
import { DEFAULT_VIEWER_ACCESS, MAX_DAILY_LIMIT, getViewerAccess, saveViewerAccess } from '@/features/viewer-access';
import type { ViewerAccess } from '@/features/viewer-access';

/** The owner of a public personal workspace decides what viewers may do (UC-16, BR-17). */
export default function ViewerSettingsModal({ project, onClose }: { project: { id: string; name: string }; onClose: () => void }) {
  const { message } = App.useApp();
  const [access, setAccess] = useState<ViewerAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getViewerAccess(project.id, controller.signal)
      .then(setAccess)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the viewer settings.'); });
    return () => controller.abort();
  }, [project.id]);

  async function save() {
    if (!access) return;
    setSaving(true);
    try {
      await saveViewerAccess(project.id, access);
      message.success('Viewer settings saved.');
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not save the viewer settings.');
    } finally {
      setSaving(false);
    }
  }

  const value = access ?? DEFAULT_VIEWER_ACCESS;
  return (
    <Modal title={`Viewers of ${project.name}`} open onCancel={onClose} onOk={save} okText="Save" confirmLoading={saving} okButtonProps={{ disabled: !access }} destroyOnHidden>
      {error ? <Alert type="error" showIcon title={error} />
        : !access ? <Skeleton active paragraph={{ rows: 3 }} />
        : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--at-muted)]">Viewers are signed-in people who open this public workspace by its link without being members. They can never change anything.</p>
            <label className="flex items-center justify-between gap-3">
              <span>Let viewers read this workspace</span>
              <Switch checked={value.publicRead} onChange={publicRead => setAccess({ ...value, publicRead })} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Let viewers ask the AI mentor <span className="block text-xs text-[var(--at-muted)]">Their questions are charged to you.</span></span>
              <Switch checked={value.allowChat} disabled={!value.publicRead} onChange={allowChat => setAccess({ ...value, allowChat })} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Questions per viewer per day</span>
              <InputNumber min={1} max={MAX_DAILY_LIMIT} precision={0} value={value.dailyLimit} disabled={!value.publicRead || !value.allowChat}
                onChange={n => setAccess({ ...value, dailyLimit: typeof n === 'number' ? n : value.dailyLimit })} aria-label="Questions per viewer per day" />
            </label>
          </div>
        )}
    </Modal>
  );
}
