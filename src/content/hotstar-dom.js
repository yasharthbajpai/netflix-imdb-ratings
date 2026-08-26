/*
 * Hotstar/JioHotstar-specific DOM selectors live ONLY in this file.
 *
 * Unlike Netflix, Hotstar has no reliable hover-preview card to hang a rating on,
 * so findHoverCard returns null here and the on-tile badge is the surface that matters. Do not
 * "helpfully" add a findHoverCard selector back: a loose one previously matched real tiles in the
 * Continue Watching row, which made that row the only one that ever showed a rating.
 *
 * Verified against a live hotstar.com/in/movies page: almost no tile is a link. Navigation is
 * JS-driven, and a whole browse page has only ~44 anchors — the 8 in Continue Watching plus nav and
 * footer. Tiles are `<div data-testid="hs-image">` wrappers instead, each holding an `<img>` whose
 * alt is the full title ("Transformers: Dark of the Moon"), so that alt is the primary title source
 * and the wrapper is the badge host.
 *
 * Set localStorage.NRX_DEBUG = "1" and reload to see extraction-miss warnings.
 */
var NRX = globalThis.NRX || (globalThis.NRX = {});

(function () {
  // Only /movies/ and /shows/ are indexed upstream (the IMDb build keeps movie, tvSeries,
  // tvMiniSeries, tvMovie and tvSpecial), so /clips/ and /sports/ links are deliberately not
  // scanned — every one of them would be a guaranteed-miss lookup.
  const ID_PATTERN = /\/(?:movies|shows)\/[^/?#]+\/(\d{4,})/;
  const SLUG_PATTERN = /\/(?:movies|shows)\/([^/?#]+)\/\d{4,}/;
  const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;

  // The image wrapper Hotstar renders for every tile. Verified against a live page: it already
  // carries `position: relative` inline, so it makes a natural host for an absolute badge.
  const IMAGE_TILE_SELECTOR = '[data-testid="hs-image"]';
  const ANCHOR_TILE_SELECTOR = 'a[href*="/movies/"], a[href*="/shows/"]';

  // Same wrapper is used for brand logos, the hero strip thumbnails and avatars. Content posters
  // measure ~214x290 and Continue Watching thumbnails ~295x171, while the decorative ones are well
  // under 100px on at least one axis. A tile that hasn't been laid out yet measures 0 and is kept,
  // so lazily-rendered rows still get observed.
  const MIN_TILE_PX = 100;

  function hrefOf(el) {
    return el?.getAttribute('href') || '';
  }

  function cleanText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  const GENERIC = /^(poster|thumbnail|cover|image|logo|banner|artwork|title art)$/i;
  const isGeneric = (s) => !s || GENERIC.test(s);

  function looksLikeContentTile(el) {
    const alt = cleanText(el.querySelector('img[alt]')?.getAttribute('alt'));
    if (isGeneric(alt) || alt.length < 2) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height && (rect.width < MIN_TILE_PX || rect.height < MIN_TILE_PX)) {
      return false;
    }
    return true;
  }

  function findTiles(root) {
    root = root || document;

    // Most Hotstar tiles are NOT links — navigation is JS-driven, so the image wrapper is the only
    // thing to hang a badge on. On a typical browse page there are ~44 anchors in total but many
    // dozens of tiles, which is why an anchor-only scan found nothing outside Continue Watching.
    const tiles = Array.from(root.querySelectorAll(IMAGE_TILE_SELECTOR)).filter(
      looksLikeContentTile
    );

    // Continue Watching genuinely does use anchors. Keep them as a fallback for any row where the
    // image wrapper is missing, but skip an anchor that already contains a tile we're badging so
    // the title doesn't get two badges.
    const anchors = Array.from(root.querySelectorAll(ANCHOR_TILE_SELECTOR)).filter(
      (a) => ID_PATTERN.test(hrefOf(a)) && !a.querySelector(IMAGE_TILE_SELECTOR)
    );

    return tiles.concat(anchors);
  }

  // Hotstar has no usable hover-preview surface. See the file header.
  function findHoverCard() {
    return null;
  }

  function anchorFor(el) {
    if (el.matches?.('a[href]')) return el;
    return el.querySelector?.('a[href]') || el.closest?.('a[href]') || null;
  }

  function extractId(el) {
    const match = hrefOf(anchorFor(el)).match(ID_PATTERN);
    return match ? match[1] : null;
  }

  function extractYear(el) {
    const metaEl = el.querySelector?.('[data-testid*="year"], [data-testid*="meta"]');
    const candidates = [metaEl?.textContent, el.textContent];
    for (const text of candidates) {
      if (!text) continue;
      const match = text.match(YEAR_PATTERN);
      if (match) return parseInt(match[0], 10);
    }
    return null;
  }

  // /in/movies/mission-impossible-fallout/1260012345 -> "mission impossible fallout".
  // Slugs are lowercase, which is fine: normalizeTitle() lowercases everything anyway.
  function titleFromSlug(el) {
    const match = hrefOf(anchorFor(el)).match(SLUG_PATTERN);
    if (!match) return '';
    let slug;
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      slug = match[1];
    }
    slug = cleanText(slug.replace(/[-_]+/g, ' '));
    // A purely numeric slug is an id, not a name.
    if (!slug || slug.length < 2 || /^\d+$/.test(slug)) return '';
    return slug;
  }

  function extractTitle(el) {
    if (!(el instanceof Element)) return { title: null, year: null, id: null };

    const anchor = anchorFor(el);

    const candidates = [
      cleanText(el.querySelector?.('img[alt]')?.getAttribute('alt')),
      cleanText(anchor?.getAttribute('aria-label')),
      cleanText(el.querySelector?.('[data-testid*="title"]')?.textContent),
      cleanText(anchor?.getAttribute('title')),
      // Last resort, but the most reliable one for portrait posters that carry no text at all.
      titleFromSlug(el),
    ];

    const title = candidates.find((c) => !isGeneric(c)) || null;

    return {
      title,
      year: extractYear(el),
      id: extractId(el),
    };
  }

  function tileForCard(cardEl) {
    const id = extractId(cardEl);
    if (!id) return null;
    return findTiles(document).find((tile) => extractId(tile) === id) || null;
  }

  NRX.dom = { findTiles, findHoverCard, extractTitle, tileForCard };
})();
