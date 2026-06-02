const mongoose = require("mongoose");

const { MATCH_STATUS } = require("../../constants/matchStatus");
const Host = require("../hosts/host.model");
const Location = require("./location.model");

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

function ensureLocationObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError("Location not found.", 404);
  }
}

function toLocationResponse(location, options = {}) {
  if (!location) {
    return null;
  }

  const data = typeof location.toObject === "function" ? location.toObject() : location;

  delete data.__v;
  data.id = data._id.toString();
  delete data._id;

  if (!options.includeArchived && Array.isArray(data.assignedHostIds)) {
    data.assignedHostIds = data.assignedHostIds.filter((host) => {
      if (!host || !host.status) return true;
      return host.status !== "archived";
    });
  }

  return data;
}

function toHostSafeLocationResponse(location) {
  const data = toLocationResponse(location);

  return {
    id: data.id,
    name: data.name,
    clientName: data.clientName,
    city: data.city,
    state: data.state,
    country: data.country,
    timezone: data.timezone,
    status: data.status,
    logoUrl: data.logoUrl,
    promoImageUrl: data.promoImageUrl,
    intermissionMessage: data.intermissionMessage,
    welcomeMessage: data.welcomeMessage,
    gameOverMessage: data.gameOverMessage,
    billingMode: data.billingMode,
  };
}

function buildLocationFilter(query) {
  const filter = {};

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [
      { name: searchRegex },
      { clientName: searchRegex },
      { contactEmail: searchRegex },
      { city: searchRegex },
    ];
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.country) {
    filter.country = new RegExp(`^${escapeRegex(query.country)}$`, "i");
  }

  if (query.city) {
    filter.city = new RegExp(`^${escapeRegex(query.city)}$`, "i");
  }

  if (query.billingMode) {
    filter.billingMode = query.billingMode;
  }

  if (query.hostId) {
    filter.assignedHostIds = query.hostId;
  }

  return filter;
}

async function validateAssignedHosts(assignedHostIds = []) {
  const uniqueHostIds = [...new Set(assignedHostIds.map((id) => id.toString()))];

  if (uniqueHostIds.length === 0) {
    return uniqueHostIds;
  }

  const count = await Host.countDocuments({
    _id: { $in: uniqueHostIds },
    status: { $ne: "archived" },
  });

  if (count !== uniqueHostIds.length) {
    throw createHttpError("One or more assigned hosts were not found.", 404);
  }

  return uniqueHostIds;
}

async function syncHostsForLocation(locationId, previousHostIds = [], nextHostIds = []) {
  const locationObjectId = new mongoose.Types.ObjectId(locationId.toString());
  const previousIds = previousHostIds.map((id) => id.toString());
  const nextIds = nextHostIds.map((id) => id.toString());
  const hostsToRemove = previousIds.filter((id) => !nextIds.includes(id));

  if (hostsToRemove.length > 0) {
    await Host.updateMany(
      { _id: { $in: hostsToRemove } },
      { $pull: { assignedLocationIds: locationObjectId } }
    );
  }

  if (nextIds.length > 0) {
    await Host.updateMany(
      { _id: { $in: nextIds } },
      { $addToSet: { assignedLocationIds: locationObjectId } }
    );
  }
}

function ensureAutoChargeBillingContact(location) {
  if (location.billingMode === "auto_charge" && !location.billingContactEmail) {
    throw createHttpError("billingContactEmail is required when billingMode is auto_charge.", 400);
  }
}

async function hasActiveMatch(locationId) {
  if (!mongoose.modelNames().includes("Match")) {
    return false;
  }

  const Match = mongoose.model("Match");
  const activeMatch = await Match.findOne({
    locationId,
    status: { $in: ACTIVE_MATCH_STATUSES },
  }).select("_id");

  return Boolean(activeMatch);
}

async function createLocation(payload) {
  const assignedHostIds = await validateAssignedHosts(payload.assignedHostIds);

  const location = await Location.create({
    ...payload,
    clientName: payload.clientName || payload.name,
    assignedHostIds,
  });

  await syncHostsForLocation(location._id, [], assignedHostIds);

  return toLocationResponse(await location.populate("assignedHostIds", "name email status"));
}

async function getLocations(query) {
  const filter = buildLocationFilter(query);
  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [locations, total] = await Promise.all([
    Location.find(filter)
      .populate("assignedHostIds", "name email status")
      .sort({ [query.sortBy]: sortDirection })
      .skip(skip)
      .limit(query.pageSize),
    Location.countDocuments(filter),
  ]);

  return {
    items: locations.map((location) =>
      toLocationResponse(location, { includeArchived: query.includeArchived })
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function getLocationById(id, options = {}) {
  ensureLocationObjectId(id);

  const location = await Location.findById(id).populate("assignedHostIds", "name email status");

  if (!location) {
    throw createHttpError("Location not found.", 404);
  }

  return toLocationResponse(location, { includeArchived: options.includeArchived });
}

async function updateLocation(id, payload) {
  ensureLocationObjectId(id);

  const location = await Location.findById(id);

  if (!location) {
    throw createHttpError("Location not found.", 404);
  }

  const previousHostIds = location.assignedHostIds || [];
  let nextHostIds = previousHostIds.map((hostId) => hostId.toString());

  if (Object.prototype.hasOwnProperty.call(payload, "assignedHostIds")) {
    nextHostIds = await validateAssignedHosts(payload.assignedHostIds);
  }

  Object.entries(payload).forEach(([field, value]) => {
    location[field] = value;
  });

  if (!location.clientName) {
    location.clientName = location.name;
  }

  location.assignedHostIds = nextHostIds;
  ensureAutoChargeBillingContact(location);

  await location.save();
  await syncHostsForLocation(location._id, previousHostIds, nextHostIds);

  return toLocationResponse(await location.populate("assignedHostIds", "name email status"));
}

async function updateLocationStatus(id, status) {
  ensureLocationObjectId(id);

  const location = await Location.findByIdAndUpdate(
    id,
    { status },
    {
      new: true,
      runValidators: true,
    }
  ).populate("assignedHostIds", "name email status");

  if (!location) {
    throw createHttpError("Location not found.", 404);
  }

  return toLocationResponse(location);
}

async function deleteLocation(id) {
  ensureLocationObjectId(id);

  const location = await Location.findById(id);

  if (!location) {
    throw createHttpError("Location not found.", 404);
  }

  if (await hasActiveMatch(location._id)) {
    throw createHttpError("Location cannot be deleted while it has an active match.", 400);
  }

  await syncHostsForLocation(location._id, location.assignedHostIds, []);
  await location.deleteOne();
}

async function getHostAssignedLocations(hostId, query) {
  const filter = {
    assignedHostIds: hostId,
    status: query.status || "active",
  };

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ name: searchRegex }, { clientName: searchRegex }, { city: searchRegex }];
  }

  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [locations, total] = await Promise.all([
    Location.find(filter)
      .sort({ [query.sortBy]: sortDirection })
      .skip(skip)
      .limit(query.pageSize),
    Location.countDocuments(filter),
  ]);

  return {
    items: locations.map(toHostSafeLocationResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function assignHostsToLocation(locationId, assignedHostIds) {
  ensureLocationObjectId(locationId);

  const location = await Location.findById(locationId);

  if (!location) {
    throw createHttpError("Location not found.", 404);
  }

  const previousHostIds = location.assignedHostIds || [];
  const nextHostIds = await validateAssignedHosts(assignedHostIds);

  location.assignedHostIds = nextHostIds;
  await location.save();
  await syncHostsForLocation(location._id, previousHostIds, nextHostIds);

  return toLocationResponse(await location.populate("assignedHostIds", "name email status"));
}

module.exports = {
  assignHostsToLocation,
  createLocation,
  deleteLocation,
  getHostAssignedLocations,
  getLocationById,
  getLocations,
  updateLocation,
  updateLocationStatus,
};
