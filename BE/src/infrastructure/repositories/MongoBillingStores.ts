import type { IOrder, OrderStatus } from "../../domain/billing/billing.js";
import { spaceKeyOf } from "../../domain/billing/billing.js";
import type { AccountStore, OrderStore, SettingsStore } from "../../application/use-cases/billing/BillingUseCases.js";
import { BillingOrderModel } from "../database/models/BillingModels.js";
import { AiCreditService } from "../services/AiCreditService.js";

const toOrder = (d: any): IOrder | null => d ? ({
  id: String(d._id), orderId: d.orderId,
  space: d.space?.kind === "organization" ? { kind: "organization", organizationId: d.space.organizationId } : { kind: "personal", userId: d.space?.userId },
  buyerId: d.buyerId, kind: d.kind, plan: d.plan ?? undefined, period: d.period ?? undefined, seats: d.seats ?? undefined, credits: d.credits ?? undefined,
  amountVnd: d.amountVnd, catalogVersion: d.catalogVersion ?? undefined, gateway: d.gateway, status: d.status, payUrl: d.payUrl ?? undefined, gatewayTxnId: d.gatewayTxnId ?? undefined,
  paidAt: d.paidAt ?? null, appliedAt: d.appliedAt ?? null, failureReason: d.failureReason ?? undefined, receiptSentAt: d.receiptSentAt ?? null,
  expiresAt: d.expiresAt, createdAt: d.createdAt,
}) : null;

export class MongoOrderStore implements OrderStore {
  async create(order: Omit<IOrder, "id">) {
    const doc = await BillingOrderModel.create({ ...order, spaceKey: spaceKeyOf(order.space) });
    return toOrder(doc.toObject())!;
  }
  async find(orderId: string) { return toOrder(await BillingOrderModel.findOne({ orderId: String(orderId) }).lean()); }
  async setPayUrl(orderId: string, payUrl: string) { await BillingOrderModel.updateOne({ orderId }, { $set: { payUrl } }); }
  async markPaid(orderId: string, amountVnd: number, gatewayTxnId: string, at: Date) {
    return toOrder(await BillingOrderModel.findOneAndUpdate(
      { orderId, status: { $in: ["pending", "failed", "expired"] }, amountVnd },
      { $set: { status: "paid", paidAt: at, gatewayTxnId } }, { new: true }).lean());
  }
  async markStatus(orderId: string, from: OrderStatus, to: OrderStatus, reason?: string) {
    const r = await BillingOrderModel.updateOne({ orderId, status: from }, { $set: { status: to, ...(reason ? { failureReason: reason } : {}) } });
    return r.modifiedCount === 1;
  }
  async markApplied(orderId: string, at: Date) { await BillingOrderModel.updateOne({ orderId }, { $set: { appliedAt: at } }); }
  async markReceipt(orderId: string, at: Date) { await BillingOrderModel.updateOne({ orderId }, { $set: { receiptSentAt: at } }); }
  async listBySpace(spaceKey: string, limit: number) {
    return (await BillingOrderModel.find({ spaceKey }).sort({ createdAt: -1 }).limit(limit).lean()).map(d => toOrder(d)!);
  }
  async pendingBefore(before: Date, limit: number) {
    return (await BillingOrderModel.find({ status: "pending", createdAt: { $lte: before } }).sort({ createdAt: 1 }).limit(limit).lean()).map(d => toOrder(d)!);
  }
  async paidNotApplied(limit: number) {
    return (await BillingOrderModel.find({ status: "paid", $or: [{ appliedAt: null }, { appliedAt: { $exists: false } }] }).limit(limit).lean()).map(d => toOrder(d)!);
  }
  async list(filter: { status?: OrderStatus; gateway?: string; spaceKey?: string; from?: Date; to?: Date }, page: number, limit: number) {
    const q: Record<string, unknown> = {};
    if (filter.from || filter.to) q.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: filter.to } : {}) };
    if (filter.status) q.status = filter.status;
    if (filter.gateway) q.gateway = filter.gateway;
    if (filter.spaceKey) q.spaceKey = filter.spaceKey;
    const [docs, total] = await Promise.all([
      BillingOrderModel.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      BillingOrderModel.countDocuments(q),
    ]);
    return { orders: docs.map(d => toOrder(d)!), total };
  }
}

export const mongoAccountStore: AccountStore = {
  get: key => AiCreditService.account(key),
  applyOnce: (key, orderId, mutate) => AiCreditService.applyOnce(key, orderId, mutate),
  markReminded: (key, validUntil) => AiCreditService.markReminded(key, validUntil),
  setNextSeats: (key, seats) => AiCreditService.setNextSeats(key, seats),
  endingBefore: (before, limit) => AiCreditService.endingBefore(before, limit),
};

export const mongoSettingsStore: SettingsStore = {
  get: () => AiCreditService.settings(),
  save: (settings, by) => AiCreditService.saveSettings(settings, by),
};
