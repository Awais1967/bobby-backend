const adminService = require("./admin.service");
const { createAdminValidation, validate } = require("./admin.validation");

async function createAdmin(req, res, next) {
  try {
    const payload = validate(createAdminValidation, req.body);
    const admin = await adminService.createAdmin(payload);

    return res.status(201).json({
      success: true,
      message: "Super Admin created successfully",
      data: {
        admin,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createAdmin,
};
