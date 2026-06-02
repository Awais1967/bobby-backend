const BILLING_MODE = Object.freeze({
  AUTO_CHARGE: "auto_charge",
  INVOICE_LATER: "invoice_later",
});

const BILLING_STATUS = Object.freeze({
  NOT_STARTED: "not_started",
  PENDING: "pending",
  CHARGED: "charged",
  INVOICED: "invoiced",
  UNPAID: "unpaid",
  FAILED: "failed",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
});

module.exports = {
  BILLING_MODE,
  BILLING_STATUS,
};
