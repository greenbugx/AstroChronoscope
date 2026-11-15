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
  status: "ACK" | "PROC" | "REJ";
  durationMs?: number;
}

const DEFAULT_JOBS: JobLogEntry[] = [
  {
    id: "JOB-7741",
    timestamp: "2026-11-15 07:51:19",
    task: "Target Multi-Epoch Light Curve Association",
    target: "RA 156.0932, Dec -41.6446",
    status: "ACK",
    durationMs: 820,
  },
  {
    id: "JOB-7740",
    timestamp: "2026-11-15 07:49:04",
    task: "Pairwise Differential Image Reprojection",
    target: "SPHEREx-D3 Epoch Diff",
    status: "ACK",
    durationMs: 1450,
  },
  {
    id: "JOB-7739",
    timestamp: "2026-11-15 07:46:00",
    task: "IRSA SIA2 Archive Query",
    target: "spherex_qr3 Collection",
    status: "ACK",
    durationMs: 410,
  },
  {
    id: "JOB-7738",
    timestamp: "2026-11-15 07:41:40",
    task: "FITS Header & WCS Solution Extraction",
    target: "HDU Primary Data Table",
    status: "ACK",
    durationMs: 230,
  },
  {
    id: "JOB-7737",
    timestamp: "2026-11-15 07:35:12",
    task: "DR1 Cube 102-Channel Surface Brightness",
    target: "HEALPix Order 5 (9621)",
    status: "ACK",
    durationMs: 560,
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
  const [selectedJobId, setSelectedJobId] = useState<string>("JOB-7741");

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
    <div className="flex flex-col gap-4 font-mono text-neutral-200">
      {/* Flight Control Telemetry Header */}
      <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-2">
          {/* Status Box & Controls */}
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 font-bold text-xs uppercase border ${
                health?.status === "ok"
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-red-600 text-white border-red-500"
              }`}
            >
              {health?.status === "ok" ? "DAEMON CONNECTED" : "OFFLINE"}
            </div>

            <button
              onClick={fetchAllTelemetry}
              disabled={isLoading}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white font-bold text-xs uppercase cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <TwinOrbit className="size-3 text-white" />
                  <span>POLLING...</span>
                </>
              ) : (
                <span>POLL TELEMETRY</span>
              )}
            </button>
          </div>

          {/* Time & Telemetry Counters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {lastCheckTime && (
              <span className="text-[10px] text-neutral-400">
                LKG: {lastCheckTime}
              </span>
            )}
            <div className="bg-black border border-neutral-800 px-2 py-0.5 text-neutral-300 text-[11px]">
              RTT: <span className="text-emerald-400 font-bold">{pingLatencyMs != null ? `${pingLatencyMs} ms` : "-"}</span>
            </div>
            <div className="bg-black border border-neutral-800 px-2 py-0.5 text-neutral-300 text-[11px]">
              ARCHIVE: <span className="text-white font-bold">{health?.default_collection || "spherex_qr3"}</span>
            </div>
          </div>
        </div>

        {/* Telemetry Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase">Version</span>
            <span className="text-sm font-bold text-white">{health?.version || "0.1.0"}</span>
          </div>

          <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase">Total Files</span>
            <span className="text-sm font-bold text-white">
              {telemetry?.storage ? `${telemetry.storage.total_files}` : "-"}
            </span>
          </div>

          <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase">Storage Volume</span>
            <span className="text-sm font-bold text-amber-300">
              {telemetry?.storage ? formatBytes(telemetry.storage.total_size_bytes) : "-"}
            </span>
          </div>

          <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase">Daemon Protocol</span>
            <span className="text-sm font-bold text-emerald-400">HTTP/1.1 REST</span>
          </div>
        </div>
      </section>

      {/* Error notice */}
      {error && (
        <div className="border border-red-600 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>TELEMETRY FAULT: {error}</span>
          <button
            onClick={fetchAllTelemetry}
            className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase cursor-pointer"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Storage Subsystems Ledger */}
      {telemetry?.storage && (
        <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-white tracking-wider border-b border-neutral-800 pb-1">
            Storage Subsystems
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase">FITS Cutouts</span>
              <span className="text-base font-bold text-white">{telemetry.storage.fits.count}</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {formatBytes(telemetry.storage.fits.size_bytes)}
              </span>
            </div>

            <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase">PNG Previews</span>
              <span className="text-base font-bold text-white">{telemetry.storage.previews.count}</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {formatBytes(telemetry.storage.previews.size_bytes)}
              </span>
            </div>

            <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase">Comparisons</span>
              <span className="text-base font-bold text-white">{telemetry.storage.comparisons.count}</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {formatBytes(telemetry.storage.comparisons.size_bytes)}
              </span>
            </div>

            <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase">Sources</span>
              <span className="text-base font-bold text-white">{telemetry.storage.sources.count}</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {formatBytes(telemetry.storage.sources.size_bytes)}
              </span>
            </div>

            <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase">Light Curves</span>
              <span className="text-base font-bold text-white">{telemetry.storage.lightcurves.count}</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {formatBytes(telemetry.storage.lightcurves.size_bytes)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Telemetry History Table (TM_history) */}
      <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
          <span className="text-xs font-bold uppercase text-white tracking-wider">
            Telemetry History (TM_history)
          </span>
          <span className="text-[10px] text-neutral-400">Pipeline Execution Ledger</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase bg-black">
                <th className="py-1.5 px-2.5">Job ID</th>
                <th className="py-1.5 px-2.5">Received At</th>
                <th className="py-1.5 px-2.5">Task Description</th>
                <th className="py-1.5 px-2.5">Target Context</th>
                <th className="py-1.5 px-2.5">Duration</th>
                <th className="py-1.5 px-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900 text-[11px]">
              {recentJobs.map((job) => {
                const isSelected = selectedJobId === job.id;
                return (
                  <tr
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-amber-500/20 text-amber-200"
                        : "hover:bg-neutral-900 text-neutral-300"
                    }`}
                  >
                    <td className="py-1.5 px-2.5 font-bold">{job.id}</td>
                    <td className="py-1.5 px-2.5 text-neutral-400">{job.timestamp}</td>
                    <td className="py-1.5 px-2.5 text-white">{job.task}</td>
                    <td className="py-1.5 px-2.5 text-neutral-400">{job.target}</td>
                    <td className="py-1.5 px-2.5 text-neutral-400">{job.durationMs} ms</td>
                    <td className="py-1.5 px-2.5">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold ${
                          job.status === "ACK"
                            ? "bg-emerald-600 text-white"
                            : job.status === "REJ"
                              ? "bg-red-600 text-white"
                              : "bg-blue-600 text-white"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Computational Stack Environment */}
      <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-2">
        <span className="text-xs font-bold uppercase text-neutral-400 border-b border-neutral-800 pb-1">
          Computational Science Stack
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase">Astrometry & WCS</span>
            <span className="text-white font-bold">Astropy / PyWCS</span>
            <span className="text-[10px] text-neutral-400">TAN/SIP projection with distortion polynomials</span>
          </div>

          <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase">Reprojection</span>
            <span className="text-white font-bold">Reproject / SciPy</span>
            <span className="text-[10px] text-neutral-400">Bilinear flux-conserving pixel interpolation</span>
          </div>

          <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase">Photometry</span>
            <span className="text-white font-bold">Photutils / NumPy</span>
            <span className="text-[10px] text-neutral-400">Circular aperture with local background annulus</span>
          </div>
        </div>
      </section>
    </div>
  );
}
