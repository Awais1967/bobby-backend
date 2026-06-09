const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const billingController = require("./billing.controller");

const router = express.Router();

const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN, {
  message: "Only Super Admin can manage billing.",
});

router.post("/webhook", billingController.handleStripeWebhook);
router.get("/summary", authMiddleware, requireSuperAdmin, billingController.getBillingSummary);
router.post("/clients/:clientId/setup-intent", authMiddleware, requireSuperAdmin, billingController.createClientSetupIntent);
router.post("/clients/:clientId/payment-method", authMiddleware, requireSuperAdmin, billingController.saveClientPaymentMethod);
router.get("/refunds", authMiddleware, requireSuperAdmin, billingController.getRefunds);
router.get("/refunds/:id", authMiddleware, requireSuperAdmin, billingController.getRefundById);
router.post("/refunds/:id/cancel", authMiddleware, requireSuperAdmin, billingController.cancelRefund);
router.get("/transactions", authMiddleware, requireSuperAdmin, billingController.getTransactions);
router.get("/transactions/:id", authMiddleware, requireSuperAdmin, billingController.getTransactionById);
router.post("/transactions/:id/refund", authMiddleware, requireSuperAdmin, billingController.createRefund);
router.post("/transactions/:id/retry", authMiddleware, requireSuperAdmin, billingController.retryTransaction);
router.patch("/transactions/:id/mark-paid", authMiddleware, requireSuperAdmin, billingController.markInvoicePaid);
router.patch("/transactions/:id/cancel", authMiddleware, requireSuperAdmin, billingController.cancelTransaction);

module.exports = router;
