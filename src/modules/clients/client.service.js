const mongoose = require("mongoose");

const { getStripeClient } = require("../../config/stripe");
const { MATCH_STATUS } = require("../../constants/matchStatus");
const fileUploadService = require("../../services/fileUpload.service");
const Host = require("../hosts/host.model");
const Match = require("../matches/match.model");
const Transaction = require("../billing/transaction.model");
const Location = require("../locations/location.model");

const ACTIVE_MATCH_STATUSES = [
  MATCH_STATUS.SETUP,
  MATCH_STATUS.WAITING,
  MATCH_STATUS.LIVE,
  MATCH_STATUS.INTERMISSION,
];

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureClientObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError("Client not found.", 404);
  }
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [value];
}

function normalizeClientPayload(payload = {}) {
  const data = { ...payload };

  if (data.clientName && !data.name) data.name = data.clientName;
  if (data.location && !data.venueLocation) data.venueLocation = data.location;
  if (data.venueLocation && !data.location) data.location = data.venueLocation;
  if (data.venueLocation && !data.address) data.address = data.venueLocation;
  if (data.clientEmail && !data.contactEmail) data.contactEmail = data.clientEmail;
  if (data.clientEmail && !data.billingContactEmail) data.billingContactEmail = data.clientEmail;

  if (data.billingMethod) {
    data.billingMode = data.billingMethod === "card" ? "auto_charge" : "invoice_later";
  } else if (data.billingMode) {
    data.billingMethod = data.billingMode === "auto_charge" ? "card" : "invoice";
  }

  if (Object.prototype.hasOwnProperty.call(data, "assignedHostIds")) {
    data.assignedHostIds = normalizeArray(data.assignedHostIds);
  }

  if (Object.prototype.hasOwnProperty.call(data, "billingContactEmails")) {
    data.billingContactEmails = normalizeArray(data.billingContactEmails);
  }

  return data;
}

function buildMaskedPaymentMethod(payload = {}) {
  if (payload.maskedPaymentMethod) return payload.maskedPaymentMethod;
  if (!payload.cardBrand || !payload.cardLast4) return "";
  return `${payload.cardBrand} ending in ${payload.cardLast4}`;
}

function removeRawCardFields(payload) {
  const data = { ...payload };
  delete data.cardNumber;
  delete data.cvv;
  delete data.cvvCode;
  delete data.cardCvv;
  delete data.stripeCustomerId;
  delete data.stripePaymentMethodId;
  return data;
}

function ensureNoRawCardFields(payload = {}) {
  if (payload.cardNumber || payload.cvv || payload.cvvCode || payload.cardCvv) {
    throw createHttpError("Do not send raw card number or CVV. Use Stripe payment method token.", 400);
  }
}

function ensureVenue(payload) {
  if (!payload.venueLocation && !payload.location) {
    throw createHttpError("Venue location is required.", 400);
  }
}

function ensureClientBilling(payload, existingClient = null) {
  if (!payload.billingMethod) return;

  if (payload.billingMethod !== "card" && payload.billingMethod !== "invoice") {
    throw createHttpError("Invalid billing method.", 400);
  }

  if (payload.billingMethod === "card") {
    const hasPaymentMethod = payload.stripePaymentMethodId || existingClient?.stripePaymentMethodId;

    if (!hasPaymentMethod) {
      throw createHttpError("Stripe payment method is required for card billing.", 400);
    }
  }

  if (payload.discountType === "percentage" && payload.discountValue > 100) {
    throw createHttpError("Discount value must be between 0 and 100 for percentage discounts.", 400);
  }
}

function toClientResponse(client, options = {}) {
  if (!client) return null;

  const data = typeof client.toObject === "function" ? client.toObject() : { ...client };
  delete data.__v;
  delete data.cardNumber;
  delete data.cvv;
  delete data.cvvCode;
  delete data.cardCvv;

  if (data._id) {
    data.id = data._id.toString();
    delete data._id;
  }

  if (!options.includeArchived && Array.isArray(data.assignedHostIds)) {
    data.assignedHostIds = data.assignedHostIds.filter((host) => !host.status || host.status !== "archived");
  }

  if (options.tableOnly) {
    return {
      id: data.id,
      clientName: data.clientName,
      venueLocation: data.venueLocation || data.location || data.address,
      city: data.city,
      zip: data.zip,
      billingMethod: data.billingMethod,
      clientEmail: data.clientEmail,
      lastLoginAt: data.lastLoginAt,
      status: data.status,
      logoUrl: data.logoUrl,
    };
  }

  if (options.hostSafe) {
    return {
      id: data.id,
      clientName: data.clientName,
      venueLocation: data.venueLocation || data.location || data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      status: data.status,
      logoUrl: data.logoUrl,
      billingMethod: data.billingMethod,
    };
  }

  return data;
}

async function validateAssignedHosts(assignedHostIds = []) {
  const uniqueHostIds = [...new Set(assignedHostIds.map((id) => id.toString()))];

  if (uniqueHostIds.length === 0) return uniqueHostIds;

  const count = await Host.countDocuments({
    _id: { $in: uniqueHostIds },
    status: { $ne: "archived" },
  });

  if (count !== uniqueHostIds.length) {
    throw createHttpError("Archived clients cannot be assigned to hosts.", 400);
  }

  return uniqueHostIds;
}

async function syncHostsForClient(clientId, previousHostIds = [], nextHostIds = []) {
  const clientObjectId = new mongoose.Types.ObjectId(clientId.toString());
  const previousIds = previousHostIds.map((id) => id.toString());
  const nextIds = nextHostIds.map((id) => id.toString());
  const hostsToRemove = previousIds.filter((id) => !nextIds.includes(id));

  if (hostsToRemove.length > 0) {
    await Host.updateMany(
      { _id: { $in: hostsToRemove } },
      { $pull: { assignedLocationIds: clientObjectId } }
    );
  }

  if (nextIds.length > 0) {
    await Host.updateMany(
      { _id: { $in: nextIds } },
      { $addToSet: { assignedLocationIds: clientObjectId } }
    );
  }
}

async function uploadClientLogo(file) {
  if (!file) return "";
  return fileUploadService.uploadFile(file, { folder: "clients/logos" });
}

async function ensureStripePaymentSetup(payload, client = null) {
  if (payload.billingMethod !== "card" || !payload.stripePaymentMethodId || !process.env.STRIPE_SECRET_KEY) {
    return {};
  }

  const stripe = getStripeClient();
  const customerId =
    client?.stripeCustomerId ||
    (
      await stripe.customers.create({
        email: payload.clientEmail || client?.clientEmail || client?.contactEmail,
        name: payload.clientName || client?.clientName || client?.name,
        metadata: {
          triviaGoatClientId: client?._id ? client._id.toString() : "",
        },
      })
    ).id;

  await stripe.paymentMethods.attach(payload.stripePaymentMethodId, {
    customer: customerId,
  }).catch((error) => {
    if (error.code !== "resource_already_exists") throw error;
  });

  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: payload.stripePaymentMethodId,
    },
  });

  return { stripeCustomerId: customerId };
}

function buildClientFilter(query) {
  const filter = {};

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [
      { clientName: searchRegex },
      { name: searchRegex },
      { venueLocation: searchRegex },
      { location: searchRegex },
      { city: searchRegex },
      { zip: searchRegex },
      { clientEmail: searchRegex },
      { contactEmail: searchRegex },
    ];
  }

  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, "i");
  if (query.state) filter.state = new RegExp(`^${escapeRegex(query.state)}$`, "i");
  if (query.zip) filter.zip = new RegExp(`^${escapeRegex(query.zip)}$`, "i");
  if (query.billingMethod) filter.billingMethod = query.billingMethod;

  if (query.status) {
    filter.status = query.status;
  } else if (!query.includeArchived) {
    filter.status = { $ne: "archived" };
  }

  return filter;
}

async function createClient(payload, file, adminId) {
  ensureNoRawCardFields(payload);
  let data = normalizeClientPayload(removeRawCardFields(payload));
  ensureVenue(data);
  ensureClientBilling(data);

  const assignedHostIds = await validateAssignedHosts(data.assignedHostIds || []);
  const logoUrl = await uploadClientLogo(file);
  if (logoUrl) data.logoUrl = logoUrl;
  data.maskedPaymentMethod = buildMaskedPaymentMethod(data);

  const stripeSetup = await ensureStripePaymentSetup(data);
  data = { ...data, ...stripeSetup, assignedHostIds };

  const client = await Location.create(data);
  await syncHostsForClient(client._id, [], assignedHostIds);

  return toClientResponse(await client.populate("assignedHostIds", "name email status"), {
    includeArchived: true,
  });
}

async function getClients(query) {
  const filter = buildClientFilter(query);
  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [clients, total] = await Promise.all([
    Location.find(filter)
      .sort({ [query.sortBy]: sortDirection })
      .skip(skip)
      .limit(query.pageSize)
      .lean(),
    Location.countDocuments(filter),
  ]);

  return {
    items: clients.map((client) => toClientResponse(client, { tableOnly: true })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function getClientById(id) {
  ensureClientObjectId(id);

  const client = await Location.findById(id).populate("assignedHostIds", "name email status");

  if (!client) {
    throw createHttpError("Client not found.", 404);
  }

  return toClientResponse(client, { includeArchived: true });
}

async function updateClient(id, payload, file) {
  ensureClientObjectId(id);
  ensureNoRawCardFields(payload);

  const client = await Location.findById(id);
  if (!client) throw createHttpError("Client not found.", 404);

  let data = normalizeClientPayload(removeRawCardFields(payload));
  const merged = normalizeClientPayload({ ...client.toObject(), ...data });
  ensureVenue(merged);
  ensureClientBilling(merged, client);

  const previousHostIds = client.assignedHostIds || [];
  let nextHostIds = previousHostIds.map((hostId) => hostId.toString());
  if (Object.prototype.hasOwnProperty.call(data, "assignedHostIds")) {
    nextHostIds = await validateAssignedHosts(data.assignedHostIds);
  }

  const logoUrl = await uploadClientLogo(file);
  if (logoUrl) data.logoUrl = logoUrl;
  data.maskedPaymentMethod = buildMaskedPaymentMethod({ ...client.toObject(), ...data });

  const stripeSetup = await ensureStripePaymentSetup({ ...client.toObject(), ...data }, client);
  data = { ...data, ...stripeSetup };

  Object.entries(data).forEach(([field, value]) => {
    client[field] = value;
  });
  client.assignedHostIds = nextHostIds;

  await client.save();
  await syncHostsForClient(client._id, previousHostIds, nextHostIds);

  return toClientResponse(await client.populate("assignedHostIds", "name email status"), {
    includeArchived: true,
  });
}

async function updateClientBillingMethod(id, payload) {
  ensureClientObjectId(id);
  ensureNoRawCardFields(payload);

  const client = await Location.findById(id);
  if (!client) throw createHttpError("Client not found.", 404);

  const data = normalizeClientPayload(removeRawCardFields(payload));
  ensureClientBilling(data, client);
  data.maskedPaymentMethod = data.billingMethod === "card" ? buildMaskedPaymentMethod(data) : client.maskedPaymentMethod;

  const stripeSetup = await ensureStripePaymentSetup({ ...client.toObject(), ...data }, client);
  Object.entries({ ...data, ...stripeSetup }).forEach(([field, value]) => {
    client[field] = value;
  });

  await client.save();
  return toClientResponse(client, { includeArchived: true });
}

async function hasActiveClientMatch(clientId) {
  const activeMatch = await Match.findOne({
    locationId: clientId,
    status: { $in: ACTIVE_MATCH_STATUSES },
  }).select("_id");

  return Boolean(activeMatch);
}

async function hasClientHistory(clientId) {
  const [match, transaction] = await Promise.all([
    Match.findOne({ locationId: clientId }).select("_id"),
    Transaction.findOne({ locationId: clientId }).select("_id"),
  ]);

  return Boolean(match || transaction);
}

async function archiveClient(id, adminId, reason = "") {
  ensureClientObjectId(id);

  const client = await Location.findById(id);
  if (!client) throw createHttpError("Client not found.", 404);
  if (client.status === "archived") throw createHttpError("Client is already archived.", 400);
  if (await hasActiveClientMatch(client._id)) {
    throw createHttpError("Client cannot be archived while it has an active match.", 400);
  }

  client.status = "archived";
  client.archivedAt = new Date();
  client.archivedBy = adminId;
  client.archiveReason = reason || "";
  await client.save();

  return toClientResponse(client, { includeArchived: true });
}

async function restoreClient(id, adminId, payload = {}) {
  ensureClientObjectId(id);

  const client = await Location.findById(id);
  if (!client) throw createHttpError("Client not found.", 404);
  if (client.status !== "archived") throw createHttpError("Only archived clients can be restored.", 400);

  client.status = payload.status || "active";
  client.restoredAt = new Date();
  client.restoredBy = adminId;
  await client.save();

  return toClientResponse(client, { includeArchived: true });
}

async function deleteClient(id, adminId) {
  ensureClientObjectId(id);

  const client = await Location.findById(id);
  if (!client) throw createHttpError("Client not found.", 404);
  if (await hasActiveClientMatch(client._id)) {
    throw createHttpError("Client cannot be archived while it has an active match.", 400);
  }

  if (await hasClientHistory(client._id)) {
    if (client.status !== "archived") {
      client.status = "archived";
      client.archivedAt = new Date();
      client.archivedBy = adminId;
      client.archiveReason = client.archiveReason || "Archived instead of deleted because client has history.";
      await client.save();
    }

    return {
      archived: true,
      client: toClientResponse(client, { includeArchived: true }),
      message: "Client has history and was archived instead of deleted.",
    };
  }

  await syncHostsForClient(client._id, client.assignedHostIds, []);
  await client.deleteOne();

  return {
    archived: false,
    client: null,
    message: "Client deleted successfully",
  };
}

async function getMyClients(hostId) {
  const clients = await Location.find({
    assignedHostIds: hostId,
    status: "active",
  })
    .sort({ clientName: 1, name: 1 })
    .lean();

  return {
    items: clients.map((client) => toClientResponse(client, { hostSafe: true })),
    total: clients.length,
  };
}

async function assignClientHosts(id, assignedHostIds) {
  ensureClientObjectId(id);

  const client = await Location.findById(id);
  if (!client) throw createHttpError("Client not found.", 404);
  if (client.status === "archived") throw createHttpError("Archived clients cannot be assigned to hosts.", 400);

  const previousHostIds = client.assignedHostIds || [];
  const nextHostIds = await validateAssignedHosts(assignedHostIds);

  client.assignedHostIds = nextHostIds;
  await client.save();
  await syncHostsForClient(client._id, previousHostIds, nextHostIds);

  return toClientResponse(await client.populate("assignedHostIds", "name email status"), {
    includeArchived: true,
  });
}

module.exports = {
  archiveClient,
  assignClientHosts,
  buildMaskedPaymentMethod,
  createClient,
  deleteClient,
  getClientById,
  getClients,
  getMyClients,
  hasActiveClientMatch,
  hasClientHistory,
  restoreClient,
  updateClient,
  updateClientBillingMethod,
  uploadClientLogo,
};
