import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Empty, Progress, Select, Spin, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { apiRequest } from '@/api/client';
import { parseMiningJobs } from '@/features/mining-jobs';
import { cancelMiningJob } from '@/features/mining-api';
import { describeBatchProgress } from '@/features/mining-coverage';
import type { MiningJob } from '@/features/mining-jobs';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { getAIModelsHealth, setDefaultAIModel } from '@/features/admin-api';
import type { AIModelUsage } from '@/features/admin-api';

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
  async function cancel(id: string) {
    setCancelError(null);
    try { await cancelMiningJob(id); setRevision(v => v + 1); }
    catch (cause) { setCancelError(cause instanceof Error ? cause.message : 'Could not cancel this job.'); }
  }

  async function handleDefaultModelChange(model: string) {
    setModelLoading(true);
    try {
      await setDefaultAIModel(model);
      setDefaultModel(model);
      message.success(`Default model set to ${model}`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not update default model.');
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
      .catch(cause => setAiError(cause instanceof Error ? cause.message : 'Could not load AI models.'));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = parseMiningJobs(await apiRequest('/projects/jobs', { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setJobs(data); setError(null); setUpdated(new Date().toLocaleTimeString());
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load jobs.'); }
      finally { if (!controller.signal.aborted) { setLoading(false); if (!paused) timer = setTimeout(load, 5000); } }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision, paused]);
  const filtered = jobs.filter(j => filter === 'all' || j.status === filter);
  const pagination = usePagination(filtered, filter);
  return <FeaturePage title="Mining Jobs Monitor" description="Monitor repository analysis jobs from the server." demo={false} actions={<div className="flex gap-2"><Button onClick={() => { setLoading(true); setPaused(v => !v); }}>{paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}</Button><Button loading={loading} onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Refresh</Button></div>}>
    {error && <Alert type="error" showIcon title={error} description={updated ? 'The last successfully loaded data remains visible.' : 'Jobs could not be loaded.'} action={<Button onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Retry</Button>} />}
    {cancelError && <Alert type="error" showIcon title={cancelError} closable onClose={() => setCancelError(null)} />}

    <section className={featurePanel}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold mb-1">Default AI Model for Mining</h3>
          <p className="text-xs text-[#94a3b8]">Used when a user does not pick a model for AI architecture refinement. Manage models under <Link to="/system-administrator/ai-models" className="text-[#38bdf8]">AI Models</Link>.</p>
          {aiError && <p role="alert" className="text-xs text-red-400 mt-1">{aiError}</p>}
          {!aiError && !aiModels.length && <p className="text-xs text-[#94a3b8] mt-1">No AI model is configured.</p>}
        </div>
        <Select
          className="min-w-56"
          value={defaultModel}
          onChange={handleDefaultModelChange}
          loading={modelLoading}
          options={aiModels.map(m => ({
            value: m.model,
            disabled: !m.id,
            label: (
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${m.provider === 'anthropic' ? 'bg-purple-500' : m.provider === 'gemini' ? 'bg-sky-500' : 'bg-green-500'}`} />
                {m.model}
                <Tag color={m.status === 'healthy' ? 'green' : m.status === 'degraded' ? 'gold' : m.status === 'down' ? 'red' : 'default'} className="ml-auto">
                  {m.status}
                </Tag>
              </span>
            ),
          }))}
        />
      </div>
      <div className="grid grid-cols-4 gap-4 mt-4">
        {aiModels.map(m => (
          <button
            key={m.id ?? m.model}
            type="button"
            onClick={() => handleDefaultModelChange(m.model)}
            disabled={modelLoading || m.model === defaultModel || !m.id}
            className={`p-3 border text-left transition-colors cursor-pointer hover:border-[#38bdf8]/50 disabled:cursor-default ${m.model === defaultModel ? 'border-[#38bdf8] bg-[#38bdf8]/5' : 'border-[#222c37] hover:bg-[#161d24]'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${m.provider === 'anthropic' ? 'bg-purple-500' : m.provider === 'gemini' ? 'bg-sky-500' : 'bg-green-500'}`} />
              <span className="text-sm font-medium text-[#f4f4f6]">{m.model}</span>
              {m.model === defaultModel && <Tag color="blue" className="ml-auto">Active</Tag>}
            </div>
            <div className="text-xs text-[#94a3b8] space-y-1">
              <p>Tokens this month: {(m.tokensUsed / 1000).toFixed(1)}K{m.tokensLimit > 0 ? ` / ${(m.tokensLimit / 1000000).toFixed(0)}M` : ''}</p>
              <p>Cost: ${m.costUsd.toFixed(m.costUsd > 0 && m.costUsd < 1 ? 4 : 2)}</p>
              <p>Latency: {m.avgLatencyMs}ms</p>
            </div>
          </button>
        ))}
      </div>
    </section>

    <div className="flex flex-wrap gap-3 items-center"><Select className="min-w-44" aria-label="Filter jobs by status" value={filter} onChange={setFilter} options={['all', 'queued', 'running', 'completed', 'failed', 'cancelled'].map(value => ({ value, label: value === 'all' ? 'All jobs' : value }))} /><span className="text-xs text-[#94a3b8]">{jobs.filter(j => j.status === 'running').length} running · {jobs.filter(j => j.status === 'queued').length} queued{updated ? ` · Last updated ${updated}` : ''}</span></div>
    {loading && !updated ? <div role="status" className="p-12 text-center"><Spin /><p>Loading jobs…</p></div> : !filtered.length && !error ? <Empty description="No jobs match this filter" /> : null}
    <div className="space-y-3">{pagination.items.map(job => <article key={job.id} className={featurePanel}>
      <div className="flex flex-wrap justify-between gap-3"><div><Tag color={job.status === 'failed' ? 'red' : job.status === 'completed' ? 'green' : job.status === 'cancelled' ? 'orange' : 'blue'}>{job.status}</Tag><h3 className="font-semibold mt-2">{job.project}</h3><p className="text-xs text-[#94a3b8] mt-2 break-all">{job.id} · Requested by {job.requestedBy} · {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Time not provided'}</p></div>{(job.status === 'queued' || job.status === 'running') && <Button danger onClick={() => cancel(job.id)}>{job.status === 'queued' ? 'Cancel' : 'Stop'}</Button>}</div>
      <p className="text-sm mt-3">{job.stage}{job.kind === 'mine' && job.total > 0 ? ` · ${describeBatchProgress(job)}` : ''}</p><Progress percent={job.progress} status={job.status === 'failed' ? 'exception' : job.status === 'completed' ? 'success' : 'normal'} />{job.error && <p role="alert" className="text-sm text-red-400 break-words">{job.error}</p>}
    </article>)}</div><PaginationBar {...pagination} />
  </FeaturePage>;
}
