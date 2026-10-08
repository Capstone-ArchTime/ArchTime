import { useState } from 'react';
import { App, Button, Select, Tag, Tooltip } from 'antd';
import { Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { RefineReceipt } from '@/features/architecture/api';
import { formatCompactTokens, formatCost, formatMs, formatPercent, formatTokens, healthColor, selectedModel, sendRunFeedback } from '@/features/llm-api';
import type { UserModelOption, UserModels } from '@/features/llm-api';

function OptionLabel({ m, defaultId }: { m: UserModelOption; defaultId: string | null }) {
  return <div className="flex flex-col py-0.5">
    <span className="flex flex-wrap items-center gap-1">
      <span className="font-medium">{m.displayName}</span>
      {m.recommended && <Tag color="gold" className="!m-0" icon={<Star size={10} className="inline -mt-0.5 mr-0.5" />}>Recommended</Tag>}
      {m.id === defaultId && <Tag className="!m-0">Default</Tag>}
      <Tag className="!m-0" color={m.external ? 'blue' : 'green'}>{m.external ? 'External' : 'Local'}</Tag>
      {m.health !== 'up' && m.health !== 'unknown' && <Tag className="!m-0" color={healthColor[m.health]}>{m.health}</Tag>}
    </span>
    <span className="text-[11px] text-[#94a3b8]">
      {m.score ? `Score ${m.score.value}${m.score.confident ? '' : ' (few runs)'} · ${formatPercent(m.score.successRate)} success · ` : 'No runs yet · '}
      {m.estimate ? `~${formatCompactTokens(m.estimate.tokens)} tokens, ~${formatCost(m.estimate.cost, m.pricing.currency)}` : `${formatCost(m.pricing.inputPerMTok, m.pricing.currency)}/${formatCost(m.pricing.outputPerMTok, m.pricing.currency)} per 1M in/out`}
    </span>
  </div>;
}

/** Lets the user choose which AI model draws the architecture. Hidden when the administrator turned the choice off. */
export default function ModelPicker({ models, value, onChange, disabled }: { models: UserModels | null; value: string | undefined; onChange: (id: string | undefined) => void; disabled?: boolean }) {
  if (!models || !models.allowUserModelChoice || models.models.length < 2) return null;
  const current = selectedModel(models, value);
  return <Tooltip title={models.mode === 'name-only' ? 'This snapshot is large: the model only names the components found by clustering.' : 'Which AI model groups and names the components.'}>
    <Select aria-label="AI model" className="min-w-64" popupMatchSelectWidth={420} disabled={disabled} value={current?.id}
      onChange={(id: string) => onChange(id === models.defaultModelId ? undefined : id)}
      optionLabelProp="short"
      options={models.models.map(m => ({ value: m.id, short: <span>{m.recommended ? '★ ' : ''}{m.displayName}</span>, label: <OptionLabel m={m} defaultId={models.defaultModelId} /> }))} />
  </Tooltip>;
}

/** Model, tokens in/out/total, time and cost of one AI run, plus a thumbs up/down that feeds the model's quality score. */
export function RunUsage({ receipt }: { receipt: RefineReceipt }) {
  const { message } = App.useApp();
  const [rated, setRated] = useState<0 | 1 | null>(null);
  const u = receipt.usage;
  if (!u) return null;
  async function rate(rating: 0 | 1) {
    if (!receipt.runId) return;
    try { await sendRunFeedback(receipt.runId, rating); setRated(rating); message.success('Thanks, this counts towards the model\'s score.'); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not save your rating.'); }
  }
  const item = (label: string, value: string) => <span className="whitespace-nowrap"><span className="text-[#94a3b8]">{label}</span> <span className="font-mono text-[#e2e8f0]">{value}</span></span>;
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-[#242527] bg-[#11161b] px-3 py-2 text-xs" aria-label="AI usage for this result">
    {item('Model', receipt.model)}
    {item('Input', formatTokens(u.inputTokens))}
    {item('Output', formatTokens(u.outputTokens))}
    {item('Total', `${formatTokens(u.totalTokens)}${u.estimated ? ' (estimated)' : ''}`)}
    {receipt.latencyMs !== undefined && item('Time', formatMs(receipt.latencyMs))}
    {receipt.cost && item('Cost', formatCost(receipt.cost.amount, receipt.cost.currency))}
    {receipt.attempts.length > 1 && item('Attempts', String(receipt.attempts.length))}
    {receipt.runId && <span className="ml-auto flex items-center gap-1">
      <span className="text-[#94a3b8]">Useful?</span>
      <Button size="small" type={rated === 1 ? 'primary' : 'text'} aria-label="Useful" icon={<ThumbsUp size={13} />} onClick={() => void rate(1)} />
      <Button size="small" type={rated === 0 ? 'primary' : 'text'} aria-label="Not useful" icon={<ThumbsDown size={13} />} onClick={() => void rate(0)} />
    </span>}
  </div>;
}
