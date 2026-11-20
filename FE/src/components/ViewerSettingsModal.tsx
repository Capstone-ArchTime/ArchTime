import { useEffect, useState } from 'react';
import { Alert, App, InputNumber, Modal, Skeleton, Switch } from 'antd';
import { DEFAULT_VIEWER_ACCESS, MAX_DAILY_LIMIT, getViewerAccess, saveViewerAccess } from '@/features/viewer-access';
import type { ViewerAccess } from '@/features/viewer-access';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load the viewer settings.', saved: 'Viewer settings saved.', saveFailed: 'Could not save the viewer settings.', title: 'Viewers of {name}', save: 'Save',
  intro: 'Viewers are signed-in people who open this public workspace by its link without being members. They can never change anything.', read: 'Let viewers read this workspace',
  chat: 'Let viewers ask the AI mentor', charged: 'Their questions are charged to you.', perDay: 'Questions per viewer per day',
}, {
  loadFailed: 'Không tải được cài đặt người xem.', saved: 'Đã lưu cài đặt người xem.', saveFailed: 'Không lưu được cài đặt người xem.', title: 'Người xem của {name}', save: 'Lưu',
  intro: 'Người xem là người đã đăng nhập mở không gian làm việc công khai này qua liên kết mà không phải thành viên. Họ không bao giờ thay đổi được gì.', read: 'Cho người xem đọc không gian làm việc này',
  chat: 'Cho người xem hỏi mentor AI', charged: 'Câu hỏi của họ được tính phí cho bạn.', perDay: 'Số câu hỏi mỗi người xem mỗi ngày',
});

/** The owner of a public personal workspace decides what viewers may do (UC-16, BR-17). */
export default function ViewerSettingsModal({ project, onClose }: { project: { id: string; name: string }; onClose: () => void }) {
  const { message } = App.useApp();
  const [access, setAccess] = useState<ViewerAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    getViewerAccess(project.id, controller.signal)
      .then(setAccess)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'loadFailed')); });
    return () => controller.abort();
  }, [project.id]);

  async function save() {
    if (!access) return;
    setSaving(true);
    try {
      await saveViewerAccess(project.id, access);
      message.success(m('saved'));
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const value = access ?? DEFAULT_VIEWER_ACCESS;
  return (
    <Modal title={m('title', { name: project.name })} open onCancel={onClose} onOk={save} okText={m('save')} confirmLoading={saving} okButtonProps={{ disabled: !access }} destroyOnHidden>
      {error ? <Alert type="error" showIcon title={error} />
        : !access ? <Skeleton active paragraph={{ rows: 3 }} />
        : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--at-muted)]">{m('intro')}</p>
            <label className="flex items-center justify-between gap-3">
              <span>{m('read')}</span>
              <Switch checked={value.publicRead} onChange={publicRead => setAccess({ ...value, publicRead })} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>{m('chat')} <span className="block text-xs text-[var(--at-muted)]">{m('charged')}</span></span>
              <Switch checked={value.allowChat} disabled={!value.publicRead} onChange={allowChat => setAccess({ ...value, allowChat })} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>{m('perDay')}</span>
              <InputNumber min={1} max={MAX_DAILY_LIMIT} precision={0} value={value.dailyLimit} disabled={!value.publicRead || !value.allowChat}
                onChange={n => setAccess({ ...value, dailyLimit: typeof n === 'number' ? n : value.dailyLimit })} aria-label={m('perDay')} />
            </label>
          </div>
        )}
    </Modal>
  );
}
