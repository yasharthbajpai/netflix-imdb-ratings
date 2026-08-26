const statusEl = document.getElementById("status");

async function render() {
  const { indexStatus } = await chrome.storage.local.get("indexStatus");
  if (indexStatus?.state === "ready") {
    const built = new Date(indexStatus.builtAt).toLocaleDateString();
    statusEl.textContent = `Ready — ${indexStatus.rows.toLocaleString()} titles indexed (${built}).`;
  } else if (indexStatus?.state === "indexing") {
    statusEl.textContent = "Indexing in progress…";
  } else {
    statusEl.textContent = "Not indexed yet. Open Rebuild index to get started.";
  }
}

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-setup").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/setup/setup.html") });
});

render();
