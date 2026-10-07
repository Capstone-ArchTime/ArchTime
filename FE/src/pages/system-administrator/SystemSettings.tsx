import { useEffect, useState } from 'react';
import { App, Alert, Button, Form, InputNumber, Spin, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { getAdminSettings, updateAdminSettings } from '@/features/admin-api';
import type { AdminSettings } from '@/features/admin-api';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

export default function SystemSettings() {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [form] = Form.useForm();
  const [revision, setRevision] = useState(0);

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

  async function handleSubmit(values: { maxConcurrentJobs: number; maxRepoSizeGb: number }) {
    setSaving(true);
    try {
      const res = await updateAdminSettings(values);
      setSettings(res.data);
      form.setFieldsValue(res.data);
      setDirty(false);
      message.success('Settings saved.');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to save settings.');
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
      title="Repository & Extraction Config"
      description="Configure the limits used by the analysis pipeline."
      error={error}
      actions={
        <Button loading={loading} onClick={() => setRevision(v => v + 1)}>
          Refresh
        </Button>
      }
    >
      <section className={featurePanel}>
        <h3 className="font-semibold mb-4">Repository authorization</h3>
        <div className="flex flex-wrap gap-4">
          <span>GitHub <Tag>Not verified</Tag></span>
          <span>GitLab <Tag>Not connected</Tag></span>
        </div>
        <p className="text-sm text-[#94a3b8] mt-4">
          Provider connections and credential rotation require the administration API.
        </p>
      </section>

      <section className={featurePanel}>
        <h3 className="font-semibold mb-4">Extraction parameters</h3>
        {loading ? (
          <div className="p-8 text-center">
            <Spin />
            <p className="mt-3 text-[#94a3b8]">Loading settings...</p>
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
              label="Max concurrent analysis jobs"
              rules={[{ required: true, type: 'integer', min: 1, max: 16 }]}
            >
              <InputNumber min={1} max={16} precision={0} className="w-full max-w-xs" />
            </Form.Item>
            <Form.Item
              name="maxRepoSizeGb"
              label="Max repository size (GB)"
              rules={[{ required: true, type: 'integer', min: 1, max: 50 }]}
            >
              <InputNumber min={1} max={50} precision={0} className="w-full max-w-xs" />
            </Form.Item>
            <div className="flex gap-3">
              <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
                Save settings
              </Button>
              <Button onClick={handleReset} disabled={!dirty}>
                Reset form
              </Button>
            </div>
          </Form>
        )}
        {settings?.updatedAt && (
          <p className="text-xs text-[#94a3b8] mt-4">
            Last updated: {new Date(settings.updatedAt).toLocaleString()}
            {settings.updatedBy && ` by ${settings.updatedBy}`}
          </p>
        )}
      </section>

      {dirty && <Alert type="warning" message="You have unsaved configuration changes." />}
    </FeaturePage>
  );
}
