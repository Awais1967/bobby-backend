const mongoose = require("mongoose");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");
const Match = require("../matches/match.model");
const Location = require("../locations/location.model");
const Game = require("../games/game.model");
const Refund = require("./refund.model");
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

async function addBillingContactNames(transactions) {
  const rows = transactions.map(toResponse);
  const missingContactRows = rows.filter((row) => row && !row.billingContactName && row.locationId);
  const locationIds = [...new Set(missingContactRows.map((row) => row.locationId.toString()))];

  if (!locationIds.length) return rows;

  const locations = await Location.find({ _id: { $in: locationIds } })
    .select("billingContactName clientName name")
    .lean();
  const locationMap = new Map(locations.map((location) => [location._id.toString(), location]));

  return rows.map((row) => {
    const location = locationMap.get(row.locationId?.toString());
    return {
      ...row,
      billingContactName:
        row.billingContactName || location?.billingContactName || location?.clientName || location?.name || "",
    };
  });
}

function getRefundStatus(stripeRefund) {
  if (!stripeRefund || !stripeRefund.status) return "pending";
  if (stripeRefund.status === "requires_action") return "requires_action";
  if (stripeRefund.status === "succeeded") return "succeeded";
  if (stripeRefund.status === "failed") return "failed";
  if (stripeRefund.status === "canceled") return "canceled";
  return "pending";
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

function ensureStripeSecretConfigured() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw createHttpError("STRIPE_SECRET_KEY is required for Stripe billing.", 500);
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

function getPaymentMethodCustomerId(paymentMethod) {
  if (!paymentMethod || !paymentMethod.customer) return "";
  return typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer.id;
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

async function ensurePaymentMethodAttachedToCustomer(paymentMethodId, customerId) {
  let paymentMethod = await stripeService.retrievePaymentMethod(paymentMethodId);
  const attachedCustomerId = getPaymentMethodCustomerId(paymentMethod);

  if (attachedCustomerId && attachedCustomerId !== customerId) {
    throw createHttpError("Stripe payment method belongs to a different customer.", 400);
  }

  if (attachedCustomerId === customerId) return paymentMethod;

  paymentMethod = await stripeService.attachPaymentMethod(paymentMethodId, customerId);
  const nextAttachedCustomerId = getPaymentMethodCustomerId(paymentMethod);

  if (nextAttachedCustomerId && nextAttachedCustomerId !== customerId) {
    throw createHttpError("Stripe payment method belongs to a different customer.", 400);
  }

  return paymentMethod;
}

async function resolvePaymentMethodSetup(client, payload) {
  if (!payload.setupIntentId) {
    return {
      customerId: await ensureClientStripeCustomer(client),
      paymentMethodId: payload.paymentMethodId,
    };
  }

  const setupIntent = await stripeService.retrieveSetupIntent(payload.setupIntentId);
  const setupClientId = setupIntent.metadata?.triviaGoatClientId || "";

  if (setupClientId && setupClientId !== client._id.toString()) {
    throw createHttpError("Stripe setup intent belongs to a different client.", 400);
  }

  if (setupIntent.status !== "succeeded") {
    throw createHttpError("Stripe card setup is not complete.", 400);
  }

  const setupPaymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;
  const setupCustomerId =
    typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;

  if (!setupPaymentMethodId || setupPaymentMethodId !== payload.paymentMethodId) {
    throw createHttpError("Stripe payment method does not match the setup intent.", 400);
  }

  if (!setupCustomerId) {
    throw createHttpError("Stripe setup intent customer is missing.", 400);
  }

  if (client.stripeCustomerId && client.stripeCustomerId !== setupCustomerId) {
    throw createHttpError("Stripe setup intent belongs to a different customer.", 400);
  }

  client.stripeCustomerId = setupCustomerId;
  await client.save();

  return {
    customerId: setupCustomerId,
    paymentMethodId: setupPaymentMethodId,
  };
}

async function setDefaultPaymentMethod(customerId, paymentMethodId) {
  try {
    return await stripeService.setDefaultPaymentMethod(customerId, paymentMethodId);
  } catch (error) {
    const message = String(error.message || "");
    if (!message.includes("must be attached to the customer")) throw error;

    await ensurePaymentMethodAttachedToCustomer(paymentMethodId, customerId);
    return stripeService.setDefaultPaymentMethod(customerId, paymentMethodId);
  }
}

async function loadMatchAndLocation(matchDbId) {
  ensureObjectId(matchDbId, "Match not found.");

  const match = await Match.findById(matchDbId);
  if (!match) throw createHttpError("Match not found.", 404);

  const location = await Location.findById(match.locationId);
  if (!location) throw createHttpError("Location not found.", 404);

  const game = await Game.findById(match.gameId);

  return { location, match, game };
}

function resolveBillingTotals(match, location, game = null) {
  const subtotalAmount = game?.totalPayment || match.defaultMatchPrice || location.defaultMatchPrice || 0;
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

async function sendReceiptSafely(transaction) {
  try {
    return await receiptService.sendMatchReceipt(transaction);
  } catch (error) {
    return {
      failureReason: error.message || "Receipt email failed to send.",
      sent: false,
    };
  }
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

  const game = await Game.findById(match.gameId);
  const totals = resolveBillingTotals(match, resolvedLocation, game);
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
  const { location, match, game } = await loadMatchAndLocation(matchDbId);

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

  const { amount } = resolveBillingTotals(match, location, game);

  let transaction = await createTransactionFromMatch(match, BILLING_STATUS.PENDING, location);

  try {
    if (!location.stripeCustomerId) throw createHttpError("Stripe customer is missing for this location.", 400);
    if (!location.stripePaymentMethodId) throw createHttpError("Stripe payment method is missing for this location.", 400);

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

    const receiptResult = await sendReceiptSafely(transaction);
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

  const receiptResult = await sendReceiptSafely(transaction);
  transaction.receiptSent = receiptResult.sent;
  if (!receiptResult.sent) transaction.failureReason = receiptResult.failureReason;
  await transaction.save();

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
    items: await addBillingContactNames(items),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

function buildRefundFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.transactionId) filter.transactionId = query.transactionId;
  if (query.matchId) filter.matchId = query.matchId;
  if (query.locationId) filter.locationId = query.locationId;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }
  return filter;
}

async function getRefunds(query) {
  const filter = buildRefundFilter(query);
  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    Refund.find(filter).sort({ [query.sortBy]: sortDirection }).skip(skip).limit(query.pageSize),
    Refund.countDocuments(filter),
  ]);

  return {
    items: items.map(toResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function getRefundById(id) {
  ensureObjectId(id, "Refund not found.");
  const refund = await Refund.findById(id);
  if (!refund) throw createHttpError("Refund not found.", 404);
  return toResponse(refund);
}

async function applyRefundTotals(transaction) {
  const succeededRefunds = await Refund.find({
    transactionId: transaction._id,
    status: "succeeded",
  }).select("amount stripeRefundId");

  const refundedAmount = succeededRefunds.reduce((sum, refund) => sum + refund.amount, 0);
  transaction.refundedAmount = Math.min(refundedAmount, transaction.amount);
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

async function createRefund(transactionId, payload, adminId) {
  ensureObjectId(transactionId, "Transaction not found.");
  ensureStripeSecretConfigured();

  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw createHttpError("Transaction not found.", 404);

  if (![BILLING_STATUS.CHARGED, BILLING_STATUS.PARTIALLY_REFUNDED].includes(transaction.billingStatus)) {
    throw createHttpError("Only charged transactions can be refunded.", 400);
  }

  if (!transaction.stripePaymentIntentId && !transaction.stripeChargeId) {
    throw createHttpError("Stripe payment reference is missing for this transaction.", 400);
  }

  const currentRefundedAmount = transaction.refundedAmount || 0;
  const remainingAmount = Math.max(transaction.amount - currentRefundedAmount, 0);
  if (remainingAmount <= 0) throw createHttpError("Transaction is already fully refunded.", 400);

  const refundAmount = payload.amount || remainingAmount;
  if (refundAmount > remainingAmount) {
    throw createHttpError("Refund amount exceeds remaining refundable amount.", 400);
  }

  const stripeRefund = await stripeService.createRefund(
    {
      amount: refundAmount,
      charge: transaction.stripeChargeId,
      metadata: {
        matchDbId: transaction.matchDbId.toString(),
        matchId: transaction.matchId,
        transactionId: transaction._id.toString(),
      },
      paymentIntent: transaction.stripePaymentIntentId,
      reason: payload.reason,
    },
    `transaction-refund-${transaction._id}-${Date.now()}`
  );
  const refundStatus = getRefundStatus(stripeRefund);

  const refund = await Refund.create({
    amount: stripeRefund.amount || refundAmount,
    currency: stripeRefund.currency || transaction.currency,
    failureReason: stripeRefund.failure_reason || "",
    locationId: transaction.locationId,
    locationName: transaction.locationName,
    matchDbId: transaction.matchDbId,
    matchId: transaction.matchId,
    note: payload.note || "",
    processedAt: refundStatus === "succeeded" ? new Date() : null,
    reason: payload.reason || "",
    requestedBy: adminId,
    status: refundStatus,
    stripeChargeId: stripeRefund.charge || transaction.stripeChargeId,
    stripePaymentIntentId: stripeRefund.payment_intent || transaction.stripePaymentIntentId,
    stripeRefundId: stripeRefund.id,
    transactionId: transaction._id,
  });

  if (refund.status === "succeeded") {
    await applyRefundTotals(transaction);
  } else {
    await transaction.save();
  }

  return {
    refund: toResponse(refund),
    transaction: toResponse(transaction),
  };
}

async function cancelRefund(refundId) {
  ensureObjectId(refundId, "Refund not found.");
  ensureStripeSecretConfigured();

  const refund = await Refund.findById(refundId);
  if (!refund) throw createHttpError("Refund not found.", 404);
  if (!refund.stripeRefundId) throw createHttpError("Stripe refund reference is missing.", 400);
  if (refund.status !== "requires_action") {
    throw createHttpError("Only refunds requiring action can be cancelled.", 400);
  }

  const stripeRefund = await stripeService.cancelRefund(refund.stripeRefundId);
  refund.status = getRefundStatus(stripeRefund);
  refund.cancelledAt = refund.status === "canceled" ? new Date() : refund.cancelledAt;
  refund.failureReason = stripeRefund.failure_reason || "";
  await refund.save();

  const transaction = await Transaction.findById(refund.transactionId);
  if (transaction) await applyRefundTotals(transaction);

  return toResponse(refund);
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

  const { customerId, paymentMethodId } = await resolvePaymentMethodSetup(client, payload);
  const paymentMethod = await ensurePaymentMethodAttachedToCustomer(paymentMethodId, customerId);
  await setDefaultPaymentMethod(customerId, paymentMethodId);
  const paymentSummary = summarizePaymentMethod(paymentMethod);

  client.billingMethod = "card";
  client.billingMode = BILLING_MODE.AUTO_CHARGE;
  client.stripeCustomerId = customerId;
  client.stripePaymentMethodId = paymentMethodId;
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
  const [response] = await addBillingContactNames([transaction]);
  return response;
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

  const receiptResult = await sendReceiptSafely(transaction);
  transaction.receiptSent = receiptResult.sent;
  if (!receiptResult.sent) transaction.failureReason = receiptResult.failureReason;
  await transaction.save();

  await Match.findByIdAndUpdate(transaction.matchDbId, {
    billingStatus: BILLING_STATUS.CHARGED,
    chargedAmount: transaction.amount,
    receiptSent: transaction.receiptSent,
  });

  return toResponse(transaction);
}

async function cancelTransaction(transactionId, payload) {
  ensureObjectId(transactionId, "Transaction not found.");
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw createHttpError("Transaction not found.", 404);
  if ([BILLING_STATUS.CHARGED, BILLING_STATUS.PARTIALLY_REFUNDED].includes(transaction.billingStatus)) {
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
    if (transaction.billingStatus === BILLING_STATUS.PARTIALLY_REFUNDED) summary.totalCharged += Math.max(transaction.amount - (transaction.refundedAmount || 0), 0);
    if (transaction.billingStatus === BILLING_STATUS.UNPAID || transaction.billingStatus === BILLING_STATUS.INVOICED) summary.totalUnpaid += transaction.amount;
    if (transaction.billingStatus === BILLING_STATUS.FAILED) summary.totalFailed += transaction.amount;
    if (transaction.billingStatus === BILLING_STATUS.REFUNDED) summary.totalRefunded += transaction.refundedAmount || transaction.amount;
    if (transaction.billingStatus === BILLING_STATUS.PARTIALLY_REFUNDED) summary.totalRefunded += transaction.refundedAmount || 0;

    const date = transaction.chargedAt || transaction.createdAt;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    summary.monthlyRevenue[key] = summary.monthlyRevenue[key] || 0;
    if (transaction.billingStatus === BILLING_STATUS.CHARGED) summary.monthlyRevenue[key] += transaction.amount;
    if (transaction.billingStatus === BILLING_STATUS.PARTIALLY_REFUNDED) summary.monthlyRevenue[key] += Math.max(transaction.amount - (transaction.refundedAmount || 0), 0);
  });

  return summary;
}

module.exports = {
  cancelTransaction,
  chargeClosedMatch,
  cancelRefund,
  createClientSetupIntent,
  createRefund,
  createTransactionFromMatch,
  getBillingSummary,
  getRefundById,
  getRefunds,
  getTransactionById,
  getTransactions,
  markInvoicePaid,
  markMatchInvoiceLater,
  processClosedMatchBilling,
  retryTransaction,
  saveClientPaymentMethod,
  sendMatchReceipt: receiptService.sendMatchReceipt,
};
