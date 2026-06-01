const ROLES = require("../../constants/roles");
const generateToken = require("../../utils/generateToken");
const Admin = require("../admins/admin.model");
const Host = require("../hosts/host.model");

function getModelByRole(role) {
  if (role === ROLES.SUPER_ADMIN) {
    return Admin;
  }

  if (role === ROLES.HOST) {
    return Host;
  }

  return null;
}

function toUserProfile(user, role) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role,
    status: user.status,
  };
}

async function login({ email, password, role }) {
  const UserModel = getModelByRole(role);

  if (!UserModel) {
    const error = new Error("Invalid login role.");
    error.statusCode = 400;
    throw error;
  }

  const user = await UserModel.findOne({ email: email.toLowerCase() }).select("+password");

  if (!user) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== "active") {
    const error = new Error("Account is not active.");
    error.statusCode = 403;
    throw error;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const profile = toUserProfile(user, role);
  const token = generateToken(profile);

  return {
    token,
    user: profile,
  };
}

async function getCurrentUser({ id, role }) {
  const UserModel = getModelByRole(role);

  if (!UserModel) {
    const error = new Error("Invalid user role.");
    error.statusCode = 400;
    throw error;
  }

  const user = await UserModel.findById(id);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return toUserProfile(user, role);
}

async function changePassword({ user: authUser, currentPassword, newPassword }) {
  const UserModel = getModelByRole(authUser.role);

  if (!UserModel) {
    const error = new Error("Invalid user role.");
    error.statusCode = 400;
    throw error;
  }

  const user = await UserModel.findById(authUser.id).select("+password");

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const isPasswordValid = await user.comparePassword(currentPassword);

  if (!isPasswordValid) {
    const error = new Error("Current password is incorrect.");
    error.statusCode = 400;
    throw error;
  }

  user.password = newPassword;
  await user.save();

  return toUserProfile(user, authUser.role);
}

module.exports = {
  changePassword,
  getCurrentUser,
  login,
};
