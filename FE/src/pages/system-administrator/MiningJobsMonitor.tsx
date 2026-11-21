import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Empty, Progress, Select, Spin, Tag, Typography } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { apiRequest } from '@/api/client';
import { cancelJobAsAdministrator, parseMiningJobs } from '@/features/mining-jobs';
import { describeBatchProgress } from '@/features/mining-coverage';
import type { MiningJob } from '@/features/mining-jobs';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { getAIModelsHealth, setDefaultAIModel } from '@/features/admin-api';
import type { AIModelUsage } from '@/features/admin-api';
import { providerDot, sectionTitle } from './admin-ui';
import { formatDateTime } from '@/i18n/format';
import { localizeStage } from '@/i18n';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  cancelFailed: 'Could not cancel this job.', defaultSet: 'Default model set to {model}', defaultFailed: 'Could not update default model.', modelsFailed: 'Could not load AI models.', jobsFailed: 'Could not load jobs.',
  title: 'Mining Jobs Monitor', intro: 'Monitor repository analysis jobs from the server.', resume: 'Resume auto-refresh', pause: 'Pause auto-refresh', refresh: 'Refresh',
  lastData: 'The last successfully loaded data remains visible.', notLoaded: 'Jobs could not be loaded.', retry: 'Retry', defaultModel: 'Default AI model for mining',
  defaultIntro: 'Used when a user does not pick a model for AI architecture refinement. Manage models under {link}.', aiModels: 'AI Models', noModel: 'No AI model is configured.', active: 'Active',
  tokens: 'Tokens this month: {used}', cost: 'Cost: {cost}', latency: 'Latency: {ms}ms', filter: 'Filter jobs by status', allJobs: 'All jobs',
  queued: 'queued', running: 'running', completed: 'completed', failed: 'failed', cancelled: 'cancelled', healthy: 'healthy', degraded: 'degraded', down: 'down', unknown: 'unknown',
  counts: '{running} running · {queued} queued', lastUpdated: ' · Last updated {time}', loading: 'Loading jobs…', noMatch: 'No jobs match this filter',
  requestedBy: 'Requested by {name}', noTime: 'Time not provided', copyId: 'Copy job id', copied: 'Copied', job: 'Job …{id}', cancel: 'Cancel', stop: 'Stop',
}, {
  cancelFailed: 'Không huỷ được việc này.', defaultSet: 'Đã đặt mô hình mặc định là {model}', defaultFailed: 'Không cập nhật được mô hình mặc định.', modelsFailed: 'Không tải được các mô hình AI.', jobsFailed: 'Không tải được các việc.',
  title: 'Theo dõi việc mining', intro: 'Theo dõi các việc phân tích repository từ máy chủ.', resume: 'Bật lại tự làm mới', pause: 'Tạm dừng tự làm mới', refresh: 'Làm mới',
  lastData: 'Dữ liệu tải thành công gần nhất vẫn được hiển thị.', notLoaded: 'Không tải được các việc.', retry: 'Thử lại', defaultModel: 'Mô hình AI mặc định cho mining',
  defaultIntro: 'Dùng khi người dùng không chọn mô hình để tinh chỉnh kiến trúc bằng AI. Quản lý mô hình ở {link}.', aiModels: 'Mô hình AI', noModel: 'Chưa cấu hình mô hình AI nào.', active: 'Đang dùng',
  tokens: 'Token tháng này: {used}', cost: 'Chi phí: {cost}', latency: 'Độ trễ: {ms}ms', filter: 'Lọc việc theo trạng thái', allJobs: 'Mọi việc',
  queued: 'đang chờ', running: 'đang chạy', completed: 'hoàn tất', failed: 'thất bại', cancelled: 'đã huỷ', healthy: 'ổn định', degraded: 'suy giảm', down: 'ngừng', unknown: 'không rõ',
  counts: '{running} đang chạy · {queued} đang chờ', lastUpdated: ' · Cập nhật lúc {time}', loading: 'Đang tải các việc…', noMatch: 'Không có việc nào khớp bộ lọc',
  requestedBy: '{name} yêu cầu', noTime: 'Không có thời gian', copyId: 'Sao chép mã việc', copied: 'Đã sao chép', job: 'Việc …{id}', cancel: 'Huỷ', stop: 'Dừng',
});
type Word = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'healthy' | 'degraded' | 'down' | 'unknown';
const WORDS = new Set<string>(['queued', 'running', 'completed', 'failed', 'cancelled', 'healthy', 'degraded', 'down', 'unknown']);
const word = (value: string) => (WORDS.has(value) ? translate(MSG, value as Word) : value);

export default function MiningJobsMonitor() {
  const { message } = App.useApp();
  const [jobs, setJobs] = useState<MiningJob[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [paused, setPaused] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [aiModels, setAiModels] = useState<AIModelUsage[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [modelLoading, setModelLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const m = useMessages(MSG);
  async function cancel(id: string) {
    setCancelError(null);
    try { await cancelJobAsAdministrator(id); setRevision(v => v + 1); }
    catch (cause) { setCancelError(cause instanceof Error ? cause.message : m('cancelFailed')); }
  }

  async function handleDefaultModelChange(model: string) {
    setModelLoading(true);
    try {
      await setDefaultAIModel(model);
      setDefaultModel(model);
      message.success(m('defaultSet', { model }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('defaultFailed'));
    } finally {
      setModelLoading(false);
    }
  }

  useEffect(() => {
    getAIModelsHealth()
      .then(res => {
        setAiModels(res.data.models);
        setDefaultModel(res.data.defaultModel);
      })
      .catch(cause => setAiError(cause instanceof Error ? cause.message : translate(MSG, 'modelsFailed')));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = parseMiningJobs(await apiRequest('/projects/jobs', { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setJobs(data); setError(null); setUpdated(new Date().toLocaleTimeString());
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'jobsFailed')); }
      finally { if (!controller.signal.aborted) { setLoading(false); if (!paused) timer = setTimeout(load, 5000); } }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision, paused]);
  const filtered = jobs.filter(j => filter === 'all' || j.status === filter);
  const pagination = usePagination(filtered, filter);
  return <FeaturePage title={m('title')} description={m('intro')} demo={false} actions={<div className="flex gap-2"><Button onClick={() => { setLoading(true); setPaused(v => !v); }}>{paused ? m('resume') : m('pause')}</Button><Button loading={loading} onClick={() => { setLoading(true); setRevision(v => v + 1); }}>{m('refresh')}</Button></div>}>
    {error && <Alert type="error" showIcon title={error} description={updated ? m('lastData') : m('notLoaded')} action={<Button onClick={() => { setLoading(true); setRevision(v => v + 1); }}>{m('retry')}</Button>} />}
    {cancelError && <Alert type="error" showIcon title={cancelError} closable onClose={() => setCancelError(null)} />}

    <section className={featurePanel}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className={`${sectionTitle} mb-1`}>{m('defaultModel')}</h3>
          <p className="text-sm text-[var(--at-muted)]">{m.rich('defaultIntro', { link: <Link key="l" to="/system-administrator/ai-models" className="text-[var(--at-link)]">{m('aiModels')}</Link> })}</p>
          {aiError && <p role="alert" className="text-xs text-red-400 mt-1">{aiError}</p>}
          {!aiError && !aiModels.length && <p className="text-xs text-[var(--at-muted)] mt-1">{m('noModel')}</p>}
        </div>
        <Select
          className="min-w-56"
          value={defaultModel}
          onChange={handleDefaultModelChange}
          loading={modelLoading}
          options={aiModels.map(model => ({
            value: model.model,
            disabled: !model.id,
            label: (
              <span className="flex items-center gap-2">
                <span className={providerDot(model.provider)} />
                {model.model}
                <Tag color={model.status === 'healthy' ? 'green' : model.status === 'degraded' ? 'gold' : model.status === 'down' ? 'red' : 'default'} className="ml-auto">
                  {word(model.status)}
                </Tag>
              </span>
            ),
          }))}
        />
      </div>
      <div className="grid gap-4 mt-4 sm:grid-cols-2 lg:grid-cols-4">
        {aiModels.map(model => (
          <button
            key={model.id ?? model.model}
            type="button"
            onClick={() => handleDefaultModelChange(model.model)}
            disabled={modelLoading || model.model === defaultModel || !model.id}
            aria-pressed={model.model === defaultModel}
            // The current default is not dimmed like an unavailable choice (index.css dims disabled buttons).
            style={model.model === defaultModel ? { opacity: 1, cursor: 'default' } : undefined}
            className={`rounded-[14px] p-4 border text-left transition-colors cursor-pointer hover:border-[var(--at-link)] disabled:cursor-default ${model.model === defaultModel ? 'border-[var(--at-accent)] bg-[var(--at-panel-2)]' : 'border-[var(--at-line)] hover:bg-[var(--at-panel-2)]'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={providerDot(model.provider)} />
              <span className="text-sm font-medium text-[var(--at-text)]">{model.model}</span>
              {model.model === defaultModel && <Tag color="blue" className="ml-auto">{m('active')}</Tag>}
            </div>
            <div className="text-xs text-[var(--at-muted)] space-y-1">
              <p>{m('tokens', { used: `${(model.tokensUsed / 1000).toFixed(1)}K${model.tokensLimit > 0 ? ` / ${(model.tokensLimit / 1000000).toFixed(0)}M` : ''}` })}</p>
              <p>{m('cost', { cost: `$${model.costUsd.toFixed(model.costUsd > 0 && model.costUsd < 1 ? 4 : 2)}` })}</p>
              <p>{m('latency', { ms: model.avgLatencyMs })}</p>
            </div>
          </button>
        ))}
      </div>
    </section>

    <div className="flex flex-wrap gap-3 items-center"><Select className="min-w-44" aria-label={m('filter')} value={filter} onChange={setFilter} options={['all', 'queued', 'running', 'completed', 'failed', 'cancelled'].map(value => ({ value, label: value === 'all' ? m('allJobs') : word(value) }))} /><span className="text-xs text-[var(--at-muted)]">{m('counts', { running: jobs.filter(j => j.status === 'running').length, queued: jobs.filter(j => j.status === 'queued').length })}{updated ? m('lastUpdated', { time: updated }) : ''}</span></div>
    {loading && !updated ? <div role="status" className="p-12 text-center"><Spin /><p>{m('loading')}</p></div> : !filtered.length && !error ? <Empty description={m('noMatch')} /> : null}
    <div className="space-y-3">{pagination.items.map(job => <article key={job.id} className={featurePanel}>
      <div className="flex flex-wrap justify-between gap-3"><div><Tag color={job.status === 'failed' ? 'red' : job.status === 'completed' ? 'green' : job.status === 'cancelled' ? 'default' : 'blue'}>{word(job.status)}</Tag><h3 className="text-base font-bold mt-2">{job.project}</h3><p className="text-xs text-[var(--at-muted)] mt-2">{m('requestedBy', { name: job.requestedBy })} · {job.createdAt ? formatDateTime(job.createdAt) : m('noTime')} · <Typography.Text className="text-xs text-[var(--at-muted)]" copyable={{ text: job.id, tooltips: [m('copyId'), m('copied')] }}>{m('job', { id: job.id.slice(-6) })}</Typography.Text></p></div>{(job.status === 'queued' || job.status === 'running') && <Button danger onClick={() => cancel(job.id)}>{job.status === 'queued' ? m('cancel') : m('stop')}</Button>}</div>
      <p className="text-sm mt-3">{localizeStage(job.stage)}{job.kind === 'mine' && job.total > 0 ? ` · ${describeBatchProgress(job)}` : ''}</p><Progress percent={job.progress} status={job.status === 'failed' ? 'exception' : job.status === 'completed' ? 'success' : 'normal'} />{job.error && <p role="alert" className="text-sm text-red-400 break-words">{job.error}</p>}
    </article>)}</div><PaginationBar {...pagination} />
  </FeaturePage>;
}
