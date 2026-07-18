import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import type { Request } from "express";

// Initialize Firebase Admin (must happen before routes use it)
import "./config/firebase";
import { ensureDBConnection } from "./config/db";

import routes from "./routes";
import notFound from "./middlewares/notFound";
import errorHandler from "./middlewares/errorHandler";

const app = express();

// Trust upstream proxy headers in production/serverless deployments.
// This enables correct client IP detection for rate limiting.
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

const getClientIp = (req: Request): string => {
  const forwarded = req.headers.forwarded;
  if (typeof forwarded === "string") {
    const match = forwarded.match(/for=(?:"?)(\[[^\]]+\]|[^;,"]+)/i);
    if (match?.[1]) {
      return match[1].replace(/^\[|\]$/g, "");
    }
  }

  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string") {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return req.ip || req.socket.remoteAddress || "unknown";
};

// ─── Security ──────────────────────────────────────────────────────────
app.use(helmet());

// ─── Rate Limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? '200' : '1000')),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => getClientIp(req),
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});
app.use(limiter);

// Ensure a live DB connection for environments where startup is not centralized
// (for example, serverless handlers invoking the app directly).
app.use(async (_req, res, next) => {
  try {
    await ensureDBConnection();
    next();
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(503).json({
      success: false,
      message: "Database temporarily unavailable",
    });
  }
});

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
