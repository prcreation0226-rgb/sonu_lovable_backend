// Radiantilyk EMR — Zod Request Validation Middleware
// Validates request body, params, and query against Zod schemas.
// Returns structured 400 errors with field-level details.

import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

interface ValidationSchemas {
  body?: AnyZodObject;
  params?: AnyZodObject;
  query?: AnyZodObject;
}

/**
 * Validate request data against Zod schemas.
 * 
 * Usage:
 *   router.post('/patients', validate({ body: CreatePatientSchema }), handler);
 */
export function validate(schemas: ValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params) as any;
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query) as any;
      }
      next();
    } catch (error) {
      // Let the global error handler deal with ZodErrors
      next(error);
    }
  };
}
