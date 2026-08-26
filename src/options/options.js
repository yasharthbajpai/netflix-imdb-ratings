import { getSettings, setSettings } from "../shared/settings.js";

const el = {
  enabled: document.getElementById("enabled"),
  colorCode: document.getElementById("colorCode"),
  badgeOnTiles: document.getElementById("badgeOnTiles"),
  dimBelow: document.getElementById("dimBelow"),
  dimBelowVal: document.getElementById("dimBelowVal"),
  dimOpacity: document.getElementById("dimOpacity"),
  dimOpacityVal: document.getElementById("dimOpacityVal"),
  indexSummary: document.getElementById("index-summary"),
  rebuildBtn: document.getElementById("rebuild-btn"),
};

async function render() {
  const settings = await getSettings();
  el.enabled.checked = settings.enabled;
  el.colorCode.checked = settings.colorCode;
  el.badgeOnTiles.checked = settings.badgeOnTiles;
  el.dimBelow.value = settings.dimBelow;
  el.dimBelowVal.textContent = Number(settings.dimBelow).toFixed(1);
  el.dimOpacity.value = settings.dimOpacity;
  el.dimOpacityVal.textContent = Number(settings.dimOpacity).toFixed(2);

  const { indexStatus } = await chrome.storage.local.get("indexStatus");
  if (indexStatus?.state === "ready") {
    const built = new Date(indexStatus.builtAt).toLocaleString();
    el.indexSummary.textContent = `Indexed on ${built} — ${indexStatus.rows.toLocaleString()} rows.`;
  } else {
    el.indexSummary.textContent = "Not indexed yet.";
  }
}

function bindToggle(input, key) {
  input.addEventListener("change", () => setSettings({ [key]: input.checked }));
}

function bindRange(input, valueEl, key, formatter) {
  input.addEventListener("input", () => {
    valueEl.textContent = formatter(input.value);
  });
  input.addEventListener("change", () => setSettings({ [key]: Number(input.value) }));
}

bindToggle(el.enabled, "enabled");
bindToggle(el.colorCode, "colorCode");
bindToggle(el.badgeOnTiles, "badgeOnTiles");
bindRange(el.dimBelow, el.dimBelowVal, "dimBelow", (v) => Number(v).toFixed(1));
bindRange(el.dimOpacity, el.dimOpacityVal, "dimOpacity", (v) => Number(v).toFixed(2));

el.rebuildBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/setup/setup.html") });
});

render();
