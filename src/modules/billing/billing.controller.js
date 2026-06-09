const billingService = require("./billing.service");
const stripeService = require("./stripe.service");
const stripeWebhookService = require("./stripeWebhook.service");
const {
  cancelTransactionValidation,
  clientIdParamValidation,
  createRefundValidation,
  getRefundsQueryValidation,
  getTransactionsQueryValidation,
  markInvoicePaidValidation,
  retryTransactionValidation,
  saveClientPaymentMethodValidation,
  validate,
} = require("./billing.validation");

async function getTransactions(req, res, next) {
  try {
    const query = validate(getTransactionsQueryValidation, req.query);
    const data = await billingService.getTransactions(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getRefunds(req, res, next) {
  try {
    const query = validate(getRefundsQueryValidation, req.query);
    const data = await billingService.getRefunds(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getRefundById(req, res, next) {
  try {
    const refund = await billingService.getRefundById(req.params.id);
    return res.status(200).json({ success: true, data: { refund } });
  } catch (error) {
    return next(error);
  }
}

async function getTransactionById(req, res, next) {
  try {
    const transaction = await billingService.getTransactionById(req.params.id);
    return res.status(200).json({ success: true, data: { transaction } });
  } catch (error) {
    return next(error);
  }
}

async function createRefund(req, res, next) {
  try {
    const payload = validate(createRefundValidation, req.body || {});
    const data = await billingService.createRefund(req.params.id, payload, req.user.id);
    return res.status(201).json({ success: true, message: "Refund created", data });
  } catch (error) {
    return next(error);
  }
}

async function cancelRefund(req, res, next) {
  try {
    const refund = await billingService.cancelRefund(req.params.id);
    return res.status(200).json({ success: true, message: "Refund cancelled", data: { refund } });
  } catch (error) {
    return next(error);
  }
}

async function retryTransaction(req, res, next) {
  try {
    validate(retryTransactionValidation, req.body || {});
    const data = await billingService.retryTransaction(req.params.id);
    return res.status(200).json({ success: true, message: "Transaction retry processed", data });
  } catch (error) {
    return next(error);
  }
}

async function markInvoicePaid(req, res, next) {
  try {
    const payload = validate(markInvoicePaidValidation, req.body || {});
    const transaction = await billingService.markInvoicePaid(req.params.id, payload, req.user.id);
    return res.status(200).json({ success: true, message: "Invoice marked as paid", data: { transaction } });
  } catch (error) {
    return next(error);
  }
}

async function cancelTransaction(req, res, next) {
  try {
    const payload = validate(cancelTransactionValidation, req.body || {});
    const transaction = await billingService.cancelTransaction(req.params.id, payload, req.user.id);
    return res.status(200).json({ success: true, message: "Transaction cancelled", data: { transaction } });
  } catch (error) {
    return next(error);
  }
}

async function getBillingSummary(req, res, next) {
  try {
    const data = await billingService.getBillingSummary(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function createClientSetupIntent(req, res, next) {
  try {
    const params = validate(clientIdParamValidation, req.params);
    const data = await billingService.createClientSetupIntent(params.clientId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function saveClientPaymentMethod(req, res, next) {
  try {
    const params = validate(clientIdParamValidation, req.params);
    const payload = validate(saveClientPaymentMethodValidation, req.body || {});
    const data = await billingService.saveClientPaymentMethod(params.clientId, payload);
    return res.status(200).json({
      success: true,
      message: "Client card saved for automatic billing.",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function handleStripeWebhook(req, res, next) {
  try {
    const signature = req.headers["stripe-signature"];
    const event = stripeService.constructWebhookEvent(req.body, signature);
    await stripeWebhookService.handleStripeWebhook(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  cancelTransaction,
  cancelRefund,
  createRefund,
  createClientSetupIntent,
  getBillingSummary,
  getRefundById,
  getRefunds,
  getTransactionById,
  getTransactions,
  handleStripeWebhook,
  markInvoicePaid,
  retryTransaction,
  saveClientPaymentMethod,
};
