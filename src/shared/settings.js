export const DEFAULT_SETTINGS = {
  dimBelow: 6.5,
  dimOpacity: 0.35,
  colorCode: true,
  badgeOnTiles: false,
  enabled: true,
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(partial) {
  await chrome.storage.sync.set(partial);
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    callback(changes);
  });
}
