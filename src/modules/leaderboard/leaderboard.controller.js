const leaderboardService = require("./leaderboard.service");
const {
  getHostLeaderboardValidation,
  getPublicLeaderboardValidation,
  validate,
} = require("./leaderboard.validation");

async function getPlayerLeaderboard(req, res, next) {
  try {
    const data = await leaderboardService.getPlayerLeaderboard(req.player);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPublicLeaderboard(req, res, next) {
  try {
    const params = validate(getPublicLeaderboardValidation, req.params);
    const data = await leaderboardService.getPublicLeaderboard(params.matchId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getHostLeaderboard(req, res, next) {
  try {
    const params = validate(getHostLeaderboardValidation, req.params);
    const data = await leaderboardService.getHostLeaderboard(params.id, req.user.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPlayerState(req, res, next) {
  try {
    const data = await leaderboardService.getPlayerState(req.player);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPresentationState(req, res, next) {
  try {
    const params = validate(getPublicLeaderboardValidation, req.params);
    const data = await leaderboardService.getPresentationState(params.matchId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getHostLeaderboard,
  getPlayerLeaderboard,
  getPlayerState,
  getPresentationState,
  getPublicLeaderboard,
};
