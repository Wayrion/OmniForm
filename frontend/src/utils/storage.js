/**
 * Chrome Storage Local & Web Storage Bridge
 * Seamlessly interacts with chrome.storage.local in extension environment
 * with localStorage fallback when running in standalone Vite development.
 */

const STORAGE_KEY = "userProfile";

const isChromeStorageAvailable = () => {
  return (
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.local &&
    typeof chrome.storage.local.get === "function"
  );
};

export async function getStoredProfile() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || {});
      });
    });
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn("Error reading localStorage:", e);
      return {};
    }
  }
}

export async function saveStoredProfile(profile) {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: profile }, () => {
        resolve(profile);
      });
    });
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      window.dispatchEvent(
        new CustomEvent("omniform_storage_update", { detail: profile })
      );
    } catch (e) {
      console.warn("Error saving to localStorage:", e);
    }
    return profile;
  }
}

export function subscribeToProfileUpdates(onUpdate) {
  if (isChromeStorageAvailable()) {
    const listener = (changes, areaName) => {
      if (areaName === "local" && changes[STORAGE_KEY]) {
        onUpdate(changes[STORAGE_KEY].newValue || {});
      }
    };
    chrome.storage.onChanged.addListener(listener);

    // Also listen to direct runtime messages if broadcasted by background.js
    const runtimeListener = (message) => {
      if (message.action === "PROFILE_UPDATED" && message.userProfile) {
        onUpdate(message.userProfile);
      }
    };
    chrome.runtime.onMessage.addListener(runtimeListener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  } else {
    const customListener = (e) => {
      if (e.detail) {
        onUpdate(e.detail);
      }
    };
    window.addEventListener("omniform_storage_update", customListener);
    return () => {
      window.removeEventListener("omniform_storage_update", customListener);
    };
  }
}

