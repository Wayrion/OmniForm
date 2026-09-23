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
 * Main message orchestrator
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "AUTOFILL_REQUEST") {
    handleAutofillRequest()
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
});

/**
 * Executes the autofill pipeline:
 * 1. Query active tab
 * 2. Extract DOM fields from content.js
 * 3. Load userProfile from chrome.storage.local
 * 4. Request mapping from FastAPI /api/map-fields
 * 5. Inject mapping via content.js FILL_FIELDS
 */
async function handleAutofillRequest() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.id) {
    throw new Error("No active browser tab found.");
  }

  // Prevent running on restricted internal URLs
  if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://"))) {
    throw new Error("Cannot autofill Chrome internal pages.");
  }

  await ensureContentScriptInjected(activeTab.id);

  // 1. Extract form fields from the current webpage
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

  // 2. Read saved user profile from chrome.storage.local
  const storageData = await chrome.storage.local.get(["userProfile"]);
  const userProfile = storageData.userProfile || {};

  if (Object.keys(userProfile).length === 0) {
    throw new Error("User profile is empty. Please upload a CV or add profile details first.");
  }

  // 3. Make POST request to FastAPI backend
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

  // 4. Send mapping back to content.js to populate the page
  const fillResponse = await chrome.tabs.sendMessage(activeTab.id, {
    action: "FILL_FIELDS",
    mappingData: mappingData,
  });

  return {
    success: true,
    count: fillResponse?.count || 0,
    mapping: mappingData,
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
