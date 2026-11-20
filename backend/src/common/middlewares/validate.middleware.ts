import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';

type Schemas = {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
};

type Validated<S extends Schemas> = {
  body: S['body'] extends z.ZodType ? z.output<S['body']> : undefined;
  params: S['params'] extends z.ZodType ? z.output<S['params']> : undefined;
  query: S['query'] extends z.ZodType ? z.output<S['query']> : undefined;
};

/**
 * Validates body/params/query with Zod and stores the parsed values in
 * `res.locals.validated`. Express 5 makes `req.query` read-only, so parsed
 * data is never written back onto `req`; controllers read it via `getValidated`.
 * A ZodError is forwarded to the global error handler (400).
 */
export function validate<S extends Schemas>(schemas: S): RequestHandler {
  return (req, res, next) => {
    try {
      res.locals.validated = {
        body: schemas.body ? schemas.body.parse(req.body) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getValidated<S extends Schemas>(res: Response, _schemas: S): Validated<S> {
  return res.locals.validated as Validated<S>;
}
