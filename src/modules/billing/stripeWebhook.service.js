const { BILLING_STATUS } = require("../../constants/billingStatus");
const Match = require("../matches/match.model");
const Transaction = require("./transaction.model");

async function updateTransactionAndMatch(transaction, updates) {
  Object.assign(transaction, updates);
  await transaction.save();

  await Match.findByIdAndUpdate(transaction.matchDbId, {
    billingStatus: transaction.billingStatus,
    chargedAmount: transaction.billingStatus === BILLING_STATUS.CHARGED ? transaction.amount : undefined,
    stripePaymentIntentId: transaction.stripePaymentIntentId,
  });

  return transaction;
}

async function handleStripeWebhook(event) {
  const object = event.data && event.data.object;

  if (!object) {
    return null;
  }

  if (event.type === "payment_intent.succeeded") {
    const transaction = await Transaction.findOne({ stripePaymentIntentId: object.id });
    if (!transaction) return null;

    return updateTransactionAndMatch(transaction, {
      billingStatus: BILLING_STATUS.CHARGED,
      chargedAt: transaction.chargedAt || new Date(),
      failureReason: "",
    });
  }

  if (event.type === "payment_intent.payment_failed") {
    const transaction = await Transaction.findOne({ stripePaymentIntentId: object.id });
    if (!transaction) return null;

    return updateTransactionAndMatch(transaction, {
      billingStatus: BILLING_STATUS.FAILED,
      failureReason: object.last_payment_error ? object.last_payment_error.message : "Stripe payment failed.",
    });
  }

  if (event.type === "charge.refunded") {
    const transaction = await Transaction.findOne({ stripeChargeId: object.id });
    if (!transaction) return null;

    return updateTransactionAndMatch(transaction, {
      billingStatus: BILLING_STATUS.REFUNDED,
    });
  }

  if (event.type === "charge.succeeded") {
    const transaction = await Transaction.findOne({ stripePaymentIntentId: object.payment_intent });
    if (!transaction) return null;

    transaction.stripeChargeId = object.id || transaction.stripeChargeId;
    transaction.stripeReceiptUrl = object.receipt_url || transaction.stripeReceiptUrl;
    return updateTransactionAndMatch(transaction, {
      billingStatus: BILLING_STATUS.CHARGED,
      chargedAt: transaction.chargedAt || new Date(),
    });
  }

  return null;
}

module.exports = {
  handleStripeWebhook,
};
