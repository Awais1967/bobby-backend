const mongoose = require("mongoose");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");
const Match = require("../matches/match.model");
const Location = require("../locations/location.model");
const Transaction = require("./transaction.model");
const receiptService = require("./receipt.service");
const stripeService = require("./stripe.service");

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureObjectId(id, message) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError(message, 404);
  }
}

function toResponse(document) {
  if (!document) return null;
  const data = typeof document.toObject === "function" ? document.toObject() : document;
  delete data.__v;
  if (data._id) {
    data.id = data._id.toString();
    delete data._id;
  }
  return data;
}

function getPublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || "";
}

function ensureStripeConfigured() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw createHttpError("STRIPE_SECRET_KEY is required for card billing.", 500);
  }

  if (!getPublishableKey()) {
    throw createHttpError("STRIPE_PUBLISHABLE_KEY is required for card setup.", 500);
  }
}

function getClientEmail(client) {
  return client.billingContactEmail || client.clientEmail || client.contactEmail || "";
}

function getClientName(client) {
  return client.billingContactName || client.clientName || client.name || "";
}

function summarizePaymentMethod(paymentMethod) {
  const card = paymentMethod.card || {};
  const brand = card.brand || "";
  const last4 = card.last4 || "";

  return {
    cardBrand: brand,
    cardExpMonth: card.exp_month || null,
    cardExpYear: card.exp_year || null,
    cardLast4: last4,
    maskedPaymentMethod: brand && last4 ? `${brand} ending in ${last4}` : "",
    stripePaymentMethodId: paymentMethod.id,
  };
}

async function ensureClientStripeCustomer(client) {
  if (client.stripeCustomerId) return client.stripeCustomerId;

  const customer = await stripeService.createCustomer({
    email: getClientEmail(client),
    name: getClientName(client),
    metadata: {
      triviaGoatClientId: client._id.toString(),
    },
  });

  client.stripeCustomerId = customer.id;
  await client.save();
  return customer.id;
}

async function loadMatchAndLocation(matchDbId) {
  ensureObjectId(matchDbId, "Match not found.");

  const match = await Match.findById(matchDbId);
  if (!match) throw createHttpError("Match not found.", 404);

  const location = await Location.findById(match.locationId);
  if (!location) throw createHttpError("Location not found.", 404);

  return { location, match };
}

function resolveBillingTotals(match, location) {
  const subtotalAmount = match.defaultMatchPrice || location.defaultMatchPrice || 0;
  if (!subtotalAmount || subtotalAmount <= 0) throw createHttpError("No default match price found.", 400);

  let discountAmount = 0;
  if (location.pricingDiscount && location.discountValue > 0) {
    if (location.discountType === "percentage") {
      discountAmount = Math.round((subtotalAmount * location.discountValue) / 100);
    } else if (location.discountType === "fixed") {
      discountAmount = Math.round(location.discountValue);
    }
  }

  discountAmount = Math.min(discountAmount, subtotalAmount);
  const taxAmount = 0;
  const totalAmount = Math.max(subtotalAmount - discountAmount + taxAmount, 0);

  return {
    amount: totalAmount,
    discountAmount,
    subtotalAmount,
    taxAmount,
    totalAmount,
  };
}

function getReceiptDestinations(location, match) {
  const emails = new Set();

  if (location.billingContactEmail) emails.add(location.billingContactEmail);
  (location.billingContactEmails || []).forEach((email) => emails.add(email));
  (match.receiptEmailDestinations || []).forEach((email) => emails.add(email));

  return [...emails];
}

function extractCharge(paymentIntent) {
  const charge = paymentIntent.latest_charge;
  if (!charge || typeof charge === "string") {
    return {
      stripeChargeId: typeof charge === "string" ? charge : "",
      stripeReceiptUrl: "",
    };
  }

  return {
    stripeChargeId: charge.id || "",
    stripeReceiptUrl: charge.receipt_url || "",
  };
}

async function createTransactionFromMatch(match, billingStatus, location = null) {
  const resolvedLocation = location || (await Location.findById(match.locationId));
  if (!resolvedLocation) throw createHttpError("Location not found.", 404);

  const totals = resolveBillingTotals(match, resolvedLocation);
  const existing = await Transaction.findOne({ matchDbId: match._id });

  const payload = {
    matchDbId: match._id,
    matchId: match.matchId,
    gameId: match.gameId,
    gameTitle: match.gameTitle,
    locationId: match.locationId,
    locationName: match.locationName,
    hostId: match.hostId,
    hostName: match.hostName,
    billingMode: match.billingMode,
    billingStatus,
    amount: totals.amount,
    discountAmount: totals.discountAmount,
    subtotalAmount: totals.subtotalAmount,
    taxAmount: totals.taxAmount,
    totalAmount: totals.totalAmount,
    currency: match.currency || resolvedLocation.currency || "usd",
    stripeCustomerId: resolvedLocation.stripeCustomerId || "",
    stripePaymentMethodId: resolvedLocation.stripePaymentMethodId || "",
    receiptEmailDestinations: getReceiptDestinations(resolvedLocation, match),
    invoiceNotes: resolvedLocation.invoiceNotes || "",
  };

  if (billingStatus === BILLING_STATUS.UNPAID || billingStatus === BILLING_STATUS.INVOICED) {
    payload.invoicedAt = new Date();
  }

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }

  return Transaction.create(payload);
}

async function chargeClosedMatch(matchDbId, idempotencyKey = null) {
  const { location, match } = await loadMatchAndLocation(matchDbId);

  if (!match.billingMode) throw createHttpError("Billing mode is missing.", 400);
  if (match.billingMode !== BILLING_MODE.AUTO_CHARGE) return markMatchInvoiceLater(matchDbId);

  const existingCharged = await Transaction.findOne({
    matchDbId: match._id,
    billingStatus: BILLING_STATUS.CHARGED,
  });

  if (existingCharged) {
    match.billingStatus = BILLING_STATUS.CHARGED;
    match.chargedAmount = existingCharged.amount;
    match.stripePaymentIntentId = existingCharged.stripePaymentIntentId;
    match.receiptSent = existingCharged.receiptSent;
    await match.save();
    return { transaction: existingCharged, alreadyCharged: true };
  }

  const { amount } = resolveBillingTotals(match, location);
  if (!location.stripeCustomerId) throw createHttpError("Stripe customer is missing for this location.", 400);
  if (!location.stripePaymentMethodId) throw createHttpError("Stripe payment method is missing for this location.", 400);

  let transaction = await createTransactionFromMatch(match, BILLING_STATUS.PENDING, location);

  try {
    const paymentIntent = await stripeService.createOffSessionPaymentIntent(
      {
        amount,
        currency: transaction.currency,
        customer: location.stripeCustomerId,
        paymentMethod: location.stripePaymentMethodId,
        metadata: {
          gameTitle: match.gameTitle,
          hostId: match.hostId.toString(),
          locationId: match.locationId.toString(),
          locationName: match.locationName,
          matchDbId: match._id.toString(),
          matchId: match.matchId,
        },
      },
      idempotencyKey || `match-close-charge-${match._id}`
    );
    const charge = extractCharge(paymentIntent);

    transaction.billingStatus = BILLING_STATUS.CHARGED;
    transaction.stripePaymentIntentId = paymentIntent.id;
    transaction.stripeChargeId = charge.stripeChargeId;
    transaction.stripeReceiptUrl = charge.stripeReceiptUrl;
    transaction.chargedAt = new Date();
    transaction.failureReason = "";

    const receiptResult = await receiptService.sendMatchReceipt(transaction);
    transaction.receiptSent = receiptResult.sent;
    if (!receiptResult.sent) transaction.failureReason = receiptResult.failureReason;
    await transaction.save();

    match.billingStatus = BILLING_STATUS.CHARGED;
    match.chargedAmount = amount;
    match.stripePaymentIntentId = paymentIntent.id;
    match.receiptSent = transaction.receiptSent;
    await match.save();

    return { paymentIntent, transaction };
  } catch (error) {
    transaction.billingStatus = BILLING_STATUS.FAILED;
    transaction.failureReason = error.message;
    await transaction.save();

    match.billingStatus = BILLING_STATUS.FAILED;
    match.chargedAmount = 0;
    match.billingFailureReason = error.message;
    await match.save();

    return { error, transaction };
  }
}

async function markMatchInvoiceLater(matchDbId) {
  const { location, match } = await loadMatchAndLocation(matchDbId);

  if (!match.billingMode) throw createHttpError("Billing mode is missing.", 400);

  const transaction = await createTransactionFromMatch(match, BILLING_STATUS.UNPAID, location);

  match.billingStatus = BILLING_STATUS.UNPAID;
  match.chargedAmount = 0;
  await match.save();

  return { transaction };
}

async function processClosedMatchBilling(matchDbId) {
  const { match } = await loadMatchAndLocation(matchDbId);

  if (match.billingMode === BILLING_MODE.AUTO_CHARGE) {
    return chargeClosedMatch(matchDbId);
  }

  if (match.billingMode === BILLING_MODE.INVOICE_LATER) {
    return markMatchInvoiceLater(matchDbId);
  }

  throw createHttpError("Billing mode is missing.", 400);
}

async function getTransactions(query) {
  const filter = {};
  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ matchId: searchRegex }, { gameTitle: searchRegex }, { locationName: searchRegex }, { hostName: searchRegex }];
  }
  if (query.billingStatus) filter.billingStatus = query.billingStatus;
  if (query.billingMode) filter.billingMode = query.billingMode;
  if (query.locationId) filter.locationId = query.locationId;
  if (query.hostId) filter.hostId = query.hostId;
  if (query.matchId) filter.matchId = query.matchId;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ [query.sortBy]: sortDirection }).skip(skip).limit(query.pageSize),
    Transaction.countDocuments(filter),
  ]);

  return {
    items: items.map(toResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function createClientSetupIntent(clientId) {
  ensureObjectId(clientId, "Client not found.");
  ensureStripeConfigured();

  const client = await Location.findById(clientId);
  if (!client) throw createHttpError("Client not found.", 404);

  const customerId = await ensureClientStripeCustomer(client);
  const setupIntent = await stripeService.createSetupIntent({
    customer: customerId,
    metadata: {
      triviaGoatClientId: client._id.toString(),
      triviaGoatClientName: getClientName(client),
    },
  });

  return {
    clientId: client._id.toString(),
    clientSecret: setupIntent.client_secret,
    customerId,
    publishableKey: getPublishableKey(),
    setupIntentId: setupIntent.id,
  };
}

async function saveClientPaymentMethod(clientId, payload) {
  ensureObjectId(clientId, "Client not found.");
  ensureStripeConfigured();

  const client = await Location.findById(clientId);
  if (!client) throw createHttpError("Client not found.", 404);

  const customerId = await ensureClientStripeCustomer(client);
  let paymentMethod = await stripeService.retrievePaymentMethod(payload.paymentMethodId);
  const attachedCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;

  if (attachedCustomerId && attachedCustomerId !== customerId) {
    throw createHttpError("Stripe payment method belongs to a different customer.", 400);
  }

  if (!attachedCustomerId) {
    paymentMethod = await stripeService.attachPaymentMethod(payload.paymentMethodId, customerId);
  }

  await stripeService.setDefaultPaymentMethod(customerId, payload.paymentMethodId);
  const paymentSummary = summarizePaymentMethod(paymentMethod);

  client.billingMethod = "card";
  client.billingMode = BILLING_MODE.AUTO_CHARGE;
  client.stripeCustomerId = customerId;
  client.stripePaymentMethodId = payload.paymentMethodId;
  client.cardBrand = paymentSummary.cardBrand;
  client.cardLast4 = paymentSummary.cardLast4;
  client.cardExpMonth = paymentSummary.cardExpMonth;
  client.cardExpYear = paymentSummary.cardExpYear;
  client.maskedPaymentMethod = paymentSummary.maskedPaymentMethod;
  await client.save();

  return {
    client: toResponse(client),
    paymentMethod: paymentSummary,
  };
}

async function getTransactionById(id) {
  ensureObjectId(id, "Transaction not found.");
  const transaction = await Transaction.findById(id);
  if (!transaction) throw createHttpError("Transaction not found.", 404);
  return toResponse(transaction);
}

async function retryTransaction(transactionId) {
  ensureObjectId(transactionId, "Transaction not found.");
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw createHttpError("Transaction not found.", 404);
  if (transaction.billingStatus !== BILLING_STATUS.FAILED || transaction.billingMode !== BILLING_MODE.AUTO_CHARGE) {
    throw createHttpError("This transaction cannot be retried.", 400);
  }
  return chargeClosedMatch(transaction.matchDbId, `retry-charge-${transaction._id}-${Date.now()}`);
}

async function markInvoicePaid(transactionId, payload) {
  ensureObjectId(transactionId, "Transaction not found.");
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw createHttpError("Transaction not found.", 404);
  if (transaction.billingMode !== BILLING_MODE.INVOICE_LATER || ![BILLING_STATUS.UNPAID, BILLING_STATUS.INVOICED].includes(transaction.billingStatus)) {
    throw createHttpError("This transaction cannot be retried.", 400);
  }

  transaction.billingStatus = BILLING_STATUS.CHARGED;
  transaction.paidAt = new Date();
  transaction.adminNote = payload.note || "";
  await transaction.save();

  await Match.findByIdAndUpdate(transaction.matchDbId, {
    billingStatus: BILLING_STATUS.CHARGED,
    chargedAmount: transaction.amount,
  });

  return toResponse(transaction);
}

async function cancelTransaction(transactionId, payload) {
  ensureObjectId(transactionId, "Transaction not found.");
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw createHttpError("Transaction not found.", 404);
  if (transaction.billingStatus === BILLING_STATUS.CHARGED) {
    throw createHttpError("Successfully charged payments cannot be cancelled without refund flow.", 400);
  }

  transaction.billingStatus = BILLING_STATUS.CANCELLED;
  transaction.cancelledAt = new Date();
  transaction.cancelReason = payload.reason;
  await transaction.save();

  await Match.findByIdAndUpdate(transaction.matchDbId, {
    billingStatus: BILLING_STATUS.CANCELLED,
  });

  return toResponse(transaction);
}

async function getBillingSummary() {
  const transactions = await Transaction.find({});
  const summary = {
    autoChargeCount: 0,
    invoiceLaterCount: 0,
    monthlyRevenue: {},
    totalCharged: 0,
    totalFailed: 0,
    totalRefunded: 0,
    totalTransactions: transactions.length,
    totalUnpaid: 0,
  };

  transactions.forEach((transaction) => {
    if (transaction.billingMode === BILLING_MODE.AUTO_CHARGE) summary.autoChargeCount += 1;
    if (transaction.billingMode === BILLING_MODE.INVOICE_LATER) summary.invoiceLaterCount += 1;
    if (transaction.billingStatus === BILLING_STATUS.CHARGED) summary.totalCharged += transaction.amount;
    if (transaction.billingStatus === BILLING_STATUS.UNPAID || transaction.billingStatus === BILLING_STATUS.INVOICED) summary.totalUnpaid += transaction.amount;
    if (transaction.billingStatus === BILLING_STATUS.FAILED) summary.totalFailed += transaction.amount;
    if (transaction.billingStatus === BILLING_STATUS.REFUNDED) summary.totalRefunded += transaction.amount;

    const date = transaction.chargedAt || transaction.createdAt;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    summary.monthlyRevenue[key] = summary.monthlyRevenue[key] || 0;
    if (transaction.billingStatus === BILLING_STATUS.CHARGED) summary.monthlyRevenue[key] += transaction.amount;
  });

  return summary;
}

module.exports = {
  cancelTransaction,
  chargeClosedMatch,
  createClientSetupIntent,
  createTransactionFromMatch,
  getBillingSummary,
  getTransactionById,
  getTransactions,
  markInvoicePaid,
  markMatchInvoiceLater,
  processClosedMatchBilling,
  retryTransaction,
  saveClientPaymentMethod,
  sendMatchReceipt: receiptService.sendMatchReceipt,
};
