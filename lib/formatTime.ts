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
    return "0:00.00";
  }

  const totalSeconds = timeMillis / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  // Seconden altijd met 2 decimalen en voorloopnul (bv. "03.20"), zodat
  // de tijd netjes uitlijnt in een tabel.
  const secondsFormatted = seconds.toFixed(2).padStart(5, "0");

  return `${minutes}:${secondsFormatted}`;
}
