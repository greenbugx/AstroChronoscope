import { useState, useEffect } from "react";
import {
  type TimelineProduct,
  type ComparisonResponse,
  getFileUrl,
  createCutout,
} from "@/lib/api";
import { operationMonitor } from "@/lib/operationMonitor";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

export interface DifferentialAnalysisTabProps {
  ra: string;
  dec: string;
  cutoutSize: string;
  epochA: TimelineProduct | null;
  epochB: TimelineProduct | null;
  availableProducts: TimelineProduct[];
  comparisonResult: ComparisonResponse | null;
  isComparing: boolean;
  error: string | null;
  onSelectEpochA: (product: TimelineProduct) => void;
  onSelectEpochB: (product: TimelineProduct) => void;
  onRunComparison: () => void;
  onNavigateTab: (tab: "discovery" | "explorer" | "differential" | "timedomain" | "reports") => void;
}

export default function DifferentialAnalysisTab({
  ra,
  dec,
  cutoutSize,
  epochA,
  epochB,
  availableProducts,
  comparisonResult,
  isComparing,
  error,
  onSelectEpochA,
  onSelectEpochB,
  onRunComparison,
  onNavigateTab,
}: DifferentialAnalysisTabProps) {
  const [activeSubView, setActiveSubView] = useState<"difference" | "uncertainty" | "mask">("difference");

  // Local cutout preview states for Epoch A and Epoch B
  const [previewUrlA, setPreviewUrlA] = useState<string | null>(null);
  const [previewUrlB, setPreviewUrlB] = useState<string | null>(null);
  const [isLoadingPreviews, setIsLoadingPreviews] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const sizeNum = parseFloat(cutoutSize) || 0.1;

    if (isNaN(raNum) || isNaN(decNum)) return;

    const loadPreviews = async () => {
      setIsLoadingPreviews(true);
      try {
        const obsIdA = epochA?.observation_id;
        if (obsIdA) {
          const labelA = epochA.observation_time || epochA.start_time || "Ref";
          const resA = await operationMonitor.executeOperation(
            {
              name: "Differential Epoch A Cutout",
              category: "differential",
              workspace: "differential",
              context: {
                observationId: obsIdA,
                ra: raNum,
                dec: decNum,
                radius: sizeNum,
                label: `Epoch A: ${labelA}`,
              },
              dedupKey: `diff-preview:${obsIdA}:${sizeNum}`,
            },
            () =>
              createCutout(obsIdA, {
                ra: raNum,
                dec: decNum,
                size: sizeNum,
              })
          );
          if (!isCancelled && resA.cutout?.preview_url) {
            setPreviewUrlA(resA.cutout.preview_url);
          }
        } else if (!isCancelled) {
          setPreviewUrlA(null);
        }

        const obsIdB = epochB?.observation_id;
        if (obsIdB) {
          const labelB = epochB.observation_time || epochB.start_time || "Target";
          const resB = await operationMonitor.executeOperation(
            {
              name: "Differential Epoch B Cutout",
              category: "differential",
              workspace: "differential",
              context: {
                observationId: obsIdB,
                ra: raNum,
                dec: decNum,
                radius: sizeNum,
                label: `Epoch B: ${labelB}`,
              },
              dedupKey: `diff-preview:${obsIdB}:${sizeNum}`,
            },
            () =>
              createCutout(obsIdB, {
                ra: raNum,
                dec: decNum,
                size: sizeNum,
              })
          );
          if (!isCancelled && resB.cutout?.preview_url) {
            setPreviewUrlB(resB.cutout.preview_url);
          }
        } else if (!isCancelled) {
          setPreviewUrlB(null);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (!isCancelled) {
          setIsLoadingPreviews(false);
        }
      }
    };

    void loadPreviews();

    return () => {
      isCancelled = true;
    };
  }, [
    epochA?.observation_id,
    epochA?.observation_time,
    epochA?.start_time,
    epochB?.observation_id,
    epochB?.observation_time,
    epochB?.start_time,
    ra,
    dec,
    cutoutSize,
  ]);

  const hasBothEpochs = !!(epochA && epochB);
  const isDifferentObservation = epochA?.observation_id !== epochB?.observation_id;
  const isCompatibleBand = epochA?.band === epochB?.band;
  const canCompare = hasBothEpochs && isDifferentObservation;

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* Epoch Selection Panel */}
      <section className="border border-neutral-800 bg-[#0d0d0d]">
        <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Pairwise Differencing Epoch Selection
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold uppercase border ${
                canCompare
                  ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/40"
                  : "bg-amber-600/20 text-amber-300 border-amber-500/40"
              }`}
            >
              {canCompare ? "COMPATIBLE: READY" : "SELECT 2 DISTINCT EPOCHS"}
            </span>
          </div>

          <button
            onClick={() => onNavigateTab("discovery")}
            className="px-2 py-0.5 border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white text-[10px] uppercase font-bold cursor-pointer"
          >
            EDIT IN DISCOVERY
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Epoch A Card */}
            <div className="p-2.5 bg-black border border-neutral-800 flex flex-col gap-2 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                <span className="text-amber-400 font-bold uppercase text-[11px]">
                  Epoch A (Reference Image: I_a)
                </span>
                <span className="text-[10px] text-neutral-500">Baseline</span>
              </div>

              {epochA ? (
                <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="font-bold text-white truncate block w-full" title={epochA.observation_id || undefined}>
                    {epochA.observation_id}
                  </span>
                  <div className="text-[10px] text-neutral-400 flex items-center gap-3">
                    <span>Band: <strong className="text-sky-400">{epochA.band?.replace("SPHEREx-", "")}</strong></span>
                    <span>Date: {epochA.observation_time?.slice(0, 10)}</span>
                  </div>
                </div>
              ) : (
                <span className="text-neutral-500 text-xs py-1">No Epoch A selected.</span>
              )}

              {availableProducts.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-neutral-900">
                  <span className="text-[10px] text-neutral-500 uppercase mr-1">Switch:</span>
                  {availableProducts.map((p, idx) => (
                    <button
                      key={`a-${p.observation_id || idx}`}
                      onClick={() => onSelectEpochA(p)}
                      className={`px-1.5 py-0.5 text-[10px] uppercase font-bold border ${
                        epochA?.observation_id === p.observation_id
                          ? "bg-amber-600 text-white border-amber-500"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
                      }`}
                    >
                      {p.band?.replace("SPHEREx-", "")} · {p.observation_id?.slice(-6) || "ID"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Epoch B Card */}
            <div className="p-2.5 bg-black border border-neutral-800 flex flex-col gap-2 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                <span className="text-cyan-400 font-bold uppercase text-[11px]">
                  Epoch B (Target Search: I_b)
                </span>
                <span className="text-[10px] text-neutral-500">Target</span>
              </div>

              {epochB ? (
                <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="font-bold text-white truncate block w-full" title={epochB.observation_id || undefined}>
                    {epochB.observation_id}
                  </span>
                  <div className="text-[10px] text-neutral-400 flex items-center gap-3">
                    <span>Band: <strong className="text-sky-400">{epochB.band?.replace("SPHEREx-", "")}</strong></span>
                    <span>Date: {epochB.observation_time?.slice(0, 10)}</span>
                  </div>
                </div>
              ) : (
                <span className="text-neutral-500 text-xs py-1">No Epoch B selected.</span>
              )}

              {availableProducts.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-neutral-900">
                  <span className="text-[10px] text-neutral-500 uppercase mr-1">Switch:</span>
                  {availableProducts.map((p, idx) => (
                    <button
                      key={`b-${p.observation_id || idx}`}
                      onClick={() => onSelectEpochB(p)}
                      className={`px-1.5 py-0.5 text-[10px] uppercase font-bold border ${
                        epochB?.observation_id === p.observation_id
                          ? "bg-cyan-600 text-white border-cyan-500"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
                      }`}
                    >
                      {p.band?.replace("SPHEREx-", "")} · {p.observation_id?.slice(-6) || "ID"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
            <span className="text-[11px] text-neutral-400">
              Model: <code className="text-amber-300 font-bold">D = I_b - α · I_a</code>
              {!isCompatibleBand && epochA && epochB && (
                <span className="text-amber-400 ml-2">(Note: Cross-band comparison)</span>
              )}
            </span>

            <button
              onClick={onRunComparison}
              disabled={!canCompare || isComparing}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-bold text-xs uppercase cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isComparing ? (
                <>
                  <TwinOrbit className="size-3.5 text-white" />
                  <span>COMPUTING DIFFERENCE...</span>
                </>
              ) : (
                <span>RUN DIFFERENTIAL ANALYSIS</span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Comparison Error */}
      {error && (
        <div className="border border-red-600 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>ERROR: {error}</span>
          <button
            onClick={onRunComparison}
            className="px-2 py-0.5 bg-red-600 text-white font-bold uppercase text-[10px]"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3-Box Image Display (Epoch A, Epoch B, Difference) */}
      <section className="border border-neutral-800 bg-[#0d0d0d]">
        <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800 flex items-center justify-between text-xs">
          <span className="font-bold text-white uppercase tracking-wider">
            Image Comparison Matrix
          </span>
          {comparisonResult && (
            <span className="text-emerald-400 font-bold">
              ID: {comparisonResult.comparison_id.slice(0, 16)}...
            </span>
          )}
        </div>

        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Box 1: Epoch A */}
          <div className="border border-neutral-800 bg-black flex flex-col">
            <div className="bg-[#181818] px-2.5 py-1 border-b border-neutral-800 flex items-center justify-between text-[11px]">
              <span className="text-amber-400 font-bold">Epoch A (Reference)</span>
              <span className="text-neutral-400">{epochA?.observation_time?.slice(0, 10)}</span>
            </div>
            <div className="relative aspect-square w-full bg-black flex items-center justify-center p-2">
              {isLoadingPreviews && !previewUrlA ? (
                <div className="flex flex-col items-center gap-2 text-neutral-400 text-xs">
                  <TwinOrbit className="size-4 text-amber-400" />
                  <span>Loading A...</span>
                </div>
              ) : previewUrlA ? (
                <img
                  src={getFileUrl(previewUrlA)}
                  alt={`Epoch A (${epochA?.observation_id})`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-neutral-500 text-xs">No Cutout for Epoch A</span>
              )}
            </div>
            <div className="p-1.5 bg-[#141414] border-t border-neutral-800 text-[10px] text-neutral-400 flex justify-between">
              <span>Baseline Flux</span>
              {epochA?.fits_access_url && (
                <a href={epochA.fits_access_url} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">
                  Download FITS
                </a>
              )}
            </div>
          </div>

          {/* Box 2: Epoch B */}
          <div className="border border-neutral-800 bg-black flex flex-col">
            <div className="bg-[#181818] px-2.5 py-1 border-b border-neutral-800 flex items-center justify-between text-[11px]">
              <span className="text-cyan-400 font-bold">Epoch B (Target)</span>
              <span className="text-neutral-400">{epochB?.observation_time?.slice(0, 10)}</span>
            </div>
            <div className="relative aspect-square w-full bg-black flex items-center justify-center p-2">
              {isLoadingPreviews && !previewUrlB ? (
                <div className="flex flex-col items-center gap-2 text-neutral-400 text-xs">
                  <TwinOrbit className="size-4 text-cyan-400" />
                  <span>Loading B...</span>
                </div>
              ) : previewUrlB ? (
                <img
                  src={getFileUrl(previewUrlB)}
                  alt={`Epoch B (${epochB?.observation_id})`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-neutral-500 text-xs">No Cutout for Epoch B</span>
              )}
            </div>
            <div className="p-1.5 bg-[#141414] border-t border-neutral-800 text-[10px] text-neutral-400 flex justify-between">
              <span>Target Flux</span>
              {epochB?.fits_access_url && (
                <a href={epochB.fits_access_url} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">
                  Download FITS
                </a>
              )}
            </div>
          </div>

          {/* Box 3: Difference Image */}
          <div className="border border-neutral-800 bg-black flex flex-col">
            <div className="bg-[#181818] px-2.5 py-1 border-b border-neutral-800 flex items-center justify-between text-[11px]">
              <span className="text-white font-bold">Difference Product (D)</span>
              {comparisonResult && (
                <div className="flex items-center gap-1 text-[9px]">
                  {(["difference", "uncertainty", "mask"] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setActiveSubView(view)}
                      className={`px-1.5 py-0.2 uppercase border ${
                        activeSubView === view
                          ? "bg-amber-600 text-white border-amber-500 font-bold"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800"
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative aspect-square w-full bg-black flex items-center justify-center p-2">
              {comparisonResult ? (
                activeSubView === "difference" && comparisonResult.difference?.preview_url ? (
                  <img
                    src={getFileUrl(comparisonResult.difference.preview_url)}
                    alt="Difference Image"
                    className="w-full h-full object-contain"
                  />
                ) : activeSubView === "uncertainty" && comparisonResult.difference?.uncertainty_url ? (
                  <img
                    src={getFileUrl(comparisonResult.difference.uncertainty_url)}
                    alt="Uncertainty Map"
                    className="w-full h-full object-contain"
                  />
                ) : activeSubView === "mask" && comparisonResult.difference?.mask_url ? (
                  <img
                    src={getFileUrl(comparisonResult.difference.mask_url)}
                    alt="Quality Mask"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-neutral-500 text-xs">Preview Not Available</span>
                )
              ) : (
                <div className="text-neutral-500 text-xs text-center p-4">
                  <span>Execute difference analysis to generate difference product.</span>
                </div>
              )}
            </div>

            <div className="p-1.5 bg-[#141414] border-t border-neutral-800 text-[10px] text-neutral-400 flex justify-between">
              <span>Unit: MJy/sr</span>
              {comparisonResult?.difference?.fits_url && (
                <a
                  href={getFileUrl(comparisonResult.difference.fits_url)}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:underline font-bold"
                >
                  Download Difference FITS
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Numerical Differential Telemetry Table */}
        {comparisonResult && (
          <div className="p-3 border-t border-neutral-800 bg-[#0f0f0f]">
            <span className="text-xs font-bold text-white uppercase block mb-2">
              Verification Telemetry Checks
            </span>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#181818] border-b border-neutral-800 text-[10px] text-neutral-400 uppercase">
                    <th className="py-1 px-2.5">Verification Check</th>
                    <th className="py-1 px-2.5">Diagnostics</th>
                    <th className="py-1 px-2.5">Severity</th>
                    <th className="py-1 px-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900 font-mono text-[11px]">
                  {comparisonResult.quality?.checks.map((chk, idx) => (
                    <tr key={idx} className="hover:bg-neutral-900/50">
                      <td className="py-1.5 px-2.5 text-white font-bold">{chk.name}</td>
                      <td className="py-1.5 px-2.5 text-neutral-300">{chk.message || "-"}</td>
                      <td className="py-1.5 px-2.5 text-neutral-400">
                        {chk.critical ? "CRITICAL" : "STANDARD"}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold ${
                            chk.status === "PASS"
                              ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                              : chk.status === "WARNING"
                                ? "bg-amber-600/20 text-amber-300 border border-amber-500/40"
                                : "bg-red-600/20 text-red-300 border border-red-500/40"
                          }`}
                        >
                          {chk.status === "PASS" ? "ACK" : chk.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
