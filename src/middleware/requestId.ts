// Radiantilyk EMR — Request ID Middleware
// Attaches a unique UUID to every incoming request for distributed tracing.

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../types';

export function requestId(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
