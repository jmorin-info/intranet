import type { NextFunction, Request, Response } from 'express';
import { posix } from 'path';

/** Private attachments are served by controllers that enforce their owner's ACL. */
export function blockPrivateUploads(req: Request, res: Response, next: NextFunction): void {
  let pathname: string;
  try {
    pathname = posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/'));
  } catch {
    res.status(400).end();
    return;
  }

  if (/^\/uploads\/(wiki|certificates)(?:\/|$)/i.test(pathname)) {
    res.status(404).end();
    return;
  }
  next();
}
