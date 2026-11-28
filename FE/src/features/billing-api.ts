import { apiRequest } from '../api/client.ts';

// Plans, AI credit and payments (FE-17), and the onboarding progress of an organization (UC-34).
// Server: BE/src/presentation/routes/billing.routes.ts and organization.routes.ts. Prices are always computed by the
// server; the page only shows them.

export type Gateway = 'momo' | 'vnpay' | 'payos' | 'simulator';
export type Period = 'month' | 'year';
export type PlanId = 'free' | 'pro' | 'team';
export type OrderKind = 'plan' | 'add-seats' | 'topup';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired';
export type Space = { kind: 'personal'; userId?: string } | { kind: 'organization'; organizationId: string };

export type CreditStatus = {
  plan: PlanId; seats: number; validUntil: string | null; included: number; used: number; includedLeft: number; topup: number; available: number;
};

export type Order = {
  orderId: string; space: Space; kind: OrderKind; item: string; plan: PlanId | null; period: Period | null; seats: number | null; credits: number | null;
  amountVnd: number; gateway: Gateway; status: OrderStatus; payUrl: string | null; gatewayTxnId: string | null; paidAt: string | null;
  applied: boolean; failureReason: string | null; expiresAt: string; createdAt: string;
};

export type Catalog = {
  personalFree: { workspaces: number; credits: number };
  pro: { monthVnd: number; yearVnd: number; credits: number };
  organizationFree: { members: number; credits: number };
  team: { seatMonthVnd: number; seatYearVnd: number; creditsPerSeat: number; minSeats: number };
  topup: { credits: number; priceVnd: number };
};

export type BillingOverview = {
  space: Space; canBuy: boolean; credit: CreditStatus; period: Period | null;
  ended: { plan: PlanId; seats: number; endedAt: string; period: Period } | null;
  seats: { purchased: number; occupied: number; available: number; next: number | null; pending: { seats: number; from: string } | null } | null;
  limits: { workspaces: number | null; members: number | null }; usage: { workspaces: number; members: number };
  catalog: Catalog; gateways: Gateway[]; orders: Order[];
};

export type OrderRequest = { kind: OrderKind; period?: Period; seats?: number; packs?: number };

/** How a price is made up (see BE domain/billing Breakdown). */
export type Breakdown = { unitVnd: number; quantity: number; period?: Period; days?: number; perDays?: number; creditsPerMonth?: number; creditsThisCycle?: number; credits?: number };
export type Quote = { kind: OrderKind; amountVnd: number; seats?: number; credits?: number; validUntil?: string; breakdown: Breakdown };
type Envelope<T> = { data: T };
const spaceQuery = (space: Space) => space.kind === 'organization'
  ? `space=organization&organizationId=${encodeURIComponent(space.organizationId)}` : 'space=personal';
const spaceBody = (space: Space) => space.kind === 'organization' ? { space: 'organization', organizationId: space.organizationId } : { space: 'personal' };

export async function getBillingOverview(space: Space, signal?: AbortSignal): Promise<BillingOverview> {
  return (await apiRequest<Envelope<BillingOverview>>(`/billing/overview?${spaceQuery(space)}`, { signal })).data;
}

export async function quoteOrder(space: Space, order: OrderRequest, signal?: AbortSignal): Promise<Quote> {
  return (await apiRequest<Envelope<Quote>>('/billing/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...spaceBody(space), ...order }), signal })).data;
}

export async function createOrder(space: Space, order: OrderRequest, gateway: Gateway): Promise<{ order: Order; payUrl: string }> {
  return (await apiRequest<Envelope<{ order: Order; payUrl: string }>>('/billing/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...spaceBody(space), ...order, gateway }) }, 30_000)).data;
}

export type SpaceOrderPage = { orders: Order[]; meta: { page: number; limit: number; total: number; totalPages: number } };

/** Payments of a space from the server, newest first; filtered by status and creation date (YYYY-MM-DD). */
export async function listSpaceOrders(space: Space, query: { status?: string; from?: string; to?: string; page?: number }, signal?: AbortSignal): Promise<SpaceOrderPage> {
  const q = new URLSearchParams(spaceQuery(space));
  if (query.status) q.set('status', query.status);
  if (query.from) q.set('from', query.from);
  if (query.to) q.set('to', query.to);
  q.set('page', String(query.page ?? 1));
  return (await apiRequest<Envelope<SpaceOrderPage>>(`/billing/orders?${q}`, { signal })).data;
}

/** Seats to buy at the next renewal (owners only); a reduction takes effect then. */
export async function setNextSeats(space: Space, seats: number): Promise<{ next: number | null; current: number; from: string }> {
  return (await apiRequest<Envelope<{ next: number | null; current: number; from: string }>>('/billing/seats/next', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...spaceBody(space), seats }) })).data;
}

export async function getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  return (await apiRequest<Envelope<Order>>(`/billing/orders/${encodeURIComponent(orderId)}`, { signal })).data;
}

export async function simulatePayment(orderId: string, outcome: 'paid' | 'failed'): Promise<{ order: Order }> {
  return (await apiRequest<Envelope<{ order: Order }>>(`/billing/simulator/${encodeURIComponent(orderId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome }) })).data;
}

/** Back from payOS: its return address is not signed, so the server is asked to check the order with payOS itself. */
export async function checkPayosReturn(orderId: string): Promise<void> {
  await apiRequest('/billing/payos/return', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
}

/** The signed fields a gateway put on the return address, sent on so the server can settle without its notification. */
export async function forwardGatewayReturn(gateway: 'momo' | 'vnpay', fields: Record<string, string>): Promise<void> {
  await apiRequest(`/billing/${gateway}/return`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
}

// ── administrators ──

/** How a seat added mid-period is priced: the latest period's rate, or each paid period at its own rate (PO decision pending). */
export type SeatProration = 'latest-period' | 'per-segment';
export type BillingSettings = Catalog & {
  creditUnitUsd: number; enforce: boolean; seatProration?: SeatProration;
  /** Catalog version, raised by the server on every change; orders keep the version they were priced with. */
  version?: number; updatedAt?: string; updatedBy?: string;
};

export async function getBillingSettings(signal?: AbortSignal): Promise<BillingSettings> {
  return (await apiRequest<Envelope<BillingSettings>>('/admin/billing/settings', { signal })).data;
}

export async function saveBillingSettings(settings: BillingSettings): Promise<BillingSettings> {
  return (await apiRequest<Envelope<BillingSettings>>('/admin/billing/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })).data;
}

export type OrderPage = { orders: Order[]; meta: { page: number; limit: number; total: number; totalPages: number }; pagePaidVnd: number };

export async function listOrders(query: { status?: string; gateway?: string; page?: number }, signal?: AbortSignal): Promise<OrderPage> {
  const q = new URLSearchParams();
  if (query.status) q.set('status', query.status);
  if (query.gateway) q.set('gateway', query.gateway);
  q.set('page', String(query.page ?? 1));
  return (await apiRequest<Envelope<OrderPage>>(`/admin/billing/orders?${q}`, { signal })).data;
}

export async function reconcilePayments(): Promise<{ checked: number; paid: number; failed: number; expired: number; applied: number; reminded: number }> {
  return (await apiRequest<Envelope<{ checked: number; paid: number; failed: number; expired: number; applied: number; reminded: number }>>('/admin/billing/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' } })).data;
}

// ── UC-34 ──

export type OnboardingProgress = {
  workspaces: { projectId: string; projectName: string; paths: { pathId: string; title: string; status: string; steps: number; learners: number; completed: number; averagePercent: number }[] }[];
  learners: { userId: string; name: string | null; email: string | null; projectId: string; projectName: string; pathId: string; pathTitle: string; done: number; total: number; percent: number; assignedAt: string; lastActivityAt: string }[];
  totals: { workspaces: number; paths: number; people: number; assignments: number; completed: number; averagePercent: number };
};

export async function getOnboardingProgress(orgId: string, signal?: AbortSignal): Promise<OnboardingProgress> {
  return (await apiRequest<Envelope<OnboardingProgress>>(`/organizations/${encodeURIComponent(orgId)}/onboarding-progress`, { signal })).data;
}

export const formatVnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} ₫`;
export const formatCredits = (n: number) => Math.round(n).toLocaleString('vi-VN');
