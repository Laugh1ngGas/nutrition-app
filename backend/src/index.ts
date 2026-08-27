import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { testConnection } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 3001;

// Backend always sits behind exactly one reverse proxy hop now — Render's
// own edge in production, and the frontend's /api proxy in every
// environment (including local docker-compose). Without this,
// express-rate-limit can't safely trust X-Forwarded-For and throws
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request instead of correctly
// identifying each client.
app.set('trust proxy', 1);

// ── Security & Middleware ────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Rate limiting ────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  // Hosting platforms (Render, etc.) poll the health check frequently while
  // verifying a deploy — without this it can exceed the limit and get rate
  // limited, which the platform then reads as the service being down.
  skip: (req) => req.originalUrl === '/api/v1/health',
  message: { success: false, message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts' },
});

app.use('/api', limiter);
app.use('/api/auth', authLimiter);

// ── Routes ───────────────────────────────────────────────────────────
app.use('/api/v1', routes);

// ── Error handling ───────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Startup ──────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await testConnection();
    await connectRedis();

    app.listen(PORT, () => {
      logger.info(`🚀 MealPrepRoulette API running on http://localhost:${PORT}/api/v1`);
      logger.info(`📋 Health check: http://localhost:${PORT}/api/v1/health`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

bootstrap();

export default app;
