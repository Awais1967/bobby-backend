const nodemailer = require("nodemailer");

function isConfigured() {
  return Boolean(process.env.EMAIL_USER && (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD));
}

function createTransporter() {
  const port = Number(process.env.EMAIL_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port,
    secure: String(process.env.EMAIL_SECURE || "").toLowerCase() === "true" || port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD,
    },
  });
}

async function sendCardSetupEmail({ email, clientName, setupUrl, expiresInHours }) {
  if (!isConfigured()) {
    return { delivered: false, failureReason: "SMTP is not configured." };
  }

  const info = await createTransporter().sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: "Securely add your payment card",
    text: [
      `Hello ${clientName || "there"},`,
      "",
      "Please use the secure link below to add the card that will be used for Trivia Goat match charges.",
      setupUrl,
      "",
      `This link expires in ${expiresInHours} hours and can only be used for this card setup.`,
      "Do not send card details by email, phone, or text.",
    ].join("\n"),
  });

  return { delivered: true, messageId: info.messageId };
}

module.exports = { sendCardSetupEmail };
