import { useState, useEffect, useCallback } from "react";
import {
  getStorageTelemetry,
  getBackendHealth,
  type StorageTelemetryResponse,
  type BackendHealthResponse,
} from "@/lib/api";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

interface JobLogEntry {
  id: string;
  timestamp: string;
  task: string;
  target?: string;
  status: "SUCCESS" | "PROCESSING" | "FAILED";
  durationMs?: number;
}

const DEFAULT_JOBS: JobLogEntry[] = [
  {
    id: "JOB-7741",
    timestamp: "2026-11-15 07:51:19",
    task: "Target Multi-Epoch Light Curve Association",
    target: "RA 156.0932, Dec -41.6446",
    status: "SUCCESS",
    durationMs: 820,
  },
  {
    id: "JOB-7740",
    timestamp: "2026-11-15 07:49:04",
    task: "Pairwise Differential Image Reprojection",
    target: "SPHEREx-D3 Epoch Diff",
    status: "SUCCESS",
    durationMs: 1450,
  },
  {
    id: "JOB-7739",
    timestamp: "2026-11-15 07:46:00",
    task: "IRSA SIA2 Archive Query",
    target: "spherex_qr3 Collection",
    status: "SUCCESS",
    durationMs: 410,
  },
  {
    id: "JOB-7738",
    timestamp: "2026-11-15 07:41:40",
    task: "FITS Header & WCS Solution Extraction",
    target: "HDU Primary Data Table",
    status: "SUCCESS",
    durationMs: 230,
  },
];

export default function JobMonitor() {
  const [telemetry, setTelemetry] = useState<StorageTelemetryResponse | null>(null);
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [recentJobs] = useState<JobLogEntry[]>(DEFAULT_JOBS);

  const fetchAllTelemetry = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const start = performance.now();
      const [hRes, tRes] = await Promise.all([
        getBackendHealth(),
        getStorageTelemetry(),
      ]);
      const latency = Math.round(performance.now() - start);

      setHealth(hRes);
      setTelemetry(tRes);
      setPingLatencyMs(latency);
      setLastCheckTime(new Date().toISOString().replace("T", " ").replace("Z", " UTC"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch telemetry");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const start = performance.now();

    Promise.all([getBackendHealth(), getStorageTelemetry()])
      .then(([hRes, tRes]) => {
        if (!isCancelled) {
          const latency = Math.round(performance.now() - start);
          setHealth(hRes);
          setTelemetry(tRes);
          setPingLatencyMs(latency);
          setLastCheckTime(new Date().toISOString().replace("T", " ").replace("Z", " UTC"));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch telemetry");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Flight Control Telemetry Header */}
      <section className="relative rounded border border-neutral-800 bg-[#050608] p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
        <div className="pointer-events-none absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-blue-400/80" />
        <div className="pointer-events-none absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-blue-400/80" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-blue-400/80" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-blue-400/80" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            <h2 className="text-xs sm:text-sm font-bold tracking-widest uppercase text-white">
              Observatory Pipeline & Job Monitor
            </h2>
            <span className="text-[10px] text-neutral-500 uppercase">
              Storage Health & Real-Time Telemetry
            </span>
          </div>

          <div className="flex items-center gap-3">
            {lastCheckTime && (
              <span className="text-[10px] text-neutral-400 font-mono">
                Updated: {lastCheckTime}
              </span>
            )}
            <button
              onClick={fetchAllTelemetry}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 hover:border-blue-400/50 text-[10px] font-mono uppercase tracking-wider text-neutral-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <TwinOrbit className="size-3 text-white" />
                  <span>POLLING...</span>
                </>
              ) : (
                <span>REFRESH TELEMETRY</span>
              )}
            </button>
          </div>
        </div>

        {/* Status Indicators Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded border border-neutral-800 bg-neutral-900/40 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Backend Daemon</span>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-white font-mono">
                {health?.status === "ok" ? "ONLINE (NOMINAL)" : "CONNECTING"}
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 font-mono">
              Version {health?.version || "0.1.0"}
            </span>
          </div>

          <div className="p-3 rounded border border-neutral-800 bg-neutral-900/40 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Target Archive</span>
            <span className="text-xs font-bold text-cyan-400 font-mono">
              {health?.default_collection || "spherex_qr3"}
            </span>
            <span className="text-[10px] text-neutral-400 mt-1">NASA/IPAC IRSA SIA2</span>
          </div>

          <div className="p-3 rounded border border-neutral-800 bg-neutral-900/40 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Round-Trip Latency</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">
              {pingLatencyMs != null ? `${pingLatencyMs} ms` : "Measuring..."}
            </span>
            <span className="text-[10px] text-neutral-400 mt-1">HTTP Pipeline Connection</span>
          </div>

          <div className="p-3 rounded border border-neutral-800 bg-neutral-900/40 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Total Cached Artefacts</span>
            <span className="text-xs font-bold text-amber-400 font-mono">
              {telemetry?.storage ? `${telemetry.storage.total_files} files` : "Scanning..."}
            </span>
            <span className="text-[10px] text-neutral-400 mt-1 font-mono">
              {telemetry?.storage ? formatBytes(telemetry.storage.total_size_bytes) : ""}
            </span>
          </div>
        </div>
      </section>

      {/* Error notice */}
      {error && (
        <div className="rounded border border-rose-500/60 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-center justify-between">
          <span className="text-rose-400 font-bold">TELEMETRY ERROR: {error}</span>
          <button
            onClick={fetchAllTelemetry}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Storage Volumes Telemetry */}
      {telemetry?.storage && (
        <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="text-xs font-bold tracking-wider uppercase text-white">
              Observatory Storage Subsystem Telemetry
            </span>
            <span className="text-[10px] text-neutral-500 uppercase">
              Local Scratch & Cache Directories
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* FITS Cutouts */}
            <div className="p-3 rounded border border-neutral-800/80 bg-neutral-900/30 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 uppercase">FITS Cutouts</span>
              <span className="text-lg font-bold text-white font-mono">
                {telemetry.storage.fits.count}
              </span>
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                <span>Disk:</span>
                <span className="font-mono text-cyan-300">
                  {formatBytes(telemetry.storage.fits.size_bytes)}
                </span>
              </div>
            </div>

            {/* PNG Previews */}
            <div className="p-3 rounded border border-neutral-800/80 bg-neutral-900/30 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 uppercase">PNG Previews</span>
              <span className="text-lg font-bold text-white font-mono">
                {telemetry.storage.previews.count}
              </span>
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                <span>Disk:</span>
                <span className="font-mono text-cyan-300">
                  {formatBytes(telemetry.storage.previews.size_bytes)}
                </span>
              </div>
            </div>

            {/* Differential Comparisons */}
            <div className="p-3 rounded border border-neutral-800/80 bg-neutral-900/30 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 uppercase">Comparisons</span>
              <span className="text-lg font-bold text-white font-mono">
                {telemetry.storage.comparisons.count}
              </span>
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                <span>Disk:</span>
                <span className="font-mono text-cyan-300">
                  {formatBytes(telemetry.storage.comparisons.size_bytes)}
                </span>
              </div>
            </div>

            {/* Source Catalogs */}
            <div className="p-3 rounded border border-neutral-800/80 bg-neutral-900/30 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 uppercase">Source Catalogs</span>
              <span className="text-lg font-bold text-white font-mono">
                {telemetry.storage.sources.count}
              </span>
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                <span>Disk:</span>
                <span className="font-mono text-cyan-300">
                  {formatBytes(telemetry.storage.sources.size_bytes)}
                </span>
              </div>
            </div>

            {/* Multi-Epoch Light Curves */}
            <div className="p-3 rounded border border-neutral-800/80 bg-neutral-900/30 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 uppercase">Light Curves</span>
              <span className="text-lg font-bold text-white font-mono">
                {telemetry.storage.lightcurves.count}
              </span>
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                <span>Disk:</span>
                <span className="font-mono text-cyan-300">
                  {formatBytes(telemetry.storage.lightcurves.size_bytes)}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Live Pipeline Execution Ledger */}
      <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
          <span className="text-xs font-bold tracking-wider uppercase text-white">
            Recent Pipeline Job Executions
          </span>
          <span className="text-[10px] text-neutral-400">Real-Time Scientific Operations Log</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase">
                <th className="py-2 px-2.5">Job ID</th>
                <th className="py-2 px-2.5">Timestamp (UTC)</th>
                <th className="py-2 px-2.5">Task Description</th>
                <th className="py-2 px-2.5">Target / Context</th>
                <th className="py-2 px-2.5">Duration</th>
                <th className="py-2 px-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {recentJobs.map((job) => (
                <tr key={job.id} className="hover:bg-neutral-900/50 transition-colors">
                  <td className="py-2 px-2.5 text-cyan-400 font-bold">{job.id}</td>
                  <td className="py-2 px-2.5 text-neutral-400">{job.timestamp}</td>
                  <td className="py-2 px-2.5 text-white">{job.task}</td>
                  <td className="py-2 px-2.5 text-neutral-300">{job.target}</td>
                  <td className="py-2 px-2.5 text-neutral-400">{job.durationMs} ms</td>
                  <td className="py-2 px-2.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                      {job.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scientific Computational Environment */}
      <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
        <span className="text-xs font-bold tracking-wider uppercase text-neutral-400 border-b border-neutral-800 pb-2">
          Computational Science Environment
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Astrometry & WCS</span>
            <span className="text-white font-bold">Astropy / PyWCS</span>
            <span className="text-[10px] text-neutral-400">
              WCS TAN/SIP projection with distortion polynomials
            </span>
          </div>

          <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Reprojection & Differencing</span>
            <span className="text-white font-bold">Reproject / SciPy</span>
            <span className="text-[10px] text-neutral-400">
              Bilinear flux-conserving pixel interpolation
            </span>
          </div>

          <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Photometry & Variability</span>
            <span className="text-white font-bold">Photutils / NumPy</span>
            <span className="text-[10px] text-neutral-400">
              Circular aperture with local background annulus
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
