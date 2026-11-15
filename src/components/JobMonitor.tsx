import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getStorageTelemetry,
  getBackendHealth,
  type StorageTelemetryResponse,
  type BackendHealthResponse,
} from "@/lib/api";
import {
  useOperationMonitor,
  operationMonitor,
  type MonitoredOperation,
  type OperationStatus,
} from "@/lib/operationMonitor";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

export default function JobMonitor() {
  // Telemetry state
  const [telemetry, setTelemetry] = useState<StorageTelemetryResponse | null>(null);
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>("");
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  // Synchronous Operation Monitor state
  const {
    operations,
    running,
    runningCount,
    completedCount,
    failedCount,
    totalCount,
    clearCompleted,
    clearFailed,
    clearAllHistory,
  } = useOperationMonitor();

  // Selected operation for inspection (derived with user override)
  const [userSelectedOpId, setUserSelectedOpId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | OperationStatus>("ALL");

  const selectedOp = useMemo(() => {
    if (userSelectedOpId) {
      const match = operations.find((op) => op.id === userSelectedOpId);
      if (match) return match;
    }
    return operations[0] || null;
  }, [operations, userSelectedOpId]);

  const filteredOperations = useMemo(() => {
    if (statusFilter === "ALL") return operations;
    return operations.filter((op) => op.status === statusFilter);
  }, [operations, statusFilter]);

  // Telemetry fetcher
  const fetchAllTelemetry = useCallback(async () => {
    try {
      setIsTelemetryLoading(true);
      setTelemetryError(null);

      const [hRes, tRes] = await operationMonitor.executeOperation(
        {
          name: "Observatory Subsystem Telemetry Probe",
          category: "telemetry",
          workspace: "jobs",
          context: { label: "FastAPI Health & Local Storage Probe" },
          dedupKey: "telemetry:probe",
        },
        async () => {
          const start = performance.now();
          const [h, t] = await Promise.all([getBackendHealth(), getStorageTelemetry()]);
          const latency = Math.round(performance.now() - start);
          setPingLatencyMs(latency);
          return [h, t] as const;
        }
      );

      setHealth(hRes);
      setTelemetry(tRes);
      setLastCheckTime(new Date().toISOString().replace("T", " ").replace("Z", " UTC"));
    } catch (err) {
      setTelemetryError(err instanceof Error ? err.message : "Failed to fetch telemetry");
    } finally {
      setIsTelemetryLoading(false);
    }
  }, []);

  // Initial telemetry on mount
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
          setTelemetryError(null);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setTelemetryError(err instanceof Error ? err.message : "Failed to fetch telemetry");
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

  const formatContext = (ctx?: MonitoredOperation["context"]) => {
    if (!ctx) return "—";
    const parts: string[] = [];
    if (ctx.ra != null && ctx.dec != null) {
      parts.push(`RA ${typeof ctx.ra === "number" ? ctx.ra.toFixed(4) : ctx.ra}, Dec ${typeof ctx.dec === "number" ? ctx.dec.toFixed(4) : ctx.dec}`);
    }
    if (ctx.observationId) {
      const shortId = ctx.observationId.length > 20 ? `${ctx.observationId.slice(0, 18)}...` : ctx.observationId;
      parts.push(`obs: ${shortId}`);
    }
    if (ctx.sourceId) {
      parts.push(`source: ${ctx.sourceId}`);
    }
    if (ctx.spectrumId) {
      parts.push(`spec: ${ctx.spectrumId}`);
    }
    if (ctx.label) {
      parts.push(ctx.label);
    }
    return parts.length > 0 ? parts.join(" · ") : "—";
  };

  return (
    <div className="flex flex-col gap-4 font-mono text-neutral-200">
      {/* =========================================================================
          FLIGHT CONTROL TELEMETRY HEADER
         ========================================================================= */}
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
              disabled={isTelemetryLoading}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white font-bold text-xs uppercase cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isTelemetryLoading ? (
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
            <span className="text-sm font-bold text-emerald-400">HTTP/1.1 REST (Sync)</span>
          </div>
        </div>
      </section>

      {/* Error notice */}
      {telemetryError && (
        <div className="border border-red-600 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>TELEMETRY FAULT: {telemetryError}</span>
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

      {/* =========================================================================
          ACTIVE / RUNNING OPERATIONS
         ========================================================================= */}
      <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-white tracking-wider">
              Active Synchronous Operations
            </span>
            {runningCount > 0 ? (
              <span className="px-2 py-0.2 bg-blue-600 text-white text-[10px] font-bold animate-pulse">
                {runningCount} IN FLIGHT
              </span>
            ) : (
              <span className="px-2 py-0.2 bg-neutral-800 text-neutral-400 text-[10px]">
                IDLE
              </span>
            )}
          </div>
          <span className="text-[10px] text-neutral-400">
            Real-time HTTP Request Monitor (No polling)
          </span>
        </div>

        {running.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 pt-1">
            {running.map((op) => (
              <div
                key={op.id}
                onClick={() => setUserSelectedOpId(op.id)}
                className={`p-2.5 border bg-black flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 cursor-pointer transition-colors ${
                  selectedOp?.id === op.id ? "border-amber-500 bg-amber-500/10" : "border-blue-900/60 hover:border-blue-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <TwinOrbit className="size-4 text-blue-400 shrink-0" />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">{op.id}</span>
                      <span className="px-1.5 py-0.2 text-[9px] uppercase font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                        {op.workspace}
                      </span>
                      <span className="text-xs font-semibold text-neutral-200">{op.name}</span>
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      Target: {formatContext(op.context)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs shrink-0 self-end sm:self-center">
                  <span className="text-[10px] text-neutral-400">Started: {op.startTime}</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white border border-blue-400">
                    RUNNING
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 border border-neutral-800/80 bg-black text-center text-xs text-neutral-500">
            Observatory pipeline is idle. No synchronous API requests currently in execution.
          </div>
        )}
      </section>

      {/* =========================================================================
          OPERATIONS LEDGER (TM_history)
         ========================================================================= */}
      <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-2">
          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-xs font-bold uppercase text-white tracking-wider mr-2">
              Operation Ledger
            </span>

            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase border cursor-pointer ${
                statusFilter === "ALL"
                  ? "bg-neutral-700 text-white border-neutral-500"
                  : "bg-black text-neutral-400 border-neutral-800 hover:text-white"
              }`}
            >
              ALL ({totalCount})
            </button>

            <button
              onClick={() => setStatusFilter("running")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase border cursor-pointer ${
                statusFilter === "running"
                  ? "bg-blue-600 text-white border-blue-400"
                  : "bg-black text-blue-400 border-neutral-800 hover:bg-blue-950/40"
              }`}
            >
              RUNNING ({runningCount})
            </button>

            <button
              onClick={() => setStatusFilter("completed")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase border cursor-pointer ${
                statusFilter === "completed"
                  ? "bg-emerald-600 text-white border-emerald-400"
                  : "bg-black text-emerald-400 border-neutral-800 hover:bg-emerald-950/40"
              }`}
            >
              COMPLETED ({completedCount})
            </button>

            <button
              onClick={() => setStatusFilter("failed")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase border cursor-pointer ${
                statusFilter === "failed"
                  ? "bg-red-600 text-white border-red-400"
                  : "bg-black text-red-400 border-neutral-800 hover:bg-red-950/40"
              }`}
            >
              FAILED ({failedCount})
            </button>
          </div>

          {/* Clearing controls */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={clearCompleted}
              disabled={completedCount === 0}
              className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 text-[10px] font-bold uppercase cursor-pointer disabled:opacity-40"
              title="Clear all completed operation logs"
            >
              CLEAR COMPLETED
            </button>

            <button
              onClick={clearFailed}
              disabled={failedCount === 0}
              className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 text-[10px] font-bold uppercase cursor-pointer disabled:opacity-40"
              title="Clear all failed operation logs"
            >
              CLEAR FAILED
            </button>

            <button
              onClick={clearAllHistory}
              disabled={totalCount === runningCount}
              className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 text-[10px] font-bold uppercase cursor-pointer disabled:opacity-40"
              title="Clear all completed and failed logs"
            >
              CLEAR HISTORY
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase bg-black">
                <th className="py-1.5 px-2.5">Status</th>
                <th className="py-1.5 px-2.5">Op ID</th>
                <th className="py-1.5 px-2.5">Workspace</th>
                <th className="py-1.5 px-2.5">Task Description</th>
                <th className="py-1.5 px-2.5">Target Context</th>
                <th className="py-1.5 px-2.5">Started At</th>
                <th className="py-1.5 px-2.5">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900 text-[11px]">
              {filteredOperations.length > 0 ? (
                filteredOperations.map((op) => {
                  const isSelected = selectedOp?.id === op.id;
                  return (
                    <tr
                      key={op.id}
                      onClick={() => setUserSelectedOpId(op.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-amber-500/20 text-amber-200"
                          : "hover:bg-neutral-900 text-neutral-300"
                      }`}
                    >
                      <td className="py-1.5 px-2.5">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 ${
                            op.status === "completed"
                              ? "bg-emerald-600 text-white"
                              : op.status === "failed"
                                ? "bg-red-600 text-white"
                                : "bg-blue-600 text-white"
                          }`}
                        >
                          {op.status === "running" && <TwinOrbit className="size-2.5 text-white" />}
                          {op.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 font-bold text-white">{op.id}</td>
                      <td className="py-1.5 px-2.5">
                        <span className="px-1.5 py-0.2 text-[9px] uppercase font-bold bg-neutral-900 border border-neutral-800 text-neutral-400">
                          {op.workspace}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-white font-medium">{op.name}</td>
                      <td className="py-1.5 px-2.5 text-neutral-400 max-w-[220px] truncate" title={formatContext(op.context)}>
                        {formatContext(op.context)}
                      </td>
                      <td className="py-1.5 px-2.5 text-neutral-400 whitespace-nowrap">{op.startTime}</td>
                      <td className="py-1.5 px-2.5 text-neutral-300 font-bold whitespace-nowrap">
                        {op.durationMs != null ? `${op.durationMs} ms` : "..."}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-neutral-500">
                    No operations matching current filter ({statusFilter}).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* =========================================================================
          SELECTED OPERATION DETAIL INSPECTION CARD
         ========================================================================= */}
      {selectedOp && (
        <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-white tracking-wider">
                Operation Inspection:
              </span>
              <span className="font-bold text-sm text-amber-300">{selectedOp.id}</span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase ${
                  selectedOp.status === "completed"
                    ? "bg-emerald-600 text-white"
                    : selectedOp.status === "failed"
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
                }`}
              >
                {selectedOp.status.toUpperCase()}
              </span>
              <span className="px-1.5 py-0.2 text-[9px] uppercase font-bold bg-neutral-900 border border-neutral-800 text-neutral-300">
                {selectedOp.workspace}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            {/* Meta Card */}
            <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-1.5">
              <span className="text-[10px] text-neutral-500 uppercase font-bold border-b border-neutral-900 pb-1">
                Execution Metadata
              </span>
              <div className="flex justify-between">
                <span className="text-neutral-500">Task Name:</span>
                <span className="text-white font-medium text-right">{selectedOp.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Category:</span>
                <span className="text-neutral-300 uppercase">{selectedOp.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Start Time:</span>
                <span className="text-neutral-300">{selectedOp.startTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">End Time:</span>
                <span className="text-neutral-300">{selectedOp.endTime || "In Progress"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Elapsed:</span>
                <span className="text-amber-300 font-bold">
                  {selectedOp.durationMs != null ? `${selectedOp.durationMs} ms` : "Executing..."}
                </span>
              </div>
              {selectedOp.dedupKey && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-neutral-500">Dedup Key:</span>
                  <span className="text-neutral-400 truncate max-w-[140px]" title={selectedOp.dedupKey}>
                    {selectedOp.dedupKey}
                  </span>
                </div>
              )}
            </div>

            {/* Target Context Card */}
            <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-1.5">
              <span className="text-[10px] text-neutral-500 uppercase font-bold border-b border-neutral-900 pb-1">
                Target & Observation Context
              </span>
              <div className="flex justify-between">
                <span className="text-neutral-500">RA / Dec:</span>
                <span className="text-white">
                  {selectedOp.context?.ra != null && selectedOp.context?.dec != null
                    ? `${typeof selectedOp.context.ra === "number" ? selectedOp.context.ra.toFixed(4) : selectedOp.context.ra}°, ${typeof selectedOp.context.dec === "number" ? selectedOp.context.dec.toFixed(4) : selectedOp.context.dec}°`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Radius:</span>
                <span className="text-neutral-300">
                  {selectedOp.context?.radius != null ? `${selectedOp.context.radius}°` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Observation ID:</span>
                <span
                  className="text-neutral-300 truncate max-w-[150px]"
                  title={selectedOp.context?.observationId || undefined}
                >
                  {selectedOp.context?.observationId || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Source ID:</span>
                <span className="text-neutral-300">{selectedOp.context?.sourceId || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Annotation:</span>
                <span className="text-neutral-300">{selectedOp.context?.label || "—"}</span>
              </div>
            </div>

            {/* Result / Error Card */}
            <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-1.5">
              <span className="text-[10px] text-neutral-500 uppercase font-bold border-b border-neutral-900 pb-1">
                Outcome Diagnostics
              </span>
              {selectedOp.status === "failed" ? (
                <div className="flex flex-col gap-1 text-red-400">
                  <div className="flex items-center gap-1 font-bold text-red-300">
                    <span>FAULT:</span>
                    <span>{selectedOp.error?.code || "REQUEST_FAILED"}</span>
                  </div>
                  <p className="text-[11px] text-red-200 bg-red-950/30 p-1.5 border border-red-900/50 break-words">
                    {selectedOp.error?.message || "Unknown error"}
                  </p>
                  {selectedOp.error?.details != null && (
                    <pre className="text-[9px] text-red-300 bg-black p-1 border border-red-950 overflow-x-auto max-h-20">
                      {typeof selectedOp.error.details === "string"
                        ? selectedOp.error.details
                        : JSON.stringify(selectedOp.error.details, null, 2)}
                    </pre>
                  )}
                </div>
              ) : selectedOp.status === "completed" ? (
                <div className="flex flex-col gap-1 text-emerald-400">
                  <span className="font-bold">STATUS: OK</span>
                  <p className="text-neutral-400 text-[11px]">
                    Synchronous HTTP operation returned 200 OK. Output processed and bound into workspace state.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-blue-400">
                  <div className="flex items-center gap-2">
                    <TwinOrbit className="size-3.5 text-blue-400" />
                    <span className="font-bold">STATUS: IN_FLIGHT</span>
                  </div>
                  <p className="text-neutral-400 text-[11px]">
                    FastAPI server currently executing science pipeline algorithms. Awaiting response payload.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          COMPUTATIONAL STACK ENVIRONMENT
         ========================================================================= */}
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
