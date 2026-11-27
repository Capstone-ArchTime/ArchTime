import mongoose from "mongoose";
import {
  DEFAULT_SETTINGS, creditStatus, emptyAccount, includedCredits, limitsOf, monthStart, spaceKeyOf, toCredits, topupSpend, validateSettings,
  type BillingSettings, type SpaceAccount, type SpaceRef,
} from "../../domain/billing/billing.js";
import { randomUUID } from "node:crypto";
import { BillingSettingsModel, SeatLockModel, SpaceAccountModel } from "../database/models/BillingModels.js";
import { LlmRunModel } from "../database/models/LlmRunModel.js";
import { ProjectModel } from "../database/models/ProjectModel.js";
import { OrganizationMemberModel } from "../database/models/OrganizationMemberModel.js";
import { AppError } from "../../shared/errors/AppError.js";

const connected = () => mongoose.connection.readyState === 1;
const enforcementOff = () => process.env.AI_CREDIT_ENFORCE === "false";
let cached: { at: number; value: BillingSettings } | null = null;
/** How long an organization invitation holds a seat and can be accepted; the same 7 days as project invitations by default. */
export const invitationTtlMs = () => Math.max(1, Number(process.env.ORG_INVITATION_TTL_DAYS ?? "7") || 7) * 86_400_000;
/** Deep equality of two settings objects, ignoring the order of keys. */
const sameValues = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a as object).filter(k => (a as any)[k] !== undefined).sort();
  const kb = Object.keys(b as object).filter(k => (b as any)[k] !== undefined).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameValues((a as any)[k], (b as any)[k]));
};
const personalFilter ={ $or: [{ organizationId: null }, { organizationId: { $exists: false } }] };

/**
 * Plans and AI credit of spaces (FE-17): the catalog, how much a space has spent this month, refusing an AI run when
 * nothing is left, taking a finished run's credits out of top-up credit once the month's credit is used, and the plan
 * limits (workspaces of a personal space, members of an organization). Spending is read from the recorded AI runs.
 */
export class AiCreditService {
  static async settings(): Promise<BillingSettings> {
    if (cached && Date.now() - cached.at < 30_000) return cached.value;
    if (!connected()) return DEFAULT_SETTINGS;
    let doc = await BillingSettingsModel.findOne().lean<Partial<BillingSettings> & { updatedAt?: Date }>();
    if (!doc) doc = (await BillingSettingsModel.create(DEFAULT_SETTINGS)).toObject() as any;
    // A document saved by an earlier version lacks some groups: the defaults fill them in.
    let value: BillingSettings;
    try {
      value = validateSettings(doc as Partial<BillingSettings>, DEFAULT_SETTINGS);
    } catch {
      value = DEFAULT_SETTINGS;
    }
    value = { ...value, updatedAt: doc!.updatedAt, updatedBy: doc!.updatedBy, version: (doc as any).version ?? 1 };
    cached = { at: Date.now(), value };
    return value;
  }

  static async saveSettings(settings: BillingSettings, by: string): Promise<BillingSettings> {
    // Each change gets a new version number; orders keep the version they were priced with. Paid orders keep their amounts.
    const { version: _ignored, updatedAt: _u, updatedBy: _b, ...values } = settings as BillingSettings & { updatedAt?: Date; updatedBy?: string };
    // Saving the same values again is not a new catalog: the version only moves when something changed.
    const { version: _cv, updatedAt: _cu, updatedBy: _cb, ...current } = (await this.settings()) as BillingSettings & { updatedAt?: Date; updatedBy?: string };
    if (sameValues(values, current)) return this.settings();
    // A catalog saved before versioning has no version field (read as 1): give it 1 first, so this change becomes 2.
    await BillingSettingsModel.updateOne({ version: { $exists: false } }, { $set: { version: 1 } });
    await BillingSettingsModel.findOneAndUpdate({}, { $set: { ...values, updatedBy: by }, $inc: { version: 1 } }, { upsert: true });
    cached = null;
    return this.settings();
  }

  static async account(spaceKey: string): Promise<SpaceAccount | null> {
    if (!connected()) return null;
    const a = await SpaceAccountModel.findOne({ spaceKey }).lean<SpaceAccount>();
    return a ? toAccount(a) : null;
  }

  /**
   * Applies a paid order to an account at most once, as one atomic step. The account keeps the ids of the orders applied
   * to it and a revision number; the update only goes through if the revision is still the one read, and is retried
   * otherwise. Two orders of one space applied at the same time therefore never overwrite each other.
   */
  static async applyOnce(spaceKey: string, orderId: string, mutate: (account: SpaceAccount) => SpaceAccount): Promise<boolean> {
    for (let attempt = 0; attempt < 40; attempt++) {
      // Back off a little, at random, so many orders of one space applied at once do not keep colliding.
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 20 * Math.min(attempt, 5)));
      const doc = await SpaceAccountModel.findOne({ spaceKey }).lean<any>();
      if (doc?.appliedOrders?.includes(orderId)) return false;
      const next = mutate(doc ? toAccount(doc) : emptyAccount(spaceKey));
      const set = {
        plan: next.plan, seats: next.seats, validUntil: next.validUntil, topupCredits: next.topupCredits, period: next.period ?? null, remindedFor: next.remindedFor ?? null,
        nextSeats: next.nextSeats ?? null, pendingSeats: next.pendingSeats ?? null, pendingFrom: next.pendingFrom ?? null, cycleAdjust: next.cycleAdjust ?? null,
        segments: next.segments ?? [],
      };
      if (!doc) {
        try {
          await SpaceAccountModel.create({ spaceKey, ...set, rev: 1, appliedOrders: [orderId] });
          return true;
        } catch (error: any) {
          if (error?.code === 11000) continue; // created by a concurrent apply: read it again
          throw error;
        }
      }
      const r = await SpaceAccountModel.updateOne(
        { spaceKey, rev: doc.rev ?? 0, appliedOrders: { $ne: orderId } },
        { $set: { ...set, rev: (doc.rev ?? 0) + 1 }, $push: { appliedOrders: { $each: [orderId], $slice: -500 } } },
      );
      if (r.modifiedCount === 1) return true;
    }
    throw new Error(`Could not apply order ${orderId}: the account kept changing.`);
  }

  static async setNextSeats(spaceKey: string, seats: number | null): Promise<void> {
    await SpaceAccountModel.updateOne({ spaceKey }, { $set: { nextSeats: seats } });
  }

  static async markReminded(spaceKey: string, validUntil: Date): Promise<void> {
    await SpaceAccountModel.updateOne({ spaceKey }, { $set: { remindedFor: validUntil } });
  }

  static async endingBefore(before: Date, limit: number): Promise<SpaceAccount[]> {
    if (!connected()) return [];
    const rows = await SpaceAccountModel.find({ plan: { $ne: "free" }, validUntil: { $gt: new Date(), $lte: before } }).limit(limit).lean<SpaceAccount[]>();
    return rows.map(toAccount);
  }

  /** The space a workspace belongs to: its organization, or the personal space of its owner. */
  static async spaceOfProject(projectId: string): Promise<SpaceRef | null> {
    if (!connected() || !mongoose.isValidObjectId(projectId)) return null;
    const p = await ProjectModel.findById(projectId).select("userId organizationId").lean<{ userId: string; organizationId?: string | null }>();
    if (!p) return null;
    return p.organizationId ? { kind: "organization", organizationId: String(p.organizationId) } : { kind: "personal", userId: String(p.userId) };
  }

  /** AI cost (USD) of the space's runs since the start of the month (Vietnam time). Benchmarks are not charged. */
  static async usedThisMonth(space: SpaceRef, now: Date = new Date()): Promise<number> {
    if (!connected()) return 0;
    let scope: Record<string, unknown>;
    if (space.kind === "organization") {
      scope = { organizationId: space.organizationId };
    } else {
      const own = await ProjectModel.find({ userId: space.userId, ...personalFilter }).select("_id").lean<{ _id: unknown }[]>();
      scope = { projectId: { $in: own.map(p => String(p._id)) }, ...personalFilter };
    }
    const rows = await LlmRunModel.aggregate<{ cost: number }>([
      { $match: { purpose: "user", createdAt: { $gte: monthStart(now) }, ...scope } },
      { $group: { _id: null, cost: { $sum: { $ifNull: ["$cost.amount", 0] } } } },
    ]);
    return rows[0]?.cost ?? 0;
  }

  /** Personal workspaces of a user, or members (active and invited) of an organization. */
  static async usage(space: SpaceRef): Promise<{ workspaces: number; members: number }> {
    if (!connected()) return { workspaces: 0, members: 0 };
    if (space.kind === "personal") return { workspaces: await ProjectModel.countDocuments({ userId: space.userId, ...personalFilter }), members: 0 };
    // Occupied = active members; reserved = invitations still within their lifetime. Expired invitations hold no seat.
    const since = new Date(Date.now() - invitationTtlMs());
    const members = await OrganizationMemberModel.countDocuments({ organizationId: space.organizationId, $or: [{ status: { $ne: "invited" } }, { status: "invited", createdAt: { $gt: since } }] });
    return { workspaces: await ProjectModel.countDocuments({ organizationId: space.organizationId }), members };
  }

  static async status(space: SpaceRef, now: Date = new Date()) {
    const [settings, account, used] = await Promise.all([this.settings(), this.account(spaceKeyOf(space)), this.usedThisMonth(space, now)]);
    return creditStatus(settings, space, account, used, now);
  }

  /**
   * Refuses an AI run for a workspace whose space has no credit left (402). Without a database, or when the administrator
   * turned enforcement off (or AI_CREDIT_ENFORCE=false), nothing is refused.
   */
  static async assertAvailable(projectId: string): Promise<void> {
    if (enforcementOff() || !connected()) return;
    if (!(await this.settings()).enforce) return;
    const space = await this.spaceOfProject(projectId);
    if (!space) return;
    if ((await this.status(space)).available <= 0) {
      const who = space.kind === "organization" ? "This organization" : "Your personal space";
      throw new AppError(402, "AI_CREDIT_EXHAUSTED",
        `${who} has used all of its AI credit for this month. ${space.kind === "organization" ? "An owner can upgrade to Team or buy a credit top-up" : "Upgrade to Pro or buy a credit top-up"} on the Plans & billing page, or wait for next month.`);
    }
  }

  /** Refuses a new personal workspace beyond what the plan allows (Free: a few workspaces). */
  static async assertCanAddWorkspace(userId: string): Promise<void> {
    if (enforcementOff() || !connected()) return;
    const settings = await this.settings();
    if (!settings.enforce) return;
    const space: SpaceRef = { kind: "personal", userId };
    const limit = limitsOf(settings, space, await this.account(spaceKeyOf(space)), new Date()).workspaces;
    if (limit !== null && (await this.usage(space)).workspaces >= limit) {
      throw new AppError(402, "PLAN_LIMIT_REACHED", `The Free plan holds ${limit} personal workspaces. Upgrade to Pro on the Plans & billing page for unlimited workspaces, or create the workspace in an organization.`);
    }
  }

  /** Refuses a new member (or invitation) beyond what the organization's plan allows (Free: a few members; Team: its seats). */
  static async assertCanAddMember(organizationId: string): Promise<void> {
    if (enforcementOff() || !connected()) return;
    const settings = await this.settings();
    if (!settings.enforce) return;
    const space: SpaceRef = { kind: "organization", organizationId };
    const account = await this.account(spaceKeyOf(space));
    const limit = limitsOf(settings, space, account, new Date()).members;
    if (limit !== null && (await this.usage(space)).members >= limit) {
      const team = account?.plan === "team" && account.validUntil && account.validUntil > new Date();
      throw new AppError(402, "PLAN_LIMIT_REACHED", team
        ? `The Team plan has ${limit} seats and all are taken. An owner can add members on the Plans & billing page.`
        : `A Free organization holds ${limit} members. An owner can upgrade to Team on the Plans & billing page.`);
    }
  }

  /** True when an organization holds more members (active and invited) than its plan allows; enforcement off: never. */
  static async overMemberLimit(organizationId: string): Promise<boolean> {
    if (enforcementOff() || !connected()) return false;
    const settings = await this.settings();
    if (!settings.enforce) return false;
    const space: SpaceRef = { kind: "organization", organizationId };
    const limit = limitsOf(settings, space, await this.account(spaceKeyOf(space)), new Date()).members;
    return limit !== null && (await this.usage(space)).members > limit;
  }

  /**
   * Reserves a seat of an organization: takes the organization's seat lock (a short lease, so a crashed holder cannot
   * block it), checks that a seat is free, runs `insert` (the invitation), and releases the lock. Two invitations sent at
   * the same moment are handled one after the other: with one free seat, exactly one gets it and the other is refused.
   */
  static async reserveSeat<T>(organizationId: string, insert: () => Promise<T>): Promise<T> {
    if (enforcementOff() || !connected()) return insert();
    const key = `seat:${organizationId}`;
    const owner = randomUUID();
    const deadline = Date.now() + 5_000;
    for (;;) {
      const now = new Date();
      try {
        const got = await SeatLockModel.findOneAndUpdate(
          { key, lockedUntil: { $lte: now } },
          { $set: { owner, lockedUntil: new Date(now.getTime() + 10_000) } },
          { upsert: true, new: true },
        ).lean<any>();
        if (got?.owner === owner) break;
      } catch (error: any) {
        if (error?.code !== 11000) throw error; // the lock is held: someone else's document matched the key
      }
      if (Date.now() > deadline) throw new AppError(503, "SERVICE_UNAVAILABLE", "Seats are being changed by someone else. Try again in a moment.");
      await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 60));
    }
    try {
      await this.assertCanAddMember(organizationId);
      return await insert();
    } finally {
      await SeatLockModel.updateOne({ key, owner }, { $set: { lockedUntil: new Date(0) } });
    }
  }

  /** Takes the credits of a just-recorded run that go beyond the month's included credit out of top-up credit. */
  static async charge(projectId: string, costUsd: number, now: Date = new Date()): Promise<void> {
    if (!(costUsd > 0) || !connected()) return;
    try {
      const space = await this.spaceOfProject(projectId);
      if (!space) return;
      const key = spaceKeyOf(space);
      const settings = await this.settings();
      const run = toCredits(costUsd, settings);
      const month = monthStart(now).toISOString();
      // The month's spending is counted with one atomic increment per run, so two runs finishing together each see the
      // spending before them and the part beyond the included credit is taken from top-up credit exactly once.
      let counted = await SpaceAccountModel.findOneAndUpdate({ spaceKey: key, monthKey: month }, { $inc: { monthUsedCredits: run } }, { new: true }).lean<any>();
      if (!counted) {
        // First run of the month for this space: start the counter from what the recorded runs already spent.
        const before = Math.max(0, toCredits(await this.usedThisMonth(space, now), settings) - run);
        await SpaceAccountModel.updateOne({ spaceKey: key }, { $setOnInsert: { spaceKey: key, plan: "free", seats: 0, topupCredits: 0 } }, { upsert: true });
        counted = await SpaceAccountModel.findOneAndUpdate({ spaceKey: key, monthKey: { $ne: month } }, { $set: { monthKey: month, monthUsedCredits: before + run } }, { new: true }).lean<any>()
          ?? await SpaceAccountModel.findOneAndUpdate({ spaceKey: key, monthKey: month }, { $inc: { monthUsedCredits: run } }, { new: true }).lean<any>();
      }
      if (!counted) return;
      const account = toAccount(counted);
      const spend = topupSpend(includedCredits(settings, space, account, now), Math.max(0, counted.monthUsedCredits - run), run);
      if (spend > 0 && account.topupCredits > 0) {
        await SpaceAccountModel.updateOne({ spaceKey: key }, [{ $set: { topupCredits: { $max: [0, { $subtract: ["$topupCredits", spend] }] } } }]);
      }
    } catch (error) {
      console.warn(`[billing] could not charge a run of project ${projectId}:`, error instanceof Error ? error.message : error);
    }
  }
}

function toAccount(a: any): SpaceAccount {
  // Accounts saved by the first version had seats without a plan: those are Team accounts.
  const plan = a.plan ?? (a.seats > 0 ? "team" : "free");
  return { spaceKey: a.spaceKey, plan, seats: a.seats ?? 0, validUntil: a.validUntil ?? null, topupCredits: a.topupCredits ?? 0, period: a.period ?? undefined, remindedFor: a.remindedFor ?? null,
    nextSeats: a.nextSeats ?? null, pendingSeats: a.pendingSeats ?? null, pendingFrom: a.pendingFrom ?? null, cycleAdjust: a.cycleAdjust?.month ? { month: a.cycleAdjust.month, credits: a.cycleAdjust.credits ?? 0 } : null,
    segments: Array.isArray(a.segments) ? a.segments.map((s: any) => ({ start: new Date(s.start), end: new Date(s.end), period: s.period, seats: s.seats, unitVnd: s.unitVnd, orderId: s.orderId })) : [] };
}
