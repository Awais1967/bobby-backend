function requireRole(...allowedRoles) {
  const options =
    allowedRoles.length > 0 && typeof allowedRoles[allowedRoles.length - 1] === "object"
      ? allowedRoles.pop()
      : {};

  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: options.message || "You do not have permission to access this resource.",
      });
    }

    return next();
  };
}

module.exports = requireRole;
