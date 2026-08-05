// Radiantilyk EMR — Rate Limiting Middleware
// Dedicated rate limiters to prevent circular dependency with app.ts.

import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Rate Limiter for Auth Login & Password Endpoints (100 attempts / 15m)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 attempts per 15 minutes window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_001',
      message: 'Too many authentication or booking attempts. Please try again later.',
    },
  },
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || req.socket.remoteAddress
      || 'unknown';
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
    // Skip rate limiting for public booking availability endpoints
    if (req.method === 'POST') {
      const path = req.path.toLowerCase();
      if (
        path.includes('get-availability-range') ||
        path.includes('get-availability')
      ) {
        return true;
      }
    }
    return false;
  },
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || req.socket.remoteAddress
      || 'unknown';
  },
});

/**
 * Rate Limiter for MFA Verification & Security Endpoints
 */
export const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_MFA',
      message: 'Too many MFA attempts. Please try again later.',
    },
  },
  keyGenerator: (req) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    return `mfa_${ip}`;
  },
});
