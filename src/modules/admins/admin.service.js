const Admin = require("./admin.model");

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toAdminResponse(admin) {
  if (!admin) {
    return null;
  }

  const data = typeof admin.toObject === "function" ? admin.toObject() : admin;

  delete data.password;
  delete data.__v;

  data.id = data._id.toString();
  delete data._id;

  return data;
}

async function ensureUniqueAdminEmail(email) {
  const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });

  if (existingAdmin) {
    throw createHttpError("Admin email already exists.", 409);
  }
}

async function createAdmin(payload) {
  await ensureUniqueAdminEmail(payload.email);

  const admin = await Admin.create({
    ...payload,
    email: payload.email.toLowerCase(),
  });

  return toAdminResponse(admin);
}

module.exports = {
  createAdmin,
};
