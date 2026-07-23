const { BILLING_STATUS } = require("../../constants/billingStatus");
const Match = require("../matches/match.model");
const Refund = require("./refund.model");
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

function getRefundStatus(stripeRefund) {
  if (!stripeRefund || !stripeRefund.status) return "pending";
  if (stripeRefund.status === "requires_action") return "requires_action";
  if (stripeRefund.status === "succeeded") return "succeeded";
  if (stripeRefund.status === "failed") return "failed";
  if (stripeRefund.status === "canceled") return "canceled";
  return "pending";
}

async function syncTransactionRefundTotals(transaction) {
  const succeededRefunds = await Refund.find({
    transactionId: transaction._id,
    status: "succeeded",
  }).select("amount stripeRefundId");

  transaction.refundedAmount = Math.min(
    succeededRefunds.reduce((sum, refund) => sum + refund.amount, 0),
    transaction.amount
  );
  transaction.stripeRefundIds = succeededRefunds.map((refund) => refund.stripeRefundId).filter(Boolean);

  if (transaction.refundedAmount >= transaction.amount) {
    transaction.billingStatus = BILLING_STATUS.REFUNDED;
    transaction.refundedAt = transaction.refundedAt || new Date();
  } else if (transaction.refundedAmount > 0) {
    transaction.billingStatus = BILLING_STATUS.PARTIALLY_REFUNDED;
    transaction.refundedAt = transaction.refundedAt || new Date();
  } else {
    transaction.billingStatus = BILLING_STATUS.CHARGED;
    transaction.refundedAt = null;
  }

  await transaction.save();
  await Match.findByIdAndUpdate(transaction.matchDbId, {
    billingStatus: transaction.billingStatus,
    chargedAmount: Math.max(transaction.amount - transaction.refundedAmount, 0),
    stripePaymentIntentId: transaction.stripePaymentIntentId,
  });

  return transaction;
}

async function upsertRefundFromStripe(stripeRefund, transaction) {
  if (!stripeRefund || !transaction) return null;

  const status = getRefundStatus(stripeRefund);
  const refund = await Refund.findOneAndUpdate(
    { stripeRefundId: stripeRefund.id },
    {
      $set: {
        amount: stripeRefund.amount,
        currency: stripeRefund.currency || transaction.currency,
        failureReason: stripeRefund.failure_reason || "",
        locationId: transaction.locationId,
        locationName: transaction.locationName,
        matchDbId: transaction.matchDbId,
        matchId: transaction.matchId,
        processedAt: status === "succeeded" ? new Date((stripeRefund.created || Date.now() / 1000) * 1000) : null,
        reason: stripeRefund.reason || "",
        status,
        stripeChargeId: stripeRefund.charge || transaction.stripeChargeId,
        stripePaymentIntentId: stripeRefund.payment_intent || transaction.stripePaymentIntentId,
        transactionId: transaction._id,
      },
      $setOnInsert: {
        requestedAt: new Date((stripeRefund.created || Date.now() / 1000) * 1000),
      },
    },
    { new: true, upsert: true }
  );

  if (status === "canceled") {
    refund.cancelledAt = refund.cancelledAt || new Date();
    await refund.save();
  }

  await syncTransactionRefundTotals(transaction);
  return refund;
}

async function handleStripeWebhook(event) {
  const object = event.data && event.data.object;

  if (!object) {
    return null;
  }

  if (event.type === "setup_intent.succeeded") {
    const billingService = require("./billing.service");
    return billingService.finalizeClientSetupIntent(object);
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

    const refunds = object.refunds && Array.isArray(object.refunds.data) ? object.refunds.data : [];
    for (const refund of refunds) {
      await upsertRefundFromStripe(refund, transaction);
    }

    return syncTransactionRefundTotals(transaction);
  }

  if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
    const transaction = await Transaction.findOne({
      $or: [
        { stripePaymentIntentId: object.payment_intent },
        { stripeChargeId: object.charge },
      ],
    });
    if (!transaction) return null;

    return upsertRefundFromStripe(object, transaction);
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
