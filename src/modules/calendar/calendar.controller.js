const calendarService = require("./calendar.service");
const {
  dayFilters,
  matchIdParam,
  monthlyFilters,
  overviewFilters,
  rangeFilters,
  summaryFilters,
  validate,
} = require("./calendar.validation");

async function getMonthlyMatches(req, res, next) {
  try {
    const query = validate(monthlyFilters, req.query);
    const data = await calendarService.getMonthlyCalendarMatches(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getRangeMatches(req, res, next) {
  try {
    const query = validate(rangeFilters, req.query);
    const data = await calendarService.getCalendarMatchesByRange(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getDayMatches(req, res, next) {
  try {
    const query = validate(dayFilters, req.query);
    const data = await calendarService.getCalendarDayMatches(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getMatchDetail(req, res, next) {
  try {
    const params = validate(matchIdParam, req.params);
    const data = await calendarService.getCalendarMatchDetail(params.matchId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getSummary(req, res, next) {
  try {
    const query = validate(summaryFilters, req.query);
    const data = await calendarService.getCalendarSummary(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getOverview(req, res, next) {
  try {
    const query = validate(overviewFilters, req.query);
    const data = await calendarService.getCalendarOverview(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getGoogleStatus(req, res, next) {
  try {
    const data = await calendarService.getGoogleCalendarStatus();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDayMatches,
  getMatchDetail,
  getMonthlyMatches,
  getGoogleStatus,
  getOverview,
  getRangeMatches,
  getSummary,
};
