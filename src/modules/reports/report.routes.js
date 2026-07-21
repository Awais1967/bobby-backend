const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const reportController = require("./report.controller");

const router = express.Router();

const superAdminOnly = [
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, {
    message: "Reports are available to Super Admin only.",
  }),
];

router.get("/summary", superAdminOnly, reportController.getReportsSummary);
router.get("/revenue", superAdminOnly, reportController.getRevenueAnalytics);
router.get("/teams", superAdminOnly, reportController.getTeamAnalytics);

router.get("/matches/export/csv", superAdminOnly, reportController.exportMatchReportsCsv);
router.get("/matches/export/excel", superAdminOnly, reportController.exportMatchReportsExcel);
router.get("/matches", superAdminOnly, reportController.getMatchReports);
router.get("/matches/:matchId", superAdminOnly, reportController.getMatchReportDetail);

router.get("/clients/export/csv", superAdminOnly, reportController.exportClientSummaryCsv);
router.get("/clients", superAdminOnly, reportController.getClientSummary);
router.get("/hosts/summary/export/csv", superAdminOnly, reportController.exportHostSummaryCsv);
router.get("/hosts/summary", superAdminOnly, reportController.getHostSummary);

router.get("/billing/export/csv", superAdminOnly, reportController.exportBillingReportsCsv);
router.get("/billing/export/excel", superAdminOnly, reportController.exportBillingReportsExcel);
router.get("/billing", superAdminOnly, reportController.getBillingReports);

router.get("/hosts", superAdminOnly, reportController.getHostReports);
router.get("/locations", superAdminOnly, reportController.getLocationReports);

module.exports = router;
