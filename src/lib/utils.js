/**
 * Shared utility functions for RoadSite Reports.
 * Extracted from SubmitReport.jsx and WorksActivitiesPage.jsx to eliminate duplication.
 */

/* ── Chainage helpers ─────────────────────────────────────────── */

/**
 * Parse a chainage string into a Km value (decimal).
 * Accepts: "5+200" → 5.2 | "Km 5+200" → 5.2 | "5200" (metres) → 5.2 | "5.2" (Km) → 5.2
 * Returns null for unparseable input.
 */
export function parseChainage(input) {
  if (input == null || input === '') return null;
  const str = String(input).trim().replace(/km/i, '').trim();
  if (str.includes('+')) {
    const [kmPart, mPart] = str.split('+');
    const km = parseFloat(kmPart.replace(/[^0-9.]/g, '')) || 0;
    const m = parseFloat(mPart.replace(/[^0-9.]/g, '')) || 0;
    return km + m / 1000;
  }
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return null;
  // Plain numbers >= 200 are almost certainly metres (roads rarely exceed 200 Km chainage)
  return num >= 200 ? num / 1000 : num;
}

/**
 * Format a Km value back to chainage notation.
 * e.g. 5.2 → "5+200"
 */
export function fmtChainage(km) {
  if (km == null) return '\u2014';
  const k = Math.floor(km);
  const m = Math.round((km - k) * 1000);
  return `${k}+${String(m).padStart(3, '0')}`;
}
