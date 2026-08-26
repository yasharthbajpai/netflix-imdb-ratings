import { normalizeTitle } from "../shared/normalize.js";
import { bulkPut, clearAll, getDb } from "../background/db.js";

const KEPT_TYPES = new Set(["movie", "tvSeries", "tvMiniSeries", "tvMovie", "tvSpecial"]);
const MIN_VOTES = 50;
const BATCH_SIZE = 5000;

const el = {
  statusView: document.getElementById("status-view"),
  statusSummary: document.getElementById("status-summary"),
  rebuildBtn: document.getElementById("rebuild-btn"),
  formView: document.getElementById("form-view"),
  ratingsUrl: document.getElementById("ratings-url"),
  titlesUrl: document.getElementById("titles-url"),
  buildBtn: document.getElementById("build-btn"),
  progressView: document.getElementById("progress-view"),
  progressPhase: document.getElementById("progress-phase"),
  progressBar: document.getElementById("progress-bar"),
  progressDetail: document.getElementById("progress-detail"),
  errorView: document.getElementById("error-view"),
  errorDetail: document.getElementById("error-detail"),
  retryBtn: document.getElementById("retry-btn"),
};

function show(view) {
  for (const v of [el.statusView, el.formView, el.progressView, el.errorView]) {
    v.hidden = v !== view;
  }
}

function formatBytes(n) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

async function streamGzipTsvLines(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while fetching ${url}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;

  const counter = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      onBytes(received, total);
      controller.enqueue(chunk);
    },
  });

  let stream;
  try {
    stream = res.body.pipeThrough(counter).pipeThrough(new DecompressionStream("gzip"));
  } catch (err) {
    throw new Error(`Couldn't decompress ${url} — is it a .gz file? (${err.message})`);
  }

  return stream.pipeThrough(new TextDecoderStream());
}

async function* readLines(url, onBytes) {
  const textStream = await streamGzipTsvLines(url, onBytes);
  const reader = textStream.getReader();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, idx);
      buf = buf.slice(idx + 1);
    }
  }
  if (buf) yield buf;
}

async function buildRatingsMap(url, onProgress) {
  const map = new Map();
  let first = true;
  let rows = 0;
  for await (const line of readLines(url, (received, total) => {
    onProgress(received, total, rows);
  })) {
    if (first) {
      first = false;
      continue;
    }
    if (!line) continue;
    const parts = line.split("\t");
    const tconst = parts[0];
    if (!tconst || !tconst.startsWith("tt")) continue;
    const votes = parseInt(parts[2], 10);
    if (!Number.isFinite(votes) || votes < MIN_VOTES) continue;
    const rating10 = Math.round(parseFloat(parts[1]) * 10);
    if (!Number.isFinite(rating10)) continue;
    const tconstNum = parseInt(tconst.slice(2), 10);
    map.set(tconstNum, { r: rating10, v: votes });
    rows++;
  }
  return map;
}

async function buildAndInsertTitles(url, ratingsMap, onProgress, onRowsInserted) {
  let first = true;
  let batch = [];
  let totalRows = 0;

  const flush = async () => {
    if (!batch.length) return;
    await bulkPut(batch);
    totalRows += batch.length;
    onRowsInserted(totalRows);
    batch = [];
    await new Promise((r) => setTimeout(r));
  };

  for await (const line of readLines(url, (received, total) => {
    onProgress(received, total, totalRows);
  })) {
    if (first) {
      first = false;
      continue;
    }
    if (!line) continue;
    const parts = line.split("\t");
    const tconst = parts[0];
    if (!tconst || !tconst.startsWith("tt")) continue;
    const titleType = parts[1];
    if (!KEPT_TYPES.has(titleType)) continue;

    const tconstNum = parseInt(tconst.slice(2), 10);
    const ratingEntry = ratingsMap.get(tconstNum);
    if (!ratingEntry) continue;

    const primaryTitle = parts[2];
    const originalTitle = parts[3];
    const startYear = parts[5];
    const year = startYear && startYear !== "\\N" ? parseInt(startYear, 10) : null;

    const normPrimary = normalizeTitle(primaryTitle);
    const normOriginal =
      originalTitle && originalTitle !== "\\N" ? normalizeTitle(originalTitle) : "";

    if (normPrimary) {
      batch.push({
        norm: normPrimary,
        tconst: tconstNum,
        year,
        type: titleType,
        rating10: ratingEntry.r,
        votes: ratingEntry.v,
      });
    }
    if (normOriginal && normOriginal !== normPrimary) {
      batch.push({
        norm: normOriginal,
        tconst: tconstNum,
        year,
        type: titleType,
        rating10: ratingEntry.r,
        votes: ratingEntry.v,
      });
    }
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return totalRows;
}

function originOf(urlString) {
  return new URL(urlString).origin + "/*";
}

async function runBuild(ratingsUrl, titlesUrl) {
  show(el.progressView);

  let origins;
  try {
    origins = [...new Set([originOf(ratingsUrl), originOf(titlesUrl)])];
  } catch {
    throw new Error("One of the URLs isn't valid. Check both fields and try again.");
  }

  el.progressPhase.textContent = "Requesting permission…";
  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    throw new Error(
      "Permission wasn't granted for that host, so the download can't proceed. Click Build index again to retry."
    );
  }

  await clearAll();
  await chrome.storage.local.set({
    indexStatus: { state: "indexing", ratingsUrl, titlesUrl },
  });

  el.progressPhase.textContent = "Downloading ratings…";
  el.progressBar.removeAttribute("value");
  const ratingsMap = await buildRatingsMap(ratingsUrl, (received, total) => {
    if (total) {
      el.progressBar.value = (received / total) * 100;
      el.progressDetail.textContent = `${formatBytes(received)} / ${formatBytes(total)}`;
    } else {
      el.progressDetail.textContent = formatBytes(received);
    }
  });

  el.progressPhase.textContent = "Downloading titles & building index…";
  const rows = await buildAndInsertTitles(
    titlesUrl,
    ratingsMap,
    (received, total) => {
      if (total) {
        el.progressBar.value = (received / total) * 100;
      } else {
        el.progressBar.removeAttribute("value");
      }
    },
    (rowsInserted) => {
      el.progressDetail.textContent = `${rowsInserted.toLocaleString()} rows indexed`;
    }
  );

  await chrome.storage.local.set({
    indexStatus: {
      state: "ready",
      rows,
      builtAt: Date.now(),
      ratingsUrl,
      titlesUrl,
    },
  });

  return rows;
}

function showError(err) {
  console.error(err);
  el.errorDetail.textContent = err.message || String(err);
  show(el.errorView);
}

async function checkForCrashedRun() {
  const { indexStatus } = await chrome.storage.local.get("indexStatus");
  if (indexStatus?.state === "indexing") {
    await clearAll();
    await chrome.storage.local.set({ indexStatus: { state: "not_built" } });
  }
  return indexStatus?.state === "indexing" ? { state: "not_built" } : indexStatus;
}

async function renderInitialView() {
  const status = await checkForCrashedRun();
  if (status?.state === "ready") {
    const built = new Date(status.builtAt).toLocaleString();
    el.statusSummary.textContent = `Indexed on ${built} — ${status.rows.toLocaleString()} rows.`;
    el.ratingsUrl.value = status.ratingsUrl;
    el.titlesUrl.value = status.titlesUrl;
    show(el.statusView);
  } else {
    show(el.formView);
  }
}

el.buildBtn.addEventListener("click", async () => {
  el.buildBtn.disabled = true;
  try {
    const rows = await runBuild(el.ratingsUrl.value.trim(), el.titlesUrl.value.trim());
    await renderInitialView();
    console.log(`Index built: ${rows} rows`);
  } catch (err) {
    showError(err);
  } finally {
    el.buildBtn.disabled = false;
  }
});

el.rebuildBtn.addEventListener("click", () => {
  show(el.formView);
});

el.retryBtn.addEventListener("click", () => {
  show(el.formView);
});

renderInitialView();
