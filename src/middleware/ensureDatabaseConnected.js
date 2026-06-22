const connectDB = require("../config/db");

async function ensureDatabaseConnected(req, res, next) {
  try {
    await connectDB();
    next();
  } catch (error) {
    const dbError = new Error(
      process.env.NODE_ENV === "production"
        ? "Database connection unavailable."
        : `Database connection unavailable: ${error.message}`
    );
    dbError.statusCode = 503;
    next(dbError);
  }
}

module.exports = ensureDatabaseConnected;
