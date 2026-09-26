// IronHealth · a prova como evento de calendário.
//
// Uma única descrição do evento (título, dia, hora, duração, local, notas)
// para os três destinos do botão "Adicionar ao calendário" do hub da prova:
// o link do Google, o do Outlook (src/utils/calendarLinks.js) e o .ics
// servido pela Edge Function race-calendar (para o Apple Calendar e o resto).
// Vive aqui, e não em src/utils/, para o cliente e a função não divergirem.
//
// A hora é sempre "flutuante": a hora de partida que o atleta escreveu é a
// hora do relógio no sítio da prova, não um instante em UTC — por isso o .ics
// não leva fuso (DTSTART:20261011T090000, sem Z) e o calendário mostra 09:00
// seja qual for o fuso do telemóvel.

export interface RaceForCalendar {
  id?: string | null;
  name?: string | null;
  date?: string | null; // 'YYYY-MM-DD'
  start_time?: string | null; // 'HH:MM' ou 'HH:MM:SS'
  location?: string | null;
  race_type?: string | null;
  distance_km?: number | string | null;
  elevation_gain_m?: number | string | null;
  target_time_seconds?: number | string | null;
  target_time?: string | null;
}

export interface RaceCalendarEvent {
  title: string;
  date: string; // 'YYYY-MM-DD'
  // null → evento de dia inteiro (prova sem hora de partida)
  startTime: string | null; // 'HH:MM'
  durationMinutes: number;
  location: string;
  description: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function kmLabel(km: number): string {
  if (Math.abs(km - 21.0975) < 0.01) return "Meia Maratona";
  if (Math.abs(km - 42.195) < 0.01) return "Maratona";
  return `${String(Math.round(km * 100) / 100).replace(".", ",")} km`;
}

/** 'H:MM:SS' ou 'MM:SS' → segundos; 0 se não for um tempo. */
function targetTextSeconds(text: string | null | undefined): number {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)$/.exec((text || "").trim());
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Duração estimada da prova em minutos, só para o bloco no calendário:
 *  o objetivo do atleta quando existe; senão um ritmo folgado (6 min/km em
 *  estrada, 9 em trail, com 100 m D+ a contar como 1 km a mais) — é melhor
 *  o bloco sobrar do que acabar antes da meta. Arredonda aos 15 min acima.
 *
 *  O objetivo vem de target_time_seconds (a linha da BD, na Edge Function)
 *  ou do texto target_time (o rascunho do RunAgenda, que só converte para
 *  segundos ao gravar) — sem o segundo, os links do cliente e o .ics da
 *  função davam durações diferentes para a mesma prova. */
export function raceDurationMinutes(race: RaceForCalendar): number {
  const target = num(race.target_time_seconds) || targetTextSeconds(race.target_time);
  let minutes: number;
  if (target > 0) {
    minutes = target / 60;
  } else {
    const km = num(race.distance_km) || 10;
    const trail = race.race_type === "trail";
    const equivKm = km + (trail ? num(race.elevation_gain_m) / 100 : 0);
    minutes = equivKm * (trail ? 9 : 6);
  }
  return Math.max(30, Math.ceil(minutes / 15) * 15);
}

export function raceCalendarEvent(race: RaceForCalendar): RaceCalendarEvent | null {
  const date = (race.date || "").slice(0, 10);
  if (!DATE_RE.test(date)) return null;

  const t = TIME_RE.exec((race.start_time || "").trim());
  const startTime = t && Number(t[1]) < 24 && Number(t[2]) < 60
    ? `${t[1].padStart(2, "0")}:${t[2]}`
    : null;

  const km = num(race.distance_km);
  const terrain = race.race_type === "trail" ? "trail" : "estrada";
  const parts = [km > 0 ? `${kmLabel(km)} em ${terrain}` : `Prova de ${terrain}`];
  if (race.target_time) parts.push(`objetivo ${race.target_time}`);

  return {
    title: (race.name || "").trim() || "Prova",
    date,
    startTime,
    durationMinutes: raceDurationMinutes(race),
    location: (race.location || "").trim(),
    description: `${parts.join(" · ")}. Adicionado a partir do IronHealth.`,
  };
}

// ─── Datas no formato básico do iCalendar ─────────────────────────────────

/** 'YYYY-MM-DD' + n dias → 'YYYYMMDD' (aritmética de calendário, sem fuso). */
export function basicDate(date: string, plusDays = 0): string {
  const [, y, m, d] = DATE_RE.exec(date)!;
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + plusDays));
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Início e fim do evento com hora, em hora de relógio 'YYYYMMDDTHHMMSS'
 *  (sem Z). O fim pode passar da meia-noite — um ultra que começa às 22:00. */
export function basicDateTimeRange(ev: RaceCalendarEvent): { start: string; end: string } | null {
  if (!ev.startTime) return null;
  const [, y, m, d] = DATE_RE.exec(ev.date)!;
  const [hh, mm] = ev.startTime.split(":").map(Number);
  const start = Date.UTC(Number(y), Number(m) - 1, Number(d), hh, mm);
  const end = start + ev.durationMinutes * 60_000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, "");
  return { start: fmt(start), end: fmt(end) };
}

// ─── .ics (RFC 5545) ──────────────────────────────────────────────────────

/** Escapa um valor TEXT: barra, ponto e vírgula, vírgula e mudança de linha
 *  (incluindo um \r sozinho, de texto colado); outros caracteres de controlo
 *  saem — partiam a linha do .ics. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/** Dobra uma linha em pedaços de ≤75 octetos (RFC 5545 §3.1), sem partir um
 *  carácter UTF-8 a meio — "Meia Maratona de São João" tem acentos. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // as continuações começam com espaço
    if (bytes + len > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function raceIcs(
  ev: RaceCalendarEvent,
  opts: { uid: string; now?: Date },
): string {
  const stamp = (opts.now || new Date()).toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  const range = basicDateTimeRange(ev);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IronHealth//Agenda de provas//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${stamp}`,
    ...(range
      ? [`DTSTART:${range.start}`, `DTEND:${range.end}`]
      : [`DTSTART;VALUE=DATE:${basicDate(ev.date)}`, `DTEND;VALUE=DATE:${basicDate(ev.date, 1)}`]),
    `SUMMARY:${icsEscape(ev.title)}`,
    ...(ev.location ? [`LOCATION:${icsEscape(ev.location)}`] : []),
    `DESCRIPTION:${icsEscape(ev.description)}`,
    // Uma prova ocupa o dia — no calendário não deve aparecer como livre.
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/** Nome de ficheiro só com ASCII seguro: "meia-maratona-de-sao-joao.ics". */
export function icsFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "prova"}.ics`;
}
