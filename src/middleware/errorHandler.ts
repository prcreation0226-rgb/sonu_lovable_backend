// Radiantilyk EMR — Global Error Handler Middleware
// Catches all unhandled errors and returns a consistent JSON response.
// Never leaks stack traces or internal details in production.

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { ApiResponse, ErrorCodes } from '../types';
import { env } from '../config/env';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ---- Known Application Errors ----
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error(`[CRITICAL] Non-operational error: ${err.message}`, { stack: err.stack });
    } else {
      logger.warn(`[APP_ERROR] ${err.statusCode} ${err.errorCode}: ${err.message}`);
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: env.IS_PRODUCTION ? undefined : err.details,
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // ---- Zod Validation Errors ----
  if (err instanceof ZodError) {
    logger.warn(`[VALIDATION] Zod validation failed: ${err.errors.length} issues`);

    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    };

    res.status(400).json(response);
    return;
  }

  // ---- Prisma Errors ----
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn(`[PRISMA_VALIDATION] ${err.message}`);
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Database query validation failed',
        details: env.IS_PRODUCTION ? undefined : err.message,
      },
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    let statusCode = 500;
    let message = 'Database operation failed';
    let code: string = ErrorCodes.DATABASE_ERROR;

    switch (err.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        message = 'A record with this value already exists';
        code = ErrorCodes.CONFLICT;
        break;
      case 'P2025': // Record not found
        statusCode = 404;
        message = 'Record not found';
        code = ErrorCodes.NOT_FOUND;
        break;
      case 'P2003': // Foreign key constraint violation
        statusCode = 400;
        message = 'Related record not found';
        code = ErrorCodes.VALIDATION_ERROR;
        break;
    }

    logger.warn(`[PRISMA] ${err.code}: ${err.message}`);

    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details: env.IS_PRODUCTION ? undefined : { prismaCode: err.code },
      },
    };

    res.status(statusCode).json(response);
    return;
  }

  // ---- Unexpected / Unknown Errors ----
  logger.error(`[UNHANDLED] ${err.message}`, { stack: err.stack });

  const response: ApiResponse = {
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: env.IS_PRODUCTION ? 'An unexpected error occurred' : err.message,
    },
  };

  res.status(500).json(response);
}
