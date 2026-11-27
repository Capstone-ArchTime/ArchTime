import {
  BillingRuleError, ORDER_TTL_MS, applyOrder, creditStatus, describeOrder, effectiveSeats, isPaid, limitsOf, scheduleNextSeats, needsReminder, newOrderId, quote, spaceKeyOf, validateSettings,
  type BillingSettings, type Gateway, type IOrder, type OrderInput, type OrderStatus, type SpaceAccount, type SpaceRef,
} from "../../../domain/billing/billing.js";
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors/AppError.js";

// ── Ports ──

export interface OrderStore {
  create(order: Omit<IOrder, "id">): Promise<IOrder>;
  find(orderId: string): Promise<IOrder | null>;
  setPayUrl(orderId: string, payUrl: string): Promise<void>;
  /**
   * → paid only if the order is not paid yet and the amount matches: the one update that settles a payment. An order marked
   * failed or expired can still become paid when the gateway confirms the payment later (the buyer was charged).
   */
  markPaid(orderId: string, amountVnd: number, gatewayTxnId: string, at: Date): Promise<IOrder | null>;
  markStatus(orderId: string, from: OrderStatus, to: OrderStatus, reason?: string): Promise<boolean>;
  markApplied(orderId: string, at: Date): Promise<void>;
  markReceipt(orderId: string, at: Date): Promise<void>;
  listBySpace(spaceKey: string, limit: number): Promise<IOrder[]>;
  pendingBefore(before: Date, limit: number): Promise<IOrder[]>;
  paidNotApplied(limit: number): Promise<IOrder[]>;
  list(filter: { status?: OrderStatus; gateway?: Gateway; spaceKey?: string; from?: Date; to?: Date }, page: number, limit: number): Promise<{ orders: IOrder[]; total: number }>;
}

export interface AccountStore {
  get(spaceKey: string): Promise<SpaceAccount | null>;
  /**
   * Changes the account with `mutate` unless `orderId` was already applied to it, as one atomic step (retried on a
   * concurrent change). Returns false when the order had been applied before.
   */
  applyOnce(spaceKey: string, orderId: string, mutate: (account: SpaceAccount) => SpaceAccount): Promise<boolean>;
  /** Sets the seats to buy at the next renewal (null: keep the seats); changes nothing else. */
  setNextSeats(spaceKey: string, seats: number | null): Promise<void>;
  /** Records that the renewal reminder for this end date was sent; changes nothing else. */
  markReminded(spaceKey: string, validUntil: Date): Promise<void>;
  /** Paid accounts whose period ends before the given date. */
  endingBefore(before: Date, limit: number): Promise<SpaceAccount[]>;
}

export interface SettingsStore {
  get(): Promise<BillingSettings>;
  save(settings: BillingSettings, by: string): Promise<BillingSettings>;
}

export interface GatewayResult { status: "paid" | "failed" | "pending"; gatewayTxnId?: string; amountVnd?: number; reason?: string }

export interface PaymentGateway {
  /** Where the buyer pays. */
  create(order: IOrder, ctx: { ipAddr: string; returnUrl: string }): Promise<{ payUrl: string }>;
  /** The gateway's own answer about an order, for reconciliation. */
  query(order: IOrder): Promise<GatewayResult>;
  /** Amounts (VND) the gateway accepts for one payment; orders outside them are refused before they are created. */
  readonly limits?: { minVnd: number; maxVnd: number };
}

export interface Contact { email: string; name: string }

export interface BillingDeps {
  orders: OrderStore;
  accounts: AccountStore;
  settings: SettingsStore;
  gateways: Partial<Record<Gateway, PaymentGateway>>;
  /** AI cost (USD) spent this month by the space. */
  usedThisMonth(space: SpaceRef, now: Date): Promise<number>;
  /** What the space uses now: personal workspaces, or organization members (active and invited). */
  usage(space: SpaceRef): Promise<{ workspaces: number; members: number }>;
  /** Throws ForbiddenError unless the user owns the organization. */
  requireOrganizationOwner(organizationId: string, userId: string): Promise<void>;
  isOrganizationMember(organizationId: string, userId: string): Promise<boolean>;
  organizationName(organizationId: string): Promise<string | null>;
  userContact(userId: string): Promise<Contact | null>;
  /** Who is told about the space's plan: the user, or the organization's owners. */
  billingContacts(space: SpaceRef): Promise<Contact[]>;
  sendMail?(to: string, mail: { subject: string; html: string; text: string }): Promise<void>;
  /** Address of the page the buyer comes back to (the order id is appended). */
  returnUrl: string;
  /** Address of the Plans & billing page, used in reminders. */
  billingUrl: string;
  now(): Date;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const vnd = (n: number) => `${n.toLocaleString("en-US")} VND`;
const spaceOfKey = (key: string): SpaceRef => key.startsWith("org:") ? { kind: "organization", organizationId: key.slice(4) } : { kind: "personal", userId: key.slice(5) };

/** Plans, AI credit and payments of a space (FE-17). Gateways are only trusted through their signed notification or query. */
export class BillingUseCases {
  constructor(private readonly d: BillingDeps) {}

  /** A space the caller may see: their own personal space, or an organization they belong to. */
  async parseSpace(raw: { kind?: unknown; organizationId?: unknown }, userId: string): Promise<SpaceRef> {
    if (raw.kind === "organization") {
      const organizationId = typeof raw.organizationId === "string" ? raw.organizationId : "";
      if (!organizationId || !(await this.d.isOrganizationMember(organizationId, userId))) throw new NotFoundError("Organization not found.");
      return { kind: "organization", organizationId };
    }
    return { kind: "personal", userId };
  }

  async overview(space: SpaceRef, userId: string) {
    const now = this.d.now();
    const key = spaceKeyOf(space);
    const [settings, account, used, usage] = await Promise.all([this.d.settings.get(), this.d.accounts.get(key), this.d.usedThisMonth(space, now), this.d.usage(space)]);
    const canBuy = space.kind === "personal" ? space.userId === userId : await this.isOwner(space.organizationId, userId);
    return {
      space, canBuy,
      credit: creditStatus(settings, space, account, used, now), period: account?.period ?? null,
      // A paid plan that has ended: the page offers to renew it (and only then).
      ended: account && account.plan !== "free" && account.validUntil && account.validUntil.getTime() <= now.getTime()
        ? { plan: account.plan, seats: account.seats, endedAt: account.validUntil, period: account.period ?? "month" } : null,
      limits: limitsOf(settings, space, account, now), usage,
      // A seat is an entitlement, a member occupies one: purchased − occupied are free to invite into without paying.
      seats: space.kind === "organization" && account && isPaid(account, now) && account.plan === "team" ? {
        purchased: effectiveSeats(account, now), occupied: usage.members, available: Math.max(0, effectiveSeats(account, now) - usage.members),
        next: account.nextSeats ?? null,
        pending: account.pendingSeats != null && account.pendingFrom && account.pendingFrom.getTime() > now.getTime() ? { seats: account.pendingSeats, from: account.pendingFrom } : null,
      } : null,
      catalog: {
        personalFree: settings.personalFree, pro: settings.pro, organizationFree: settings.organizationFree, team: settings.team, topup: settings.topup,
      },
      gateways: this.availableGateways(),
      orders: canBuy ? (await this.d.orders.listBySpace(key, 20)).map(present) : [],
    };
  }

  availableGateways(): Gateway[] {
    return (Object.keys(this.d.gateways) as Gateway[]).filter(g => !!this.d.gateways[g]);
  }

  private async isOwner(organizationId: string, userId: string): Promise<boolean> {
    try { await this.d.requireOrganizationOwner(organizationId, userId); return true; } catch { return false; }
  }

  async quote(space: SpaceRef, input: OrderInput) {
    const now = this.d.now();
    const [settings, account, usage] = await Promise.all([this.d.settings.get(), this.d.accounts.get(spaceKeyOf(space)), this.d.usage(space)]);
    try {
      return quote(settings, space, input, account, now, usage.members);
    } catch (e) {
      if (e instanceof BillingRuleError) throw new BadRequestError(e.message, "VALIDATION_ERROR");
      throw e;
    }
  }

  async createOrder(userId: string, space: SpaceRef, input: OrderInput & { gateway?: unknown }, ipAddr: string) {
    if (space.kind === "organization") await this.d.requireOrganizationOwner(space.organizationId, userId);
    else if (space.userId !== userId) throw new ForbiddenError("You can only buy for your own personal space.");
    const gateway = input.gateway as Gateway;
    const client = this.d.gateways[gateway];
    if (!client) throw new AppError(503, "GATEWAY_UNAVAILABLE", "This payment method is not available on this server.");
    const q = await this.quote(space, input);
    if (client.limits && (q.amountVnd < client.limits.minVnd || q.amountVnd > client.limits.maxVnd)) {
      throw new BillingRuleError(
        `This payment method accepts ${client.limits.minVnd.toLocaleString("vi-VN")} to ${client.limits.maxVnd.toLocaleString("vi-VN")} VND per payment. Use the other method, or buy fewer seats or packs at a time.`,
        "gateway",
      );
    }
    const catalogVersion = (await this.d.settings.get()).version;
    const now = this.d.now();
    const order = await this.d.orders.create({
      orderId: newOrderId(now), space, buyerId: userId, kind: q.kind, plan: q.plan, period: q.period, seats: q.seats, credits: q.credits,
      amountVnd: q.amountVnd, catalogVersion, gateway, status: "pending", expiresAt: new Date(now.getTime() + ORDER_TTL_MS), createdAt: now,
    });
    let payUrl: string;
    try {
      ({ payUrl } = await client.create(order, { ipAddr, returnUrl: `${this.d.returnUrl}?orderId=${encodeURIComponent(order.orderId)}` }));
    } catch (e) {
      await this.d.orders.markStatus(order.orderId, "pending", "failed", e instanceof Error ? e.message.slice(0, 300) : "gateway error");
      throw new AppError(502, "GATEWAY_ERROR", "The payment gateway did not accept the order. Try again later or use the other method.");
    }
    await this.d.orders.setPayUrl(order.orderId, payUrl);
    return { order: present({ ...order, payUrl }), payUrl };
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.d.orders.find(orderId);
    if (!order || !(await this.mayFollow(order, userId))) throw new NotFoundError("Order not found.");
    return present(order);
  }

  private async mayFollow(order: IOrder, userId: string): Promise<boolean> {
    if (order.buyerId === userId) return true;
    return order.space.kind === "organization" ? this.isOwner(order.space.organizationId, userId) : order.space.userId === userId;
  }

  /**
   * The outcome a gateway reported for an order, after its signature was checked by the caller. A payment counts only if
   * the order exists, is not paid yet and the amount is the one asked for; anything else changes nothing. A failure only
   * closes an order that is still pending.
   */
  async settle(orderId: string, result: GatewayResult): Promise<"paid" | "failed" | "ignored" | "not-found" | "amount-mismatch"> {
    const order = await this.d.orders.find(orderId);
    if (!order) return "not-found";
    if (result.status === "pending") return "ignored";
    if (result.status === "failed") {
      return (await this.d.orders.markStatus(orderId, "pending", "failed", result.reason)) ? "failed" : "ignored";
    }
    if (result.amountVnd !== undefined && result.amountVnd !== order.amountVnd) return "amount-mismatch";
    const paid = await this.d.orders.markPaid(orderId, order.amountVnd, result.gatewayTxnId ?? "", this.d.now());
    if (!paid) return "ignored"; // already paid: a repeated notification changes nothing
    await this.apply(paid);
    return "paid";
  }

  /**
   * Adds what was bought to the space, then e-mails the receipt. The account records the order in the same atomic update
   * that changes it, so an order is applied once even if this runs twice (a notification and a reconciliation at the same
   * time, or a crash between applying and marking the order applied), and two orders of one space never overwrite each other.
   */
  async apply(order: IOrder): Promise<void> {
    if (order.appliedAt) return;
    const now = this.d.now();
    const settings = await this.d.settings.get();
    await this.d.accounts.applyOnce(spaceKeyOf(order.space), order.orderId, account => applyOrder(account, order, now, settings));
    await this.d.orders.markApplied(order.orderId, now);
    await this.sendReceipt(order).catch(error => console.warn(`[billing] receipt for ${order.orderId} not sent:`, error instanceof Error ? error.message : error));
  }

  private async spaceName(space: SpaceRef) {
    return space.kind === "organization" ? (await this.d.organizationName(space.organizationId)) ?? "your organization" : "your personal space";
  }

  private async sendReceipt(order: IOrder): Promise<void> {
    if (!this.d.sendMail || order.receiptSentAt) return;
    const buyer = await this.d.userContact(order.buyerId);
    if (!buyer?.email) return;
    const rows: [string, string][] = [
      ["Order", order.orderId], ["Item", describeOrder(order)], ["Space", await this.spaceName(order.space)], ["Amount", vnd(order.amountVnd)],
      ["Paid with", order.gateway === "momo" ? "MoMo" : order.gateway === "vnpay" ? "VNPay" : "Test gateway"],
      ["Transaction", order.gatewayTxnId || "—"], ["Paid at", (order.paidAt ?? this.d.now()).toISOString()],
    ];
    await this.d.sendMail(buyer.email, {
      subject: `ArchTime receipt ${order.orderId}`,
      text: `Hello ${buyer.name},\n\nThank you for your payment.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nArchTime`,
      html: `<p>Hello ${escapeHtml(buyer.name)},</p><p>Thank you for your payment.</p><table>${rows.map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`).join("")}</table><p>ArchTime</p>`,
    });
    await this.d.orders.markReceipt(order.orderId, this.d.now());
  }

  /** E-mails the people of a space whose paid plan ends within a week; once per end date. */
  private async remind(now: Date): Promise<number> {
    if (!this.d.sendMail) return 0;
    let sent = 0;
    for (const account of await this.d.accounts.endingBefore(new Date(now.getTime() + 7 * 86_400_000), 100)) {
      if (!needsReminder(account, now)) continue;
      const space = spaceOfKey(account.spaceKey);
      const name = await this.spaceName(space);
      const plan = account.plan === "team" ? "Team" : "Pro";
      const end = account.validUntil!.toISOString().slice(0, 10);
      for (const c of await this.d.billingContacts(space)) {
        await this.d.sendMail(c.email, {
          subject: `Your ArchTime ${plan} plan ends on ${end}`,
          text: `Hello ${c.name},\n\nThe ${plan} plan of ${name} ends on ${end}. Renew it on ${this.d.billingUrl} to keep its limits and AI credit. If it is not renewed, the space returns to the Free plan and keeps all its data.\n\nArchTime`,
          html: `<p>Hello ${escapeHtml(c.name)},</p><p>The ${plan} plan of ${escapeHtml(name)} ends on <b>${end}</b>. <a href="${escapeHtml(this.d.billingUrl)}">Renew it</a> to keep its limits and AI credit. If it is not renewed, the space returns to the Free plan and keeps all its data.</p><p>ArchTime</p>`,
        }).catch(error => console.warn(`[billing] reminder to ${c.email} not sent:`, error instanceof Error ? error.message : error));
      }
      await this.d.accounts.markReminded(account.spaceKey, account.validUntil!);
      sent++;
    }
    return sent;
  }

  /**
   * Run every few minutes: asks the gateway about pending orders it has not heard about, expires orders nobody paid,
   * applies paid orders whose application was interrupted, and reminds spaces whose plan ends within a week.
   */
  async reconcile(): Promise<{ checked: number; paid: number; failed: number; expired: number; applied: number; reminded: number }> {
    const now = this.d.now();
    const tally = { checked: 0, paid: 0, failed: 0, expired: 0, applied: 0, reminded: 0 };
    for (const order of await this.d.orders.pendingBefore(new Date(now.getTime() - 2 * 60_000), 100)) {
      tally.checked++;
      const client = this.d.gateways[order.gateway];
      let result: GatewayResult = { status: "pending" };
      if (client) {
        try { result = await client.query(order); } catch { result = { status: "pending" }; }
      }
      const outcome = await this.settle(order.orderId, result);
      if (outcome === "paid") tally.paid++;
      else if (outcome === "failed") tally.failed++;
      else if (result.status === "pending" && order.expiresAt.getTime() + 15 * 60_000 < now.getTime()) {
        // The gateway's own payment window is shorter than this: an order still pending well after it is not paid.
        if (await this.d.orders.markStatus(order.orderId, "pending", "expired", "not paid in time")) tally.expired++;
      }
    }
    for (const order of await this.d.orders.paidNotApplied(50)) {
      await this.apply(order);
      tally.applied++;
    }
    tally.reminded = await this.remind(now);
    return tally;
  }

  /** The plan catalog (prices and credits), the one the server prices orders with. */
  async pricing() {
    const s = await this.d.settings.get();
    return { personalFree: s.personalFree, pro: s.pro, organizationFree: s.organizationFree, team: s.team, topup: s.topup, cycle: "calendar month, Asia/Ho_Chi_Minh (UTC+7)", rounding: "prorated charges rounded up to the next 1,000 VND" };
  }

  /** Owners choose the seats to buy at the next renewal; a reduction takes effect then, never during the paid period. */
  async setNextSeats(space: SpaceRef, userId: string, seats: unknown) {
    if (space.kind !== "organization") throw new BadRequestError("Seats belong to an organization's Team plan.", "VALIDATION_ERROR");
    await this.d.requireOrganizationOwner(space.organizationId, userId);
    const now = this.d.now();
    const key = spaceKeyOf(space);
    const [settings, account] = await Promise.all([this.d.settings.get(), this.d.accounts.get(key)]);
    try {
      const next = scheduleNextSeats(settings, account, Number(seats), now);
      await this.d.accounts.setNextSeats(key, next.nextSeats ?? null);
      return { next: next.nextSeats ?? null, current: effectiveSeats(next, now), from: next.validUntil };
    } catch (e) {
      if (e instanceof BillingRuleError) throw new BadRequestError(e.message, "VALIDATION_ERROR");
      throw e;
    }
  }

  /** Payments of a space, newest first, for the people who may buy for it; filtered by status and creation date. */
  async spaceOrders(space: SpaceRef, userId: string, query: { status?: unknown; from?: unknown; to?: unknown; page?: unknown; limit?: unknown }) {
    const allowed = space.kind === "personal" ? space.userId === userId : await this.isOwner(space.organizationId, userId);
    if (!allowed) throw new ForbiddenError("Only owners of the organization can see its payments.");
    const status = ["pending", "paid", "failed", "expired"].includes(String(query.status)) ? query.status as OrderStatus : undefined;
    const date = (v: unknown, name: string, endOfDay = false) => {
      if (v === undefined || v === "") return undefined;
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) throw new BadRequestError(` must be a date (YYYY-MM-DD).`, "VALIDATION_ERROR");
      if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setUTCHours(23, 59, 59, 999);
      return d;
    };
    const from = date(query.from, "from");
    const to = date(query.to, "to", true);
    if (from && to && from > to) throw new BadRequestError("from must not be after to.", "VALIDATION_ERROR");
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 10)));
    const { orders, total } = await this.d.orders.list({ spaceKey: spaceKeyOf(space), status, from, to }, page, limit);
    return { orders: orders.map(present), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ── administrators ──

  getSettings() { return this.d.settings.get(); }

  async updateSettings(input: Partial<BillingSettings>, by: string) {
    try {
      return await this.d.settings.save(validateSettings(input, await this.d.settings.get()), by);
    } catch (e) {
      if (e instanceof BillingRuleError) throw new BadRequestError(e.message, "VALIDATION_ERROR");
      throw e;
    }
  }

  async listOrders(query: { status?: unknown; gateway?: unknown; page?: unknown; limit?: unknown }) {
    const status = ["pending", "paid", "failed", "expired"].includes(String(query.status)) ? query.status as OrderStatus : undefined;
    const gateway = ["momo", "vnpay", "simulator"].includes(String(query.gateway)) ? query.gateway as Gateway : undefined;
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
    const { orders, total } = await this.d.orders.list({ status, gateway }, page, limit);
    const paidTotal = orders.filter(o => o.status === "paid").reduce((s, o) => s + o.amountVnd, 0);
    return { orders: orders.map(present), meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, pagePaidVnd: paidTotal };
  }
}

export function present(o: IOrder) {
  return {
    orderId: o.orderId, space: o.space, buyerId: o.buyerId, kind: o.kind, item: describeOrder(o), plan: o.plan ?? null, period: o.period ?? null,
    seats: o.seats ?? null, credits: o.credits ?? null, amountVnd: o.amountVnd, gateway: o.gateway, status: o.status, payUrl: o.status === "pending" ? o.payUrl ?? null : null,
    gatewayTxnId: o.gatewayTxnId ?? null, paidAt: o.paidAt ?? null, applied: !!o.appliedAt, failureReason: o.failureReason ?? null, expiresAt: o.expiresAt, createdAt: o.createdAt,
  };
}
