import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Activity, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import FindModelsModal from './FindModelsModal';
import type { FindModelsStart } from './FindModelsModal';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import {
  createAdminModel, deleteAdminModel, formatCost, formatMs, formatTokens, getAdminModels, healthColor, setDefaultAdminModel, testAdminModel,
  testAllAdminModels, updateAdminModel, updateLlmSettings,
  PROVIDER_PRESETS,
} from '@/features/llm-api';
import type { AdminModel, AdminModelList, LlmProvider, ModelInput } from '@/features/llm-api';

const PROVIDERS: { value: LlmProvider; label: string; hint: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'API key from console.anthropic.com. Base URL is optional.' },
  { value: 'gemini', label: 'Google Gemini', hint: 'API key from Google AI Studio. Base URL is optional.' },
  { value: 'openai-compatible', label: 'OpenAI-compatible / self-hosted', hint: 'Ollama, vLLM, LM Studio, OpenAI… Base URL is required, e.g. http://localhost:11434/v1' },
];

type FormValues = {
  displayName: string; key?: string; provider: LlmProvider; model: string; baseUrl?: string; apiKey?: string;
  inputPerMTok?: number; outputPerMTok?: number; cacheReadPerMTok?: number;
  effort?: 'low' | 'medium' | 'high'; maxTokens?: number; timeoutMs?: number; temperature?: number; jsonMode?: boolean;
  enabled: boolean; visibleToUsers: boolean;
};

function toInput(v: FormValues, editing: AdminModel | null): ModelInput {
  const input: ModelInput = {
    displayName: v.displayName, provider: v.provider, model: v.model, baseUrl: v.baseUrl?.trim() || null,
    pricing: { inputPerMTok: v.inputPerMTok ?? 0, outputPerMTok: v.outputPerMTok ?? 0, ...(v.cacheReadPerMTok !== undefined && v.cacheReadPerMTok !== null ? { cacheReadPerMTok: v.cacheReadPerMTok } : {}) },
    options: { ...(v.effort ? { effort: v.effort } : {}), ...(v.maxTokens ? { maxTokens: v.maxTokens } : {}), ...(v.timeoutMs ? { timeoutMs: v.timeoutMs } : {}), ...(v.temperature !== undefined && v.temperature !== null ? { temperature: v.temperature } : {}), jsonMode: v.jsonMode !== false },
    enabled: v.enabled, visibleToUsers: v.visibleToUsers,
  };
  if (v.key?.trim()) input.key = v.key.trim();
  // Left blank while editing keeps the stored key.
  if (v.apiKey?.trim()) input.apiKey = v.apiKey.trim();
  else if (!editing) input.apiKey = null;
  return input;
}

function fromModel(m: AdminModel): FormValues {
  return {
    displayName: m.displayName, key: m.key, provider: m.provider, model: m.model, baseUrl: m.baseUrl,
    inputPerMTok: m.pricing?.inputPerMTok, outputPerMTok: m.pricing?.outputPerMTok, cacheReadPerMTok: m.pricing?.cacheReadPerMTok,
    effort: m.options?.effort, maxTokens: m.options?.maxTokens, timeoutMs: m.options?.timeoutMs, temperature: m.options?.temperature ?? undefined, jsonMode: m.options?.jsonMode !== false,
    enabled: m.enabled, visibleToUsers: m.visibleToUsers,
  };
}

/** Administrators add, price and switch models, choose the default and check that each one answers. */
export default function AiModels() {
  const { message } = App.useApp();
  const [list, setList] = useState<AdminModelList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<AdminModel | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [finding, setFinding] = useState<FindModelsStart | null>(null);
  const provider = Form.useWatch('provider', form);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getAdminModels(controller.signal)
      .then(r => { setList(r); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the models.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const reload = () => setRevision(v => v + 1);

  function openForm(model: AdminModel | null) {
    setEditing(model);
    form.resetFields();
    form.setFieldsValue(model ? fromModel(model) : { provider: 'anthropic', enabled: true, visibleToUsers: true, jsonMode: true, inputPerMTok: 0, outputPerMTok: 0 });
    setOpen(true);
  }

  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) await updateAdminModel(editing.id, toInput(values, editing));
      else await createAdminModel(toInput(values, null));
      message.success(editing ? 'Model updated.' : 'Model added. Use Test to check it answers.');
      setOpen(false);
      reload();
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not save the model.'); }
    finally { setSaving(false); }
  }

  async function act(id: string, fn: () => Promise<unknown>, success: string) {
    setBusy(id);
    try { await fn(); message.success(success); reload(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'The action failed.'); }
    finally { setBusy(null); }
  }

  async function test(m: AdminModel) {
    setBusy(m.id);
    try {
      const r = await testAdminModel(m.id);
      const usage = r.usage ? ` · ${formatTokens(r.usage.inputTokens + r.usage.outputTokens)} tokens` : '';
      if (r.status === 'up') message.success(`${m.displayName} answered in ${formatMs(r.latencyMs)}${usage}.`);
      else message.warning(`${m.displayName}: ${r.status}. ${r.error ?? ''}`);
      reload();
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'The check failed.'); }
    finally { setBusy(null); }
  }

  async function testAll() {
    setBusy('all');
    try {
      const results = await testAllAdminModels();
      const up = results.filter(r => r.status === 'up').length;
      message.info(`${up} of ${results.length} models answered normally.`);
      reload();
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'The check failed.'); }
    finally { setBusy(null); }
  }

  const columns: ColumnsType<AdminModel> = [
    { title: 'Model', render: (_, m) => <div>
      <div className="flex flex-wrap items-center gap-1"><span className="font-medium">{m.displayName}</span>{m.isDefault && <Tag color="gold" icon={<Star size={10} className="inline -mt-0.5 mr-0.5" />}>Default</Tag>}</div>
      <p className="text-[11px] text-[#94a3b8] font-mono">{m.provider} · {m.model}</p>
      <p className="text-[11px] text-[#94a3b8]">{m.host || 'no host'} · <Tag className="!text-[10px]" color={m.external ? 'blue' : 'green'}>{m.external ? 'External' : 'Local'}</Tag>{m.hasApiKey ? `key …${m.apiKeyLast4}` : 'no key'}</p>
    </div> },
    { title: 'Health', render: (_, m) => <Tooltip title={m.health?.lastError ?? (m.health?.checkedAt ? `Checked ${new Date(m.health.checkedAt).toLocaleString()}` : 'Not checked yet')}>
      <Tag color={healthColor[m.health?.status ?? 'unknown']}>{m.health?.status ?? 'unknown'}</Tag>{m.health?.latencyMs !== undefined && <span className="text-xs text-[#94a3b8]">{formatMs(m.health.latencyMs)}</span>}
    </Tooltip> },
    { title: 'Price / 1M tokens', render: (_, m) => <span className="text-xs font-mono">in {formatCost(m.pricing?.inputPerMTok)} · out {formatCost(m.pricing?.outputPerMTok)}{m.pricing?.cacheReadPerMTok !== undefined ? ` · cache ${formatCost(m.pricing.cacheReadPerMTok)}` : ''}</span> },
    { title: 'Last 30 days', render: (_, m) => <span className="text-xs">{formatTokens(m.usage30d.runs)} runs · {formatTokens(m.usage30d.totalTokens)} tokens · {formatCost(m.usage30d.cost)}</span> },
    { title: 'On', render: (_, m) => <Switch size="small" checked={m.enabled} loading={busy === m.id} aria-label={`Turn ${m.displayName} ${m.enabled ? 'off' : 'on'}`} onChange={on => void act(m.id, () => updateAdminModel(m.id, { enabled: on }), on ? 'Model turned on.' : 'Model turned off.')} /> },
    { title: 'Users can pick', render: (_, m) => <Switch size="small" checked={m.visibleToUsers} disabled={!m.enabled} aria-label={`Offer ${m.displayName} to users`} onChange={on => void act(m.id, () => updateAdminModel(m.id, { visibleToUsers: on }), 'Saved.')} /> },
    { title: '', align: 'right', render: (_, m) => <Space size={4} wrap>
      <Button size="small" icon={<Activity size={13} />} loading={busy === m.id} onClick={() => void test(m)}>Test</Button>
      <Tooltip title="List the other models this provider offers, reusing this model's key"><Button size="small" icon={<Search size={13} />} onClick={() => setFinding({ fromModel: m })}>Find more</Button></Tooltip>
      {!m.isDefault && <Button size="small" disabled={!m.enabled} onClick={() => void act(m.id, () => setDefaultAdminModel(m.id), `${m.displayName} is now the default.`)}>Make default</Button>}
      <Button size="small" icon={<Pencil size={13} />} aria-label={`Edit ${m.displayName}`} onClick={() => openForm(m)} />
      <Popconfirm title={`Remove ${m.displayName}?`} description="A model with recorded runs is turned off and hidden instead, so its history stays readable." onConfirm={() => void act(m.id, () => deleteAdminModel(m.id), 'Model removed.')}>
        <Button size="small" danger icon={<Trash2 size={13} />} aria-label={`Remove ${m.displayName}`} />
      </Popconfirm>
    </Space> },
  ];

  const hint = PROVIDERS.find(p => p.value === provider)?.hint;
  return <FeaturePage title="AI Models" description="Models users can choose from to draw architectures. API keys are stored encrypted and never shown again." demo={false}
    actions={<Space wrap>
      <Button loading={busy === 'all'} icon={<Activity size={14} />} onClick={() => void testAll()}>Check all</Button>
      <Button icon={<Plus size={14} />} onClick={() => openForm(null)}>Add manually</Button>
      <Button type="primary" icon={<Search size={14} />} onClick={() => setFinding({})}>Find models</Button>
    </Space>}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={reload}>Retry</Button>} />}
    {list && !list.models.length && <Alert type="info" showIcon title="No models registered"
      description={list.serverConfig.enabled ? `The server's configured model (${list.serverConfig.model}) is used for every request. Add models to let users choose and to compare them.` : `No AI model is available. ${list.serverConfig.reason ?? ''}`} />}
    {list && <div className={`${featurePanel} flex flex-wrap items-center gap-3`}>
      <Switch checked={list.allowUserModelChoice} aria-label="Let users choose the model"
        onChange={on => void act('settings', () => updateLlmSettings({ allowUserModelChoice: on }), on ? 'Users can now choose a model.' : 'Users now always get the default model.')} />
      <div><p className="text-sm font-medium">Let users choose the model</p><p className="text-xs text-[#94a3b8]">When off, every request uses the default model.</p></div>
    </div>}
    <div className={featurePanel}>
      <Table<AdminModel> rowKey="id" size="small" loading={loading} columns={columns} dataSource={list?.models ?? []} pagination={false} scroll={{ x: 1100 }} />
    </div>

    {finding && <FindModelsModal start={finding} models={list?.models ?? []} onClose={() => setFinding(null)} onAdded={reload} />}

    <Modal open={open} title={editing ? `Edit ${editing.displayName}` : 'Add model'} okText={editing ? 'Save' : 'Add'} confirmLoading={saving} onOk={() => void save()} onCancel={() => setOpen(false)} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark="optional">
        {!editing && <Form.Item label="Start from a provider" extra="Fills in the provider and base URL. Use Find models to pick the model id from a list.">
          <Select placeholder="Choose a provider (optional)" options={PROVIDER_PRESETS.map(p => ({ value: p.id, label: p.label }))}
            onChange={(id: string) => { const p = PROVIDER_PRESETS.find(x => x.id === id)!; form.setFieldsValue({ provider: p.provider, baseUrl: p.baseUrl }); }} />
        </Form.Item>}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Form.Item name="displayName" label="Name shown to users" rules={[{ required: true, max: 80 }]}><Input placeholder="Claude Sonnet 5.5" /></Form.Item>
          <Form.Item name="key" label="Key" tooltip="Unique id; made from provider and model when left blank."><Input placeholder="claude-sonnet-5-5" /></Form.Item>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]} extra={hint}><Select options={PROVIDERS.map(p => ({ value: p.value, label: p.label }))} /></Form.Item>
          <Form.Item name="model" label="Model id (as the API expects it)" rules={[{ required: true, max: 120 }]}><Input placeholder="claude-sonnet-5-5" /></Form.Item>
          <Form.Item name="baseUrl" label="Base URL" rules={[{ required: provider === 'openai-compatible', type: 'url' }]}><Input placeholder={provider === 'openai-compatible' ? 'http://localhost:11434/v1' : 'Leave blank for the provider default'} /></Form.Item>
          <Form.Item name="apiKey" label="API key" extra={editing?.hasApiKey ? `Stored key ends in …${editing.apiKeyLast4}. Leave blank to keep it.` : provider === 'openai-compatible' ? 'Optional for self-hosted servers.' : undefined}
            rules={[{ required: !editing && provider !== 'openai-compatible', min: 8 }]}><Input.Password autoComplete="new-password" placeholder={editing?.hasApiKey ? '••••••••' : ''} /></Form.Item>
        </div>
        <p className="text-sm font-medium mt-2 mb-2">Price (USD per 1 million tokens; 0 for self-hosted)</p>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Form.Item name="inputPerMTok" label="Input"><InputNumber min={0} step={0.1} className="!w-full" /></Form.Item>
          <Form.Item name="outputPerMTok" label="Output"><InputNumber min={0} step={0.1} className="!w-full" /></Form.Item>
          <Form.Item name="cacheReadPerMTok" label="Cached input"><InputNumber min={0} step={0.01} className="!w-full" placeholder="= input" /></Form.Item>
        </div>
        <p className="text-sm font-medium mt-2 mb-2">Request options</p>
        <div className="grid gap-x-4 sm:grid-cols-3">
          {provider === 'anthropic' && <Form.Item name="effort" label="Effort"><Select allowClear placeholder="medium" options={['low', 'medium', 'high'].map(v => ({ value: v, label: v }))} /></Form.Item>}
          <Form.Item name="maxTokens" label="Max output tokens"><InputNumber min={256} max={64000} step={1000} className="!w-full" /></Form.Item>
          <Form.Item name="timeoutMs" label="Timeout (ms)"><InputNumber min={5000} max={900000} step={10000} className="!w-full" placeholder="180000" /></Form.Item>
          {provider !== 'anthropic' && <Form.Item name="temperature" label="Temperature"><InputNumber min={0} max={2} step={0.1} className="!w-full" placeholder="default" /></Form.Item>}
          {provider !== 'anthropic' && <Form.Item name="jsonMode" label="JSON mode" valuePropName="checked"><Switch /></Form.Item>}
        </div>
        <div className="flex gap-6">
          <Form.Item name="enabled" label="Turned on" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="visibleToUsers" label="Users can pick it" valuePropName="checked"><Switch /></Form.Item>
        </div>
      </Form>
    </Modal>
  </FeaturePage>;
}
