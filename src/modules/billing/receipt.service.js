const nodemailer = require("nodemailer");
const Match = require("../matches/match.model");
const Team = require("../matches/team.model");
const Location = require("../locations/location.model");

function hasEmailConfig() {
  return Boolean(process.env.EMAIL_USER && (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD));
}

function getTransporter() {
  const port = Number(process.env.EMAIL_PORT || 587);

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD,
    },
  });
}

function formatAmount(amount, currency) {
  return `$${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getReceiptContext(transaction) {
  const [match, location, teams] = await Promise.all([
    Match.findById(transaction.matchDbId).lean(),
    Location.findById(transaction.locationId).lean(),
    Team.find({ matchDbId: transaction.matchDbId }).sort({ joinedAt: 1 }).select("teamName").lean(),
  ]);

  return { location, match, teams };
}

function buildTextReceipt(transaction, context) {
  const teamNames = context.teams.map((team) => team.teamName);
  const lines = [
    "Trivia Goat Receipt",
    "",
    `Invoice ID: ${transaction._id || transaction.id}`,
    `Date Paid: ${formatDateTime(transaction.chargedAt || transaction.paidAt || transaction.createdAt)}`,
    `Paid With: ${transaction.stripePaymentMethodId ? "Card on file" : "Invoice"}`,
    `Receipt ID: ${transaction.stripeChargeId || transaction.stripePaymentIntentId || ""}`,
    "",
    `Bill To: ${context.location?.clientName || transaction.locationName}`,
    context.location?.venueLocation || context.location?.address || "",
    context.location?.city ? `${context.location.city}${context.location.state ? `, ${context.location.state}` : ""} ${context.location.zip || ""}` : "",
    context.location?.billingContactEmail || context.location?.clientEmail || "",
    "",
    `Match Details: ${formatDateTime(context.match?.startedAt || context.match?.scheduledAt || transaction.createdAt)} (${teamNames.length} teams)`,
    `Host: ${transaction.hostName}`,
    `Subtotal: ${formatAmount(transaction.subtotalAmount || transaction.amount, transaction.currency)}`,
    `Discount: ${formatAmount(transaction.discountAmount || 0, transaction.currency)}`,
    `Tax included in price: ${formatAmount(transaction.taxAmount || 0, transaction.currency)}`,
    `Total Paid: ${formatAmount(transaction.totalAmount || transaction.amount, transaction.currency)}`,
    "",
    `${teamNames.length} participating teams:`,
    ...teamNames,
  ].filter(Boolean);

  if (transaction.stripeReceiptUrl) lines.push("", `Stripe receipt: ${transaction.stripeReceiptUrl}`);

  return lines.join("\n");
}

function buildHtmlReceipt(transaction, context) {
  const currency = transaction.currency;
  const subtotal = transaction.subtotalAmount || transaction.amount;
  const discount = transaction.discountAmount || 0;
  const tax = transaction.taxAmount || 0;
  const total = transaction.totalAmount || transaction.amount;
  const teamRows = context.teams
    .map((team) => `<div>${escapeHtml(team.teamName)}</div>`)
    .join("");
  const paidAt = formatDateTime(transaction.chargedAt || transaction.paidAt || transaction.createdAt);
  const matchTime = formatDateTime(context.match?.startedAt || context.match?.scheduledAt || transaction.createdAt);
  const billTo = [
    context.location?.clientName || transaction.locationName,
    context.location?.venueLocation || context.location?.address,
    context.location?.city ? `${context.location.city}${context.location.state ? `, ${context.location.state}` : ""} ${context.location.zip || ""}` : "",
    context.location?.billingContactEmail || context.location?.clientEmail,
  ].filter(Boolean);

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; max-width: 900px; margin: 0 auto; padding: 32px;">
      <h1 style="font-size: 34px; margin: 0 0 48px;">Trivia Goat Receipt</h1>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 36px;">
        <tr>
          <td style="vertical-align: top; width: 50%;">
            <div><strong>Invoice ID:</strong> ${escapeHtml(transaction._id || transaction.id)}</div>
            <div><strong>Date Paid:</strong> ${escapeHtml(paidAt)}</div>
            <div><strong>Paid With:</strong> ${escapeHtml(transaction.stripePaymentMethodId ? "Card on file" : "Invoice")}</div>
            <div><strong>Receipt ID:</strong> ${escapeHtml(transaction.stripeChargeId || transaction.stripePaymentIntentId || "")}</div>
          </td>
          <td style="vertical-align: top;">
            <strong>Bill To</strong>
            ${billTo.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
          </td>
        </tr>
      </table>
      <h2 style="font-size: 28px; margin: 0 0 32px;">${escapeHtml(formatAmount(total, currency))} paid</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 42px;">
        <tr>
          <td style="border-bottom: 1px solid #111; padding: 6px 0;"><strong>Match Details</strong></td>
          <td style="border-bottom: 1px solid #111; padding: 6px 0;"><strong>Host</strong></td>
          <td style="border-bottom: 1px solid #111; padding: 6px 0; text-align: right;"><strong>Amount</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">${escapeHtml(matchTime)} (${context.teams.length} teams)</td>
          <td style="padding: 8px 0;">${escapeHtml(transaction.hostName)}</td>
          <td style="padding: 8px 0; text-align: right;">${escapeHtml(formatAmount(subtotal, currency))}</td>
        </tr>
        <tr><td></td><td style="border-top: 1px solid #d1d5db; padding: 8px 0;">Discount</td><td style="border-top: 1px solid #d1d5db; padding: 8px 0; text-align: right;">${escapeHtml(formatAmount(discount, currency))}</td></tr>
        <tr><td></td><td style="border-top: 1px solid #d1d5db; padding: 8px 0;">Tax included in price</td><td style="border-top: 1px solid #d1d5db; padding: 8px 0; text-align: right;">${escapeHtml(formatAmount(tax, currency))}</td></tr>
        <tr><td></td><td style="border-top: 1px solid #d1d5db; padding: 8px 0;"><strong>Total</strong></td><td style="border-top: 1px solid #d1d5db; padding: 8px 0; text-align: right;"><strong>${escapeHtml(formatAmount(total, currency))}</strong></td></tr>
      </table>
      <h3 style="background: #eee; padding: 4px 10px; font-size: 22px;">${context.teams.length} participating teams: ${escapeHtml(matchTime)}</h3>
      <div style="font-size: 18px; line-height: 1.45;">${teamRows || "<div>No teams recorded.</div>"}</div>
    </div>
  `;
}

async function sendMatchReceipt(transaction) {
  const destinations = transaction.receiptEmailDestinations || [];

  if (destinations.length === 0 || !hasEmailConfig()) {
    return {
      failureReason: destinations.length === 0 ? "No receipt email destinations configured." : "Email configuration is missing.",
      sent: false,
    };
  }

  const transporter = getTransporter();
  const context = await getReceiptContext(transaction);
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const subject = `Trivia Goat receipt for match ${transaction.matchId}`;

  await transporter.sendMail({
    from,
    to: destinations,
    subject,
    html: buildHtmlReceipt(transaction, context),
    text: buildTextReceipt(transaction, context),
  });

  return {
    failureReason: "",
    sent: true,
  };
}

module.exports = {
  sendMatchReceipt,
};
