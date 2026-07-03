const hostService = require("./host.service");
const {
  archiveHostValidation,
  changeHostPasswordValidation,
  createHostValidation,
  getHostsQueryValidation,
  restoreHostValidation,
  updateHostStatusValidation,
  updateHostValidation,
  validate,
} = require("./host.validation");

async function createHost(req, res, next) {
  try {
    const payload = validate(createHostValidation, req.body);
    const result = await hostService.createHost(payload);

    return res.status(201).json({
      success: true,
      message: "Host created successfully",
      data: {
        host: result.host,
        emailDelivery: result.emailDelivery,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getHosts(req, res, next) {
  try {
    const query = validate(getHostsQueryValidation, req.query);
    const data = await hostService.getHosts(query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getHostById(req, res, next) {
  try {
    const host = await hostService.getHostById(req.params.id);

    return res.status(200).json({
      success: true,
      data: {
        host,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateHost(req, res, next) {
  try {
    const payload = validate(updateHostValidation, req.body);
    const host = await hostService.updateHost(req.params.id, payload);

    return res.status(200).json({
      success: true,
      message: "Host updated successfully",
      data: {
        host,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function changeHostPassword(req, res, next) {
  try {
    const payload = validate(changeHostPasswordValidation, req.body);
    await hostService.changeHostPassword(req.params.id, payload);

    return res.status(200).json({
      success: true,
      message: "Host password changed successfully",
    });
  } catch (error) {
    return next(error);
  }
}

async function updateHostStatus(req, res, next) {
  try {
    const payload = validate(updateHostStatusValidation, req.body);
    const host = await hostService.updateHostStatus(req.params.id, payload.status);

    return res.status(200).json({
      success: true,
      message: "Host status updated successfully",
      data: {
        host,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function archiveHost(req, res, next) {
  try {
    const payload = validate(archiveHostValidation, req.body || {});
    const host = await hostService.archiveHost(req.params.id, req.user.id, payload.reason);

    return res.status(200).json({
      success: true,
      message: "Host archived successfully",
      data: {
        host,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function restoreHost(req, res, next) {
  try {
    const payload = validate(restoreHostValidation, req.body || {});
    const host = await hostService.restoreHost(req.params.id, req.user.id, payload);

    return res.status(200).json({
      success: true,
      message: "Host restored successfully",
      data: {
        host,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteHost(req, res, next) {
  try {
    const result = await hostService.deleteHost(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.host
        ? {
            host: result.host,
            archived: result.archived,
          }
        : {
            archived: result.archived,
          },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  archiveHost,
  changeHostPassword,
  createHost,
  deleteHost,
  getHostById,
  getHosts,
  restoreHost,
  updateHost,
  updateHostStatus,
};
