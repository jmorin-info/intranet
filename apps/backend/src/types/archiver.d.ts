/**
 * Minimal ambient declaration for `archiver` 5.x.
 *
 * Le paquet `@types/archiver` n'est pas installe dans ce projet. On ne declare
 * que les surfaces utilisees par `gdpr-export-packager.ts` (zip writer en
 * memoire avec `append` + `finalize`). Si plus de fonctionnalites archiver
 * sont utilisees ailleurs, prefere ajouter `pnpm add -D @types/archiver`.
 */
declare module "archiver" {
  import { Readable } from "stream";

  interface ArchiverOptions {
    zlib?: { level?: number };
    [key: string]: unknown;
  }

  interface AppendOptions {
    name: string;
    date?: Date;
    mode?: number;
    [key: string]: unknown;
  }

  interface Archiver extends Readable {
    append(
      source: Buffer | string | NodeJS.ReadableStream,
      data: AppendOptions,
    ): this;
    finalize(): Promise<void>;
    pipe<T extends NodeJS.WritableStream>(destination: T): T;
    on(event: "warning", listener: (err: NodeJS.ErrnoException) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "end" | "finish" | "close", listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  function archiver(format: "zip" | "tar", options?: ArchiverOptions): Archiver;

  namespace archiver {}

  export = archiver;
}
