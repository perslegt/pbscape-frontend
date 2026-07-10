/**
 * Formatteert een tijd in milliseconden naar een leesbaar "m:ss.SS" formaat.
 *
 * Voorbeelden:
 *   85000  ms -> "1:25.00"
 *   63200  ms -> "1:03.20"
 *   372000 ms -> "6:12.00"
 */
export function formatTime(timeMillis: number): string {
  if (!Number.isFinite(timeMillis) || timeMillis < 0) {
    return "0 ms";
  }

  const milliseconds = Math.floor(timeMillis);
  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }

  const totalTenths = Math.round(milliseconds / 100);
  const totalSeconds = Math.floor(totalTenths / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = totalTenths % 10;
  const secondsWithTenths = `${String(seconds).padStart(2, "0")}.${tenths}`;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondsWithTenths}`;
  }

  if (minutes > 0) {
    return `${String(minutes).padStart(2, "0")}:${secondsWithTenths}`;
  }

  return `${seconds}.${tenths}`;
}
