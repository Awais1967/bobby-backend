const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const routes = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { getFrontendOrigins, normalizeOrigin } = require("./config/frontendOrigins");

const app = express();
const allowedCorsOrigins = getFrontendOrigins();
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.includes(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
};

app.use(helmet());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(compression());
app.use(cookieParser());
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
