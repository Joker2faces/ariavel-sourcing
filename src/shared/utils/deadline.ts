// Deadline semantics: ISO date string (YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ).
// "Closing soon" = deadline is within the next 3 calendar days (inclusive of today).
// Calculations use the browser's local clock for comparison, treating date-only values
// as end-of-day (23:59:59) in local time to avoid premature overdue classification.

const CLOSING_SOON_DAYS = 3;

function toLocalEndOfDay(iso: string): Date {
  // If it's a date-only string, treat as end of that day in local time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
    return dt;
  }
  return new Date(iso);
}

export function isOverdue(deadline: string, now = new Date()): boolean {
  return toLocalEndOfDay(deadline) < now;
}

export function isClosingSoon(deadline: string, now = new Date()): boolean {
  const d = toLocalEndOfDay(deadline);
  const msInDay = 86_400_000;
  const diffMs = d.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= CLOSING_SOON_DAYS * msInDay;
}

export function daysUntilDeadline(deadline: string, now = new Date()): number {
  const d = toLocalEndOfDay(deadline);
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

export function formatDeadlineDisplay(iso: string): string {
  const d = toLocalEndOfDay(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}
