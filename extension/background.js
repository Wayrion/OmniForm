/**
 * OmniForm AI - Background Service Worker (Manifest V3)
 * Orchestrates communication between React Side Panel, Content Script, and FastAPI Backend.
 */

const BACKEND_BASE_URL = "http://localhost:8000";

// Enable opening side panel when clicking the extension icon
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error("Failed to set panel behavior:", err);
  });
});

/**
 * Ensures content script is injected in the tab (useful for tabs opened before extension reload).
 */
async function ensureContentScriptInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "PING" });
  } catch (e) {
    // If no response, inject content script programmatically
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}

/**
 * Helper to produce a clean, stable cache key for a website.
 * Normalizes HTTP/HTTPS URLs by origin + pathname (ignoring query/hash),
 * and local file:// paths by pathname.
 */
function getSiteCacheKey(rawUrl) {
  if (!rawUrl) return "unknown";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "file:") {
      return parsed.pathname;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch (e) {
    return rawUrl.split("?")[0].split("#")[0];
  }
}

/**
 * Main message orchestrator
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "AUTOFILL_REQUEST") {
    handleAutofillRequest(request.options || {})
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("Autofill error:", error);
        sendResponse({ success: false, error: error.message || String(error) });
      });
    return true; // Keep message channel open for async response
  }

  if (request.action === "LEARN_NEW_FIELD") {
    handleLearnNewField(request.data)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("Error saving learned field:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "GET_CACHE_INFO") {
    getCacheInfo()
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("Error getting cache info:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "EVICT_SITE_CACHE") {
    evictSiteCache(request.siteKey)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("Error evicting site cache:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "CLEAR_ALL_CACHE") {
    clearAllCache()
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("Error clearing all cache:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "GET_ACTIVE_TAB_INFO") {
    getActiveTabInfo()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Returns current active tab details and site cache key
 */
async function getActiveTabInfo() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) return { success: false, error: "No active tab" };
  const siteKey = getSiteCacheKey(activeTab.url);
  return {
    success: true,
    tabId: activeTab.id,
    url: activeTab.url || "",
    title: activeTab.title || "",
    siteKey: siteKey,
  };
}

/**
 * Retrieves the full site cache and current tab's cache entry
 */
async function getCacheInfo() {
  const storageData = await chrome.storage.local.get(["siteCache"]);
  const siteCache = storageData.siteCache || {};

  let currentSiteKey = null;
  let currentEntry = null;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      currentSiteKey = getSiteCacheKey(activeTab.url);
      currentEntry = siteCache[currentSiteKey] || null;
    }
  } catch (e) {
    // Ignore tab query errors
  }

  return {
    success: true,
    siteCache,
    currentSiteKey,
    currentEntry,
  };
}

/**
 * Manually evicts a specific website cache entry
 */
async function evictSiteCache(siteKey) {
  if (!siteKey) return { success: false, error: "No siteKey specified" };
  const storageData = await chrome.storage.local.get(["siteCache"]);
  const siteCache = storageData.siteCache || {};

  if (siteCache[siteKey]) {
    delete siteCache[siteKey];
    await chrome.storage.local.set({ siteCache });

    // Notify side panel
    chrome.runtime.sendMessage({
      action: "CACHE_UPDATED",
      siteCache,
      evicted: siteKey,
    }).catch(() => {});
  }

  return { success: true, evicted: siteKey };
}

/**
 * Clears all cached websites
 */
async function clearAllCache() {
  await chrome.storage.local.set({ siteCache: {} });
  chrome.runtime.sendMessage({
    action: "CACHE_UPDATED",
    siteCache: {},
  }).catch(() => {});
  return { success: true };
}

/**
 * Executes the autofill pipeline:
 * 1. Query active tab
 * 2. Check siteCache: If found and forceRefresh is false, immediately fill with cached mapping!
 * 3. Extract DOM fields from content.js
 * 4. Load userProfile from chrome.storage.local
 * 5. Request mapping from FastAPI /api/map-fields
 * 6. Cache mapping in siteCache
 * 7. Inject mapping via content.js FILL_FIELDS
 */
async function handleAutofillRequest(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.id) {
    throw new Error("No active browser tab found.");
  }

  // Prevent running on restricted internal URLs
  if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://"))) {
    throw new Error("Cannot autofill Chrome internal pages.");
  }

  await ensureContentScriptInjected(activeTab.id);

  const siteKey = getSiteCacheKey(activeTab.url);

  // 1. Check if mapping is already cached for this website
  if (!forceRefresh) {
    const storageData = await chrome.storage.local.get(["siteCache"]);
    const siteCache = storageData.siteCache || {};
    const cachedEntry = siteCache[siteKey];

    if (cachedEntry && cachedEntry.mapping && Object.keys(cachedEntry.mapping).length > 0) {
      console.log(`[OmniForm AI] Cache HIT for ${siteKey}. Applying cached mappings.`);
      const fillResponse = await chrome.tabs.sendMessage(activeTab.id, {
        action: "FILL_FIELDS",
        mappingData: cachedEntry.mapping,
      });

      return {
        success: true,
        count: fillResponse?.count || 0,
        mapping: cachedEntry.mapping,
        fromCache: true,
        cachedAt: cachedEntry.timestamp,
        siteKey: siteKey,
      };
    }
  }

  console.log(`[OmniForm AI] Cache MISS or force refresh for ${siteKey}. Requesting AI mapping.`);

  // 2. Extract form fields from the current webpage
  const extractResponse = await chrome.tabs.sendMessage(activeTab.id, {
    action: "EXTRACT_FIELDS",
  });

  if (!extractResponse || !extractResponse.fields || extractResponse.fields.length === 0) {
    return {
      success: true,
      count: 0,
      message: "No interactive form fields found on this page.",
    };
  }

  const formFields = extractResponse.fields;

  // 3. Read saved user profile from chrome.storage.local
  const storageData = await chrome.storage.local.get(["userProfile"]);
  const userProfile = storageData.userProfile || {};

  if (Object.keys(userProfile).length === 0) {
    throw new Error("User profile is empty. Please upload a CV or add profile details first.");
  }

  // 4. Make POST request to FastAPI backend
  const response = await fetch(`${BACKEND_BASE_URL}/api/map-fields`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      form_fields: formFields,
      user_profile: userProfile,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend mapping error (${response.status}): ${errorText}`);
  }

  const mappingData = await response.json();

  // 5. Save successfully mapped fields to siteCache
  const currentCacheData = await chrome.storage.local.get(["siteCache"]);
  const updatedSiteCache = currentCacheData.siteCache || {};
  let hostName = "local";
  try {
    hostName = new URL(activeTab.url).hostname || "local";
  } catch (e) {}

  updatedSiteCache[siteKey] = {
    siteKey: siteKey,
    url: activeTab.url,
    title: activeTab.title || siteKey,
    hostname: hostName,
    timestamp: Date.now(),
    mapping: mappingData,
    count: Object.keys(mappingData).length,
  };
  await chrome.storage.local.set({ siteCache: updatedSiteCache });

  // Broadcast cache update event
  chrome.runtime.sendMessage({
    action: "CACHE_UPDATED",
    siteCache: updatedSiteCache,
  }).catch(() => {});

  // 6. Send mapping back to content.js to populate the page
  const fillResponse = await chrome.tabs.sendMessage(activeTab.id, {
    action: "FILL_FIELDS",
    mappingData: mappingData,
  });

  return {
    success: true,
    count: fillResponse?.count || 0,
    mapping: mappingData,
    fromCache: false,
    siteKey: siteKey,
  };
}

/**
 * Handles self-learning updates from content.js:
 * Saves new key-value pairs to chrome.storage.local userProfile
 */
async function handleLearnNewField(fieldData) {
  if (!fieldData || !fieldData.label || !fieldData.value) {
    return { success: false, reason: "Missing label or value" };
  }

  const { label, value, fieldId } = fieldData;
  const storageData = await chrome.storage.local.get(["userProfile"]);
  const profile = storageData.userProfile || {};

  // Store in both a dedicated learnedFields map and as a top-level key for easy access
  if (!profile.learnedFields || typeof profile.learnedFields !== "object") {
    profile.learnedFields = {};
  }
  profile.learnedFields[label] = value;
  profile[label] = value;

  await chrome.storage.local.set({ userProfile: profile });

  // Broadcast notification to UI side panel if currently mounted
  chrome.runtime.sendMessage({
    action: "PROFILE_UPDATED",
    userProfile: profile,
  }).catch(() => {
    // Suppress error if side panel is closed
  });

  return { success: true, learned: { label, value } };
}
