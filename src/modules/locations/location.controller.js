const locationService = require("./location.service");
const {
  assignLocationHostsValidation,
  createLocationValidation,
  getHostLocationsQueryValidation,
  getLocationsQueryValidation,
  updateLocationStatusValidation,
  updateLocationValidation,
  validate,
} = require("./location.validation");

async function createLocation(req, res, next) {
  try {
    const payload = validate(createLocationValidation, req.body);
    const location = await locationService.createLocation(payload);

    return res.status(201).json({
      success: true,
      message: "Location created successfully",
      data: {
        location,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getLocations(req, res, next) {
  try {
    const query = validate(getLocationsQueryValidation, req.query);
    const data = await locationService.getLocations(query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getLocationById(req, res, next) {
  try {
    const location = await locationService.getLocationById(req.params.id);

    return res.status(200).json({
      success: true,
      data: {
        location,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateLocation(req, res, next) {
  try {
    const payload = validate(updateLocationValidation, req.body);
    const location = await locationService.updateLocation(req.params.id, payload);

    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
      data: {
        location,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateLocationStatus(req, res, next) {
  try {
    const payload = validate(updateLocationStatusValidation, req.body);
    const location = await locationService.updateLocationStatus(req.params.id, payload.status);

    return res.status(200).json({
      success: true,
      message: "Location status updated successfully",
      data: {
        location,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteLocation(req, res, next) {
  try {
    await locationService.deleteLocation(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyLocations(req, res, next) {
  try {
    const query = validate(getHostLocationsQueryValidation, req.query);
    const data = await locationService.getHostAssignedLocations(req.user.id, query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function assignHostsToLocation(req, res, next) {
  try {
    const payload = validate(assignLocationHostsValidation, req.body);
    const location = await locationService.assignHostsToLocation(
      req.params.id,
      payload.assignedHostIds
    );

    return res.status(200).json({
      success: true,
      message: "Location hosts updated successfully",
      data: {
        location,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  assignHostsToLocation,
  createLocation,
  deleteLocation,
  getLocationById,
  getLocations,
  getMyLocations,
  updateLocation,
  updateLocationStatus,
};
