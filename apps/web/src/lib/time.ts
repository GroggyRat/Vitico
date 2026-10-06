export const BUSINESS_TZ = "Pacific/Fiji";

/** Minutes the zone is ahead of UTC at a given instant. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Parses "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (form inputs, which carry no zone)
 * as Fiji local time. With `endOfDay`, a date-only value means 23:59:59.999 that day.
 */
export function parseBusinessTime(value: string, opts: { endOfDay?: boolean } = {}): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dateOnly = h === undefined;
  const wall = Date.UTC(+y, +mo - 1, +d, dateOnly ? (opts.endOfDay ? 23 : 0) : +h, dateOnly ? (opts.endOfDay ? 59 : 0) : +mi, dateOnly && opts.endOfDay ? 59 : 0, dateOnly && opts.endOfDay ? 999 : 0);
  if (Number.isNaN(wall)) return null;
  // Two passes handle instants near a DST change.
  let t = wall - offsetMinutes(new Date(wall), BUSINESS_TZ) * 60_000;
  t = wall - offsetMinutes(new Date(t), BUSINESS_TZ) * 60_000;
  return new Date(t);
}

/** Formats an instant for a datetime-local input, in Fiji time. */
export function toBusinessInput(d: Date | null, dateOnly = false): string {
  if (!d) return "";
  const local = new Date(d.getTime() + offsetMinutes(d, BUSINESS_TZ) * 60_000);
  const iso = local.toISOString();
  return dateOnly ? iso.slice(0, 10) : iso.slice(0, 16);
}
