import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Tag } from 'antd';
import FeaturePage, { DemoNotice, featurePanel } from '@/components/FeaturePage';
import { apiRequest } from '@/api/client';
import { useAdminDemo } from '@/features/admin-demo';

export default function Dashboard() {
  const { data, error } = useAdminDemo();
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ status: string; timestamp: string }>('/health', { signal: controller.signal }).then(result => {
      if (result.status !== 'ok' || !Number.isFinite(Date.parse(result.timestamp))) throw new Error('Unexpected health response.');
      setHealth(result); setHealthError(null);
    }).catch(cause => { if (!controller.signal.aborted) { setHealth(null); setHealthError(cause instanceof Error ? cause.message : 'Health check failed.'); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return <FeaturePage title="System & infrastructure health" description="Check API availability and open administration tools." demo={false} error={error} actions={<Button loading={loading} onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Check API health</Button>}>
    <section className={featurePanel}><h3 className="font-semibold mb-3">API health <Tag color={health ? 'green' : healthError ? 'red' : 'default'}>{loading ? 'Checking' : health ? 'Responding' : 'Unavailable'}</Tag></h3>{health && <p className="text-sm text-[#94a3b8]">Server checked at {new Date(health.timestamp).toLocaleString()}. This endpoint does not verify workers or database health.</p>}{healthError && <Alert type="error" title={healthError} />}</section>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">{['CPU load', 'Memory', 'Repository storage', 'Queue capacity'].map(label => <div key={label} className={featurePanel}><p className="text-xs text-[#94a3b8]">{label}</p><p className="text-3xl my-3">—</p><p className="text-xs text-[#94a3b8]">Metrics API required</p></div>)}</section>
    <div className="flex flex-wrap gap-3">{[['users', 'Manage users'], ['settings', 'System settings'], ['mining-jobs', 'Live mining jobs'], ['audit-log', 'Audit history']].map(([path, label]) => <Link key={path} to={`/system-administrator/${path}`} className="border border-[#222c37] px-4 py-3 text-sm text-[#38bdf8] hover:border-[#38bdf8]">{label} →</Link>)}</div>
    <DemoNotice />
    <section className={featurePanel}><h3 className="font-semibold mb-4">Local administration activity</h3><p className="text-sm text-[#94a3b8] mb-4">{data.users.length} demo accounts · {data.users.filter(u => u.status === 'invited').length} pending demo invitations</p>{data.events.length ? <ul className="space-y-3">{data.events.slice(0, 5).map(e => <li key={e.id} className="border-t border-[#222c37] pt-3 text-sm"><p>{e.description}</p><p className="text-xs text-[#94a3b8] mt-1">{e.actor} · {new Date(e.at).toLocaleString()}</p></li>)}</ul> : <Empty description="No local administrative actions yet" />}</section>
  </FeaturePage>;
}
