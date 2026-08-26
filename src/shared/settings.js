export const DEFAULT_SETTINGS = {
  dimBelow: 6.5,
  dimOpacity: 0.35,
  colorCode: true,
  // On by default: sites without a usable hover-preview card (Hotstar) have nowhere else to put a
  // rating, so an opt-in tile badge meant those sites showed nothing at all out of the box.
  badgeOnTiles: true,
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
