/**
 * Parser iCal minimaliste (RFC 5545) pour l'import depuis fichiers .ics.
 *
 * Couvre les besoins de l'intranet (Wave B item 33) :
 *   - Lecture VEVENT (DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION, UID,
 *     RRULE, ORGANIZER, X-WR-CALNAME)
 *   - Décodage des "lines folded" (RFC 5545 §3.1) : continuations préfixées
 *     par espace ou tab
 *   - Décodage TEXT escape (\\n, \\,, \\;, \\\\) §3.3.11
 *   - Support DTSTART;VALUE=DATE (allDay) et DTSTART;TZID=... (datetime)
 *   - Conversion UTC quand `Z` ou TZID=UTC, sinon Europe/Paris assumée
 *
 * Limitations : pas de gestion fine des VTIMEZONE custom (au-delà de
 * Europe/Paris/UTC), pas d'expansion RRULE (on stocke la string brute).
 */

export interface ParsedICalEvent {
  uid?: string;
  summary?: string;
  description?: string | null;
  location?: string | null;
  startDate: Date;
  endDate?: Date | null;
  allDay: boolean;
  recurrence?: string | null;
  organizer?: string | null;
}

export interface ParsedICalCalendar {
  calendarName?: string;
  prodId?: string;
  events: ParsedICalEvent[];
}

/** Unfold les lignes (RFC 5545 §3.1). Retourne un tableau de lignes "logiques". */
function unfoldLines(input: string): string[] {
  // Normalise les fins de ligne en \n
  const norm = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = norm.split("\n");
  const out: string[] = [];
  for (const line of rawLines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Continuation : enlève l'espace/tab et concatène à la précédente
      if (out.length === 0) continue;
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Sépare une ligne `KEY[;PARAMS]:VALUE`. */
function splitProperty(
  line: string,
): { key: string; params: Record<string, string>; value: string } | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx < 0) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const semiIdx = left.indexOf(";");
  let key = left;
  const params: Record<string, string> = {};
  if (semiIdx >= 0) {
    key = left.slice(0, semiIdx);
    const rest = left.slice(semiIdx + 1);
    for (const p of rest.split(";")) {
      const eqIdx = p.indexOf("=");
      if (eqIdx < 0) continue;
      params[p.slice(0, eqIdx).toUpperCase()] = p.slice(eqIdx + 1);
    }
  }
  return { key: key.toUpperCase(), params, value };
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Parse une valeur DTSTART / DTEND en Date.
 * Retourne {date, allDay}. Lève si format inconnu.
 */
function parseDateValue(
  raw: string,
  params: Record<string, string>,
): { date: Date; allDay: boolean } {
  const isDateOnly = params["VALUE"] === "DATE" || /^\d{8}$/.test(raw);
  if (isDateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (!m) throw new Error(`Invalid DATE value: ${raw}`);
    const [, y, mo, d] = m;
    return {
      date: new Date(Date.UTC(parseInt(y!, 10), parseInt(mo!, 10) - 1, parseInt(d!, 10))),
      allDay: true,
    };
  }
  // DATE-TIME : YYYYMMDDTHHMMSS[Z]
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(raw);
  if (!m) throw new Error(`Invalid DATE-TIME value: ${raw}`);
  const [, y, mo, d, hh, mm, ss, z] = m;
  const isUtc =
    z === "Z" ||
    (params["TZID"] || "").toUpperCase() === "UTC" ||
    !params["TZID"];
  const yi = parseInt(y!, 10);
  const moi = parseInt(mo!, 10) - 1;
  const di = parseInt(d!, 10);
  const hhi = parseInt(hh!, 10);
  const mmi = parseInt(mm!, 10);
  const ssi = parseInt(ss!, 10);
  if (isUtc) {
    return { date: new Date(Date.UTC(yi, moi, di, hhi, mmi, ssi)), allDay: false };
  }
  // TZID local — on assume Europe/Paris (UTC+1/+2 selon DST). Pour rester
  // compatible Outlook/Google, on convertit naïvement en UTC en supposant
  // que le user émetteur est en Europe/Paris. Si TZID = autre, idem.
  // NB : l'intranet est mono-tz côté affichage (Europe/Paris) ; cette
  // approximation est acceptable. Cf. docs/integrations/CALENDAR_SYNC.md.
  const localDate = new Date(yi, moi, di, hhi, mmi, ssi);
  return { date: localDate, allDay: false };
}

/**
 * Parse un fichier iCal complet. Retourne tous les VEVENT trouvés.
 * Tolérant aux erreurs : un event mal formé est ignoré, les autres passent.
 */
export function parseICal(input: string): ParsedICalCalendar {
  if (!input || typeof input !== "string") {
    throw new Error("parseICal: empty input");
  }
  const lines = unfoldLines(input);
  const events: ParsedICalEvent[] = [];
  let calendarName: string | undefined;
  let prodId: string | undefined;
  let inEvent = false;
  let current: Partial<ParsedICalEvent> & { startRaw?: string } = {};

  for (const line of lines) {
    if (!line) continue;
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      if (current.startDate) {
        events.push({
          uid: current.uid,
          summary: current.summary || "(Sans titre)",
          description: current.description ?? null,
          location: current.location ?? null,
          startDate: current.startDate as Date,
          endDate: current.endDate ?? null,
          allDay: current.allDay ?? false,
          recurrence: current.recurrence ?? null,
          organizer: current.organizer ?? null,
        });
      }
      continue;
    }
    if (line === "BEGIN:VCALENDAR" || line === "END:VCALENDAR") continue;
    if (!inEvent) {
      // Métadonnées calendar
      const prop = splitProperty(line);
      if (!prop) continue;
      if (prop.key === "X-WR-CALNAME") {
        calendarName = unescapeText(prop.value);
      } else if (prop.key === "PRODID") {
        prodId = prop.value;
      }
      continue;
    }
    const prop = splitProperty(line);
    if (!prop) continue;

    try {
      switch (prop.key) {
        case "UID":
          current.uid = prop.value.trim();
          break;
        case "SUMMARY":
          current.summary = unescapeText(prop.value).slice(0, 200);
          break;
        case "DESCRIPTION":
          current.description = unescapeText(prop.value).slice(0, 2000);
          break;
        case "LOCATION":
          current.location = unescapeText(prop.value).slice(0, 200);
          break;
        case "DTSTART": {
          const { date, allDay } = parseDateValue(prop.value, prop.params);
          current.startDate = date;
          current.allDay = allDay;
          break;
        }
        case "DTEND": {
          const { date } = parseDateValue(prop.value, prop.params);
          current.endDate = date;
          break;
        }
        case "RRULE":
          current.recurrence = prop.value.slice(0, 500);
          break;
        case "ORGANIZER": {
          // ex: ORGANIZER;CN=John:mailto:john@example.com
          const m = /mailto:([^,;\s]+)/i.exec(prop.value);
          if (m && m[1]) current.organizer = m[1].toLowerCase();
          break;
        }
      }
    } catch {
      // Silencieux : on ignore les events mal formés
    }
  }

  return { calendarName, prodId, events };
}
