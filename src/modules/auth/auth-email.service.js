const nodemailer = require("nodemailer");

function isConfigured() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function createTransporter() {
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

async function sendPasswordResetOtp({ email, name, otp, expiresInMinutes }) {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("Password reset email was not sent because SMTP is not configured.");
    }
    return { delivered: false };
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: "Trivia Goat password reset code",
    text: [
      `Hello ${name || "there"},`,
      "",
      `Your Trivia Goat password reset code is ${otp}.`,
      `It expires in ${expiresInMinutes} minutes.`,
      "",
      "If you did not request this reset, you can ignore this email.",
    ].join("\n"),
  });

  return { delivered: true };
}

module.exports = {
  sendPasswordResetOtp,
};
