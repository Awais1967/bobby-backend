const mongoose = require("mongoose");

const Host = require("./host.model");

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toHostResponse(host) {
  if (!host) {
    return null;
  }

  const data = typeof host.toObject === "function" ? host.toObject() : host;

  delete data.password;
  delete data.__v;

  data.id = data._id.toString();
  delete data._id;

  return data;
}

function ensureObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError("Host not found.", 404);
  }
}

async function ensureUniqueHostEmail(email) {
  const existingHost = await Host.findOne({ email: email.toLowerCase() });

  if (existingHost) {
    throw createHttpError("Host email already exists.", 409);
  }
}

async function createHost(payload) {
  await ensureUniqueHostEmail(payload.email);

  const host = await Host.create({
    ...payload,
    email: payload.email.toLowerCase(),
  });

  return toHostResponse(host);
}

async function getHosts(query) {
  const {
    page,
    pageSize,
    search,
    status,
    locationId,
    sortBy,
    sortOrder,
  } = query;

  const filter = {};

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }];
  }

  if (status) {
    filter.status = status;
  }

  if (locationId) {
    filter.assignedLocationIds = locationId;
  }

  const skip = (page - 1) * pageSize;
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const [hosts, total] = await Promise.all([
    Host.find(filter)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageSize),
    Host.countDocuments(filter),
  ]);

  return {
    items: hosts.map(toHostResponse),
    total,
    page,
    pageSize,
  };
}

async function getHostById(id) {
  ensureObjectId(id);

  const host = await Host.findById(id);

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  return toHostResponse(host);
}

async function updateHost(id, payload) {
  ensureObjectId(id);

  const host = await Host.findById(id);

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  const allowedFields = ["name", "phone", "status", "assignedLocationIds"];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      host[field] = payload[field];
    }
  });

  await host.save();

  return toHostResponse(host);
}

async function changeHostPassword(id, payload) {
  ensureObjectId(id);

  if (payload.newPassword !== payload.confirmPassword) {
    throw createHttpError("Password and confirm password do not match.", 400);
  }

  const host = await Host.findById(id).select("+password");

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  host.password = payload.newPassword;
  await host.save();
}

async function updateHostStatus(id, status) {
  ensureObjectId(id);

  const host = await Host.findByIdAndUpdate(
    id,
    { status },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  return toHostResponse(host);
}

async function deleteHost(id) {
  ensureObjectId(id);

  const host = await Host.findById(id);

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  if (host.currentActiveMatchId) {
    throw createHttpError("Host cannot be deleted while running an active match.", 400);
  }

  await host.deleteOne();
}

module.exports = {
  changeHostPassword,
  createHost,
  deleteHost,
  getHostById,
  getHosts,
  updateHost,
  updateHostStatus,
};
