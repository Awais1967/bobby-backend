const nodemailer = require("nodemailer");

function hasEmailConfig() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: Number(process.env.EMAIL_PORT || 587) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function formatAmount(amount, currency) {
  return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
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
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const subject = `Trivia Goat receipt for match ${transaction.matchId}`;
  const lines = [
    `Match ID: ${transaction.matchId}`,
    `Game: ${transaction.gameTitle}`,
    `Location: ${transaction.locationName}`,
    `Host: ${transaction.hostName}`,
    `Closed/Charged: ${transaction.chargedAt || transaction.invoicedAt || transaction.createdAt}`,
    `Amount: ${formatAmount(transaction.amount, transaction.currency)}`,
    `Billing status: ${transaction.billingStatus}`,
  ];

  if (transaction.stripeReceiptUrl) {
    lines.push(`Stripe receipt: ${transaction.stripeReceiptUrl}`);
  }

  await transporter.sendMail({
    from,
    to: destinations,
    subject,
    text: lines.join("\n"),
  });

  return {
    failureReason: "",
    sent: true,
  };
}

module.exports = {
  sendMatchReceipt,
};
