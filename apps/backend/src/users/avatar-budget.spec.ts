import { BadRequestException, ExecutionContext, ServiceUnavailableException } from "@nestjs/common";
import { EventEmitter } from "node:events";
import { AvatarDecodeBudget, AvatarRequestBudget, AVATAR_ABORT_SIGNAL } from "./avatar-budget";
import { AvatarUploadGuard } from "./avatar-upload.guard";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("bounded avatar work", () => {
  it("runs at most two jobs, queues four and rejects excess work", async () => {
    const budget = new AvatarDecodeBudget(2, 4);
    const gate = deferred();
    let running = 0;
    let peak = 0;
    const work = async () => {
      running++;
      peak = Math.max(peak, running);
      try {
        await gate.promise;
        return "ok";
      } finally {
        running--;
      }
    };
    const jobs = Array.from({ length: 8 }, () => budget.run(work));
    const finished = Promise.allSettled(jobs);
    await Promise.resolve();
    expect(budget.counts).toEqual({ active: 2, waiting: 4 });
    expect(peak).toBe(2);
    gate.resolve();
    const results = await finished;
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(6);
    for (const row of results.filter((row) => row.status === "rejected"))
      expect(row.reason).toBeInstanceOf(ServiceUnavailableException);
    expect(peak).toBe(2);
    expect(budget.counts).toEqual({ active: 0, waiting: 0 });
  });

  it("releases a failed active job and runs its queued successor", async () => {
    const budget = new AvatarDecodeBudget(1, 1);
    const gate = deferred();
    const first = budget.run(async () => {
      await gate.promise;
      throw new Error("decoder fails");
    });
    const failure = expect(first).rejects.toThrow("decoder fails");
    const second = budget.run(async () => "recovered");
    gate.resolve();
    await failure;
    expect(await second).toBe("recovered");
    expect(budget.counts).toEqual({ active: 0, waiting: 0 });
  });

  it("removes an aborted queued job without ever starting it", async () => {
    const budget = new AvatarDecodeBudget(1, 1);
    const gate = deferred();
    const controller = new AbortController();
    const active = budget.run(async () => {
      await gate.promise;
    });
    const work = jest.fn(async () => "never");
    const queued = budget.run(work, controller.signal);
    const aborted = expect(queued).rejects.toBeInstanceOf(BadRequestException);
    controller.abort();
    await aborted;
    expect(work).not.toHaveBeenCalled();
    expect(budget.counts).toEqual({ active: 1, waiting: 0 });
    const successor = budget.run(async () => "successor");
    gate.resolve();
    await active;
    expect(await successor).toBe("successor");
    expect(budget.counts).toEqual({ active: 0, waiting: 0 });
  });

  it("keeps an aborted active permit until its actual native work ends", async () => {
    const budget = new AvatarDecodeBudget(1, 1);
    const gate = deferred();
    const controller = new AbortController();
    const active = budget.run(async () => {
      await gate.promise;
      return "discarded";
    }, controller.signal);
    const aborted = expect(active).rejects.toBeInstanceOf(BadRequestException);
    await Promise.resolve();
    controller.abort();
    const next = jest.fn(async () => "next");
    const queued = budget.run(next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
    expect(budget.counts).toEqual({ active: 1, waiting: 1 });
    gate.resolve();
    await aborted;
    expect(await queued).toBe("next");
    expect(budget.counts).toEqual({ active: 0, waiting: 0 });
  });

  it("does not reserve capacity for an already aborted request", async () => {
    const budget = new AvatarDecodeBudget();
    const controller = new AbortController();
    controller.abort();
    const work = jest.fn(async () => undefined);
    await expect(budget.run(work, controller.signal)).rejects.toBeInstanceOf(BadRequestException);
    expect(work).not.toHaveBeenCalled();
    expect(budget.counts).toEqual({ active: 0, waiting: 0 });
  });

  it("makes request release idempotent", () => {
    const budget = new AvatarRequestBudget(1);
    const release = budget.acquire();
    expect(() => budget.acquire()).toThrow(ServiceUnavailableException);
    release();
    release();
    const next = budget.acquire();
    expect(() => budget.acquire()).toThrow(ServiceUnavailableException);
    next();
  });
});

describe("avatar admission before multipart parsing", () => {
  function context() {
    const request = Object.assign(new EventEmitter(), { aborted: false }) as EventEmitter & {
      aborted: boolean;
      [AVATAR_ABORT_SIGNAL]?: AbortSignal;
    };
    const response = Object.assign(new EventEmitter(), {
      writableFinished: false,
      destroyed: false,
      setHeader: jest.fn(),
    });
    const execution = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
    return { request, response, execution };
  }

  it("refuses a seventh body, ignores normal request close, and frees on response finish", () => {
    const guard = new AvatarUploadGuard();
    const admitted = Array.from({ length: 6 }, context);
    try {
      for (const item of admitted) expect(guard.canActivate(item.execution)).toBe(true);
      admitted[0].request.emit("close");
      const refused = context();
      expect(() => guard.canActivate(refused.execution)).toThrow(ServiceUnavailableException);
      expect(refused.response.setHeader).toHaveBeenCalledWith("Connection", "close");
      admitted[0].response.writableFinished = true;
      admitted[0].response.emit("finish");
      const next = context();
      expect(guard.canActivate(next.execution)).toBe(true);
      next.response.emit("finish");
    } finally {
      for (const item of admitted) item.response.emit("finish");
    }
  });

  it("cancels on request abort and response disconnect and releases each slot once", () => {
    const guard = new AvatarUploadGuard();
    const aborted = context();
    const disconnected = context();
    try {
      guard.canActivate(aborted.execution);
      guard.canActivate(disconnected.execution);
      aborted.request.emit("aborted");
      aborted.response.emit("close");
      disconnected.response.emit("close");
      expect(aborted.request[AVATAR_ABORT_SIGNAL]?.aborted).toBe(true);
      expect(disconnected.request[AVATAR_ABORT_SIGNAL]?.aborted).toBe(true);
      const admitted = Array.from({ length: 6 }, context);
      try {
        for (const item of admitted) expect(guard.canActivate(item.execution)).toBe(true);
      } finally {
        for (const item of admitted) item.response.emit("finish");
      }
    } finally {
      aborted.response.emit("finish");
      disconnected.response.emit("finish");
    }
  });
});
