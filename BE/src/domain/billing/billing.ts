/**
 * FE-17 Plans, AI Credit & Payments: the rules, with no database or gateway.
 *
 * Four plans and one top-up:
 *   personal space   Free (a few workspaces, a small monthly AI credit)  ·  Pro (monthly or yearly)
 *   organization     Free (up to a few members)                          ·  Team (per member, monthly or yearly)
 *   top-up           a fixed pack of AI credit that does not expire, for any space
 * AI credit is a whole number: 1 credit is a fixed slice of model cost (creditUnitUsd), about one mentor answer. Each AI
 * run spends its cost from the space its workspace belongs to: first the month's included credit, then top-up credit.
 * Everything is prepaid; nothing is charged automatically. A plan that runs out returns to Free and keeps its data.
 */

export type Gateway = "momo" | "vnpay" | "payos" | "simulator";
export type Period = "month" | "year";
export type PlanId = "free" | "pro" | "team";
export type OrderKind = "plan" | "add-seats" | "topup";
export type OrderStatus = "pending" | "paid" | "failed" | "expired";
export type SeatProration = "latest-period" | "per-segment";
export type SpaceRef = { kind: "personal"; userId: string } | { kind: "organization"; organizationId: string };

export interface BillingSettings {
  /** Model cost (USD) that one credit stands for. */
  creditUnitUsd: number;
  personalFree: { workspaces: number; credits: number };
  pro: { monthVnd: number; yearVnd: number; credits: number };
  organizationFree: { members: number; credits: number };
  team: { seatMonthVnd: number; seatYearVnd: number; creditsPerSeat: number; minSeats: number };
  topup: { credits: number; priceVnd: number };
  /** When false, AI runs are counted but never refused, and plan limits are not enforced. */
  enforce: boolean;
  /**
   * How seats added to a running Team plan are priced when its paid time is made of periods bought at different rates
   * (for example a year, then months). PRODUCT DECISION PENDING (see docs/billing/pricing-policy.md):
   *   latest-period  the rate of the most recent purchase for all the time left (behaviour so far; the default)
   *   per-segment    each purchased period at its own historical rate
   */
  seatProration: SeatProration;
  /** Incremented on every change, and copied onto orders, so a payment can be traced to the catalog it was priced with. */
  version?: number;
  updatedAt?: Date;
  updatedBy?: string;
}

export const DEFAULT_SETTINGS: BillingSettings = {
  creditUnitUsd: 0.002,
  personalFree: { workspaces: 3, credits: 200 },
  pro: { monthVnd: 79_000, yearVnd: 790_000, credits: 3_000 },
  organizationFree: { members: 3, credits: 300 },
  team: { seatMonthVnd: 59_000, seatYearVnd: 590_000, creditsPerSeat: 1_500, minSeats: 1 },
  topup: { credits: 1_000, priceVnd: 49_000 },
  enforce: true,
  seatProration: "latest-period",
};

const DAY = 86_400_000;

export interface SpaceAccount {
  spaceKey: string;
  /** The paid plan (pro for a personal space, team for an organization); meaningful only while validUntil is ahead. */
  plan: PlanId;
  /** Team seats = the most members the organization may have. */
  seats: number;
  validUntil: Date | null;
  /** Top-up credit left (whole credits). */
  topupCredits: number;
  /** The period the running plan was last bought for; members added to it are priced at that rate. */
  period?: Period;
  /** The end date a renewal reminder was last sent for. */
  remindedFor?: Date | null;
  /** Seats to buy at the next renewal (a reduction is chosen here and takes effect then). */
  nextSeats?: number | null;
  /** A seat count bought by an early renewal that takes over when the current period ends (pendingFrom). */
  pendingSeats?: number | null;
  pendingFrom?: Date | null;
  /**
   * The paid periods of the plan, in order, each with the rate it was bought at. Written from now on by every plan order;
   * accounts paid before this was recorded have none, and their seats are priced with the latest period.
   */
  segments?: BillingSegment[];
  /** Credit change for one monthly cycle only: seats added mid-cycle get their credit pro rata for what is left of it. */
  cycleAdjust?: { month: string; credits: number } | null;
}

/** One purchased period of a plan: [start, end), the period it was bought as, its seats and the price paid per seat. */
export interface BillingSegment { start: Date; end: Date; period: Period; seats: number; unitVnd: number; orderId: string }

/** Seats in force now: a reduction bought by an early renewal applies once the old period has ended. */
export const effectiveSeats = (account: SpaceAccount, now: Date): number =>
  account.pendingSeats != null && account.pendingFrom && now.getTime() >= account.pendingFrom.getTime() ? account.pendingSeats : account.seats;

/** The next calendar month start (Vietnam time) after `now`'s month. */
export const nextMonthStart = (now: Date): Date => {
  const local = new Date(monthStart(now).getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - 7 * 3_600_000);
};

/** Credits for `seats` new seats for the rest of the current monthly cycle, by days left (rounded down). */
export function proratedCycleCredits(settings: BillingSettings, seats: number, now: Date): { credits: number; daysLeft: number; cycleDays: number } {
  const start = monthStart(now).getTime();
  const end = nextMonthStart(now).getTime();
  const cycleDays = Math.round((end - start) / DAY);
  const daysLeft = Math.max(0, Math.ceil((end - now.getTime()) / DAY));
  return { credits: Math.floor(seats * settings.team.creditsPerSeat * daysLeft / cycleDays), daysLeft, cycleDays };
}

export interface IOrder {
  id: string;
  /** The reference sent to the gateway (unique). */
  orderId: string;
  space: SpaceRef;
  buyerId: string;
  kind: OrderKind;
  plan?: PlanId;
  period?: Period;
  seats?: number;
  credits?: number;
  amountVnd: number;
  /** Version of the plan catalog the amount was worked out with. */
  catalogVersion?: number;
  gateway: Gateway;
  status: OrderStatus;
  payUrl?: string;
  gatewayTxnId?: string;
  paidAt?: Date | null;
  /** When what was bought was added to the space; a paid order without it is applied by reconciliation. */
  appliedAt?: Date | null;
  failureReason?: string;
  receiptSentAt?: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export class BillingRuleError extends Error {
  constructor(message: string, readonly field?: string) { super(message); }
}

export const spaceKeyOf = (space: SpaceRef): string => space.kind === "personal" ? `user:${space.userId}` : `org:${space.organizationId}`;
export const emptyAccount = (spaceKey: string): SpaceAccount => ({ spaceKey, plan: "free", seats: 0, validUntil: null, topupCredits: 0 });

export const isPaid = (account: SpaceAccount | null | undefined, now: Date): boolean =>
  !!account && account.plan !== "free" && !!account.validUntil && account.validUntil.getTime() > now.getTime();

export const planOf = (account: SpaceAccount | null | undefined, now: Date): PlanId => isPaid(account, now) ? account!.plan : "free";

export function includedCredits(settings: BillingSettings, space: SpaceRef, account: SpaceAccount | null | undefined, now: Date): number {
  const plan = planOf(account, now);
  if (space.kind === "personal") return plan === "pro" ? settings.pro.credits : settings.personalFree.credits;
  if (plan !== "team") return settings.organizationFree.credits;
  const adjust = account!.cycleAdjust && account!.cycleAdjust.month === monthStart(now).toISOString() ? account!.cycleAdjust.credits : 0;
  return Math.max(0, effectiveSeats(account!, now) * settings.team.creditsPerSeat + adjust);
}

/** The limits the space has now: workspaces of a personal space, members of an organization (null: no limit). */
export function limitsOf(settings: BillingSettings, space: SpaceRef, account: SpaceAccount | null | undefined, now: Date): { workspaces: number | null; members: number | null } {
  const plan = planOf(account, now);
  if (space.kind === "personal") return { workspaces: plan === "pro" ? null : settings.personalFree.workspaces, members: null };
  return { workspaces: null, members: plan === "team" ? effectiveSeats(account!, now) : settings.organizationFree.members };
}

/** Model cost (USD) as credits. */
export const toCredits = (usd: number, settings: Pick<BillingSettings, "creditUnitUsd">): number =>
  usd > 0 && settings.creditUnitUsd > 0 ? usd / settings.creditUnitUsd : 0;

/** First instant of the calendar month in Vietnam time (UTC+7), as a UTC Date. */
export function monthStart(now: Date): Date {
  const local = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 7 * 3_600_000);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0); // 31 January + 1 month = end of February
  return d;
}

export const periodMonths = (period: Period) => (period === "year" ? 12 : 1);

export interface CreditStatus {
  plan: PlanId;
  seats: number;
  validUntil: Date | null;
  included: number;
  used: number;
  includedLeft: number;
  topup: number;
  available: number;
}

/** Credits are shown as whole numbers; used is rounded up so a space never sees more than it has. */
export function creditStatus(settings: BillingSettings, space: SpaceRef, account: SpaceAccount | null | undefined, usedUsd: number, now: Date): CreditStatus {
  const included = includedCredits(settings, space, account, now);
  const used = Math.ceil(toCredits(usedUsd, settings) - 1e-9);
  const includedLeft = Math.max(0, included - used);
  const topup = Math.max(0, Math.floor(account?.topupCredits ?? 0));
  const plan = planOf(account, now);
  return {
    plan, seats: plan === "team" ? effectiveSeats(account!, now) : 0, validUntil: plan === "free" ? null : account!.validUntil,
    included, used, includedLeft, topup, available: includedLeft + topup,
  };
}

/** Whole credits of a run that go beyond the month's included credit, and so come out of top-up credit. */
export function topupSpend(included: number, usedBeforeCredits: number, runCredits: number): number {
  if (!(runCredits > 0)) return 0;
  const beyond = (x: number) => Math.max(0, x - included);
  return Math.ceil(beyond(usedBeforeCredits + runCredits) - 1e-9) - Math.ceil(beyond(usedBeforeCredits) - 1e-9);
}

export interface OrderInput { kind: OrderKind; period?: Period; seats?: number; packs?: number }
/**
 * How an amount is made up, for the page to explain it:
 *   plan       quantity × unitVnd for one period          e.g. 4 seats × 59,000 × 1 month
 *   add-seats  quantity × unitVnd × days / perDays        e.g. 1 seat × 590,000 × 300 days / 365 days of the period
 *   topup      quantity × unitVnd                         e.g. 2 × 49,000
 * creditsPerMonth is what the seats bring each monthly cycle; creditsThisCycle what they bring for the rest of this one.
 */
export interface SegmentPart { start: Date; end: Date; period: Period; unitVnd: number; days: number; totalDays: number }
export interface Breakdown { unitVnd: number; quantity: number; period?: Period; days?: number; perDays?: number; creditsPerMonth?: number; creditsThisCycle?: number; credits?: number; segments?: SegmentPart[] }

/** The part of each recorded period still ahead of 
ow (whole days, rounded up for the running one). */
export function segmentParts(account: SpaceAccount, now: Date): SegmentPart[] {
  return (account.segments ?? []).filter(s => s.end.getTime() > now.getTime()).map(s => {
    const from = Math.max(s.start.getTime(), now.getTime());
    return { start: new Date(from), end: s.end, period: s.period, unitVnd: s.unitVnd, days: Math.max(1, Math.ceil((s.end.getTime() - from) / DAY)), totalDays: Math.max(1, Math.round((s.end.getTime() - s.start.getTime()) / DAY)) };
  });
}
export interface Quote { kind: OrderKind; amountVnd: number; plan?: PlanId; period?: Period; seats?: number; credits?: number; validFrom?: Date; validUntil?: Date; breakdown: Breakdown }

/** VND amounts of prorated charges are rounded up to the next 1,000 VND (and are never below 1,000). */
export const roundUpThousand = (x: number) => Math.max(1000, Math.ceil(x / 1000) * 1000);
export const MAX_SEATS = 500;
export const MAX_PACKS = 20;

/** Days of the billing period that ends at `end` (actual calendar days: 28–31 for a month, 365 or 366 for a year). */
export function periodDays(end: Date, period: Period): number {
  return Math.round((end.getTime() - addMonths(end, -periodMonths(period)).getTime()) / DAY);
}

/**
 * What an order costs, checked against the plan the space has now. Amounts are worked out here only; what a client
 * sends as a price is never read.
 *  plan       personal → Pro; organization → Team for `seats` seats (at least the minimum and the members it has).
 *             While the plan runs, buying it again extends it from its end date, with the seats chosen for the next
 *             renewal (nextSeats) or the seats it has.
 *  add-seats  Team only, while it runs: seat price of the period it was bought for × days left / days of that period.
 *  topup      packs of credit, for any space.
 */
export function quote(settings: BillingSettings, space: SpaceRef, input: OrderInput, account: SpaceAccount | null | undefined, now: Date, members = 0): Quote {
  if (input.kind === "topup") {
    const packs = input.packs === undefined ? 1 : Number(input.packs);
    if (!Number.isInteger(packs) || packs < 1 || packs > MAX_PACKS) throw new BillingRuleError(`Buy 1 to ${MAX_PACKS} top-ups at a time.`, "packs");
    const credits = packs * settings.topup.credits;
    return { kind: "topup", amountVnd: packs * settings.topup.priceVnd, credits, breakdown: { unitVnd: settings.topup.priceVnd, quantity: packs, credits } };
  }
  const paid = isPaid(account, now);
  if (input.kind === "plan") {
    const period: Period = input.period === "year" ? "year" : input.period === "month" ? "month" : (() => { throw new BillingRuleError("Choose monthly or yearly.", "period"); })();
    const from = paid ? account!.validUntil! : now;
    const validUntil = addMonths(from, periodMonths(period));
    if (space.kind === "personal") {
      const unit = period === "year" ? settings.pro.yearVnd : settings.pro.monthVnd;
      return { kind: "plan", plan: "pro", period, amountVnd: unit, validFrom: from, validUntil, breakdown: { unitVnd: unit, quantity: 1, period, creditsPerMonth: settings.pro.credits } };
    }
    const seats = paid ? (account!.nextSeats ?? effectiveSeats(account!, now)) : Number(input.seats);
    const min = Math.max(settings.team.minSeats, members);
    if (!Number.isInteger(seats) || seats < min || seats > MAX_SEATS) {
      throw new BillingRuleError(members > settings.team.minSeats && seats < members
        ? `The organization has ${members} members (pending invitations included): choose at least ${members} seats, or remove members first.`
        : `Choose ${min} to ${MAX_SEATS} seats.`, "seats");
    }
    const per = period === "year" ? settings.team.seatYearVnd : settings.team.seatMonthVnd;
    return { kind: "plan", plan: "team", period, seats, amountVnd: seats * per, validFrom: from, validUntil, breakdown: { unitVnd: per, quantity: seats, period, creditsPerMonth: seats * settings.team.creditsPerSeat } };
  }
  if (input.kind === "add-seats") {
    if (space.kind !== "organization" || !paid) throw new BillingRuleError("Seats can only be added to a Team plan that is running.", "kind");
    const seats = Number(input.seats);
    const current = effectiveSeats(account!, now);
    if (!Number.isInteger(seats) || seats < 1 || current + seats > MAX_SEATS) throw new BillingRuleError(`Add a whole number of seats; at most ${MAX_SEATS} in total.`, "seats");
    const cycle = proratedCycleCredits(settings, seats, now);
    const credit = { creditsPerMonth: seats * settings.team.creditsPerSeat, creditsThisCycle: cycle.credits };
    const parts = settings.seatProration === "per-segment" ? segmentParts(account!, now) : null;
    if (parts && parts.length) {
      // Each purchased period still to run, at the price per seat it was bought at.
      const exact = parts.reduce((sum, p) => sum + seats * p.unitVnd * p.days / p.totalDays, 0);
      const days = parts.reduce((sum, p) => sum + p.days, 0);
      return {
        kind: "add-seats", plan: "team", seats, amountVnd: roundUpThousand(exact), validUntil: account!.validUntil!,
        breakdown: { unitVnd: parts[parts.length - 1].unitVnd, quantity: seats, period: parts[parts.length - 1].period, days, perDays: parts[parts.length - 1].totalDays, segments: parts, ...credit },
      };
    }
    const period: Period = account!.period === "year" ? "year" : "month";
    const unit = period === "year" ? settings.team.seatYearVnd : settings.team.seatMonthVnd;
    const total = periodDays(account!.validUntil!, period);
    const days = Math.max(1, Math.ceil((account!.validUntil!.getTime() - now.getTime()) / DAY));
    return {
      kind: "add-seats", plan: "team", seats, amountVnd: roundUpThousand(seats * unit * days / total), validUntil: account!.validUntil!,
      breakdown: { unitVnd: unit, quantity: seats, period, days, perDays: total, ...credit },
    };
  }
  throw new BillingRuleError("Unknown order kind.", "kind");
}

/**
 * The account after a paid order is applied (once per order: see AccountStore.applyOnce).
 *  topup      adds the credits.
 *  add-seats  adds the seats now (and to a pending reduction); with settings, the seats get credit only for what is left
 *             of the current monthly cycle, and full credit from the next one.
 *  plan       starts the plan, or extends a running one from its end date. A smaller seat count bought early takes effect
 *             when the current period ends, so seats already paid for are not lost.
 */
export function applyOrder(account: SpaceAccount, order: Pick<IOrder, "kind" | "plan" | "period" | "seats" | "credits"> & Partial<Pick<IOrder, "orderId" | "amountVnd">>, now: Date, settings?: BillingSettings): SpaceAccount {
  if (order.kind === "topup") return { ...account, topupCredits: Math.floor(account.topupCredits + (order.credits ?? 0)) };
  if (order.kind === "add-seats") {
    const n = order.seats ?? 0;
    let cycleAdjust = account.cycleAdjust ?? null;
    if (settings) {
      const month = monthStart(now).toISOString();
      const delta = proratedCycleCredits(settings, n, now).credits - n * settings.team.creditsPerSeat;
      cycleAdjust = { month, credits: (cycleAdjust && cycleAdjust.month === month ? cycleAdjust.credits : 0) + delta };
    }
    return {
      ...account, seats: account.seats + n, cycleAdjust,
      ...(account.pendingSeats != null ? { pendingSeats: account.pendingSeats + n } : {}),
      ...(account.nextSeats != null ? { nextSeats: account.nextSeats + n } : {}),
    };
  }
  const running = isPaid(account, now) && account.plan === order.plan;
  const from = running ? account.validUntil! : now;
  const end = addMonths(from, periodMonths(order.period ?? "month"));
  const segmentSeats = Math.max(1, order.seats ?? 1);
  // The period just bought, at the price per seat actually paid (kept for proration and audit; segments already ended are dropped).
  const segment: BillingSegment | null = order.orderId && order.amountVnd !== undefined
    ? { start: from, end, period: order.period ?? "month", seats: order.plan === "team" ? segmentSeats : 1, unitVnd: order.plan === "team" ? Math.round(order.amountVnd / segmentSeats) : order.amountVnd, orderId: order.orderId }
    : null;
  const segments = [...(running ? (account.segments ?? []).filter(s => s.end.getTime() > now.getTime()) : []), ...(segment ? [segment] : [])];
  const base = { ...account, plan: order.plan ?? "free", validUntil: end, period: order.period ?? "month", remindedFor: null, nextSeats: null, segments };
  if (order.plan !== "team") return { ...base, seats: 0, pendingSeats: null, pendingFrom: null };
  const seats = order.seats ?? 0;
  if (running && seats < effectiveSeats(account, now)) return { ...base, pendingSeats: seats, pendingFrom: account.validUntil };
  return { ...base, seats, pendingSeats: null, pendingFrom: null, ...(running ? {} : { cycleAdjust: null }) };
}

/** Seats to buy at the next renewal; a reduction never changes the seats of the period already paid for. */
export function scheduleNextSeats(settings: BillingSettings, account: SpaceAccount | null | undefined, seats: number, now: Date): SpaceAccount {
  if (!account || !isPaid(account, now) || account.plan !== "team") throw new BillingRuleError("Seats for the next renewal can only be set while a Team plan is running.", "seats");
  if (!Number.isInteger(seats) || seats < settings.team.minSeats || seats > MAX_SEATS) throw new BillingRuleError(`Choose ${settings.team.minSeats} to ${MAX_SEATS} seats.`, "seats");
  return { ...account, nextSeats: seats === effectiveSeats(account, now) ? null : seats };
}
/** A paid plan that ends within `days` and whose end date has not been reminded about yet. */
export const needsReminder = (account: SpaceAccount, now: Date, days = 7): boolean =>
  isPaid(account, now) && account.validUntil!.getTime() - now.getTime() <= days * DAY
  && (!account.remindedFor || account.remindedFor.getTime() !== account.validUntil!.getTime());

export function validateSettings(input: Partial<BillingSettings>, current: BillingSettings): BillingSettings {
  const merge = <T extends object>(a: T, b: unknown): T => (b && typeof b === "object" ? { ...a, ...(b as Partial<T>) } : a);
  const next: BillingSettings = {
    creditUnitUsd: input.creditUnitUsd ?? current.creditUnitUsd,
    personalFree: merge(current.personalFree, input.personalFree), pro: merge(current.pro, input.pro),
    organizationFree: merge(current.organizationFree, input.organizationFree), team: merge(current.team, input.team),
    topup: merge(current.topup, input.topup), enforce: input.enforce ?? current.enforce,
    seatProration: input.seatProration ?? current.seatProration ?? "latest-period",
  };
  const num = (v: unknown, name: string, min: number, int = false) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || (int && !Number.isInteger(v))) throw new BillingRuleError(`${name} must be ${int ? "a whole number" : "a number"} of at least ${min}.`, name);
  };
  num(next.creditUnitUsd, "creditUnitUsd", 0.000001);
  num(next.personalFree.workspaces, "personalFree.workspaces", 1, true); num(next.personalFree.credits, "personalFree.credits", 0, true);
  num(next.pro.monthVnd, "pro.monthVnd", 1000, true); num(next.pro.yearVnd, "pro.yearVnd", 1000, true); num(next.pro.credits, "pro.credits", 0, true);
  num(next.organizationFree.members, "organizationFree.members", 1, true); num(next.organizationFree.credits, "organizationFree.credits", 0, true);
  num(next.team.seatMonthVnd, "team.seatMonthVnd", 1000, true); num(next.team.seatYearVnd, "team.seatYearVnd", 1000, true);
  num(next.team.creditsPerSeat, "team.creditsPerSeat", 0, true); num(next.team.minSeats, "team.minSeats", 1, true);
  num(next.topup.credits, "topup.credits", 1, true); num(next.topup.priceVnd, "topup.priceVnd", 1000, true);
  if (typeof next.enforce !== "boolean") throw new BillingRuleError("enforce must be true or false.", "enforce");
  if (next.seatProration !== "latest-period" && next.seatProration !== "per-segment") throw new BillingRuleError("seatProration must be latest-period or per-segment.", "seatProration");
  return next;
}

/** A reference unique enough for both gateways (letters and digits, at most 40 characters). */
export const newOrderId = (now: Date, random: () => number = Math.random) =>
  `AT${now.getTime()}${Math.floor(random() * 1e6).toString().padStart(6, "0")}`;

export const ORDER_TTL_MS = 15 * 60_000;

export function describeOrder(order: Pick<IOrder, "kind" | "plan" | "period" | "seats" | "credits">): string {
  if (order.kind === "topup") return `AI credit top-up (${order.credits} credits)`;
  if (order.kind === "add-seats") return `Team plan: ${order.seats} more member${order.seats === 1 ? "" : "s"} until the end of the period`;
  const length = order.period === "year" ? "1 year" : "1 month";
  return order.plan === "team" ? `Team plan, ${order.seats} members, ${length}` : `Pro plan, ${length}`;
}
