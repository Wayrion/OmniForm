import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  RefreshCw,
  Search,
  Download,
  Upload,
  Brain,
  Layers,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  getStoredProfile,
  saveStoredProfile,
  subscribeToProfileUpdates,
} from './utils/storage';
import {
  checkBackendHealth,
  uploadAndIngestDocument,
  requestAutofill,
} from './utils/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'upload' | 'learned'
  const [userProfile, setUserProfile] = useState({});
  const [backendStatus, setBackendStatus] = useState({ online: false, checking: true });
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Autofill state
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillResult, setAutofillResult] = useState(null);

  // Add / Edit field state
  const [isAddingField, setIsAddingField] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  // 1. Initial load & sync with storage
  useEffect(() => {
    async function loadData() {
      const profile = await getStoredProfile();
      setUserProfile(profile || {});
    }
    loadData();

    const unsubscribe = subscribeToProfileUpdates((updated) => {
      setUserProfile(updated || {});
    });

    return () => unsubscribe();
  }, []);

  // 2. Health check interval
  useEffect(() => {
    async function pingBackend() {
      const res = await checkBackendHealth();
      setBackendStatus({ online: res.online, ...res, checking: false });
    }
    pingBackend();
    const interval = setInterval(pingBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  // Save profile helper
  const updateProfile = async (newProfile) => {
    setUserProfile(newProfile);
    await saveStoredProfile(newProfile);
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileSelected = (file) => {
    const validExtensions = ['.pdf', '.txt'];
    const hasValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidExt) {
      setUploadError('Please select a valid PDF (.pdf) or text (.txt) file.');
      return;
    }

    setUploadError(null);
    setSelectedFile(file);
    // Automatically trigger upload on drop/select
    processFileUpload(file);
  };

  const processFileUpload = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const extractedData = await uploadAndIngestDocument(file);
      // Merge with existing profile data while prioritizing newly extracted fields
      const merged = { ...userProfile, ...extractedData };
      await updateProfile(merged);
      setIsUploading(false);
      setSelectedFile(null);
      setActiveTab('profile');
      setAutofillResult({
        success: true,
        message: 'Resume parsed successfully via Qwen 2.5 72B!',
      });
      setTimeout(() => setAutofillResult(null), 5000);
    } catch (err) {
      setIsUploading(false);
      setUploadError(err.message || 'Failed to ingest document.');
    }
  };

  // Autofill trigger handler
  const handleAutofill = async () => {
    setIsAutofilling(true);
    setAutofillResult(null);

    try {
      const res = await requestAutofill();
      setIsAutofilling(false);
      setAutofillResult({
        success: true,
        message: `Autofill complete! Filled ${res.count || 0} fields on the current page.`,
      });
      setTimeout(() => setAutofillResult(null), 6000);
    } catch (err) {
      setIsAutofilling(false);
      setAutofillResult({
        success: false,
        message: err.message || 'Failed to autofill page.',
      });
      setTimeout(() => setAutofillResult(null), 7000);
    }
  };

  // Add field handler
  const handleAddField = async (e) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    const updated = {
      ...userProfile,
      [newKey.trim()]: newValue.trim(),
    };
    await updateProfile(updated);
    setNewKey('');
    setNewValue('');
    setIsAddingField(false);
  };

  // Delete field handler
  const handleDeleteField = async (keyToDelete) => {
    const updated = { ...userProfile };
    delete updated[keyToDelete];
    if (updated.learnedFields && updated.learnedFields[keyToDelete]) {
      delete updated.learnedFields[keyToDelete];
    }
    await updateProfile(updated);
  };

  // Save edited field handler
  const handleSaveEdit = async (key) => {
    let parsedValue = editValue;
    // If user edited JSON string for nested object, attempt to parse
    if (typeof userProfile[key] === 'object') {
      try {
        parsedValue = JSON.parse(editValue);
      } catch (e) {
        // Keep as raw text if not valid json
      }
    }

    const updated = {
      ...userProfile,
      [key]: parsedValue,
    };
    await updateProfile(updated);
    setEditingKey(null);
  };

  // Export profile JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(userProfile, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'omniform-user-profile.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import profile JSON
  const handleImportJSON = (e) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (typeof parsed === 'object') {
            await updateProfile(parsed);
          }
        } catch (err) {
          alert('Invalid JSON file format.');
        }
      };
    }
  };

  // Filter keys for display
  const profileEntries = Object.entries(userProfile).filter(([k]) => {
    if (k === 'learnedFields') return false; // Rendered in dedicated tab
    if (!searchQuery) return true;
    return k.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(userProfile[k]).toLowerCase().includes(searchQuery.toLowerCase());
  });

  const learnedEntries = Object.entries(userProfile.learnedFields || {}).filter(([k]) => {
    if (!searchQuery) return true;
    return k.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(userProfile.learnedFields[k]).toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-sm ring-1 ring-emerald-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-semibold text-slate-900 text-sm tracking-tight">OmniForm AI</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Nebius 2.5
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-none mt-0.5">Self-Learning Autofiller</p>
            </div>
          </div>

          {/* Backend Status indicator */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
                backendStatus.online
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={
                backendStatus.online
                  ? 'FastAPI & Nebius Ready'
                  : `Backend offline (${backendStatus.error || 'Port 8000 unreachable'})`
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus.online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="text-[11px]">
                {backendStatus.online ? 'Backend Live' : 'Backend Offline'}
              </span>
            </div>

            <button
              onClick={async () => {
                setBackendStatus((prev) => ({ ...prev, checking: true }));
                const res = await checkBackendHealth();
                setBackendStatus({ online: res.online, ...res, checking: false });
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Refresh connection status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${backendStatus.checking ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-3 border-t border-slate-100 pt-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'profile'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Profile</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 ml-1">
              {profileEntries.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'upload'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload CV</span>
          </button>

          <button
            onClick={() => setActiveTab('learned')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'learned'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Learned</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 ml-1">
              {learnedEntries.length}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-3 pb-24 overflow-y-auto">
        {/* Autofill or Ingestion Result Notification */}
        {autofillResult && (
          <div
            className={`mb-3 p-3 rounded-lg flex items-start gap-2.5 text-xs border ${
              autofillResult.success
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            {autofillResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{autofillResult.message}</div>
            <button
              onClick={() => setAutofillResult(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* -------------------- TAB 1: UPLOAD VIEW -------------------- */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-sm font-semibold text-slate-800">Resume / Document Ingestion</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Processed locally via Nebius Token Factory (Qwen 2.5 72B)
              </p>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/60 scale-[0.99]'
                  : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-100/50 bg-white'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
              />

              <div className="w-12 h-12 rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>

              <p className="text-xs font-semibold text-slate-700">
                {isDragging ? 'Drop file to upload' : 'Click to select or drag and drop'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports PDF or TXT resumes (Max 10MB)
              </p>

              <div className="flex gap-2 mt-3">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  PDF
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  CV / Resume
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Plain Text
                </span>
              </div>
            </div>

            {/* Uploading progress indicator */}
            {isUploading && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
                <div>
                  <p className="text-xs font-semibold text-emerald-900">
                    Extracting structured profile...
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Querying Qwen/Qwen2.5-72B-Instruct on Nebius Token Factory
                  </p>
                </div>
              </div>
            )}

            {/* Upload Error */}
            {uploadError && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{uploadError}</div>
              </div>
            )}

            {/* Privacy & Engine info box */}
            <div className="bg-slate-100/70 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                Local & Private Execution
              </p>
              <p>
                Extracted data is stored exclusively in your browser's local storage (<code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">chrome.storage.local</code>). No centralized database retains your personal information.
              </p>
            </div>
          </div>
        )}

        {/* -------------------- TAB 2: PROFILE VIEW -------------------- */}
        {activeTab === 'profile' && (
          <div className="space-y-3">
            {/* Search and Action Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search profile fields..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setIsAddingField(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {/* Quick Actions (Export / Import / Clear) */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>{profileEntries.length} attributes stored</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportJSON}
                  className="flex items-center gap-1 hover:text-slate-700 transition"
                  title="Export profile JSON"
                >
                  <Download className="w-3 h-3" />
                  <span>Export</span>
                </button>
                <span>•</span>
                <label className="flex items-center gap-1 hover:text-slate-700 transition cursor-pointer">
                  <Upload className="w-3 h-3" />
                  <span>Import</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportJSON}
                  />
                </label>
                <span>•</span>
                <button
                  onClick={async () => {
                    if (confirm('Clear all stored profile data?')) {
                      await updateProfile({});
                    }
                  }}
                  className="hover:text-rose-600 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Add Field Inline Form */}
            {isAddingField && (
              <form
                onSubmit={handleAddField}
                className="bg-white border border-emerald-200 rounded-xl p-3 shadow-xs space-y-2 animate-in fade-in"
              >
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-800">Add Profile Field</span>
                  <button
                    type="button"
                    onClick={() => setIsAddingField(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Field Key / Label</label>
                  <input
                    type="text"
                    placeholder="e.g. LinkedIn, GitHub, Years of Experience"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Value</label>
                  <textarea
                    rows={2}
                    placeholder="Enter field value or description..."
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                    required
                  />
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingField(false)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs"
                  >
                    Save Field
                  </button>
                </div>
              </form>
            )}

            {/* Profile Fields List */}
            {profileEntries.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">No profile data yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Upload your CV or add custom fields to start autofilling.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Resume</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {profileEntries.map(([key, value]) => {
                  const isEditing = editingKey === key;
                  const isObject = typeof value === 'object' && value !== null;
                  const displayValue = isObject ? JSON.stringify(value, null, 2) : String(value);

                  return (
                    <div
                      key={key}
                      className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs hover:border-slate-300 transition group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 tracking-tight capitalize">
                          {key.replace(/[_-]/g, ' ')}
                        </span>
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                          {!isEditing ? (
                            <>
                              <button
                                onClick={() => {
                                  setEditingKey(key);
                                  setEditValue(displayValue);
                                }}
                                className="p-1 text-slate-400 hover:text-emerald-600 rounded transition"
                                title="Edit value"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteField(key)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                title="Delete field"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleSaveEdit(key)}
                                className="p-1 text-emerald-600 hover:text-emerald-700 rounded transition"
                                title="Save changes"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingKey(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Value Display / Editor */}
                      <div className="mt-1.5">
                        {isEditing ? (
                          <textarea
                            rows={isObject ? 4 : 2}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full text-xs font-mono p-2 bg-slate-50 border border-emerald-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
                          />
                        ) : isObject ? (
                          <pre className="text-[11px] font-mono bg-slate-50 p-2 rounded-md border border-slate-100 overflow-x-auto text-slate-700 whitespace-pre-wrap">
                            {displayValue}
                          </pre>
                        ) : (
                          <p className="text-xs text-slate-600 break-words leading-relaxed select-text">
                            {displayValue}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* -------------------- TAB 3: LEARNED FIELDS VIEW -------------------- */}
        {activeTab === 'learned' && (
          <div className="space-y-3">
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Brain className="w-4 h-4 text-emerald-600" />
                <span>Self-Learning Agent Active</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Whenever you manually fill in missing fields across job boards (Workday, Greenhouse, Lever), OmniForm AI observes your input and saves it here for future applications.
              </p>
            </div>

            {learnedEntries.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <Brain className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">No learned fields yet</p>
                <p className="text-[11px] text-slate-500">
                  Fill in any form on any website, and OmniForm AI will automatically learn and record the values!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {learnedEntries.map(([label, value]) => (
                  <div
                    key={label}
                    className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex items-start justify-between gap-3 group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-xs font-semibold text-slate-900">{label}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 select-text break-words">
                        {String(value)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteField(label)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition"
                      title="Remove learned attribute"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sticky Bottom Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur border-t border-slate-200 shadow-lg z-40">
        <button
          onClick={handleAutofill}
          disabled={isAutofilling}
          className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition ${
            isAutofilling
              ? 'bg-emerald-400 text-white cursor-wait'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.99]'
          }`}
        >
          {isAutofilling ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Matching & Filling via Llama 3.3 70B...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 fill-white" />
              <span>Autofill Current Page</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
}

