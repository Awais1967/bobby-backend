const playerService = require("./player.service");
const {
  confirmDeviceSwitchValidation,
  joinMatchValidation,
  playerLeaveValidation,
  reconnectTeamValidation,
  validate,
} = require("./player.validation");

async function joinMatch(req, res, next) {
  try {
    const payload = validate(joinMatchValidation, req.body);
    const result = await playerService.joinMatch(payload, playerService.getRequestMeta(req));

    if (result.deviceSwitchRequired) {
      return res.status(409).json({
        success: false,
        deviceSwitchRequired: true,
        message: "This team is already active on another device. Confirm to switch devices.",
        data: result.data,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Joined match successfully",
      data: result.data,
    });
  } catch (error) {
    return next(error);
  }
}

async function reconnectTeam(req, res, next) {
  try {
    const payload = validate(reconnectTeamValidation, req.body);
    const result = await playerService.reconnectTeam(payload, playerService.getRequestMeta(req));

    if (result.deviceSwitchRequired) {
      return res.status(409).json({
        success: false,
        deviceSwitchRequired: true,
        message: "This team is already active on another device. Confirm to switch devices.",
        data: result.data,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reconnected successfully",
      data: result.data,
    });
  } catch (error) {
    return next(error);
  }
}

async function confirmDeviceSwitch(req, res, next) {
  try {
    const payload = validate(confirmDeviceSwitchValidation, req.body);
    const data = await playerService.confirmDeviceSwitch(payload, playerService.getRequestMeta(req));

    return res.status(200).json({
      success: true,
      message: "Device switched successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPlayerSession(req, res, next) {
  try {
    const data = await playerService.getPlayerSession(req.player);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function leaveTeam(req, res, next) {
  try {
    validate(playerLeaveValidation, req.body || {});
    const team = await playerService.leaveTeam(req.player);

    return res.status(200).json({
      success: true,
      message: "Left team successfully",
      data: {
        team,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getPublicJoinInfo(req, res, next) {
  try {
    const match = await playerService.getPublicJoinInfo(req.params.matchId);

    return res.status(200).json({
      success: true,
      data: {
        match,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  confirmDeviceSwitch,
  getPlayerSession,
  getPublicJoinInfo,
  joinMatch,
  leaveTeam,
  reconnectTeam,
};
