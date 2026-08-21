/**
 * Shared utility functions for RoadSite Reports.
 * Extracted from SubmitReport.jsx and WorksActivitiesPage.jsx to eliminate duplication.
 */

/* ── Chainage helpers ─────────────────────────────────────────── */

/**
 * Parse a chainage string like "12+500" or "12500" into a numeric metre value.
 * Returns NaN for unparseable input.
 */
export function parseChainage(str) {
  if (!str) return NaN;
  const s = String(str).trim();
  if (s.includes('+')) {
    const [km, m] = s.split('+');
    return parseFloat(km) * 1000 + parseFloat(m || 0);
  }
  return parseFloat(s);
}

/**
 * Format a metre value back to "km+metres" chainage notation.
 * e.g. 12500 → "12+500"
 */
export function fmtChainage(metres) {
  if (metres == null || isNaN(metres)) return '';
  const km = Math.floor(metres / 1000);
  const m = Math.round(metres % 1000);
  return `${km}+${String(m).padStart(3, '0')}`;
}

/**
 * Find overlapping chainage ranges in a list of activities.
 * Each activity must have chainage_from and chainage_to fields (string or number).
 * Returns an array of { a, b } pairs where a and b are the overlapping activity objects.
 */
export function findOverlaps(activities) {
  const parsed = activities
    .map(a => ({
      ...a,
      _from: parseChainage(a.chainage_from),
      _to: parseChainage(a.chainage_to),
    }))
    .filter(a => !isNaN(a._from) && !isNaN(a._to));

  const overlaps = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      if (a._from < b._to && b._from < a._to) {
        overlaps.push({ a, b });
      }
    }
  }
  return overlaps;
}
