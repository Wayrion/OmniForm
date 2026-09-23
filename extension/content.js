/**
 * OmniForm AI - Content Script
 * Handles DOM field extraction, synthetic event injection for modern frameworks,
 * and self-learning observation.
 */

// Helper to sanitize and find the most relevant human-readable label for a field
function getElementLabel(elem) {
  if (!elem) return "";

  // 1. Explicit <label for="id">
  if (elem.id) {
    try {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(elem.id)}"]`);
      if (explicitLabel && explicitLabel.innerText.trim()) {
        return explicitLabel.innerText.trim();
      }
    } catch (e) {
      // Fallback on query selector error
    }
  }

  // 2. Closest enclosing <label>
  const parentLabel = elem.closest("label");
  if (parentLabel && parentLabel.innerText.trim()) {
    // Clone without the input itself to avoid repeating current value
    const clone = parentLabel.cloneNode(true);
    const innerInputs = clone.querySelectorAll("input, textarea, select");
    innerInputs.forEach((i) => i.remove());
    if (clone.innerText.trim()) {
      return clone.innerText.trim();
    }
  }

  // 3. aria-labelledby
  const labelledBy = elem.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelElem = document.getElementById(labelledBy);
    if (labelElem && labelElem.innerText.trim()) {
      return labelElem.innerText.trim();
    }
  }

  // 4. aria-label
  const ariaLabel = elem.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  // 5. Placeholder
  if (elem.placeholder && elem.placeholder.trim()) {
    return elem.placeholder.trim();
  }

  // 6. Name attribute converted to title case (e.g. first_name -> First Name)
  if (elem.name && elem.name.trim()) {
    return elem.name.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // 7. Element ID fallback
  if (elem.id) {
    return elem.id.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return "";
}

/**
 * Extracts all fillable DOM fields, ignoring hidden/password/buttons.
 * Assigns a temporary stable data-omniform-id if no id exists.
 */
function extractFormFields() {
  const elements = Array.from(
    document.querySelectorAll("input, textarea, select")
  );

  const ignoredTypes = new Set([
    "hidden",
    "password",
    "submit",
    "button",
    "reset",
    "image",
  ]);

  const fields = [];
  let generatedCounter = 0;

  for (const elem of elements) {
    const tagName = elem.tagName.toLowerCase();
    const type = (elem.type || tagName).toLowerCase();

    if (ignoredTypes.has(type)) {
      continue;
    }

    // Skip elements that are completely non-interactive or invisible
    if (elem.disabled || elem.readOnly) {
      continue;
    }

    // Guarantee a unique and stable field identifier
    let fieldId = elem.id;
    if (!fieldId) {
      fieldId = elem.name || elem.getAttribute("data-omniform-id");
      if (!fieldId) {
        fieldId = `omniform-field-${generatedCounter++}`;
        elem.setAttribute("data-omniform-id", fieldId);
      }
    }

    const label = getElementLabel(elem);

    const fieldData = {
      id: fieldId,
      name: elem.name || "",
      type: type,
      tagName: tagName,
      label: label,
      placeholder: elem.placeholder || "",
      value: elem.value || "",
    };

    // If select dropdown, include option list so LLM knows acceptable choices
    if (tagName === "select") {
      fieldData.options = Array.from(elem.options).map((opt) => ({
        value: opt.value,
        text: opt.text.trim(),
      }));
    }

    fields.push(fieldData);
  }

  return fields;
}

// Track when OmniForm AI itself is injecting values to prevent re-learning them
let isAutofillingInternal = false;

/**
 * Fills form fields from backend mapping dictionary.
 * Dispatches synthetic input, change, and blur events so React, Vue, Angular,
 * and Workday internal state trackers properly record the changes.
 * Adds soft green background (#e8f5e9) to filled fields.
 */
function fillForm(mappingData) {
  if (!mappingData || typeof mappingData !== "object") {
    return { success: false, count: 0 };
  }

  isAutofillingInternal = true;
  let filledCount = 0;

  try {
    for (const [fieldId, rawValue] of Object.entries(mappingData)) {
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    const valueStr = String(rawValue);

    // Locate element by id, name, or data-omniform-id
    let elem = document.getElementById(fieldId);
    if (!elem) {
      try {
        elem = document.querySelector(`[name="${CSS.escape(fieldId)}"]`);
      } catch (e) {}
    }
    if (!elem) {
      try {
        elem = document.querySelector(`[data-omniform-id="${CSS.escape(fieldId)}"]`);
      } catch (e) {}
    }

    if (!elem) {
      continue;
    }

    const tagName = elem.tagName.toLowerCase();
    const type = (elem.type || tagName).toLowerCase();

    // 1. Update element value with framework-safe prototype setters
    if (tagName === "select") {
      // Find matching option by exact value, lowercase value, or inner text
      let matchedIndex = -1;
      const valLower = valueStr.toLowerCase().trim();
      for (let i = 0; i < elem.options.length; i++) {
        const opt = elem.options[i];
        if (
          opt.value.toLowerCase() === valLower ||
          opt.text.toLowerCase() === valLower ||
          opt.text.toLowerCase().includes(valLower)
        ) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex !== -1) {
        elem.selectedIndex = matchedIndex;
      } else {
        // Fallback setting raw value
        elem.value = valueStr;
      }
    } else if (type === "checkbox") {
      const boolVal =
        valueStr.toLowerCase() === "true" ||
        valueStr.toLowerCase() === "yes" ||
        valueStr === "1";
      elem.checked = boolVal;
    } else if (type === "radio") {
      if (elem.value === valueStr || elem.value.toLowerCase() === valueStr.toLowerCase()) {
        elem.checked = true;
      }
    } else {
      // Standard input or textarea: Use prototype setter to pierce React 16+ value tracker
      const globalScope = typeof window !== "undefined" ? window : globalThis;
      const proto =
        tagName === "textarea"
          ? (globalScope.HTMLTextAreaElement?.prototype || Object.getPrototypeOf(elem))
          : (globalScope.HTMLInputElement?.prototype || Object.getPrototypeOf(elem));
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

      if (descriptor && descriptor.set) {
        descriptor.set.call(elem, valueStr);
      } else {
        elem.value = valueStr;
      }
    }

    // 2. Dispatch synthetic input, change, and blur events
    elem.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    elem.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    elem.dispatchEvent(new Event("blur", { bubbles: true }));

    // 3. Soft green background visual feedback
    elem.style.backgroundColor = "#e8f5e9";
    elem.style.borderColor = "#81c784";
    elem.style.transition = "background-color 0.4s ease, border-color 0.4s ease";

    filledCount++;
    }
  } finally {
    isAutofillingInternal = false;
  }

  return { success: true, count: filledCount };
}

/**
 * Self-Learning Change Observer:
 * If a user manually types or changes an input field, grab the field's label
 * and the new value, and send LEARN_NEW_FIELD to background.js.
 */
document.addEventListener(
  "change",
  (event) => {
    // Ignore synthetic events generated by OmniForm AI's autofill
    if (isAutofillingInternal) {
      return;
    }

    const target = event.target;
    if (!target || !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
      return;
    }

    const type = (target.type || "").toLowerCase();
    const ignored = new Set(["password", "hidden", "submit", "button", "reset", "image"]);
    if (ignored.has(type)) {
      return;
    }

    const val = target.value;
    if (!val || !val.trim()) {
      return;
    }

    const label = getElementLabel(target);
    const fieldId = target.id || target.name || target.getAttribute("data-omniform-id") || "";

    if (label && label.trim()) {
      chrome.runtime.sendMessage({
        action: "LEARN_NEW_FIELD",
        data: {
          label: label.trim(),
          value: val.trim(),
          fieldId: fieldId,
          name: target.name || "",
        },
      });
    }
  },
  true
);

/**
 * Listen for commands from background.js
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_FIELDS") {
    const fields = extractFormFields();
    sendResponse({ success: true, fields });
    return true;
  }

  if (request.action === "FILL_FIELDS") {
    const result = fillForm(request.mappingData);
    sendResponse(result);
    return true;
  }
});
