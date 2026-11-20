import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Activity, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import FindModelsModal from './FindModelsModal';
import type { FindModelsStart } from './FindModelsModal';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { statLabel, tablePanel } from './admin-ui';
import {
  createAdminModel, deleteAdminModel, formatCost, formatMs, formatTokens, getAdminModels, healthColor, setDefaultAdminModel, testAdminModel,
  testAllAdminModels, updateAdminModel, updateLlmSettings,
  PROVIDER_PRESETS,
} from '@/features/llm-api';
import type { AdminModel, AdminModelList, LlmProvider, ModelInput } from '@/features/llm-api';

import { formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  hintAnthropic: 'API key from console.anthropic.com. Base URL is optional.', hintGemini: 'API key from Google AI Studio. Base URL is optional.', selfHosted: 'OpenAI-compatible / self-hosted',
  hintOpenai: 'Ollama, vLLM, LM Studio, OpenAI… Base URL is required, e.g. http://localhost:11434/v1', loadFailed: 'Could not load the models.', updated: 'Model updated.', added: 'Model added. Use Test to check it answers.',
  saveFailed: 'Could not save the model.', actionFailed: 'The action failed.', tokens: ' · {n} tokens', answered: '{name} answered in {time}{usage}.', checkFailed: 'The check failed.', allAnswered: '{up} of {total} models answered normally.',
  model: 'Model', default: 'Default', noHost: 'no host', external: 'External', local: 'Local', keyEnds: 'key …{last4}', noKey: 'no key', health: 'Health', checked: 'Checked {date}', notChecked: 'Not checked yet',
  price: 'Price / 1M tokens', priceValue: 'in {input} · out {output}', cache: ' · cache {cost}', last30: 'Last 30 days', usage: '{runs} runs · {tokens} tokens · {cost}', on: 'On', turn: 'Turn {name} {state}', off: 'off', onWord: 'on',
  turnedOn: 'Model turned on.', turnedOff: 'Model turned off.', usersPick: 'Users can pick', offer: 'Offer {name} to users', saved: 'Saved.', test: 'Test', findMoreTip: "List the other models this provider offers, reusing this model's key",
  findMore: 'Find more', nowDefault: '{name} is now the default.', makeDefault: 'Make default', edit: 'Edit {name}', removeTitle: 'Remove {name}?', removeBody: 'A model with recorded runs is turned off and hidden instead, so its history stays readable.',
  removed: 'Model removed.', remove: 'Remove {name}', title: 'AI Models', intro: 'The AI models users can choose from.', details: 'Models draw architectures and answer questions in AI Insights. API keys are stored encrypted and never shown again.',
  checkAll: 'Check all', addManually: 'Add manually', findModels: 'Find models', retry: 'Retry', noModels: 'No models registered', serverModel: "The server's configured model ({model}) is used for every request. Add models to let users choose and to compare them.",
  noneAvailable: 'No AI model is available. {reason}', letChoose: 'Let users choose the model', canChoose: 'Users can now choose a model.', alwaysDefault: 'Users now always get the default model.', offNote: 'When off, every request uses the default model.',
  editTitle: 'Edit {name}', addTitle: 'Add model', save: 'Save', add: 'Add', startFrom: 'Start from a provider', startExtra: 'Fills in the provider and base URL. Use Find models to pick the model id from a list.', chooseProvider: 'Choose a provider (optional)',
  shownName: 'Name shown to users', key: 'Key', keyTip: 'Unique id; made from provider and model when left blank.', provider: 'Provider', modelId: 'Model id (as the API expects it)', baseUrl: 'Base URL', blankDefault: 'Leave blank for the provider default',
  apiKey: 'API key', storedKey: 'Stored key ends in …{last4}. Leave blank to keep it.', optionalSelf: 'Optional for self-hosted servers.', priceTitle: 'Price (USD per 1 million tokens; 0 for self-hosted)', input: 'Input', output: 'Output', cached: 'Cached input', equalsInput: '= input',
  options: 'Request options', effort: 'Effort', maxOutput: 'Max output tokens', limit: 'Token limit per request',
  limitTip: "The largest request the provider accepts, prompt and answer together, e.g. a free tier's tokens per minute (Groq: see its Limits page). The answer budget is sized to fit; a repository too big for it is named only, not regrouped. Leave empty for no limit.",
  noLimit: 'No limit', timeout: 'Timeout (ms)', temperature: 'Temperature', defaultWord: 'default', json: 'JSON mode', turnedOnLabel: 'Turned on', usersCanPick: 'Users can pick it',
}, {
  hintAnthropic: 'API key lấy từ console.anthropic.com. Base URL không bắt buộc.', hintGemini: 'API key lấy từ Google AI Studio. Base URL không bắt buộc.', selfHosted: 'Tương thích OpenAI / tự host',
  hintOpenai: 'Ollama, vLLM, LM Studio, OpenAI… Bắt buộc có Base URL, vd. http://localhost:11434/v1', loadFailed: 'Không tải được các mô hình.', updated: 'Đã cập nhật mô hình.', added: 'Đã thêm mô hình. Hãy bấm Kiểm tra để xem nó có trả lời không.',
  saveFailed: 'Không lưu được mô hình.', actionFailed: 'Thao tác thất bại.', tokens: ' · {n} token', answered: '{name} trả lời sau {time}{usage}.', checkFailed: 'Kiểm tra thất bại.', allAnswered: '{up} / {total} mô hình trả lời bình thường.',
  model: 'Mô hình', default: 'Mặc định', noHost: 'không có host', external: 'Bên ngoài', local: 'Nội bộ', keyEnds: 'key …{last4}', noKey: 'không có key', health: 'Tình trạng', checked: 'Kiểm tra lúc {date}', notChecked: 'Chưa kiểm tra',
  price: 'Giá / 1M token', priceValue: 'vào {input} · ra {output}', cache: ' · cache {cost}', last30: '30 ngày qua', usage: '{runs} lần chạy · {tokens} token · {cost}', on: 'Bật', turn: '{state} {name}', off: 'Tắt', onWord: 'Bật',
  turnedOn: 'Đã bật mô hình.', turnedOff: 'Đã tắt mô hình.', usersPick: 'Người dùng chọn được', offer: 'Cho người dùng chọn {name}', saved: 'Đã lưu.', test: 'Kiểm tra', findMoreTip: 'Liệt kê các mô hình khác của nhà cung cấp này, dùng lại key của mô hình này',
  findMore: 'Tìm thêm', nowDefault: '{name} giờ là mặc định.', makeDefault: 'Đặt làm mặc định', edit: 'Sửa {name}', removeTitle: 'Xoá {name}?', removeBody: 'Mô hình đã có lần chạy được ghi lại sẽ bị tắt và ẩn thay vì xoá, để lịch sử vẫn đọc được.',
  removed: 'Đã xoá mô hình.', remove: 'Xoá {name}', title: 'Mô hình AI', intro: 'Các mô hình AI người dùng có thể chọn.', details: 'Mô hình vẽ kiến trúc và trả lời câu hỏi trong Phân tích AI. API key được mã hoá khi lưu và không bao giờ hiển thị lại.',
  checkAll: 'Kiểm tra tất cả', addManually: 'Thêm thủ công', findModels: 'Tìm mô hình', retry: 'Thử lại', noModels: 'Chưa đăng ký mô hình nào', serverModel: 'Mô hình cấu hình trên máy chủ ({model}) được dùng cho mọi yêu cầu. Thêm mô hình để người dùng chọn và so sánh.',
  noneAvailable: 'Không có mô hình AI nào dùng được. {reason}', letChoose: 'Cho người dùng chọn mô hình', canChoose: 'Người dùng giờ chọn được mô hình.', alwaysDefault: 'Người dùng giờ luôn dùng mô hình mặc định.', offNote: 'Khi tắt, mọi yêu cầu dùng mô hình mặc định.',
  editTitle: 'Sửa {name}', addTitle: 'Thêm mô hình', save: 'Lưu', add: 'Thêm', startFrom: 'Bắt đầu từ nhà cung cấp', startExtra: 'Điền sẵn nhà cung cấp và base URL. Dùng Tìm mô hình để chọn mã mô hình từ danh sách.', chooseProvider: 'Chọn nhà cung cấp (không bắt buộc)',
  shownName: 'Tên hiển thị cho người dùng', key: 'Khoá', keyTip: 'Mã duy nhất; để trống thì tạo từ nhà cung cấp và mô hình.', provider: 'Nhà cung cấp', modelId: 'Mã mô hình (theo API)', baseUrl: 'Base URL', blankDefault: 'Để trống để dùng mặc định của nhà cung cấp',
  apiKey: 'API key', storedKey: 'Key đã lưu kết thúc bằng …{last4}. Để trống để giữ nguyên.', optionalSelf: 'Không bắt buộc với máy chủ tự host.', priceTitle: 'Giá (USD mỗi 1 triệu token; 0 nếu tự host)', input: 'Vào', output: 'Ra', cached: 'Đầu vào đã cache', equalsInput: '= vào',
  options: 'Tuỳ chọn yêu cầu', effort: 'Mức nỗ lực', maxOutput: 'Token ra tối đa', limit: 'Giới hạn token mỗi yêu cầu',
  limitTip: 'Yêu cầu lớn nhất nhà cung cấp chấp nhận, gồm cả prompt và câu trả lời, vd. số token mỗi phút của gói miễn phí (Groq: xem trang Limits). Ngân sách câu trả lời được tính cho vừa; repository quá lớn sẽ chỉ được đặt tên, không nhóm lại. Để trống nếu không giới hạn.',
  noLimit: 'Không giới hạn', timeout: 'Thời gian chờ (ms)', temperature: 'Temperature', defaultWord: 'mặc định', json: 'Chế độ JSON', turnedOnLabel: 'Đang bật', usersCanPick: 'Người dùng chọn được',
});

const PROVIDERS: { value: LlmProvider; label: string; hint: 'hintAnthropic' | 'hintGemini' | 'hintOpenai' }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'hintAnthropic' },
  { value: 'gemini', label: 'Google Gemini', hint: 'hintGemini' },
  { value: 'openai-compatible', label: 'OpenAI-compatible / self-hosted', hint: 'hintOpenai' },
];

type FormValues = {
  displayName: string; key?: string; provider: LlmProvider; model: string; baseUrl?: string; apiKey?: string;
  inputPerMTok?: number; outputPerMTok?: number; cacheReadPerMTok?: number;
  effort?: 'low' | 'medium' | 'high'; maxTokens?: number; timeoutMs?: number; temperature?: number; jsonMode?: boolean; maxRequestTokens?: number;
  enabled: boolean; visibleToUsers: boolean;
};

function toInput(v: FormValues, editing: AdminModel | null): ModelInput {
  const input: ModelInput = {
    displayName: v.displayName, provider: v.provider, model: v.model, baseUrl: v.baseUrl?.trim() || null,
    pricing: { inputPerMTok: v.inputPerMTok ?? 0, outputPerMTok: v.outputPerMTok ?? 0, ...(v.cacheReadPerMTok !== undefined && v.cacheReadPerMTok !== null ? { cacheReadPerMTok: v.cacheReadPerMTok } : {}) },
    options: { ...(v.effort ? { effort: v.effort } : {}), ...(v.maxTokens ? { maxTokens: v.maxTokens } : {}), ...(v.timeoutMs ? { timeoutMs: v.timeoutMs } : {}), ...(v.maxRequestTokens ? { maxRequestTokens: v.maxRequestTokens } : {}), ...(v.temperature !== undefined && v.temperature !== null ? { temperature: v.temperature } : {}), jsonMode: v.jsonMode !== false },
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
    effort: m.options?.effort, maxTokens: m.options?.maxTokens, timeoutMs: m.options?.timeoutMs, maxRequestTokens: m.options?.maxRequestTokens, temperature: m.options?.temperature ?? undefined, jsonMode: m.options?.jsonMode !== false,
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
  const t = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getAdminModels(controller.signal)
      .then(r => { setList(r); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'loadFailed')); })
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
      message.success(editing ? t('updated') : t('added'));
      setOpen(false);
      reload();
    } catch (cause) { message.error(cause instanceof Error ? cause.message : t('saveFailed')); }
    finally { setSaving(false); }
  }

  async function act(id: string, fn: () => Promise<unknown>, success: string) {
    setBusy(id);
    try { await fn(); message.success(success); reload(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : t('actionFailed')); }
    finally { setBusy(null); }
  }

  async function test(m: AdminModel) {
    setBusy(m.id);
    try {
      const r = await testAdminModel(m.id);
      const usage = r.usage ? t('tokens', { n: formatTokens(r.usage.inputTokens + r.usage.outputTokens) }) : '';
      if (r.status === 'up') message.success(t('answered', { name: m.displayName, time: formatMs(r.latencyMs), usage }));
      else message.warning(`${m.displayName}: ${r.status}. ${r.error ?? ''}`);
      reload();
    } catch (cause) { message.error(cause instanceof Error ? cause.message : t('checkFailed')); }
    finally { setBusy(null); }
  }

  async function testAll() {
    setBusy('all');
    try {
      const results = await testAllAdminModels();
      const up = results.filter(r => r.status === 'up').length;
      message.info(t('allAnswered', { up, total: results.length }));
      reload();
    } catch (cause) { message.error(cause instanceof Error ? cause.message : t('checkFailed')); }
    finally { setBusy(null); }
  }

  const columns: ColumnsType<AdminModel> = [
    { title: t('model'), render: (_, m) => <div>
      <div className="flex flex-wrap items-center gap-1"><span className="font-medium">{m.displayName}</span>{m.isDefault && <Tag color="blue" icon={<Star size={10} className="inline -mt-0.5 mr-0.5" />}>{t('default')}</Tag>}</div>
      <p className="text-[11px] text-[var(--at-muted)] font-mono">{m.provider} · {m.model}</p>
      <p className="text-[11px] text-[var(--at-muted)]">{m.host || t('noHost')} · <Tag className="!text-[10px]">{m.external ? t('external') : t('local')}</Tag>{m.hasApiKey ? t('keyEnds', { last4: m.apiKeyLast4 ?? '' }) : t('noKey')}</p>
    </div> },
    { title: t('health'), render: (_, m) => <Tooltip title={m.health?.lastError ?? (m.health?.checkedAt ? t('checked', { date: formatDateTime(m.health.checkedAt) }) : t('notChecked'))}>
      <Tag color={healthColor[m.health?.status ?? 'unknown']}>{m.health?.status ?? 'unknown'}</Tag>{m.health?.latencyMs !== undefined && <span className="text-xs text-[var(--at-muted)]">{formatMs(m.health.latencyMs)}</span>}
    </Tooltip> },
    { title: t('price'), render: (_, m) => <span className="text-xs">{t('priceValue', { input: formatCost(m.pricing?.inputPerMTok), output: formatCost(m.pricing?.outputPerMTok) })}{m.pricing?.cacheReadPerMTok !== undefined ? t('cache', { cost: formatCost(m.pricing.cacheReadPerMTok) }) : ''}</span> },
    { title: t('last30'), render: (_, m) => <span className="text-xs">{t('usage', { runs: formatTokens(m.usage30d.runs), tokens: formatTokens(m.usage30d.totalTokens), cost: formatCost(m.usage30d.cost) })}</span> },
    { title: t('on'), render: (_, m) => <Switch size="small" checked={m.enabled} loading={busy === m.id} aria-label={t('turn', { name: m.displayName, state: m.enabled ? t('off') : t('onWord') })} onChange={on => void act(m.id, () => updateAdminModel(m.id, { enabled: on }), on ? t('turnedOn') : t('turnedOff'))} /> },
    { title: t('usersPick'), render: (_, m) => <Switch size="small" checked={m.visibleToUsers} disabled={!m.enabled} aria-label={t('offer', { name: m.displayName })} onChange={on => void act(m.id, () => updateAdminModel(m.id, { visibleToUsers: on }), t('saved'))} /> },
    { title: '', align: 'right', render: (_, m) => <Space size={4} wrap>
      <Button size="small" icon={<Activity size={13} />} loading={busy === m.id} onClick={() => void test(m)}>{t('test')}</Button>
      <Tooltip title={t('findMoreTip')}><Button size="small" icon={<Search size={13} />} onClick={() => setFinding({ fromModel: m })}>{t('findMore')}</Button></Tooltip>
      {!m.isDefault && <Button size="small" disabled={!m.enabled} onClick={() => void act(m.id, () => setDefaultAdminModel(m.id), t('nowDefault', { name: m.displayName }))}>{t('makeDefault')}</Button>}
      <Button size="small" icon={<Pencil size={13} />} aria-label={t('edit', { name: m.displayName })} onClick={() => openForm(m)} />
      <Popconfirm title={t('removeTitle', { name: m.displayName })} description={t('removeBody')} onConfirm={() => void act(m.id, () => deleteAdminModel(m.id), t('removed'))}>
        <Button size="small" danger icon={<Trash2 size={13} />} aria-label={t('remove', { name: m.displayName })} />
      </Popconfirm>
    </Space> },
  ];

  const hintKey = PROVIDERS.find(p => p.value === provider)?.hint;
  const hint = hintKey ? t(hintKey) : undefined;
  return <FeaturePage title={t('title')} description={t('intro')}
    details={<p>{t('details')}</p>} demo={false}
    actions={<Space wrap>
      <Button loading={busy === 'all'} icon={<Activity size={14} />} onClick={() => void testAll()}>{t('checkAll')}</Button>
      <Button icon={<Plus size={14} />} onClick={() => openForm(null)}>{t('addManually')}</Button>
      <Button type="primary" icon={<Search size={14} />} onClick={() => setFinding({})}>{t('findModels')}</Button>
    </Space>}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={reload}>{t('retry')}</Button>} />}
    {list && !list.models.length && <Alert type="info" showIcon title={t('noModels')}
      description={list.serverConfig.enabled ? t('serverModel', { model: list.serverConfig.model ?? '' }) : t('noneAvailable', { reason: list.serverConfig.reason ?? '' })} />}
    {list && <div className={`${featurePanel} flex flex-wrap items-center gap-3`}>
      <Switch checked={list.allowUserModelChoice} aria-label={t('letChoose')}
        onChange={on => void act('settings', () => updateLlmSettings({ allowUserModelChoice: on }), on ? t('canChoose') : t('alwaysDefault'))} />
      <div><p className="text-base font-bold">{t('letChoose')}</p><p className="text-xs text-[var(--at-muted)]">{t('offNote')}</p></div>
    </div>}
    <div className={tablePanel}>
      <Table<AdminModel> rowKey="id" size="small" loading={loading} columns={columns} dataSource={list?.models ?? []} pagination={false} scroll={{ x: 1100 }} />
    </div>

    {finding && <FindModelsModal start={finding} models={list?.models ?? []} onClose={() => setFinding(null)} onAdded={reload} />}

    <Modal open={open} title={editing ? t('editTitle', { name: editing.displayName }) : t('addTitle')} okText={editing ? t('save') : t('add')} confirmLoading={saving} onOk={() => void save()} onCancel={() => setOpen(false)} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark="optional">
        {!editing && <Form.Item label={t('startFrom')} extra={t('startExtra')}>
          <Select placeholder={t('chooseProvider')} options={PROVIDER_PRESETS.map(p => ({ value: p.id, label: p.label }))}
            onChange={(id: string) => { const p = PROVIDER_PRESETS.find(x => x.id === id)!; form.setFieldsValue({ provider: p.provider, baseUrl: p.baseUrl }); }} />
        </Form.Item>}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Form.Item name="displayName" label={t('shownName')} rules={[{ required: true, max: 80 }]}><Input placeholder="Claude Sonnet 5.5" /></Form.Item>
          <Form.Item name="key" label={t('key')} tooltip={t('keyTip')}><Input placeholder="claude-sonnet-5-5" /></Form.Item>
          <Form.Item name="provider" label={t('provider')} rules={[{ required: true }]} extra={hint}><Select options={PROVIDERS.map(p => ({ value: p.value, label: p.label }))} /></Form.Item>
          <Form.Item name="model" label={t('modelId')} rules={[{ required: true, max: 120 }]}><Input placeholder="claude-sonnet-5-5" /></Form.Item>
          <Form.Item name="baseUrl" label={t('baseUrl')} rules={[{ required: provider === 'openai-compatible', type: 'url' }]}><Input placeholder={provider === 'openai-compatible' ? 'http://localhost:11434/v1' : t('blankDefault')} /></Form.Item>
          <Form.Item name="apiKey" label={t('apiKey')} extra={editing?.hasApiKey ? t('storedKey', { last4: editing.apiKeyLast4 ?? '' }) : provider === 'openai-compatible' ? t('optionalSelf') : undefined}
            rules={[{ required: !editing && provider !== 'openai-compatible', min: 8 }]}><Input.Password autoComplete="new-password" placeholder={editing?.hasApiKey ? '••••••••' : ''} /></Form.Item>
        </div>
        <p className={`${statLabel} mt-2 mb-3`}>{t('priceTitle')}</p>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Form.Item name="inputPerMTok" label={t('input')}><InputNumber min={0} step={0.1} className="!w-full" /></Form.Item>
          <Form.Item name="outputPerMTok" label={t('output')}><InputNumber min={0} step={0.1} className="!w-full" /></Form.Item>
          <Form.Item name="cacheReadPerMTok" label={t('cached')}><InputNumber min={0} step={0.01} className="!w-full" placeholder={t('equalsInput')} /></Form.Item>
        </div>
        <p className={`${statLabel} mt-2 mb-3`}>{t('options')}</p>
        <div className="grid gap-x-4 sm:grid-cols-3">
          {provider === 'anthropic' && <Form.Item name="effort" label={t('effort')}><Select allowClear placeholder="medium" options={['low', 'medium', 'high'].map(v => ({ value: v, label: v }))} /></Form.Item>}
          <Form.Item name="maxTokens" label={t('maxOutput')}><InputNumber min={256} max={64000} step={1000} className="!w-full" /></Form.Item>
          <Form.Item name="maxRequestTokens" label={t('limit')} tooltip={t('limitTip')}>
            <InputNumber min={2000} max={2000000} step={1000} className="!w-full" placeholder={t('noLimit')} />
          </Form.Item>
          <Form.Item name="timeoutMs" label={t('timeout')}><InputNumber min={5000} max={900000} step={10000} className="!w-full" placeholder="180000" /></Form.Item>
          {provider !== 'anthropic' && <Form.Item name="temperature" label={t('temperature')}><InputNumber min={0} max={2} step={0.1} className="!w-full" placeholder={t('defaultWord')} /></Form.Item>}
          {provider !== 'anthropic' && <Form.Item name="jsonMode" label={t('json')} valuePropName="checked"><Switch /></Form.Item>}
        </div>
        <div className="flex gap-6">
          <Form.Item name="enabled" label={t('turnedOnLabel')} valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="visibleToUsers" label={t('usersCanPick')} valuePropName="checked"><Switch /></Form.Item>
        </div>
      </Form>
    </Modal>
  </FeaturePage>;
}
