import express, { Router } from "express";
import type { BillingController } from "../controllers/BillingController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { UserRole } from "../../domain/entities/User.js";

/**
 * FE-17 Plans, AI Credit & Payments.
 *
 *   GET  /api/billing/overview?space=personal|organization&organizationId=   plan, AI credit, prices, recent orders
 *   POST /api/billing/quote        { space, organizationId?, kind, seats?, months?, packId? }   price of an order
 *   POST /api/billing/orders       { …, gateway: "momo" | "vnpay" }                           create a pending order; { payUrl }
 *   GET  /api/billing/orders/:orderId                                                           status of an order (buyer or owner)
 *   POST /api/billing/momo/ipn, GET /api/billing/vnpay/ipn                                       gateway notifications (signed)
 *   POST /api/billing/momo/return, POST /api/billing/vnpay/return                                signed redirect fields, forwarded by the result page
 *   GET|PUT /api/admin/billing/settings, GET /api/admin/billing/orders, POST /api/admin/billing/reconcile   administrators
 */
export function createBillingRouter(controller: BillingController, jwtTokenService: JwtTokenService): Router {
  const router = Router();
  // Gateways call these without a session; they are trusted only through their signatures.
  router.post("/momo/ipn", express.json(), controller.momoIpn);
  router.get("/vnpay/ipn", controller.vnpayIpn);
  router.post("/momo/return", controller.momoReturn);
  router.post("/vnpay/return", controller.vnpayReturn);
  router.post("/payos/webhook", express.json(), controller.payosWebhook);

  const auth = createAuthenticateMiddleware(jwtTokenService);
  router.get("/pricing", auth, controller.pricing);
  router.get("/overview", auth, controller.overview);
  router.put("/seats/next", auth, controller.setNextSeats);
  router.post("/quote", auth, controller.quote);
  router.post("/orders", auth, controller.createOrder);
  router.get("/orders", auth, controller.listSpaceOrders);
  router.get("/orders/:orderId", auth, controller.getOrder);
  router.post("/simulator/:orderId", auth, controller.simulate);
  router.post("/payos/return", auth, controller.payosReturn);
  return router;
}

export function createAdminBillingRouter(controller: BillingController, jwtTokenService: JwtTokenService): Router {
  const router = Router();
  router.use(createAuthenticateMiddleware(jwtTokenService));
  router.use(authorize(UserRole.SYSTEM_ADMINISTRATOR));
  router.get("/settings", controller.getSettings);
  router.put("/settings", controller.updateSettings);
  router.get("/orders", controller.listOrders);
  router.post("/reconcile", controller.reconcile);
  return router;
}
