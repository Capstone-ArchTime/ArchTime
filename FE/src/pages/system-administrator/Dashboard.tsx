import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Spin, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { nestedPanel, pillLink, sectionTitle, statCard, statLabel } from './admin-ui';
import { apiRequest } from '@/api/client';
import { getAdminMetrics, getServicesStatus, getAdminUsers, getAdminAuditLogs, getAIModelsHealth } from '@/features/admin-api';
import type { AdminMetrics, ServiceStatus, AdminUser, AdminAuditLog, AIModelUsage } from '@/features/admin-api';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  unexpected: 'Unexpected health response.', healthFailed: 'Health check failed.', aiFailed: 'Could not load AI model data.', cpu: 'CPU load', memory: 'Memory', storage: 'Repository storage', queue: 'Queue capacity',
  title: 'System & infrastructure health', intro: 'Check API availability and open administration tools.', refresh: 'Refresh', apiHealth: 'API health', checking: 'Checking', responding: 'Responding', unavailable: 'Unavailable',
  checkedAt: 'Server checked at {date}.', services: 'Services status', healthy: 'healthy', degraded: 'degraded', down: 'down', unknown: 'unknown', manageUsers: 'Manage users', settings: 'System settings', jobs: 'Live mining jobs', audit: 'Audit history',
  aiHealth: 'AI model health', usageMetrics: 'Usage & metrics →', noModel: 'No AI model is configured. {link}.', addOne: 'Add one under AI Models', totalCost: 'Total Cost (This Month)', totalTokens: 'Total Tokens Used', defaultModel: 'Default Model',
  requests: '{n} requests today · {ms}ms avg', tokens: 'Tokens', cost: 'Cost', users: 'User overview', totalAccounts: 'Total accounts', active: 'Active', pending: 'Pending invitations', suspended: 'Suspended',
  recent: 'Recent activity', noRecent: 'No recent activity.', viewAll: 'View all activity →',
}, {
  unexpected: 'Phản hồi kiểm tra tình trạng không như mong đợi.', healthFailed: 'Kiểm tra tình trạng thất bại.', aiFailed: 'Không tải được dữ liệu mô hình AI.', cpu: 'Tải CPU', memory: 'Bộ nhớ', storage: 'Lưu trữ repository', queue: 'Sức chứa hàng đợi',
  title: 'Tình trạng hệ thống & hạ tầng', intro: 'Kiểm tra API có hoạt động không và mở các công cụ quản trị.', refresh: 'Làm mới', apiHealth: 'Tình trạng API', checking: 'Đang kiểm tra', responding: 'Đang phản hồi', unavailable: 'Không hoạt động',
  checkedAt: 'Máy chủ được kiểm tra lúc {date}.', services: 'Trạng thái dịch vụ', healthy: 'ổn định', degraded: 'suy giảm', down: 'ngừng', unknown: 'không rõ', manageUsers: 'Quản lý người dùng', settings: 'Cài đặt hệ thống', jobs: 'Việc mining đang chạy', audit: 'Lịch sử kiểm toán',
  aiHealth: 'Tình trạng mô hình AI', usageMetrics: 'Mức dùng & số liệu →', noModel: 'Chưa cấu hình mô hình AI nào. {link}.', addOne: 'Thêm ở Mô hình AI', totalCost: 'Tổng chi phí (tháng này)', totalTokens: 'Tổng token đã dùng', defaultModel: 'Mô hình mặc định',
  requests: '{n} yêu cầu hôm nay · TB {ms}ms', tokens: 'Token', cost: 'Chi phí', users: 'Tổng quan người dùng', totalAccounts: 'Tổng tài khoản', active: 'Hoạt động', pending: 'Lời mời đang chờ', suspended: 'Tạm ngưng',
  recent: 'Hoạt động gần đây', noRecent: 'Không có hoạt động gần đây.', viewAll: 'Xem mọi hoạt động →',
});
type HealthWord = 'healthy' | 'degraded' | 'down' | 'unknown';
const healthWord = (s: string) => (['healthy', 'degraded', 'down', 'unknown'].includes(s) ? translate(MSG, s as HealthWord) : s);

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
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();

    apiRequest<{ status: string; timestamp: string }>('/health', { signal: controller.signal })
      .then(result => {
        if (result.status !== 'ok' || !Number.isFinite(Date.parse(result.timestamp))) throw new Error(translate(MSG, 'unexpected'));
        setHealth(result);
        setHealthError(null);
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setHealth(null);
          setHealthError(cause instanceof Error ? cause.message : translate(MSG, 'healthFailed'));
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
      .catch(cause => { if (!controller.signal.aborted) setAiError(cause instanceof Error ? cause.message : translate(MSG, 'aiFailed')); })
      .finally(() => { if (!controller.signal.aborted) setAiLoading(false); });

    return () => controller.abort();
  }, [revision]);

  const isLoading = healthLoading || metricsLoading || servicesLoading;
  const metricTiles = [
    { label: m('cpu'), value: metrics?.cpu, unit: '%' },
    { label: m('memory'), value: metrics?.memory, unit: '%' },
    { label: m('storage'), value: metrics?.storage, unit: 'GB' },
    { label: m('queue'), value: metrics?.queueCapacity, unit: '%' },
  ].filter(tile => metricsLoading || tile.value !== undefined);

  return (
    <FeaturePage
      title={m('title')}
      description={m('intro')}
      demo={false}
      actions={
        <Button loading={isLoading} onClick={() => { setHealthLoading(true); setMetricsLoading(true); setServicesLoading(true); setRevision(v => v + 1); }}>
          {m('refresh')}
        </Button>
      }
    >
      <section className={featurePanel}>
        <h3 className={`${sectionTitle} mb-3 flex flex-wrap items-center gap-2`}>
          {m('apiHealth')}
          <Tag color={health ? 'green' : healthError ? 'red' : 'default'}>
            {healthLoading ? m('checking') : health ? m('responding') : m('unavailable')}
          </Tag>
        </h3>
        {health && (
          <p className="text-sm text-[var(--at-muted)]">
            {m('checkedAt', { date: formatDateTime(health.timestamp) })}
          </p>
        )}
        {healthError && <Alert type="error" message={healthError} />}
      </section>

      {/* Panels with no data from the server are left out instead of showing empty tiles. */}
      {(servicesLoading || services.length > 0) && <section className={featurePanel}>
        <h3 className={`${sectionTitle} mb-3`}>{m('services')}</h3>
        {servicesLoading ? (
          <Spin size="small" />
        ) : (
          <div className="flex flex-wrap gap-3">
            {services.map(s => (
              <Tag key={s.name} color={s.status === 'healthy' ? 'green' : s.status === 'degraded' ? 'gold' : 'red'}>
                {s.name}: {healthWord(s.status)}{s.latency !== undefined && ` (${s.latency}ms)`}
              </Tag>
            ))}
          </div>
        )}
      </section>}

      {metricTiles.length > 0 && <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricTiles.map(({ label, value, unit }) => (
          <div key={label} className={statCard}>
            <p className={statLabel}>{label}</p>
            <p className="text-3xl font-bold mt-3">{metricsLoading ? <Spin size="small" /> : `${value}${unit}`}</p>
          </div>
        ))}
      </section>}

      <div className="flex flex-wrap gap-3">
        {[
          ['users', m('manageUsers')],
          ['settings', m('settings')],
          ['mining-jobs', m('jobs')],
          ['audit-log', m('audit')],
        ].map(([path, label]) => (
          <Link
            key={path}
            to={`/system-administrator/${path}`}
            className={pillLink}
          >
            {label} →
          </Link>
        ))}
      </div>

      <section className={featurePanel}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-4">
          <h3 className={sectionTitle}>{m('aiHealth')}</h3>
          <Link to="/system-administrator/ai-metrics" className="text-sm text-[var(--at-link)] hover:text-[var(--at-link-hover)]">{m('usageMetrics')}</Link>
        </div>
        {aiLoading ? (
          <Spin size="small" />
        ) : aiError ? (
          <p role="alert" className="text-sm text-[var(--at-danger)]">{aiError}</p>
        ) : !aiModels.length ? (
          <p className="text-sm text-[var(--at-muted)]">{m.rich('noModel', { link: <Link key="l" to="/system-administrator/ai-models" className="text-[var(--at-link)]">{m('addOne')}</Link> })}</p>
        ) : (
          <>
            <div className="grid gap-4 mb-6 sm:grid-cols-3">
              <div className={nestedPanel}>
                <p className={statLabel}>{m('totalCost')}</p>
                <p className="text-2xl font-bold text-[var(--at-link)] mt-2">${aiTotalCost.toFixed(aiTotalCost > 0 && aiTotalCost < 1 ? 4 : 2)}</p>
              </div>
              <div className={nestedPanel}>
                <p className={statLabel}>{m('totalTokens')}</p>
                <p className="text-2xl font-bold mt-2">{(aiTotalTokens / 1000000).toFixed(2)}M</p>
              </div>
              <div className={nestedPanel}>
                <p className={statLabel}>{m('defaultModel')}</p>
                <p className="text-lg font-semibold mt-2 text-[var(--at-link)] break-words">{aiDefaultModel || '–'}</p>
              </div>
            </div>
            <div className="space-y-3">
              {aiModels.map(model => (
                <div key={model.id ?? model.model} className={`${nestedPanel} flex flex-wrap items-center justify-between gap-3`}>
                  <div className="flex items-center gap-3">
                    <Tag>{model.provider}</Tag>
                    <div>
                      <p className="font-medium">{model.model}</p>
                      <p className="text-xs text-[var(--at-muted)]">
                        {m('requests', { n: model.requestsToday, ms: model.avgLatencyMs })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-[var(--at-muted)]">{m('tokens')}</p>
                      <p>{(model.tokensUsed / 1000).toFixed(1)}K{model.tokensLimit > 0 ? ` / ${(model.tokensLimit / 1000000).toFixed(0)}M` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[var(--at-muted)]">{m('cost')}</p>
                      <p>${model.costUsd.toFixed(model.costUsd > 0 && model.costUsd < 1 ? 4 : 2)}</p>
                    </div>
                    <Tag color={model.status === 'healthy' ? 'green' : model.status === 'degraded' ? 'gold' : model.status === 'down' ? 'red' : 'default'}>
                      {healthWord(model.status)}
                    </Tag>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className={featurePanel}>
        <h3 className={`${sectionTitle} mb-4`}>{m('users')}</h3>
        {usersLoading ? (
          <Spin size="small" />
        ) : (
          <dl className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {[
              [m('totalAccounts'), users.length],
              [m('active'), users.filter(u => u.status === 'active').length],
              [m('pending'), users.filter(u => u.status === 'invited').length],
              [m('suspended'), users.filter(u => u.status === 'suspended').length],
            ].map(([label, count]) => (
              <div key={label} className={nestedPanel}>
                <dt className={statLabel}>{label}</dt>
                <dd className="text-2xl font-bold mt-2">{count}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className={featurePanel}>
        <h3 className={`${sectionTitle} mb-4`}>{m('recent')}</h3>
        {logsLoading ? (
          <Spin size="small" />
        ) : recentLogs.length ? (
          <ul className="space-y-3">
            {recentLogs.map(e => (
              <li key={e.id} className="border-t border-[var(--at-line)] pt-3 text-sm">
                <p>{e.description}</p>
                <p className="text-xs text-[var(--at-muted)] mt-1">
                  {e.actor} · {formatDateTime(e.timestamp)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--at-muted)]">{m('noRecent')}</p>
        )}
        <Link to="/system-administrator/audit-log" className="text-sm text-[var(--at-link)] hover:text-[var(--at-link-hover)] mt-4 inline-block">
          {m('viewAll')}
        </Link>
      </section>
    </FeaturePage>
  );
}
