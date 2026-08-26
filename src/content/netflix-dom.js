/*
 * Netflix-specific DOM selectors live ONLY in this file. Netflix rotates class names often;
 * these selectors favor stable-ish signals (href patterns, data-uia substrings, aria-label,
 * img alt) over exact class names, with multiple fallbacks per extraction.
 *
 * IMPORTANT: written without a live Netflix session to verify against. Before relying on this,
 * open netflix.com/browse, hover a tile, inspect the DOM, and confirm/adjust the selectors below
 * (set localStorage.NRX_DEBUG = "1" and reload to see extraction-miss warnings in the console).
 */
var NRX = globalThis.NRX || (globalThis.NRX = {});

(function () {
  const ID_PATTERN = /(?:\?jbv=|\/watch\/)(\d+)/;
  const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

  function findTiles(root) {
    root = root || document;
    return Array.from(root.querySelectorAll('a[href*="?jbv="], a[href*="/watch/"]'));
  }

  function findHoverCard(node) {
    if (!(node instanceof Element)) return null;
    const selector =
      '[data-uia*="preview-modal"], [data-uia*="hover-modal"], .previewModal--container, .bob-card, [data-uia="video-preview-modal"]';
    if (node.matches?.(selector)) return node;
    return node.querySelector?.(selector) || null;
  }

  function extractNetflixId(el) {
    const anchor = el.matches?.('a[href]') ? el : el.querySelector?.('a[href]');
    const href = anchor?.getAttribute('href') || '';
    const match = href.match(ID_PATTERN);
    return match ? match[1] : null;
  }

  function extractYear(el) {
    const metaEl = el.querySelector?.('[data-uia*="year"], [data-uia*="metadata"]');
    const candidates = [metaEl?.textContent, el.textContent];
    for (const text of candidates) {
      if (!text) continue;
      const match = text.match(YEAR_PATTERN);
      if (match) return parseInt(match[0], 10);
    }
    return null;
  }

  function cleanText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function extractTitle(el) {
    if (!(el instanceof Element)) return { title: null, year: null, netflixId: null };

    const img = el.querySelector?.('img[alt]');
    const imgAlt = cleanText(img?.getAttribute('alt'));

    const anchor = el.matches?.('a[href]') ? el : el.querySelector?.('a[aria-label], a[href]');
    const ariaLabel = cleanText(anchor?.getAttribute('aria-label'));

    const titleNode = el.querySelector?.('[data-uia*="title"]');
    const titleNodeText = cleanText(titleNode?.textContent);

    const isGeneric = (s) => !s || /^(boxart|poster|title art|logo)$/i.test(s);

    let title = null;
    if (!isGeneric(imgAlt)) title = imgAlt;
    else if (!isGeneric(ariaLabel)) title = ariaLabel;
    else if (!isGeneric(titleNodeText)) title = titleNodeText;

    return {
      title: title || null,
      year: extractYear(el),
      netflixId: extractNetflixId(el),
    };
  }

  function tileForCard(cardEl) {
    const id = extractNetflixId(cardEl);
    if (!id) return null;
    return findTiles(document).find((tile) => extractNetflixId(tile) === id) || null;
  }

  NRX.dom = { findTiles, findHoverCard, extractTitle, tileForCard };
})();
