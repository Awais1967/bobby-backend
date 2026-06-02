const multer = require("multer");

const allowedImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const allowedAudioMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 2,
  },
  fileFilter(req, file, cb) {
    const isImageField = file.fieldname === "image";
    const isLogoField = file.fieldname === "logo";
    const isAudioField = file.fieldname === "audio";

    if ((isImageField || isLogoField) && allowedImageMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }

    if (isAudioField && allowedAudioMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }

    const error = new Error("Invalid file type.");
    error.statusCode = 400;
    return cb(error);
  },
});

const questionMediaUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

const clientLogoUpload = upload.single("logo");

function handleQuestionMediaUpload(req, res, next) {
  return questionMediaUpload(req, res, (error) => {
    if (error) {
      error.statusCode = 400;
      return next(error);
    }

    return next();
  });
}

function validateQuestionMediaFiles(req, res, next) {
  const image = req.files?.image?.[0];
  const audio = req.files?.audio?.[0];

  if (image && image.size > 10 * 1024 * 1024) {
    const error = new Error("Image file size must be 10 MB or less.");
    error.statusCode = 400;
    return next(error);
  }

  if (audio && audio.size > 50 * 1024 * 1024) {
    const error = new Error("Audio file size must be 50 MB or less.");
    error.statusCode = 400;
    return next(error);
  }

  return next();
}

function handleClientLogoUpload(req, res, next) {
  return clientLogoUpload(req, res, (error) => {
    if (error) {
      error.statusCode = 400;
      return next(error);
    }

    return next();
  });
}

function validateClientLogoFile(req, res, next) {
  const logo = req.file;

  if (logo && logo.size > 10 * 1024 * 1024) {
    const error = new Error("Logo file size must be 10 MB or less.");
    error.statusCode = 400;
    return next(error);
  }

  return next();
}

module.exports = {
  allowedAudioMimeTypes,
  allowedImageMimeTypes,
  handleClientLogoUpload,
  handleQuestionMediaUpload,
  upload,
  validateClientLogoFile,
  validateQuestionMediaFiles,
};
