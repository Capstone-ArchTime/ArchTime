import { randomUUID } from "node:crypto";
import type { IOrder } from "../../domain/billing/billing.js";
import { describeOrder } from "../../domain/billing/billing.js";
import {
  momoCreateBody, momoQueryBody, vnpayPayUrl, vnpayQueryBody,
  type MomoKeys, type VnpayKeys,
} from "../../domain/billing/signatures.js";
import type { GatewayResult, PaymentGateway } from "../../application/use-cases/billing/BillingUseCases.js";

/** VNPay expects an IPv4 address: "::1" and IPv4-mapped IPv6 ("::ffff:1.2.3.4") are written as IPv4. */
export const ipv4 = (ip: string) => (!ip || ip === "::1" ? "127.0.0.1" : ip.replace(/^::ffff:/i, ""));

/**
 * Order text both gateways show (MoMo signs it as sent): letters, digits and single spaces only. VNPay asks for no
 * accents or special characters, and its firewall blocks requests whose description has brackets and the like.
 */
export const orderInfo = (order: IOrder) => `ArchTime ${order.orderId} ${describeOrder(order)}`
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

async function postJson(url: string, body: unknown, timeoutMs = 15_000): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`gateway answered ${res.status}: ${text.slice(0, 200)}`); }
}

/** MoMo Payment Gateway v2 (captureWallet). Sandbox: https://test-payment.momo.vn. */
export class MomoGateway implements PaymentGateway {
  /** captureWallet accepts 1,000 to 50,000,000 VND per transaction. */
  readonly limits = { minVnd: 1_000, maxVnd: 50_000_000 };
  constructor(private readonly keys: MomoKeys, private readonly endpoint: string, private readonly ipnUrl: string) {}

  async create(order: IOrder, ctx: { returnUrl: string }) {
    const body = momoCreateBody(this.keys, {
      orderId: order.orderId, requestId: randomUUID(), amount: order.amountVnd, orderInfo: orderInfo(order), redirectUrl: ctx.returnUrl, ipnUrl: this.ipnUrl,
    });
    const r = await postJson(`${this.endpoint}/v2/gateway/api/create`, body);
    if (Number(r?.resultCode) !== 0 || !r?.payUrl) throw new Error(`MoMo refused the order: ${r?.resultCode} ${r?.message ?? ""}`);
    return { payUrl: String(r.payUrl) };
  }

  async query(order: IOrder): Promise<GatewayResult> {
    const r = await postJson(`${this.endpoint}/v2/gateway/api/query`, momoQueryBody(this.keys, order.orderId, randomUUID()));
    const code = Number(r?.resultCode);
    if (code === 0) return { status: "paid", gatewayTxnId: String(r.transId ?? ""), amountVnd: Number(r.amount) };
    // 1000: waiting for the user; 7000/7002: being processed; 9000: authorized, not captured yet.
    if ([1000, 7000, 7002, 9000].includes(code)) return { status: "pending" };
    return { status: "failed", reason: `MoMo ${code} ${r?.message ?? ""}`.trim() };
  }
}

/** VNPay 2.1.0. Sandbox: https://sandbox.vnpaytest.vn. */
export class VnpayGateway implements PaymentGateway {
  /** VNPay accepts 5,000 VND up to (not including) 1 billion VND per transaction. */
  readonly limits = { minVnd: 5_000, maxVnd: 999_999_999 };
  constructor(private readonly keys: VnpayKeys, private readonly payUrl: string, private readonly apiUrl: string) {}

  async create(order: IOrder, ctx: { ipAddr: string; returnUrl: string }) {
    return {
      payUrl: vnpayPayUrl(this.keys, this.payUrl, {
        orderId: order.orderId, amountVnd: order.amountVnd, orderInfo: orderInfo(order), returnUrl: ctx.returnUrl, ipAddr: ipv4(ctx.ipAddr),
        createdAt: order.createdAt, expiresAt: order.expiresAt,
      }),
    };
  }

  async query(order: IOrder): Promise<GatewayResult> {
    const r = await postJson(this.apiUrl, vnpayQueryBody(this.keys, {
      requestId: randomUUID().replace(/-/g, "").slice(0, 32), orderId: order.orderId, orderInfo: orderInfo(order), transactionDate: order.createdAt, ipAddr: "127.0.0.1", now: new Date(),
    }));
    if (r?.vnp_ResponseCode !== "00") return { status: "pending" };
    if (r.vnp_TransactionStatus === "00") return { status: "paid", gatewayTxnId: String(r.vnp_TransactionNo ?? ""), amountVnd: Number(r.vnp_Amount) / 100 };
    if (r.vnp_TransactionStatus === "01") return { status: "pending" };
    return { status: "failed", reason: `VNPay status ${r.vnp_TransactionStatus}` };
  }
}

/**
 * A stand-in gateway for development and demos without merchant accounts (BILLING_SIMULATOR=true). Its pay page is part
 * of the web client; the buyer's choice there goes through the same settlement as a real gateway's notification. Never
 * enabled when NODE_ENV is production.
 */
export class SimulatorGateway implements PaymentGateway {
  constructor(private readonly webUrl: string) {}
  async create(order: IOrder) {
    return { payUrl: `${this.webUrl}/billing/simulator?orderId=${encodeURIComponent(order.orderId)}&amount=${order.amountVnd}` };
  }
  async query(): Promise<GatewayResult> { return { status: "pending" }; }
}
