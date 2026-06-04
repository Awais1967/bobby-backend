function getEnv(name, fallback = "") {
  const value = process.env[name];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function getRequiredEnv(name) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getS3Config() {
  return {
    region: getEnv("AWS_REGION"),
    accessKeyId: getEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY"),
    bucket: getEnv("AWS_S3_BUCKET"),
    publicBaseUrl: getEnv("AWS_S3_PUBLIC_URL"),
  };
}

function getMissingS3EnvVars() {
  const config = getS3Config();
  const required = {
    AWS_REGION: config.region,
    AWS_ACCESS_KEY_ID: config.accessKeyId,
    AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
    AWS_S3_BUCKET: config.bucket,
  };

  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

function assertS3Config() {
  const missing = getMissingS3EnvVars();

  if (missing.length > 0) {
    const error = new Error(
      `S3 upload is not configured. Missing required environment variables: ${missing.join(", ")}.`
    );
    error.statusCode = 500;
    throw error;
  }

  return getS3Config();
}

module.exports = {
  assertS3Config,
  getEnv,
  getRequiredEnv,
  getMissingS3EnvVars,
  getS3Config,
};
