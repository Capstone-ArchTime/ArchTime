import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, addMonths, applyOrder, creditStatus, emptyAccount, limitsOf, monthStart, needsReminder, quote, scheduleNextSeats, topupSpend, validateSettings, BillingRuleError,
} from "../src/domain/billing/billing.ts";
import {
  momoCreateBody, momoResultSignature, momoResultValid, hmacHex, vnpayPayUrl, vnpaySignData, vnpayValid, vnpayDate,
} from "../src/domain/billing/signatures.ts";
import { BillingUseCases } from "../src/application/use-cases/billing/BillingUseCases.ts";
import { BillingController } from "../src/presentation/controllers/BillingController.ts";
import { OnboardingPathUseCases } from "../src/application/use-cases/onboarding/OnboardingPathUseCases.ts";
import { OrganizationUseCases } from "../src/application/use-cases/organizations/OrganizationUseCases.ts";

const NOW = new Date("2026-11-27T03:00:00Z");
const org = { kind: "organization", organizationId: "acme" };
const personal = { kind: "personal", userId: "u1" };
const team = (seats, until) => ({ spaceKey: "org:acme", plan: "team", seats, validUntil: until, topupCredits: 0 });
const pro = until => ({ spaceKey: "user:u1", plan: "pro", seats: 0, validUntil: until, topupCredits: 0 });
const S = DEFAULT_SETTINGS;

test("plans: Pro for a person, Team per member for an organization, renewals extend from the end date (FE-17)", () => {
  const p = quote(S, personal, { kind: "plan", period: "year" }, null, NOW);
  assert.deepEqual([p.plan, p.amountVnd, p.validUntil.toISOString()], ["pro", 790_000, "2027-11-27T03:00:00.000Z"]);
  const renew = quote(S, personal, { kind: "plan", period: "month" }, pro(new Date("2026-12-10T00:00:00Z")), NOW);
  assert.equal(renew.validUntil.toISOString(), "2027-01-10T00:00:00.000Z");
  assert.throws(() => quote(S, personal, { kind: "plan" }, null, NOW), /monthly or yearly/);

  assert.equal(quote(S, org, { kind: "plan", period: "month", seats: 4 }, null, NOW).amountVnd, 4 * 59_000);
  assert.equal(quote(S, org, { kind: "plan", period: "month", seats: 1 }, null, NOW).amountVnd, 59_000);   // one seat is enough (policy v1)
  assert.throws(() => quote(S, org, { kind: "plan", period: "month", seats: 0 }, null, NOW), BillingRuleError);
  assert.throws(() => quote(S, org, { kind: "plan", period: "month", seats: 4 }, null, NOW, 6), /has 6 members/); // fewer than the members
  // renewing a running Team plan keeps its seats, whatever was asked
  const r = quote(S, org, { kind: "plan", period: "year", seats: 9 }, team(5, new Date("2026-12-27T03:00:00Z")), NOW);
  assert.deepEqual([r.seats, r.amountVnd], [5, 5 * 590_000]);
  // adding members to a running plan: 30 days left = one month per member
  assert.equal(quote(S, org, { kind: "add-seats", seats: 2 }, team(5, new Date("2026-12-27T03:00:00Z")), NOW).amountVnd, 118_000);
  assert.throws(() => quote(S, org, { kind: "add-seats", seats: 2 }, null, NOW), /running/);
  // a yearly plan adds members at the yearly rate: 1 × 395 days × 590,000 / 365 = 638,493 → 639,000
  const yearlyAdd = quote(S, org, { kind: "add-seats", seats: 1 }, { ...team(5, new Date(NOW.getTime() + 395 * 86_400_000)), period: "year" }, NOW);
  assert.deepEqual([yearlyAdd.amountVnd, yearlyAdd.breakdown.days, yearlyAdd.breakdown.perDays, yearlyAdd.breakdown.creditsPerMonth], [639_000, 395, 365, 1500]);
  assert.deepEqual([quote(S, personal, { kind: "topup", packs: 3 }, null, NOW).amountVnd, quote(S, personal, { kind: "topup", packs: 3 }, null, NOW).credits], [147_000, 3000]);
  assert.throws(() => quote(S, personal, { kind: "topup", packs: 0 }, null, NOW), /1 to 20/);
  const t = quote(S, personal, { kind: "topup" }, null, NOW);
  assert.deepEqual([t.amountVnd, t.credits], [49_000, 1_000]);
});

test("credit is whole credits: included first, then top-up; limits follow the plan", () => {
  // 0.30 USD at 0.002 USD a credit = 150 credits
  const free = creditStatus(S, personal, null, 0.3, NOW);
  assert.deepEqual([free.plan, free.included, free.used, free.includedLeft, free.available], ["free", 200, 150, 50, 50]);
  const t = creditStatus(S, org, { ...team(3, new Date("2027-01-01")), topupCredits: 400 }, 10, NOW);
  assert.deepEqual([t.plan, t.included, t.used, t.includedLeft, t.topup, t.available], ["team", 4500, 5000, 0, 400, 400]);
  assert.equal(creditStatus(S, org, team(3, new Date("2026-11-01")), 0, NOW).plan, "free");   // expired → Free
  assert.equal(creditStatus(S, personal, pro(new Date("2027-01-01")), 0, NOW).included, 3000);
  assert.equal(topupSpend(200, 180, 50), 30);
  assert.equal(topupSpend(200, 250, 50), 50);
  assert.equal(topupSpend(200, 10, 50), 0);
  assert.deepEqual(limitsOf(S, personal, null, NOW), { workspaces: 3, members: null });
  assert.deepEqual(limitsOf(S, personal, pro(new Date("2027-01-01")), NOW), { workspaces: null, members: null });
  assert.deepEqual(limitsOf(S, org, null, NOW), { workspaces: null, members: 3 });
  assert.deepEqual(limitsOf(S, org, team(8, new Date("2027-01-01")), NOW), { workspaces: null, members: 8 });
  assert.equal(monthStart(new Date("2026-11-30T18:00:00Z")).toISOString(), "2026-11-30T17:00:00.000Z"); // 1 Dec 00:00 in Vietnam
});

test("applying an order starts or extends the plan, adds members or adds top-up credit", () => {
  const until = new Date("2026-12-27T03:00:00Z");
  assert.equal(applyOrder(team(4, until), { kind: "plan", plan: "team", period: "month", seats: 4 }, NOW).validUntil.toISOString(), addMonths(until, 1).toISOString());
  const fresh = applyOrder(emptyAccount("org:acme"), { kind: "plan", plan: "team", period: "year", seats: 5 }, NOW);
  assert.deepEqual([fresh.plan, fresh.seats, fresh.validUntil.toISOString()], ["team", 5, "2027-11-27T03:00:00.000Z"]);
  assert.equal(applyOrder(team(4, until), { kind: "add-seats", seats: 2 }, NOW).seats, 6);
  assert.equal(applyOrder(emptyAccount("user:u1"), { kind: "topup", credits: 1000 }, NOW).topupCredits, 1000);
  assert.equal(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString(), "2026-02-28T00:00:00.000Z");
});

test("settings are validated before they are saved; older documents are filled with defaults", () => {
  assert.throws(() => validateSettings({ pro: { monthVnd: 10 } }, S), /pro.monthVnd/);
  assert.throws(() => validateSettings({ team: { minSeats: 0 } }, S), /team.minSeats/);
  const merged = validateSettings({ seatPriceVnd: 1, pro: { credits: 5000 } }, S);
  assert.equal(merged.pro.credits, 5000);
  assert.equal(merged.pro.monthVnd, 79_000);
  assert.equal(merged.team.creditsPerSeat, 1500);
});

const MOMO = { partnerCode: "MOMOTEST", accessKey: "ak", secretKey: "sk" };
const VNP = { tmnCode: "TMN01", hashSecret: "SECRETKEY" };

test("MoMo: create signature follows the documented field order; IPN signatures are checked", () => {
  const body = momoCreateBody(MOMO, { orderId: "AT1", requestId: "r1", amount: 99000, orderInfo: "Team", redirectUrl: "http://w/r", ipnUrl: "http://a/ipn" });
  const raw = "accessKey=ak&amount=99000&extraData=&ipnUrl=http://a/ipn&orderId=AT1&orderInfo=Team&partnerCode=MOMOTEST&redirectUrl=http://w/r&requestId=r1&requestType=captureWallet";
  assert.equal(body.signature, hmacHex("sha256", "sk", raw));
  const ipn = { partnerCode: "MOMOTEST", orderId: "AT1", requestId: "r1", amount: 99000, orderInfo: "Team", orderType: "momo_wallet", transId: 123, resultCode: 0, message: "Successful.", payType: "qr", responseTime: 1, extraData: "" };
  const signed = { ...ipn, signature: momoResultSignature(MOMO, ipn) };
  assert.ok(momoResultValid(MOMO, signed));
  assert.ok(!momoResultValid(MOMO, { ...signed, amount: 1 }));
});

test("VNPay: parameters are sorted and encoded before hashing; the returned hash is checked", () => {
  const url = vnpayPayUrl(VNP, "https://sandbox/pay", { orderId: "AT1", amountVnd: 129000, orderInfo: "Credit pack S", returnUrl: "http://w/r", ipAddr: "1.2.3.4", createdAt: NOW, expiresAt: NOW });
  const params = Object.fromEntries(new URL(url).searchParams);
  assert.equal(params.vnp_Amount, "12900000");
  assert.equal(params.vnp_CreateDate, vnpayDate(NOW));
  assert.equal(vnpayDate(NOW), "20261127100000");
  assert.ok(vnpaySignData(params).startsWith("vnp_Amount=12900000&vnp_Command=pay"));
  assert.ok(vnpaySignData(params).includes("vnp_OrderInfo=Credit+pack+S"));
  assert.ok(vnpayValid(VNP, params));
  assert.ok(!vnpayValid(VNP, { ...params, vnp_Amount: "100" }));
});


// ── use cases with in-memory stores ──

function fakeDeps(overrides = {}) {
  const orders = new Map();
  const accounts = new Map();
  let settings = { ...DEFAULT_SETTINGS };
  const mails = [];
  const gatewayCalls = [];
  const deps = {
    orders: {
      async create(o) { const order = { ...o, id: o.orderId }; orders.set(o.orderId, order); return { ...order }; },
      async find(id) { return orders.has(id) ? { ...orders.get(id) } : null; },
      async setPayUrl(id, payUrl) { orders.get(id).payUrl = payUrl; },
      async markPaid(id, amount, txn, at) {
        const o = orders.get(id);
        if (!o || o.status === "paid" || o.amountVnd !== amount) return null;
        Object.assign(o, { status: "paid", paidAt: at, gatewayTxnId: txn });
        return { ...o };
      },
      async markStatus(id, from, to, reason) { const o = orders.get(id); if (!o || o.status !== from) return false; o.status = to; o.failureReason = reason; return true; },
      async markApplied(id, at) { orders.get(id).appliedAt = at; },
      async markReceipt(id, at) { orders.get(id).receiptSentAt = at; },
      async listBySpace() { return [...orders.values()]; },
      async pendingBefore(before) { return [...orders.values()].filter(o => o.status === "pending" && o.createdAt <= before).map(o => ({ ...o })); },
      async paidNotApplied() { return [...orders.values()].filter(o => o.status === "paid" && !o.appliedAt).map(o => ({ ...o })); },
      async list(f, page, limit) {
        const key = o => (o.space.kind === "organization" ? `org:${o.space.organizationId}` : `user:${o.space.userId}`);
        const all = [...orders.values()].filter(o => (!f.spaceKey || key(o) === f.spaceKey) && (!f.status || o.status === f.status) && (!f.from || o.createdAt >= f.from) && (!f.to || o.createdAt <= f.to))
          .sort((a, b) => b.createdAt - a.createdAt);
        return { orders: all.slice((page - 1) * limit, page * limit), total: all.length };
      },
    },
    accounts: {
      async get(k) { return accounts.get(k) ?? null; },
      async save(a) { accounts.set(a.spaceKey, { ...a }); },
      async applyOnce(k, orderId, mutate) { const a = accounts.get(k) ?? { spaceKey: k, plan: "free", seats: 0, validUntil: null, topupCredits: 0, applied: [] }; if ((a.applied ?? []).includes(orderId)) return false; accounts.set(k, { ...mutate(a), applied: [...(a.applied ?? []), orderId] }); return true; },
      async markReminded(k, d) { accounts.set(k, { ...accounts.get(k), remindedFor: d }); },
      async setNextSeats(k, s) { accounts.set(k, { ...accounts.get(k), nextSeats: s }); },
      async endingBefore(before) { return [...accounts.values()].filter(a => a.validUntil && a.validUntil <= before); },
    },
    settings: { async get() { return settings; }, async save(s) { settings = s; return s; } },
    gateways: {
      momo: {
        async create(order, ctx) { gatewayCalls.push(["create", order.orderId, ctx.returnUrl]); return { payUrl: `https://pay/${order.orderId}` }; },
        async query(order) { gatewayCalls.push(["query", order.orderId]); return overrides.query ?? { status: "pending" }; },
      },
    },
    usedThisMonth: async () => 0,
    usage: async () => overrides.usage ?? { workspaces: 0, members: 2 },
    requireOrganizationOwner: async (orgId, userId) => { if (userId !== "owner") throw new Error("Only organization owners can do this."); },
    isOrganizationMember: async (orgId, userId) => ["owner", "member"].includes(userId),
    organizationName: async () => "Acme",
    userContact: async () => ({ email: "owner@acme.io", name: "Olivia" }),
    billingContacts: async () => [{ email: "owner@acme.io", name: "Olivia" }],
    sendMail: async (to, mail) => { mails.push({ to, ...mail }); },
    returnUrl: "http://web/billing/result",
    billingUrl: "http://web/billing",
    now: () => overrides.now ?? NOW,
  };
  return { deps, orders, accounts, mails, gatewayCalls };
}

test("an order is settled once: a repeated or wrong-amount notification changes nothing; a receipt is e-mailed", async () => {
  const { deps, accounts, mails, gatewayCalls } = fakeDeps();
  const billing = new BillingUseCases(deps);
  await assert.rejects(billing.createOrder("member", org, { kind: "plan", period: "month", seats: 3, gateway: "momo" }, "1.1.1.1"), /owners/);
  await assert.rejects(billing.createOrder("owner", org, { kind: "plan", period: "month", seats: 3, gateway: "vnpay" }, "1.1.1.1"), /not available/);
  const { order, payUrl } = await billing.createOrder("owner", org, { kind: "plan", period: "month", seats: 3, gateway: "momo" }, "1.1.1.1");
  assert.equal(order.amountVnd, 177_000);
  assert.equal(payUrl, `https://pay/${order.orderId}`);
  assert.equal(gatewayCalls[0][2], `http://web/billing/result?orderId=${order.orderId}`);

  assert.equal(await billing.settle(order.orderId, { status: "paid", amountVnd: 1000, gatewayTxnId: "t" }), "amount-mismatch");
  assert.equal(await billing.settle(order.orderId, { status: "paid", amountVnd: 177_000, gatewayTxnId: "t1" }), "paid");
  assert.equal(await billing.settle(order.orderId, { status: "paid", amountVnd: 177_000, gatewayTxnId: "t1" }), "ignored");
  assert.equal(await billing.settle("missing", { status: "paid", amountVnd: 1 }), "not-found");
  const acc = accounts.get("org:acme");
  assert.deepEqual([acc.plan, acc.seats, acc.validUntil.toISOString()], ["team", 3, "2026-12-27T03:00:00.000Z"]);
  assert.equal(mails.length, 1);
  assert.match(mails[0].text, /177,000 VND/);

  const view = await billing.overview(org, "owner");
  assert.deepEqual([view.credit.plan, view.credit.included, view.limits.members, view.canBuy], ["team", 4500, 3, true]);
  assert.equal((await billing.overview(org, "member")).canBuy, false);
  await assert.rejects(billing.parseSpace({ kind: "organization", organizationId: "acme" }, "stranger"), /not found/);
});

test("reconciliation settles what the gateway reports, expires abandoned orders, finishes interrupted ones and reminds once", async () => {
  const later = new Date(NOW.getTime() + 60 * 60_000);
  const paidCase = fakeDeps({ query: { status: "paid", amountVnd: 49_000, gatewayTxnId: "q1" } });
  const billing = new BillingUseCases(paidCase.deps);
  const { order } = await billing.createOrder("u1", personal, { kind: "topup", gateway: "momo" }, "1.1.1.1");
  assert.equal((await new BillingUseCases({ ...paidCase.deps, now: () => later }).reconcile()).paid, 1);
  assert.equal(paidCase.accounts.get("user:u1").topupCredits, 1000);
  assert.equal(paidCase.orders.get(order.orderId).status, "paid");

  const stale = fakeDeps();
  const b2 = new BillingUseCases(stale.deps);
  const { order: o2 } = await b2.createOrder("u1", personal, { kind: "topup", gateway: "momo" }, "1.1.1.1");
  assert.equal((await new BillingUseCases({ ...stale.deps, now: () => later }).reconcile()).expired, 1);
  assert.equal(stale.orders.get(o2.orderId).status, "expired");

  const interrupted = fakeDeps();
  const b3 = new BillingUseCases(interrupted.deps);
  const { order: o3 } = await b3.createOrder("u1", personal, { kind: "plan", period: "month", gateway: "momo" }, "1.1.1.1");
  Object.assign(interrupted.orders.get(o3.orderId), { status: "paid", paidAt: NOW });   // paid, but applying never ran
  assert.equal((await b3.reconcile()).applied, 1);
  assert.equal(interrupted.accounts.get("user:u1").plan, "pro");
  // applying the same order again (a crash before it was marked applied) changes nothing
  await b3.apply({ ...interrupted.orders.get(o3.orderId), appliedAt: null });
  assert.equal(interrupted.accounts.get("user:u1").validUntil.toISOString(), "2026-12-27T03:00:00.000Z");
  // an order closed as expired still becomes paid when the gateway confirms the payment later
  assert.equal(await new BillingUseCases(stale.deps).settle(o2.orderId, { status: "paid", amountVnd: 49_000, gatewayTxnId: "late" }), "paid");
  assert.equal(stale.accounts.get("user:u1").topupCredits, 1000);

  const ending = fakeDeps();
  ending.accounts.set("user:u1", pro(new Date(NOW.getTime() + 3 * 86_400_000)));
  const b4 = new BillingUseCases(ending.deps);
  assert.equal((await b4.reconcile()).reminded, 1);
  assert.equal((await b4.reconcile()).reminded, 0);   // once per end date
  assert.match(ending.mails[0].subject, /Pro plan ends on/);
  assert.ok(!needsReminder(ending.accounts.get("user:u1"), NOW));
});

test("purchased credit outlives the plan; monthly credit follows the month; seat limits hold", () => {
  // Team ended: monthly credit falls back to Free, top-up credit stays
  const ended = creditStatus(S, org, { ...team(4, new Date("2026-11-01")), topupCredits: 1000 }, 0, NOW);
  assert.deepEqual([ended.plan, ended.included, ended.topup, ended.available], ["free", 300, 1000, 1300]);
  // usage counts from the start of the month (Vietnam time): a run on 30 Nov 23:00 belongs to November, 1 Dec 01:00 to December
  assert.equal(monthStart(new Date("2026-11-30T16:00:00Z")).toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(monthStart(new Date("2026-11-30T18:00:00Z")).toISOString(), "2026-11-30T17:00:00.000Z");
  // a Team plan cannot be bought for fewer seats than the members it has, nor members added past 500
  assert.throws(() => quote(S, org, { kind: "plan", period: "month", seats: 5 }, null, NOW, 7), /has 7 members/);
  assert.throws(() => quote(S, org, { kind: "add-seats", seats: 2 }, team(499, new Date("2027-01-01")), NOW), /500/);
  assert.throws(() => quote(S, org, { kind: "add-seats", seats: 0 }, team(4, new Date("2027-01-01")), NOW), BillingRuleError);
});

test("payment history: only for the people who may buy, filtered by status and date, newest first", async () => {
  const { deps, orders } = fakeDeps();
  const billing = new BillingUseCases(deps);
  const a = await billing.createOrder("owner", org, { kind: "plan", period: "month", seats: 3, gateway: "momo" }, "1.1.1.1");
  const b = await new BillingUseCases({ ...deps, now: () => new Date("2026-11-28T03:00:00Z") }).createOrder("owner", org, { kind: "topup", gateway: "momo" }, "1.1.1.1");
  await billing.settle(a.order.orderId, { status: "paid", amountVnd: 177_000, gatewayTxnId: "T1" });
  await billing.createOrder("u1", personal, { kind: "topup", gateway: "momo" }, "1.1.1.1"); // another space
  const all = await billing.spaceOrders(org, "owner", {});
  assert.deepEqual(all.orders.map(o => o.orderId), [b.order.orderId, a.order.orderId]);
  assert.equal(all.orders[1].gatewayTxnId, "T1");
  assert.deepEqual((await billing.spaceOrders(org, "owner", { status: "paid" })).orders.map(o => o.orderId), [a.order.orderId]);
  assert.deepEqual((await billing.spaceOrders(org, "owner", { from: "2026-11-28" })).orders.map(o => o.orderId), [b.order.orderId]);
  assert.deepEqual((await billing.spaceOrders(org, "owner", { to: "2026-11-27" })).orders.map(o => o.orderId), [a.order.orderId]);
  await assert.rejects(billing.spaceOrders(org, "member", {}), /owners/);
  await assert.rejects(billing.spaceOrders(org, "owner", { from: "nope" }), /date/);
  assert.equal(orders.size, 3);
});

test("a failed payment changes nothing, and a failure reported after payment is ignored", async () => {
  const { deps, accounts, orders } = fakeDeps();
  const billing = new BillingUseCases(deps);
  const { order } = await billing.createOrder("u1", personal, { kind: "topup", gateway: "momo" }, "1.1.1.1");
  assert.equal(await billing.settle(order.orderId, { status: "failed", reason: "cancelled" }), "failed");
  assert.equal(accounts.get("user:u1"), undefined);
  assert.equal(orders.get(order.orderId).status, "failed");
  const second = await billing.createOrder("u1", personal, { kind: "topup", gateway: "momo" }, "1.1.1.1");
  await billing.settle(second.order.orderId, { status: "paid", amountVnd: 49_000, gatewayTxnId: "T2" });
  assert.equal(await billing.settle(second.order.orderId, { status: "failed", reason: "late" }), "ignored");
  assert.deepEqual([orders.get(second.order.orderId).status, accounts.get("user:u1").topupCredits], ["paid", 1000]);
});

test("the page offers renewal only once a paid plan has ended", async () => {
  const running = fakeDeps();
  running.accounts.set("user:u1", pro(new Date(NOW.getTime() + 3 * 86_400_000)));
  assert.equal((await new BillingUseCases(running.deps).overview(personal, "u1")).ended, null);
  const ended = fakeDeps();
  ended.accounts.set("org:acme", team(5, new Date("2026-11-20T00:00:00Z")));
  const view = await new BillingUseCases(ended.deps).overview(org, "owner");
  assert.deepEqual([view.credit.plan, view.ended.plan, view.ended.seats, view.ended.endedAt.toISOString()], ["free", "team", 5, "2026-11-20T00:00:00.000Z"]);
  assert.equal((await new BillingUseCases(fakeDeps().deps).overview(personal, "u1")).ended, null);   // never paid
});
test("Pricing Policy v1: prices, one-seat minimum, proration by actual days, prorated seat credit, seat changes at renewal", () => {
  // prices
  assert.equal(S.team.minSeats, 1);
  assert.deepEqual([S.organizationFree.members, S.organizationFree.credits], [3, 300]);
  assert.deepEqual([S.team.seatMonthVnd, S.team.seatYearVnd, S.team.creditsPerSeat], [59_000, 590_000, 1_500]);
  assert.deepEqual([S.topup.credits, S.topup.priceVnd], [1_000, 49_000]);
  assert.equal(quote(S, org, { kind: "plan", period: "year", seats: 1 }, null, NOW).amountVnd, 590_000);
  // credits: shared per workspace, 1,500 per paid seat, monthly also on a yearly plan
  assert.equal(creditStatus(S, org, null, 0, NOW).included, 300);
  assert.equal(creditStatus(S, org, team(1, new Date("2027-01-01")), 0, NOW).included, 1500);
  assert.equal(creditStatus(S, org, { ...team(4, new Date("2027-11-27")), period: "year" }, 0, NOW).included, 6000);
  // monthly proration by the actual days of the period: November 27 → December 27 is 30 days
  const monthly = { ...team(4, new Date("2026-12-27T03:00:00Z")), period: "month" };
  const q1 = quote(S, org, { kind: "add-seats", seats: 1 }, monthly, NOW);
  assert.deepEqual([q1.breakdown.days, q1.breakdown.perDays, q1.amountVnd], [30, 30, 59_000]);
  // yearly proration uses the yearly price and the year's actual length: a period ending 2028-03-01 holds 29 Feb 2028 (366 days)
  const leap = { ...team(4, new Date("2028-03-01T00:00:00Z")), period: "year" };
  const q2 = quote(S, org, { kind: "add-seats", seats: 1 }, leap, NOW);
  assert.equal(q2.breakdown.perDays, 366);
  assert.equal(q2.breakdown.unitVnd, 590_000);
  assert.equal(q2.amountVnd, Math.ceil(590_000 * q2.breakdown.days / 366 / 1000) * 1000);
  assert.ok(q2.amountVnd < 590_000 * 1.3);
  // a seat added on 27 November (VN time) gets 4 of 30 days of this cycle's credit, the full 1,500 from December
  const added = applyOrder(monthly, { kind: "add-seats", seats: 1 }, NOW, S);
  assert.equal(added.seats, 5);
  assert.equal(creditStatus(S, org, added, 0, NOW).included, 6000 + 200);
  assert.equal(creditStatus(S, org, added, 0, new Date("2026-12-05T00:00:00Z")).included, 7500);
  // fewer seats at renewal: an early renewal with 2 seats keeps 4 until the paid period ends, then 2
  const renewed = applyOrder({ ...monthly, nextSeats: 2 }, { kind: "plan", plan: "team", period: "month", seats: 2 }, NOW, S);
  assert.deepEqual([creditStatus(S, org, renewed, 0, NOW).seats, renewed.validUntil.toISOString()], [4, "2027-01-27T03:00:00.000Z"]);
  assert.equal(creditStatus(S, org, renewed, 0, new Date("2026-12-28T00:00:00Z")).seats, 2);
  assert.equal(limitsOf(S, org, renewed, new Date("2026-12-28T00:00:00Z")).members, 2);
  // the renewal quote uses the seats chosen for the next renewal, but never fewer than the members
  assert.equal(quote(S, org, { kind: "plan", period: "month" }, { ...monthly, nextSeats: 2 }, NOW, 2).seats, 2);
  assert.throws(() => quote(S, org, { kind: "plan", period: "month" }, { ...monthly, nextSeats: 2 }, NOW, 3), /3 members/);
  assert.equal(scheduleNextSeats(S, monthly, 2, NOW).nextSeats, 2);
  assert.throws(() => scheduleNextSeats(S, null, 2, NOW), /running/);
});

test("seats are entitlements: members occupy them, a released seat is reused without a charge", async () => {
  const { deps } = fakeDeps({ usage: { workspaces: 0, members: 3 } });
  const four = fakeDeps({ usage: { workspaces: 0, members: 3 } });
  four.accounts.set("org:acme", { ...team(4, new Date("2026-12-27T03:00:00Z")), period: "month" });
  const view = await new BillingUseCases(four.deps).overview(org, "owner");
  assert.deepEqual(view.seats, { purchased: 4, occupied: 3, available: 1, next: null, pending: null });
  // a removed member frees a seat: the same 4 seats, 2 members → 2 available, nothing to buy
  const after = await new BillingUseCases({ ...four.deps, usage: async () => ({ workspaces: 0, members: 2 }) }).overview(org, "owner");
  assert.equal(after.seats.available, 2);
  // a client cannot set its own price: amountVnd in the request is ignored
  const { order } = await new BillingUseCases(deps).createOrder("owner", org, { kind: "plan", period: "month", seats: 3, amountVnd: 1, gateway: "momo" }, "1.1.1.1");
  assert.equal(order.amountVnd, 177_000);
  // owners set the seats of the next renewal; members cannot
  const b = new BillingUseCases(four.deps);
  assert.deepEqual((await b.setNextSeats(org, "owner", 3)).next, 3);
  await assert.rejects(b.setNextSeats(org, "member", 3), /owners/);
  await assert.rejects(b.setNextSeats(org, "owner", 0), /1 to 500/);
});
/** In-memory organization store plus a seat gate that behaves like AiCreditService.reserveSeat (one holder at a time). */
function seatFixture(seats, ttlMs = 7 * 86_400_000) {
  const members = [{ id: "m-owner", organizationId: "acme", userId: "owner", role: "owner", status: "active", createdAt: new Date() }];
  const users = { findByEmail: async email => ({ id: email.split("@")[0], name: email, email }) };
  const organizations = {
    findById: async id => ({ id, name: "Acme", createdBy: "owner" }),
    findByIds: async ids => ids.map(id => ({ id, name: "Acme", createdBy: "owner" })),
    findMember: async (org, userId) => members.find(m => m.userId === userId && m.status === "active") ?? null,
    findMemberOrInvitation: async (org, userId) => members.find(m => m.userId === userId) ?? null,
    listInvitationsOfUser: async userId => members.filter(m => m.userId === userId && m.status === "invited"),
    addMember: async data => { await new Promise(r => setTimeout(r, 5)); const m = { id: `m-${data.userId}`, createdAt: new Date(), ...data }; members.push(m); return m; },
    removeMember: async id => { const i = members.findIndex(m => m.id === id); if (i >= 0) members.splice(i, 1); return i >= 0; },
    activateMember: async id => { const m = members.find(x => x.id === id); if (m) m.status = "active"; return m; },
  };
  const live = () => members.filter(m => m.status !== "invited" || Date.now() - m.createdAt.getTime() <= ttlMs).length;
  let lock = Promise.resolve();
  const reserveSeat = (org, insert) => {
    const run = lock.then(async () => {
      if (live() >= seats) throw Object.assign(new Error(`All ${seats} seats are taken.`), { code: "PLAN_LIMIT_REACHED" });
      return insert();
    });
    lock = run.catch(() => {});
    return run;
  };
  const uc = new OrganizationUseCases(organizations, users, {}, {}, undefined, reserveSeat, ttlMs);
  return { uc, members, live };
}

test("two invitations at the same moment for one free seat: exactly one reserves it, the other is told no seat is free", async () => {
  const { uc, live } = seatFixture(2); // owner + 1 free seat
  const results = await Promise.allSettled([
    uc.addMember({ organizationId: "acme", userId: "owner", email: "ann@acme.io" }),
    uc.addMember({ organizationId: "acme", userId: "owner", email: "bob@acme.io" }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.match(results.find(r => r.status === "rejected").reason.message, /seats are taken/);
  assert.equal(live(), 2);
});

test("seat reservation: pending invitations hold a seat; declining or expiring releases it; accepting keeps it", async () => {
  const { uc, members, live } = seatFixture(3, 1_000);
  await uc.addMember({ organizationId: "acme", userId: "owner", email: "ann@acme.io" });
  await uc.addMember({ organizationId: "acme", userId: "owner", email: "bob@acme.io" });
  await assert.rejects(uc.addMember({ organizationId: "acme", userId: "owner", email: "cat@acme.io" }), /seats are taken/);
  await uc.respondToInvitation({ organizationId: "acme", userId: "ann", accept: true }).catch(() => {}); // stub may not return a summary
  assert.equal(members.find(m => m.userId === "ann").status, "active");
  await uc.respondToInvitation({ organizationId: "acme", userId: "bob", accept: false });
  assert.equal(live(), 2);
  await uc.addMember({ organizationId: "acme", userId: "owner", email: "cat@acme.io" }); // bob's seat was released
  members.find(m => m.userId === "cat").createdAt = new Date(Date.now() - 5_000); // cat's invitation expires
  assert.equal(live(), 2);
  assert.deepEqual(await uc.myInvitations("cat"), []);
  await assert.rejects(uc.respondToInvitation({ organizationId: "acme", userId: "cat", accept: true }), /expired/);
  assert.equal(members.some(m => m.userId === "cat"), false);
  await uc.addMember({ organizationId: "acme", userId: "owner", email: "dan@acme.io" }); // the expired seat is free again
  assert.equal(live(), 3);
});
function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve(this); }, end() { resolve(this); } };
    handler(req, res, reject);
  });
}

test("VNPay IPN answers with the codes VNPay expects, and only a valid signature settles", async () => {
  const { deps } = fakeDeps();
  const billing = new BillingUseCases(deps);
  const controller = new BillingController(billing, { vnpay: VNP, simulator: false });
  const { order } = await billing.createOrder("u1", personal, { kind: "topup", gateway: "momo" }, "1.1.1.1");
  const sign = q => ({ ...q, vnp_SecureHash: hmacHex("sha512", VNP.hashSecret, vnpaySignData(q)) });
  const base = { vnp_TmnCode: "TMN01", vnp_TxnRef: order.orderId, vnp_Amount: "4900000", vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_TransactionNo: "777" };
  assert.equal((await call(controller.vnpayIpn, { query: { ...sign(base), vnp_Amount: "1" } })).body.RspCode, "97");
  assert.equal((await call(controller.vnpayIpn, { query: sign({ ...base, vnp_Amount: "100" }) })).body.RspCode, "04");
  assert.equal((await call(controller.vnpayIpn, { query: sign({ ...base, vnp_TxnRef: "nope" }) })).body.RspCode, "01");
  assert.equal((await call(controller.vnpayIpn, { query: sign(base) })).body.RspCode, "00");
  assert.equal((await call(controller.vnpayIpn, { query: sign(base) })).body.RspCode, "02");
});



test("UC-34: onboarding progress of an organization sums every path of every workspace", async () => {
  const path = (id, projectId, steps) => ({ id, projectId, title: `Path ${id}`, status: "published", steps: steps.map(s => ({ id: s, kind: "component", title: s })) });
  const paths = { p1: [path("a", "p1", ["s1", "s2"])], p2: [path("b", "p2", ["t1"])], p3: [] };
  const done = (...ids) => Object.fromEntries(ids.map(i => [i, { completedAt: NOW }]));
  const assignments = {
    p1: [{ pathId: "a", userId: "carl", assignedAt: NOW, updatedAt: NOW, progress: done("s1") }, { pathId: "a", userId: "dan", assignedAt: NOW, updatedAt: NOW, progress: done("s1", "s2") }],
    p2: [{ pathId: "b", userId: "carl", assignedAt: NOW, updatedAt: NOW, progress: {} }],
  };
  const uc = new OnboardingPathUseCases(
    { list: async projectId => paths[projectId] ?? [] },
    { listByPaths: async projectId => assignments[projectId] ?? [] },
    { people: async ids => new Map(ids.map(id => [id, { name: id.toUpperCase(), email: `${id}@acme.io` }])) },
  );
  const r = await uc.organizationProgress([{ id: "p1", name: "acme-api" }, { id: "p2", name: "acme-web" }, { id: "p3", name: "empty" }]);
  assert.equal(r.workspaces.length, 2);
  assert.deepEqual(r.workspaces[0].paths[0], { pathId: "a", title: "Path a", status: "published", steps: 2, learners: 2, completed: 1, averagePercent: 75 });
  assert.deepEqual(r.totals, { workspaces: 2, paths: 2, people: 2, assignments: 3, completed: 1, averagePercent: 50 });
  assert.equal(r.learners[0].percent, 0);   // who is furthest behind comes first
  assert.equal(r.learners[0].name, "CARL");
});


test("billing segments: each paid period is recorded at its own price; add-seats per-segment only when the policy says so", () => {
  // A yearly Team plan of 2 seats bought on 2026-11-27 (590,000/seat), then a monthly renewal bought early (59,000/seat).
  let acct = { ...emptyAccount("org:acme"), plan: "free" };
  acct = applyOrder(acct, { kind: "plan", plan: "team", period: "year", seats: 2, orderId: "Y1", amountVnd: 1_180_000 }, NOW, S);
  acct = applyOrder(acct, { kind: "plan", plan: "team", period: "month", seats: 2, orderId: "M1", amountVnd: 118_000 }, NOW, S);
  assert.deepEqual(acct.segments.map(s => [s.orderId, s.period, s.unitVnd, s.seats]), [["Y1", "year", 590_000, 2], ["M1", "month", 59_000, 2]]);
  assert.equal(acct.validUntil.toISOString(), addMonths(addMonths(NOW, 12), 1).toISOString());
  assert.equal(acct.period, "month"); // the latest period bought: what today's latest-period proration reads
  const later = new Date("2027-05-27T03:00:00Z");
  const latest = quote(S, org, { kind: "add-seats", seats: 1 }, acct, later);
  const perSegment = quote({ ...S, seatProration: "per-segment" }, org, { kind: "add-seats", seats: 1 }, acct, later);
  assert.equal(latest.breakdown.segments, undefined);
  assert.equal(perSegment.breakdown.segments.length, 2);
  // per-segment: the rest of the year at the yearly rate + the whole month at the monthly rate
  const [y, m] = perSegment.breakdown.segments;
  const exact = 590_000 * y.days / y.totalDays + 59_000 * m.days / m.totalDays;
  assert.equal(perSegment.amountVnd, Math.max(1000, Math.ceil(exact / 1000) * 1000));
  assert.ok(perSegment.amountVnd !== latest.amountVnd, "the two policies give different prices for a mixed period");
  // a new plan after the old one ended starts a fresh segment list; legacy accounts without segments use latest-period
  const fresh = applyOrder({ ...acct, validUntil: new Date("2026-01-01") }, { kind: "plan", plan: "team", period: "month", seats: 1, orderId: "M2", amountVnd: 59_000 }, NOW, S);
  assert.deepEqual(fresh.segments.map(s => s.orderId), ["M2"]);
  const legacy = { ...team(2, new Date("2026-12-27T03:00:00Z")), period: "month" };
  assert.equal(quote({ ...S, seatProration: "per-segment" }, org, { kind: "add-seats", seats: 1 }, legacy, NOW).amountVnd, quote(S, org, { kind: "add-seats", seats: 1 }, legacy, NOW).amountVnd);
  assert.throws(() => validateSettings({ seatProration: "convert" }, S), /seatProration/);
});

test("orders record the catalog version they were priced with", async () => {
  const { deps } = fakeDeps();
  await deps.settings.save({ ...(await deps.settings.get()), version: 4 });
  const billing = new BillingUseCases(deps);
  const { order } = await billing.createOrder("u1", personal, { kind: "topup", gateway: "momo", amountVnd: 1 }, "1.1.1.1");
  assert.equal(order.amountVnd, 49_000); // the client's amount is ignored
  assert.equal((await deps.orders.find(order.orderId)).catalogVersion, 4);
});
test("real gateways: amounts outside a gateway's limits are refused before an order is created", async () => {
  const { deps } = fakeDeps();
  deps.gateways.momo.limits = { minVnd: 1_000, maxVnd: 50_000 };
  const billing = new BillingUseCases(deps);
  await assert.rejects(billing.createOrder("u1", personal, { kind: "topup", packs: 2, gateway: "momo" }, "1.1.1.1"), /accepts 1\.000 to 50\.000 VND/);
  assert.equal((await deps.orders.list({}, 1, 10)).total, 0);
  const { order } = await billing.createOrder("u1", personal, { kind: "topup", packs: 1, gateway: "momo" }, "1.1.1.1");
  assert.equal(order.amountVnd, 49_000);
});
test("gateway order text: letters, digits and single spaces only (VNPay rejects special characters)", async () => {
  const { orderInfo, ipv4 } = await import("../src/infrastructure/billing/gateways.ts");
  const text = orderInfo({ orderId: "AT1", kind: "topup", credits: 1000 });
  assert.match(text, /^[A-Za-z0-9 ]+$/);
  assert.match(text, /^ArchTime AT1 /);
  assert.deepEqual([ipv4("::1"), ipv4("::ffff:10.0.0.5"), ipv4("1.2.3.4")], ["127.0.0.1", "10.0.0.5", "1.2.3.4"]);
});
// ── payOS ──

test("payOS: a payment request signs amount, cancelUrl, description, orderCode and returnUrl, sorted; webhook data is checked", async () => {
  const { payosCreateBody, payosDataSignature, payosWebhookValid } = await import("../src/domain/billing/signatures.ts");
  const KEYS = { clientId: "c", apiKey: "a", checksumKey: "k" };
  const body = payosCreateBody(KEYS, { orderCode: 123, amount: 2000, description: "ArchTime", returnUrl: "http://web/r", cancelUrl: "http://web/c", expiredAt: 1 });
  assert.equal(body.signature, hmacHex("sha256", "k", "amount=2000&cancelUrl=http://web/c&description=ArchTime&orderCode=123&returnUrl=http://web/r"));
  // Webhook data: keys sorted, null as empty text.
  const data = { orderCode: 123, amount: 2000, reference: "FT1", counterAccountName: null, code: "00" };
  assert.equal(payosDataSignature(KEYS, data), hmacHex("sha256", "k", "amount=2000&code=00&counterAccountName=&orderCode=123&reference=FT1"));
  const signed = { code: "00", desc: "success", data, signature: payosDataSignature(KEYS, data) };
  assert.ok(payosWebhookValid(KEYS, signed));
  assert.ok(!payosWebhookValid(KEYS, { ...signed, data: { ...data, amount: 1 } }));
  assert.ok(!payosWebhookValid({ ...KEYS, checksumKey: "other" }, signed));
});

test("payOS: order ids carry a 15-digit numeric order code that fits payOS's integer limit", async () => {
  const { payosOrderId, payosOrderCode } = await import("../src/infrastructure/billing/gateways.ts");
  const id = payosOrderId(new Date("2026-11-28T12:00:00Z"), () => 0.123456);
  assert.equal(id, "AT179586720012345");
  assert.equal(payosOrderCode(id), 179586720012345);
  assert.ok(payosOrderCode(payosOrderId(new Date("2099-12-31T23:59:59Z"), () => 0.99999)) <= Number.MAX_SAFE_INTEGER);
});

function payosDeps(query = { status: "pending" }) {
  const env = fakeDeps();
  env.deps.gateways.payos = {
    newOrderId: (now) => `AT${Math.floor(now.getTime() / 1000)}00042`,
    async create(order) { return { payUrl: `https://pay.payos.vn/web/${order.orderId}` }; },
    async query() { return query; },
  };
  return env;
}

test("payOS webhook: only a valid signature settles, once, and every notification is answered 200", async () => {
  const { payosDataSignature } = await import("../src/domain/billing/signatures.ts");
  const KEYS = { clientId: "c", apiKey: "a", checksumKey: "k" };
  const { deps, mails } = payosDeps();
  const billing = new BillingUseCases(deps);
  const controller = new BillingController(billing, { payos: KEYS, simulator: false });
  const { order } = await billing.createOrder("u1", personal, { kind: "topup", gateway: "payos" }, "1.1.1.1");
  assert.match(order.orderId, /^AT\d{15}$/);
  const code = Number(order.orderId.slice(2));
  const webhook = (data, key = KEYS) => ({ body: { code: "00", desc: "success", success: true, data, signature: payosDataSignature(key, data) } });
  const paid = { orderCode: code, amount: 49_000, reference: "FT26332", code: "00", desc: "success" };

  const forged = await call(controller.payosWebhook, webhook(paid, { ...KEYS, checksumKey: "wrong" }));
  assert.equal(forged.statusCode, 200);
  assert.equal((await deps.orders.find(order.orderId)).status, "pending");
  await call(controller.payosWebhook, webhook({ ...paid, amount: 1_000 }));
  assert.equal((await deps.orders.find(order.orderId)).status, "pending", "a different amount is not a payment");
  // payOS's own test notification when the webhook URL is saved: an order code we never made.
  assert.equal((await call(controller.payosWebhook, webhook({ ...paid, orderCode: 123 }))).statusCode, 200);

  await call(controller.payosWebhook, webhook(paid));
  await call(controller.payosWebhook, webhook(paid));
  const settled = await deps.orders.find(order.orderId);
  assert.equal(settled.status, "paid");
  assert.equal(settled.gatewayTxnId, "FT26332");
  assert.equal(mails.length, 1, "one receipt, however many notifications");
  assert.match(mails[0].text, /Paid with: payOS/);
});

test("payOS return: the server asks payOS about the order; only the buyer may ask", async () => {
  const { deps } = payosDeps({ status: "paid", amountVnd: 49_000, gatewayTxnId: "FT1" });
  const billing = new BillingUseCases(deps);
  const controller = new BillingController(billing, { payos: { clientId: "c", apiKey: "a", checksumKey: "k" }, simulator: false });
  const { order } = await billing.createOrder("u1", personal, { kind: "topup", gateway: "payos" }, "1.1.1.1");
  await assert.rejects(billing.checkWithGateway("someone-else", order.orderId), /Order not found/);
  const res = await call(controller.payosReturn, { body: { orderId: order.orderId }, user: { userId: "u1" } });
  assert.equal(res.body.data.outcome, "paid");
  assert.equal((await deps.orders.find(order.orderId)).status, "paid");
  assert.equal((await billing.checkWithGateway("u1", order.orderId)).outcome, "ignored", "asking again changes nothing");
});
