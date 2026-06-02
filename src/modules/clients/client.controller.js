const clientService = require("./client.service");
const {
  archiveClientValidation,
  assignClientHostsValidation,
  createClientValidation,
  getClientsQueryValidation,
  restoreClientValidation,
  updateClientBillingMethodValidation,
  updateClientValidation,
  validate,
} = require("./client.validation");

const arrayFields = new Set(["assignedHostIds", "billingContactEmails"]);
const booleanFields = new Set(["pricingDiscount"]);
const numberFields = new Set([
  "discountValue",
  "cardExpMonth",
  "cardExpYear",
  "defaultMatchPrice",
]);

function parseJson(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function normalizeArrayField(value) {
  if (Array.isArray(value)) return value.map((item) => parseJson(item));
  if (value === undefined) return value;

  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed;

  if (typeof value === "string") {
    if (!value.trim()) return [];
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [value];
}

function normalizeMultipartBody(body = {}) {
  return Object.entries(body).reduce((payload, [field, rawValue]) => {
    let value = Array.isArray(rawValue) && rawValue.length === 1 ? rawValue[0] : rawValue;

    if (arrayFields.has(field)) {
      value = normalizeArrayField(value);
    } else if (booleanFields.has(field) && typeof value === "string") {
      value = value === "true" || value === "1";
    } else if (numberFields.has(field)) {
      value = value === "" || value === undefined ? null : Number(value);
    }

    payload[field] = value;
    return payload;
  }, {});
}

async function createClient(req, res, next) {
  try {
    const rawPayload = normalizeMultipartBody(req.body);
    const payload = validate(createClientValidation, rawPayload);
    const client = await clientService.createClient(payload, req.file, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Client created successfully",
      data: { client },
    });
  } catch (error) {
    return next(error);
  }
}

async function getClients(req, res, next) {
  try {
    const query = validate(getClientsQueryValidation, req.query);
    const data = await clientService.getClients(query);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getClientById(req, res, next) {
  try {
    const client = await clientService.getClientById(req.params.id);

    return res.status(200).json({
      success: true,
      data: { client },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateClient(req, res, next) {
  try {
    const rawPayload = normalizeMultipartBody(req.body);
    if (req.file && Object.keys(rawPayload).length === 0) {
      rawPayload.logoUrl = "";
    }
    const payload = validate(updateClientValidation, rawPayload);
    const client = await clientService.updateClient(req.params.id, payload, req.file);

    return res.status(200).json({
      success: true,
      message: "Client updated successfully",
      data: { client },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateClientBillingMethod(req, res, next) {
  try {
    const payload = validate(updateClientBillingMethodValidation, req.body);
    const client = await clientService.updateClientBillingMethod(req.params.id, payload);

    return res.status(200).json({
      success: true,
      message: "Client billing method updated successfully",
      data: { client },
    });
  } catch (error) {
    return next(error);
  }
}

async function archiveClient(req, res, next) {
  try {
    const payload = validate(archiveClientValidation, req.body || {});
    const client = await clientService.archiveClient(req.params.id, req.user.id, payload.reason);

    return res.status(200).json({
      success: true,
      message: "Client archived successfully",
      data: { client },
    });
  } catch (error) {
    return next(error);
  }
}

async function restoreClient(req, res, next) {
  try {
    const payload = validate(restoreClientValidation, req.body || {});
    const client = await clientService.restoreClient(req.params.id, req.user.id, payload);

    return res.status(200).json({
      success: true,
      message: "Client restored successfully",
      data: { client },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteClient(req, res, next) {
  try {
    const result = await clientService.deleteClient(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.client
        ? { archived: result.archived, client: result.client }
        : { archived: result.archived },
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyClients(req, res, next) {
  try {
    const data = await clientService.getMyClients(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function assignClientHosts(req, res, next) {
  try {
    const payload = validate(assignClientHostsValidation, req.body);
    const client = await clientService.assignClientHosts(req.params.id, payload.assignedHostIds);

    return res.status(200).json({
      success: true,
      message: "Client hosts updated successfully",
      data: { client },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  archiveClient,
  assignClientHosts,
  createClient,
  deleteClient,
  getClientById,
  getClients,
  getMyClients,
  restoreClient,
  updateClient,
  updateClientBillingMethod,
};
