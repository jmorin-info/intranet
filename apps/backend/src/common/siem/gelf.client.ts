/**
 * GELF (Graylog Extended Log Format) UDP client — envoi best-effort vers Graylog.
 *
 * Opt-in via SIEM_ENABLED=true. No-op complet si désactivé (coût ~0).
 * Ne doit JAMAIS bloquer ni faire planter l'appelant : toute erreur réseau
 * est avalée et loguée au plus une fois par fenêtre (RATE_LIMIT_MS) pour
 * éviter le flood de logs si Graylog est injoignable.
 */
import * as dgram from "dgram";
import * as zlib from "zlib";
import { randomBytes } from "crypto";
import * as os from "os";

const GELF_CHUNK_MAGIC = Buffer.from([0x1e, 0x0f]);
const MAX_CHUNK_SIZE = 8154; // marge sous la MTU 8192 pour l'en-tête GELF chunké
const MAX_CHUNKS = 128;
const RATE_LIMIT_MS = 60_000;

export interface GelfEvent {
  shortMessage: string;
  fullMessage?: string;
  /** syslog level: 2=critical 3=error 4=warning 6=info 7=debug */
  level: 2 | 3 | 4 | 6 | 7;
  timestamp?: number; // epoch seconds (fraction ok)
  fields?: Record<string, string | number | boolean | null | undefined>;
}

let socket: dgram.Socket | null = null;
let lastErrorLogAt = 0;
const hostname = os.hostname();

function getSocket(): dgram.Socket {
  if (!socket) {
    socket = dgram.createSocket("udp4");
    // Ne doit jamais garder le process vivant à lui seul.
    socket.unref();
    socket.on("error", () => {
      /* géré par le callback de send(), on ignore ici */
    });
  }
  return socket;
}

function logSendFailure(err: Error): void {
  const now = Date.now();
  if (now - lastErrorLogAt < RATE_LIMIT_MS) return;
  lastErrorLogAt = now;
  // eslint-disable-next-line no-console
  console.warn(
    `[SIEM] Échec envoi GELF vers Graylog (silencieux, rate-limited 60s): ${err.message}`,
  );
}

export function isSiemConfigured(): boolean {
  return process.env.SIEM_ENABLED === "true" && !!process.env.SIEM_GELF_HOST;
}

/**
 * Envoi best-effort d'un événement GELF. Ne throw jamais, ne bloque jamais
 * l'appelant (fire-and-forget côté kernel UDP).
 */
export function sendSiemEvent(event: GelfEvent): void {
  if (!isSiemConfigured()) return;

  try {
    const host = process.env.SIEM_GELF_HOST as string;
    const port = parseInt(process.env.SIEM_GELF_PORT || "12201", 10);

    const payload: Record<string, unknown> = {
      version: "1.1",
      host: hostname,
      short_message: event.shortMessage.slice(0, 2000),
      timestamp: event.timestamp ?? Date.now() / 1000,
      level: event.level,
      _app: process.env.SIEM_APP_NAME || "omnitech-intranet-backend",
      _env: process.env.NODE_ENV || "development",
    };
    if (event.fullMessage) payload.full_message = event.fullMessage.slice(0, 8000);
    if (event.fields) {
      for (const [k, v] of Object.entries(event.fields)) {
        if (v === undefined || v === null) continue;
        // GELF: les champs custom doivent être préfixés par "_"
        const serialized = typeof v === "object" ? JSON.stringify(v) : v;
        // Plafonner les valeurs string : une metadata volumineuse ne doit pas
        // gonfler le paquet au point de déclencher un chunking UDP massif
        // (jusqu'à 128 paquets synchrones sur le chemin de la requête).
        payload[`_${k}`] = typeof serialized === "string" ? serialized.slice(0, 2000) : serialized;
      }
    }

    const json = Buffer.from(JSON.stringify(payload), "utf-8");
    const sock = getSocket();

    if (json.length <= MAX_CHUNK_SIZE) {
      sock.send(json, port, host, (err) => {
        if (err) logSendFailure(err);
      });
      return;
    }

    // Chunking GELF (payload > 8154 octets, rare mais possible avec metadata riche)
    const messageId = randomBytes(8);
    const totalChunks = Math.ceil(json.length / MAX_CHUNK_SIZE);
    if (totalChunks > MAX_CHUNKS) {
      logSendFailure(new Error(`payload trop volumineux (${totalChunks} chunks)`));
      return;
    }
    for (let i = 0; i < totalChunks; i++) {
      const slice = json.subarray(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
      const header = Buffer.concat([GELF_CHUNK_MAGIC, messageId, Buffer.from([i, totalChunks])]);
      const chunk = Buffer.concat([header, slice]);
      sock.send(chunk, port, host, (err) => {
        if (err) logSendFailure(err);
      });
    }
  } catch (err) {
    // Ne jamais laisser une erreur SIEM remonter à l'appelant.
    logSendFailure(err instanceof Error ? err : new Error(String(err)));
  }
}
