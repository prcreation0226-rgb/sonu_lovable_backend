// Radiantilyk EMR — JWT Utility
// Access Tokens: 15-minute expiration, contains userId, email, roles, sessionId
// Refresh Tokens: 7-day expiration, stored in refresh_tokens table for rotation

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRoleName } from '../types';

export interface AccessTokenPayload {
  sub: string;       // User ID
  email: string;
  roles: UserRoleName[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;       // User ID
  tokenId: string;   // Database RefreshToken ID
  sessionId: string;
  iat?: number;
  exp?: number;
}

/**
 * Sign an Access Token (short-lived, 15m default).
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Sign a Refresh Token (long-lived, 7d default).
 */
export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verify an Access Token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/**
 * Verify a Refresh Token.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
