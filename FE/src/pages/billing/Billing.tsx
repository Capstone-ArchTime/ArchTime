import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Result, Select, Spin } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { listOrganizations, type Organization } from '@/features/organizations-api';
import { checkPayosReturn, forwardGatewayReturn, getOrder, simulatePayment, formatVnd, type Order, type Space } from '@/features/billing-api';
import { useMessages } from '@/i18n/define';
import BillingPanel from './BillingPanel';
import { useItemLabel } from './useItemLabel';
import { BILL } from './messages';

/** Plans & billing (FE-17): the personal space or one of the account's organizations. */
export default function Billing() {
  const m = useMessages(BILL);
  const [params, setParams] = useSearchParams();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    listOrganizations(controller.signal).then(setOrgs).catch(() => setOrgs([]));
    return () => controller.abort();
  }, []);
  const orgId = params.get('organizationId');
  const space: Space = useMemo(() => (orgId ? { kind: 'organization', organizationId: orgId } : { kind: 'personal' }), [orgId]);
  return (
    <FeaturePage title={m('title')} description={m('intro')} details={m('details')}
      actions={(
        <label className="flex items-center gap-2 text-sm">{m('space')}
          <Select value={orgId ?? 'personal'} style={{ minWidth: 220 }} aria-label={m('space')}
            onChange={v => setParams(v === 'personal' ? {} : { organizationId: v })}
            options={[{ value: 'personal', label: m('personal') }, ...orgs.map(o => ({ value: o.id, label: o.name }))]} />
        </label>
      )}>
      <BillingPanel space={space} />
    </FeaturePage>
  );
}

/** Where a gateway sends the buyer back. The page never trusts the address: it asks the server for the order's status. */
export function BillingResult() {
  const m = useMessages(BILL);
  const itemLabel = useItemLabel();
  const [params] = useSearchParams();
  const orderId = params.get('orderId') ?? params.get('vnp_TxnRef') ?? '';
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    const fields = Object.fromEntries(params.entries());
    // The redirect carries the gateway's signed result: passing it on settles the order even where the gateway cannot
    // reach this server with its notification (a development machine).
    const forwarded = fields.vnp_SecureHash ? forwardGatewayReturn('vnpay', fields)
      : fields.signature && fields.partnerCode ? forwardGatewayReturn('momo', fields)
      : fields.orderCode ? checkPayosReturn(orderId) : Promise.resolve();
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      getOrder(orderId, controller.signal)
        .then(o => {
          setOrder(o);
          if (o.status === 'pending' && ++tries < 40) timer = setTimeout(poll, 3000);
        })
        .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('notFound')); });
    };
    forwarded.catch(() => undefined).finally(poll);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const back = order?.space.kind === 'organization' ? `/billing?organizationId=${encodeURIComponent(order.space.organizationId)}` : '/billing';
  const backButton = <Link to={back}><Button type="primary">{m('backToBilling')}</Button></Link>;
  return (
    <FeaturePage title={m('resultTitle')} description={orderId ? m('simOrder', { id: orderId }) : ''}>
      <div className={featurePanel}>
        {!orderId ? <Alert type="error" showIcon title={m('noOrder')} />
          : error ? <Alert type="error" showIcon title={error} />
          : !order ? <div className="flex items-center gap-3 py-6"><Spin /> {m('checking')}</div>
          : order.status === 'paid' ? <Result status="success" title={m('paidTitle')} subTitle={m('paidBody', { item: itemLabel(order) })} extra={backButton} />
          : order.status === 'failed' ? <Result status="error" title={m('failedTitle')} subTitle={m('failedBody')} extra={backButton} />
          : order.status === 'expired' ? <Result status="warning" title={m('expiredTitle')} subTitle={m('failedBody')} extra={backButton} />
          : <Result status="info" icon={<Spin size="large" />} title={m('pendingTitle')} subTitle={m('pendingBody')} extra={backButton} />}
      </div>
    </FeaturePage>
  );
}

/** Stand-in pay page of the test gateway (BILLING_SIMULATOR=true on the server). */
export function BillingSimulator() {
  const m = useMessages(BILL);
  const itemLabel = useItemLabel();
  const [params] = useSearchParams();
  const orderId = params.get('orderId') ?? '';
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (orderId) {
      getOrder(orderId, controller.signal).then(setOrder)
        .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('notFound')); });
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  async function answer(outcome: 'paid' | 'failed') {
    setBusy(true);
    try {
      await simulatePayment(orderId, outcome);
      window.location.assign(`/billing/result?orderId=${encodeURIComponent(orderId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }
  return (
    <FeaturePage title={m('simTitle')} description={m('simIntro')}>
      <div className={`${featurePanel} space-y-3`}>
        {error && <Alert type="error" showIcon title={error} />}
        {order && (
          <>
            <p className="text-sm text-[var(--at-muted)]">{m('simOrder', { id: order.orderId })}</p>
            <p className="font-medium">{itemLabel(order)}</p>
            <p className="text-2xl font-semibold">{formatVnd(order.amountVnd)}</p>
            <div className="flex gap-2">
              <Button type="primary" loading={busy} disabled={order.status !== 'pending'} onClick={() => answer('paid')}>{m('simPay')}</Button>
              <Button disabled={busy || order.status !== 'pending'} onClick={() => answer('failed')}>{m('simCancel')}</Button>
            </div>
          </>
        )}
      </div>
    </FeaturePage>
  );
}
