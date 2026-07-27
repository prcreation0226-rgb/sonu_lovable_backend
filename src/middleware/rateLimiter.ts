// Radiantilyk EMR — Rate Limiting Middleware
// Dedicated rate limiters to prevent circular dependency with app.ts.

import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Strict Rate Limiter for Auth & Public Booking Endpoints (10 attempts / 15m)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_001',
      message: 'Too many authentication or booking attempts. Please try again later.',
    },
  },
});

/**
 * Global API Rate Limiter
 */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 1000, // 1000 requests per 15 minutes window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_001',
      message: 'Too many requests. Please try again later.',
    },
  },
  skip: (req) => {
    // Skip rate limiting for public read-only website endpoints
    if (req.method === 'GET') {
      const path = req.path.toLowerCase();
      if (
        path.includes('locations') ||
        path.includes('public_testimonials') ||
        path.includes('services') ||
        path.includes('health') ||
        path.includes('categories')
      ) {
        return true;
      }
    }
    return false;
  },
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
  },
});
