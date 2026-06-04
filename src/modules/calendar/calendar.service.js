const mongoose = require("mongoose");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");
const { MATCH_STATUS } = require("../../constants/matchStatus");
const { buildPaginationResponse, getPagination } = require("../../utils/pagination");
const {
  calculateDurationMinutes,
  formatCalendarEventDate,
  formatReportTime,
} = require("../../utils/date");
const Game = require("../games/game.model");
const Match = require("../matches/match.model");
const Team = require("../matches/team.model");
const reportService = require("../reports/report.service");

const CALENDAR_GAME_STATUSES = ["draft", "scheduled", "active"];
const CALENDAR_TEAM_STAGE_LIMIT = 25;
const CALENDAR_GAME_SELECT = "title description type status scheduledDate availableFrom availableTo isRecurring recurrenceRule isGlobal assignedLocationIds assignedHostIds totalQuestions";

function idToString(value) {
  return value ? String(value) : null;
}

function refIdToString(value) {
  if (!value) return null;
  return idToString(value._id || value);
}

function refName(value) {
  if (!value || typeof value !== "object") return "";
  return value.name || value.email || "";
}

function joinRefNames(values = []) {
  return values.map(refName).filter(Boolean).join(", ");
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

function buildMonthRange(month, year) {
  const safeMonth = Number(month);
  const safeYear = Number(year);

  const start = new Date(Date.UTC(safeYear, safeMonth - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(safeYear, safeMonth, 0, 23, 59, 59, 999));

  return { start, end };
}

function buildDateRange(startDate, endDate) {
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

function buildDayRange(date) {
  const base = new Date(date);
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCalendarMatchFilter(query = {}, { defaultToCompleted = true } = {}) {
  const filter = {};

  if (query.locationId) filter.locationId = toObjectId(query.locationId);
  if (query.hostId) filter.hostId = toObjectId(query.hostId);
  if (query.gameId) filter.gameId = toObjectId(query.gameId);
  if (query.billingStatus) filter.billingStatus = query.billingStatus;
  if (query.billingMode) filter.billingMode = query.billingMode;

  if (query.matchStatus) {
    filter.status = query.matchStatus;
  } else if (defaultToCompleted) {
    filter.status = { $in: [MATCH_STATUS.CLOSED, MATCH_STATUS.COMPLETED] };
  }

  return filter;
}

function buildCalendarDateCondition(start, end) {
  const range = { $gte: start, $lte: end };
  return [
    { startedAt: range },
    { startedAt: null, createdAt: range },
  ];
}

function mergeDateCondition(filter, start, end) {
  const dateCondition = buildCalendarDateCondition(start, end);
  if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, { $or: dateCondition }];
    delete filter.$or;
  } else {
    filter.$or = dateCondition;
  }
}

function applySearchCondition(filter, search) {
  if (!search) return;
  const regex = new RegExp(escapeRegex(search), "i");
  const searchConditions = [
    { matchId: regex },
    { gameTitle: regex },
    { locationName: regex },
    { hostName: regex },
  ];

  if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
    delete filter.$or;
  } else {
    filter.$or = searchConditions;
  }
}

function buildCalendarGameFilter(query = {}, start, end) {
  const filter = {
    status: query.gameStatus || { $in: CALENDAR_GAME_STATUSES },
    scheduledDate: { $gte: start, $lte: end },
  };

  if (query.gameId) filter._id = toObjectId(query.gameId);
  if (query.locationId) filter.assignedLocationIds = toObjectId(query.locationId);
  if (query.hostId) filter.assignedHostIds = toObjectId(query.hostId);
  if (query.gameType) filter.type = query.gameType;

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ title: regex }, { description: regex }, { type: regex }, { status: regex }];
  }

  return filter;
}

function calendarGameQuery(query, start, end) {
  return Game.find(buildCalendarGameFilter(query, start, end))
    .select(CALENDAR_GAME_SELECT)
    .populate("assignedLocationIds", "name city status")
    .populate("assignedHostIds", "name email status")
    .sort({ scheduledDate: 1 });
}

function pickMatchSort(sortBy, sortOrder) {
  const allowed = new Set([
    "startedAt",
    "closedAt",
    "createdAt",
    "matchId",
    "gameTitle",
    "locationName",
    "hostName",
  ]);
  const safeSortBy = allowed.has(sortBy) ? sortBy : "startedAt";
  const direction = sortOrder === "asc" ? 1 : -1;
  return { [safeSortBy]: direction, createdAt: -1 };
}

function getEndedAt(match) {
  return match.closedAt || match.endedAt || null;
}

function formatMatchEvent(match) {
  const endedAt = getEndedAt(match);

  return {
    id: match.matchId,
    type: "match",
    dbId: idToString(match._id),
    title: match.gameTitle,
    date: formatCalendarEventDate(match.startedAt || match.createdAt),
    startTime: formatReportTime(match.startedAt),
    endTime: formatReportTime(endedAt),
    startedAt: match.startedAt,
    closedAt: match.closedAt,
    endedAt,
    durationMinutes: calculateDurationMinutes(match.startedAt, endedAt),
    locationId: idToString(match.locationId),
    locationName: match.locationName,
    hostId: idToString(match.hostId),
    hostName: match.hostName,
    gameId: idToString(match.gameId),
    gameTitle: match.gameTitle,
    status: match.status,
    currentState: match.currentState,
    billingStatus: match.billingStatus,
    billingMode: match.billingMode,
    chargedAmount: match.chargedAmount || 0,
    currency: match.currency || "usd",
    teamCount: match.totalTeams || 0,
  };
}

function formatGameEvent(game) {
  const locations = game.assignedLocationIds || [];
  const hosts = game.assignedHostIds || [];

  return {
    id: idToString(game._id),
    type: "game",
    title: game.title,
    description: game.description || "",
    gameType: game.type,
    status: game.status,
    date: formatCalendarEventDate(game.scheduledDate),
    scheduledDate: game.scheduledDate,
    availableFrom: game.availableFrom,
    availableTo: game.availableTo,
    isRecurring: Boolean(game.isRecurring),
    recurrenceRule: game.recurrenceRule || "",
    isGlobal: Boolean(game.isGlobal),
    locationIds: locations.map(refIdToString).filter(Boolean),
    locationName: joinRefNames(locations),
    hostIds: hosts.map(refIdToString).filter(Boolean),
    hostName: joinRefNames(hosts),
    totalQuestions: game.totalQuestions || 0,
  };
}

function buildSummaryBuckets(matches) {
  return matches.reduce(
    (acc, match) => {
      acc.totalMatches += 1;
      if (match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.CLOSED) {
        acc.completedMatches += 1;
      }
      if (match.status === MATCH_STATUS.CANCELLED) {
        acc.cancelledMatches += 1;
      }
      acc.totalTeams += match.totalTeams || 0;

      if (match.billingMode === BILLING_MODE.AUTO_CHARGE) acc.autoChargeMatches += 1;
      if (match.billingMode === BILLING_MODE.INVOICE_LATER) acc.invoiceLaterMatches += 1;

      const locationKey = idToString(match.locationId);
      const hostKey = idToString(match.hostId);

      if (locationKey) {
        if (!acc.locations.has(locationKey)) {
          acc.locations.set(locationKey, { id: locationKey, name: match.locationName, totalMatches: 0, totalTeams: 0 });
        }
        const row = acc.locations.get(locationKey);
        row.totalMatches += 1;
        row.totalTeams += match.totalTeams || 0;
      }

      if (hostKey) {
        if (!acc.hosts.has(hostKey)) {
          acc.hosts.set(hostKey, { id: hostKey, name: match.hostName, totalMatches: 0, totalTeams: 0 });
        }
        const row = acc.hosts.get(hostKey);
        row.totalMatches += 1;
        row.totalTeams += match.totalTeams || 0;
      }

      return acc;
    },
    {
      totalMatches: 0,
      completedMatches: 0,
      cancelledMatches: 0,
      totalTeams: 0,
      autoChargeMatches: 0,
      invoiceLaterMatches: 0,
      locations: new Map(),
      hosts: new Map(),
    }
  );
}

function average(total, count) {
  return count > 0 ? Number((total / count).toFixed(2)) : 0;
}

function buildPeriodResponse(start, end) {
  return {
    startDate: formatCalendarEventDate(start),
    endDate: formatCalendarEventDate(end),
    start,
    end,
  };
}

async function fetchCalendarMatches(filter, query, options = {}) {
  const { defaultToCompleted = true } = options;
  const matchFilter = buildCalendarMatchFilter(query, { defaultToCompleted });
  if (filter) mergeDateCondition(matchFilter, filter.start, filter.end);
  applySearchCondition(matchFilter, query.search);

  const sort = pickMatchSort(query.sortBy, query.sortOrder);
  const pagination = getPagination(query);

  const [matches, total] = await Promise.all([
    Match.find(matchFilter)
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Match.countDocuments(matchFilter),
  ]);

  const items = matches.map(formatMatchEvent);
  return buildPaginationResponse(items, total, pagination.page, pagination.pageSize);
}

async function getMonthlyCalendarMatches(query) {
  const range = buildMonthRange(query.month, query.year);
  return fetchCalendarMatches(range, query);
}

async function getCalendarMatchesByRange(query) {
  const range = buildDateRange(query.startDate, query.endDate);
  const matches = await fetchCalendarMatches(range, query, { defaultToCompleted: false });
  const games = await calendarGameQuery(query, range.start, range.end).lean();

  return {
    ...matches,
    games: games.map(formatGameEvent),
  };
}

async function getCalendarDayMatches(query) {
  const { start, end } = buildDayRange(query.date);
  const filter = buildCalendarMatchFilter(query, { defaultToCompleted: false });
  mergeDateCondition(filter, start, end);

  const matches = await Match.find(filter).sort({ startedAt: 1, createdAt: 1 }).lean();
  const matchEvents = matches.map(formatMatchEvent);

  const teamDataByMatch = new Map();
  const matchDbIds = matches.map((m) => m._id).filter(Boolean);
  if (matchDbIds.length) {
    const teams = await Team.find({ matchDbId: { $in: matchDbIds } })
      .select("matchDbId teamName score rank status")
      .sort({ score: -1, joinedAt: 1 })
      .limit(matchDbIds.length * CALENDAR_TEAM_STAGE_LIMIT)
      .lean();

    teams.forEach((team) => {
      const key = idToString(team.matchDbId);
      if (!teamDataByMatch.has(key)) teamDataByMatch.set(key, []);
      const list = teamDataByMatch.get(key);
      if (list.length < CALENDAR_TEAM_STAGE_LIMIT) {
        list.push({
          teamName: team.teamName,
          finalScore: team.score || 0,
          rank: team.rank,
          status: team.status,
        });
      }
    });
  }

  const items = matchEvents.map((event) => ({
    ...event,
    teams: teamDataByMatch.get(event.dbId) || [],
  }));

  const games = await calendarGameQuery(query, start, end).lean();

  return {
    date: formatCalendarEventDate(start),
    period: buildPeriodResponse(start, end),
    items,
    games: games.map(formatGameEvent),
    totals: {
      matches: items.length,
      games: games.length,
    },
  };
}

async function getCalendarMatchDetail(matchId) {
  return reportService.getMatchReportDetail(matchId);
}

async function getCalendarSummary(query) {
  let start;
  let end;

  if (query.month && query.year) {
    ({ start, end } = buildMonthRange(query.month, query.year));
  } else {
    ({ start, end } = buildDateRange(query.startDate, query.endDate));
  }

  const matchFilter = buildCalendarMatchFilter(query, { defaultToCompleted: false });
  mergeDateCondition(matchFilter, start, end);
  applySearchCondition(matchFilter, query.search);

  const matches = await Match.find(matchFilter).lean();
  const matchIds = matches.map((m) => m._id);

  let chargedRevenue = 0;
  let unpaidRevenue = 0;
  let failedBillingAmount = 0;
  let receiptSentCount = 0;
  let chargedMatches = 0;
  let pendingMatches = 0;

  matches.forEach((match) => {
    if (match.billingStatus === BILLING_STATUS.CHARGED) {
      chargedMatches += 1;
      chargedRevenue += match.chargedAmount || 0;
    } else if ([BILLING_STATUS.UNPAID, BILLING_STATUS.INVOICED, BILLING_STATUS.PENDING].includes(match.billingStatus)) {
      pendingMatches += 1;
      unpaidRevenue += match.chargedAmount || 0;
    } else if (match.billingStatus === BILLING_STATUS.FAILED) {
      failedBillingAmount += match.chargedAmount || 0;
    }

    if (match.receiptSent) receiptSentCount += 1;
  });

  const buckets = buildSummaryBuckets(matches);
  const upcomingGames = await Game.countDocuments(buildCalendarGameFilter(query, start, end));

  return {
    period: buildPeriodResponse(start, end),
    totalMatches: buckets.totalMatches,
    completedMatches: buckets.completedMatches,
    cancelledMatches: buckets.cancelledMatches,
    totalTeams: buckets.totalTeams,
    averageTeamsPerMatch: average(buckets.totalTeams, buckets.totalMatches),
    autoChargeMatches: buckets.autoChargeMatches,
    invoiceLaterMatches: buckets.invoiceLaterMatches,
    chargedMatches,
    pendingMatches,
    receiptSentCount,
    totalRevenue: chargedRevenue,
    chargedRevenue,
    unpaidRevenue,
    failedBillingAmount,
    upcomingGames,
    topLocations: [...buckets.locations.values()]
      .sort((a, b) => b.totalMatches - a.totalMatches)
      .slice(0, 5)
      .map((row) => ({ ...row, averageTeamsPerMatch: average(row.totalTeams, row.totalMatches) })),
    topHosts: [...buckets.hosts.values()]
      .sort((a, b) => b.totalMatches - a.totalMatches)
      .slice(0, 5)
      .map((row) => ({ ...row, averageTeamsPerMatch: average(row.totalTeams, row.totalMatches) })),
  };
}

async function getCalendarOverview(query) {
  const limit = Number.parseInt(query.limit, 10) || 10;

  const recentFilter = {
    status: { $in: [MATCH_STATUS.CLOSED, MATCH_STATUS.COMPLETED] },
  };
  if (query.locationId) recentFilter.locationId = toObjectId(query.locationId);
  if (query.hostId) recentFilter.hostId = toObjectId(query.hostId);

  const now = new Date();
  const upcomingFilter = {
    status: { $in: CALENDAR_GAME_STATUSES },
    scheduledDate: { $gte: now },
  };

  const [recentMatches, upcomingGames, totals] = await Promise.all([
    Match.find(recentFilter)
      .sort({ closedAt: -1, endedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean(),
    Game.find(upcomingFilter)
      .select(CALENDAR_GAME_SELECT)
      .populate("assignedLocationIds", "name city status")
      .populate("assignedHostIds", "name email status")
      .sort({ scheduledDate: 1 })
      .limit(limit)
      .lean(),
    Promise.all([
      Match.countDocuments({ status: { $in: [MATCH_STATUS.CLOSED, MATCH_STATUS.COMPLETED] } }),
      Game.countDocuments(upcomingFilter),
    ]),
  ]);

  return {
    generatedAt: now,
    limit,
    totals: {
      totalClosedMatches: totals[0],
      upcomingGames: totals[1],
    },
    recentMatches: recentMatches.map(formatMatchEvent),
    upcomingGames: upcomingGames.map(formatGameEvent),
  };
}

module.exports = {
  buildMonthRange,
  getCalendarDayMatches,
  getCalendarMatchDetail,
  getCalendarMatchesByRange,
  getCalendarOverview,
  getCalendarSummary,
  getMonthlyCalendarMatches,
};
