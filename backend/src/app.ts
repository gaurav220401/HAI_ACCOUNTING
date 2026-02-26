import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

// Initialize Firebase Admin (must happen before routes use it)
import "./config/firebase";

import routes from "./routes";
import notFound from "./middlewares/notFound";
import errorHandler from "./middlewares/errorHandler";

const app = express();

// ─── Security ──────────────────────────────────────────────────────────
app.use(helmet());

// ─── Rate Limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});
app.use(limiter);

// ─── CORS ──────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);

// ─── Body Parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logging ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// ─── Health Check ──────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ────────────────────────────────────────────────────────
app.use("/api", routes);

// ─── Fallbacks ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
