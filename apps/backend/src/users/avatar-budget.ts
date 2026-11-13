import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";

export const AVATAR_ABORT_SIGNAL = Symbol("avatar-upload-abort");
export const AVATAR_REQUEST_LIMIT = 6;

export function avatarAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BadRequestException("Envoi de l’avatar interrompu");
}

function saturated(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    "Trop d’images en cours de traitement. Réessayez dans quelques instants.",
  );
}

interface WaitingJob {
  resolve(release: () => void): void;
  reject(error: Error): void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/** Per process: at most two native decoders and four queued input buffers. */
export class AvatarDecodeBudget {
  private active = 0;
  private readonly waiting: WaitingJob[] = [];

  constructor(
    private readonly maxActive = 2,
    private readonly maxWaiting = 4,
  ) {}

  get counts(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }

  private release(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.waiting.shift();
      if (next) {
        if (next.onAbort) next.signal?.removeEventListener("abort", next.onAbort);
        this.active++;
        next.resolve(this.release());
      }
    };
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    avatarAborted(signal);
    if (this.active < this.maxActive) {
      this.active++;
      return Promise.resolve(this.release());
    }
    if (this.waiting.length >= this.maxWaiting) throw saturated();
    return new Promise((resolve, reject) => {
      const job: WaitingJob = { resolve, reject, signal };
      if (signal) {
        job.onAbort = () => {
          const index = this.waiting.indexOf(job);
          if (index < 0) return;
          this.waiting.splice(index, 1);
          reject(new BadRequestException("Envoi de l’avatar interrompu"));
        };
        signal.addEventListener("abort", job.onAbort, { once: true });
      }
      this.waiting.push(job);
    });
  }

  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      avatarAborted(signal);
      const result = await work();
      avatarAborted(signal);
      return result;
    } finally {
      // An aborted active job keeps its permit until native work actually ends.
      release();
    }
  }
}

export const avatarDecodeBudget = new AvatarDecodeBudget();

export class AvatarRequestBudget {
  private active = 0;
  constructor(private readonly maximum = AVATAR_REQUEST_LIMIT) {}
  acquire(): () => void {
    if (this.active >= this.maximum) throw saturated();
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }
}

export const avatarRequestBudget = new AvatarRequestBudget();
