import type { NextFunction, Request, Response } from "express";
import type { BillingUseCases } from "../../application/use-cases/billing/BillingUseCases.js";
import { momoResultValid, payosWebhookValid, vnpayValid, type MomoKeys, type MomoResult, type PayosKeys, type PayosWebhook, type VnpayKeys } from "../../domain/billing/signatures.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import { NotFoundError } from "../../shared/errors/AppError.js";

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export interface BillingKeys { momo?: MomoKeys; vnpay?: VnpayKeys; payos?: PayosKeys; simulator: boolean }

/** Plans, AI credit and payments (FE-17): buyers, gateway notifications and administrators. */
export class BillingController {
  constructor(private readonly billing: BillingUseCases, private readonly keys: BillingKeys) {}

  private async space(req: Request) {
    const src = req.method === "GET" ? req.query : req.body ?? {};
    return this.billing.parseSpace({ kind: src.space ?? src.kind, organizationId: src.organizationId }, req.user!.userId);
  }

  overview = wrap(async (req, res) => { sendSuccess(res, await this.billing.overview(await this.space(req), req.user!.userId)); });

  quote = wrap(async (req, res) => { sendSuccess(res, await this.billing.quote(await this.space(req), req.body ?? {})); });

  createOrder = wrap(async (req, res) => {
    const result = await this.billing.createOrder(req.user!.userId, await this.space(req), req.body ?? {}, req.ip ?? "127.0.0.1");
    sendSuccess(res, result, { statusCode: 201, message: "Order created" });
  });

  pricing = wrap(async (_req, res) => { sendSuccess(res, await this.billing.pricing()); });

  /** PUT /seats/next { space: "organization", organizationId, seats }: seats for the next renewal. */
  setNextSeats = wrap(async (req, res) => { sendSuccess(res, await this.billing.setNextSeats(await this.space(req), req.user!.userId, req.body?.seats)); });

  /** GET /orders?space=…&organizationId=…&status=…&from=YYYY-MM-DD&to=YYYY-MM-DD&page=… */
  listSpaceOrders = wrap(async (req, res) => {
    sendSuccess(res, await this.billing.spaceOrders(await this.space(req), req.user!.userId, req.query));
  });

  getOrder = wrap(async (req, res) => { sendSuccess(res, await this.billing.getOrder(req.user!.userId, String(req.params.orderId))); });

  /** The simulator's pay page reports the buyer's choice (development only). */
  simulate = wrap(async (req, res) => {
    if (!this.keys.simulator) throw new NotFoundError("Not found");
    const order = await this.billing.getOrder(req.user!.userId, String(req.params.orderId));
    if (order.gateway !== "simulator") throw new NotFoundError("Order not found.");
    const paid = req.body?.outcome === "paid";
    const outcome = await this.billing.settle(order.orderId, paid
      ? { status: "paid", amountVnd: order.amountVnd, gatewayTxnId: `SIM-${Date.now()}` }
      : { status: "failed", reason: "cancelled on the test gateway" });
    sendSuccess(res, { outcome, order: await this.billing.getOrder(req.user!.userId, order.orderId) });
  });

  // â”€â”€ gateways (no session: trusted only through their signatures) â”€â”€

  /** MoMo IPN: answer 204 whatever happens, so MoMo stops retrying a notification that was handled or is not ours. */
  momoIpn = wrap(async (req, res) => {
    const outcome = await this.handleMomo(req.body as MomoResult);
    console.log(`[billing] MoMo IPN received: order ${String((req.body as MomoResult)?.orderId ?? "-")} → ${outcome}`);
    res.status(204).end();
  });

  /** The redirect back from MoMo carries the same signed fields: the result page forwards them, for servers MoMo cannot reach. */
  momoReturn = wrap(async (req, res) => { sendSuccess(res, { outcome: await this.handleMomo(req.body as MomoResult) }); });

  private async handleMomo(r: MomoResult) {
    if (!this.keys.momo || !momoResultValid(this.keys.momo, r)) return "invalid-signature";
    return Number(r.resultCode) === 0
      ? this.billing.settle(String(r.orderId), { status: "paid", amountVnd: Number(r.amount), gatewayTxnId: String(r.transId) })
      : this.billing.settle(String(r.orderId), { status: "failed", reason: `MoMo ${r.resultCode} ${r.message ?? ""}`.trim() });
  }

  /** VNPay IPN: VNPay reads the RspCode in the JSON answer (00 confirmed, 01 not found, 02 already confirmed, 04 amount, 97 checksum). */
  vnpayIpn = wrap(async (req, res) => {
    const answer = await this.handleVnpay(req.query as Record<string, string>);
    console.log(`[billing] VNPay IPN received: order ${String(req.query.vnp_TxnRef ?? "-")} → RspCode ${answer.RspCode} ${answer.Message}`);
    res.status(200).json(answer);
  });

  vnpayReturn = wrap(async (req, res) => { sendSuccess(res, await this.handleVnpay((req.body ?? {}) as Record<string, string>)); });

  private async handleVnpay(q: Record<string, string>) {
    if (!this.keys.vnpay || !vnpayValid(this.keys.vnpay, q)) return { RspCode: "97", Message: "Invalid Checksum" };
    const ok = q.vnp_ResponseCode === "00" && q.vnp_TransactionStatus === "00";
    const outcome = await this.billing.settle(String(q.vnp_TxnRef), ok
      ? { status: "paid", amountVnd: Number(q.vnp_Amount) / 100, gatewayTxnId: String(q.vnp_TransactionNo ?? "") }
      : { status: "failed", reason: `VNPay ${q.vnp_ResponseCode}` });
    if (outcome === "not-found") return { RspCode: "01", Message: "Order not found" };
    if (outcome === "amount-mismatch") return { RspCode: "04", Message: "Invalid amount" };
    if (outcome === "ignored") return { RspCode: "02", Message: "Order already confirmed" };
    return { RspCode: "00", Message: "Confirm Success" };
  }

  // â”€â”€ administrators â”€â”€

  /**
   * payOS webhook: answered 200 whatever happens (payOS also sends a test notification when the URL is saved). Only a
   * valid signature settles; the order is found from its payOS order code.
   */
  payosWebhook = wrap(async (req, res) => {
    const w = req.body as PayosWebhook;
    let outcome = "invalid-signature";
    if (this.keys.payos && payosWebhookValid(this.keys.payos, w)) {
      const orderId = `AT${w.data.orderCode}`;
      const paid = w.code === "00" && (w.data.code ?? "00") === "00";
      outcome = await this.billing.settle(orderId, paid
        ? { status: "paid", amountVnd: Number(w.data.amount), gatewayTxnId: String(w.data.reference ?? "") }
        : { status: "failed", reason: `payOS ${w.data.code ?? w.code} ${w.data.desc ?? w.desc ?? ""}`.trim() });
    }
    console.log(`[billing] payOS webhook received: order code ${String(w?.data?.orderCode ?? "-")} → ${outcome}`);
    res.status(200).json({ success: true });
  });

  /** The buyer is back from payOS: its return address is not signed, so the server asks payOS about the order instead. */
  payosReturn = wrap(async (req, res) => {
    sendSuccess(res, await this.billing.checkWithGateway(req.user!.userId, String(req.body?.orderId ?? "")));
  });

  getSettings = wrap(async (_req, res) => { sendSuccess(res, await this.billing.getSettings()); });
  updateSettings = wrap(async (req, res) => { sendSuccess(res, await this.billing.updateSettings(req.body ?? {}, req.user!.userId), { message: "Billing settings saved" }); });
  listOrders = wrap(async (req, res) => { sendSuccess(res, await this.billing.listOrders(req.query)); });
  reconcile = wrap(async (_req, res) => { sendSuccess(res, await this.billing.reconcile()); });
}
