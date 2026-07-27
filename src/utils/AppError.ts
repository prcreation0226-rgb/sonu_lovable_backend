// Radiantilyk EMR — Custom Application Error Class
// Structured error with HTTP status code and error code for consistent API responses.

import { ErrorCode, ErrorCodes } from '../types';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  // ---- Factory Methods ----

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, ErrorCodes.VALIDATION_ERROR, true, details);
  }

  static unauthorized(message: string = 'Authentication required'): AppError {
    return new AppError(message, 401, ErrorCodes.INVALID_CREDENTIALS);
  }

  static forbidden(message: string = 'Access denied'): AppError {
    return new AppError(message, 403, ErrorCodes.FORBIDDEN);
  }

  static notFound(resource: string = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404, ErrorCodes.NOT_FOUND);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, ErrorCodes.CONFLICT);
  }

  static tooManyRequests(message: string = 'Rate limit exceeded'): AppError {
    return new AppError(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED);
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 500, ErrorCodes.INTERNAL_ERROR, false);
  }
}
