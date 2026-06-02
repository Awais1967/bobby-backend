const analyticsService = require("./analytics.service");
const exportService = require("./export.service");

const matchReportColumns = [
  { key: "matchId", header: "Match ID", width: 16 },
  { key: "gameName", header: "Game Name", width: 28 },
  { key: "clientName", header: "Client Name", width: 28 },
  { key: "hostName", header: "Host Name", width: 24 },
  { key: "date", header: "Date", width: 14 },
  { key: "startTime", header: "Start Time", width: 14 },
  { key: "endTime", header: "End Time", width: 14 },
  { key: "durationMinutes", header: "Duration Minutes", width: 18 },
  { key: "numberOfTeams", header: "Number of Teams", width: 18 },
  { key: "billingMode", header: "Billing Mode", width: 18 },
  { key: "billingStatus", header: "Billing Status", width: 18 },
  { key: "chargedAmount", header: "Charged Amount", width: 18 },
  { key: "currency", header: "Currency", width: 12 },
  {
    key: "receiptSent",
    header: "Receipt Sent",
    width: 14,
    value: (row) => (row.receiptSent ? "Yes" : "No"),
  },
  {
    key: "receiptEmailDestinations",
    header: "Receipt Emails",
    width: 36,
    value: (row) => (row.receiptEmailDestinations || []).join(", "),
  },
  { key: "matchStatus", header: "Match Status", width: 18 },
];

const billingReportColumns = [
  { key: "transactionId", header: "Transaction ID", width: 28, value: (row) => String(row.transactionId) },
  { key: "matchId", header: "Match ID", width: 16 },
  { key: "locationName", header: "Location Name", width: 28 },
  { key: "hostName", header: "Host Name", width: 24 },
  { key: "gameTitle", header: "Game Title", width: 28 },
  { key: "amount", header: "Amount", width: 14 },
  { key: "currency", header: "Currency", width: 12 },
  { key: "billingMode", header: "Billing Mode", width: 18 },
  { key: "billingStatus", header: "Billing Status", width: 18 },
  { key: "chargedAt", header: "Charged At", width: 24, value: (row) => row.chargedAt || "" },
  { key: "invoicedAt", header: "Invoiced At", width: 24, value: (row) => row.invoicedAt || "" },
  {
    key: "receiptSent",
    header: "Receipt Sent",
    width: 14,
    value: (row) => (row.receiptSent ? "Yes" : "No"),
  },
];

function assertReportData(items) {
  if (!items.length) {
    const error = new Error("No report data found for selected filters.");
    error.statusCode = 404;
    throw error;
  }
}

async function getMatchReports(filters) {
  return analyticsService.getMatchReportRows(filters);
}

async function getMatchReportDetail(matchId) {
  return analyticsService.getMatchReportDetail(matchId);
}

async function exportMatchReportsCsv(filters) {
  const { items } = await analyticsService.getMatchReportRows(filters, { exportMode: true });
  assertReportData(items);
  return exportService.exportToCsv(items, matchReportColumns);
}

async function exportMatchReportsExcel(filters) {
  const { items } = await analyticsService.getMatchReportRows(filters, { exportMode: true });
  assertReportData(items);
  return exportService.exportToExcel(items, matchReportColumns, "Match Reports");
}

async function getBillingReports(filters) {
  return analyticsService.getBillingReportRows(filters);
}

async function exportBillingReportsCsv(filters) {
  const { items } = await analyticsService.getBillingReportRows(filters, { exportMode: true });
  assertReportData(items);
  return exportService.exportToCsv(items, billingReportColumns);
}

async function exportBillingReportsExcel(filters) {
  const { items } = await analyticsService.getBillingReportRows(filters, { exportMode: true });
  assertReportData(items);
  return exportService.exportToExcel(items, billingReportColumns, "Billing Reports");
}

function getHostReports(filters) {
  return analyticsService.getHostPerformanceRows(filters);
}

function getLocationReports(filters) {
  return analyticsService.getLocationPerformanceRows(filters);
}

function getReportsSummary(filters) {
  return analyticsService.getReportsSummary(filters);
}

function getRevenueAnalytics(filters) {
  return analyticsService.getRevenueAnalytics(filters);
}

function getTeamAnalytics(filters) {
  return analyticsService.getTeamAnalytics(filters);
}

module.exports = {
  exportBillingReportsCsv,
  exportBillingReportsExcel,
  exportMatchReportsCsv,
  exportMatchReportsExcel,
  getBillingReports,
  getHostReports,
  getLocationReports,
  getMatchReportDetail,
  getMatchReports,
  getReportsSummary,
  getRevenueAnalytics,
  getTeamAnalytics,
};
