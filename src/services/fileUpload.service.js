const crypto = require("crypto");
const path = require("path");

const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const { assertS3Config } = require("../config/env");

const MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".mp4",
};

let s3Client;

function getFileExtension(file) {
  const originalExtension = path.extname(file.originalname || "");
  if (originalExtension) return originalExtension.toLowerCase();

  return MIME_EXTENSIONS[file.mimetype] || "";
}

function getSafeBaseName(file) {
  const baseName = path.basename(file.originalname || "upload", path.extname(file.originalname || ""));
  const safeName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeName || "upload";
}

function createFileName(file) {
  const timestamp = Date.now();
  const suffix = crypto.randomBytes(6).toString("hex");
  return `${timestamp}-${getSafeBaseName(file)}-${suffix}${getFileExtension(file)}`;
}

function getClient(config) {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return s3Client;
}

function getS3ObjectUrl(config, key) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

async function uploadFile(file, options = {}) {
  if (!file) return "";

  const folder = options.folder || "general";
  const config = assertS3Config();
  const key = `${folder.replace(/^\/+|\/+$/g, "")}/${createFileName(file)}`;

  try {
    await getClient(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );
  } catch (error) {
    const uploadError = new Error(
      `Failed to upload file to S3.${error?.message ? ` AWS error: ${error.message}` : ""}`
    );
    uploadError.statusCode = 500;
    uploadError.cause = error;
    throw uploadError;
  }

  return getS3ObjectUrl(config, key);
}

async function uploadQuestionMedia(files = {}) {
  const result = {};
  const image = files.image?.[0];
  const audio = files.audio?.[0];

  if (image) {
    result.imageUrl = await uploadFile(image, { folder: "questions/media" });
  }

  if (audio) {
    result.audioUrl = await uploadFile(audio, { folder: "questions/media" });
  }

  return result;
}

module.exports = {
  uploadFile,
  uploadQuestionMedia,
};
