const mongoose = require("mongoose");

const { MATCH_STATUS } = require("../../constants/matchStatus");
const Game = require("../games/game.model");
const Location = require("../locations/location.model");
const Match = require("../matches/match.model");
const hostEmailService = require("./host-email.service");
const Host = require("./host.model");

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

async function syncLocationsForHost(hostId, previousLocationIds = [], nextLocationIds = []) {
  const hostObjectId = new mongoose.Types.ObjectId(hostId.toString());
  const previousIds = previousLocationIds.map((id) => id.toString());
  const nextIds = nextLocationIds.map((id) => id.toString());
  const locationsToRemove = previousIds.filter((id) => !nextIds.includes(id));

  if (locationsToRemove.length > 0) {
    await Location.updateMany(
      { _id: { $in: locationsToRemove } },
      { $pull: { assignedHostIds: hostObjectId } }
    );
  }

  if (nextIds.length > 0) {
    await Location.updateMany(
      { _id: { $in: nextIds } },
      { $addToSet: { assignedHostIds: hostObjectId } }
    );
  }
}

async function createHost(payload) {
  await ensureUniqueHostEmail(payload.email);

  const plainPassword = payload.password;
  const host = await Host.create({
    ...payload,
    email: payload.email.toLowerCase(),
  });
  await syncLocationsForHost(host._id, [], host.assignedLocationIds || []);
  const assignedLocations = await Location.find({
    _id: { $in: host.assignedLocationIds || [] },
  }).lean();

  let emailDelivery = { delivered: false, failureReason: "Email delivery was not attempted." };
  try {
    emailDelivery = await hostEmailService.sendHostWelcomeEmail({
      host,
      plainPassword,
      locations: assignedLocations,
    });
  } catch (error) {
    console.error(`Host welcome email delivery failed: ${error.message}`);
    emailDelivery = {
      delivered: false,
      failureReason: error.message,
    };
  }

  return {
    host: toHostResponse(host),
    emailDelivery,
  };
}

async function getHosts(query) {
  const {
    includeArchived,
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
  } else if (!includeArchived) {
    filter.status = { $ne: "archived" };
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

  if (host.status === "archived" && Object.prototype.hasOwnProperty.call(payload, "status")) {
    throw createHttpError("Only archived hosts can be restored.", 400);
  }

  const allowedFields = ["name", "phone", "status", "assignedLocationIds"];
  const previousLocationIds = host.assignedLocationIds || [];
  const shouldSyncLocations = Object.prototype.hasOwnProperty.call(
    payload,
    "assignedLocationIds"
  );

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      host[field] = payload[field];
    }
  });

  await host.save();
  if (shouldSyncLocations) {
    await syncLocationsForHost(host._id, previousLocationIds, host.assignedLocationIds || []);
  }

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

  const host = await Host.findById(id);

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  if (host.status === "archived") {
    throw createHttpError("Only archived hosts can be restored.", 400);
  }

  host.status = status;
  await host.save();

  return toHostResponse(host);
}

async function hasActiveMatch(hostId) {
  const activeMatch = await Match.findOne({
    hostId,
    status: { $in: ACTIVE_MATCH_STATUSES },
  }).select("_id");

  return Boolean(activeMatch);
}

async function hasMatchHistory(hostId) {
  const match = await Match.findOne({ hostId }).select("_id");
  return Boolean(match);
}

async function removeHostAssignments(host) {
  await Promise.all([
    syncLocationsForHost(host._id, host.assignedLocationIds || [], []),
    Game.updateMany(
      { assignedHostIds: host._id },
      { $pull: { assignedHostIds: host._id } }
    ),
  ]);
}

async function archiveHost(id, adminId, reason = "") {
  ensureObjectId(id);

  const host = await Host.findById(id);

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  if (host.status === "archived") {
    throw createHttpError("Host is already archived.", 400);
  }

  if (await hasActiveMatch(host._id)) {
    throw createHttpError("Host cannot be archived while running an active match.", 400);
  }

  host.status = "archived";
  host.archivedAt = new Date();
  host.archivedBy = adminId;
  host.archiveReason = reason || "";
  host.currentActiveMatchId = null;

  await host.save();
  return toHostResponse(host);
}

async function restoreHost(id, adminId, payload = {}) {
  ensureObjectId(id);

  const host = await Host.findById(id);

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  if (host.status !== "archived") {
    throw createHttpError("Only archived hosts can be restored.", 400);
  }

  host.status = payload.status || "active";
  host.restoredAt = new Date();
  host.restoredBy = adminId;

  await host.save();
  return toHostResponse(host);
}

async function deleteHost(id, adminId) {
  ensureObjectId(id);

  const host = await Host.findById(id);

  if (!host) {
    throw createHttpError("Host not found.", 404);
  }

  if (await hasActiveMatch(host._id)) {
    throw createHttpError("Host cannot be deleted while running an active match.", 400);
  }

  const hasHistory = await hasMatchHistory(host._id);

  if (hasHistory && host.status !== "archived") {
    host.status = "archived";
    host.archivedAt = new Date();
    host.archivedBy = adminId;
    host.archiveReason = host.archiveReason || "Archived instead of deleted because host has match history.";
    host.currentActiveMatchId = null;
    await host.save();

    return {
      archived: true,
      host: toHostResponse(host),
      message: "Host has match history and was archived instead of deleted.",
    };
  }

  await removeHostAssignments(host);
  await host.deleteOne();

  return {
    archived: false,
    host: null,
    message: "Host deleted successfully",
  };
}

module.exports = {
  archiveHost,
  changeHostPassword,
  createHost,
  deleteHost,
  getHostById,
  getHosts,
  hasActiveMatch,
  hasMatchHistory,
  restoreHost,
  updateHost,
  updateHostStatus,
};
