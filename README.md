# OmniForm AI ⚡

> **Production-Ready Agentic, Self-Learning Form Autofiller powered by Nebius Token Factory & Chrome Manifest V3**

OmniForm AI is a privacy-first, agentic form-autofilling system. It parses resumes/CVs using **Qwen 2.5 72B**, maps DOM fields intelligently using **Llama 3.3 70B**, triggers synthetic events compatible with modern frontend frameworks (React, Angular, Vue, Workday), and continuously learns new user attributes from manual inputs.

---

## 1. Monorepo Architecture

```text
omniform-ai/
├── backend/
│   ├── main.py                     # FastAPI backend with AsyncOpenAI client targeting Nebius Token Factory
│   ├── requirements.txt            # Python dependencies (fastapi, uvicorn, openai, pydantic, pypdf)
│   ├── test_backend.py             # Automated unit tests for endpoints, schemas & mock LLM responses
│   ├── .env.example                # Template configuration for NEBIUS_API_KEY
│   └── .env                        # Local environment variables
├── frontend/
│   ├── index.html                  # Side panel HTML mount
│   ├── package.json                # React 18, Vite, Tailwind CSS, Lucide icons
│   ├── vite.config.js              # Configured to compile into ../extension/dist with relative CSP assets
│   ├── tailwind.config.js          # Tailwind CSS styling
│   └── src/
│       ├── main.jsx                # React root
│       ├── App.jsx                 # Lovable-style side panel UI (Dropzone, Editable Grid, Sticky Autofill)
│       └── utils/
│           ├── storage.js          # chrome.storage.local bridge with localStorage dev fallback
│           └── api.js              # Backend client for document ingestion and autofill requests
├── extension/
│   ├── manifest.json               # Manifest V3 (activeTab, storage, sidePanel, scripting)
│   ├── background.js               # Service worker orchestrator (AUTOFILL_REQUEST, LEARN_NEW_FIELD)
│   ├── content.js                  # DOM field extractor, prototype event dispatcher, change observer
│   ├── icons/                      # Extension icons (16px, 48px, 128px)
│   └── dist/                       # Production output from frontend/vite build
└── test-form.html                  # ATS / Workday simulation form with live DOM event stream
```

---

## 2. Quickstart & Installation

### A. Backend Setup (FastAPI + Nebius Token Factory)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install required packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure your Nebius API Key in `.env`:
   ```bash
   cp .env.example .env
   # Edit .env and insert your real Nebius Token Factory API key:
   # NEBIUS_API_KEY=your_key_here
   ```
   *(Get your key at [https://studio.nebius.ai/](https://studio.nebius.ai/))*

5. Run unit tests to verify:
   ```bash
   python -m unittest test_backend.py
   ```

6. Start the FastAPI server on port 8000:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   - Health check: `http://localhost:8000/api/health`
   - Interactive Swagger API docs: `http://localhost:8000/docs`

---

### B. Frontend Build (React Side Panel)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the UI into the Chrome extension directory (`../extension/dist`):
   ```bash
   npm run build
   ```

   *(Optional: To run standalone during UI prototyping)*
   ```bash
   npm run dev
   ```

---

### C. Load Chrome Extension in Browser

1. Open Google Chrome, Chromium, or Brave and navigate to:
   ```text
   chrome://extensions
   ```
2. Enable **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `extension/` folder from this repository.
5. Click the OmniForm AI icon in the Chrome toolbar to open the **Side Panel**.

---

## 3. Testing with the Demo Test Bench

Open `test-form.html` in your browser (e.g. `file:///.../test-form.html` or via a local static server):

1. **Ingest CV**: In the OmniForm AI side panel, go to **Upload CV** and drag & drop a PDF or text resume.
   - The backend sends the text to `Qwen/Qwen2.5-72B-Instruct` on Nebius.
   - The extracted structured profile is automatically saved to `chrome.storage.local`.
2. **Review Profile**: Switch to the **Profile** tab to inspect, edit, add, or delete key-value pairs.
3. **Autofill Current Page**: Click the sticky **Autofill Current Page** button.
   - `background.js` requests field extraction from `content.js`.
   - `meta-llama/Llama-3.3-70B-Instruct` matches your profile data to the form inputs.
   - `content.js` populates the fields using prototype property setters and dispatches synthetic `input`, `change`, and `blur` events so React/Vue/Workday register changes.
   - Filled fields highlight in soft green (`#e8f5e9`).
   - The event counters on `test-form.html` update in real time!
4. **Self-Learning Verification**:
   - Manually type into the unmapped "Desired Annual Salary" input on `test-form.html`.
   - On change/blur, `content.js` intercepts the change event and transmits `LEARN_NEW_FIELD` to `background.js`.
   - Check the **Learned** tab in the side panel—your newly typed value will appear saved!

---

## 4. Integration with Lovable UI

If you want to use **Lovable** to style or modify the side panel:
1. Prompt Lovable: *"Build a React dashboard for a Chrome Extension side-panel with a file upload area and a key-value grid for profile data."*
2. Replace `frontend/src/App.jsx` with the code provided by Lovable.
3. Re-run `npm run build` in `/frontend`.
4. Reload the extension in `chrome://extensions`.

---

## 5. Privacy & Security

- **Strict Local Storage**: All personal profile data and learned attributes are saved exclusively in `chrome.storage.local`.
- **Direct AI Inference**: Document parsing and field mapping are routed directly through your private Nebius Token Factory endpoint (`https://api.studio.nebius.ai/v1/`).
- **No Third-Party Telemetry**: Zero intermediate databases or tracking servers.
