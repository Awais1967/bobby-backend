function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatReportDate(value) {
  const date = asDate(value);
  if (!date) return null;

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatReportTime(value) {
  const date = asDate(value);
  if (!date) return null;

  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function calculateDurationMinutes(startedAt, endedAt) {
  const start = asDate(startedAt);
  const end = asDate(endedAt);

  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function assertValidDateRange(startDate, endDate) {
  const start = asDate(startDate);
  const end = asDate(endDate);

  if (start && end && start > end) {
    const error = new Error("Invalid date range.");
    error.statusCode = 400;
    throw error;
  }

  return { start, end };
}

function formatCalendarEventDate(value) {
  return formatReportDate(value);
}

function getDateRangeFilter(startDate, endDate) {
  const { start, end } = assertValidDateRange(startDate, endDate);
  const range = {};

  if (start) range.$gte = start;
  if (end) {
    const endOfDay = new Date(end);
    endOfDay.setUTCHours(23, 59, 59, 999);
    range.$lte = endOfDay;
  }

  return Object.keys(range).length ? range : null;
}

function getPeriodKey(value, groupBy = "month") {
  const date = asDate(value);
  if (!date) return null;

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);

  if (groupBy === "day") {
    return `${year}-${month}-${pad(date.getUTCDate())}`;
  }

  if (groupBy === "week") {
    const tmp = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const weekYear = tmp.getUTCFullYear();
    const firstYearDay = new Date(Date.UTC(weekYear, 0, 1));
    const week = Math.ceil(((tmp - firstYearDay) / 86400000 + 1) / 7);
    return `${weekYear}-W${pad(week)}`;
  }

  return `${year}-${month}`;
}

module.exports = {
  assertValidDateRange,
  calculateDurationMinutes,
  formatCalendarEventDate,
  formatReportDate,
  formatReportTime,
  getDateRangeFilter,
  getPeriodKey,
};
