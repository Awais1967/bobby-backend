function splitOrigins(value = "") {
  return value
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function normalizeOrigin(origin = "") {
  return origin.trim().replace(/\/$/, "");
}

function isLocalhostOrigin(origin = "") {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      Boolean(url.port)
    );
  } catch {
    return false;
  }
}

const DEFAULT_FRONTEND_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "https://bobby-user.vercel.app",
  "https://bobby-host.vercel.app",
  "https://bobby-admin-panel.vercel.app",
];

function getFrontendOrigins() {
  return [
    ...DEFAULT_FRONTEND_ORIGINS,
    ...splitOrigins(process.env.CORS_ORIGIN),
    ...splitOrigins(process.env.CLIENT_URL),
    ...splitOrigins(process.env.USER_FRONTEND_URL),
    ...splitOrigins(process.env.HOST_FRONTEND_URL),
    ...splitOrigins(process.env.ADMIN_FRONTEND_URL),
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
}

function isFrontendOriginAllowed(origin) {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  return getFrontendOrigins().includes(normalizedOrigin) || isLocalhostOrigin(normalizedOrigin);
}

module.exports = {
  getFrontendOrigins,
  isFrontendOriginAllowed,
  normalizeOrigin,
};
