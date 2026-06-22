function splitOrigins(value = "") {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getFrontendOrigins() {
  return [
    ...splitOrigins(process.env.CORS_ORIGIN),
    ...splitOrigins(process.env.CLIENT_URL),
    ...splitOrigins(process.env.USER_FRONTEND_URL),
    ...splitOrigins(process.env.HOST_FRONTEND_URL),
    ...splitOrigins(process.env.ADMIN_FRONTEND_URL),
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
}

module.exports = {
  getFrontendOrigins,
};
