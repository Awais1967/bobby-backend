const mongoose = require("mongoose");

const Host = require("../hosts/host.model");
const Location = require("../locations/location.model");
const Game = require("./game.model");
const {
  deleteGameFromGoogleCalendar,
  syncGameToGoogleCalendar,
} = require("../../services/googleCalendar.service");

const minGameRounds = 1;
const maxGameRounds = 4;

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateGameRounds(rounds = []) {
  if (!Array.isArray(rounds) || rounds.length < minGameRounds) {
    throw createHttpError("Game must have at least 1 quarter.", 400);
  }

  if (rounds.length > maxGameRounds) {
    throw createHttpError("Game can have a maximum of 4 quarters.", 400);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureGameObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError("Game not found.", 404);
  }
}

function toGameResponse(game) {
  if (!game) {
    return null;
  }

  const data = typeof game.toObject === "function" ? game.toObject() : game;

  delete data.__v;
  if (data._id) {
    data.id = data._id.toString();
    delete data._id;
  }

  if (Array.isArray(data.assignedLocationIds)) {
    data.assignedLocationIds = data.assignedLocationIds.map((loc) => {
      if (loc && loc._id) {
        const o = typeof loc.toObject === "function" ? loc.toObject() : loc;
        delete o.__v;
        o.id = o._id.toString();
        delete o._id;
        return o;
      }
      return loc;
    });
  }

  if (Array.isArray(data.assignedHostIds)) {
    data.assignedHostIds = data.assignedHostIds.map((host) => {
      if (host && host._id) {
        const o = typeof host.toObject === "function" ? host.toObject() : host;
        delete o.__v;
        o.id = o._id.toString();
        delete o._id;
        return o;
      }
      return host;
    });
  }

  return data;
}

async function validateLocations(assignedLocationIds = []) {
  if (!assignedLocationIds || assignedLocationIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(assignedLocationIds.map((id) => id.toString()))];

  if (uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw createHttpError("One or more locations were not found.", 404);
  }

  const count = await Location.countDocuments({ _id: { $in: uniqueIds } });

  if (count !== uniqueIds.length) {
    throw createHttpError("One or more locations were not found.", 404);
  }

  return uniqueIds;
}

async function validateHosts(assignedHostIds = []) {
  if (!assignedHostIds || assignedHostIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(assignedHostIds.map((id) => id.toString()))];

  if (uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw createHttpError("One or more hosts were not found.", 404);
  }

  const count = await Host.countDocuments({ _id: { $in: uniqueIds } });

  if (count !== uniqueIds.length) {
    throw createHttpError("One or more hosts were not found.", 404);
  }

  return uniqueIds;
}

async function hasMatchReference(gameId) {
  if (!mongoose.modelNames().includes("Match")) {
    return false;
  }

  try {
    const Match = mongoose.model("Match");
    const match = await Match.findOne({
      $or: [{ gameId: gameId }, { gameTemplateId: gameId }],
    }).select("_id");

    return Boolean(match);
  } catch (error) {
    // Return false if anything fails to avoid runtime crashes
    return false;
  }
}

async function syncGameCalendarEvent(game) {
  try {
    const event = await syncGameToGoogleCalendar(game);
    const nextEventId = event?.id || "";

    if (nextEventId && game.googleCalendarEventId !== nextEventId) {
      game.googleCalendarEventId = nextEventId;
      await game.save();
    } else if (!nextEventId && game.googleCalendarEventId) {
      game.googleCalendarEventId = "";
      await game.save();
    }
  } catch (error) {
    console.warn(`Google Calendar sync skipped for game ${game._id}: ${error.message}`);
  }
}

async function deleteGameCalendarEvent(game) {
  try {
    await deleteGameFromGoogleCalendar(game);
    if (game.googleCalendarEventId) {
      game.googleCalendarEventId = "";
      await game.save();
    }
  } catch (error) {
    console.warn(`Google Calendar delete skipped for game ${game._id}: ${error.message}`);
  }
}

async function createGame(payload, adminId) {
  const finalStatus = payload.status || "draft";
  const rounds = payload.rounds || [];

  validateGameRounds(rounds);

  if ((finalStatus === "scheduled" || finalStatus === "active") && rounds.length === 0) {
    throw createHttpError("Game must have at least one round before scheduling.", 400);
  }

  const assignedLocationIds = await validateLocations(payload.assignedLocationIds);
  const assignedHostIds = await validateHosts(payload.assignedHostIds);

  const game = await Game.create({
    ...payload,
    assignedLocationIds,
    assignedHostIds,
    createdBy: adminId,
  });

  await syncGameCalendarEvent(game);

  return toGameResponse(game);
}

async function getGames(query) {
  const filter = {};

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ title: searchRegex }, { description: searchRegex }];
  }

  if (query.status) {
    filter.status = query.status;
  } else {
    filter.status = { $ne: "archived" };
  }

  if (query.type) {
    filter.type = query.type;
  }

  if (query.scheduledDate) {
    const startOfDay = new Date(query.scheduledDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(query.scheduledDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    filter.scheduledDate = {
      $gte: startOfDay,
      $lte: endOfDay,
    };
  }

  if (query.locationId) {
    filter.assignedLocationIds = query.locationId;
  }

  if (query.hostId) {
    filter.assignedHostIds = query.hostId;
  }

  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [games, total] = await Promise.all([
    Game.find(filter)
      .sort({ [query.sortBy]: sortDirection })
      .skip(skip)
      .limit(query.pageSize),
    Game.countDocuments(filter),
  ]);

  return {
    items: games.map(toGameResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function getGameById(id) {
  ensureGameObjectId(id);

  const game = await Game.findById(id)
    .populate("assignedLocationIds", "name city status")
    .populate("assignedHostIds", "name email status");

  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  return toGameResponse(game);
}

async function updateGame(id, payload) {
  ensureGameObjectId(id);

  const game = await Game.findById(id);
  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const finalStatus = payload.status || game.status;
  const finalRounds = payload.rounds || game.rounds || [];

  validateGameRounds(finalRounds);

  if ((finalStatus === "scheduled" || finalStatus === "active") && finalRounds.length === 0) {
    throw createHttpError("Game must have at least one round before scheduling.", 400);
  }

  if (payload.assignedLocationIds !== undefined) {
    payload.assignedLocationIds = await validateLocations(payload.assignedLocationIds);
  }

  if (payload.assignedHostIds !== undefined) {
    payload.assignedHostIds = await validateHosts(payload.assignedHostIds);
  }

  Object.entries(payload).forEach(([field, value]) => {
    game[field] = value;
  });

  await game.save();
  await syncGameCalendarEvent(game);

  return toGameResponse(
    await game.populate([
      { path: "assignedLocationIds", select: "name city status" },
      { path: "assignedHostIds", select: "name email status" },
    ])
  );
}

async function updateGameStatus(id, status) {
  ensureGameObjectId(id);

  const game = await Game.findById(id);
  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  try {
    validateGameRounds(game.rounds || []);
  } catch (error) {
    if (status === "scheduled" || status === "active") {
      throw error;
    }
  }

  if ((status === "scheduled" || status === "active") && (!game.rounds || game.rounds.length === 0)) {
    throw createHttpError("Game must have at least one round before scheduling.", 400);
  }

  game.status = status;
  await game.save();
  await syncGameCalendarEvent(game);

  return toGameResponse(
    await game.populate([
      { path: "assignedLocationIds", select: "name city status" },
      { path: "assignedHostIds", select: "name email status" },
    ])
  );
}

async function deleteGame(id) {
  ensureGameObjectId(id);

  const game = await Game.findById(id);
  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const isUsed = await hasMatchReference(game._id);

  if (isUsed) {
    game.status = "archived";
    await game.save();
    await deleteGameCalendarEvent(game);
    return { archived: true, message: "Game template is in use by matches, archived instead of deleted." };
  } else {
    await deleteGameCalendarEvent(game);
    await game.deleteOne();
    return { archived: false, message: "Game template deleted successfully." };
  }
}

async function duplicateGame(id, adminId) {
  ensureGameObjectId(id);

  const game = await Game.findById(id);
  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const gameObj = game.toObject();

  delete gameObj._id;
  delete gameObj.id;
  delete gameObj.createdAt;
  delete gameObj.updatedAt;
  delete gameObj.googleCalendarEventId;

  const newGamePayload = {
    ...gameObj,
    title: `Copy of ${gameObj.title}`,
    status: "draft",
    createdBy: adminId,
  };

  const newGame = await Game.create(newGamePayload);
  return toGameResponse(newGame);
}

async function getAvailableGamesForHost(hostId, query) {
  const targetDate = query.date ? new Date(query.date) : new Date();

  // Basic filter for scheduling and status
  const filter = {
    status: { $in: ["active", "scheduled"] },
    $and: [
      {
        $or: [
          { availableFrom: { $exists: false } },
          { availableFrom: null },
          { availableFrom: { $lte: targetDate } },
        ],
      },
      {
        $or: [
          { availableTo: { $exists: false } },
          { availableTo: null },
          { availableTo: { $gte: targetDate } },
        ],
      },
    ],
  };

  const orConditions = [{ isGlobal: true }, { assignedHostIds: hostId }];

  if (query.locationId) {
    // Check if the host is assigned to this location
    const host = await Host.findOne({ _id: hostId, assignedLocationIds: query.locationId });
    if (!host) {
      throw createHttpError("You are not assigned to this location.", 403);
    }
    orConditions.push({ assignedLocationIds: query.locationId });
  } else {
    // Check if any of host's assigned locations match
    const host = await Host.findById(hostId).select("assignedLocationIds");
    const assignedLocationIds = host ? host.assignedLocationIds || [] : [];
    if (assignedLocationIds.length > 0) {
      orConditions.push({ assignedLocationIds: { $in: assignedLocationIds } });
    }
  }

  filter.$or = orConditions;

  const skip = (query.page - 1) * query.pageSize;

  const [games, total] = await Promise.all([
    Game.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.pageSize),
    Game.countDocuments(filter),
  ]);

  return {
    items: games.map(toGameResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function assignGameLocations(gameId, assignedLocationIds) {
  ensureGameObjectId(gameId);

  const game = await Game.findById(gameId);
  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const validatedIds = await validateLocations(assignedLocationIds);
  game.assignedLocationIds = validatedIds;
  await game.save();

  return toGameResponse(
    await game.populate([
      { path: "assignedLocationIds", select: "name city status" },
      { path: "assignedHostIds", select: "name email status" },
    ])
  );
}

async function assignGameHosts(gameId, assignedHostIds) {
  ensureGameObjectId(gameId);

  const game = await Game.findById(gameId);
  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const validatedIds = await validateHosts(assignedHostIds);
  game.assignedHostIds = validatedIds;
  await game.save();

  return toGameResponse(
    await game.populate([
      { path: "assignedLocationIds", select: "name city status" },
      { path: "assignedHostIds", select: "name email status" },
    ])
  );
}

module.exports = {
  assignGameHosts,
  assignGameLocations,
  createGame,
  deleteGame,
  duplicateGame,
  getAvailableGamesForHost,
  getGameById,
  getGames,
  updateGame,
  updateGameStatus,
};
