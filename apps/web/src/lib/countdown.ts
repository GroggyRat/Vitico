/** Time left as a short phrase: "2d 4h", "3h 12m", "12m", or "under a minute". */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "ended";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
