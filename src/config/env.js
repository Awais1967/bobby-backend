function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

module.exports = {
  getEnv,
  getRequiredEnv,
};
