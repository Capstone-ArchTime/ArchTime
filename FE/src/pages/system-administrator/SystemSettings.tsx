import { useState } from 'react';
import { App, Alert, Button, Form, InputNumber, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { useAdminDemo, withAudit } from '@/features/admin-demo';
import { useAuth } from '@/auth/auth-context';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

export default function SystemSettings() {
  const store = useAdminDemo();
  const { user } = useAuth();
  const { message } = App.useApp();
  const [dirty, setDirty] = useState(false);
  const [form] = Form.useForm();
  const [baseline, setBaseline] = useState(() => JSON.stringify(store.data.settings));
  useUnsavedChanges(dirty);
  return <FeaturePage title="Repository & Extraction Config" description="Configure the limits used by the analysis pipeline." error={store.error}>
    <section className={featurePanel}><h3 className="font-semibold mb-4">Repository authorization</h3><div className="flex flex-wrap gap-4"><span>GitHub <Tag>Not verified</Tag></span><span>GitLab <Tag>Not connected</Tag></span></div><p className="text-sm text-[#94a3b8] mt-4">Provider connections and credential rotation require the administration API. No connection status or API key is simulated here.</p></section>
    <section className={featurePanel}><h3 className="font-semibold mb-4">Extraction parameters</h3>
      <Form form={form} layout="vertical" initialValues={store.data.settings} onValuesChange={() => setDirty(true)} onFinish={settings => {
        if (JSON.stringify(store.data.settings) !== baseline) { message.error('Settings changed in another tab. Reset the form before saving.'); return; }
        if (store.save(withAudit({ ...store.data, settings }, user!.name, 'configuration', `Demo limits: ${settings.maxConcurrentJobs} concurrent jobs, ${settings.maxRepoSizeGb} GB maximum repository size`))) { setBaseline(JSON.stringify(settings)); setDirty(false); message.success('Demo settings saved. The mining server was not changed.'); }
      }}>
        <Form.Item name="maxConcurrentJobs" label="Max concurrent analysis jobs" rules={[{ required: true, type: 'integer', min: 1, max: 16 }]}><InputNumber min={1} max={16} precision={0} /></Form.Item>
        <Form.Item name="maxRepoSizeGb" label="Max repository size (GB)" rules={[{ required: true, type: 'integer', min: 1, max: 50 }]}><InputNumber min={1} max={50} precision={0} /></Form.Item>
        <div className="flex gap-3"><Button type="primary" htmlType="submit" disabled={!dirty || !!store.error}>Save demo settings</Button><Button onClick={() => { form.setFieldsValue(store.data.settings); setBaseline(JSON.stringify(store.data.settings)); setDirty(false); }}>Reset form</Button></div>
      </Form>
    </section>
    {dirty && <Alert type="warning" title="You have unsaved configuration changes." />}
  </FeaturePage>;
}
