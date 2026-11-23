// One JSON line per request with a request ID (#64), in the shape of project-standards docs/logging.md
// and the apps' managed requestLog (templates/app/backend/src/standard/http.ts), so an app's request ID
// (sent by @sirloinbh/auth-client as X-Request-Id) can be followed into this service.
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Incoming IDs that are kept; anything else is replaced, so a client cannot write arbitrary text into the log. */
export const REQUEST_ID_PATTERN = /^[\w.-]{1,128}$/;

export function requestLog(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  const started = performance.now();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  // Better Auth's hooks see only the request headers, so the chosen ID replaces the incoming one there
  // and the sign_in lines (signin-log.ts) carry the same ID as this line.
  req.headers['x-request-id'] = requestId;
  // 'close' also fires when the client aborts, where 'finish' would not.
  res.on('close', () => {
    const aborted = !res.writableFinished;
    const status = aborted ? 499 : res.statusCode;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      method: req.method,
      // No query string: the OAuth callback's code and state, and returnTo, stay out of the log.
      path: req.originalUrl.split('?')[0],
      status,
      ...(aborted ? { aborted: true } : {}),
      ms: Math.round(performance.now() - started),
    });
    if (status >= 500) console.error(line);
    else console.log(line);
  });
  next();
}
