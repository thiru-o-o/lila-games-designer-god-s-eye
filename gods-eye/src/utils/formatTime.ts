/**
 * formatMsToMMSS — convert an elapsed-millisecond value to a "MM:SS" string.
 *
 * Safe against NaN, Infinity, and negative values (returns "00:00").
 * Used everywhere timestamps need to be shown in match-relative time.
 */
export function formatMsToMMSS(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}



