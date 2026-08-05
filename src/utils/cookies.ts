// Radiantilyk EMR — Cookie Utility
// Centralized cookie configuration for auth tokens.
// Dynamic path based on API_PREFIX to prevent version prefix mismatches.
// Environment-specific configuration:
//   - Dev: secure=false, sameSite='lax'
//   - Prod: secure=true, sameSite='none' (Required for cross-site Railway deployment)
// Ensures clearCookie uses identical options to setCookie (required by browsers).

import { Response } from 'express';
import { env } from '../config/env';

const ACCESS_COOKIE = 'rka_access';
const REFRESH_COOKIE = 'rka_refresh';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'none' | 'lax' | 'strict';
  path: string;
  maxAge?: number;
}

/**
 * Access cookie options.
 * Path: /api (derived from API prefix root)
 */
function accessCookieOptions(maxAge?: number): CookieOptions {
  const isProd = env.IS_PRODUCTION;
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

/**
 * Refresh cookie options.
 * Path: ${API_PREFIX}/auth (e.g. /api/v1/auth)
 * Matches endpoints: POST /api/v1/auth/refresh, POST /api/v1/auth/logout, POST /api/v1/auth/refresh-token
 */
function refreshCookieOptions(maxAge?: number): CookieOptions {
  const isProd = env.IS_PRODUCTION;
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

/**
 * Set both access and refresh cookies on the response.
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): void {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(ACCESS_MAX_AGE_MS));
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(REFRESH_MAX_AGE_MS));
}

/**
 * Clear both auth cookies.
 * Uses identical options (minus maxAge) so browsers actually delete them.
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, accessCookieOptions());
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

/**
 * Read the access token from cookies (or fallback to Authorization header).
 */
export function extractAccessToken(req: { cookies?: Record<string, string>; headers: Record<string, string | string[] | undefined> }): string | null {
  // 1. Cookie (primary)
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  if (cookieToken) return cookieToken;

  // 2. Authorization header (transition compatibility)
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1] || null;
  }

  return null;
}

/**
 * Read the refresh token from cookies.
 */
export function extractRefreshToken(req: { cookies?: Record<string, string> }): string | null {
  return req.cookies?.[REFRESH_COOKIE] || null;
}

const MFA_PENDING_COOKIE = 'rka_mfa_pending';
const MFA_PENDING_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const MFA_PENDING_PATH = '/api/v1/auth/mfa';

function mfaPendingCookieOptions(maxAge?: number): CookieOptions {
  const isProd = env.IS_PRODUCTION;
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    path: MFA_PENDING_PATH,
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export function setMfaPendingCookie(res: Response, challengeToken: string): void {
  res.cookie(MFA_PENDING_COOKIE, challengeToken, mfaPendingCookieOptions(MFA_PENDING_MAX_AGE_MS));
}

export function clearMfaPendingCookie(res: Response): void {
  res.clearCookie(MFA_PENDING_COOKIE, mfaPendingCookieOptions());
}

export function extractMfaPendingToken(req: { cookies?: Record<string, string>; body?: { mfaToken?: string } }): string | null {
  return req.cookies?.[MFA_PENDING_COOKIE] || req.body?.mfaToken || null;
}

export { ACCESS_COOKIE, REFRESH_COOKIE, MFA_PENDING_COOKIE, accessCookieOptions, refreshCookieOptions };
