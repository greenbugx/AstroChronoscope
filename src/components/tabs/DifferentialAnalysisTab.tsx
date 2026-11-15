import { useState, useEffect } from "react";
import {
  type TimelineProduct,
  type ComparisonResponse,
  createCutout,
  getFileUrl,
} from "@/lib/api";
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
  const [previewUrlA, setPreviewUrlA] = useState<string | null>(null);
  const [previewUrlB, setPreviewUrlB] = useState<string | null>(null);
  const [isLoadingPreviews, setIsLoadingPreviews] = useState<boolean>(false);

  // Automatically fetch genuine cutout previews for Epoch A and Epoch B
  useEffect(() => {
    let isCancelled = false;
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const sizeNum = parseFloat(cutoutSize) || 0.1;

    if (isNaN(raNum) || isNaN(decNum)) return;

    const loadPreviews = async () => {
      setIsLoadingPreviews(true);
      try {
        if (epochA?.observation_id) {
          const resA = await createCutout(epochA.observation_id, {
            ra: raNum,
            dec: decNum,
            size: sizeNum,
          });
          if (!isCancelled && resA.cutout?.preview_url) {
            setPreviewUrlA(resA.cutout.preview_url);
          }
        } else if (!isCancelled) {
          setPreviewUrlA(null);
        }

        if (epochB?.observation_id) {
          const resB = await createCutout(epochB.observation_id, {
            ra: raNum,
            dec: decNum,
            size: sizeNum,
          });
          if (!isCancelled && resB.cutout?.preview_url) {
            setPreviewUrlB(resB.cutout.preview_url);
          }
        } else if (!isCancelled) {
          setPreviewUrlB(null);
        }
      } catch {
        // Fallback gracefully if cutout preview fails
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
  }, [epochA?.observation_id, epochB?.observation_id, ra, dec, cutoutSize]);

  // Pre-comparison compatibility assessment
  const hasBothEpochs = !!(epochA && epochB);
  const isDifferentObservation = epochA?.observation_id !== epochB?.observation_id;
  const isCompatibleBand = epochA?.band === epochB?.band;
  const canCompare = hasBothEpochs && isDifferentObservation;

  return (
    <div className="flex flex-col gap-6 font-mono">
      {/* Workspace Header */}
      <div className="flex flex-col gap-1 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          <h1 className="text-sm sm:text-base font-bold tracking-widest uppercase text-white">
            Differential Analysis & Reprojection Workspace
          </h1>
          <span className="text-[10px] text-neutral-400 uppercase">
            Stage 3 of 5 · Pairwise Epoch Differencing (D = I_b - α · I_a)
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          Scientifically compare two astronomical epochs on a common celestial WCS grid. Validates spatial overlap, measures residual alignment via phase correlation, estimates local background, computes photometric scaling factor α, and performs flux differencing.
        </p>
      </div>

      {/* Epoch Selectors & Pre-Check Console */}
      <section className="relative rounded border border-neutral-800 bg-[#050608] p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
        <div className="pointer-events-none absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-amber-400/80" />
        <div className="pointer-events-none absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-amber-400/80" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-amber-400/80" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-amber-400/80" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-white uppercase">
              Observation Pair Selection
            </span>
            <span className="text-[10px] text-neutral-500 uppercase">
              Reference (Epoch A) and Target (Epoch B)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {canCompare ? (
              <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                Compatibility Verified: Ready for differencing
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                Requires 2 Distinct Epochs
              </span>
            )}
          </div>
        </div>

        {/* Epoch Selectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Epoch A (Reference) */}
          <div className="p-3.5 rounded border border-amber-500/30 bg-amber-950/10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase">
                Epoch A (Reference Image: I_a)
              </span>
              <span className="text-[10px] text-neutral-400">Baseline Epoch</span>
            </div>

            {epochA ? (
              <div className="flex flex-col gap-1 text-xs">
                <div className="font-bold text-white text-sm">{epochA.observation_id}</div>
                <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                  <span>Band: {epochA.band || "Unknown"}</span>
                  <span>·</span>
                  <span>Time: {epochA.observation_time?.replace("T", " ") || "N/A"}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-neutral-500 py-2">
                No Epoch A selected. Pick from discovered observations below or from Discovery.
              </div>
            )}

            {/* Change Epoch A Dropdown/List */}
            {availableProducts.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-neutral-800/80">
                <span className="text-[10px] text-neutral-500 uppercase mr-1">Choose A:</span>
                {availableProducts.map((p) => (
                  <button
                    key={`epochA-${p.observation_id}`}
                    onClick={() => onSelectEpochA(p)}
                    className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-all cursor-pointer ${
                      epochA?.observation_id === p.observation_id
                        ? "bg-amber-400 text-black font-bold"
                        : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {p.band?.replace("SPHEREx-", "")} · {p.observation_id?.slice(-8)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Epoch B (Target) */}
          <div className="p-3.5 rounded border border-cyan-500/30 bg-cyan-950/10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 uppercase">
                Epoch B (Comparison Target: I_b)
              </span>
              <span className="text-[10px] text-neutral-400">Target Search Epoch</span>
            </div>

            {epochB ? (
              <div className="flex flex-col gap-1 text-xs">
                <div className="font-bold text-white text-sm">{epochB.observation_id}</div>
                <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                  <span>Band: {epochB.band || "Unknown"}</span>
                  <span>·</span>
                  <span>Time: {epochB.observation_time?.replace("T", " ") || "N/A"}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-neutral-500 py-2">
                No Epoch B selected. Pick from discovered observations below or from Discovery.
              </div>
            )}

            {/* Change Epoch B Dropdown/List */}
            {availableProducts.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-neutral-800/80">
                <span className="text-[10px] text-neutral-500 uppercase mr-1">Choose B:</span>
                {availableProducts.map((p) => (
                  <button
                    key={`epochB-${p.observation_id}`}
                    onClick={() => onSelectEpochB(p)}
                    className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-all cursor-pointer ${
                      epochB?.observation_id === p.observation_id
                        ? "bg-cyan-400 text-black font-bold"
                        : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {p.band?.replace("SPHEREx-", "")} · {p.observation_id?.slice(-8)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Incompatibility Caveats */}
        {hasBothEpochs && !isDifferentObservation && (
          <div className="rounded border border-amber-500/40 bg-amber-950/20 p-2.5 text-xs text-amber-300">
            Caveat: Epoch A and Epoch B must be distinct observations to detect temporal flux changes.
          </div>
        )}

        {hasBothEpochs && !isCompatibleBand && (
          <div className="rounded border border-amber-500/40 bg-amber-950/20 p-2.5 text-xs text-amber-300">
            Warning: Epoch A ({epochA?.band}) and Epoch B ({epochB?.band}) are in different spectral bands. Comparing differing spectral filters produces spectral index differences rather than true temporal variability.
          </div>
        )}

        {/* Pipeline Execution Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-900">
          <div className="text-[11px] text-neutral-400">
            Pipeline: Bilinear reprojection · Phase correlation alignment verification · Median background subtraction
          </div>

          <button
            onClick={onRunComparison}
            disabled={!canCompare || isComparing}
            className="flex items-center gap-2 px-5 py-2 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 text-black font-bold text-xs uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:text-neutral-500"
          >
            {isComparing ? (
              <>
                <TwinOrbit className="size-4 text-black" />
                <span>PROCESSING DIFFERENTIAL...</span>
              </>
            ) : (
              <span>RUN DIFFERENTIAL COMPARISON</span>
            )}
          </button>
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="rounded border border-rose-500/60 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-rose-400 font-bold">REPROJECTION ERROR:</span>
            <span>{error}</span>
          </div>
          <button
            onClick={onRunComparison}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Coordinated Differential Display & Results */}
      {comparisonResult && (
        <div className="flex flex-col gap-5">
          {/* Scientific Status & Model Header */}
          <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white uppercase">Comparison ID:</span>
              <span className="text-xs text-amber-400 font-bold">{comparisonResult.comparison_id}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                  comparisonResult.scientifically_valid
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                }`}
              >
                {comparisonResult.scientifically_valid ? "Scientifically Verified" : "Caveats Present"}
              </span>
            </div>

            <div className="text-xs text-neutral-400">
              Model: <code className="text-cyan-300">{comparisonResult.metadata?.difference_model || "D = I_b - α · I_a"}</code>
            </div>
          </div>

          {/* Three-Way Comparison Grid: Epoch A, Epoch B, Difference Image */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Panel 1: Epoch A Reference */}
            <div className="rounded border border-neutral-800 bg-[#050608] p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-400">Epoch A (Reference)</span>
                <span className="text-[10px] text-neutral-400">{epochA?.observation_time?.split("T")[0]}</span>
              </div>
              <div className="relative aspect-square w-full rounded bg-black border border-neutral-900 overflow-hidden flex items-center justify-center">
                {isLoadingPreviews && !previewUrlA ? (
                  <div className="flex flex-col items-center gap-2">
                    <TwinOrbit className="size-5 text-amber-400" />
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                      Loading Epoch A Cutout...
                    </span>
                  </div>
                ) : previewUrlA ? (
                  <img
                    src={getFileUrl(previewUrlA)}
                    alt={`Epoch A (${epochA?.observation_id})`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-xs text-neutral-500 text-center p-4">
                    <span>No Preview for Epoch A</span>
                    <div className="text-[10px] text-neutral-600 mt-1">{epochA?.observation_id?.slice(-16)}</div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                <span>Baseline reference</span>
                {epochA?.fits_access_url && (
                  <a
                    href={epochA.fits_access_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-400 hover:text-amber-200 underline"
                  >
                    Download FITS
                  </a>
                )}
              </div>
            </div>

            {/* Panel 2: Epoch B Target */}
            <div className="rounded border border-neutral-800 bg-[#050608] p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-cyan-400">Epoch B (Target)</span>
                <span className="text-[10px] text-neutral-400">{epochB?.observation_time?.split("T")[0]}</span>
              </div>
              <div className="relative aspect-square w-full rounded bg-black border border-neutral-900 overflow-hidden flex items-center justify-center">
                {isLoadingPreviews && !previewUrlB ? (
                  <div className="flex flex-col items-center gap-2">
                    <TwinOrbit className="size-5 text-cyan-400" />
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                      Loading Epoch B Cutout...
                    </span>
                  </div>
                ) : previewUrlB ? (
                  <img
                    src={getFileUrl(previewUrlB)}
                    alt={`Epoch B (${epochB?.observation_id})`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-xs text-neutral-500 text-center p-4">
                    <span>No Preview for Epoch B</span>
                    <div className="text-[10px] text-neutral-600 mt-1">{epochB?.observation_id?.slice(-16)}</div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                <span>Target comparison</span>
                {epochB?.fits_access_url && (
                  <a
                    href={epochB.fits_access_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-200 underline"
                  >
                    Download FITS
                  </a>
                )}
              </div>
            </div>

            {/* Panel 3: Difference Image or Uncertainty */}
            <div className="rounded border border-amber-500/50 bg-[#050608] p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-amber-300">Difference Product</span>
                  <span className="text-[10px] text-neutral-500">(D)</span>
                </div>
                <div className="flex items-center gap-1 text-[9px]">
                  {(["difference", "uncertainty", "mask"] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setActiveSubView(view)}
                      className={`px-1.5 py-0.5 rounded uppercase ${
                        activeSubView === view
                          ? "bg-amber-400 text-black font-bold"
                          : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative aspect-square w-full rounded bg-black border border-neutral-900 overflow-hidden flex items-center justify-center">
                {activeSubView === "difference" && comparisonResult.difference?.preview_url ? (
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
                  <div className="text-xs text-neutral-500 text-center p-4">
                    <span>Difference product processed.</span>
                    <div className="text-[10px] text-neutral-600 mt-1">
                      {comparisonResult.difference?.width} × {comparisonResult.difference?.height} px
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                <span>Unit: {comparisonResult.difference?.unit || "MJy/sr"}</span>
                {comparisonResult.difference?.fits_url && (
                  <a
                    href={getFileUrl(comparisonResult.difference.fits_url)}
                    download
                    className="text-amber-400 hover:text-amber-200 underline"
                  >
                    Download Difference FITS
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Scientific Quality Assessment Checklist */}
          {comparisonResult.quality && (
            <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-xs font-bold tracking-wider uppercase text-white">
                  Scientific Quality Assessment Checklist
                </span>
                <span className="text-[10px] text-neutral-400">
                  Verification criteria implemented by backend pipeline
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {comparisonResult.quality.checks.map((chk, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          chk.status === "PASS"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : chk.status === "WARNING"
                              ? "bg-amber-500/20 text-amber-300"
                              : chk.status === "FAIL"
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        {chk.status}
                      </span>
                      <span className="text-white font-bold">{chk.name}</span>
                    </div>

                    <div className="text-neutral-400 text-right text-[11px] max-w-lg">
                      {chk.message}
                    </div>
                  </div>
                ))}
              </div>

              {/* Explicit Scientific Disclaimer on Alignment and PSF Limits */}
              <div className="mt-2 pt-2 border-t border-neutral-900 text-[10px] text-neutral-500 leading-relaxed">
                Note on astrometric and PSF limits: Image alignment was verified using phase correlation residual measurement ($&lt; 1.5$ px) but is not an applied correction. Single-kernel Gaussian PSF matching was evaluated; spatially-varying convolution kernels were not applied.
              </div>
            </section>
          )}
        </div>
      )}

      {/* Standby State */}
      {!comparisonResult && !isComparing && !error && (
        <div className="rounded border border-neutral-800 bg-[#050608] p-10 text-center flex flex-col items-center justify-center gap-4">
          <div className="h-12 w-12 rounded border border-amber-400/40 bg-amber-500/10 flex items-center justify-center text-amber-400 text-lg font-bold">
            ⚖
          </div>
          <div className="max-w-md flex flex-col gap-1">
            <h3 className="text-sm sm:text-base font-bold tracking-[0.2em] text-white uppercase">
              Differential Comparison Ready
            </h3>
            <p className="text-xs text-neutral-400">
              Select two observation epochs above as Epoch A (reference) and Epoch B (target), then click Run Differential Comparison to reproject and calculate the residual flux image.
            </p>
          </div>
          {!hasBothEpochs && (
            <button
              onClick={() => onNavigateTab("discovery")}
              className="mt-2 inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
            >
              <span>Pick Epochs in Discovery</span>
              <span className="text-amber-400">▶</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

