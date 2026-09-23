/**
 * Chrome Storage Local & Web Storage Bridge
 * Seamlessly interacts with chrome.storage.local in extension environment
 * with localStorage fallback when running in standalone Vite development.
 */

const STORAGE_KEY = "userProfile";
const CACHE_KEY = "siteCache";
const SUBSCRIPTION_KEY = "subscriptionState";

export const DEFAULT_SUBSCRIPTION = {
  plan: 'free', // 'free' | 'payg' | 'pro'
  credits: 15,
  billingCycle: 'monthly', // 'monthly' | 'manual_discount'
  referralCode: 'OMNI-789X',
  referralStats: {
    friendsInvited: 3,
    freeFormsEarned: 30,
    payingReferrals: 1,
    bonusCreditsEarned: 250,
  },
  isPayingCustomer: false,
};

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

/* -------------------- CACHE MANAGEMENT HELPERS -------------------- */

export async function getStoredCache() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([CACHE_KEY], (result) => {
        resolve(result[CACHE_KEY] || {});
      });
    });
  } else {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
}

export async function saveStoredCache(siteCache) {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [CACHE_KEY]: siteCache }, () => {
        resolve(siteCache);
      });
    });
  } else {
    localStorage.setItem(CACHE_KEY, JSON.stringify(siteCache));
    window.dispatchEvent(
      new CustomEvent("omniform_cache_update", { detail: siteCache })
    );
    return siteCache;
  }
}

export async function evictSiteCache(siteKey) {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "EVICT_SITE_CACHE", siteKey }, (response) => {
        if (chrome.runtime.lastError) {
          // Fallback direct storage delete
          chrome.storage.local.get([CACHE_KEY], (res) => {
            const cache = res[CACHE_KEY] || {};
            delete cache[siteKey];
            chrome.storage.local.set({ [CACHE_KEY]: cache }, () => resolve(cache));
          });
        } else {
          resolve(response);
        }
      });
    });
  } else {
    const cache = await getStoredCache();
    delete cache[siteKey];
    await saveStoredCache(cache);
    return { success: true, evicted: siteKey };
  }
}

export async function clearAllCache() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "CLEAR_ALL_CACHE" }, () => {
        chrome.storage.local.set({ [CACHE_KEY]: {} }, () => resolve({ success: true }));
      });
    });
  } else {
    localStorage.setItem(CACHE_KEY, JSON.stringify({}));
    window.dispatchEvent(
      new CustomEvent("omniform_cache_update", { detail: {} })
    );
    return { success: true };
  }
}

export function subscribeToCacheUpdates(onUpdate) {
  if (isChromeStorageAvailable()) {
    const listener = (changes, areaName) => {
      if (areaName === "local" && changes[CACHE_KEY]) {
        onUpdate(changes[CACHE_KEY].newValue || {});
      }
    };
    chrome.storage.onChanged.addListener(listener);

    const runtimeListener = (message) => {
      if (message.action === "CACHE_UPDATED" && message.siteCache) {
        onUpdate(message.siteCache);
      }
    };
    chrome.runtime.onMessage.addListener(runtimeListener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  } else {
    const customListener = (e) => {
      if (e.detail) onUpdate(e.detail);
    };
    window.addEventListener("omniform_cache_update", customListener);
    return () => {
      window.removeEventListener("omniform_cache_update", customListener);
    };
  }
}

export async function getActiveTabInfo() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
          return resolve({ url: "", title: "", siteKey: "" });
        }
        const tab = tabs[0];
        let siteKey = tab.url || "";
        try {
          const parsed = new URL(tab.url);
          siteKey = parsed.protocol === "file:" ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
        } catch (e) {
          siteKey = (tab.url || "").split("?")[0].split("#")[0];
        }
        resolve({
          url: tab.url || "",
          title: tab.title || "",
          siteKey,
        });
      });
    });
  } else {
    return {
      url: window.location.href,
      title: document.title || "OmniForm AI Standalone",
      siteKey: window.location.origin + window.location.pathname,
    };
  }
}

/* -------------------- SUBSCRIPTION & REFERRAL HELPERS -------------------- */

export async function getStoredSubscription() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([SUBSCRIPTION_KEY], (result) => {
        resolve(result[SUBSCRIPTION_KEY] || DEFAULT_SUBSCRIPTION);
      });
    });
  } else {
    try {
      const raw = localStorage.getItem(SUBSCRIPTION_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_SUBSCRIPTION;
    } catch (e) {
      return DEFAULT_SUBSCRIPTION;
    }
  }
}

export async function saveStoredSubscription(subData) {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SUBSCRIPTION_KEY]: subData }, () => {
        resolve(subData);
      });
    });
  } else {
    localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subData));
    window.dispatchEvent(
      new CustomEvent("omniform_subscription_update", { detail: subData })
    );
    return subData;
  }
}

export function subscribeToSubscriptionUpdates(onUpdate) {
  if (isChromeStorageAvailable()) {
    const listener = (changes, areaName) => {
      if (areaName === "local" && changes[SUBSCRIPTION_KEY]) {
        onUpdate(changes[SUBSCRIPTION_KEY].newValue || DEFAULT_SUBSCRIPTION);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  } else {
    const customListener = (e) => {
      if (e.detail) onUpdate(e.detail);
    };
    window.addEventListener("omniform_subscription_update", customListener);
    return () => {
      window.removeEventListener("omniform_subscription_update", customListener);
    };
  }
}

