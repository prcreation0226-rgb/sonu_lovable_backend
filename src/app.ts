// Radiantilyk EMR — Express Application Setup
// Configures all global middleware, security headers, and route mounting.
// This file does NOT start the server — see server.ts for that.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { globalErrorHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { logger } from './utils/logger';

const app = express();

// ---- Trust Proxy for Railway/Cloud Reverse Proxies ----
app.set('trust proxy', 1);

// ---- Security Headers (Helmet) ----
app.use(helmet({
  contentSecurityPolicy: env.IS_PRODUCTION ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// ---- CORS ----
app.use(cors({
  origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600, // 10 minutes preflight cache
}));

// ---- Request Parsing ----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---- Compression ----
app.use(compression());

// ---- Request ID ----
app.use(requestId);

import { globalLimiter } from './middleware/rateLimiter';

app.use(globalLimiter);

// ---- Request Logging ----
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    logger[logLevel](
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });
  next();
});

// ---- Health Check (Unauthenticated) ----
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'radiantilyk-emr-backend',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    },
  });
});

// ---- API Routes ----
import authRouter from './routes/auth.routes';
import userRouter, { roleRouter } from './routes/user.routes';
import staffRouter from './routes/staff.routes';
import locationRouter from './routes/location.routes';
import patientRouter from './routes/patient.routes';
import appointmentRouter from './routes/appointment.routes';
import clinicalRouter from './routes/clinical.routes';
import consentRouter from './routes/consent.routes';
import inventoryRouter from './routes/inventory.routes';
import billingRouter from './routes/billing.routes';
import complianceRouter from './routes/compliance.routes';
import tableCompatibilityRouter from './routes/tableCompatibility.routes';

app.use(`${env.API_PREFIX}/auth`, authRouter);
app.use(`${env.API_PREFIX}/users`, userRouter);
app.use(`${env.API_PREFIX}/roles`, roleRouter);
app.use(`${env.API_PREFIX}/staff`, staffRouter);
app.use(`${env.API_PREFIX}/locations`, locationRouter);
app.use(`${env.API_PREFIX}/patients`, patientRouter);
app.use(`${env.API_PREFIX}/appointments`, appointmentRouter);
app.use(`${env.API_PREFIX}/clinical`, clinicalRouter);
app.use(`${env.API_PREFIX}/consents`, consentRouter);
app.use(`${env.API_PREFIX}/inventory`, inventoryRouter);
app.use(`${env.API_PREFIX}/billing`, billingRouter);
app.use(`${env.API_PREFIX}/compliance`, complianceRouter);

// Table compatibility fallback for legacy endpoints (/api/:tableName)
app.use('/api', tableCompatibilityRouter);
app.use(`${env.API_PREFIX}`, tableCompatibilityRouter);

// ---- 404 Handler ----
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'RES_001',
      message: 'Endpoint not found',
    },
  });
});

// ---- Global Error Handler (MUST be last) ----
app.use(globalErrorHandler);

export default app;
