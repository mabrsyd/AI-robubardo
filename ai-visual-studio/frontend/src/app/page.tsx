'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Sliders,
  Download,
  RefreshCw,
  Cpu,
  Layers,
  UploadCloud,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shuffle,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface GenerationJob {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  workflowType: 'txt2img' | 'img2img';
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfg: number;
  referenceImage?: string | null;
  comfyPromptId?: string | null;
  errorMessage?: string | null;
  outputFilename?: string | null;
  outputUrl?: string | null;
  progress: number;
  createdAt: string;
  completedAt?: string | null;
}

interface HealthData {
  status: string;
  comfyui: {
    connected: boolean;
    url: string;
    version?: string;
    error?: string;
    devices?: Array<{ name: string; vram_total: number; vram_free: number }>;
    checkpoints?: string[];
  };
  system: {
    targetGpu: string;
    batchLimit: number;
    defaultResolution: string;
  };
  stats: {
    pendingJobs: number;
    recentJobsCount: number;
  };
}

const API_BASE = '';

const PROMPT_PRESETS = [
  {
    label: '✨ Luxury Cosmetic',
    prompt: 'commercial product photography of a luxury minimalist perfume glass bottle on marble pedestal, soft golden hour sunlight, caustics, shallow depth of field, 8k resolution, elegant background',
  },
  {
    label: '👟 Modern Sneaker',
    prompt: 'hero studio product shot of a sleek futuristic running shoe floating in mid-air, dynamic neon rim lighting, dark moody background, high details, ultra-sharp focus',
  },
  {
    label: '☕ Minimalist Coffee',
    prompt: 'aesthetic matte ceramic coffee mug on a rustic oak table beside fresh coffee beans, warm morning daylight through window, clean scandinavian aesthetic, lifestyle marketing photography',
  },
  {
    label: '🧴 Botanical Skincare',
    prompt: 'skincare pump bottle centered with fresh green eucalyptus leaves and soft water droplets, bright airy organic studio aesthetic, crisp commercial advertising shot',
  },
];

export default function AIStudioPage() {
  // System state
  const [health, setHealth] = useState<HealthData | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Workflow state
  const [workflowType, setWorkflowType] = useState<'txt2img' | 'img2img'>('txt2img');
  const [prompt, setPrompt] = useState('commercial product photography of a minimalist glass bottle on marble pedestal, soft studio lighting, sharp focus, 8k quality');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted, extra limbs, poorly drawn, artifacts, watermark, lowres, oversaturated');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Parameters (optimized for RTX 2050 4GB)
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [seed, setSeed] = useState(42);
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [steps, setSteps] = useState(20);
  const [cfg, setCfg] = useState(7.0);

  // Reference image state
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [uploadedReferenceFilename, setUploadedReferenceFilename] = useState<string | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Jobs state
  const [activeJob, setActiveJob] = useState<GenerationJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<GenerationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Fetch system health
  const checkHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  // Fetch recent jobs
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs`);
      if (res.ok) {
        const data = await res.json();
        setRecentJobs(data.jobs || []);
        if (data.jobs && data.jobs.length > 0 && !selectedJob && !activeJob) {
          const completed = data.jobs.find((j: GenerationJob) => j.status === 'COMPLETED');
          if (completed) setSelectedJob(completed);
        }
      }
    } catch {
      // ignore
    }
  }, [activeJob, selectedJob]);

  // Initial load
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1000000));
    checkHealth();
    fetchJobs();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [checkHealth, fetchJobs]);

  // Poll active job status
  useEffect(() => {
    if (!activeJob || activeJob.status === 'COMPLETED' || activeJob.status === 'FAILED' || activeJob.status === 'CANCELLED') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/jobs/${activeJob.id}`);
        if (res.ok) {
          const data = await res.json();
          const current: GenerationJob = data.job;
          setActiveJob(current);

          if (current.status === 'COMPLETED') {
            setSelectedJob(current);
            fetchJobs();
          } else if (current.status === 'FAILED') {
            setErrorBanner(`Generation Failed: ${current.errorMessage || 'Unknown error'}`);
            fetchJobs();
          }
        }
      } catch (err: any) {
        console.error('Polling error:', err);
      }
    }, 1500);

    return () => clearInterval(pollInterval);
  }, [activeJob, fetchJobs]);

  // Handle reference image selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReferenceFile(file);
    const objectUrl = URL.createObjectURL(file);
    setReferencePreview(objectUrl);

    // Auto upload to backend
    setIsUploadingRef(true);
    try {
      const formData = new FormData();
      formData.append('referenceImage', file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.filename) {
        setUploadedReferenceFilename(data.filename);
        setWorkflowType('img2img');
      } else {
        setErrorBanner(data.error || 'Failed to upload image');
      }
    } catch {
      setErrorBanner('Failed to upload reference image to server');
    } finally {
      setIsUploadingRef(false);
    }
  };

  const removeReferenceImage = () => {
    setReferenceFile(null);
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferencePreview(null);
    setUploadedReferenceFilename(null);
    setWorkflowType('txt2img');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit Generation
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorBanner('Please enter a prompt');
      return;
    }

    setErrorBanner(null);
    setIsSubmitting(true);

    const currentSeed = randomizeSeed ? Math.floor(Math.random() * 2147483647) : seed;
    if (randomizeSeed) setSeed(currentSeed);

    try {
      const payload = {
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        width,
        height,
        seed: currentSeed,
        steps,
        cfg,
        workflowType,
        referenceImage: uploadedReferenceFilename,
      };

      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.job) {
        setActiveJob(data.job);
        setSelectedJob(null);
        fetchJobs();
      } else {
        setErrorBanner(data.error || 'Failed to submit generation');
      }
    } catch {
      setErrorBanner('Could not reach backend API. Check if Express server is running on port 3001.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel generation
  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await fetch(`${API_BASE}/api/jobs/${activeJob.id}/cancel`, { method: 'POST' });
      setActiveJob(null);
      fetchJobs();
    } catch {
      // ignore
    }
  };

  const isComfyConnected = health?.comfyui?.connected === true;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                AI Visual Studio
              </h1>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                RTX 2050 Local
              </span>
            </div>
            <p className="text-xs text-slate-400">Affiliate Product Generator</p>
          </div>
        </div>

        {/* System & ComfyUI Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300 font-mono">RTX 2050 (4GB)</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-mono">Batch: 1</span>
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              isComfyConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isComfyConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>ComfyUI: {isComfyConnected ? 'Ready (8188)' : 'Offline / Standby'}</span>
            <button
              onClick={checkHealth}
              disabled={checkingHealth}
              title="Refresh ComfyUI Connection"
              className="ml-1 p-0.5 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${checkingHealth ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Error / Warning Alert Banner */}
      {errorBanner && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2.5 text-rose-200 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="p-1 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 lg:p-6 max-w-7xl mx-auto w-full">
        {/* Left Control Panel: 5 columns on large screen */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          {/* Workflow Selector Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4.5 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Pipeline Workflow
              </label>
              <span className="text-[11px] text-slate-500">Milestone 1</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWorkflowType('txt2img')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all ${
                  workflowType === 'txt2img'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                Text → Image
              </button>
              <button
                type="button"
                onClick={() => setWorkflowType('img2img')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all ${
                  workflowType === 'img2img'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                Product Ref → Scene
              </button>
            </div>
          </div>

          {/* Product Reference Upload (Phase 7 ready) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4.5 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                Product Reference Image
              </label>
              {referencePreview && (
                <button
                  type="button"
                  onClick={removeReferenceImage}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              )}
            </div>

            {referencePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 aspect-video flex items-center justify-center">
                <img
                  src={referencePreview}
                  alt="Reference Product"
                  className="max-h-full object-contain"
                />
                {isUploadingRef && (
                  <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-xs text-indigo-300">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Uploading to studio...
                  </div>
                )}
                {uploadedReferenceFilename && !isUploadingRef && (
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-700/60 text-[10px] text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Ready
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/50 rounded-xl p-4 text-center cursor-pointer transition-all"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <UploadCloud className="w-7 h-7 text-slate-500 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-300">
                  Click or drop product photo here
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  PNG, JPG, WebP (Max 15MB)
                </p>
              </div>
            )}
          </div>

          {/* Prompt Section Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4.5 backdrop-blur-sm shadow-xl flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Prompt
                </label>
                <span className="text-[11px] text-slate-500">Commercial scene</span>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Describe product placement, scene, lighting, atmosphere..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none font-sans"
              />
            </div>

            {/* Quick Inspiration Presets */}
            <div>
              <span className="text-[11px] text-slate-500 block mb-1.5">Quick Inspiration:</span>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(preset.prompt)}
                    className="text-[11px] bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Negative Prompt (Collapsible) */}
            <div className="border-t border-slate-800/80 pt-2.5">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Advanced Settings & Negative Prompt
                </span>
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showAdvanced && (
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Negative Prompt
                    </label>
                    <textarea
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Steps</span>
                        <span className="font-mono text-indigo-400">{steps}</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={30}
                        step={1}
                        value={steps}
                        onChange={(e) => setSteps(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>CFG Scale</span>
                        <span className="font-mono text-indigo-400">{cfg.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={12}
                        step={0.5}
                        value={cfg}
                        onChange={(e) => setCfg(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dimensions & Seed Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4.5 backdrop-blur-sm shadow-xl flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                Aspect Ratio (RTX 2050 Safe)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setWidth(512); setHeight(512); }}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                    width === 512 && height === 512
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold">1:1</div>
                  <div className="text-[10px] text-slate-500">512 × 512</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setWidth(512); setHeight(768); }}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                    width === 512 && height === 768
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold">9:16</div>
                  <div className="text-[10px] text-slate-500">512 × 768 (Reels)</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setWidth(768); setHeight(512); }}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                    width === 768 && height === 512
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold">16:9</div>
                  <div className="text-[10px] text-slate-500">768 × 512</div>
                </button>
              </div>
            </div>

            {/* Seed Controller */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Seed:</span>
                <input
                  type="number"
                  value={seed}
                  disabled={randomizeSeed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono disabled:opacity-50"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={randomizeSeed}
                  onChange={(e) => setRandomizeSeed(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
                Randomize
              </label>
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            id="generate-button"
            onClick={handleGenerate}
            disabled={isSubmitting || (activeJob !== null && (activeJob.status === 'QUEUED' || activeJob.status === 'PROCESSING'))}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            {isSubmitting || (activeJob && (activeJob.status === 'QUEUED' || activeJob.status === 'PROCESSING')) ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Generating visual ({activeJob?.progress ?? 0}%)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4.5 h-4.5" />
                <span>GENERATE PRODUCT VISUAL</span>
              </>
            )}
          </button>
        </section>

        {/* Right Stage & Canvas: 7 columns on large screen */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          {/* Main Visual Display Stage */}
          <div className="rounded-3xl border border-slate-800/90 bg-slate-900/50 backdrop-blur-md p-5 flex flex-col min-h-[460px] shadow-2xl relative overflow-hidden">
            {/* Stage Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Generation Stage
                </span>
              </div>

              {/* Status Badge */}
              {activeJob && (activeJob.status === 'QUEUED' || activeJob.status === 'PROCESSING') ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-300 animate-pulse">
                    <Clock className="w-3.5 h-3.5" />
                    {activeJob.status} ({activeJob.progress}%)
                  </span>
                  <button
                    onClick={handleCancelJob}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded border border-rose-800/50 hover:bg-rose-950/40 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : selectedJob?.status === 'COMPLETED' ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  COMPLETED
                </span>
              ) : selectedJob?.status === 'FAILED' ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  FAILED
                </span>
              ) : selectedJob?.status === 'CANCELLED' ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-400">
                  CANCELLED
                </span>
              ) : (
                <span className="text-xs text-slate-500">Ready</span>
              )}
            </div>

            {/* Stage Body */}
            <div className="flex-1 flex flex-col items-center justify-center relative rounded-2xl bg-slate-950/60 border border-slate-800/60 overflow-hidden p-3">
              {activeJob && (activeJob.status === 'QUEUED' || activeJob.status === 'PROCESSING') ? (
                // Active Processing State
                <div className="flex flex-col items-center justify-center max-w-sm text-center p-6 gap-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center glow-active">
                      <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">
                      {activeJob.status === 'QUEUED' ? 'Queued in Sequential Pipeline' : 'Rendering with ComfyUI...'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Optimized for NVIDIA RTX 2050 (4GB VRAM)
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, activeJob.progress)}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-500 italic max-w-xs truncate">
                    &quot;{activeJob.prompt}&quot;
                  </p>
                </div>
              ) : selectedJob && selectedJob.status === 'FAILED' ? (
                // Failed Job Error Display
                <div className="flex flex-col items-center justify-center max-w-md text-center p-6 gap-3.5">
                  <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-rose-300 mb-1">
                      Generation Failed
                    </h3>
                    <p className="text-xs text-rose-200/80 bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 text-left font-mono break-words">
                      {selectedJob.errorMessage || 'Unknown error occurred during generation'}
                    </p>
                  </div>
                  <div className="text-[11px] text-slate-400 text-left bg-slate-900/80 border border-slate-800 rounded-xl p-3 w-full">
                    <strong className="text-slate-300 block mb-1">💡 Solusi:</strong>
                    {selectedJob.errorMessage?.includes('ComfyUI') ? (
                      <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                        <li>Pastikan ComfyUI aktif di <code className="text-indigo-400">http://127.0.0.1:8188</code></li>
                        <li>Jalankan di terminal: <code className="text-indigo-400">python main.py --listen 127.0.0.1 --port 8188 --lowvram</code></li>
                        <li>Atau gunakan fallback mode dengan klik <strong>Generate</strong> lagi (backend otomatis memproses via mock pipeline).</li>
                      </ul>
                    ) : (
                      <span>Periksa kembali parameter prompt atau restart backend.</span>
                    )}
                  </div>
                </div>
              ) : selectedJob && selectedJob.outputFilename ? (
                // Completed Image Output
                <div className="flex flex-col items-center justify-center w-full h-full gap-4">
                  <div className="relative max-h-[420px] max-w-full rounded-xl overflow-hidden border border-slate-800 shadow-2xl group">
                    <img
                      src={`${API_BASE}/api/assets/${selectedJob.outputFilename}`}
                      alt={selectedJob.prompt}
                      className="max-h-[400px] w-auto object-contain rounded-xl"
                    />
                  </div>

                  {/* Image Action Bar */}
                  <div className="flex items-center gap-3 mt-1">
                    <a
                      href={`${API_BASE}/api/jobs/${selectedJob.id}/download`}
                      download
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download High-Res
                    </a>

                    <a
                      href={`${API_BASE}/api/assets/${selectedJob.outputFilename}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Full Size
                    </a>

                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(selectedJob.prompt)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Prompt
                    </button>
                  </div>
                </div>
              ) : (
                // Idle Empty State
                <div className="flex flex-col items-center justify-center text-center p-8 text-slate-500 gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800/80 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-300">Visual Canvas Ready</p>
                    <p className="text-xs text-slate-500 max-w-xs mt-1">
                      Configure your prompt or upload a product reference on the left, then click Generate to create visual assets.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Selected Job Metadata Footer */}
            {selectedJob && (
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-3">
                  <span>Size: <strong className="text-slate-200">{selectedJob.width}×{selectedJob.height}</strong></span>
                  <span>Seed: <strong className="text-slate-200">{selectedJob.seed}</strong></span>
                  <span>Steps: <strong className="text-slate-200">{selectedJob.steps}</strong></span>
                </div>
                <span>Job ID: <code className="font-mono text-indigo-400">{selectedJob.id}</code></span>
              </div>
            )}
          </div>

          {/* Recent Generations Gallery Drawer */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Recent Generation History ({recentJobs.length})
              </h2>
              <button
                type="button"
                onClick={fetchJobs}
                className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {recentJobs.length === 0 ? (
              <p className="text-xs text-slate-600 italic py-3 text-center">
                No past generation jobs recorded yet.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`shrink-0 w-32 rounded-xl p-2 border cursor-pointer transition-all ${
                      selectedJob?.id === job.id
                        ? 'bg-indigo-950/40 border-indigo-500/80 ring-1 ring-indigo-500'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="aspect-square rounded-lg bg-slate-900 overflow-hidden mb-1.5 flex items-center justify-center">
                      {job.outputFilename ? (
                        <img
                          src={`${API_BASE}/api/assets/${job.outputFilename}`}
                          alt={job.prompt}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-600 uppercase font-mono">
                          {job.status}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-300 truncate font-medium">
                      {job.prompt}
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1">
                      <span>{job.width}×{job.height}</span>
                      <span
                        className={
                          job.status === 'COMPLETED'
                            ? 'text-emerald-400'
                            : job.status === 'FAILED'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }
                      >
                        {job.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
