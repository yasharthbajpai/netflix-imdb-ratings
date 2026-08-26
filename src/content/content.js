var NRX = globalThis.NRX || (globalThis.NRX = {});

(function () {
  const DEBUG = localStorage.getItem("NRX_DEBUG") === "1";
  const log = (...args) => DEBUG && console.log("[nrx]", ...args);

  // Keep in sync with src/shared/settings.js — content scripts can't import it.
  const DEFAULT_SETTINGS = {
    dimBelow: 6.5,
    dimOpacity: 0.35,
    colorCode: true,
    badgeOnTiles: true,
    enabled: true,
  };

  // Tile text and images are lazy-painted, so an extraction miss usually means "not rendered yet"
  // rather than "unextractable". Retry a few times before writing a tile off for good.
  const MAX_EXTRACT_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 500;

  let settings = DEFAULT_SETTINGS;
  const ratingsCache = new Map(); // id or fallback key -> result
  let pendingBatch = new Map(); // key -> {title, year}
  let flushTimer = null;
  let notReadyWarned = false;
  const retryTiles = new Set();
  let retryTimer = null;
  let stopped = false;

  // Reloading or updating the extension does not kill the content scripts already running in open
  // tabs — it only severs their chrome.* bindings, so the next call throws "Extension context
  // invalidated". chrome.runtime.id goes undefined at that moment, which is the reliable signal.
  function contextAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  // Shut the orphan down quietly rather than letting it keep firing and spamming the errors page.
  function teardown() {
    if (stopped) return;
    stopped = true;
    clearTimeout(flushTimer);
    clearTimeout(retryTimer);
    retryTiles.clear();
    pendingBatch = new Map();
    try {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    } catch {
      /* observers may not exist yet if this fires during startup */
    }
    log("extension context invalidated — orphaned content script stopped");
  }

  function keyFor(identity) {
    return identity.id || identity.title;
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
    if (stopped) return;
    if (!contextAlive()) return teardown();
    if (area !== "sync") return;
    for (const [k, change] of Object.entries(changes)) {
      // A cleared key has no newValue; fall back to the default rather than storing undefined.
      settings[k] = change?.newValue ?? DEFAULT_SETTINGS[k];
    }
    reapplyAll();
  });

  function flushBatch() {
    if (stopped || !pendingBatch.size) return;
    if (!contextAlive()) return teardown();
    const items = Array.from(pendingBatch, ([key, v]) => ({ key, ...v }));
    pendingBatch = new Map();
    try {
      chrome.runtime.sendMessage({ type: "GET_RATINGS", items }, (response) => {
        // Must be read, or Chrome logs "Unchecked runtime.lastError" noise whenever the service
        // worker is gone (which is also how a mid-flight extension reload surfaces here).
        if (chrome.runtime.lastError) {
          log("lookup failed", chrome.runtime.lastError.message);
          if (!contextAlive()) teardown();
          return;
        }
        if (!response || response.notReady) {
          if (response?.notReady && !notReadyWarned) {
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
    } catch (err) {
      log("sendMessage threw", err);
      teardown();
    }
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

  function scheduleRetry(tile) {
    retryTiles.add(tile);
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (stopped) return;
      const batch = Array.from(retryTiles);
      retryTiles.clear();
      for (const t of batch) {
        if (t.isConnected) processTile(t);
      }
    }, RETRY_DELAY_MS);
  }

  function processTile(tile) {
    if (tile.hasAttribute("data-nrx-seen")) return;
    const identity = NRX.dom.extractTitle(tile);
    if (!identity.title) {
      // Don't mark the tile seen yet — its poster/caption may simply not have painted.
      const tries = Number(tile.getAttribute("data-nrx-tries") || 0) + 1;
      tile.setAttribute("data-nrx-tries", String(tries));
      if (tries >= MAX_EXTRACT_ATTEMPTS) {
        tile.setAttribute("data-nrx-seen", "1");
        log("extraction miss on tile", tile);
      } else {
        scheduleRetry(tile);
      }
      return;
    }
    tile.setAttribute("data-nrx-seen", "1");
    tile.removeAttribute("data-nrx-tries"); // extraction succeeded; don't leave a stale retry count
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
      if (stopped) return;
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
  let pendingMutations = [];
  const mutationObserver = new MutationObserver((mutations) => {
    if (stopped) return;
    // Queue every record. Bailing out early while a frame was already scheduled used to *discard*
    // these mutations, so on lazily-rendered carousels most rows were never scanned at all.
    for (const mutation of mutations) pendingMutations.push(mutation);
    if (mutationScheduled) return;
    mutationScheduled = true;
    requestAnimationFrame(() => {
      mutationScheduled = false;
      if (stopped) return;
      const batch = pendingMutations;
      pendingMutations = [];
      for (const mutation of batch) {
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
    if (!contextAlive()) return;
    await loadSettings();
    if (stopped) return;
    scanForTiles(document.body);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    log("initialized");
  }

  init();
})();
