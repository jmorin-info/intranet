import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { StorageController } from "../storage/storage.controller";
import { StorageService } from "../storage/storage.service";
import { UsersService } from "./users.service";

const USER = "11111111-1111-4111-8111-111111111111";

describe("avatar HTTP boundary with real Multer and Sharp", () => {
  let app: INestApplication;
  let directory: string;
  let storage: string;
  let base: string;
  let png: Buffer;
  let current: string;
  const originalCwd = process.cwd();
  const service = { findById: jest.fn(), updateAvatarUrl: jest.fn() };

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-http-"));
    const working = path.join(directory, "apps/backend");
    await fs.mkdir(working, { recursive: true });
    process.chdir(working);
    storage = path.join(directory, "storage/avatars");
    // The controller's storage root is evaluated once, matching the existing
    // production path contract; no real application storage is used here.
    const { UsersController } = await import("./users.controller");
    const builder = Test.createTestingModule({
      controllers: [UsersController, StorageController],
      providers: [
        { provide: UsersService, useValue: service },
        { provide: StorageService, useValue: {} },
      ],
    });
    builder.overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = { id: USER, role: "COLLABORATEUR" };
        return true;
      },
    });
    builder.overrideGuard(RolesGuard).useValue({ canActivate: () => true });
    builder.overrideGuard(UserThrottlerGuard).useValue({ canActivate: () => true });
    const module = await builder.compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
    png = await sharp({ create: { width: 24, height: 12, channels: 3, background: "#2468ac" } })
      .png()
      .toBuffer();
  });
  beforeEach(async () => {
    await fs.rm(storage, { recursive: true, force: true });
    await fs.mkdir(storage, { recursive: true });
    await fs.writeFile(path.join(storage, `${USER}.png`), png);
    current = `/storage/avatars/${USER}.png`;
    service.findById.mockReset().mockImplementation(async () => ({ id: USER, avatarUrl: current }));
    service.updateAvatarUrl.mockReset().mockImplementation(async (_id: string, url: string) => {
      current = url;
      return { avatarUrl: url };
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    process.chdir(originalCwd);
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  function upload(buffer: Buffer, mimetype = "image/png", name = "photo.png", field = "avatar") {
    const body = new FormData();
    body.append(field, new Blob([new Uint8Array(buffer)], { type: mimetype }), name);
    return fetch(base + "/users/me/avatar", { method: "POST", body });
  }

  it("publishes an HTML-named PNG only as a decoded WebP with a strong image MIME", async () => {
    const response = await upload(png, "image/png", "payload.html");
    expect(response.status).toBe(201);
    const result = (await response.json()) as { avatarUrl: string };
    expect(result.avatarUrl).toMatch(new RegExp(`^/storage/avatars/${USER}-[a-f0-9-]+\\.webp$`));
    const served = await fetch(base + result.avatarUrl);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect((await sharp(Buffer.from(await served.arrayBuffer())).metadata()).format).toBe("webp");
    expect(await fs.readdir(storage)).toEqual([path.basename(result.avatarUrl)]);
  });

  it("rejects PNG magic bytes followed by HTML and keeps the old image", async () => {
    const invalid = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from("<html><script>alert(1)</script></html>"),
    ]);
    expect((await upload(invalid, "image/png", `${USER}.png`)).status).toBe(400);
    expect(await fs.readFile(path.join(storage, `${USER}.png`))).toEqual(png);
    expect(service.updateAvatarUrl).not.toHaveBeenCalled();
  });

  it("enforces the multipart file-size limit before publication", async () => {
    expect((await upload(Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]))).status).toBe(413);
    expect(await fs.readdir(storage)).toEqual([`${USER}.png`]);
    expect(service.updateAvatarUrl).not.toHaveBeenCalled();
  });

  it("rejects multipart MIME spoofing", async () => {
    expect((await upload(png, "image/jpeg")).status).toBe(400);
    expect(await fs.readdir(storage)).toEqual([`${USER}.png`]);
  });

  it("rejects a disallowed MIME before decoding or writing", async () => {
    expect((await upload(png, "text/html", "payload.html")).status).toBe(400);
    expect(service.findById).not.toHaveBeenCalled();
    expect(await fs.readdir(storage)).toEqual([`${USER}.png`]);
  });

  it("rolls back a new upload on DB failure through the actual endpoint", async () => {
    service.updateAvatarUrl.mockRejectedValue(new Error("synthetic DB error"));
    expect((await upload(png)).status).toBe(500);
    expect(await fs.readdir(storage)).toEqual([`${USER}.png`]);
  });

  it("rejects more than one multipart file", async () => {
    const body = new FormData();
    for (let i = 0; i < 2; i++)
      body.append(
        "avatar",
        new Blob([new Uint8Array(png)], { type: "image/png" }),
        `photo${i}.png`,
      );
    expect((await fetch(base + "/users/me/avatar", { method: "POST", body })).status).toBe(400);
    expect(await fs.readdir(storage)).toEqual([`${USER}.png`]);
  });

  it("documents that the existing serving route already refuses legacy HTML extensions", async () => {
    await fs.writeFile(path.join(storage, `${USER}.html`), "<script>synthetic</script>");
    expect((await fetch(base + `/storage/avatars/${USER}.html`)).status).toBe(400);
  });

  it("refuses a seventh in-flight upload before multipart allocation and recovers capacity", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let admitted!: () => void;
    const ready = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    let count = 0;
    service.updateAvatarUrl.mockImplementation(async (_id: string, url: string) => {
      count++;
      if (count === 6) admitted();
      await gate;
      current = url;
      return { avatarUrl: url };
    });
    const pending = Array.from({ length: 6 }, () => upload(png));
    try {
      await ready;
      const calls = service.findById.mock.calls.length;
      const rejected = await upload(Buffer.concat([png, Buffer.alloc(1024 * 1024)]));
      expect(rejected.status).toBe(503);
      expect(rejected.headers.get("connection")).toBe("close");
      expect(service.findById).toHaveBeenCalledTimes(calls);
      // No multipart bytes are sent: admission must reject before Multer waits
      // for or allocates the declared 2 MiB upload body.
      const headersOnly = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          base + "/users/me/avatar",
          {
            method: "POST",
            headers: {
              "Content-Type": "multipart/form-data; boundary=synthetic",
              "Content-Length": "2097152",
            },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode!);
          },
        );
        request.once("error", reject);
        request.setTimeout(2000, () =>
          request.destroy(new Error("Admission waited for multipart body")),
        );
        request.flushHeaders();
      });
      expect(headersOnly).toBe(503);
    } finally {
      release();
      const results = await Promise.all(pending);
      expect(results.every((response) => response.status === 201)).toBe(true);
    }
    expect((await upload(png)).status).toBe(201);
  });
});
