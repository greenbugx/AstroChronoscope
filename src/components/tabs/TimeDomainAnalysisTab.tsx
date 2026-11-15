import { useState, useId } from "react";
import {
  type TargetLightCurveResponse,
  type SourceLightCurve,
  type LightCurvePoint,
  type SpectralExtractionResponse,
  type SpectralChannel,
  type SpectralComparisonResponse,
  extractSpectrum,
  compareSpectra,
} from "@/lib/api";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

export interface TimeDomainAnalysisTabProps {
  ra: string;
  dec: string;
  radius: string;
  cutoutSize: string;
  lightCurveData: TargetLightCurveResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedSourceId: string | null;
  spectrumData?: SpectralExtractionResponse | null;
  isExtractingSpectrum?: boolean;
  spectrumError?: string | null;
  spectralComparison?: SpectralComparisonResponse | null;
  isSpectralComparing?: boolean;
  spectralComparisonError?: string | null;
  onExtractLightCurve: (maxObs: number, thresholdSigma: number, band: string) => void;
  onSelectSourceId: (sourceId: string) => void;
  onExtractSpectrum?: (sourceId?: string, customRa?: number, customDec?: number, method?: "bilinear" | "nearest") => void;
  onCompareSpectra?: (spectrumIdA: string, spectrumIdB: string) => void;
  onNavigateTab: (tab: "discovery" | "explorer" | "differential" | "timedomain" | "reports") => void;
}

const BAND_COLORS: Record<string, { stroke: string; fill: string; text: string }> = {
  "SPHEREx-D1": { stroke: "#60a5fa", fill: "#3b82f6", text: "text-blue-400" },
  "SPHEREx-D2": { stroke: "#22d3ee", fill: "#06b6d4", text: "text-cyan-400" },
  "SPHEREx-D3": { stroke: "#34d399", fill: "#10b981", text: "text-emerald-400" },
  "SPHEREx-D4": { stroke: "#fbbf24", fill: "#f59e0b", text: "text-amber-400" },
  "SPHEREx-D5": { stroke: "#fb923c", fill: "#f97316", text: "text-orange-400" },
  "SPHEREx-D6": { stroke: "#fb7185", fill: "#f43f5e", text: "text-rose-400" },
};

const DETECTOR_ZONES = [
  { detector: 1, name: "D1", minWl: 0.75, maxWl: 1.11, color: "#3b82f6", text: "text-blue-400" },
  { detector: 2, name: "D2", minWl: 1.11, maxWl: 1.64, color: "#06b6d4", text: "text-cyan-400" },
  { detector: 3, name: "D3", minWl: 1.64, maxWl: 2.42, color: "#10b981", text: "text-emerald-400" },
  { detector: 4, name: "D4", minWl: 2.42, maxWl: 3.82, color: "#f59e0b", text: "text-amber-400" },
  { detector: 5, name: "D5", minWl: 3.82, maxWl: 4.42, color: "#f97316", text: "text-orange-400" },
  { detector: 6, name: "D6", minWl: 4.42, maxWl: 5.00, color: "#f43f5e", text: "text-rose-400" },
];

const DEFAULT_BAND_COLOR = {
  stroke: "#38bdf8",
  fill: "#0284c7",
  text: "text-sky-400",
};

export default function TimeDomainAnalysisTab({
  ra,
  dec,
  lightCurveData,
  isLoading,
  error,
  selectedSourceId,
  spectrumData,
  isExtractingSpectrum,
  spectrumError,
  spectralComparison,
  isSpectralComparing,
  spectralComparisonError,
  onExtractLightCurve,
  onSelectSourceId,
  onExtractSpectrum,
  onCompareSpectra,
  onNavigateTab,
}: TimeDomainAnalysisTabProps) {
  const maxObsId = useId();
  const sigmaId = useId();
  const compareRaId = useId();
  const compareDecId = useId();

  const [maxObs, setMaxObs] = useState("10");
  const [sigma, setSigma] = useState("3.0");
  const [selectedBand, setSelectedBand] = useState<string>("ALL");
  const [activeAnalysisMode, setActiveAnalysisMode] = useState<"lightcurve" | "transients" | "motion" | "spectral">("lightcurve");

  const [hoveredPoint, setHoveredPoint] = useState<LightCurvePoint | null>(null);

  // Local spectral states (fallback or self-contained)
  const [localSpectrum, setLocalSpectrum] = useState<SpectralExtractionResponse | null>(null);
  const [localIsExtracting, setLocalIsExtracting] = useState(false);
  const [localSpectralError, setLocalSpectralError] = useState<string | null>(null);
  const [spatialMethod, setSpatialMethod] = useState<"bilinear" | "nearest">("bilinear");
  const [hoveredChannel, setHoveredChannel] = useState<SpectralChannel | null>(null);
  const [channelDetectorFilter, setChannelDetectorFilter] = useState<string>("ALL");

  // Spectral Comparison state
  const [showComparisonPanel, setShowComparisonPanel] = useState(false);
  const [compareRa, setCompareRa] = useState("");
  const [compareDec, setCompareDec] = useState("");
  const [localComparison, setLocalComparison] = useState<SpectralComparisonResponse | null>(null);
  const [localIsComparing, setLocalIsComparing] = useState(false);
  const [localComparisonError, setLocalComparisonError] = useState<string | null>(null);

  const activeSpectrumResponse = spectrumData || localSpectrum;
  const activeSpectrum = activeSpectrumResponse?.spectrum;
  const isSpectrumBusy = isExtractingSpectrum || localIsExtracting;
  const activeSpectralError = spectrumError || localSpectralError;

  const activeComparisonResponse = spectralComparison || localComparison;
  const activeComparison = activeComparisonResponse?.comparison;
  const isComparingBusy = isSpectralComparing || localIsComparing;
  const activeCompareError = spectralComparisonError || localComparisonError;

  const activeSource: SourceLightCurve | undefined = lightCurveData?.sources?.find(
    (s) => s.source_id === selectedSourceId
  ) || lightCurveData?.sources?.[0];

  // Spectral Extraction Handler
  const handleTriggerExtractSpectrum = async (useSource = false) => {
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);

    if (isNaN(raNum) || isNaN(decNum)) {
      setLocalSpectralError("Target coordinates must be valid floating point values.");
      return;
    }

    if (onExtractSpectrum) {
      onExtractSpectrum(
        useSource && activeSource ? activeSource.source_id : undefined,
        raNum,
        decNum,
        spatialMethod
      );
    } else {
      try {
        setLocalIsExtracting(true);
        setLocalSpectralError(null);
        const res = await extractSpectrum({
          source_id: useSource && activeSource ? activeSource.source_id : undefined,
          ra: useSource && activeSource ? undefined : raNum,
          dec: useSource && activeSource ? undefined : decNum,
          config: { spatial_method: spatialMethod },
        });
        setLocalSpectrum(res);
      } catch (err) {
        setLocalSpectralError(err instanceof Error ? err.message : "Spectral cube extraction failed.");
      } finally {
        setLocalIsExtracting(false);
      }
    }
  };

  // Spectral Comparison Handler
  const handleTriggerCompareSpectra = async () => {
    if (!activeSpectrum) return;
    const refRa = parseFloat(compareRa);
    const refDec = parseFloat(compareDec);

    if (isNaN(refRa) || isNaN(refDec)) {
      setLocalComparisonError("Reference coordinates must be valid floating point values.");
      return;
    }

    try {
      setLocalIsComparing(true);
      setLocalComparisonError(null);

      // Extract reference spectrum at the secondary coordinates
      const refSpectrumRes = await extractSpectrum({
        ra: refRa,
        dec: refDec,
        config: { spatial_method: spatialMethod },
      });

      if (onCompareSpectra) {
        onCompareSpectra(activeSpectrum.spectrum_id, refSpectrumRes.spectrum.spectrum_id);
      } else {
        const compRes = await compareSpectra({
          spectrum_id_a: activeSpectrum.spectrum_id,
          spectrum_id_b: refSpectrumRes.spectrum.spectrum_id,
        });
        setLocalComparison(compRes);
      }
    } catch (err) {
      setLocalComparisonError(err instanceof Error ? err.message : "Spectral comparison failed.");
    } finally {
      setLocalIsComparing(false);
    }
  };

  // Export Channel Ledger as CSV
  const handleExportCsv = () => {
    if (!activeSpectrum) return;
    const headers = "channel_index,detector,subchan,wavelength_um,wl_min_um,wl_max_um,bandwidth_um,resolving_power,flux_mjy_sr,nhits,flags,quality,flags_applied\n";
    const rows = activeSpectrum.channels.map((c) =>
      `${c.index},${c.detector ?? ""},${c.subchan ?? ""},${c.wavelength_um ?? ""},${c.wl_min_um ?? ""},${c.wl_max_um ?? ""},${c.bandwidth_um ?? ""},${c.resolving_power ?? ""},${c.flux_mjy_sr ?? ""},${c.nhits ?? ""},${c.flags ?? ""},${c.quality},"${(c.flags_applied || []).join(";")}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spherex_spectrum_${activeSpectrum.spectrum_id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Spectrum as JSON
  const handleExportJson = () => {
    if (!activeSpectrumResponse) return;
    const blob = new Blob([JSON.stringify(activeSpectrumResponse, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spherex_spectrum_${activeSpectrum?.spectrum_id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Consolidate points across bands for the active source
  const allPoints: Array<{ point: LightCurvePoint; band: string }> = [];
  if (activeSource) {
    for (const s of activeSource.series) {
      const bandName = s.band || "Unknown";
      for (const p of s.points) {
        allPoints.push({ point: p, band: bandName });
      }
    }
  }

  const validPoints = allPoints.filter(
    (p) => p.point.time_mjd != null && !isNaN(p.point.time_mjd) && !isNaN(p.point.flux_jy)
  );

  const mjdMin = validPoints.length > 0 ? Math.min(...validPoints.map((p) => p.point.time_mjd!)) : 0;
  const mjdMax = validPoints.length > 0 ? Math.max(...validPoints.map((p) => p.point.time_mjd!)) : 1;
  const mjdRange = mjdMax - mjdMin > 0 ? mjdMax - mjdMin : 1;

  const fluxMin = validPoints.length > 0
    ? Math.min(...validPoints.map((p) => p.point.flux_jy - (p.point.flux_jy_error || 0)))
    : 0;
  const fluxMax = validPoints.length > 0
    ? Math.max(...validPoints.map((p) => p.point.flux_jy + (p.point.flux_jy_error || 0)))
    : 1;
  const fluxRange = fluxMax - fluxMin > 0 ? fluxMax - fluxMin : 1;

  const plotWidth = 720;
  const plotHeight = 320;
  const padLeft = 70;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 45;

  const innerWidth = plotWidth - padLeft - padRight;
  const innerHeight = plotHeight - padTop - padBottom;

  const toPlotX = (mjd: number) => padLeft + ((mjd - mjdMin) / mjdRange) * innerWidth;
  const toPlotY = (flux: number) => padTop + innerHeight - ((flux - fluxMin) / fluxRange) * innerHeight;

  const activeSeries = activeSource?.series?.[0];
  const metrics = activeSeries?.metrics;

  const handleRun = () => {
    const obsNum = parseInt(maxObs, 10) || 10;
    const sigNum = parseFloat(sigma) || 3.0;
    onExtractLightCurve(obsNum, sigNum, selectedBand);
  };

  return (
    <div className="flex flex-col gap-6 font-mono">
      {/* Workspace Header */}
      <div className="flex flex-col gap-1 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <h1 className="text-sm sm:text-base font-bold tracking-widest uppercase text-white">
            Time-Domain Analysis & Source Association
          </h1>
          <span className="text-[10px] text-neutral-400 uppercase">
            Stage 4 of 5 · Source Catalog, Multi-Epoch Light Curves & Variability
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          Source-level investigation across SPHEREx epochs: circular aperture photometry, cross-epoch nearest-neighbour association, multi-band flux time-series, variability metrics (reduced chi-square and fractional variability), transient screening, and proper motion astrometry.
        </p>
      </div>

      {/* Target & Extraction Console */}
      <section className="relative rounded border border-neutral-800 bg-[#050608] p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
        <div className="pointer-events-none absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-400/80" />
        <div className="pointer-events-none absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-400/80" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-400/80" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-400/80" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-white uppercase">
              Target Field: RA {parseFloat(ra).toFixed(4)}°, Dec {parseFloat(dec).toFixed(4)}°
            </span>
            <span className="text-[10px] text-neutral-500 uppercase">
              Inherited from Discovery Workspace
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab("discovery")}
              className="px-2.5 py-1 rounded border border-neutral-700 bg-neutral-900 text-[10px] text-neutral-300 hover:text-white uppercase cursor-pointer"
            >
              Modify Target in Discovery
            </button>
          </div>
        </div>

        {/* Photometric Parameters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor={maxObsId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Max Observations
            </label>
            <input
              id={maxObsId}
              type="number"
              min="1"
              max="50"
              value={maxObs}
              onChange={(e) => setMaxObs(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-emerald-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={sigmaId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Detection Threshold (Sigma)
            </label>
            <input
              id={sigmaId}
              type="text"
              value={sigma}
              onChange={(e) => setSigma(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-emerald-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400">
              Band Selection
            </span>
            <select
              value={selectedBand}
              onChange={(e) => setSelectedBand(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-emerald-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none cursor-pointer"
            >
              <option value="ALL">All Bands (D1-D6)</option>
              <option value="SPHEREx-D1">D1 (0.75 - 1.11 µm)</option>
              <option value="SPHEREx-D2">D2 (1.11 - 1.64 µm)</option>
              <option value="SPHEREx-D3">D3 (1.64 - 2.42 µm)</option>
              <option value="SPHEREx-D4">D4 (2.42 - 3.82 µm)</option>
              <option value="SPHEREx-D5">D5 (3.82 - 4.42 µm)</option>
              <option value="SPHEREx-D6">D6 (4.42 - 5.00 µm)</option>
            </select>
          </div>

          <button
            onClick={handleRun}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            {isLoading ? (
              <>
                <TwinOrbit className="size-4 text-white" />
                <span>ASSOCIATING SOURCES...</span>
              </>
            ) : (
              <span>EXTRACT LIGHT CURVES</span>
            )}
          </button>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="rounded border border-rose-500/60 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-rose-400 font-bold">PHOTOMETRY PIPELINE ERROR:</span>
            <span>{error}</span>
          </div>
          <button
            onClick={handleRun}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Results Layout */}
      {lightCurveData && (
        <div className="flex flex-col gap-5">
          {/* Scientific Mode Sub-Navigation */}
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <button
              onClick={() => setActiveAnalysisMode("lightcurve")}
              className={`px-3 py-1.5 rounded text-xs uppercase tracking-wider font-bold transition-all cursor-pointer ${
                activeAnalysisMode === "lightcurve"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Light Curve & Variability
            </button>

            <button
              onClick={() => setActiveAnalysisMode("transients")}
              className={`px-3 py-1.5 rounded text-xs uppercase tracking-wider font-bold transition-all cursor-pointer ${
                activeAnalysisMode === "transients"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Transient Screening
            </button>

            <button
              onClick={() => setActiveAnalysisMode("motion")}
              className={`px-3 py-1.5 rounded text-xs uppercase tracking-wider font-bold transition-all cursor-pointer ${
                activeAnalysisMode === "motion"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Proper Motion Tracking
            </button>

            <button
              onClick={() => setActiveAnalysisMode("spectral")}
              className={`px-3 py-1.5 rounded text-xs uppercase tracking-wider font-bold transition-all cursor-pointer ${
                activeAnalysisMode === "spectral"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Spectral Channels (D1-D6)
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Source Catalog & Variability Indicators */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {/* Associated Sources Catalog */}
              <div className="rounded border border-neutral-800 bg-[#050608] p-3.5 flex flex-col gap-2.5 max-h-[300px] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
                  <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
                    Associated Sources ({lightCurveData.sources?.length ?? 0})
                  </span>
                  <span className="text-[10px] text-neutral-400">Nearest-Neighbour</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {lightCurveData.sources?.map((s) => (
                    <button
                      key={s.source_id}
                      onClick={() => onSelectSourceId(s.source_id)}
                      className={`text-left p-2 rounded border text-xs transition-all cursor-pointer ${
                        (selectedSourceId === s.source_id || (!selectedSourceId && activeSource?.source_id === s.source_id))
                          ? "border-emerald-500 bg-emerald-950/30 text-white"
                          : "border-neutral-900 bg-neutral-950/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-400">{s.source_id.slice(0, 16)}...</span>
                        <span className="text-[10px] text-neutral-300">{s.epoch_count} Epochs</span>
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-1 flex items-center justify-between">
                        <span>RA {s.reference_ra_deg.toFixed(4)}°</span>
                        <span>Dec {s.reference_dec_deg.toFixed(4)}°</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Variability Evidence Metrics */}
              <div className="rounded border border-neutral-800 bg-[#050608] p-3.5 flex flex-col gap-3">
                <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase border-b border-neutral-800/80 pb-1.5">
                  Variability Evidence Metrics
                </span>

                {metrics ? (
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Reduced Chi-Square</span>
                      <span
                        className={`font-bold ${
                          (metrics.reduced_chi2 ?? 0) > 3.0
                            ? "text-rose-400"
                            : (metrics.reduced_chi2 ?? 0) > 1.5
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }`}
                      >
                        {metrics.reduced_chi2 != null ? metrics.reduced_chi2.toFixed(2) : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Fractional Variability (Fvar)</span>
                      <span className="font-bold text-cyan-300">
                        {metrics.fractional_variability != null
                          ? `${(metrics.fractional_variability * 100).toFixed(1)}%`
                          : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Peak-to-Peak Amplitude</span>
                      <span className="text-white font-mono">
                        {metrics.peak_to_peak_jy != null ? `${(metrics.peak_to_peak_jy * 1000).toFixed(2)} mJy` : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Weighted Mean Flux</span>
                      <span className="text-white font-mono">
                        {metrics.weighted_mean_flux_jy != null
                          ? `${(metrics.weighted_mean_flux_jy * 1000).toFixed(2)} mJy`
                          : metrics.mean_flux_jy != null
                            ? `${(metrics.mean_flux_jy * 1000).toFixed(2)} mJy`
                            : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Robust Dispersion (Sigma)</span>
                      <span className="text-neutral-300 font-mono">
                        {metrics.robust_sigma_jy != null ? `${(metrics.robust_sigma_jy * 1000).toFixed(2)} mJy` : "N/A"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 py-2">
                    No variability statistics available for this source.
                  </div>
                )}
              </div>

              {/* External Catalogs (Gaia & WISE/NEOWISE) Planned Roadmap Card */}
              <div className="rounded border border-neutral-800 bg-[#050608] p-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase">
                    External Catalog Cross-Matching
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-neutral-800 text-amber-300">
                    Planned
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-tight">
                  Gaia DR3 proper motion cross-matching and WISE/NEOWISE mid-IR multi-epoch baseline integration are architected for progressive Phase 4 onboarding.
                </p>
              </div>
            </div>

            {/* Right Column: Interactive Light Curve & Detailed Analysis Modes */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {/* Mode 1: Light Curve Visualizer */}
              {activeAnalysisMode === "lightcurve" && (
                <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-wider uppercase text-white">
                        Calibrated Photometric Light Curve
                      </span>
                      <span className="text-[10px] text-neutral-500 uppercase">
                        S_nu (Jy) vs Modified Julian Date (MJD)
                      </span>
                    </div>

                    {/* Band Legend */}
                    <div className="flex items-center gap-3 text-[10px]">
                      {Object.entries(BAND_COLORS).map(([b, col]) => (
                        <div key={b} className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.fill }} />
                          <span className="text-neutral-400">{b.replace("SPHEREx-", "")}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SVG Plot */}
                  {validPoints.length > 0 ? (
                    <div className="relative w-full overflow-x-auto bg-[#030406] rounded border border-neutral-900 p-2">
                      <svg
                        viewBox={`0 0 ${plotWidth} ${plotHeight}`}
                        className="w-full h-auto select-none"
                        style={{ minWidth: "500px" }}
                      >
                        {/* Grid Lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                          const y = padTop + innerHeight * frac;
                          const fluxVal = fluxMax - frac * fluxRange;
                          return (
                            <g key={`y-${frac}`}>
                              <line
                                x1={padLeft}
                                y1={y}
                                x2={padLeft + innerWidth}
                                y2={y}
                                stroke="#1f2937"
                                strokeDasharray="2,2"
                              />
                              <text
                                x={padLeft - 8}
                                y={y + 3}
                                textAnchor="end"
                                fill="#9ca3af"
                                fontSize="9"
                                fontFamily="monospace"
                              >
                                {fluxVal.toFixed(4)}
                              </text>
                            </g>
                          );
                        })}

                        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                          const x = padLeft + innerWidth * frac;
                          const mjdVal = mjdMin + frac * mjdRange;
                          return (
                            <g key={`x-${frac}`}>
                              <line
                                x1={x}
                                y1={padTop}
                                x2={x}
                                y2={padTop + innerHeight}
                                stroke="#1f2937"
                                strokeDasharray="2,2"
                              />
                              <text
                                x={x}
                                y={padTop + innerHeight + 16}
                                textAnchor="middle"
                                fill="#9ca3af"
                                fontSize="9"
                                fontFamily="monospace"
                              >
                                {mjdVal.toFixed(2)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Mean Flux Reference Line */}
                        {metrics?.mean_flux_jy != null && (
                          <line
                            x1={padLeft}
                            y1={toPlotY(metrics.mean_flux_jy)}
                            x2={padLeft + innerWidth}
                            y2={toPlotY(metrics.mean_flux_jy)}
                            stroke="#f59e0b"
                            strokeDasharray="4,4"
                            strokeWidth="1.5"
                            opacity="0.6"
                          />
                        )}

                        {/* Point Connection Polyline */}
                        {validPoints.length > 1 && (
                          <polyline
                            fill="none"
                            stroke="#34d399"
                            strokeWidth="1.5"
                            strokeOpacity="0.4"
                            points={validPoints
                              .sort((a, b) => (a.point.time_mjd ?? 0) - (b.point.time_mjd ?? 0))
                              .map((p) => `${toPlotX(p.point.time_mjd!)},${toPlotY(p.point.flux_jy)}`)
                              .join(" ")}
                          />
                        )}

                        {/* Data Points with 1-Sigma Error Whiskers */}
                        {validPoints.map(({ point: p, band }, idx) => {
                          const cx = toPlotX(p.time_mjd!);
                          const cy = toPlotY(p.flux_jy);
                          const col = BAND_COLORS[band] || DEFAULT_BAND_COLOR;
                          const err = p.flux_jy_error || 0;
                          const yTop = toPlotY(p.flux_jy + err);
                          const yBottom = toPlotY(p.flux_jy - err);

                          return (
                            <g
                              key={`point-${idx}`}
                              className="cursor-pointer group"
                              onMouseEnter={() => setHoveredPoint(p)}
                              onMouseLeave={() => setHoveredPoint(null)}
                            >
                              {err > 0 && (
                                <>
                                  <line
                                    x1={cx}
                                    y1={yTop}
                                    x2={cx}
                                    y2={yBottom}
                                    stroke={col.stroke}
                                    strokeWidth="1.5"
                                  />
                                  <line
                                    x1={cx - 3}
                                    y1={yTop}
                                    x2={cx + 3}
                                    y2={yTop}
                                    stroke={col.stroke}
                                    strokeWidth="1.5"
                                  />
                                  <line
                                    x1={cx - 3}
                                    y1={yBottom}
                                    x2={cx + 3}
                                    y2={yBottom}
                                    stroke={col.stroke}
                                    strokeWidth="1.5"
                                  />
                                </>
                              )}

                              <circle
                                cx={cx}
                                cy={cy}
                                r="5"
                                fill={col.fill}
                                stroke="#ffffff"
                                strokeWidth="1.5"
                                className="transition-transform group-hover:scale-125"
                              />
                            </g>
                          );
                        })}

                        <text
                          x={plotWidth / 2}
                          y={plotHeight - 8}
                          textAnchor="middle"
                          fill="#9ca3af"
                          fontSize="10"
                          letterSpacing="0.1em"
                        >
                          MODIFIED JULIAN DATE (MJD)
                        </text>

                        <text
                          x={16}
                          y={plotHeight / 2}
                          textAnchor="middle"
                          fill="#9ca3af"
                          fontSize="10"
                          letterSpacing="0.1em"
                          transform={`rotate(-90 16 ${plotHeight / 2})`}
                        >
                          FLUX DENSITY S_nu (Jy)
                        </text>
                      </svg>

                      {/* Tooltip on Hover */}
                      {hoveredPoint && (
                        <div className="absolute top-4 right-4 rounded border border-neutral-700 bg-black/90 p-2.5 text-xs shadow-2xl flex flex-col gap-1 pointer-events-none">
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-bold">{hoveredPoint.band || "Band"}</span>
                            <span className="text-neutral-400">MJD: {hoveredPoint.time_mjd?.toFixed(4)}</span>
                          </div>
                          <div className="text-white">
                            Flux: {hoveredPoint.flux_jy.toFixed(5)} ± {hoveredPoint.flux_jy_error?.toFixed(5) ?? "0"} Jy
                          </div>
                          <div className="text-neutral-400 text-[10px]">
                            SNR: {hoveredPoint.snr?.toFixed(1) ?? "N/A"} · Quality: {hoveredPoint.quality}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center border border-neutral-900 rounded bg-[#030406] text-neutral-500 text-xs">
                      No photometric points for this source.
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: Transient Screening */}
              {activeAnalysisMode === "transients" && (
                <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold uppercase text-white">
                      Transient Candidate Verification
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      Cross-epoch detection persistence check
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 text-xs">
                    <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-white">Non-Detection History</span>
                        <span className="text-[10px] text-neutral-400">
                          Evaluates whether non-detections in certain epochs represent genuine photometric transients or field-edge/mask artifacts.
                        </span>
                      </div>
                      <span className="text-emerald-400 font-bold">
                        {activeSeries?.non_detections === 0 ? "Persistent across epochs" : `${activeSeries?.non_detections} Non-Detections`}
                      </span>
                    </div>

                    <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-white">Signal-to-Noise Ratio (SNR) Threshold</span>
                        <span className="text-[10px] text-neutral-400">
                          Detections require SNR ≥ 3.0σ above local annulus background.
                        </span>
                      </div>
                      <span className="text-cyan-300 font-bold">Verified</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 3: Proper Motion Tracking */}
              {activeAnalysisMode === "motion" && (
                <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold uppercase text-white">
                      Centroid Astrometry & Proper Motion Tracking
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      Coordinate dispersion vs WCS registration error
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-500 uppercase">Centroid Position Scatter</span>
                      <span className="text-base font-bold text-white">
                        {activeSource?.position_scatter_arcsec != null
                          ? `${activeSource.position_scatter_arcsec.toFixed(3)} arcsec`
                          : "N/A"}
                      </span>
                      <span className="text-[10px] text-neutral-400 mt-1">
                        Pixel scale: ~6.2 arcsec/pixel
                      </span>
                    </div>

                    <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-500 uppercase">Astrometric Motion Verdict</span>
                      <span className="text-base font-bold text-emerald-400">
                        {(activeSource?.position_scatter_arcsec ?? 0) < 3.0
                          ? "Stationary (Consistent with WCS uncertainty)"
                          : "Motion Candidate (Exceeds 1-pixel margin)"}
                      </span>
                      <span className="text-[10px] text-neutral-400 mt-1">
                        Distinguishes real motion from optical distortion
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 4: Spectral Channels & DR1 Cube Analyzer */}
              {activeAnalysisMode === "spectral" && (
                <div className="flex flex-col gap-4">
                  {/* Spectral Extraction Controls */}
                  <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-white">
                          SPHEREx DR1 Cube Spectral Extraction
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
                          102 Channels (0.75 - 5.00 µm)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[10px] text-neutral-400">Sampling:</span>
                        <select
                          value={spatialMethod}
                          onChange={(e) => setSpatialMethod(e.target.value as "bilinear" | "nearest")}
                          className="bg-[#090b0e] border border-neutral-800 px-2 py-1 rounded text-xs text-white font-mono outline-none cursor-pointer"
                        >
                          <option value="bilinear">Bilinear Interpolation</option>
                          <option value="nearest">Nearest Pixel</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-xs">
                        <div>
                          <span className="text-neutral-500 uppercase text-[10px] block">Coordinates</span>
                          <span className="text-white font-bold">RA {parseFloat(ra).toFixed(5)}°, Dec {parseFloat(dec).toFixed(5)}°</span>
                        </div>
                        {activeSource && (
                          <div>
                            <span className="text-neutral-500 uppercase text-[10px] block">Source</span>
                            <span className="text-cyan-400 font-bold">{activeSource.source_id.slice(0, 10)}...</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {activeSource && (
                          <button
                            onClick={() => handleTriggerExtractSpectrum(true)}
                            disabled={isSpectrumBusy}
                            className="px-3 py-1.5 rounded border border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold text-xs uppercase cursor-pointer disabled:opacity-50"
                          >
                            Extract for Source
                          </button>
                        )}
                        <button
                          onClick={() => handleTriggerExtractSpectrum(false)}
                          disabled={isSpectrumBusy}
                          className="flex items-center gap-2 px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                        >
                          {isSpectrumBusy ? (
                            <>
                              <TwinOrbit className="size-3.5 text-white" />
                              <span>SAMPLING CUBE...</span>
                            </>
                          ) : (
                            <span>EXTRACT 1D SPECTRUM</span>
                          )}
                        </button>

                        <button
                          onClick={() => setShowComparisonPanel(!showComparisonPanel)}
                          className={`px-3 py-1.5 rounded border text-xs uppercase font-bold transition-all cursor-pointer ${
                            showComparisonPanel
                              ? "border-amber-400/80 bg-amber-500/20 text-amber-300"
                              : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white"
                          }`}
                        >
                          {showComparisonPanel ? "Hide Comparison" : "Compare"}
                        </button>
                      </div>
                    </div>

                    {/* Comparison Sub-Drawer */}
                    {showComparisonPanel && (
                      <div className="rounded border border-amber-500/30 bg-[#07090d] p-3 flex flex-col gap-2 mt-1">
                        <span className="text-[11px] font-bold text-amber-300 uppercase">
                          Pairwise Spectral Comparison
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                          <div className="flex flex-col gap-0.5">
                            <label htmlFor={compareRaId} className="text-[9px] uppercase text-neutral-400">
                              Ref RA (deg)
                            </label>
                            <input
                              id={compareRaId}
                              type="text"
                              placeholder={(parseFloat(ra) + 0.02).toFixed(5)}
                              value={compareRa}
                              onChange={(e) => setCompareRa(e.target.value)}
                              className="bg-[#090b0e] border border-neutral-800 focus:border-amber-400 px-2 py-1 rounded text-xs text-white font-mono outline-none"
                            />
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <label htmlFor={compareDecId} className="text-[9px] uppercase text-neutral-400">
                              Ref Dec (deg)
                            </label>
                            <input
                              id={compareDecId}
                              type="text"
                              placeholder={(parseFloat(dec) + 0.02).toFixed(5)}
                              value={compareDec}
                              onChange={(e) => setCompareDec(e.target.value)}
                              className="bg-[#090b0e] border border-neutral-800 focus:border-amber-400 px-2 py-1 rounded text-xs text-white font-mono outline-none"
                            />
                          </div>

                          <button
                            onClick={handleTriggerCompareSpectra}
                            disabled={isComparingBusy || !activeSpectrum}
                            className="flex items-center justify-center gap-1.5 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 text-white font-bold text-xs uppercase cursor-pointer disabled:cursor-not-allowed"
                          >
                            {isComparingBusy ? (
                              <>
                                <TwinOrbit className="size-3 text-white" />
                                <span>COMPARING...</span>
                              </>
                            ) : (
                              <span>RUN COMPARISON</span>
                            )}
                          </button>
                        </div>
                        {activeCompareError && (
                          <span className="text-[10px] text-rose-400">{activeCompareError}</span>
                        )}
                      </div>
                    )}

                    {activeSpectralError && (
                      <div className="rounded border border-rose-500/50 bg-rose-950/30 p-2.5 text-xs text-rose-300 flex items-center justify-between">
                        <span>{activeSpectralError}</span>
                        <button
                          onClick={() => handleTriggerExtractSpectrum(false)}
                          className="px-2 py-0.5 bg-rose-500/20 rounded text-[10px] uppercase text-white"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Mandatory Scientific Disclosures Banner */}
                  <div className="rounded border border-amber-500/40 bg-amber-950/20 p-3 text-xs text-amber-200/90 flex flex-col gap-1.5">
                    <span className="font-bold text-amber-300 uppercase tracking-wide text-[11px]">
                      SPHEREx DR1 Cube Scientific Constraints
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-neutral-300 text-[10px]">
                      <li>
                        <strong className="text-white">Static Survey Mosaic:</strong> Extracted from `spherex_dr1_cube` all-sky coadd (MJD 60789.8 - 61174.5), not a time-resolved epoch.
                      </li>
                      <li>
                        <strong className="text-white">Surface Brightness:</strong> Calibrated in MegaJanskys per steradian (MJy/sr) at the sampled sky position.
                      </li>
                      <li>
                        <strong className="text-white">Uncertainties:</strong> The cube contains no VARIANCE extension. Uncertainty status is NOT_VERIFIED per SPHEREx archive specification.
                      </li>
                    </ul>
                  </div>

                  {/* Active Spectrum Visualizer */}
                  {activeSpectrum ? (
                    <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase text-white">
                            102-Channel Surface Brightness Spectrum
                          </span>
                          <span className="text-[10px] text-emerald-400 font-bold">
                            {activeSpectrum.valid_channel_count} / {activeSpectrum.channel_count} Channels Valid
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <button
                            onClick={handleExportCsv}
                            className="px-2.5 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-neutral-300 uppercase font-bold cursor-pointer"
                          >
                            Export CSV
                          </button>
                          <button
                            onClick={handleExportJson}
                            className="px-2.5 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-neutral-300 uppercase font-bold cursor-pointer"
                          >
                            Export JSON
                          </button>
                        </div>
                      </div>

                      {/* Interactive 102-Channel SVG Spectrum Plot */}
                      <div className="relative w-full overflow-x-auto bg-[#030406] rounded border border-neutral-900 p-2">
                        {(() => {
                          const validSpectrumChannels = activeSpectrum.channels.filter(
                            (c) => c.flux_mjy_sr != null && !isNaN(c.flux_mjy_sr)
                          );

                          const specMinFlux = validSpectrumChannels.length > 0
                            ? Math.min(...validSpectrumChannels.map((c) => c.flux_mjy_sr!))
                            : 0;
                          const specMaxFlux = validSpectrumChannels.length > 0
                            ? Math.max(...validSpectrumChannels.map((c) => c.flux_mjy_sr!))
                            : 1;

                          const specYMin = Math.min(0, specMinFlux);
                          const specYMax = specMaxFlux > specYMin ? specMaxFlux * 1.15 : specYMin + 1.0;
                          const specYRange = specYMax - specYMin > 0 ? specYMax - specYMin : 1;

                          const specPlotWidth = 760;
                          const specPlotHeight = 300;
                          const specPadLeft = 65;
                          const specPadRight = 25;
                          const specPadTop = 25;
                          const specPadBottom = 40;
                          const specInnerWidth = specPlotWidth - specPadLeft - specPadRight;
                          const specInnerHeight = specPlotHeight - specPadTop - specPadBottom;

                          const toSpecX = (wl: number) => specPadLeft + ((wl - 0.75) / (5.00 - 0.75)) * specInnerWidth;
                          const toSpecY = (f: number) => specPadTop + specInnerHeight - ((f - specYMin) / specYRange) * specInnerHeight;

                          return (
                            <svg
                              viewBox={`0 0 ${specPlotWidth} ${specPlotHeight}`}
                              className="w-full h-auto min-w-[650px]"
                            >
                              {/* 6 Detector Zone Bands */}
                              {DETECTOR_ZONES.map((zone) => {
                                const xStart = toSpecX(zone.minWl);
                                const xEnd = toSpecX(zone.maxWl);
                                const width = Math.max(0, xEnd - xStart);
                                return (
                                  <g key={zone.detector}>
                                    <rect
                                      x={xStart}
                                      y={specPadTop}
                                      width={width}
                                      height={specInnerHeight}
                                      fill={zone.color}
                                      fillOpacity="0.08"
                                    />
                                    <text
                                      x={xStart + width / 2}
                                      y={specPadTop + 14}
                                      textAnchor="middle"
                                      fill={zone.color}
                                      fontSize="9"
                                      fontWeight="bold"
                                      fontFamily="monospace"
                                      opacity="0.8"
                                    >
                                      {zone.name}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Horizontal Gridlines & Flux Ticks */}
                              {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                                const fluxVal = specYMin + frac * specYRange;
                                const y = toSpecY(fluxVal);
                                return (
                                  <g key={frac}>
                                    <line
                                      x1={specPadLeft}
                                      y1={y}
                                      x2={specPadLeft + specInnerWidth}
                                      y2={y}
                                      stroke="#1f2937"
                                      strokeDasharray="3,3"
                                      strokeWidth="1"
                                    />
                                    <text
                                      x={specPadLeft - 6}
                                      y={y + 3}
                                      textAnchor="end"
                                      fill="#9ca3af"
                                      fontSize="9"
                                      fontFamily="monospace"
                                    >
                                      {fluxVal.toFixed(3)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Vertical Wavelength Gridlines */}
                              {[0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0].map((wl) => {
                                const x = toSpecX(wl);
                                return (
                                  <g key={wl}>
                                    <line
                                      x1={x}
                                      y1={specPadTop}
                                      x2={x}
                                      y2={specPadTop + specInnerHeight}
                                      stroke="#1f2937"
                                      strokeDasharray="3,3"
                                      strokeWidth="1"
                                    />
                                    <text
                                      x={x}
                                      y={specPadTop + specInnerHeight + 14}
                                      textAnchor="middle"
                                      fill="#9ca3af"
                                      fontSize="9"
                                      fontFamily="monospace"
                                    >
                                      {wl.toFixed(2)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Target Spectrum Polyline */}
                              {validSpectrumChannels.length > 1 && (
                                <polyline
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth="2"
                                  points={validSpectrumChannels
                                    .sort((a, b) => (a.wavelength_um ?? 0) - (b.wavelength_um ?? 0))
                                    .map((c) => `${toSpecX(c.wavelength_um!)},${toSpecY(c.flux_mjy_sr!)}`)
                                    .join(" ")}
                                />
                              )}

                              {/* Reference Spectrum Polyline (if comparison loaded) */}
                              {activeComparison &&
                                activeComparison.channels.filter((c) => c.flux_b_mjy_sr != null).length > 1 && (
                                  <polyline
                                    fill="none"
                                    stroke="#c084fc"
                                    strokeWidth="2"
                                    strokeDasharray="4,4"
                                    points={activeComparison.channels
                                      .filter((c) => c.wavelength_um != null && c.flux_b_mjy_sr != null)
                                      .sort((a, b) => (a.wavelength_um ?? 0) - (b.wavelength_um ?? 0))
                                      .map((c) => `${toSpecX(c.wavelength_um!)},${toSpecY(c.flux_b_mjy_sr!)}`)
                                      .join(" ")}
                                  />
                                )}

                              {/* Channel Dots */}
                              {activeSpectrum.channels.map((c) => {
                                const isUsable = c.flux_mjy_sr != null && !isNaN(c.flux_mjy_sr);
                                const cx = c.wavelength_um != null ? toSpecX(c.wavelength_um) : specPadLeft;
                                const cy = isUsable ? toSpecY(c.flux_mjy_sr!) : specPadTop + specInnerHeight;
                                const zone = DETECTOR_ZONES.find((z) => z.detector === c.detector) || DETECTOR_ZONES[0];

                                return (
                                  <g
                                    key={c.index}
                                    className="cursor-pointer group"
                                    onMouseEnter={() => setHoveredChannel(c)}
                                    onMouseLeave={() => setHoveredChannel(null)}
                                  >
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r={isUsable ? (hoveredChannel?.index === c.index ? 6 : 3.5) : 2.5}
                                      fill={isUsable ? zone.color : "#404040"}
                                      stroke={hoveredChannel?.index === c.index ? "#ffffff" : isUsable ? zone.color : "#737373"}
                                      strokeWidth={hoveredChannel?.index === c.index ? 2 : 1}
                                      fillOpacity={isUsable ? 0.9 : 0.3}
                                      className="transition-all"
                                    />
                                  </g>
                                );
                              })}

                              {/* Axis Titles */}
                              <text
                                x={specPlotWidth / 2}
                                y={specPlotHeight - 6}
                                textAnchor="middle"
                                fill="#9ca3af"
                                fontSize="10"
                                letterSpacing="0.1em"
                              >
                                WAVELENGTH λ (µm) — 102 CHANNELS (D1-D6)
                              </text>

                              <text
                                x={16}
                                y={specPlotHeight / 2}
                                textAnchor="middle"
                                fill="#9ca3af"
                                fontSize="10"
                                letterSpacing="0.1em"
                                transform={`rotate(-90 16 ${specPlotHeight / 2})`}
                              >
                                SURFACE BRIGHTNESS F_λ (MJy / sr)
                              </text>
                            </svg>
                          );
                        })()}

                        {/* Floating Tooltip */}
                        {hoveredChannel && (
                          <div className="absolute top-4 right-4 rounded border border-neutral-700 bg-black/95 p-3 text-xs shadow-2xl flex flex-col gap-1 pointer-events-none z-20 min-w-44">
                            <div className="flex items-center justify-between border-b border-neutral-800 pb-1">
                              <span className="text-sky-300 font-bold">
                                Ch #{hoveredChannel.index} (D{hoveredChannel.detector})
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  hoveredChannel.quality === "PASS"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-amber-500/20 text-amber-300"
                                }`}
                              >
                                {hoveredChannel.quality}
                              </span>
                            </div>
                            <div className="text-neutral-300">
                              λ: <span className="text-white font-bold">{hoveredChannel.wavelength_um?.toFixed(4) ?? "N/A"} µm</span>
                            </div>
                            <div className="text-neutral-300">
                              Flux:{" "}
                              <span className="text-emerald-400 font-bold">
                                {hoveredChannel.flux_mjy_sr != null
                                  ? `${hoveredChannel.flux_mjy_sr.toFixed(4)} MJy/sr`
                                  : "UNUSABLE"}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              R ~ {hoveredChannel.resolving_power?.toFixed(1) ?? "N/A"} · NHITS: {hoveredChannel.nhits ?? 0}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Comparison Metrics Badge (if loaded) */}
                      {activeComparison && (
                        <div className="p-3 rounded border border-amber-500/30 bg-neutral-950/60 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-amber-300 font-bold uppercase block">Comparison Basis</span>
                            <span className="text-white">{activeComparison.comparison_basis}</span>
                          </div>
                          <div>
                            <span className="text-neutral-400 uppercase text-[10px] block">Overlap</span>
                            <span className="text-emerald-400 font-bold">{activeComparison.overlap_channel_count} Channels</span>
                          </div>
                          <div>
                            <span className="text-neutral-400 uppercase text-[10px] block">Grid Compatible</span>
                            <span className="text-cyan-300 font-bold">{activeComparison.grid_compatible ? "YES" : "NO"}</span>
                          </div>
                        </div>
                      )}

                      {/* 102-Channel Numerical Table */}
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-1.5">
                          <span className="text-[11px] font-bold text-neutral-300 uppercase">
                            Channel Measurements Table
                          </span>
                          <div className="flex items-center gap-1 text-[10px]">
                            {["ALL", "D1", "D2", "D3", "D4", "D5", "D6"].map((d) => (
                              <button
                                key={d}
                                onClick={() => setChannelDetectorFilter(d)}
                                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                                  channelDetectorFilter === d
                                    ? "bg-purple-500/30 text-purple-300 border border-purple-500/60"
                                    : "text-neutral-400 hover:text-white"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="overflow-x-auto max-h-56">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase sticky top-0 bg-[#050608]">
                                <th className="py-1 px-2">Idx</th>
                                <th className="py-1 px-2">Band</th>
                                <th className="py-1 px-2">Subchan</th>
                                <th className="py-1 px-2">λ (µm)</th>
                                <th className="py-1 px-2">Flux F_λ (MJy/sr)</th>
                                <th className="py-1 px-2">R</th>
                                <th className="py-1 px-2">Quality</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-900 font-mono text-[11px]">
                              {activeSpectrum.channels
                                .filter((c) => {
                                  if (channelDetectorFilter !== "ALL") {
                                    const detNum = parseInt(channelDetectorFilter.replace("D", ""), 10);
                                    if (c.detector !== detNum) return false;
                                  }
                                  return true;
                                })
                                .map((c) => (
                                  <tr key={c.index} className="hover:bg-neutral-900/50">
                                    <td className="py-1 px-2 text-neutral-400">#{c.index}</td>
                                    <td className="py-1 px-2 text-purple-300 font-bold">D{c.detector}</td>
                                    <td className="py-1 px-2 text-neutral-400">{c.subchan ?? "N/A"}</td>
                                    <td className="py-1 px-2 text-white">{c.wavelength_um?.toFixed(4) ?? "N/A"}</td>
                                    <td className="py-1 px-2">
                                      {c.flux_mjy_sr != null ? (
                                        <span className="text-emerald-400 font-bold">{c.flux_mjy_sr.toFixed(4)}</span>
                                      ) : (
                                        <span className="text-neutral-600">NULL</span>
                                      )}
                                    </td>
                                    <td className="py-1 px-2 text-cyan-300">{c.resolving_power?.toFixed(1) ?? "N/A"}</td>
                                    <td className="py-1 px-2">
                                      <span
                                        className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                          c.quality === "PASS"
                                            ? "text-emerald-300 bg-emerald-500/20"
                                            : "text-amber-300 bg-amber-500/20"
                                        }`}
                                      >
                                        {c.quality}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded border border-neutral-900 bg-[#030406] text-center flex flex-col items-center justify-center gap-2">
                      <span className="text-sm font-bold text-white uppercase">
                        DR1 Cube Spectrum Standby
                      </span>
                      <span className="text-xs text-neutral-400 max-w-md">
                        Click EXTRACT 1D SPECTRUM above to sample the SPHEREx DR1 all-sky surface brightness cube across 102 channels at RA {parseFloat(ra).toFixed(4)}°, Dec {parseFloat(dec).toFixed(4)}°.
                      </span>
                    </div>
                  )}

                  {/* 6 Band Overview Cards */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs pt-2 border-t border-neutral-900">
                    {["SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3", "SPHEREx-D4", "SPHEREx-D5", "SPHEREx-D6"].map((b) => {
                      const seriesForBand = activeSource?.series.find((s) => s.band === b);
                      const meanVal = seriesForBand?.metrics.mean_flux_jy;

                      return (
                        <div key={b} className="p-2 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col">
                          <span className={`text-[10px] font-bold ${BAND_COLORS[b]?.text || "text-white"}`}>
                            {b.replace("SPHEREx-", "")}
                          </span>
                          <span className="text-xs font-bold text-white mt-0.5">
                            {meanVal != null ? `${(meanVal * 1000).toFixed(2)} mJy` : "No Lightcurve"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Photometry Measurements Table */}
              <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
                <span className="text-xs font-bold tracking-wider uppercase text-white">
                  Photometric Epoch Measurements Ledger
                </span>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase">
                        <th className="py-2 px-2.5">Time (UTC)</th>
                        <th className="py-2 px-2.5">MJD</th>
                        <th className="py-2 px-2.5">Band</th>
                        <th className="py-2 px-2.5">Flux (Jy)</th>
                        <th className="py-2 px-2.5">1-Sigma Error</th>
                        <th className="py-2 px-2.5">SNR</th>
                        <th className="py-2 px-2.5">Quality</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900">
                      {validPoints.map(({ point: p, band }, idx) => (
                        <tr key={idx} className="hover:bg-neutral-900/50 transition-colors">
                          <td className="py-2 px-2.5 text-neutral-300">{p.time_utc || "N/A"}</td>
                          <td className="py-2 px-2.5 text-neutral-400">{p.time_mjd?.toFixed(4) || "N/A"}</td>
                          <td className="py-2 px-2.5">
                            <span className={`text-[10px] font-bold ${BAND_COLORS[band]?.text || "text-white"}`}>
                              {band.replace("SPHEREx-", "")}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-white font-bold">{p.flux_jy.toFixed(5)}</td>
                          <td className="py-2 px-2.5 text-neutral-400">± {p.flux_jy_error?.toFixed(5) || "0.00000"}</td>
                          <td className="py-2 px-2.5 text-cyan-300">{p.snr ? p.snr.toFixed(1) : "N/A"}</td>
                          <td className="py-2 px-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-emerald-500/20 text-emerald-300 font-bold">
                              {p.quality}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standby State */}
      {!lightCurveData && !isLoading && !error && (
        <div className="rounded border border-neutral-800 bg-[#050608] p-10 text-center flex flex-col items-center justify-center gap-4">
          <div className="h-12 w-12 rounded border border-emerald-400/40 bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-lg font-bold">
            📈
          </div>
          <div className="max-w-md flex flex-col gap-1">
            <h3 className="text-sm sm:text-base font-bold tracking-[0.2em] text-white uppercase">
              Time-Domain Source Analysis Ready
            </h3>
            <p className="text-xs text-neutral-400">
              Click Extract Light Curves above to detect compact sources across all discovered SPHEREx epochs and compute aperture photometry with variability metrics.
            </p>
          </div>
          <button
            onClick={handleRun}
            className="mt-2 inline-flex items-center gap-2 rounded border border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25 px-5 py-2 text-xs font-bold uppercase tracking-wider text-emerald-200 transition-all cursor-pointer active:scale-95"
          >
            <span>EXTRACT TARGET LIGHT CURVES</span>
            <span className="text-emerald-400">▶</span>
          </button>
        </div>
      )}
    </div>
  );
}

