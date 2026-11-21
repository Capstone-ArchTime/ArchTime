import { useState } from 'react';
import { App, Button, Select, Tag, Tooltip } from 'antd';
import { Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { RefineReceipt } from '@/features/architecture/api';
import { formatCompactTokens, formatCost, formatMs, formatPercent, formatTokens, healthColor, selectedModel, sendRunFeedback } from '@/features/llm-api';
import type { UserModelOption, UserModels } from '@/features/llm-api';
import { useMessages } from '@/i18n/define';
import { ARCH } from './messages';

function OptionLabel({ m: model, defaultId }: { m: UserModelOption; defaultId: string | null }) {
  const t = useMessages(ARCH);
  const m = model;
  return <div className="flex flex-col py-0.5">
    <span className="flex flex-wrap items-center gap-1">
      <span className="font-medium">{m.displayName}</span>
      {m.recommended && <Tag color="gold" className="!m-0" icon={<Star size={10} className="inline -mt-0.5 mr-0.5" />}>{t('recommended')}</Tag>}
      {m.id === defaultId && <Tag className="!m-0">{t('default')}</Tag>}
      <Tag className="!m-0" color={m.external ? 'blue' : 'green'}>{m.external ? t('external') : t('local')}</Tag>
      {m.health !== 'up' && m.health !== 'unknown' && <Tag className="!m-0" color={healthColor[m.health]}>{m.health}</Tag>}
    </span>
    <span className="text-[11px] text-[var(--at-muted)]">
      {m.score ? `${t('score', { value: m.score.value })}${m.score.confident ? '' : t('fewRuns')} · ${t('success', { pct: formatPercent(m.score.successRate) })} · ` : t('noRuns')}
      {m.estimate ? t('estimate', { tokens: formatCompactTokens(m.estimate.tokens), cost: formatCost(m.estimate.cost, m.pricing.currency) }) : t('perMillion', { in: formatCost(m.pricing.inputPerMTok, m.pricing.currency), out: formatCost(m.pricing.outputPerMTok, m.pricing.currency) })}
    </span>
  </div>;
}

/** Lets the user choose which AI model draws the architecture. Hidden when the administrator turned the choice off. */
export default function ModelPicker({ models, value, onChange, disabled }: { models: UserModels | null; value: string | undefined; onChange: (id: string | undefined) => void; disabled?: boolean }) {
  const t = useMessages(ARCH);
  if (!models || !models.allowUserModelChoice || models.models.length < 2) return null;
  const current = selectedModel(models, value);
  return <Tooltip title={models.mode === 'name-only' ? t('nameOnly') : t('whichModel')}>
    <Select aria-label={t('aiModel')} className="min-w-64" popupMatchSelectWidth={420} disabled={disabled} value={current?.id}
      onChange={(id: string) => onChange(id === models.defaultModelId ? undefined : id)}
      optionLabelProp="short"
      options={models.models.map(m => ({ value: m.id, short: <span>{m.recommended ? '★ ' : ''}{m.displayName}</span>, label: <OptionLabel m={m} defaultId={models.defaultModelId} /> }))} />
  </Tooltip>;
}

/** Model, tokens in/out/total, time and cost of one AI run, plus a thumbs up/down that feeds the model's quality score. */
export function RunUsage({ receipt }: { receipt: RefineReceipt }) {
  const { message } = App.useApp();
  const t = useMessages(ARCH);
  const [rated, setRated] = useState<0 | 1 | null>(null);
  const u = receipt.usage;
  if (!u) return null;
  async function rate(rating: 0 | 1) {
    if (!receipt.runId) return;
    try { await sendRunFeedback(receipt.runId, rating); setRated(rating); message.success(t('thanks')); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : t('rateFailed')); }
  }
  const item = (label: string, value: string) => <span className="whitespace-nowrap"><span className="text-[var(--at-muted)]">{label}</span> <span className="font-mono text-[var(--at-text)]">{value}</span></span>;
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-[var(--at-line)] bg-[var(--at-panel)] px-3 py-2 text-xs" aria-label={t('usageFor')}>
    {item(t('model'), receipt.model)}
    {item(t('input'), formatTokens(u.inputTokens))}
    {item(t('output'), formatTokens(u.outputTokens))}
    {item(t('total'), `${formatTokens(u.totalTokens)}${u.estimated ? t('estimated') : ''}`)}
    {receipt.latencyMs !== undefined && item(t('time'), formatMs(receipt.latencyMs))}
    {receipt.cost && item(t('cost'), formatCost(receipt.cost.amount, receipt.cost.currency))}
    {receipt.attempts.length > 1 && item(t('attempts'), String(receipt.attempts.length))}
    {receipt.runId && <span className="ml-auto flex items-center gap-1">
      <span className="text-[var(--at-muted)]">{t('useful')}</span>
      <Button size="small" type={rated === 1 ? 'primary' : 'text'} aria-label={t('yesUseful')} icon={<ThumbsUp size={13} />} onClick={() => void rate(1)} />
      <Button size="small" type={rated === 0 ? 'primary' : 'text'} aria-label={t('notUseful')} icon={<ThumbsDown size={13} />} onClick={() => void rate(0)} />
    </span>}
  </div>;
}
