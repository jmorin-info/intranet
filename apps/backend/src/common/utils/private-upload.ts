import { NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

/** Resolve an existing upload without permitting traversal or escaping symlinks. */
export async function privateUploadPath(directory: string, filename: string): Promise<string> {
  if (!filename || filename === "." || filename === ".." || /[/\\\0]/.test(filename)) {
    throw new NotFoundException("File not found");
  }

  try {
    const [root, file] = await Promise.all([
      fs.promises.realpath(directory),
      fs.promises.realpath(path.join(directory, filename)),
    ]);
    const relative = path.relative(root, file);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new NotFoundException("File not found");
    }
    if (!(await fs.promises.stat(file)).isFile()) {
      throw new NotFoundException("File not found");
    }
    return file;
  } catch {
    throw new NotFoundException("File not found");
  }
}
