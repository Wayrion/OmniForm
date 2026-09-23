/**
 * API client for interacting with FastAPI backend and Chrome background worker.
 */

const BACKEND_URL = "http://localhost:8000";

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { online: true, ...data };
  } catch (err) {
    return { online: false, error: err.message || "Failed to reach backend" };
  }
}

export async function uploadAndIngestDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/api/ingest-document`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = `Ingest failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errorDetail;
    } catch (e) {
      errorDetail = await res.text();
    }
    throw new Error(errorDetail);
  }

  return await res.json();
}

export async function requestAutofill(options = {}) {
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === "function"
  ) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "AUTOFILL_REQUEST", options },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response) {
            return reject(new Error("No response received from background service worker."));
          }
          if (!response.success) {
            return reject(new Error(response.error || "Autofill failed."));
          }
          resolve(response);
        }
      );
    });
  } else {
    // Development fallback simulation
    return new Promise((resolve) => {
      setTimeout(() => {
        const isForce = Boolean(options.forceRefresh);
        resolve({
          success: true,
          count: 6,
          simulated: true,
          fromCache: !isForce,
          siteKey: window.location.origin + window.location.pathname,
          cachedAt: Date.now() - 1000 * 60 * 5,
          message: isForce
            ? "Dev preview: Re-queried with AI (force refreshed)."
            : "Dev preview: Autofill restored from cache (instant).",
        });
      }, 500);
    });
  }
}


