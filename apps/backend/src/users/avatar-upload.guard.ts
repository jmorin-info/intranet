import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { AVATAR_ABORT_SIGNAL, avatarRequestBudget } from "./avatar-budget";

export type AvatarRequest = Request & { [AVATAR_ABORT_SIGNAL]?: AbortSignal };

/** Runs before Multer so rejected uploads never allocate a 2 MiB file buffer. */
@Injectable()
export class AvatarUploadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AvatarRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    let release: () => void;
    try {
      release = avatarRequestBudget.acquire();
    } catch (error) {
      response.setHeader("Connection", "close");
      throw error;
    }
    const controller = new AbortController();
    request[AVATAR_ABORT_SIGNAL] = controller.signal;
    const finished = () => {
      release();
      request.removeListener("aborted", aborted);
      request.removeListener("error", aborted);
      response.removeListener("finish", finished);
      response.removeListener("close", closed);
    };
    const aborted = () => {
      controller.abort();
      finished();
    };
    const closed = () => {
      if (!response.writableFinished) controller.abort();
      finished();
    };
    request.once("aborted", aborted);
    request.once("error", aborted);
    response.once("finish", finished);
    response.once("close", closed);
    if (request.aborted || response.destroyed) aborted();
    return true;
  }
}
