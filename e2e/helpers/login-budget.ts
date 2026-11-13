import fs from 'node:fs';
import path from 'node:path';

// The suite uses one worker and a real 5/minute login guard. Persist this small
// budget across global setup and workers; never change or bypass the backend limit.
const directory = path.resolve(__dirname, '../.auth');
const file = path.join(directory, 'login-attempts.json');
export async function waitForLoginSlot(): Promise<void> {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let timestamps: number[] = [];
  if (fs.existsSync(file)) {
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data) || data.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('[e2e] Invalid login pacing state; remove the stale .auth/login-attempts.json before restarting the disposable backend.');
    }
    timestamps = data;
  }
  const windowMs = 65_000; // Includes the short wait for a new TOTP window.
  const now = Date.now();
  timestamps = timestamps.filter((time) => time > now - windowMs);
  if (timestamps.length >= 5) {
    const delay = Math.max(0, timestamps[timestamps.length - 5]! + windowMs - now);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  const time = Date.now();
  timestamps = timestamps.filter((value) => value > time - windowMs);
  timestamps.push(time);
  fs.writeFileSync(file, JSON.stringify(timestamps), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
