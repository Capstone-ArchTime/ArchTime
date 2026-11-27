import mongoose, { type Model, Schema } from "mongoose";
import type { BillingSettings, IOrder, SpaceAccount } from "../../../domain/billing/billing.js";

/** One payment of a space (FE-17). Settled only by the gateway's signed notification or its status query. */
const OrderSchema = new Schema<Omit<IOrder, "id">>(
  {
    orderId: { type: String, required: true, unique: true },
    space: {
      kind: { type: String, enum: ["personal", "organization"], required: true },
      userId: { type: String },
      organizationId: { type: String },
    },
    spaceKey: { type: String, required: true, index: true },
    buyerId: { type: String, required: true, ref: "User" },
    kind: { type: String, enum: ["plan", "add-seats", "topup"], required: true },
    plan: { type: String, enum: ["free", "pro", "team"] }, period: { type: String, enum: ["month", "year"] },
    seats: Number, credits: Number,
    amountVnd: { type: Number, required: true },
    gateway: { type: String, enum: ["momo", "vnpay", "simulator"], required: true },
    status: { type: String, enum: ["pending", "paid", "failed", "expired"], default: "pending", index: true },
    catalogVersion: Number,
    payUrl: String, gatewayTxnId: String, paidAt: Date, appliedAt: Date, failureReason: String, receiptSentAt: Date,
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
  } as any,
  { timestamps: { createdAt: false, updatedAt: true } },
);
OrderSchema.index({ status: 1, createdAt: 1 });
OrderSchema.index({ spaceKey: 1, createdAt: -1 });

export const BillingOrderModel: Model<any> = mongoose.models.BillingOrder ?? mongoose.model("BillingOrder", OrderSchema);

/** Plan and top-up credit of a space; a space without a document is on the Free plan with no top-up credit. */
const AccountSchema = new Schema<SpaceAccount>(
  {
    spaceKey: { type: String, required: true, unique: true },
    plan: { type: String, enum: ["free", "pro", "team"], default: "free" },
    seats: { type: Number, default: 0 },
    validUntil: { type: Date, default: null, index: true },
    topupCredits: { type: Number, default: 0 },
    period: { type: String, enum: ["month", "year"] },
    remindedFor: { type: Date, default: null },
    /** Optimistic-concurrency revision and the orders already applied (see AiCreditService.applyOnce). */
    rev: { type: Number, default: 0 },
    appliedOrders: { type: [String], default: [] },
    /** Credits spent this month (Vietnam time), counted atomically per AI run to decide what comes out of top-up credit. */
    monthKey: { type: String, default: null },
    monthUsedCredits: { type: Number, default: 0 },
    /** Seat changes that wait for a date: seats for the next renewal, a reduction bought early, mid-cycle credit. */
    nextSeats: { type: Number, default: null },
    pendingSeats: { type: Number, default: null },
    pendingFrom: { type: Date, default: null },
    cycleAdjust: { month: String, credits: Number },
    /** Purchased periods with the price per seat paid (see BillingSegment). */
    segments: [{ _id: false, start: Date, end: Date, period: String, seats: Number, unitVnd: Number, orderId: String }],
  } as any,
  { timestamps: true },
);

export const SpaceAccountModel: Model<SpaceAccount> = mongoose.models.SpaceAccount ?? mongoose.model<SpaceAccount>("SpaceAccount", AccountSchema);

/** Plan catalog; one document, created with the defaults the first time it is read. */
const SettingsSchema = new Schema<BillingSettings>(
  {
    creditUnitUsd: Number,
    personalFree: { workspaces: Number, credits: Number },
    pro: { monthVnd: Number, yearVnd: Number, credits: Number },
    organizationFree: { members: Number, credits: Number },
    team: { seatMonthVnd: Number, seatYearVnd: Number, creditsPerSeat: Number, minSeats: Number },
    topup: { credits: Number, priceVnd: Number },
    enforce: Boolean, updatedBy: String,
    seatProration: { type: String, enum: ["latest-period", "per-segment"] },
    version: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: false, updatedAt: true }, strict: false },
);

export const BillingSettingsModel: Model<BillingSettings> = mongoose.models.BillingSettings ?? mongoose.model<BillingSettings>("BillingSettings", SettingsSchema);

/** A short lease that serialises seat reservations of one organization (see AiCreditService.reserveSeat). */
const SeatLockSchema = new Schema({ key: { type: String, required: true, unique: true }, owner: String, lockedUntil: { type: Date, required: true } });
export const SeatLockModel: Model<any> = mongoose.models.SeatLock ?? mongoose.model("SeatLock", SeatLockSchema);