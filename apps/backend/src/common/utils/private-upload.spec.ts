import { NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { privateUploadPath } from "./private-upload";

describe("privateUploadPath", () => {
  let temp: string;
  let root: string;

  beforeEach(async () => {
    temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "private-upload-"));
    root = path.join(temp, "uploads");
    await fs.promises.mkdir(root);
    await fs.promises.writeFile(path.join(root, "attachment.pdf"), "document");
    await fs.promises.writeFile(path.join(temp, "private.env"), "test-only");
  });

  afterEach(async () => {
    await fs.promises.rm(temp, { recursive: true, force: true });
  });

  it("resolves a normal attachment inside its directory", async () => {
    await expect(privateUploadPath(root, "attachment.pdf")).resolves.toBe(path.join(root, "attachment.pdf"));
  });

  it.each(["../private.env", "..\\private.env", "/private.env", ".", "..", "bad\0.pdf"])(
    "rejects a path rather than a basename: %s",
    async (filename) => {
      await expect(privateUploadPath(root, filename)).rejects.toThrow(NotFoundException);
    },
  );

  it("rejects a symlink to a readable file outside the upload directory", async () => {
    await fs.promises.symlink(path.join(temp, "private.env"), path.join(root, "linked.pdf"));
    await expect(privateUploadPath(root, "linked.pdf")).rejects.toThrow(NotFoundException);
  });

  it("does not serve directories", async () => {
    await fs.promises.mkdir(path.join(root, "directory"));
    await expect(privateUploadPath(root, "directory")).rejects.toThrow(NotFoundException);
  });
});
