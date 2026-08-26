import { normalizeTitle, deriveAlternateKeys } from "../shared/normalize.js";
import { getByNorm } from "./db.js";

function padTconst(tconst) {
  return String(tconst).padStart(7, "0");
}

function pickBest(candidates, year) {
  if (candidates.length === 1) return candidates[0];
  if (year) {
    const closeYear = candidates.filter(
      (c) => c.year != null && Math.abs(c.year - year) <= 1
    );
    if (closeYear.length) {
      return closeYear.reduce((a, b) => (b.votes > a.votes ? b : a));
    }
  }
  return candidates.reduce((a, b) => (b.votes > a.votes ? b : a));
}

export async function lookupRating({ title, year }) {
  const norm = normalizeTitle(title);
  let candidates = norm ? await getByNorm(norm) : [];

  if (!candidates.length) {
    for (const altKey of deriveAlternateKeys(title)) {
      candidates = await getByNorm(altKey);
      if (candidates.length) break;
    }
  }

  if (!candidates.length) {
    return { found: false };
  }

  const best = pickBest(candidates, year);
  return {
    found: true,
    rating: best.rating10 / 10,
    votes: best.votes,
    year: best.year,
    tconst: best.tconst,
    url: `https://www.imdb.com/title/tt${padTconst(best.tconst)}/`,
  };
}
