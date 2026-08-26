const NON_WORD = /[^\p{L}\p{N} ]/gu;
const WHITESPACE = /\s+/g;

export function normalizeTitle(raw) {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(NON_WORD, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

const TRAILING_SUBTITLE = /\s*[:\-–]\s*[^:\-–]+$/;
const TRAILING_YEAR = /\s*\(\d{4}\)$/;
const TRAILING_SEASON_PART = /\s*[:\-–]\s*(season|part|chapter)\s+\w+$/i;

export function deriveAlternateKeys(rawTitle) {
  const keys = [];
  const withoutYear = rawTitle.replace(TRAILING_YEAR, "");
  if (withoutYear !== rawTitle) keys.push(normalizeTitle(withoutYear));

  const withoutSeasonPart = rawTitle.replace(TRAILING_SEASON_PART, "");
  if (withoutSeasonPart !== rawTitle) keys.push(normalizeTitle(withoutSeasonPart));

  const withoutSubtitle = rawTitle.replace(TRAILING_SUBTITLE, "");
  if (withoutSubtitle !== rawTitle) keys.push(normalizeTitle(withoutSubtitle));

  return keys.filter((k, i) => k && keys.indexOf(k) === i);
}
