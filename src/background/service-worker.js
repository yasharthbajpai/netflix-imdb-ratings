import { MSG } from "../shared/messages.js";
import { lookupRating } from "./lookup.js";

async function getIndexStatus() {
  const { indexStatus } = await chrome.storage.local.get("indexStatus");
  return indexStatus || { state: "not_built" };
}

async function handleGetRatings(items) {
  const status = await getIndexStatus();
  if (status.state !== "ready") {
    return { notReady: true };
  }
  const result = {};
  for (const item of items) {
    result[item.key] = await lookupRating(item);
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MSG.GET_RATINGS) {
    handleGetRatings(message.items).then(sendResponse);
    return true;
  }
  if (message?.type === MSG.GET_STATUS) {
    getIndexStatus().then(sendResponse);
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/setup/setup.html") });
});
