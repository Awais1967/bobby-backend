const reportService = require("./report.service");
const {
  getBillingReportsQueryValidation,
  getHostReportsQueryValidation,
  getLocationReportsQueryValidation,
  getMatchReportsQueryValidation,
  getReportsSummaryQueryValidation,
  getRevenueAnalyticsQueryValidation,
  getTeamAnalyticsQueryValidation,
  validate,
} = require("./report.validation");

function setCsvHeaders(res, filename) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

function setExcelHeaders(res, filename) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

async function getMatchReports(req, res, next) {
  try {
    const query = validate(getMatchReportsQueryValidation, req.query);
    const data = await reportService.getMatchReports(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getMatchReportDetail(req, res, next) {
  try {
    const data = await reportService.getMatchReportDetail(req.params.matchId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function exportMatchReportsCsv(req, res, next) {
  try {
    const query = validate(getMatchReportsQueryValidation, req.query);
    const csv = await reportService.exportMatchReportsCsv(query);
    setCsvHeaders(res, "trivia-goat-match-reports.csv");
    return res.status(200).send(csv);
  } catch (error) {
    return next(error);
  }
}

async function exportMatchReportsExcel(req, res, next) {
  try {
    const query = validate(getMatchReportsQueryValidation, req.query);
    const buffer = await reportService.exportMatchReportsExcel(query);
    setExcelHeaders(res, "trivia-goat-match-reports.xlsx");
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
}

async function getBillingReports(req, res, next) {
  try {
    const query = validate(getBillingReportsQueryValidation, req.query);
    const data = await reportService.getBillingReports(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function exportBillingReportsCsv(req, res, next) {
  try {
    const query = validate(getBillingReportsQueryValidation, req.query);
    const csv = await reportService.exportBillingReportsCsv(query);
    setCsvHeaders(res, "trivia-goat-billing-reports.csv");
    return res.status(200).send(csv);
  } catch (error) {
    return next(error);
  }
}

async function exportBillingReportsExcel(req, res, next) {
  try {
    const query = validate(getBillingReportsQueryValidation, req.query);
    const buffer = await reportService.exportBillingReportsExcel(query);
    setExcelHeaders(res, "trivia-goat-billing-reports.xlsx");
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
}

async function getHostReports(req, res, next) {
  try {
    const query = validate(getHostReportsQueryValidation, req.query);
    const data = await reportService.getHostReports(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getLocationReports(req, res, next) {
  try {
    const query = validate(getLocationReportsQueryValidation, req.query);
    const data = await reportService.getLocationReports(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getReportsSummary(req, res, next) {
  try {
    const query = validate(getReportsSummaryQueryValidation, req.query);
    const data = await reportService.getReportsSummary(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getRevenueAnalytics(req, res, next) {
  try {
    const query = validate(getRevenueAnalyticsQueryValidation, req.query);
    const data = await reportService.getRevenueAnalytics(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getTeamAnalytics(req, res, next) {
  try {
    const query = validate(getTeamAnalyticsQueryValidation, req.query);
    const data = await reportService.getTeamAnalytics(query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
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
