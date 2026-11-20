import { useEffect, useState } from 'react';
import { App, Alert, Button, Form, InputNumber, Spin, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { getAdminSettings, updateAdminSettings } from '@/features/admin-api';
import type { AdminSettings } from '@/features/admin-api';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { sectionTitle } from './admin-ui';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  saved: 'Settings saved.', saveFailed: 'Failed to save settings.', title: 'Repository & Extraction Config', intro: 'Configure the limits used by the analysis pipeline.', refresh: 'Refresh',
  authorization: 'Repository authorization', notVerified: 'Not verified', notConnected: 'Not connected', providerNote: 'Provider connections and credential rotation require the administration API.',
  parameters: 'Extraction parameters', loading: 'Loading settings...', maxJobs: 'Max concurrent analysis jobs', maxSize: 'Max repository size (MB)', save: 'Save settings', reset: 'Reset form',
  lastUpdated: 'Last updated: {date}', unsaved: 'You have unsaved configuration changes.',
}, {
  saved: 'Đã lưu cài đặt.', saveFailed: 'Không lưu được cài đặt.', title: 'Cấu hình repository & trích xuất', intro: 'Cấu hình các giới hạn dùng bởi quy trình phân tích.', refresh: 'Làm mới',
  authorization: 'Ủy quyền repository', notVerified: 'Chưa xác minh', notConnected: 'Chưa kết nối', providerNote: 'Kết nối nhà cung cấp và xoay vòng thông tin xác thực cần API quản trị.',
  parameters: 'Tham số trích xuất', loading: 'Đang tải cài đặt...', maxJobs: 'Số việc phân tích chạy đồng thời tối đa', maxSize: 'Kích thước repository tối đa (MB)', save: 'Lưu cài đặt', reset: 'Đặt lại biểu mẫu',
  lastUpdated: 'Cập nhật lần cuối: {date}', unsaved: 'Bạn có thay đổi cấu hình chưa lưu.',
});

export default function SystemSettings() {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [form] = Form.useForm();
  const [revision, setRevision] = useState(0);
  const m = useMessages(MSG);

  useUnsavedChanges(dirty);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getAdminSettings(controller.signal)
      .then(res => {
        setSettings(res.data);
        form.setFieldsValue(res.data);
        setError(null);
        setDirty(false);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, form]);

  async function handleSubmit(values: { maxConcurrentJobs: number; maxRepoSizeMb: number }) {
    setSaving(true);
    try {
      const res = await updateAdminSettings(values);
      setSettings(res.data);
      form.setFieldsValue(res.data);
      setDirty(false);
      message.success(m('saved'));
    } catch (e) {
      message.error(e instanceof Error ? e.message : m('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (settings) {
      form.setFieldsValue(settings);
      setDirty(false);
    }
  }

  return (
    <FeaturePage
      title={m('title')}
      description={m('intro')}
      error={error}
      actions={
        <Button loading={loading} onClick={() => setRevision(v => v + 1)}>
          {m('refresh')}
        </Button>
      }
    >
      <section className={featurePanel}>
        <h3 className={`${sectionTitle} mb-4`}>{m('authorization')}</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2">GitHub <Tag>{m('notVerified')}</Tag></span>
          <span className="flex items-center gap-2">GitLab <Tag>{m('notConnected')}</Tag></span>
        </div>
        <p className="text-sm text-[var(--at-muted)] mt-4">
          {m('providerNote')}
        </p>
      </section>

      <section className={featurePanel}>
        <h3 className={`${sectionTitle} mb-4`}>{m('parameters')}</h3>
        {loading ? (
          <div className="p-8 text-center">
            <Spin />
            <p className="mt-3 text-[var(--at-muted)]">{m('loading')}</p>
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            initialValues={settings ?? undefined}
            onValuesChange={() => setDirty(true)}
            onFinish={handleSubmit}
          >
            <Form.Item
              name="maxConcurrentJobs"
              label={m('maxJobs')}
              rules={[{ required: true, type: 'integer', min: 1, max: 16 }]}
            >
              <InputNumber min={1} max={16} precision={0} className="w-full max-w-xs" />
            </Form.Item>
            <Form.Item
              name="maxRepoSizeMb"
              label={m('maxSize')}
              rules={[{ required: true, type: 'integer', min: 1, max: 51200 }]}
            >
              <InputNumber min={1} max={51200} precision={0} className="w-full max-w-xs" />
            </Form.Item>
            <div className="flex gap-3">
              <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
                {m('save')}
              </Button>
              <Button onClick={handleReset} disabled={!dirty}>
                {m('reset')}
              </Button>
            </div>
          </Form>
        )}
        {settings?.updatedAt && (
          <p className="text-xs text-[var(--at-muted)] mt-4">
            {m('lastUpdated', { date: formatDateTime(settings.updatedAt) })}
          </p>
        )}
      </section>

      {dirty && <Alert type="warning" message={m('unsaved')} />}
    </FeaturePage>
  );
}
