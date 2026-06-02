const gameService = require("./game.service");
const {
  assignGameHostsValidation,
  assignGameLocationsValidation,
  createGameValidation,
  getAvailableGamesQueryValidation,
  getGamesQueryValidation,
  updateGameStatusValidation,
  updateGameValidation,
  validate,
} = require("./game.validation");

async function createGame(req, res, next) {
  try {
    const payload = validate(createGameValidation, req.body);
    const game = await gameService.createGame(payload, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Game template created successfully",
      data: {
        game,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getGames(req, res, next) {
  try {
    const query = validate(getGamesQueryValidation, req.query);
    const data = await gameService.getGames(query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getGameById(req, res, next) {
  try {
    const game = await gameService.getGameById(req.params.id);

    return res.status(200).json({
      success: true,
      data: {
        game,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateGame(req, res, next) {
  try {
    const payload = validate(updateGameValidation, req.body);
    const game = await gameService.updateGame(req.params.id, payload);

    return res.status(200).json({
      success: true,
      message: "Game template updated successfully",
      data: {
        game,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateGameStatus(req, res, next) {
  try {
    const payload = validate(updateGameStatusValidation, req.body);
    const game = await gameService.updateGameStatus(req.params.id, payload.status);

    return res.status(200).json({
      success: true,
      message: "Game status updated successfully",
      data: {
        game,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteGame(req, res, next) {
  try {
    const result = await gameService.deleteGame(req.params.id);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return next(error);
  }
}

async function duplicateGame(req, res, next) {
  try {
    const game = await gameService.duplicateGame(req.params.id, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Game template duplicated successfully",
      data: {
        game,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getAvailableGamesForToday(req, res, next) {
  try {
    const query = validate(getAvailableGamesQueryValidation, req.query);
    const data = await gameService.getAvailableGamesForHost(req.user.id, query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function assignGameLocations(req, res, next) {
  try {
    const payload = validate(assignGameLocationsValidation, req.body);
    const game = await gameService.assignGameLocations(req.params.id, payload.assignedLocationIds);

    return res.status(200).json({
      success: true,
      message: "Game locations updated successfully",
      data: {
        game,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function assignGameHosts(req, res, next) {
  try {
    const payload = validate(assignGameHostsValidation, req.body);
    const game = await gameService.assignGameHosts(req.params.id, payload.assignedHostIds);

    return res.status(200).json({
      success: true,
      message: "Game hosts updated successfully",
      data: {
        game,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  assignGameHosts,
  assignGameLocations,
  createGame,
  deleteGame,
  duplicateGame,
  getAvailableGamesForToday,
  getGameById,
  getGames,
  updateGame,
  updateGameStatus,
};
