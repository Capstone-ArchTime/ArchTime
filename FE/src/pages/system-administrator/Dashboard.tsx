import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Spin, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { apiRequest } from '@/api/client';
import { getAdminMetrics, getServicesStatus, getAdminUsers, getAdminAuditLogs, getAIModelsHealth } from '@/features/admin-api';
import type { AdminMetrics, ServiceStatus, AdminUser, AdminAuditLog, AIModelUsage } from '@/features/admin-api';

export default function Dashboard() {
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [recentLogs, setRecentLogs] = useState<AdminAuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [aiModels, setAiModels] = useState<AIModelUsage[]>([]);
  const [aiTotalCost, setAiTotalCost] = useState(0);
  const [aiTotalTokens, setAiTotalTokens] = useState(0);
  const [aiDefaultModel, setAiDefaultModel] = useState('');
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    apiRequest<{ status: string; timestamp: string }>('/health', { signal: controller.signal })
      .then(result => {
        if (result.status !== 'ok' || !Number.isFinite(Date.parse(result.timestamp))) throw new Error('Unexpected health response.');
        setHealth(result);
        setHealthError(null);
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setHealth(null);
          setHealthError(cause instanceof Error ? cause.message : 'Health check failed.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setHealthLoading(false); });

    getAdminMetrics(controller.signal)
      .then(res => setMetrics(res.data))
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setMetricsLoading(false); });

    getServicesStatus(controller.signal)
      .then(res => setServices(res.data.services))
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setServicesLoading(false); });

    getAdminUsers({ limit: 100 }, controller.signal)
      .then(res => setUsers(res.data.users))
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setUsersLoading(false); });

    getAdminAuditLogs({ limit: 5 }, controller.signal)
      .then(res => setRecentLogs(res.data.logs))
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLogsLoading(false); });

    setAiError(null);
    getAIModelsHealth(controller.signal)
      .then(res => {
        setAiModels(res.data.models);
        setAiTotalCost(res.data.totalCostUsd);
        setAiTotalTokens(res.data.totalTokensUsed);
        setAiDefaultModel(res.data.defaultModel);
      })
      .catch(cause => { if (!controller.signal.aborted) setAiError(cause instanceof Error ? cause.message : 'Could not load AI model data.'); })
      .finally(() => { if (!controller.signal.aborted) setAiLoading(false); });

    return () => controller.abort();
  }, [revision]);

  const isLoading = healthLoading || metricsLoading || servicesLoading;

  return (
    <FeaturePage
      title="System & infrastructure health"
      description="Check API availability and open administration tools."
      demo={false}
      actions={
        <Button loading={isLoading} onClick={() => { setHealthLoading(true); setMetricsLoading(true); setServicesLoading(true); setRevision(v => v + 1); }}>
          Refresh
        </Button>
      }
    >
      <section className={featurePanel}>
        <h3 className="font-semibold mb-3">
          API health{' '}
          <Tag color={health ? 'green' : healthError ? 'red' : 'default'}>
            {healthLoading ? 'Checking' : health ? 'Responding' : 'Unavailable'}
          </Tag>
        </h3>
        {health && (
          <p className="text-sm text-[#94a3b8]">
            Server checked at {new Date(health.timestamp).toLocaleString()}.
          </p>
        )}
        {healthError && <Alert type="error" message={healthError} />}
      </section>

      <section className={featurePanel}>
        <h3 className="font-semibold mb-3">Services Status</h3>
        {servicesLoading ? (
          <Spin size="small" />
        ) : services.length ? (
          <div className="flex flex-wrap gap-3">
            {services.map(s => (
              <Tag key={s.name} color={s.status === 'healthy' ? 'green' : s.status === 'degraded' ? 'gold' : 'red'}>
                {s.name}: {s.status}{s.latency !== undefined && ` (${s.latency}ms)`}
              </Tag>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#94a3b8]">No service status available.</p>
        )}
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'CPU load', value: metrics?.cpu, unit: '%' },
          { label: 'Memory', value: metrics?.memory, unit: '%' },
          { label: 'Repository storage', value: metrics?.storage, unit: 'GB' },
          { label: 'Queue capacity', value: metrics?.queueCapacity, unit: '%' },
        ].map(({ label, value, unit }) => (
          <div key={label} className={featurePanel}>
            <p className="text-xs text-[#94a3b8]">{label}</p>
            <p className="text-3xl my-3">
              {metricsLoading ? <Spin size="small" /> : value !== undefined ? `${value}${unit}` : '—'}
            </p>
            {value === undefined && !metricsLoading && (
              <p className="text-xs text-[#94a3b8]">Metrics API required</p>
            )}
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        {[
          ['users', 'Manage users'],
          ['settings', 'System settings'],
          ['mining-jobs', 'Live mining jobs'],
          ['audit-log', 'Audit history'],
        ].map(([path, label]) => (
          <Link
            key={path}
            to={`/system-administrator/${path}`}
            className="border border-[#222c37] px-4 py-3 text-sm text-[#38bdf8] hover:border-[#38bdf8]"
          >
            {label} →
          </Link>
        ))}
      </div>

      <section className={featurePanel}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">AI Model Health</h3>
          <Link to="/system-administrator/ai-metrics" className="text-xs text-[#38bdf8]">Usage & metrics →</Link>
        </div>
        {aiLoading ? (
          <Spin size="small" />
        ) : aiError ? (
          <p role="alert" className="text-sm text-red-400">{aiError}</p>
        ) : !aiModels.length ? (
          <p className="text-sm text-[#94a3b8]">No AI model is configured. <Link to="/system-administrator/ai-models" className="text-[#38bdf8]">Add one under AI Models</Link>.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-[#11161b] border border-[#222c37] p-4">
                <p className="text-xs text-[#94a3b8]">Total Cost (This Month)</p>
                <p className="text-2xl font-bold text-[#38bdf8] mt-1">${aiTotalCost.toFixed(aiTotalCost > 0 && aiTotalCost < 1 ? 4 : 2)}</p>
              </div>
              <div className="bg-[#11161b] border border-[#222c37] p-4">
                <p className="text-xs text-[#94a3b8]">Total Tokens Used</p>
                <p className="text-2xl font-bold mt-1">{(aiTotalTokens / 1000000).toFixed(2)}M</p>
              </div>
              <div className="bg-[#11161b] border border-[#222c37] p-4">
                <p className="text-xs text-[#94a3b8]">Default Model</p>
                <p className="text-lg font-semibold mt-1 text-[#38bdf8]">{aiDefaultModel || '–'}</p>
              </div>
            </div>
            <div className="space-y-3">
              {aiModels.map(m => (
                <div key={m.id ?? m.model} className="flex items-center justify-between p-3 bg-[#11161b] border border-[#222c37]">
                  <div className="flex items-center gap-3">
                    <Tag color={m.provider === 'anthropic' ? 'purple' : m.provider === 'gemini' ? 'blue' : 'green'}>{m.provider}</Tag>
                    <div>
                      <p className="font-medium">{m.model}</p>
                      <p className="text-xs text-[#94a3b8]">
                        {m.requestsToday} requests today · {m.avgLatencyMs}ms avg
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-[#94a3b8]">Tokens</p>
                      <p>{(m.tokensUsed / 1000).toFixed(1)}K{m.tokensLimit > 0 ? ` / ${(m.tokensLimit / 1000000).toFixed(0)}M` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#94a3b8]">Cost</p>
                      <p>${m.costUsd.toFixed(m.costUsd > 0 && m.costUsd < 1 ? 4 : 2)}</p>
                    </div>
                    <Tag color={m.status === 'healthy' ? 'green' : m.status === 'degraded' ? 'gold' : m.status === 'down' ? 'red' : 'default'}>
                      {m.status}
                    </Tag>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className={featurePanel}>
        <h3 className="font-semibold mb-4">User Overview</h3>
        {usersLoading ? (
          <Spin size="small" />
        ) : (
          <div className="flex flex-wrap gap-4 text-sm">
            <span>{users.length} total accounts</span>
            <span>{users.filter(u => u.status === 'active').length} active</span>
            <span>{users.filter(u => u.status === 'invited').length} pending invitations</span>
            <span>{users.filter(u => u.status === 'suspended').length} suspended</span>
          </div>
        )}
      </section>

      <section className={featurePanel}>
        <h3 className="font-semibold mb-4">Recent Activity</h3>
        {logsLoading ? (
          <Spin size="small" />
        ) : recentLogs.length ? (
          <ul className="space-y-3">
            {recentLogs.map(e => (
              <li key={e.id} className="border-t border-[#222c37] pt-3 text-sm">
                <p>{e.description}</p>
                <p className="text-xs text-[#94a3b8] mt-1">
                  {e.actor} · {new Date(e.timestamp).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#94a3b8]">No recent activity.</p>
        )}
        <Link to="/system-administrator/audit-log" className="text-sm text-[#38bdf8] mt-4 inline-block">
          View all activity →
        </Link>
      </section>
    </FeaturePage>
  );
}
