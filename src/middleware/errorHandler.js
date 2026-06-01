function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || error.status || 500;
  const response = {
    success: false,
    message: error.message || "Internal server error",
  };

  if (process.env.NODE_ENV === "development") {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
