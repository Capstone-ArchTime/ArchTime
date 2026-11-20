import { useState } from 'react';
import { Alert, App, Button, Input, Modal, Select, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Search } from 'lucide-react';
import { createAdminModel, discoverModels, formatCost, PROVIDER_PRESETS, presetFor, testAdminModel } from '@/features/llm-api';
import type { AdminModel, DiscoveredModel, ProviderPreset } from '@/features/llm-api';

import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  listFailed: 'Could not list the models.', checkFailed: 'added, check failed', failed: 'failed', added: 'Added {count} models. Health check:', added_one: 'Added 1 model. Health check:',
  model: 'Model', free: 'Free', addedTag: 'Added', cannotAnswer: 'It cannot answer the architecture prompt.', context: 'Context', price: 'Price / 1M in·out', title: 'Find models',
  selected: '{n} selected', cancel: 'Cancel', addTest: 'Add {n} and test', provider: 'Provider', baseUrl: 'Base URL', providerDefault: 'Provider default', getKey: ' Get a key at {link}.',
  apiKey: 'API key', optional: ' (optional)', storedKey: 'Using a stored key', reuse: '…or reuse the key of', registered: 'A registered model', find: 'Find models', freeOnly: 'Free only', noModels: 'No models for this key',
}, {
  listFailed: 'Không liệt kê được các mô hình.', checkFailed: 'đã thêm, kiểm tra thất bại', failed: 'thất bại', added: 'Đã thêm {count} mô hình. Kiểm tra tình trạng:',
  model: 'Mô hình', free: 'Miễn phí', addedTag: 'Đã thêm', cannotAnswer: 'Mô hình này không trả lời được prompt kiến trúc.', context: 'Ngữ cảnh', price: 'Giá / 1M vào·ra', title: 'Tìm mô hình',
  selected: 'Đã chọn {n}', cancel: 'Huỷ', addTest: 'Thêm {n} và kiểm tra', provider: 'Nhà cung cấp', baseUrl: 'Base URL', providerDefault: 'Mặc định của nhà cung cấp', getKey: ' Lấy key tại {link}.',
  apiKey: 'API key', optional: ' (không bắt buộc)', storedKey: 'Đang dùng key đã lưu', reuse: '…hoặc dùng lại key của', registered: 'Một mô hình đã đăng ký', find: 'Tìm mô hình', freeOnly: 'Chỉ miễn phí', noModels: 'Không có mô hình nào cho key này',
});

export interface FindModelsStart { presetId?: string; fromModel?: AdminModel }

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');

/**
 * Lists the models a provider offers for a key and adds the ones picked, each health-checked right away.
 * The key can be typed, or reused from a model already registered for the same provider.
 */
export default function FindModelsModal({ start, models, onClose, onAdded }: { start: FindModelsStart; models: AdminModel[]; onClose: () => void; onAdded: () => void }) {
  const { message } = App.useApp();
  const initial = start.fromModel ? presetFor(start.fromModel.provider, start.fromModel.baseUrl) : PROVIDER_PRESETS.find(p => p.id === (start.presetId ?? 'groq'));
  const [preset, setPreset] = useState<ProviderPreset>(initial ?? PROVIDER_PRESETS[0]);
  const [baseUrl, setBaseUrl] = useState(start.fromModel?.baseUrl ?? initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [keyFrom, setKeyFrom] = useState<string | undefined>(start.fromModel?.hasApiKey ? start.fromModel.id : undefined);
  const [found, setFound] = useState<DiscoveredModel[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'find' | 'add' | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const t = useMessages(MSG);

  // Keys stored for the same provider and server can be reused.
  const reusable = models.filter(m => m.hasApiKey && m.provider === preset.provider && (preset.provider !== 'openai-compatible' || (m.baseUrl ?? '') === baseUrl.replace(/\/+$/, '')));

  function choose(id: string) {
    const next = PROVIDER_PRESETS.find(p => p.id === id)!;
    setPreset(next); setBaseUrl(next.baseUrl ?? ''); setFound(null); setSelected([]); setError(null); setKeyFrom(undefined);
  }

  async function find() {
    setBusy('find'); setError(null); setFound(null); setSelected([]);
    try {
      const list = await discoverModels({ provider: preset.provider, ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : keyFrom ? { fromModelId: keyFrom } : {}) });
      setFound(list);
      // Preselect a few chat models (largest context first, the server's order) so the common case is one click.
      setSelected(list.filter(m => m.chat && !m.registered && (m.free || preset.id === 'groq' || preset.id === 'cerebras')).slice(0, 3).map(m => m.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('listFailed')); }
    finally { setBusy(null); }
  }

  async function add() {
    if (!found) return;
    setBusy('add');
    const results: string[] = [];
    let added = 0;
    for (const id of selected) {
      const m = found.find(x => x.id === id)!;
      try {
        const created = await createAdminModel({
          key: slug(`${preset.id}-${id}`),
          displayName: `${m.name ?? id} (${preset.label.replace(/ \(.*\)$/, '')})`.slice(0, 80),
          provider: preset.provider, model: id, baseUrl: baseUrl.trim() || null,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : keyFrom ? { apiKeyFrom: keyFrom } : { apiKey: null }),
          pricing: { inputPerMTok: m.pricing?.inputPerMTok ?? 0, outputPerMTok: m.pricing?.outputPerMTok ?? 0 },
          enabled: true, visibleToUsers: true,
        });
        added++;
        const health = await testAdminModel(created.id).catch(() => null);
        results.push(`${id}: ${health ? health.status : t('checkFailed')}`);
      } catch (cause) { results.push(`${id}: ${cause instanceof Error ? cause.message : t('failed')}`); }
    }
    setBusy(null);
    if (added) {
      message.success({ content: <div><p>{t('added', { count: added })}</p><ul className="text-xs text-left">{results.map(r => <li key={r}>{r}</li>)}</ul></div>, duration: 8 });
      onAdded();
      onClose();
    } else {
      setError(results.join(' · '));
    }
  }

  const rows = (found ?? []).filter(m => !onlyFree || m.free);
  const columns: ColumnsType<DiscoveredModel> = [
    { title: t('model'), render: (_, m) => <div><span className="font-mono text-xs">{m.id}</span>{m.name && <span className="block text-[11px] text-[var(--at-muted)]">{m.name}</span>}</div> },
    { title: '', width: 150, render: (_, m) => <span className="flex flex-wrap gap-1">
      {m.free && <Tag color="green">{t('free')}</Tag>}
      {m.registered && <Tag>{t('addedTag')}</Tag>}
      {!m.chat && <Tooltip title={t('cannotAnswer')}><Tag color="red">{m.reason}</Tag></Tooltip>}
    </span> },
    { title: t('context'), align: 'right', width: 90, render: (_, m) => (m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k` : '–') },
    { title: t('price'), align: 'right', width: 140, render: (_, m) => (m.pricing ? `${formatCost(m.pricing.inputPerMTok)} · ${formatCost(m.pricing.outputPerMTok)}` : '–') },
  ];

  return <Modal open title={t('title')} width={760} onCancel={onClose} destroyOnHidden
    footer={<div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--at-muted)]">{found ? t('selected', { n: selected.length }) : ''}</span>
      <span className="flex gap-2"><Button onClick={onClose}>{t('cancel')}</Button><Button type="primary" disabled={!selected.length} loading={busy === 'add'} onClick={() => void add()}>{t('addTest', { n: selected.length || '' })}</Button></span>
    </div>}>
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{t('provider')}
          <Select className="w-full mt-1" value={preset.id} onChange={choose} options={PROVIDER_PRESETS.map(p => ({ value: p.id, label: p.label }))} />
        </label>
        <label className="text-sm">{t('baseUrl')}
          <Input className="mt-1" value={baseUrl} disabled={preset.provider !== 'openai-compatible'} placeholder={preset.provider === 'openai-compatible' ? 'https://…/v1' : t('providerDefault')} onChange={e => { setBaseUrl(e.target.value); setFound(null); }} />
        </label>
      </div>
      <p className="text-xs text-[var(--at-muted)]">{preset.hint}{preset.keyUrl && <>{t.rich('getKey', { link: <a key="k" href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-[var(--at-link)]">{new URL(preset.keyUrl).host}</a> })}</>}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{t('apiKey')}{preset.keyOptional ? t('optional') : ''}
          <Input.Password className="mt-1" autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={keyFrom ? t('storedKey') : ''} />
        </label>
        {reusable.length > 0 && <label className="text-sm">{t('reuse')}
          <Select className="w-full mt-1" allowClear value={keyFrom} onChange={setKeyFrom} placeholder={t('registered')}
            options={reusable.map(m => ({ value: m.id, label: `${m.displayName} (…${m.apiKeyLast4})` }))} />
        </label>}
      </div>
      <div className="flex items-center gap-3">
        <Button icon={<Search size={14} />} loading={busy === 'find'} onClick={() => void find()}
          disabled={(!preset.keyOptional && !apiKey.trim() && !keyFrom) || (preset.provider === 'openai-compatible' && !baseUrl.trim())}>{t('find')}</Button>
        {found && <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={onlyFree} onChange={e => setOnlyFree(e.target.checked)} /> {t('freeOnly')}</label>}
      </div>
      {error && <Alert type="error" showIcon title={error} />}
      {found && <Table<DiscoveredModel> rowKey="id" size="small" dataSource={rows} columns={columns} pagination={{ pageSize: 8, size: 'small' }} scroll={{ x: 640 }}
        locale={{ emptyText: t('noModels') }}
        rowSelection={{ selectedRowKeys: selected, onChange: keys => setSelected(keys as string[]), getCheckboxProps: m => ({ disabled: !m.chat || m.registered }) }} />}
    </div>
  </Modal>;
}
