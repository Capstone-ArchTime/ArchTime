import { useEffect, useState } from 'react';
import { Alert, App, Button, InputNumber, Select, Skeleton, Switch, Table, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import {
  formatVnd, getBillingSettings, listOrders, reconcilePayments, saveBillingSettings,
  type BillingSettings, type Gateway, type Order, type OrderPage,
} from '@/features/billing-api';
import { formatDateTime } from '@/i18n/format';
import { useMessages } from '@/i18n/define';
import { BILL } from '../billing/messages';
import { useItemLabel } from '../billing/useItemLabel';

/** FE-17 for administrators: prices and credit, and every payment. */
export default function BillingAdmin() {
  const m = useMessages(BILL);
  return (
    <FeaturePage title={m('adminTitle')} description={m('adminIntro')}>
      <SettingsForm />
      <Payments />
    </FeaturePage>
  );
}

type Group = 'personalFree' | 'pro' | 'organizationFree' | 'team' | 'topup';

function SettingsForm() {
  const m = useMessages(BILL);
  const { message } = App.useApp();
  const [s, setS] = useState<BillingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getBillingSettings(controller.signal).then(setS)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, []);
  if (error) return <Alert type="error" showIcon title={error} />;
  if (!s) return <Skeleton active paragraph={{ rows: 4 }} />;

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      setS(await saveBillingSettings(s));
      message.success(m('saved'));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('saveFailed'));
    } finally {
      setSaving(false);
    }
  }
  const field = (group: Group, key: string, label: string, step = 1) => (
    <label className="text-sm" key={`${group}.${key}`}>{label}<br />
      <InputNumber min={0} step={step} style={{ width: '100%' }} value={(s[group] as Record<string, number>)[key]}
        onChange={v => setS({ ...s, [group]: { ...s[group], [key]: Number(v) || 0 } })} />
    </label>
  );
  const box = (title: string, fields: ReturnType<typeof field>[]) => (
    <div className="rounded border border-[var(--at-line)] p-3">
      <h4 className="mb-2 text-sm font-medium">{title}</h4>
      <div className="grid gap-2 sm:grid-cols-2">{fields}</div>
    </div>
  );
  return (
    <section className={`${featurePanel} space-y-3`} aria-label={m('settings')}>
      <h3 className="font-medium">{m('settings')}</h3>
      <div className="grid gap-3 lg:grid-cols-2">
        {box(m('sPersonalFree'), [field('personalFree', 'workspaces', m('workspacesLimit')), field('personalFree', 'credits', m('creditsMonth'), 50)])}
        {box(m('sPro'), [field('pro', 'monthVnd', m('priceMonth'), 1000), field('pro', 'yearVnd', m('priceYear'), 1000), field('pro', 'credits', m('creditsMonth'), 100)])}
        {box(m('sOrgFree'), [field('organizationFree', 'members', m('membersLimit')), field('organizationFree', 'credits', m('creditsMonth'), 50)])}
        {box(m('sTeam'), [field('team', 'seatMonthVnd', m('seatMonth'), 1000), field('team', 'seatYearVnd', m('seatYear'), 1000), field('team', 'creditsPerSeat', m('creditsPerSeat'), 100), field('team', 'minSeats', m('minSeats'))])}
        {box(m('sTopup'), [field('topup', 'credits', m('topupCredits'), 100), field('topup', 'priceVnd', m('topupPrice'), 1000)])}
        <div className="rounded border border-[var(--at-line)] p-3 space-y-2">
          <label className="text-sm">{m('creditUnit')}<br />
            <InputNumber min={0.000001} step={0.0005} style={{ width: '100%' }} value={s.creditUnitUsd} onChange={v => setS({ ...s, creditUnitUsd: Number(v) || 0 })} />
          </label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={s.enforce} onChange={enforce => setS({ ...s, enforce })} />{m('enforce')}</label>
        </div>
      </div>
      <Button type="primary" loading={saving} onClick={save}>{m('save')}</Button>
    </section>
  );
}
function Payments() {
  const m = useMessages(BILL);
  const itemLabel = useItemLabel();
  const { message } = App.useApp();
  const [status, setStatus] = useState<string>('');
  const [gateway, setGateway] = useState<string>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrderPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listOrders({ status, gateway, page }, controller.signal).then(d => { setError(null); setData(d); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [status, gateway, page, attempt]);
  async function reconcile() {
    try {
      const r = await reconcilePayments();
      message.success(m('reconciled', r));
      setAttempt(a => a + 1);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <section className={`${featurePanel} space-y-3`} aria-label={m('orders')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{m('orders')}</h3>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onChange={v => { setStatus(v); setPage(1); }} style={{ minWidth: 160 }}
            options={[{ value: '', label: m('allStatuses') }, ...(['pending', 'paid', 'failed', 'expired'] as const).map(v => ({ value: v, label: m(`st_${v}`) }))]} />
          <Select value={gateway} onChange={v => { setGateway(v); setPage(1); }} style={{ minWidth: 140 }}
            options={[{ value: '', label: m('allMethods') }, ...(['momo', 'vnpay', 'simulator'] as const).map(v => ({ value: v, label: m(v) }))]} />
          <Button onClick={reconcile}>{m('reconcile')}</Button>
        </div>
      </div>
      {error && <Alert type="error" showIcon title={error} />}
      <Table size="small" rowKey="orderId" loading={!data && !error} dataSource={data?.orders ?? []} scroll={{ x: true }}
        pagination={{ current: page, pageSize: data?.meta.limit ?? 20, total: data?.meta.total ?? 0, onChange: setPage, hideOnSinglePage: true }}
        columns={[
          { title: m('date'), dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
          { title: m('spaceCol'), key: 'space', render: (_, o: Order) => (o.space.kind === 'organization' ? `org ${o.space.organizationId}` : `user ${o.space.userId ?? ''}`) },
          { title: m('item'), key: 'item', render: (_, o: Order) => itemLabel(o) },
          { title: m('amount'), dataIndex: 'amountVnd', align: 'right', render: (v: number) => formatVnd(v) },
          { title: m('method'), dataIndex: 'gateway', render: (g: Gateway) => m(g) },
          { title: m('txn'), dataIndex: 'gatewayTxnId', render: (v: string | null) => v ?? '—' },
          { title: m('status'), dataIndex: 'status', render: (v: Order['status']) => <Tag color={v === 'paid' ? 'green' : v === 'pending' ? 'gold' : v === 'failed' ? 'red' : undefined}>{m(`st_${v}`)}</Tag> },
        ]} />
      {data && <p className="text-sm text-[var(--at-muted)]">{m('paidOnPage', { amount: formatVnd(data.pagePaidVnd) })}</p>}
    </section>
  );
}
