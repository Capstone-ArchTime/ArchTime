# Setting up real payments (MoMo, VNPay)

The server already contains both gateways:
- **MoMo:** Payment Gateway v2, wallet payment, HMAC-SHA256.
- **VNPay:** version 2.1.0, HMAC-SHA512.

A gateway turns on as soon as its keys are in `BE/.env`. Nothing else needs to change in code.

Keys are secrets:
- Put them only in `BE/.env`, or in the hosting provider's secret settings.
- Never put them in git, in chat, or in the FE.

## 1. Get keys

| Gateway | Sandbox (no real money) | Live (real money) |
|---|---|---|
| MoMo | Business test account at developers.momo.vn. You receive partner code, access key and secret key. | Merchant contract with MoMo. Live keys come from the MoMo Business portal. |
| VNPay | Register at pay.vnpaytest.vn/dev-registration (sandbox.vnpayment.vn/devreg redirects there). VNPay e-mails the TMN code, hash secret and test cards. | Merchant contract with VNPay. |

## 2. Fill `BE/.env`

```
# MoMo
MOMO_PARTNER_CODE=...
MOMO_ACCESS_KEY=...
MOMO_SECRET_KEY=...
MOMO_ENDPOINT=https://test-payment.momo.vn      # live: https://payment.momo.vn

# VNPay
VNPAY_TMN_CODE=...
VNPAY_HASH_SECRET=...
VNPAY_PAY_URL=https://sandbox.vnpaytest.vn/paymentv2/vpcpay.html                  # live: https://pay.vnpay.vn/vpcpay.html
VNPAY_API_URL=https://sandbox.vnpaytest.vn/merchant_webapi/api/transaction        # live: https://merchant.vnpay.vn/merchant_webapi/api/transaction

# Addresses
PUBLIC_API_URL=https://api.example.com/api   # public address of the API (HTTPS in live mode)
CORS_ORIGIN=https://app.example.com          # first entry = where the gateway sends the buyer back
BILLING_SIMULATOR=false                      # the test gateway is always off when NODE_ENV=production
TRUST_PROXY=1                                # behind a reverse proxy, so VNPay receives the buyer's real IP
```

At startup the server prints one line per gateway: SANDBOX or LIVE, and the IPN address.

## 3. Payment confirmations (IPN)
- **MoMo:** the server sends the IPN address itself with each order: `PUBLIC_API_URL/billing/momo/ipn`.
- **VNPay:** enter `PUBLIC_API_URL/billing/vnpay/ipn` in the VNPay merchant portal (IPN URL, GET method).
- On a local machine the gateways cannot reach the API. Payments still complete in two ways:
  - The return page forwards the signed result the gateway attaches to the redirect. The server checks the signature before it accepts anything.
  - Reconciliation asks the gateway every `BILLING_RECONCILE_MINUTES`.
- To test real IPNs locally, expose the API with a tunnel (for example ngrok) and set `PUBLIC_API_URL` to the tunnel address.

## 4. Safety rules already in the code
- **Prices:** the server computes every amount. A client-sent amount is ignored.
- **Paying:** an order becomes paid only after a valid signature **and** a matching amount. It is applied once, even when the IPN, the return page and reconciliation all arrive.
- **Expiry:** unpaid orders expire after 15 minutes. If a payment arrives later, it is still applied.
- **Amount limits:** each gateway's limits are checked before the order is created:
  - MoMo: 1,000 – 50,000,000 VND;
  - VNPay: 5,000 – 999,999,999 VND.

  Outside these limits the buyer is asked to use the other method or buy less at a time.
- **Refunds:** none (LI-10). A refund has to be made in the gateway's merchant portal.

## 5. Going live checklist
1. Put the live keys and live endpoints in the production secrets.
2. `NODE_ENV=production`, `BILLING_SIMULATOR=false`.
3. `PUBLIC_API_URL` and `CORS_ORIGIN` on HTTPS. Register the VNPay IPN URL.
4. Pay one small top-up (49,000 VND) with each method. Check:
   - status "Paid";
   - the credits were added;
   - the receipt e-mail arrived;
   - the transaction appears in the merchant portal.
