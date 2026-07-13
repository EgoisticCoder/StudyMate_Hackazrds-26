/** Week utilities — ISO weeks start Monday (India-aligned school week). */

export function startOfMondayWeek(d = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** YYYY-MM-DD for the Monday of this week */
export function weekKeyFromDate(d = new Date()): string {
  const mon = startOfMondayWeek(d);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, '0');
  const day = String(mon.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseWeekKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Human label e.g. "12–18 May 2026" */
export function formatWeekRangeLabel(weekStartKey: string): string {
  const start = parseWeekKey(weekStartKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('en-IN', opts)} – ${end.toLocaleDateString('en-IN', opts)}`;
}
