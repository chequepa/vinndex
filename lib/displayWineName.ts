/**
 * Pretty-print a wine name. Many scrapers return product names in
 * ALL CAPS (e.g., "DV CATENA MALBEC", "EL ENEMIGO MALBEC") which
 * looks shouty in the UI. Detect and title-case those, but leave
 * already-mixed-case names alone (preserves intentional casing like
 * "DV Catena Adrianna Tupungato").
 *
 * In its own module (no snapshot.json dependency) so client components
 * can import it without bundling the whole catalog.
 */

const TITLE_CASE_LOWER_WORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "con",
  "sin",
  "en",
  "por",
  "a",
  "al",
  "lo",
]);

const TITLE_CASE_UPPER_WORDS = new Set([
  "dv",
  "dvc",
  "vsop",
  "xo",
  "ipa",
  "doc",
  "doca",
  "do",
  "igp",
  "ii",
  "iii",
  "iv",
  "vi",
  "vii",
]);

export function displayWineName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = String(name).trim();
  if (!trimmed) return "";
  // Mostly-uppercase = shouty scraper output. Title-case it.
  // Threshold: ≥ 70% of letters uppercase (allows initialisms in
  // mixed-case names to pass through unchanged).
  const letters = trimmed.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
  if (letters.length === 0) return trimmed;
  const upperCount = (trimmed.match(/[A-ZÁÉÍÓÚÜÑ]/g) ?? []).length;
  if (upperCount / letters.length < 0.7) return trimmed;
  // Title-case rebuild
  return trimmed
    .toLowerCase()
    .split(/(\s+|[-—·.])/)
    .map((part, i) => {
      if (!part || /^\s+$/.test(part) || /^[-—·.]$/.test(part)) return part;
      const lower = part.toLowerCase();
      if (TITLE_CASE_UPPER_WORDS.has(lower)) return lower.toUpperCase();
      // Don't lowercase the first word ever
      if (i > 0 && TITLE_CASE_LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}
