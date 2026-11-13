import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { AVATAR_MAX_BYTES, encodeAvatar, publishAvatar } from "./avatar-upload";
import { avatarDecodeBudget } from "./avatar-budget";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const URL_A = `/storage/avatars/${USER}-${ID_A}.webp`;
const URL_B = `/storage/avatars/${USER}-${ID_B}.webp`;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = (buffer: Buffer, mimetype = "image/png", originalname = "photo.png") => ({
  buffer,
  mimetype,
  originalname,
});
const raster = (width = 24, height = 12) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 30, g: 100, b: 190, alpha: 0.8 } },
  });

describe("avatar raster validation and publication", () => {
  let directory: string;
  let png: Buffer;
  let previousUrl: string;
  let previousPath: string;
  let current: string | null;
  let store: {
    readCurrentAvatar: jest.Mock<Promise<string | null>, []>;
    saveAvatar: jest.Mock<Promise<void>, [string]>;
  };

  beforeAll(async () => {
    png = await raster().png().toBuffer();
  });
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-security-"));
    previousUrl = `/storage/avatars/${USER}.png`;
    previousPath = path.join(directory, `${USER}.png`);
    await fs.writeFile(previousPath, png);
    current = previousUrl;
    store = {
      readCurrentAvatar: jest.fn(async () => current),
      saveAvatar: jest.fn(async (url: string) => {
        current = url;
      }),
    };
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  const names = async (directory: string) => (await fs.readdir(directory)).sort();

  it.each(["png", "jpeg", "webp"] as const)(
    "decodes and re-encodes a real %s as WebP",
    async (format) => {
      const input = await raster().toFormat(format).toBuffer();
      const output = await encodeAvatar(file(input, `image/${format}`));
      const info = await sharp(output).metadata();
      expect(info).toMatchObject({ format: "webp", width: 24, height: 12 });
      expect(output.equals(input)).toBe(false);
    },
  );

  it("ignores an HTML client extension and publishes only a server-generated .webp", async () => {
    const result = await publishAvatar(USER, file(png, "image/png", "payload.html"), store, {
      storagePath: directory,
      createId: () => ID_A,
    });
    expect(result.avatarUrl).toBe(URL_A);
    expect(current).toBe(URL_A);
    expect(await names(directory)).toEqual([`${USER}-${ID_A}.webp`]);
    expect(
      (await sharp(await fs.readFile(path.join(directory, `${USER}-${ID_A}.webp`))).metadata())
        .format,
    ).toBe("webp");
  });

  it("strips appended HTML from a valid PNG polyglot", async () => {
    const payload = Buffer.concat([
      png,
      Buffer.from('<html><script>alert("avatar-polyglot")</script></html>'),
    ]);
    const output = await encodeAvatar(file(payload));
    expect((await sharp(output).metadata()).format).toBe("webp");
    expect(output.includes(Buffer.from("avatar-polyglot"))).toBe(false);
    expect(output.includes(Buffer.from("<script>"))).toBe(false);
  });

  it("strips image metadata instead of forwarding attacker-controlled EXIF", async () => {
    const input = await raster()
      .withExif({ IFD0: { Copyright: "avatar-untrusted-metadata" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const output = await encodeAvatar(file(input, "image/jpeg"));
    expect((await sharp(output).metadata()).exif).toBeUndefined();
    expect(output.includes(Buffer.from("avatar-untrusted-metadata"))).toBe(false);
  });

  it.each([
    [
      "header followed by HTML",
      Buffer.concat([PNG_MAGIC, Buffer.from("<html><script>alert(1)</script></html>")]),
    ],
    ["empty file", Buffer.alloc(0)],
    ["HTML only", Buffer.from("<html><script>alert(1)</script></html>")],
    ["truncated JPEG", Buffer.from([255, 216, 255, 224, 0, 16])],
    ["fake RIFF WebP", Buffer.from("RIFF0000WEBP<html>payload</html>")],
  ])("rejects %s without touching the previous avatar", async (_label, input) => {
    await expect(
      publishAvatar(USER, file(input), store, { storagePath: directory }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await fs.readFile(previousPath)).toEqual(png);
    expect(await names(directory)).toEqual([`${USER}.png`]);
    expect(store.saveAvatar).not.toHaveBeenCalled();
  });

  it("fully decodes PNG pixel data rather than accepting a valid header", async () => {
    const truncated = png.subarray(0, Math.max(33, png.length - 28));
    await expect(encodeAvatar(file(truncated))).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(["image/jpeg", "image/webp", "image/svg+xml", "text/html", "application/octet-stream"])(
    "rejects a PNG declared as %s",
    async (mimetype) => {
      await expect(encodeAvatar(file(png, mimetype))).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("rejects a real TIFF disguised as PNG", async () => {
    await expect(encodeAvatar(file(await raster().tiff().toBuffer()))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects SVG even if the client declares PNG", async () => {
    await expect(
      encodeAvatar(
        file(
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
          ),
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("checks actual buffered bytes against the 2 MiB limit", async () => {
    await expect(
      encodeAvatar(file(Buffer.concat([png, Buffer.alloc(AVATAR_MAX_BYTES)]))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a thin image with a dimension above the limit", async () => {
    await expect(encodeAvatar(file(await raster(4097, 1).png().toBuffer()))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a highly compressed input above the decoded-pixel limit", async () => {
    const input = await raster(4097, 4097).png({ compressionLevel: 9 }).toBuffer();
    expect(input.length).toBeLessThan(AVATAR_MAX_BYTES);
    await expect(encodeAvatar(file(input))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("bounds output dimensions without enlarging small images", async () => {
    const output = await encodeAvatar(file(await raster(1600, 800).png().toBuffer()));
    expect(await sharp(output).metadata()).toMatchObject({ width: 512, height: 256 });
  });

  it("rejects a real animated WebP instead of silently retaining active frames", async () => {
    const raw = Buffer.alloc(4 * 4 * 4 * 2, 255);
    raw.fill(30, 0, 4 * 4 * 4);
    const input = await sharp(raw, { raw: { width: 4, height: 8, channels: 4, pageHeight: 4 } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(input).metadata()).pages).toBe(2);
    await expect(encodeAvatar(file(input, "image/webp"))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each(["../escape", "/root/admin", "a/b", "..\\escape", USER + "\0", "not-a-uuid"])(
    "confines a hostile user ID %s",
    async (id) => {
      await expect(
        publishAvatar(id, file(png), store, { storagePath: directory }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await names(directory)).toEqual([`${USER}.png`]);
    },
  );

  it("rolls back its new raster after a confirmed DB failure and preserves the old avatar", async () => {
    const error = new Error("synthetic database failure");
    store.saveAvatar.mockRejectedValue(error);
    await expect(
      publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_A }),
    ).rejects.toBe(error);
    expect(await names(directory)).toEqual([`${USER}.png`]);
    expect(current).toBe(previousUrl);
  });

  it("preserves the raster when the DB committed before reporting a network error", async () => {
    store.saveAvatar.mockImplementation(async (url) => {
      current = url;
      throw new Error("ambiguous commit");
    });
    await expect(
      publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_A }),
    ).rejects.toThrow("ambiguous commit");
    expect(current).toBe(URL_A);
    expect(await names(directory)).toEqual([`${USER}-${ID_A}.webp`, `${USER}.png`].sort());
  });

  it("keeps a safe orphan when the DB outcome cannot be established", async () => {
    store.saveAvatar.mockRejectedValue(new Error("DB unavailable"));
    store.readCurrentAvatar
      .mockResolvedValueOnce(previousUrl)
      .mockRejectedValue(new Error("DB still unavailable"));
    await expect(
      publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_A }),
    ).rejects.toThrow("DB unavailable");
    expect(await names(directory)).toEqual([`${USER}-${ID_A}.webp`, `${USER}.png`].sort());
  });

  it("retries collisions without replacing or deleting the colliding file", async () => {
    const existing = path.join(directory, `${USER}-${ID_A}.webp`);
    await fs.writeFile(existing, "existing-collision-owner");
    const createId = jest.fn().mockReturnValueOnce(ID_A).mockReturnValue(ID_B);
    expect(
      await publishAvatar(USER, file(png), store, { storagePath: directory, createId }),
    ).toEqual({ avatarUrl: URL_B });
    expect(await fs.readFile(existing, "utf8")).toBe("existing-collision-owner");
    expect(await names(directory)).toEqual([`${USER}-${ID_A}.webp`, `${USER}-${ID_B}.webp`]);
  });

  it("rejects repeated collisions and removes only its temporary file", async () => {
    const existing = path.join(directory, `${USER}-${ID_A}.webp`);
    await fs.writeFile(existing, "existing-collision-owner");
    await expect(
      publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_A }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(await fs.readFile(existing, "utf8")).toBe("existing-collision-owner");
    expect(current).toBe(previousUrl);
    expect(await names(directory)).toEqual([`${USER}-${ID_A}.webp`, `${USER}.png`].sort());
  });

  it("never follows a colliding symlink", async () => {
    const existing = path.join(directory, `${USER}-${ID_A}.webp`);
    await fs.symlink(previousPath, existing);
    await expect(
      publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_A }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect((await fs.lstat(existing)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(previousPath)).toEqual(png);
  });

  it("does not delete another user's avatar referenced by a stale profile", async () => {
    const other = path.join(directory, `${OTHER}.png`);
    await fs.writeFile(other, png);
    current = `/storage/avatars/${OTHER}.png`;
    await publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_A });
    expect(await fs.readFile(other)).toEqual(png);
  });

  it("never treats an arbitrary stored URL as a cleanup path", async () => {
    current = `/storage/avatars/${USER}/../../sensitive.png`;
    await publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_A });
    expect(await fs.readFile(previousPath)).toEqual(png);
  });

  it("allows overlapping successful uploads without sweeping the other's in-flight file", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    store.saveAvatar.mockImplementation(async (url) => {
      if (url === URL_A) {
        entered();
        await gate;
      }
      current = url;
    });
    const a = publishAvatar(USER, file(png), store, {
      storagePath: directory,
      createId: () => ID_A,
    });
    await waiting;
    await publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_B });
    expect(await fs.readFile(path.join(directory, `${USER}-${ID_A}.webp`))).toBeInstanceOf(Buffer);
    release();
    await a;
    expect(current).toBe(URL_A);
    expect(await names(directory)).toEqual([`${USER}-${ID_A}.webp`, `${USER}-${ID_B}.webp`]);
  });

  it("a failing overlapping upload cannot remove the winner's raster", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    store.saveAvatar.mockImplementation(async (url) => {
      if (url === URL_A) {
        entered();
        await gate;
        throw new Error("A fails");
      }
      current = url;
    });
    const a = publishAvatar(USER, file(png), store, {
      storagePath: directory,
      createId: () => ID_A,
    });
    const failed = expect(a).rejects.toThrow("A fails");
    await waiting;
    await publishAvatar(USER, file(png), store, { storagePath: directory, createId: () => ID_B });
    release();
    await failed;
    expect(current).toBe(URL_B);
    expect(await names(directory)).toEqual([`${USER}-${ID_B}.webp`]);
  });

  it("bounds a burst of real Sharp decodes to two active and four waiting", async () => {
    const tasks = Array.from({ length: 20 }, () => encodeAvatar(file(png)));
    const result = Promise.allSettled(tasks);
    expect(avatarDecodeBudget.counts).toEqual({ active: 2, waiting: 4 });
    const completed = await result;
    expect(completed.filter((row) => row.status === "fulfilled")).toHaveLength(6);
    const rejected = completed.filter((row) => row.status === "rejected");
    expect(rejected).toHaveLength(14);
    for (const row of rejected) expect(row.reason.getStatus()).toBe(503);
    expect(avatarDecodeBudget.counts).toEqual({ active: 0, waiting: 0 });
  });

  it("does not publish or update the DB when cancelled after real decoding", async () => {
    const controller = new AbortController();
    store.readCurrentAvatar.mockImplementation(async () => {
      controller.abort();
      return current;
    });
    await expect(
      publishAvatar(USER, file(png), store, { storagePath: directory, signal: controller.signal }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.saveAvatar).not.toHaveBeenCalled();
    expect(await names(directory)).toEqual([`${USER}.png`]);
  });
});
