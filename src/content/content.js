var NRX = globalThis.NRX || (globalThis.NRX = {});

(function () {
  const DEBUG = localStorage.getItem("NRX_DEBUG") === "1";
  const log = (...args) => DEBUG && console.log("[nrx]", ...args);

  const DEFAULT_SETTINGS = {
    dimBelow: 6.5,
    dimOpacity: 0.35,
    colorCode: true,
    badgeOnTiles: false,
    enabled: true,
  };

  let settings = DEFAULT_SETTINGS;
  const ratingsCache = new Map(); // netflixId or fallback key -> result
  let pendingBatch = new Map(); // key -> {title, year}
  let flushTimer = null;
  let notReadyWarned = false;

  function keyFor(identity) {
    return identity.netflixId || identity.title;
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      settings = { ...DEFAULT_SETTINGS, ...stored };
    } catch (err) {
      log("settings load failed, using defaults", err);
    }
  }

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      settings[k] = newValue;
    }
    reapplyAll();
  });

  function flushBatch() {
    if (!pendingBatch.size) return;
    const items = Array.from(pendingBatch, ([key, v]) => ({ key, ...v }));
    pendingBatch = new Map();
    chrome.runtime.sendMessage({ type: "GET_RATINGS", items }, (response) => {
      if (!response) return;
      if (response.notReady) {
        if (!notReadyWarned) {
          log("index not ready yet — ratings will appear once setup finishes");
          notReadyWarned = true;
        }
        return;
      }
      for (const item of items) {
        const result = response[item.key];
        ratingsCache.set(item.key, result);
        onResultReady(item.key, result);
      }
    });
  }

  function queueLookup(identity) {
    const key = keyFor(identity);
    if (!key || ratingsCache.has(key) || pendingBatch.has(key)) return;
    pendingBatch.set(key, { title: identity.title, year: identity.year });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushBatch, 250);
  }

  function onResultReady(key, result) {
    for (const tile of NRX.dom.findTiles(document)) {
      const identity = NRX.dom.extractTitle(tile);
      if (keyFor(identity) === key) {
        NRX.badge.applyDim(tile, result, settings);
        NRX.badge.renderTileBadge(tile, result, settings);
      }
    }
    const card = document.querySelector('[data-nrx-pending-card="1"]');
    if (card) {
      const identity = NRX.dom.extractTitle(card);
      if (keyFor(identity) === key) {
        NRX.badge.renderBadge(card, result, settings);
        card.removeAttribute("data-nrx-pending-card");
      }
    }
  }

  function processTile(tile) {
    if (tile.hasAttribute("data-nrx-seen")) return;
    tile.setAttribute("data-nrx-seen", "1");
    const identity = NRX.dom.extractTitle(tile);
    if (!identity.title) {
      log("extraction miss on tile", tile);
      return;
    }
    const key = keyFor(identity);
    if (ratingsCache.has(key)) {
      NRX.badge.applyDim(tile, ratingsCache.get(key), settings);
      NRX.badge.renderTileBadge(tile, ratingsCache.get(key), settings);
    } else {
      queueLookup(identity);
    }
  }

  function processHoverCard(card) {
    if (card.hasAttribute("data-nrx-done")) return;
    const identity = NRX.dom.extractTitle(card);
    if (!identity.title) {
      log("extraction miss on hover card", card);
      return;
    }
    const key = keyFor(identity);
    if (ratingsCache.has(key)) {
      NRX.badge.renderBadge(card, ratingsCache.get(key), settings);
    } else {
      card.setAttribute("data-nrx-pending-card", "1");
      queueLookup(identity);
    }
  }

  function reapplyAll() {
    for (const tile of NRX.dom.findTiles(document)) {
      const identity = NRX.dom.extractTitle(tile);
      const key = keyFor(identity);
      if (key && ratingsCache.has(key)) {
        const result = ratingsCache.get(key);
        NRX.badge.applyDim(tile, result, settings);
        NRX.badge.renderTileBadge(tile, result, settings);
      }
    }
  }

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) processTile(entry.target);
      }
    },
    { rootMargin: "200px" }
  );

  function scanForTiles(root) {
    for (const tile of NRX.dom.findTiles(root)) {
      if (!tile.hasAttribute("data-nrx-seen")) intersectionObserver.observe(tile);
    }
  }

  let mutationScheduled = false;
  const mutationObserver = new MutationObserver((mutations) => {
    if (mutationScheduled) return;
    mutationScheduled = true;
    requestAnimationFrame(() => {
      mutationScheduled = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          scanForTiles(node);
          const card = NRX.dom.findHoverCard(node);
          if (card) processHoverCard(card);
        }
      }
    });
  });

  async function init() {
    await loadSettings();
    scanForTiles(document.body);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    log("initialized");
  }

  init();
})();
