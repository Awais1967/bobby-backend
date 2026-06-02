const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

function getFileExtension(file) {
  const originalExtension = path.extname(file.originalname || "");
  if (originalExtension) return originalExtension.toLowerCase();

  const mimeExtensions = {
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

  return mimeExtensions[file.mimetype] || "";
}

function createFileName(file) {
  return `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${getFileExtension(file)}`;
}

function getPublicLocalUrl(relativePath) {
  const baseUrl = process.env.API_URL || "";
  return `${baseUrl}/uploads/${relativePath.replace(/\\/g, "/")}`;
}

function shouldUseS3() {
  return Boolean(process.env.AWS_REGION && process.env.AWS_S3_BUCKET);
}

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION,
  });
}

function getS3PublicUrl(key) {
  if (process.env.AWS_S3_PUBLIC_URL) {
    return `${process.env.AWS_S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

async function uploadToS3(file, folder) {
  const key = `${folder}/${createFileName(file)}`;
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return getS3PublicUrl(key);
}

async function uploadToLocal(file, folder) {
  const fileName = createFileName(file);
  const relativePath = path.join(folder, fileName);
  const destination = path.join(LOCAL_UPLOAD_ROOT, relativePath);

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, file.buffer);

  return getPublicLocalUrl(relativePath);
}

async function uploadFile(file, options = {}) {
  if (!file) return "";

  const folder = options.folder || "general";

  try {
    if (shouldUseS3()) {
      return await uploadToS3(file, folder);
    }

    return await uploadToLocal(file, folder);
  } catch (error) {
    const uploadError = new Error("Failed to upload file.");
    uploadError.statusCode = 500;
    throw uploadError;
  }
}

async function uploadQuestionMedia(files = {}) {
  const result = {};
  const image = files.image?.[0];
  const audio = files.audio?.[0];

  if (image) {
    result.imageUrl = await uploadFile(image, { folder: "question-media/images" });
  }

  if (audio) {
    result.audioUrl = await uploadFile(audio, { folder: "question-media/audio" });
  }

  return result;
}

module.exports = {
  LOCAL_UPLOAD_ROOT,
  uploadFile,
  uploadQuestionMedia,
};
