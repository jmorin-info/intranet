/**
 * Generation iCal (RFC 5545) — minimaliste, sans dependance externe.
 *
 * Couvre VEVENT (allDay + horaires) + VTIMEZONE-less UTC pour rester compatible
 * Outlook / Google / Apple Calendar. Les chaines sont escapees selon RFC 5545
 * §3.3.11 (TEXT) et "folded" a 75 octets toutes les lignes.
 */

export interface ICalEvent {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  startDate: Date;
  endDate?: Date | null;
  allDay?: boolean;
  url?: string;
  category?: string;
  // Couleur hex ("#rrggbb") — propage en X-APPLE-CALENDAR-COLOR (Apple) et
  // COLOR (RFC 7986) pour les clients qui le supportent.
  color?: string | null;
}

/** Echappe les caracteres speciaux dans un champ TEXT. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Format une Date en YYYYMMDDTHHMMSSZ (UTC). */
function formatDateTimeUtc(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

/** Format une Date en YYYYMMDD (allDay). */
function formatDateOnly(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Plie les lignes a 75 octets (UTF-8) en prefixant les continuations d'un espace.
 * RFC 5545 §3.1.
 */
function foldLine(line: string): string {
  const MAX = 73; // 75 octets - 1 CRLF + marge
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let buf = '';
  let bufBytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    if (bufBytes + chBytes > MAX) {
      out.push(buf);
      buf = ' ' + ch;
      bufBytes = 1 + chBytes;
    } else {
      buf += ch;
      bufBytes += chBytes;
    }
  }
  if (buf) out.push(buf);
  return out.join('\r\n');
}

/**
 * Construit un fichier iCal a partir d'une liste d'evenements.
 * Les CRLF sont obligatoires (RFC 5545 §3.1).
 */
export function buildICal(opts: {
  prodId: string;
  calendarName: string;
  events: ICalEvent[];
}): string {
  const lines: string[] = [];
  const push = (l: string) => lines.push(foldLine(l));

  push('BEGIN:VCALENDAR');
  push('VERSION:2.0');
  push(`PRODID:${escapeText(opts.prodId)}`);
  push('CALSCALE:GREGORIAN');
  push('METHOD:PUBLISH');
  push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);

  const dtstamp = formatDateTimeUtc(new Date());

  for (const ev of opts.events) {
    push('BEGIN:VEVENT');
    push(`UID:${ev.uid}`);
    push(`DTSTAMP:${dtstamp}`);
    if (ev.allDay) {
      push(`DTSTART;VALUE=DATE:${formatDateOnly(ev.startDate)}`);
      if (ev.endDate) {
        // RFC 5545 : DTEND exclusif → ajoute 1 jour si meme date
        const end = new Date(ev.endDate);
        if (end.getTime() <= ev.startDate.getTime()) {
          end.setUTCDate(end.getUTCDate() + 1);
        }
        push(`DTEND;VALUE=DATE:${formatDateOnly(end)}`);
      } else {
        const end = new Date(ev.startDate);
        end.setUTCDate(end.getUTCDate() + 1);
        push(`DTEND;VALUE=DATE:${formatDateOnly(end)}`);
      }
    } else {
      push(`DTSTART:${formatDateTimeUtc(ev.startDate)}`);
      if (ev.endDate) push(`DTEND:${formatDateTimeUtc(ev.endDate)}`);
    }
    push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.url) push(`URL:${escapeText(ev.url)}`);
    if (ev.category) push(`CATEGORIES:${escapeText(ev.category)}`);
    if (ev.color) {
      // Apple Calendar respecte X-APPLE-CALENDAR-COLOR ; le standard RFC 7986
      // definit COLOR mais peu de clients l'implementent. On envoie les deux.
      push(`COLOR:${escapeText(ev.color)}`);
      push(`X-APPLE-CALENDAR-COLOR:${escapeText(ev.color)}`);
    }
    push('END:VEVENT');
  }

  push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
