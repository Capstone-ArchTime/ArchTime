import { useEffect, useState, type ReactNode } from 'react';
import { Alert, App, Button, DatePicker, Descriptions, Empty, InputNumber, Modal, Progress, Radio, Segmented, Skeleton, Table, Tag, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import { Check, Copy, Info } from 'lucide-react';
import { featurePanel } from '@/components/FeaturePage';
import {
  createOrder, formatCredits, formatVnd, getBillingOverview, listSpaceOrders, quoteOrder, setNextSeats,
  type BillingOverview, type Gateway, type Order, type OrderRequest, type Period, type Quote, type Space, type SpaceOrderPage,
} from '@/features/billing-api';
import { formatDate, formatDateTime } from '@/i18n/format';
import { useMessages } from '@/i18n/define';
import { BILL } from './messages';
import { useItemLabel } from './useItemLabel';

const STATUS_COLOR: Record<Order['status'], string | undefined> = { pending: 'gold', paid: 'green', failed: 'red', expired: undefined };
const label = 'text-xs uppercase tracking-wide text-[var(--at-muted)]';

/**
 * The plan, AI credit and payments of one space (FE-17), in three parts: an overview (plan, seats, credit left), what can
 * be bought now (seats, next-renewal seats, top-ups; the plan cards when on Free or on request), and the payments made.
 */
export default function BillingPanel({ space }: { space: Space }) {
  const m = useMessages(BILL);
  const [view, setView] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const spaceKey = space.kind === 'organization' ? space.organizationId : 'personal';

  useEffect(() => {
    const controller = new AbortController();
    setView(null);
    getBillingOverview(space, controller.signal)
      .then(v => { setError(null); setView(v); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('loadFailed')); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceKey, attempt]);

  if (error) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setAttempt(a => a + 1)}>{m('retry')}</Button>} />;
  if (!view) return <Skeleton active paragraph={{ rows: 6 }} />;
  return (
    <div className="space-y-5">
      <Overview view={view} />
      {!view.canBuy ? <Alert type="info" showIcon title={m('readOnly')} />
        : !view.gateways.length ? <Alert type="warning" showIcon title={m('noGateway')} />
        : <Purchases view={view} space={space} />}
      {view.canBuy && <OrderHistory space={space} />}
    </div>
  );
}

// ── overview: plan · seats · AI credit, one number each ──

function Stat({ title, value, extra, children }: { title: string; value: ReactNode; extra?: ReactNode; children?: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 py-1 sm:px-5 sm:first:pl-0">
      <div className="flex items-center gap-2"><span className={label}>{title}</span>{extra}</div>
      <p className="text-3xl font-semibold leading-tight">{value}</p>
      {children}
    </div>
  );
}

function Overview({ view }: { view: BillingOverview }) {
  const m = useMessages(BILL);
  const { credit, limits, usage } = view;
  const name = credit.plan === 'pro' ? m('pro') : credit.plan === 'team' ? m('team') : m('free');
  const paid = credit.plan !== 'free';
  const left = Math.max(0, credit.included + credit.topup - credit.used);
  const monthlyPercent = credit.included > 0 ? Math.min(100, Math.round((credit.used / credit.included) * 100)) : 100;
  const org = view.space.kind === 'organization';
  const muted = 'text-sm text-[var(--at-muted)]';
  const nextSeats = view.seats?.pending ? m('seatsPending', { seats: view.seats.pending.seats, date: formatDate(view.seats.pending.from) })
    : view.seats?.next != null && view.seats.next !== view.seats.purchased ? m('seatsNext', { seats: view.seats.next }) : null;
  return (
    <section className={`${featurePanel} space-y-3`} aria-label={m('current')}>
      <div className="grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-[var(--at-line)]">
        <Stat title={m('current')} value={<span className="flex flex-wrap items-center gap-2">{name}<Tag color={paid ? 'green' : undefined}>{paid ? m('active') : m('freeStatus')}</Tag></span>}>
          <p className={muted}>{paid ? m('renewBy', { date: formatDate(credit.validUntil!) }) : m('noEnd')}</p>
        </Stat>
        {org ? (
          view.seats ? (
            <Stat title={m('seatsLabel')} value={`${view.seats.occupied} / ${view.seats.purchased}`}>
              <p className={muted}>{m('seatsSub')}</p>
              {nextSeats && <p className={muted}>{nextSeats}</p>}
            </Stat>
          ) : (
            <Stat title={m('membersLabel')} value={`${usage.members} / ${limits.members ?? '∞'}`}><p className={muted}>{m('membersSub')}</p></Stat>
          )
        ) : (
          <Stat title={m('workspacesLabel')} value={limits.workspaces === null ? usage.workspaces : `${usage.workspaces} / ${limits.workspaces}`}>
            <p className={muted}>{limits.workspaces === null ? m('unlimited') : m('workspacesSub')}</p>
          </Stat>
        )}
        <Stat title={m('creditLeft')} value={formatCredits(left)}
          extra={<Tooltip title={`${m('monthlyReset')} ${m('topupPolicy')}`}><Info size={14} className="text-[var(--at-muted)]" aria-label={m('creditInfo')} /></Tooltip>}>
          <Progress percent={monthlyPercent} size="small" status={credit.includedLeft <= 0 ? 'exception' : 'normal'} showInfo={false} />
          <p className={muted}>
            {m('creditSub', { used: formatCredits(Math.min(credit.used, credit.included)), included: formatCredits(credit.included) })}
            {credit.topup > 0 && <> · {m('topupLeft', { count: formatCredits(credit.topup) })}</>}
          </p>
        </Stat>
      </div>
      {left <= 0 && <Alert type="warning" showIcon title={m('exhausted')} />}
    </section>
  );
}

// ── buying ──

function useQuote(space: Space, order: OrderRequest | null) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const key = JSON.stringify(order);
  useEffect(() => {
    if (!order) return;
    const controller = new AbortController();
    setQuote(null);
    setProblem(null);
    const timer = setTimeout(() => {
      quoteOrder(space, order, controller.signal).then(setQuote)
        .catch(cause => { if (!controller.signal.aborted) setProblem(cause instanceof Error ? cause.message : String(cause)); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { quote, problem };
}

/** A quiet one-line breakdown under a price ("4 seats × 59.000 ₫"); the total is on the button. */
function Formula({ quote }: { quote: Quote }) {
  const m = useMessages(BILL);
  const b = quote.breakdown;
  const unit = formatVnd(b.unitVnd);
  const text = quote.kind === 'topup' ? (b.quantity > 1 ? m('brTopup', { q: b.quantity, unit }) : '')
    : quote.kind === 'add-seats' ? m('brAdd', { q: b.quantity, days: b.days ?? 0, credits: formatCredits(b.creditsThisCycle ?? 0), monthly: formatCredits(b.creditsPerMonth ?? 0) })
    : quote.seats ? m('brTeam', { q: b.quantity, unit }) : '';
  return text ? <p className="text-xs text-[var(--at-muted)]">{text}</p> : null;
}
function PayButton({ quote, problem, text, busy, onBuy }: { quote: Quote | null; problem: string | null; text: string; busy: boolean; onBuy: () => void }) {
  const m = useMessages(BILL);
  if (problem) return <p className="text-sm text-[var(--at-danger,#c0392b)]">{problem}</p>;
  return <Button type="primary" loading={busy} disabled={!quote} onClick={onBuy}>{quote ? `${text} · ${formatVnd(quote.amountVnd)}` : m('quoting')}</Button>;
}

/** The payment method is chosen in the confirmation, next to the amount it pays. */
function GatewayPick({ gateways, initial, onChange }: { gateways: Gateway[]; initial: Gateway; onChange: (g: Gateway) => void }) {
  const m = useMessages(BILL);
  const [value, setValue] = useState(initial);
  if (gateways.length < 2) return <p className="text-sm">{m('payWith')}: <b>{m(initial)}</b></p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">{m('payWith')}
      <Radio.Group value={value} optionType="button" options={gateways.map(g => ({ value: g, label: m(g) }))}
        onChange={e => { setValue(e.target.value); onChange(e.target.value); }} />
    </div>
  );
}

function Purchases({ view, space }: { view: BillingOverview; space: Space }) {
  const m = useMessages(BILL);
  const { message, modal } = App.useApp();
  const [period, setPeriod] = useState<Period>('month');
  const [busy, setBusy] = useState<string | null>(null);
  const paid = view.credit.plan !== 'free';
  const [showPlans, setShowPlans] = useState(!paid);

  /** What a quote buys, in the page language (the order does not exist yet). */
  const quoteItem = (q: Quote) => {
    const length = q.breakdown.period === 'year' ? m('oneYear') : m('oneMonth');
    if (q.kind === 'topup') return m('itemTopup', { count: formatCredits(q.credits ?? 0) });
    if (q.kind === 'add-seats') return m('itemAdd', { count: q.seats ?? 0 });
    return q.seats ? m('itemTeam', { count: q.seats, length }) : m('itemPro', { length });
  };

  /** Every payment is confirmed with its final amount, worked out by the server, before the gateway opens. */
  function buy(order: OrderRequest, key: string, quote: Quote | null) {
    if (!quote) return;
    let gateway: Gateway = view.gateways[0];
    modal.confirm({
      title: m('confirmTitle'),
      content: (
        <div className="space-y-3">
          <div>
            <p className="font-medium">{quoteItem(quote)}</p>
            <p className="text-2xl font-semibold">{formatVnd(quote.amountVnd)}</p>
            <Formula quote={quote} />
          </div>
          <GatewayPick gateways={view.gateways} initial={gateway} onChange={g => { gateway = g; }} />
        </div>
      ),
      okText: m('confirmPay'), cancelText: m('cancel'),
      onOk: () => pay(order, key, gateway),
    });
  }

  async function pay(order: OrderRequest, key: string, gateway: Gateway) {
    setBusy(key);
    try {
      const { payUrl } = await createOrder(space, order, gateway);
      message.loading(m('paying'));
      window.location.assign(payUrl);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('orderFailed'));
      setBusy(null);
    }
  }
  const props = { view, space, busy, buy };
  return (
    <div className="space-y-5">
      <EndedNotice view={view} />
      <section className={featurePanel} aria-label={m('manageTitle')}>
        <h3 className="mb-1 font-medium">{m('manageTitle')}</h3>
        <div className="divide-y divide-[var(--at-line)]">
          {view.credit.plan === 'team' && <AddSeatsRow {...props} />}
          {view.credit.plan === 'team' && <NextSeatsRow view={view} space={space} />}
          <TopUpRow {...props} />
        </div>
        {paid && (
          <Button type="link" className="!px-0" onClick={() => setShowPlans(s => !s)}>{showPlans ? m('hidePlans') : m('showPlans')}</Button>
        )}
      </section>
      {showPlans && (
        <div className="space-y-3">
          <Segmented value={period} onChange={v => setPeriod(v as Period)}
            options={[{ value: 'month', label: m('monthly') }, { value: 'year', label: `${m('yearly')} · ${m('yearSave')}` }]} />
          <PlanCards view={view} space={space} period={period} busy={busy} buy={buy} />
        </div>
      )}
    </div>
  );
}

type BuyProps = { view: BillingOverview; space: Space; busy: string | null; buy: (order: OrderRequest, key: string, quote: Quote | null) => void };

/** One action: what it is and its price on the left, the amount and the button on the right. */
function ActionRow({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <div className="text-sm text-[var(--at-muted)]">{hint}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">{children}</div>
    </div>
  );
}

function AddSeatsRow({ view, space, busy, buy }: BuyProps) {
  const m = useMessages(BILL);
  const { credit, catalog } = view;
  const [extra, setExtra] = useState(1);
  const add = useQuote(space, { kind: 'add-seats', seats: extra });
  const period = view.period === 'year' ? m('periodYear') : m('periodMonth');
  const unit = formatVnd(view.period === 'year' ? catalog.team.seatYearVnd : catalog.team.seatMonthVnd);
  const free = view.seats?.available ?? 0;
  return (
    <ActionRow title={m('addSeatsTitle')}
      hint={<>{free > 0 ? m('freeSeatsHint', { count: free }) : m('addSeatsHint', { price: unit, period })}{add.quote && <Formula quote={add.quote} />}</>}>
      <InputNumber min={1} max={Math.max(1, 500 - credit.seats)} value={extra} onChange={v => setExtra(Math.max(1, Number(v) || 1))} aria-label={m('seatUnit')} style={{ width: 72 }} />
      <PayButton quote={add.quote} problem={add.problem} text={m('add')} busy={busy === 'add'} onBuy={() => buy({ kind: 'add-seats', seats: extra }, 'add', add.quote)} />
    </ActionRow>
  );
}

/** Fewer (or more) seats from the next renewal; the period already paid is not changed. */
function NextSeatsRow({ view, space }: { view: BillingOverview; space: Space }) {
  const m = useMessages(BILL);
  const { message } = App.useApp();
  const current = view.seats?.next ?? view.credit.seats;
  const [saved, setSaved] = useState(current);
  const [next, setNext] = useState(current);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await setNextSeats(space, next);
      setSaved(next);
      message.success(m('savedNext'));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <ActionRow title={m('nextRenewalTitle')} hint={m('nextRenewalHint')}>
      <InputNumber min={view.catalog.team.minSeats} max={500} value={next} onChange={v => setNext(Math.max(view.catalog.team.minSeats, Number(v) || 1))} aria-label={m('nextRenewalTitle')} style={{ width: 72 }} />
      <Button onClick={save} loading={saving} disabled={next === saved}>{m('saveNext')}</Button>
    </ActionRow>
  );
}

function TopUpRow({ view, space, busy, buy }: BuyProps) {
  const m = useMessages(BILL);
  const { topup } = view.catalog;
  const [packs, setPacks] = useState(1);
  const order: OrderRequest = { kind: 'topup', packs };
  const { quote, problem } = useQuote(space, order);
  return (
    <ActionRow title={m('topup')} hint={m('topupHintShort', { price: formatVnd(topup.priceVnd), count: formatCredits(topup.credits) })}>
      <InputNumber min={1} max={20} value={packs} onChange={v => setPacks(Math.min(20, Math.max(1, Number(v) || 1)))} aria-label={m('quantity')} style={{ width: 72 }}
        formatter={v => `${v} ×`} parser={v => Number(String(v).replace(/\D/g, '')) || 1} />
      <PayButton quote={quote} problem={problem} text={m('buyCredits', { count: formatCredits(topup.credits * packs) })} busy={busy === 'topup'} onBuy={() => buy(order, 'topup', quote)} />
    </ActionRow>
  );
}

function PlanCard({ title, current, highlight, price, was, discount, unit, tagline, features, action }: {
  title: string; current: boolean; highlight: boolean; price: string; was?: string; discount?: string; unit: string; tagline: string; features: string[]; action: ReactNode;
}) {
  const m = useMessages(BILL);
  return (
    <section aria-label={title}
      className={`flex flex-col rounded-2xl border p-2 ${highlight ? 'border-[var(--at-link)] bg-gradient-to-b from-[rgba(232,89,12,0.55)] via-[rgba(232,89,12,0.18)] to-transparent' : 'border-[var(--at-line)] bg-[var(--at-surface,rgba(255,255,255,0.03))]'}`}>
      <p className={`py-1 text-center text-xs ${current ? 'text-white' : 'invisible'}`}>{m('activeLabel')}</p>
      <div className={`space-y-4 rounded-xl p-4 ${highlight ? 'bg-[rgba(255,255,255,0.08)]' : 'bg-[rgba(255,255,255,0.04)]'}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-medium">{title}</h3>
          {discount && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#9a3412]">{discount}</span>}
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          {was && <span className="pb-1 text-sm text-[var(--at-muted)] line-through">{was}</span>}
          <span className="text-4xl font-semibold leading-none">{price}</span>
          <span className="max-w-[9rem] text-xs leading-tight text-[var(--at-muted)]">{unit}</span>
        </div>
        {action}
      </div>
      <div className="space-y-3 px-3 pb-3 pt-4">
        <p className="text-sm text-[var(--at-muted)]">{tagline}</p>
        <ul className="space-y-2 text-sm">
          {features.map(f => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0" />{f}</li>)}
        </ul>
      </div>
    </section>
  );
}

function PlanCards({ view, space, period, busy, buy }: BuyProps & { period: Period }) {
  const m = useMessages(BILL);
  const { catalog: c, credit } = view;
  const minSeats = Math.max(c.team.minSeats, view.usage.members);
  const [seats, setSeats] = useState(Math.max(minSeats, view.ended?.seats ?? 0));
  const personal = space.kind === 'personal';
  const yearly = period === 'year';
  const freeCurrent = credit.plan === 'free';
  const upgrade: OrderRequest | null = freeCurrent ? (personal ? { kind: 'plan', period } : { kind: 'plan', period, seats }) : null;
  const { quote, problem } = useQuote(space, upgrade);
  const status = (
    <p className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/40 text-sm font-medium" role="status"><Check size={16} />{m('activeLabel')}</p>
  );
  const freeAction = freeCurrent ? status : <p className="flex h-10 items-center justify-center text-center text-xs text-[var(--at-muted)]">{m('autoFree')}</p>;
  const paidAction = !freeCurrent ? status : (
    <div className="space-y-2">
      {!personal && (
        <label className="flex items-center justify-between gap-2 text-sm">{m('seatUnit')}
          <InputNumber min={minSeats} max={500} value={seats} onChange={v => setSeats(Math.max(minSeats, Number(v) || minSeats))} aria-label={m('seatUnit')} />
        </label>
      )}
      {problem ? <p className="text-sm text-[var(--at-danger,#c0392b)]">{problem}</p> : (
        <Button block size="large" className="!h-10 !border-0 !bg-white !font-medium !text-[#9a3412]" loading={busy === 'plan'} disabled={!quote}
          onClick={() => upgrade && buy(upgrade, 'plan', quote)}>
          {quote ? `${view.ended ? m('renewPlan', { plan: personal ? m('pro') : m('team') }) : m('upgrade')} · ${formatVnd(quote.amountVnd)}` : m('quoting')}
        </Button>
      )}
      {quote && <Formula quote={quote} />}
    </div>
  );
  const save = (month: number, year: number) => (yearly && month * 12 > year ? { was: formatVnd(month * 12), discount: `-${Math.round((1 - year / (month * 12)) * 100)}%` } : {});
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {personal ? (
        <>
          <PlanCard title={m('free')} current={freeCurrent} highlight={false} price={m('priceFree')} unit={yearly ? m('perYearOnly') : m('perMonthOnly')} tagline={m('freeFor')}
            features={[m('fWorkspaces', { count: c.personalFree.workspaces }), m('fCreditsMonth', { count: formatCredits(c.personalFree.credits) }), m('fJoin')]} action={freeAction} />
          <PlanCard title={m('pro')} current={credit.plan === 'pro'} highlight price={formatVnd(yearly ? c.pro.yearVnd : c.pro.monthVnd)} {...save(c.pro.monthVnd, c.pro.yearVnd)}
            unit={yearly ? m('perYearOnly') : m('perMonthOnly')} tagline={m('proFor')}
            features={[m('fUnlimitedWorkspaces'), m('fCreditsMonth', { count: formatCredits(c.pro.credits) }), m('fJoin')]} action={paidAction} />
        </>
      ) : (
        <>
          <PlanCard title={m('orgFree')} current={freeCurrent} highlight={false} price={m('priceFree')} unit={yearly ? m('perYearOnly') : m('perMonthOnly')} tagline={m('orgFreeFor')}
            features={[m('fMembers', { count: c.organizationFree.members }), m('fCreditsMonth', { count: formatCredits(c.organizationFree.credits) }), m('fOrgFeatures')]} action={freeAction} />
          <PlanCard title={m('team')} current={credit.plan === 'team'} highlight price={formatVnd(yearly ? c.team.seatYearVnd : c.team.seatMonthVnd)} {...save(c.team.seatMonthVnd, c.team.seatYearVnd)}
            unit={yearly ? m('perMemberYear') : m('perMemberMonth')} tagline={m('teamFor')}
            features={[m('fSeats', { count: c.team.minSeats }), m('fCreditsSeat', { count: formatCredits(c.team.creditsPerSeat) }), m('fOrgFeatures')]} action={paidAction} />
        </>
      )}
    </div>
  );
}

/** Shown only when a paid plan has ended: the space is on Free now. */
function EndedNotice({ view }: { view: BillingOverview }) {
  const m = useMessages(BILL);
  if (!view.ended) return null;
  const plan = view.ended.plan === 'team' ? m('team') : m('pro');
  return <Alert type="warning" showIcon title={m('endedTitle', { plan, date: formatDate(view.ended.endedAt) })} description={m('endedBody')} />;
}

// ── payments ──

function OrderHistory({ space }: { space: Space }) {
  const m = useMessages(BILL);
  const { message } = App.useApp();
  const itemLabel = useItemLabel();
  const [filter, setFilter] = useState<'all' | Order['status']>('all');
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SpaceOrderPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Order | null>(null);
  const spaceKey = space.kind === 'organization' ? space.organizationId : 'personal';
  const day = (d: Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : undefined);
  const from = day(range?.[0]);
  const to = day(range?.[1]);

  useEffect(() => {
    const controller = new AbortController();
    listSpaceOrders(space, { status: filter === 'all' ? undefined : filter, from, to, page }, controller.signal)
      .then(d => { setError(null); setData(d); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('loadOrdersFailed')); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceKey, filter, from, to, page]);

  const copy = (id: string) => {
    navigator.clipboard?.writeText(id).then(() => message.success(m('copied'))).catch(() => undefined);
  };
  const txn = (id: string | null) => id ? (
    <span className="inline-flex items-center gap-1">
      <span className="whitespace-nowrap font-mono text-xs">{id}</span>
      <Button size="small" type="text" aria-label={m('copy')} icon={<Copy size={14} />} onClick={e => { e.stopPropagation(); copy(id); }} />
    </span>
  ) : '—';
  return (
    <section className={featurePanel} aria-label={m('orders')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{m('orders')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="small" value={filter} onChange={v => { setFilter(v as typeof filter); setPage(1); }}
            options={[{ value: 'all', label: m('filterAll') }, ...(['paid', 'pending', 'failed', 'expired'] as const).map(s => ({ value: s, label: m(`st_${s}`) }))]} />
          <DatePicker.RangePicker size="small" allowEmpty={[true, true]} aria-label={m('period')} onChange={v => { setRange(v ? [v[0], v[1]] : null); setPage(1); }} />
        </div>
      </div>
      {error ? <Alert type="error" showIcon title={error} />
        : !data ? <Skeleton active paragraph={{ rows: 3 }} />
        : !data.orders.length ? <Empty description={m('noOrders')} /> : (
          <Table size="small" rowKey="orderId" dataSource={data.orders} scroll={{ x: 640 }}
            pagination={{ current: page, pageSize: data.meta.limit, total: data.meta.total, onChange: setPage, hideOnSinglePage: true }}
            onRow={o => ({ onClick: () => setOpen(o), style: { cursor: 'pointer' } })}
            columns={[
              { title: m('date'), dataIndex: 'createdAt', render: (v: string) => <span className="whitespace-nowrap">{formatDateTime(v)}</span> },
              { title: m('item'), key: 'item', render: (_: unknown, o: Order) => itemLabel(o) },
              { title: m('amount'), dataIndex: 'amountVnd', align: 'right', render: (v: number) => <span className="whitespace-nowrap">{formatVnd(v)}</span> },
              { title: m('txn'), dataIndex: 'gatewayTxnId', render: (v: string | null) => txn(v) },
              {
                title: m('status'), key: 'status', render: (_: unknown, o: Order) => (
                  <span className="flex flex-wrap items-center gap-2">
                    <Tag color={STATUS_COLOR[o.status]}>{m(`st_${o.status}`)}</Tag>
                    {o.status === 'pending' && o.payUrl && <a href={o.payUrl} onClick={e => e.stopPropagation()}>{m('continuePay')}</a>}
                  </span>
                ),
              },
            ]} />
        )}
      <Modal open={!!open} title={open ? m('invoice', { id: open.orderId }) : ''} onCancel={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>{m('close')}</Button>}>
        {open && (
          <Descriptions column={1} size="small" bordered items={[
            { key: 'id', label: m('orderIdLabel'), children: <span className="font-mono">{open.orderId}</span> },
            { key: 'item', label: m('item'), children: itemLabel(open) },
            { key: 'amount', label: m('amount'), children: <b>{formatVnd(open.amountVnd)}</b> },
            { key: 'method', label: m('method'), children: m(open.gateway) },
            { key: 'txn', label: m('txn'), children: txn(open.gatewayTxnId) },
            { key: 'status', label: m('status'), children: <Tag color={STATUS_COLOR[open.status]}>{m(`st_${open.status}`)}</Tag> },
            { key: 'created', label: m('createdLabel'), children: formatDateTime(open.createdAt) },
            { key: 'paid', label: m('paidAtLabel'), children: open.paidAt ? formatDateTime(open.paidAt) : '—' },
          ]} />
        )}
      </Modal>
    </section>
  );
}
