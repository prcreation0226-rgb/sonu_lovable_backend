// Radiantilyk EMR — Express Application Setup
// Configures all global middleware, security headers, and route mounting.
// This file does NOT start the server — see server.ts for that.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
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

// ---- Cookie Parser ----
app.use(cookieParser());

// ---- Compression ----
app.use(compression());

// ---- CSRF Origin Validation ----
// Validate Origin header on state-changing requests to prevent CSRF attacks.
// Only applies to requests with cookies (browser requests).
const allowedOrigins = env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  // Only check state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    // If Origin header is present (browser request), validate it
    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({
        success: false,
        error: { code: 'CSRF_001', message: 'Origin not allowed' },
      });
    }
  }
  next();
});

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
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      service: 'radiantilyk-emr-backend',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    },
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
if (env.API_PREFIX !== '/api') {
  app.get(`${env.API_PREFIX}/health`, healthHandler);
}

// ---- API Routes ----
import authRouter from './routes/auth.routes';
import passwordResetRouter from './routes/password-reset.routes';
import mfaRouter from './routes/mfa.routes';
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
import availabilityRouter from './routes/availability.routes';
import serviceRouter from './routes/service.routes';
import patientAccountRouter from './routes/patientAccount.routes';

const apiRouters: [string, any][] = [
  ['/auth/mfa', mfaRouter],
  ['/admin', mfaRouter],
  ['/auth', passwordResetRouter],
  ['/auth', authRouter],
  ['/users', userRouter],
  ['/roles', roleRouter],
  ['/staff', staffRouter],
  ['/locations', locationRouter],
  ['/services', serviceRouter],
  ['/patients', patientRouter],
  ['/patient', patientRouter],
  ['/patient-accounts', patientAccountRouter],
  ['/appointments', appointmentRouter],
  ['/clinical', clinicalRouter],
  ['/consents', consentRouter],
  ['/inventory', inventoryRouter],
  ['/billing', billingRouter],
  ['/compliance', complianceRouter],
];

for (const [path, router] of apiRouters) {
  if (env.API_PREFIX !== '/api') {
    app.use(`${env.API_PREFIX}${path}`, router);
  }
  app.use(`/api${path}`, router);
}

// Availability endpoints (public, no auth required)
app.use('/api', availabilityRouter);
if (env.API_PREFIX !== '/api') {
  app.use(`${env.API_PREFIX}`, availabilityRouter);
}

// Table compatibility fallback for legacy endpoints (/api/:tableName)
app.use('/api', tableCompatibilityRouter);
if (env.API_PREFIX !== '/api') {
  app.use(`${env.API_PREFIX}`, tableCompatibilityRouter);
}

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
