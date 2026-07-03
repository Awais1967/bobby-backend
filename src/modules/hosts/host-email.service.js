const nodemailer = require("nodemailer");

function isConfigured() {
  return Boolean(process.env.EMAIL_USER && (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD));
}

function createTransporter() {
  const port = Number(process.env.EMAIL_PORT || 587);
  const configuredSecure = String(process.env.EMAIL_SECURE || "").toLowerCase();
  const secure =
    configuredSecure === "true" ? true : configuredSecure === "false" ? false : port === 465;

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port,
    secure,
    connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 15000),
    greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS || 15000),
    socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS || 15000),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD,
    },
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLocationName(location) {
  if (!location) {
    return "";
  }

  const primaryName =
    location.name || location.clientName || location.venueLocation || location.location;
  const place = [location.city, location.state].filter(Boolean).join(", ");

  return [primaryName, place].filter(Boolean).join(" - ");
}

function getHostLoginUrl() {
  return process.env.HOST_FRONTEND_URL || process.env.CLIENT_URL || "";
}

async function sendHostWelcomeEmail({ host, plainPassword, locations = [] }) {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("Host welcome email was not sent because SMTP is not configured.");
    }
    return {
      delivered: false,
      failureReason: "SMTP is not configured.",
    };
  }

  const locationNames = locations.map(formatLocationName).filter(Boolean);
  const assignedLocations = locationNames.length > 0 ? locationNames : ["No location assigned"];
  const loginUrl = getHostLoginUrl();
  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: host.email,
    subject: "Your Trivia Goat host account",
    text: [
      `Hello ${host.name || "there"},`,
      "",
      "Your Trivia Goat host account has been created.",
      "",
      `Email: ${host.email}`,
      `Password: ${plainPassword}`,
      "Assigned location(s):",
      ...assignedLocations.map((location) => `- ${location}`),
      ...(loginUrl ? ["", `Login: ${loginUrl}`] : []),
      "",
      "Please keep these credentials secure.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <p>Hello ${escapeHtml(host.name || "there")},</p>
        <p>Your Trivia Goat host account has been created.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 6px 12px 6px 0;"><strong>Email</strong></td>
            <td style="padding: 6px 0;">${escapeHtml(host.email)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px 6px 0;"><strong>Password</strong></td>
            <td style="padding: 6px 0;">${escapeHtml(plainPassword)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px 6px 0; vertical-align: top;"><strong>Assigned location(s)</strong></td>
            <td style="padding: 6px 0;">
              <ul style="margin: 0; padding-left: 18px;">
                ${assignedLocations.map((location) => `<li>${escapeHtml(location)}</li>`).join("")}
              </ul>
            </td>
          </tr>
        </table>
        ${
          loginUrl
            ? `<p><a href="${escapeHtml(loginUrl)}" style="color: #ff1f7a;">Login to Trivia Goat Host</a></p>`
            : ""
        }
        <p>Please keep these credentials secure.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    messageId: info.messageId,
  };
}

module.exports = {
  sendHostWelcomeEmail,
};
