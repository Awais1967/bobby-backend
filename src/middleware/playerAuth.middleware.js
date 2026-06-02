const jwt = require("jsonwebtoken");

function playerAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Player session is invalid or expired.",
    });
  }

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);

    if (decoded.role !== "player") {
      return res.status(401).json({
        success: false,
        message: "Player session is invalid or expired.",
      });
    }

    req.player = {
      teamId: decoded.teamId,
      matchDbId: decoded.matchDbId,
      matchId: decoded.matchId,
      teamName: decoded.teamName,
      deviceId: decoded.deviceId,
      role: decoded.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Player session is invalid or expired.",
    });
  }
}

module.exports = playerAuthMiddleware;
