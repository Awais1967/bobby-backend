const mongoose = require("mongoose");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");
const { MATCH_STATUS } = require("../../constants/matchStatus");
const { buildPaginationResponse, getPagination } = require("../../utils/pagination");
const {
  calculateDurationMinutes,
  formatReportDate,
  formatReportTime,
  getDateRangeFilter,
  getPeriodKey,
} = require("../../utils/date");
const Transaction = require("../billing/transaction.model");
const Host = require("../hosts/host.model");
const Location = require("../locations/location.model");
const Answer = require("../matches/answer.model");
const Match = require("../matches/match.model");
const ScoreLog = require("../matches/scoreLog.model");
const Team = require("../matches/team.model");

const MAX_EXPORT_ROWS = 5000;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idToString(value) {
  return value ? String(value) : "";
}

function average(total, count) {
  return count > 0 ? Number((total / count).toFixed(2)) : 0;
}

function buildMatchDateFilter(filters) {
  const range = getDateRangeFilter(filters.startDate, filters.endDate);
  if (!range) return null;

  return [
    { startedAt: range },
    { startedAt: null, createdAt: range },
  ];
}

function buildMatchFilter(filters = {}) {
  const filter = {};

  if (filters.locationId) filter.locationId = filters.locationId;
  if (filters.hostId) filter.hostId = filters.hostId;
  if (filters.gameId) filter.gameId = filters.gameId;
  if (filters.matchStatus) filter.status = filters.matchStatus;
  if (filters.billingStatus) filter.billingStatus = filters.billingStatus;
  if (filters.billingMode) filter.billingMode = filters.billingMode;

  const dateConditions = buildMatchDateFilter(filters);
  if (dateConditions) filter.$or = dateConditions;

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), "i");
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

  return filter;
}

function buildTransactionFilter(filters = {}) {
  const filter = {};

  if (filters.locationId) filter.locationId = filters.locationId;
  if (filters.hostId) filter.hostId = filters.hostId;
  if (filters.billingStatus) filter.billingStatus = filters.billingStatus;
  if (filters.billingMode) filter.billingMode = filters.billingMode;

  const range = getDateRangeFilter(filters.startDate, filters.endDate);
  if (range) filter.createdAt = range;

  return filter;
}

function getMatchReportDate(match) {
  return match.startedAt || match.createdAt;
}

function getMatchEndedAt(match) {
  return match.closedAt || match.endedAt || null;
}

function sanitizeTeam(team) {
  return {
    teamName: team.teamName,
    finalScore: team.score || 0,
    rank: team.rank,
    joinedAt: team.joinedAt,
    status: team.status,
  };
}

function buildMatchRow(match, transaction) {
  const reportDate = getMatchReportDate(match);
  const endedAt = getMatchEndedAt(match);

  return {
    matchId: match.matchId,
    gameName: match.gameTitle,
    clientName: match.locationName,
    hostName: match.hostName,
    date: formatReportDate(reportDate),
    startTime: formatReportTime(match.startedAt),
    endTime: formatReportTime(endedAt),
    durationMinutes: calculateDurationMinutes(match.startedAt, endedAt),
    numberOfTeams: match.totalTeams || 0,
    billingStatus: transaction?.billingStatus || match.billingStatus,
    billingMode: transaction?.billingMode || match.billingMode,
    chargedAmount: transaction?.amount ?? match.chargedAmount ?? match.defaultMatchPrice ?? 0,
    currency: transaction?.currency || match.currency || "usd",
    receiptSent: Boolean(transaction?.receiptSent || match.receiptSent),
    receiptEmailDestinations: transaction?.receiptEmailDestinations || match.receiptEmailDestinations || [],
    gameStatus: match.currentState,
    matchStatus: match.status,
  };
}

async function getTransactionsForMatches(matchIds) {
  if (!matchIds.length) return new Map();

  const transactions = await Transaction.find({ matchDbId: { $in: matchIds } })
    .sort({ createdAt: -1 })
    .lean();

  return transactions.reduce((map, transaction) => {
    const key = idToString(transaction.matchDbId);
    if (!map.has(key)) map.set(key, transaction);
    return map;
  }, new Map());
}

async function getMatchReportRows(filters = {}, options = {}) {
  const filter = buildMatchFilter(filters);
  const sortField = filters.sortBy || "startedAt";
  const sortOrder = filters.sortOrder === "asc" ? 1 : -1;
  const exportMode = Boolean(options.exportMode);
  const pagination = getPagination(filters, {
    defaultPageSize: exportMode ? MAX_EXPORT_ROWS : 10,
    maxPageSize: exportMode ? MAX_EXPORT_ROWS : 100,
  });

  const query = Match.find(filter)
    .sort({ [sortField]: sortOrder, createdAt: -1 })
    .lean();

  if (exportMode) {
    query.limit(MAX_EXPORT_ROWS);
  } else {
    query.skip(pagination.skip).limit(pagination.limit);
  }

  const [matches, total] = await Promise.all([
    query,
    Match.countDocuments(filter),
  ]);

  const transactionMap = await getTransactionsForMatches(matches.map((match) => match._id));
  const items = matches.map((match) => buildMatchRow(match, transactionMap.get(idToString(match._id))));

  if (exportMode) return { items, total };
  return buildPaginationResponse(items, total, pagination.page, pagination.pageSize);
}

async function getMatchReportDetail(matchId) {
  const match = await Match.findOne({ matchId: String(matchId || "").toUpperCase() }).lean();

  if (!match) {
    const error = new Error("Match report not found.");
    error.statusCode = 404;
    throw error;
  }

  const [transaction, teams, scoreLogs, answerCounts] = await Promise.all([
    Transaction.findOne({ matchDbId: match._id }).sort({ createdAt: -1 }).lean(),
    Team.find({ matchDbId: match._id })
      .select("teamName score rank joinedAt status")
      .sort({ score: -1, joinedAt: 1 })
      .lean(),
    ScoreLog.aggregate([
      { $match: { matchDbId: new mongoose.Types.ObjectId(match._id) } },
      {
        $group: {
          _id: "$actionType",
          count: { $sum: 1 },
          totalPointsChanged: { $sum: "$pointsChange" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Answer.aggregate([
      { $match: { matchDbId: new mongoose.Types.ObjectId(match._id) } },
      {
        $group: {
          _id: "$reviewStatus",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const leaderboard = teams
    .map(sanitizeTeam)
    .sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      return b.finalScore - a.finalScore;
    });

  return {
    match: buildMatchRow(match, transaction),
    game: {
      gameId: match.gameId,
      gameName: match.gameTitle,
      status: match.currentState,
      totalQuestions: match.totalQuestions || 0,
    },
    location: {
      locationId: match.locationId,
      clientName: match.locationName,
    },
    host: {
      hostId: match.hostId,
      hostName: match.hostName,
    },
    billing: transaction
      ? {
          transactionId: transaction._id,
          amount: transaction.amount,
          currency: transaction.currency,
          billingMode: transaction.billingMode,
          billingStatus: transaction.billingStatus,
          chargedAt: transaction.chargedAt,
          invoicedAt: transaction.invoicedAt,
          paidAt: transaction.paidAt,
          receiptSent: transaction.receiptSent,
          receiptEmailDestinations: transaction.receiptEmailDestinations || [],
        }
      : null,
    teams: teams.map(sanitizeTeam),
    finalLeaderboard: leaderboard,
    scoreLogsSummary: scoreLogs.map((item) => ({
      actionType: item._id,
      count: item.count,
      totalPointsChanged: item.totalPointsChanged,
    })),
    answerCounts: answerCounts.map((item) => ({
      reviewStatus: item._id,
      count: item.count,
    })),
  };
}

function buildBillingRow(transaction) {
  return {
    transactionId: transaction._id,
    matchId: transaction.matchId,
    locationName: transaction.locationName,
    hostName: transaction.hostName,
    gameTitle: transaction.gameTitle,
    amount: transaction.amount || 0,
    currency: transaction.currency || "usd",
    billingMode: transaction.billingMode,
    billingStatus: transaction.billingStatus,
    chargedAt: transaction.chargedAt,
    invoicedAt: transaction.invoicedAt,
    receiptSent: Boolean(transaction.receiptSent),
  };
}

async function getBillingReportRows(filters = {}, options = {}) {
  const filter = buildTransactionFilter(filters);
  const exportMode = Boolean(options.exportMode);
  const pagination = getPagination(filters, {
    defaultPageSize: exportMode ? MAX_EXPORT_ROWS : 10,
    maxPageSize: exportMode ? MAX_EXPORT_ROWS : 100,
  });

  const query = Transaction.find(filter).sort({ createdAt: -1 }).lean();

  if (exportMode) {
    query.limit(MAX_EXPORT_ROWS);
  } else {
    query.skip(pagination.skip).limit(pagination.limit);
  }

  const [transactions, total] = await Promise.all([
    query,
    Transaction.countDocuments(filter),
  ]);

  const items = transactions.map(buildBillingRow);

  if (exportMode) return { items, total };
  return buildPaginationResponse(items, total, pagination.page, pagination.pageSize);
}

async function getRevenueByMatchIds(matchIds) {
  if (!matchIds.length) return new Map();

  const rows = await Transaction.aggregate([
    { $match: { matchDbId: { $in: matchIds } } },
    {
      $group: {
        _id: "$matchDbId",
        charged: {
          $sum: {
            $cond: [{ $eq: ["$billingStatus", BILLING_STATUS.CHARGED] }, "$amount", 0],
          },
        },
        unpaid: {
          $sum: {
            $cond: [
              { $in: ["$billingStatus", [BILLING_STATUS.UNPAID, BILLING_STATUS.INVOICED, BILLING_STATUS.PENDING]] },
              "$amount",
              0,
            ],
          },
        },
        failed: {
          $sum: {
            $cond: [{ $eq: ["$billingStatus", BILLING_STATUS.FAILED] }, "$amount", 0],
          },
        },
        receiptSentCount: {
          $sum: { $cond: ["$receiptSent", 1, 0] },
        },
      },
    },
  ]);

  return rows.reduce((map, row) => map.set(idToString(row._id), row), new Map());
}

function summarizeMatches(matches) {
  return matches.reduce(
    (summary, match) => {
      summary.totalMatches += 1;
      summary.completedMatches += match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.CLOSED ? 1 : 0;
      summary.cancelledMatches += match.status === MATCH_STATUS.CANCELLED ? 1 : 0;
      summary.totalTeams += match.totalTeams || 0;
      summary.autoChargeMatches += match.billingMode === BILLING_MODE.AUTO_CHARGE ? 1 : 0;
      summary.invoiceLaterMatches += match.billingMode === BILLING_MODE.INVOICE_LATER ? 1 : 0;

      const locationKey = idToString(match.locationId);
      const hostKey = idToString(match.hostId);

      if (!summary.locations.has(locationKey)) {
        summary.locations.set(locationKey, { name: match.locationName, count: 0 });
      }
      if (!summary.hosts.has(hostKey)) {
        summary.hosts.set(hostKey, { name: match.hostName, count: 0 });
      }

      summary.locations.get(locationKey).count += 1;
      summary.hosts.get(hostKey).count += 1;

      return summary;
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

function topFromMap(map) {
  let top = null;

  map.forEach((value, id) => {
    if (!top || value.count > top.count) {
      top = { id, name: value.name, totalMatches: value.count };
    }
  });

  return top;
}

async function getReportsSummary(filters = {}) {
  const matchFilter = buildMatchFilter(filters);
  const matches = await Match.find(matchFilter).lean();
  const matchIds = matches.map((match) => match._id);
  const revenueMap = await getRevenueByMatchIds(matchIds);
  const summary = summarizeMatches(matches);

  let chargedRevenue = 0;
  let unpaidRevenue = 0;
  let failedBillingAmount = 0;
  let receiptSentCount = 0;

  revenueMap.forEach((row) => {
    chargedRevenue += row.charged || 0;
    unpaidRevenue += row.unpaid || 0;
    failedBillingAmount += row.failed || 0;
    receiptSentCount += row.receiptSentCount || 0;
  });

  return {
    totalMatches: summary.totalMatches,
    completedMatches: summary.completedMatches,
    cancelledMatches: summary.cancelledMatches,
    totalTeams: summary.totalTeams,
    averageTeamsPerMatch: average(summary.totalTeams, summary.totalMatches),
    totalRevenue: chargedRevenue,
    chargedRevenue,
    unpaidRevenue,
    failedBillingAmount,
    autoChargeMatches: summary.autoChargeMatches,
    invoiceLaterMatches: summary.invoiceLaterMatches,
    receiptSentCount,
    topLocation: topFromMap(summary.locations),
    topHost: topFromMap(summary.hosts),
  };
}

async function getRevenueAnalytics(filters = {}) {
  const matchFilter = buildMatchFilter(filters);
  const matches = await Match.find(matchFilter).select("_id").lean();
  const matchIds = matches.map((match) => match._id);

  if (!matchIds.length) return { items: [] };

  const transactions = await Transaction.find({ matchDbId: { $in: matchIds } }).lean();
  const periods = new Map();

  transactions.forEach((transaction) => {
    const period = getPeriodKey(transaction.chargedAt || transaction.invoicedAt || transaction.createdAt, filters.groupBy);
    if (!period) return;

    if (!periods.has(period)) {
      periods.set(period, { period, charged: 0, unpaid: 0, failed: 0, total: 0 });
    }

    const row = periods.get(period);
    const amount = transaction.amount || 0;

    if (transaction.billingStatus === BILLING_STATUS.CHARGED) row.charged += amount;
    if ([BILLING_STATUS.UNPAID, BILLING_STATUS.INVOICED, BILLING_STATUS.PENDING].includes(transaction.billingStatus)) {
      row.unpaid += amount;
    }
    if (transaction.billingStatus === BILLING_STATUS.FAILED) row.failed += amount;

    row.total = row.charged + row.unpaid + row.failed;
  });

  return {
    items: [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)),
  };
}

async function getTeamAnalytics(filters = {}) {
  const matches = await Match.find(buildMatchFilter(filters)).lean();
  const totalTeams = matches.reduce((sum, match) => sum + (match.totalTeams || 0), 0);
  const sortedByTeams = [...matches].sort((a, b) => (b.totalTeams || 0) - (a.totalTeams || 0));
  const lowestByTeams = [...matches].sort((a, b) => (a.totalTeams || 0) - (b.totalTeams || 0));
  const locations = new Map();
  const hosts = new Map();

  matches.forEach((match) => {
    const locationKey = idToString(match.locationId);
    const hostKey = idToString(match.hostId);

    if (!locations.has(locationKey)) {
      locations.set(locationKey, { locationId: locationKey, locationName: match.locationName, totalTeams: 0, totalMatches: 0 });
    }
    if (!hosts.has(hostKey)) {
      hosts.set(hostKey, { hostId: hostKey, hostName: match.hostName, totalTeams: 0, totalMatches: 0 });
    }

    locations.get(locationKey).totalTeams += match.totalTeams || 0;
    locations.get(locationKey).totalMatches += 1;
    hosts.get(hostKey).totalTeams += match.totalTeams || 0;
    hosts.get(hostKey).totalMatches += 1;
  });

  const summarizeMatch = (match) =>
    match
      ? {
          matchId: match.matchId,
          gameName: match.gameTitle,
          clientName: match.locationName,
          hostName: match.hostName,
          date: formatReportDate(getMatchReportDate(match)),
          numberOfTeams: match.totalTeams || 0,
        }
      : null;

  return {
    totalTeams,
    averageTeamsPerMatch: average(totalTeams, matches.length),
    highestTeamCountMatch: summarizeMatch(sortedByTeams[0]),
    lowestTeamCountMatch: summarizeMatch(lowestByTeams[0]),
    teamsByLocation: [...locations.values()].map((row) => ({
      ...row,
      averageTeamsPerMatch: average(row.totalTeams, row.totalMatches),
    })),
    teamsByHost: [...hosts.values()].map((row) => ({
      ...row,
      averageTeamsPerMatch: average(row.totalTeams, row.totalMatches),
    })),
  };
}

async function getHostPerformanceRows(filters = {}) {
  const matchFilter = buildMatchFilter(filters);
  const pagination = getPagination(filters);
  const matches = await Match.find(matchFilter).lean();
  const revenueMap = await getRevenueByMatchIds(matches.map((match) => match._id));
  const groups = new Map();

  matches.forEach((match) => {
    const key = idToString(match.hostId);
    if (!groups.has(key)) {
      groups.set(key, {
        hostId: key,
        hostName: match.hostName,
        totalMatchesHosted: 0,
        completedMatches: 0,
        cancelledMatches: 0,
        totalTeamsHosted: 0,
        totalRevenueFromMatches: 0,
        lastHostedAt: null,
      });
    }

    const row = groups.get(key);
    const hostedAt = match.startedAt || match.createdAt;
    const revenue = revenueMap.get(idToString(match._id));

    row.totalMatchesHosted += 1;
    row.completedMatches += match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.CLOSED ? 1 : 0;
    row.cancelledMatches += match.status === MATCH_STATUS.CANCELLED ? 1 : 0;
    row.totalTeamsHosted += match.totalTeams || 0;
    row.totalRevenueFromMatches += revenue?.charged || 0;
    row.lastHostedAt = !row.lastHostedAt || hostedAt > row.lastHostedAt ? hostedAt : row.lastHostedAt;
  });

  if (filters.hostId && !groups.has(filters.hostId)) {
    const host = await Host.findById(filters.hostId).lean();
    if (host) {
      groups.set(filters.hostId, {
        hostId: filters.hostId,
        hostName: host.name,
        totalMatchesHosted: 0,
        completedMatches: 0,
        cancelledMatches: 0,
        totalTeamsHosted: 0,
        averageTeamsPerMatch: 0,
        totalRevenueFromMatches: 0,
        lastHostedAt: null,
      });
    }
  }

  const allRows = [...groups.values()]
    .map((row) => ({
      ...row,
      averageTeamsPerMatch: average(row.totalTeamsHosted, row.totalMatchesHosted),
      lastHostedAt: row.lastHostedAt,
    }))
    .sort((a, b) => b.totalMatchesHosted - a.totalMatchesHosted || a.hostName.localeCompare(b.hostName));

  return buildPaginationResponse(
    allRows.slice(pagination.skip, pagination.skip + pagination.limit),
    allRows.length,
    pagination.page,
    pagination.pageSize
  );
}

async function getLocationPerformanceRows(filters = {}) {
  const matchFilters = {
    ...filters,
    locationId: filters.locationId,
  };
  const matchFilter = buildMatchFilter(matchFilters);
  const pagination = getPagination(filters);
  const matches = await Match.find(matchFilter).lean();
  const revenueMap = await getRevenueByMatchIds(matches.map((match) => match._id));
  const locationIds = [...new Set(matches.map((match) => idToString(match.locationId)).filter(Boolean))];
  if (filters.locationId && !locationIds.includes(filters.locationId)) locationIds.push(filters.locationId);

  const locationFilter = {};
  if (locationIds.length) locationFilter._id = { $in: locationIds };
  if (filters.city) locationFilter.city = new RegExp(escapeRegex(filters.city), "i");
  if (filters.country) locationFilter.country = new RegExp(escapeRegex(filters.country), "i");

  const locations = await Location.find(locationFilter).lean();
  const locationMap = locations.reduce((map, location) => map.set(idToString(location._id), location), new Map());
  const allowedLocationIds = new Set(locations.map((location) => idToString(location._id)));
  const groups = new Map();

  matches.forEach((match) => {
    const key = idToString(match.locationId);
    if ((filters.city || filters.country) && !allowedLocationIds.has(key)) return;

    const location = locationMap.get(key);
    if (!groups.has(key)) {
      groups.set(key, {
        locationId: key,
        locationName: location?.clientName || match.locationName,
        city: location?.city || "",
        country: location?.country || "",
        totalMatches: 0,
        completedMatches: 0,
        totalTeams: 0,
        totalCharged: 0,
        unpaidAmount: 0,
        billingMode: location?.billingMode || match.billingMode,
        lastMatchAt: null,
      });
    }

    const row = groups.get(key);
    const revenue = revenueMap.get(idToString(match._id));
    const matchDate = match.startedAt || match.createdAt;

    row.totalMatches += 1;
    row.completedMatches += match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.CLOSED ? 1 : 0;
    row.totalTeams += match.totalTeams || 0;
    row.totalCharged += revenue?.charged || 0;
    row.unpaidAmount += revenue?.unpaid || 0;
    row.lastMatchAt = !row.lastMatchAt || matchDate > row.lastMatchAt ? matchDate : row.lastMatchAt;
  });

  locations.forEach((location) => {
    const key = idToString(location._id);
    if (!groups.has(key) && filters.locationId) {
      groups.set(key, {
        locationId: key,
        locationName: location.clientName || location.name,
        city: location.city || "",
        country: location.country || "",
        totalMatches: 0,
        completedMatches: 0,
        totalTeams: 0,
        averageTeamsPerMatch: 0,
        totalCharged: 0,
        unpaidAmount: 0,
        billingMode: location.billingMode,
        lastMatchAt: null,
      });
    }
  });

  const allRows = [...groups.values()]
    .map((row) => ({
      ...row,
      averageTeamsPerMatch: average(row.totalTeams, row.totalMatches),
    }))
    .sort((a, b) => b.totalMatches - a.totalMatches || a.locationName.localeCompare(b.locationName));

  return buildPaginationResponse(
    allRows.slice(pagination.skip, pagination.skip + pagination.limit),
    allRows.length,
    pagination.page,
    pagination.pageSize
  );
}

module.exports = {
  getBillingReportRows,
  getHostPerformanceRows,
  getLocationPerformanceRows,
  getMatchReportDetail,
  getMatchReportRows,
  getReportsSummary,
  getRevenueAnalytics,
  getTeamAnalytics,
};
