import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing of the two payment gateways, kept free of HTTP so it can be checked against their documentation.
 * MoMo (Payment Gateway API v2): HMAC-SHA256 over "key=value" pairs in a fixed order. VNPay (2.1.0): HMAC-SHA512 over the
 * vnp_ parameters sorted by name and URL-encoded (spaces as "+").
 */

export const hmacHex = (algorithm: "sha256" | "sha512", secret: string, data: string) => createHmac(algorithm, secret).update(data, "utf8").digest("hex");

export function sameHex(a: string | undefined, b: string): boolean {
  if (typeof a !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase()), Buffer.from(b.toLowerCase()));
}

// ── MoMo ──

export interface MomoKeys { partnerCode: string; accessKey: string; secretKey: string }

export interface MomoCreate {
  orderId: string; requestId: string; amount: number; orderInfo: string; redirectUrl: string; ipnUrl: string; extraData?: string; requestType?: string;
}

export function momoCreateBody(keys: MomoKeys, req: MomoCreate) {
  const requestType = req.requestType ?? "captureWallet";
  const extraData = req.extraData ?? "";
  const raw = `accessKey=${keys.accessKey}&amount=${req.amount}&extraData=${extraData}&ipnUrl=${req.ipnUrl}&orderId=${req.orderId}`
    + `&orderInfo=${req.orderInfo}&partnerCode=${keys.partnerCode}&redirectUrl=${req.redirectUrl}&requestId=${req.requestId}&requestType=${requestType}`;
  return {
    partnerCode: keys.partnerCode, requestId: req.requestId, amount: req.amount, orderId: req.orderId, orderInfo: req.orderInfo,
    redirectUrl: req.redirectUrl, ipnUrl: req.ipnUrl, requestType, extraData, lang: "vi", signature: hmacHex("sha256", keys.secretKey, raw),
  };
}

/** Fields MoMo sends to the IPN URL (and to the redirect URL). */
export interface MomoResult {
  partnerCode: string; orderId: string; requestId: string; amount: number | string; orderInfo: string; orderType: string;
  transId: number | string; resultCode: number | string; message: string; payType: string; responseTime: number | string; extraData: string; signature: string;
}

export function momoResultSignature(keys: MomoKeys, r: Omit<MomoResult, "signature">): string {
  const raw = `accessKey=${keys.accessKey}&amount=${r.amount}&extraData=${r.extraData ?? ""}&message=${r.message}&orderId=${r.orderId}`
    + `&orderInfo=${r.orderInfo}&orderType=${r.orderType}&partnerCode=${r.partnerCode}&payType=${r.payType}&requestId=${r.requestId}`
    + `&responseTime=${r.responseTime}&resultCode=${r.resultCode}&transId=${r.transId}`;
  return hmacHex("sha256", keys.secretKey, raw);
}

export const momoResultValid = (keys: MomoKeys, r: MomoResult): boolean =>
  !!r && r.partnerCode === keys.partnerCode && sameHex(r.signature, momoResultSignature(keys, r));

export function momoQueryBody(keys: MomoKeys, orderId: string, requestId: string) {
  const raw = `accessKey=${keys.accessKey}&orderId=${orderId}&partnerCode=${keys.partnerCode}&requestId=${requestId}`;
  return { partnerCode: keys.partnerCode, requestId, orderId, lang: "vi", signature: hmacHex("sha256", keys.secretKey, raw) };
}

// ── VNPay ──

export interface VnpayKeys { tmnCode: string; hashSecret: string }

/** VNPay's encoding: encodeURIComponent with spaces as "+". */
const vnpEncode = (v: string) => encodeURIComponent(v).replace(/%20/g, "+");

export function vnpaySignData(params: Record<string, string>): string {
  return Object.keys(params).filter(k => k.startsWith("vnp_") && k !== "vnp_SecureHash" && k !== "vnp_SecureHashType" && params[k] !== "" && params[k] !== undefined)
    .sort().map(k => `${vnpEncode(k)}=${vnpEncode(String(params[k]))}`).join("&");
}

/** yyyyMMddHHmmss in Vietnam time (UTC+7), as VNPay expects. */
export function vnpayDate(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

export interface VnpayCreate { orderId: string; amountVnd: number; orderInfo: string; returnUrl: string; ipAddr: string; createdAt: Date; expiresAt: Date; locale?: "vn" | "en" }

export function vnpayPayUrl(keys: VnpayKeys, payBase: string, req: VnpayCreate): string {
  const params: Record<string, string> = {
    vnp_Version: "2.1.0", vnp_Command: "pay", vnp_TmnCode: keys.tmnCode, vnp_Amount: String(Math.round(req.amountVnd * 100)), vnp_CurrCode: "VND",
    vnp_TxnRef: req.orderId, vnp_OrderInfo: req.orderInfo, vnp_OrderType: "other", vnp_Locale: req.locale ?? "vn", vnp_ReturnUrl: req.returnUrl,
    vnp_IpAddr: req.ipAddr || "127.0.0.1", vnp_CreateDate: vnpayDate(req.createdAt), vnp_ExpireDate: vnpayDate(req.expiresAt),
  };
  const signData = vnpaySignData(params);
  return `${payBase}?${signData}&vnp_SecureHash=${hmacHex("sha512", keys.hashSecret, signData)}`;
}

export const vnpayValid = (keys: VnpayKeys, query: Record<string, string>): boolean =>
  !!query && sameHex(query.vnp_SecureHash, hmacHex("sha512", keys.hashSecret, vnpaySignData(query)));

/** Body of a querydr request (status of a transaction), with its checksum. */
export function vnpayQueryBody(keys: VnpayKeys, req: { requestId: string; orderId: string; orderInfo: string; transactionDate: Date; ipAddr: string; now: Date }) {
  const body = {
    vnp_RequestId: req.requestId, vnp_Version: "2.1.0", vnp_Command: "querydr", vnp_TmnCode: keys.tmnCode, vnp_TxnRef: req.orderId,
    vnp_OrderInfo: req.orderInfo, vnp_TransactionDate: vnpayDate(req.transactionDate), vnp_CreateDate: vnpayDate(req.now), vnp_IpAddr: req.ipAddr || "127.0.0.1",
  };
  const data = [body.vnp_RequestId, body.vnp_Version, body.vnp_Command, body.vnp_TmnCode, body.vnp_TxnRef, body.vnp_TransactionDate, body.vnp_CreateDate, body.vnp_IpAddr, body.vnp_OrderInfo].join("|");
  return { ...body, vnp_SecureHash: hmacHex("sha512", keys.hashSecret, data) };
}
