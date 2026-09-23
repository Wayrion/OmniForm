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
  ChevronRight,
  ChevronUp,
  Database,
  CreditCard,
  Gift,
  Users,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Percent,
  Clock,
  ArrowRight,
  Globe,
  Coins,
  Star,
  Info,
} from 'lucide-react';
import {
  getStoredProfile,
  saveStoredProfile,
  subscribeToProfileUpdates,
  getStoredCache,
  saveStoredCache,
  evictSiteCache,
  clearAllCache,
  subscribeToCacheUpdates,
  getActiveTabInfo,
  getStoredSubscription,
  saveStoredSubscription,
  subscribeToSubscriptionUpdates,
  DEFAULT_SUBSCRIPTION,
} from './utils/storage';
import {
  checkBackendHealth,
  uploadAndIngestDocument,
  requestAutofill,
} from './utils/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'upload' | 'learned' | 'cache' | 'plans'
  const [userProfile, setUserProfile] = useState({});
  const [backendStatus, setBackendStatus] = useState({ online: false, checking: true });
  const [searchQuery, setSearchQuery] = useState('');

  // Cache state
  const [siteCache, setSiteCache] = useState({});
  const [activeTabInfo, setActiveTabInfo] = useState({ url: '', title: '', siteKey: '' });
  const [cacheSearchQuery, setCacheSearchQuery] = useState('');
  const [expandedCacheKeys, setExpandedCacheKeys] = useState(new Set());

  // Subscription & Referral state
  const [subscription, setSubscription] = useState(DEFAULT_SUBSCRIPTION);
  const [selectedPaygPack, setSelectedPaygPack] = useState('100'); // '20' | '100' | '300'
  const [billingCadence, setBillingCadence] = useState('monthly'); // 'monthly' | 'manual_discount'
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [planFeedback, setPlanFeedback] = useState(null);

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
      const cache = await getStoredCache();
      setSiteCache(cache || {});
      const sub = await getStoredSubscription();
      setSubscription(sub || DEFAULT_SUBSCRIPTION);
      const tabInfo = await getActiveTabInfo();
      setActiveTabInfo(tabInfo);
    }
    loadData();

    const unsubProfile = subscribeToProfileUpdates((updated) => {
      setUserProfile(updated || {});
    });
    const unsubCache = subscribeToCacheUpdates((updated) => {
      setSiteCache(updated || {});
    });
    const unsubSub = subscribeToSubscriptionUpdates((updated) => {
      setSubscription(updated || DEFAULT_SUBSCRIPTION);
    });

    return () => {
      unsubProfile();
      unsubCache();
      unsubSub();
    };
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

  // Periodic active tab check
  useEffect(() => {
    async function refreshTab() {
      const tabInfo = await getActiveTabInfo();
      setActiveTabInfo(tabInfo);
    }
    refreshTab();
    const interval = setInterval(refreshTab, 5000);
    return () => clearInterval(interval);
  }, []);

  // Save profile helper
  const updateProfile = async (newProfile) => {
    setUserProfile(newProfile);
    await saveStoredProfile(newProfile);
  };

  // Cache eviction handlers
  const handleEvictSite = async (siteKey) => {
    await evictSiteCache(siteKey);
    const updated = { ...siteCache };
    delete updated[siteKey];
    setSiteCache(updated);
    setAutofillResult({
      success: true,
      message: `Evicted cache for ${siteKey.length > 35 ? siteKey.slice(0, 35) + '...' : siteKey}`,
    });
    setTimeout(() => setAutofillResult(null), 4000);
  };

  const handleClearAllCache = async () => {
    if (window.confirm("Are you sure you want to clear all cached website mappings?")) {
      await clearAllCache();
      setSiteCache({});
      setAutofillResult({
        success: true,
        message: "All website autofill cache cleared.",
      });
      setTimeout(() => setAutofillResult(null), 4000);
    }
  };

  const toggleExpandCache = (key) => {
    setExpandedCacheKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Subscription & Referral handlers
  const handleBuyCredits = async (amount, price) => {
    const newCredits = (subscription.credits || 0) + amount;
    const updatedSub = {
      ...subscription,
      credits: newCredits,
      isPayingCustomer: true,
    };
    setSubscription(updatedSub);
    await saveStoredSubscription(updatedSub);
    setPlanFeedback({
      type: 'success',
      message: `🎉 Successfully purchased +${amount} Form Credits for $${price}!`,
    });
    setTimeout(() => setPlanFeedback(null), 5000);
  };

  const handleUpgradePro = async (cadence) => {
    const updatedSub = {
      ...subscription,
      plan: 'pro',
      billingCycle: cadence,
      isPayingCustomer: true,
    };
    setSubscription(updatedSub);
    await saveStoredSubscription(updatedSub);
    setPlanFeedback({
      type: 'success',
      message: cadence === 'manual_discount'
        ? '⚡ Pro Activated with 30% Manual Discount ($8.40/mo)! Unlimited forms unlocked.'
        : '⚡ Pro Monthly Activated ($12.00/mo)! Unlimited forms unlocked.',
    });
    setTimeout(() => setPlanFeedback(null), 5000);
  };

  const handleCopyReferral = () => {
    const refUrl = `https://omniform.ai/invite/${subscription.referralCode || 'OMNI-789X'}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(refUrl);
    }
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2500);
  };

  const handleSimulateReferral = async () => {
    const isPaying = subscription.isPayingCustomer || subscription.plan === 'pro';
    const bonusCredits = isPaying ? 250 : 10;
    const newCredits = (subscription.credits || 0) + bonusCredits;
    const currentStats = subscription.referralStats || DEFAULT_SUBSCRIPTION.referralStats;

    const newStats = {
      friendsInvited: (currentStats.friendsInvited || 0) + 1,
      freeFormsEarned: isPaying
        ? (currentStats.freeFormsEarned || 0)
        : (currentStats.freeFormsEarned || 0) + 10,
      payingReferrals: isPaying
        ? (currentStats.payingReferrals || 0) + 1
        : (currentStats.payingReferrals || 0),
      bonusCreditsEarned: (currentStats.bonusCreditsEarned || 0) + bonusCredits,
    };

    const updatedSub = {
      ...subscription,
      credits: newCredits,
      referralStats: newStats,
    };
    setSubscription(updatedSub);
    await saveStoredSubscription(updatedSub);

    setPlanFeedback({
      type: 'success',
      message: isPaying
        ? `🎁 Paying customer referral simulated! Credited +${bonusCredits} AI credits.`
        : `🎁 Friend referral simulated! Credited +${bonusCredits} Free Form Credits.`,
    });
    setTimeout(() => setPlanFeedback(null), 5000);
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
    processFileUpload(file);
  };

  const processFileUpload = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const extractedData = await uploadAndIngestDocument(file);
      const merged = { ...userProfile, ...extractedData };
      await updateProfile(merged);
      setIsUploading(false);
      setSelectedFile(null);
      setActiveTab('profile');
      setAutofillResult({
        success: true,
        message: 'Resume parsed successfully via DeepSeek V4.1 Flash!',
      });
      setTimeout(() => setAutofillResult(null), 5000);
    } catch (err) {
      setIsUploading(false);
      setUploadError(err.message || 'Failed to ingest document.');
    }
  };

  // Autofill trigger handler with caching & credit deduction
  const handleAutofill = async (forceRefresh = false) => {
    const isPro = subscription.plan === 'pro';
    const siteKey = activeTabInfo.siteKey;
    const isCached = !forceRefresh && Boolean(siteKey && siteCache[siteKey]);

    // Check credits if not Pro and not using cache
    if (!isPro && !isCached && (subscription.credits || 0) <= 0) {
      setActiveTab('plans');
      setPlanFeedback({
        type: 'error',
        message: 'Out of form credits! Top up with PAYG or Upgrade to Pro to continue autofilling.',
      });
      return;
    }

    setIsAutofilling(true);
    setAutofillResult(null);

    try {
      const res = await requestAutofill({ forceRefresh });
      setIsAutofilling(false);

      // Deduct 1 credit if not from cache and not Pro
      if (!res.fromCache && !isPro) {
        const newCredits = Math.max(0, (subscription.credits || 0) - 1);
        const updatedSub = { ...subscription, credits: newCredits };
        setSubscription(updatedSub);
        await saveStoredSubscription(updatedSub);
      }

      setAutofillResult({
        success: true,
        fromCache: res.fromCache,
        message: res.fromCache
          ? `⚡ Instant Fill from Cache! Restored ${res.count || 0} fields (0 credits used).`
          : `Autofill complete! Filled ${res.count || 0} fields via Nebius AI (${isPro ? 'Unlimited' : '1 credit used'}).`,
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
        <div className="flex items-center gap-1 mt-3 border-t border-slate-100 pt-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 min-w-[62px] flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded-md transition ${
              activeTab === 'profile'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3 h-3 shrink-0" />
            <span>Profile</span>
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-slate-200 text-slate-700 ml-0.5">
              {profileEntries.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 min-w-[55px] flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded-md transition ${
              activeTab === 'upload'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UploadCloud className="w-3 h-3 shrink-0" />
            <span>Upload</span>
          </button>

          <button
            onClick={() => setActiveTab('learned')}
            className={`flex-1 min-w-[65px] flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded-md transition ${
              activeTab === 'learned'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Brain className="w-3 h-3 shrink-0" />
            <span>Learned</span>
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-slate-200 text-slate-700 ml-0.5">
              {learnedEntries.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('cache')}
            className={`flex-1 min-w-[58px] flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded-md transition ${
              activeTab === 'cache'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Database className="w-3 h-3 shrink-0" />
            <span>Cache</span>
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-slate-200 text-slate-700 ml-0.5">
              {Object.keys(siteCache).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            className={`flex-1 min-w-[55px] flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded-md transition ${
              activeTab === 'plans'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CreditCard className="w-3 h-3 shrink-0" />
            <span>Plans</span>
            <span
              className={`text-[9px] px-1 py-0.2 rounded-full ml-0.5 ${
                subscription.plan === 'pro'
                  ? 'bg-purple-100 text-purple-700 font-bold'
                  : 'bg-emerald-100 text-emerald-800 font-medium'
              }`}
            >
              {subscription.plan === 'pro' ? 'PRO' : `${subscription.credits || 0}cr`}
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

        {/* Plan / Subscription Feedback Notification */}
        {planFeedback && (
          <div
            className={`mb-3 p-3 rounded-lg flex items-start gap-2.5 text-xs border ${
              planFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            {planFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{planFeedback.message}</div>
            <button
              onClick={() => setPlanFeedback(null)}
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
                Processed locally via Nebius Token Factory (DeepSeek V4.1 Flash)
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
                    Querying deepseek-ai/DeepSeek-V4.1-Flash on Nebius Token Factory
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

        {/* -------------------- TAB 4: CACHE VIEW -------------------- */}
        {activeTab === 'cache' && (
          <div className="space-y-4">
            {/* Header / Intro */}
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Autofill Cache Manager</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Saved website mappings for zero-latency, token-free refills
                  </p>
                </div>
                {Object.keys(siteCache).length > 0 && (
                  <button
                    onClick={handleClearAllCache}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition"
                    title="Clear all saved site mappings"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>
            </div>

            {/* Current Active Tab Website Card */}
            <div className="border rounded-xl p-3.5 shadow-xs transition bg-white border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${activeTabInfo.siteKey && siteCache[activeTabInfo.siteKey] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-900">Current Tab</span>
                      {activeTabInfo.siteKey && siteCache[activeTabInfo.siteKey] ? (
                        <span className="text-[10px] px-1.5 py-0.2 font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          ⚡ Cached ({siteCache[activeTabInfo.siteKey].count || Object.keys(siteCache[activeTabInfo.siteKey].mapping || {}).length} fields)
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Not Cached
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate max-w-[240px] mt-0.5 font-mono" title={activeTabInfo.url || 'No active tab URL'}>
                      {activeTabInfo.url ? (activeTabInfo.url.length > 40 ? activeTabInfo.url.slice(0, 40) + '...' : activeTabInfo.url) : 'No active browser tab detected'}
                    </p>
                  </div>
                </div>

                {activeTabInfo.siteKey && siteCache[activeTabInfo.siteKey] && (
                  <button
                    onClick={() => handleEvictSite(activeTabInfo.siteKey)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition shrink-0"
                    title="Evict cache for this webpage"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Evict Site</span>
                  </button>
                )}
              </div>

              {activeTabInfo.siteKey && siteCache[activeTabInfo.siteKey] ? (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Cached {new Date(siteCache[activeTabInfo.siteKey].timestamp).toLocaleDateString()} at {new Date(siteCache[activeTabInfo.siteKey].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={() => toggleExpandCache(activeTabInfo.siteKey)}
                    className="text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-0.5"
                  >
                    <span>{expandedCacheKeys.has(activeTabInfo.siteKey) ? 'Hide Mapping' : 'Inspect'}</span>
                    {expandedCacheKeys.has(activeTabInfo.siteKey) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                  Click <strong>Autofill Current Page</strong> to map fields with AI. The mappings will be stored here so you never pay or wait for this site again!
                </p>
              )}

              {/* Expandable mapping preview for current tab */}
              {activeTabInfo.siteKey && siteCache[activeTabInfo.siteKey] && expandedCacheKeys.has(activeTabInfo.siteKey) && (
                <div className="mt-2.5 pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cached Key-Value Mappings:</p>
                  <pre className="text-[10px] font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-100 max-h-48 overflow-y-auto text-slate-700 whitespace-pre-wrap">
                    {JSON.stringify(siteCache[activeTabInfo.siteKey].mapping, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Search Filter for Cached Sites */}
            {Object.keys(siteCache).length > 0 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search cached websites..."
                  value={cacheSearchQuery}
                  onChange={(e) => setCacheSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            )}

            {/* List of All Cached Sites */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 px-0.5">
                <span className="font-semibold text-slate-800">All Saved Sites ({Object.keys(siteCache).length})</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 font-medium">
                  Instant Re-fill Active
                </span>
              </div>

              {Object.keys(siteCache).length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                  <Database className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">No websites in cache yet</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    When you autofill any job board or form, OmniForm AI stores the field mappings here.
                  </p>
                </div>
              ) : (
                Object.entries(siteCache)
                  .filter(([key, data]) => {
                    if (!cacheSearchQuery) return true;
                    const q = cacheSearchQuery.toLowerCase();
                    return key.toLowerCase().includes(q) ||
                      (data.title && data.title.toLowerCase().includes(q)) ||
                      (data.hostname && data.hostname.toLowerCase().includes(q));
                  })
                  .map(([key, data]) => {
                    const isExpanded = expandedCacheKeys.has(key);
                    const fieldCount = data.count || Object.keys(data.mapping || {}).length;
                    return (
                      <div
                        key={key}
                        className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2 hover:border-slate-300 transition"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-slate-900 truncate max-w-[180px]">
                                {data.hostname || data.title || 'Website'}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                {fieldCount} fields
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5" title={key}>
                              {key}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleExpandCache(key)}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
                              title={isExpanded ? 'Collapse' : 'Inspect mapping'}
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleEvictSite(key)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="Evict website cache"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-50">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(data.timestamp).toLocaleDateString()} {new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-emerald-600 font-medium">Ready for 0ms refill</span>
                        </div>

                        {/* Expandable JSON / Field viewer */}
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <pre className="text-[10px] font-mono bg-slate-50 p-2 rounded-lg border border-slate-100 max-h-40 overflow-y-auto text-slate-700 whitespace-pre-wrap">
                              {JSON.stringify(data.mapping, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* -------------------- TAB 5: PLANS & REFERRALS VIEW -------------------- */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            {/* Header & User Status */}
            <div>
              <h2 className="text-sm font-semibold text-slate-800">OmniForm AI Plans & Credits</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pay per form, subscribe with discount, or invite friends for free credits
              </p>
            </div>

            {/* Current Balance / Plan Card */}
            <div
              className={`rounded-2xl p-4 text-white shadow-sm transition ${
                subscription.plan === 'pro'
                  ? 'bg-gradient-to-tr from-purple-800 via-indigo-800 to-slate-900 border border-purple-500/30'
                  : 'bg-gradient-to-tr from-emerald-800 via-teal-800 to-slate-900 border border-emerald-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-white/10 backdrop-blur">
                    {subscription.plan === 'pro' ? (
                      <Sparkles className="w-4 h-4 text-amber-300" />
                    ) : (
                      <Coins className="w-4 h-4 text-emerald-300" />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-white/70">Current Status</span>
                    <h3 className="text-sm font-bold text-white">
                      {subscription.plan === 'pro'
                        ? 'Pro Unlimited Subscriber'
                        : `${subscription.credits || 0} Form Credits Available`}
                    </h3>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    subscription.plan === 'pro'
                      ? 'bg-amber-400 text-slate-900'
                      : 'bg-white/20 text-white'
                  }`}
                >
                  {subscription.plan === 'pro' ? 'PRO' : subscription.plan === 'payg' ? 'PAYG' : 'FREE'}
                </span>
              </div>

              <div className="mt-3 pt-2.5 border-t border-white/15 text-[11px] text-white/80 flex items-center justify-between">
                <span>⚡ Cached refills are always <strong>100% FREE</strong></span>
                <span className="text-emerald-300 font-medium">1 credit = 1 form</span>
              </div>
            </div>

            {/* ----------------- OPTION 1: PAYG ----------------- */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Option 1: Pay As You Go</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pay only when you apply. Credits never expire.
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  Pay per form
                </span>
              </div>

              {/* Package cards */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { id: '20', count: 20, price: '1.99', perForm: '$0.10', badge: null },
                  { id: '100', count: 100, price: '6.99', perForm: '$0.07', badge: 'POPULAR' },
                  { id: '300', count: 300, price: '14.99', perForm: '$0.05', badge: 'BEST VALUE' },
                ].map((pack) => {
                  const isSelected = selectedPaygPack === pack.id;
                  return (
                    <div
                      key={pack.id}
                      onClick={() => setSelectedPaygPack(pack.id)}
                      className={`relative cursor-pointer rounded-xl p-2.5 text-center border transition ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      {pack.badge && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-600 text-white uppercase tracking-wider shadow-xs">
                          {pack.badge}
                        </span>
                      )}
                      <div className="text-xs font-bold text-slate-900 mt-0.5">{pack.count} Forms</div>
                      <div className="text-sm font-extrabold text-emerald-700 mt-1">${pack.price}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">{pack.perForm} / form</div>
                    </div>
                  );
                })}
              </div>

              {/* Buy Pack Button */}
              {(() => {
                const currentPack = [
                  { id: '20', count: 20, price: '1.99' },
                  { id: '100', count: 100, price: '6.99' },
                  { id: '300', count: 300, price: '14.99' },
                ].find((p) => p.id === selectedPaygPack) || { count: 100, price: '6.99' };

                return (
                  <button
                    onClick={() => handleBuyCredits(currentPack.count, currentPack.price)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.99] shadow-xs"
                  >
                    <Coins className="w-3.5 h-3.5 text-amber-300" />
                    <span>Top Up +{currentPack.count} Credits (${currentPack.price})</span>
                  </button>
                );
              })()}
            </div>

            {/* ----------------- OPTION 2: PRO SUBSCRIPTION ----------------- */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Option 2: Pro Subscription</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Unlimited form autofilling with manual pay discount
                  </p>
                </div>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                  Unlimited
                </span>
              </div>

              {/* Cadence Toggle: Monthly vs Manual Discount */}
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
                <button
                  onClick={() => setBillingCadence('monthly')}
                  className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition ${
                    billingCadence === 'monthly'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Monthly ($12/mo)
                </button>
                <button
                  onClick={() => setBillingCadence('manual_discount')}
                  className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition flex items-center justify-center gap-1 ${
                    billingCadence === 'manual_discount'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <span>Pay Manually</span>
                  <span className="text-[9px] px-1 py-0.2 rounded-full bg-amber-300 text-slate-900 font-extrabold">
                    -30%
                  </span>
                </button>
              </div>

              {/* Pricing banner based on selected cadence */}
              <div className="bg-purple-50/60 border border-purple-200/80 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-extrabold text-purple-900">
                      {billingCadence === 'manual_discount' ? '$8.40' : '$12.00'}
                    </span>
                    <span className="text-[11px] text-purple-700">/ month</span>
                    {billingCadence === 'manual_discount' && (
                      <span className="text-[10px] text-slate-400 line-through font-normal ml-1">$12.00</span>
                    )}
                  </div>
                  <p className="text-[10px] text-purple-800 mt-0.5">
                    {billingCadence === 'manual_discount'
                      ? 'Billed $50 / 6 months upfront via manual transfer/invoice'
                      : 'Billed monthly, cancel anytime in 1 click'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                    {billingCadence === 'manual_discount' ? 'Save 30%' : 'Standard'}
                  </span>
                </div>
              </div>

              {/* Features checklist */}
              <div className="space-y-1.5 text-[11px] text-slate-600">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span>Unlimited form autofills on all ATS & job portals</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span>Priority Nebius inference (DeepSeek V4.1 & GLM 5.3 Flash)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span>Automatic zero-latency cached re-applications</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span>250 Referral Credits bonus multiplier for paying users</span>
                </div>
              </div>

              {/* Upgrade Button */}
              <button
                onClick={() => handleUpgradePro(billingCadence)}
                disabled={subscription.plan === 'pro'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs ${
                  subscription.plan === 'pro'
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-default'
                    : 'bg-purple-600 hover:bg-purple-700 text-white active:scale-[0.99]'
                }`}
              >
                {subscription.plan === 'pro' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Current Active Subscription</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Upgrade to Pro ({billingCadence === 'manual_discount' ? '$50 manual pay' : '$12/mo'})</span>
                  </>
                )}
              </button>
            </div>

            {/* ----------------- OPTION 3: REFERRAL PROGRAM ----------------- */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Option 3: Referral Program</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Share OmniForm AI and get free forms and AI credits
                  </p>
                </div>
                <Gift className="w-4 h-4 text-amber-500" />
              </div>

              {/* Tiered Rewards Explainer */}
              <div className="space-y-2">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-700 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <Users className="w-3.5 h-3.5 text-slate-600" />
                    <span>Free Tier Users</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Invite a friend: They get 10 free forms, and you get <strong>+10 Free Form Credits</strong> as soon as they install!
                  </p>
                </div>

                <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-2.5 text-[11px] text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Star className="w-3.5 h-3.5 text-amber-600 fill-amber-400" />
                    <span>Paying Customers (PAYG & Pro)</span>
                  </div>
                  <p className="text-[10px] text-amber-900 leading-relaxed">
                    If you are a paying customer, you get <strong>250 Bonus AI Credits + 20% recurring credits</strong> when your referral buys credits or subscribes!
                  </p>
                </div>
              </div>

              {/* Referral Link Box */}
              <div>
                <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Your Referral Link:</label>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={`https://omniform.ai/invite/${subscription.referralCode || 'OMNI-789X'}`}
                    className="flex-1 text-[11px] font-mono px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 select-all"
                  />
                  <button
                    onClick={handleCopyReferral}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition shrink-0 ${
                      copiedReferral
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {copiedReferral ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Referral Stats 4-Grid */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                  <div className="text-xs font-extrabold text-slate-900">{subscription.referralStats?.friendsInvited || 0}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Friends Invited</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                  <div className="text-xs font-extrabold text-emerald-700">{subscription.referralStats?.freeFormsEarned || 0}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Free Forms Earned</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                  <div className="text-xs font-extrabold text-purple-700">{subscription.referralStats?.payingReferrals || 0}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Paying Referrals</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                  <div className="text-xs font-extrabold text-amber-700">{subscription.referralStats?.bonusCreditsEarned || 0}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Bonus Credits</div>
                </div>
              </div>

              {/* Simulate referral for testing */}
              <button
                onClick={handleSimulateReferral}
                className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
              >
                <Gift className="w-3.5 h-3.5 text-amber-600" />
                <span>Simulate Referral Invite (Demo +Credits)</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Sticky Bottom Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur border-t border-slate-200 shadow-lg z-40">
        {(() => {
          const isPro = subscription.plan === 'pro';
          const siteKey = activeTabInfo.siteKey;
          const isCached = Boolean(siteKey && siteCache[siteKey]);
          const noCredits = !isPro && !isCached && (subscription.credits || 0) <= 0;

          return (
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  if (noCredits) {
                    setActiveTab('plans');
                  } else {
                    handleAutofill(false);
                  }
                }}
                disabled={isAutofilling}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition ${
                  isAutofilling
                    ? 'bg-emerald-400 text-white cursor-wait'
                    : noCredits
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : isCached
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.99]'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.99]'
                }`}
              >
                {isAutofilling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Matching & Filling via GLM 5.3 Flash...</span>
                  </>
                ) : noCredits ? (
                  <>
                    <Coins className="w-4 h-4" />
                    <span>0 Credits Remaining • Get More in Plans</span>
                  </>
                ) : isCached ? (
                  <>
                    <Zap className="w-4 h-4 fill-white" />
                    <span>Autofill Current Page ({isPro ? 'Unlimited' : '1 Credit'})</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-white" />
                    <span>Autofill Current Page ({isPro ? 'Unlimited' : '1 Credit'})</span>
                  </>
                )}
              </button>

              {/* Sub-bar showing cache status and force refresh option */}
              {isCached && !isAutofilling && (
                <div className="flex items-center justify-between px-1 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Saved website cache active
                  </span>
                  <button
                    onClick={() => handleAutofill(true)}
                    className="text-slate-500 hover:text-emerald-700 underline font-medium"
                    title="Bypass cache and query Nebius LLM freshly"
                  >
                    ↻ Re-run with AI (1 Credit)
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </footer>
    </div>
  );
}

