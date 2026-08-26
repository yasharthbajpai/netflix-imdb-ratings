var NRX = globalThis.NRX || (globalThis.NRX = {});

(function () {
  function tierFor(rating) {
    if (rating == null) return "unknown";
    if (rating >= 7.5) return "good";
    if (rating >= 6.0) return "mid";
    return "low";
  }

  function renderBadge(cardEl, result, settings) {
    if (!cardEl || cardEl.querySelector(".nrx-badge")) return;

    const badge = document.createElement("a");
    badge.className = "nrx-badge";
    badge.target = "_blank";
    badge.rel = "noopener";

    if (result?.found) {
      const tier = settings.colorCode ? tierFor(result.rating) : "neutral";
      badge.classList.add(`nrx-tier-${tier}`);
      badge.href = result.url;
      const votesText = result.votes >= 1000 ? `${Math.round(result.votes / 1000)}k` : String(result.votes);
      badge.innerHTML = `★ ${result.rating.toFixed(1)} <small>· ${votesText}</small>`;
    } else {
      badge.classList.add("nrx-tier-unknown");
      badge.href = "https://www.imdb.com/";
      badge.textContent = "–";
    }

    cardEl.appendChild(badge);
    cardEl.setAttribute("data-nrx-done", "1");
  }

  function renderTileBadge(tileEl, result, settings) {
    if (!settings.badgeOnTiles || !tileEl || tileEl.querySelector(".nrx-tile-badge")) return;
    // Unlike the hover card — which the user opened deliberately and where "no match" is useful
    // information — the tile badge is always-on across a whole page. Peppering every unmatched
    // tile (trailers, sports, local titles below the vote threshold) with a placeholder is noise,
    // so misses simply render nothing.
    if (!result?.found) return;
    const badge = document.createElement("span");
    badge.className = "nrx-tile-badge";
    const tier = settings.colorCode ? tierFor(result.rating) : "neutral";
    badge.classList.add(`nrx-tier-${tier}`);
    badge.textContent = result.rating.toFixed(1);
    // The badge is absolutely positioned, so the tile has to be a containing block. Check the
    // computed value rather than the inline one, so a tile the site already positions via a
    // stylesheet isn't clobbered.
    if (getComputedStyle(tileEl).position === "static") {
      tileEl.style.position = "relative";
    }
    tileEl.appendChild(badge);
  }

  function applyDim(tileEl, result, settings) {
    if (!tileEl) return;
    const shouldDim = result?.found && result.rating < settings.dimBelow;
    tileEl.style.setProperty("--nrx-dim-opacity", settings.dimOpacity);
    tileEl.classList.toggle("nrx-dim", Boolean(shouldDim));
  }

  NRX.badge = { renderBadge, renderTileBadge, applyDim, tierFor };
})();
