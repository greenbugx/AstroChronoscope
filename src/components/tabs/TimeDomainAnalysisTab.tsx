import { useState, useId } from "react";
import {
  type TargetLightCurveResponse,
  type SourceLightCurve,
  type LightCurvePoint,
  type SpectralExtractionResponse,
  type SpectralChannel,
  type SpectralComparisonResponse,
  type SourceGaiaAssociationResponse,
  type GaiaConeSearchResponse,
  extractSpectrum,
  compareSpectra,
  getSourceGaiaAssociation,
  searchGaia,
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
  sourceGaiaAssociation?: SourceGaiaAssociationResponse | null;
  isGaiaAssociating?: boolean;
  sourceGaiaError?: string | null;
  gaiaConeSearchResult?: GaiaConeSearchResponse | null;
  isGaiaSearching?: boolean;
  gaiaSearchError?: string | null;
  onExtractLightCurve: (maxObs: number, thresholdSigma: number, band: string) => void;
  onSelectSourceId: (sourceId: string) => void;
  onExtractSpectrum?: (sourceId?: string, customRa?: number, customDec?: number, method?: "bilinear" | "nearest") => void;
  onCompareSpectra?: (spectrumIdA: string, spectrumIdB: string) => void;
  onSearchGaia?: (radiusArcsec?: number, magLimit?: number, limit?: number) => void;
  onAssociateGaia?: (sourceId: string) => void;
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
  { detector: 1, name: "D1", minWl: 0.75, maxWl: 1.11, color: "#3b82f6" },
  { detector: 2, name: "D2", minWl: 1.11, maxWl: 1.64, color: "#06b6d4" },
  { detector: 3, name: "D3", minWl: 1.64, maxWl: 2.42, color: "#10b981" },
  { detector: 4, name: "D4", minWl: 2.42, maxWl: 3.82, color: "#f59e0b" },
  { detector: 5, name: "D5", minWl: 3.82, maxWl: 4.42, color: "#f97316" },
  { detector: 6, name: "D6", minWl: 4.42, maxWl: 5.00, color: "#f43f5e" },
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
  sourceGaiaAssociation,
  isGaiaAssociating,
  sourceGaiaError,
  gaiaConeSearchResult,
  isGaiaSearching,
  gaiaSearchError,
  onExtractLightCurve,
  onSelectSourceId,
  onExtractSpectrum,
  onCompareSpectra,
  onSearchGaia,
  onAssociateGaia,
  onNavigateTab,
}: TimeDomainAnalysisTabProps) {
  const maxObsId = useId();
  const sigmaId = useId();
  const compareRaId = useId();
  const compareDecId = useId();
  const gaiaRadiusId = useId();
  const gaiaMagId = useId();
  const gaiaLimitId = useId();

  const [maxObs, setMaxObs] = useState("10");
  const [sigma, setSigma] = useState("3.0");
  const [selectedBand, setSelectedBand] = useState<string>("ALL");
  const [activeAnalysisMode, setActiveAnalysisMode] = useState<
    "lightcurve" | "transients" | "motion" | "spectral" | "gaia"
  >("lightcurve");

  const [hoveredPoint, setHoveredPoint] = useState<LightCurvePoint | null>(null);

  // Local spectral states
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

  // Gaia DR3 States (Phase 5)
  const [localGaiaAssociation, setLocalGaiaAssociation] = useState<SourceGaiaAssociationResponse | null>(null);
  const [localIsAssociating, setLocalIsAssociating] = useState(false);
  const [localGaiaAssocError, setLocalGaiaAssocError] = useState<string | null>(null);

  const [localGaiaSearch, setLocalGaiaSearch] = useState<GaiaConeSearchResponse | null>(null);
  const [localIsSearching, setLocalIsSearching] = useState(false);
  const [localGaiaSearchError, setLocalGaiaSearchError] = useState<string | null>(null);

  const [gaiaSubMode, setGaiaSubMode] = useState<"association" | "cone">("association");
  const [gaiaRadiusArcsec, setGaiaRadiusArcsec] = useState("10.0");
  const [gaiaMagCut, setGaiaMagCut] = useState("21.0");
  const [gaiaLimit, setGaiaLimit] = useState("50");

  const activeSpectrumResponse = spectrumData || localSpectrum;
  const activeSpectrum = activeSpectrumResponse?.spectrum;
  const isSpectrumBusy = isExtractingSpectrum || localIsExtracting;
  const activeSpectralError = spectrumError || localSpectralError;

  const activeComparisonResponse = spectralComparison || localComparison;
  const activeComparison = activeComparisonResponse?.comparison;
  const isComparingBusy = isSpectralComparing || localIsComparing;
  const activeCompareError = spectralComparisonError || localComparisonError;

  const activeGaiaAssociation = sourceGaiaAssociation || localGaiaAssociation;
  const isGaiaAssocBusy = isGaiaAssociating || localIsAssociating;
  const activeGaiaAssocError = sourceGaiaError || localGaiaAssocError;

  const activeGaiaSearch = gaiaConeSearchResult || localGaiaSearch;
  const isGaiaSearchBusy = isGaiaSearching || localIsSearching;
  const activeGaiaSearchErr = gaiaSearchError || localGaiaSearchError;

  const activeSource: SourceLightCurve | undefined = lightCurveData?.sources?.find(
    (s) => s.source_id === selectedSourceId
  ) || lightCurveData?.sources?.[0];

  // Trigger Gaia Association Handler
  const handleTriggerGaiaAssociation = async () => {
    if (!activeSource) return;
    if (onAssociateGaia) {
      onAssociateGaia(activeSource.source_id);
    } else {
      try {
        setLocalIsAssociating(true);
        setLocalGaiaAssocError(null);
        const res = await getSourceGaiaAssociation(activeSource.source_id);
        setLocalGaiaAssociation(res);
      } catch (err) {
        setLocalGaiaAssocError(err instanceof Error ? err.message : "Gaia source association failed");
      } finally {
        setLocalIsAssociating(false);
      }
    }
  };

  // Trigger Gaia Cone Search Handler
  const handleTriggerGaiaSearch = async () => {
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const radNum = parseFloat(gaiaRadiusArcsec) || 10.0;
    const magNum = gaiaMagCut ? parseFloat(gaiaMagCut) : undefined;
    const limNum = parseInt(gaiaLimit, 10) || 50;

    if (isNaN(raNum) || isNaN(decNum)) {
      setLocalGaiaSearchError("Coordinates must be valid numbers");
      return;
    }

    if (onSearchGaia) {
      onSearchGaia(radNum, magNum, limNum);
    } else {
      try {
        setLocalIsSearching(true);
        setLocalGaiaSearchError(null);
        const res = await searchGaia({
          ra: raNum,
          dec: decNum,
          radius_arcsec: radNum,
          magnitude_limit: magNum,
          limit: limNum,
        });
        setLocalGaiaSearch(res);
      } catch (err) {
        setLocalGaiaSearchError(err instanceof Error ? err.message : "Gaia cone search failed");
      } finally {
        setLocalIsSearching(false);
      }
    }
  };

  // Spectral Extraction Handler
  const handleTriggerExtractSpectrum = async (useSource = false) => {
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);

    if (isNaN(raNum) || isNaN(decNum)) {
      setLocalSpectralError("Coordinates must be valid numbers");
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
        setLocalSpectralError(err instanceof Error ? err.message : "Extraction failed");
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
      setLocalComparisonError("Reference coordinates must be valid numbers");
      return;
    }

    try {
      setLocalIsComparing(true);
      setLocalComparisonError(null);

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
      setLocalComparisonError(err instanceof Error ? err.message : "Comparison failed");
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

  // Consolidate points across bands for active source
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
  const plotHeight = 300;
  const padLeft = 65;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 40;

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
    <div className="flex flex-col gap-4 font-mono text-neutral-200">
      {/* Target Parameters & Execution Strip */}
      <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              TARGET FIELD: RA {parseFloat(ra).toFixed(4)}°, DEC {parseFloat(dec).toFixed(4)}°
            </span>
          </div>

          <button
            onClick={() => onNavigateTab("discovery")}
            className="px-2 py-0.5 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-neutral-300 hover:text-white uppercase font-bold cursor-pointer"
          >
            EDIT IN DISCOVERY
          </button>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor={maxObsId} className="text-[10px] uppercase font-bold text-neutral-400">
              Max Observations
            </label>
            <input
              id={maxObsId}
              type="number"
              min="1"
              max="50"
              value={maxObs}
              onChange={(e) => setMaxObs(e.target.value)}
              className="bg-black border border-neutral-800 focus:border-neutral-500 px-2.5 py-1 text-xs text-white font-mono outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={sigmaId} className="text-[10px] uppercase font-bold text-neutral-400">
              Detection Threshold (σ)
            </label>
            <input
              id={sigmaId}
              type="text"
              value={sigma}
              onChange={(e) => setSigma(e.target.value)}
              className="bg-black border border-neutral-800 focus:border-neutral-500 px-2.5 py-1 text-xs text-white font-mono outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-neutral-400">
              Band Selection
            </span>
            <select
              value={selectedBand}
              onChange={(e) => setSelectedBand(e.target.value)}
              className="bg-black border border-neutral-800 focus:border-neutral-500 px-2.5 py-1 text-xs text-white font-mono outline-none cursor-pointer"
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
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 border border-blue-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <TwinOrbit className="size-3 text-white" />
                <span>PROCESSING...</span>
              </>
            ) : (
              <span>EXTRACT LIGHT CURVES</span>
            )}
          </button>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="border border-red-600 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>ERROR: {error}</span>
          <button
            onClick={handleRun}
            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold uppercase cursor-pointer"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Main Analysis Modes */}
      {lightCurveData && (
        <div className="flex flex-col gap-3">
          {/* Sub-Navigation Buttons */}
          <div className="flex items-center gap-1 border-b border-neutral-800 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveAnalysisMode("lightcurve")}
              className={`px-3 py-1 text-xs font-bold uppercase border cursor-pointer whitespace-nowrap ${
                activeAnalysisMode === "lightcurve"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-black text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-900"
              }`}
            >
              Light Curves & Variability
            </button>

            <button
              onClick={() => setActiveAnalysisMode("transients")}
              className={`px-3 py-1 text-xs font-bold uppercase border cursor-pointer whitespace-nowrap ${
                activeAnalysisMode === "transients"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-black text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-900"
              }`}
            >
              Transient Screening
            </button>

            <button
              onClick={() => setActiveAnalysisMode("motion")}
              className={`px-3 py-1 text-xs font-bold uppercase border cursor-pointer whitespace-nowrap ${
                activeAnalysisMode === "motion"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-black text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-900"
              }`}
            >
              Proper Motion
            </button>

            <button
              onClick={() => setActiveAnalysisMode("spectral")}
              className={`px-3 py-1 text-xs font-bold uppercase border cursor-pointer whitespace-nowrap ${
                activeAnalysisMode === "spectral"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-black text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-900"
              }`}
            >
              102-Channel DR1 Spectra
            </button>

            <button
              onClick={() => setActiveAnalysisMode("gaia")}
              className={`px-3 py-1 text-xs font-bold uppercase border cursor-pointer whitespace-nowrap ${
                activeAnalysisMode === "gaia"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-black text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-900"
              }`}
            >
              Gaia DR3 Catalogue
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Left Column: Source Catalog & Metrics */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              {/* Associated Sources Catalog */}
              <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                    Associated Sources ({lightCurveData.sources?.length ?? 0})
                  </span>
                  <span className="text-[10px] text-neutral-500">Nearest-Neighbour</span>
                </div>

                <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                  {lightCurveData.sources?.map((s) => {
                    const isSelected =
                      selectedSourceId === s.source_id ||
                      (!selectedSourceId && activeSource?.source_id === s.source_id);

                    return (
                      <button
                        key={s.source_id}
                        onClick={() => onSelectSourceId(s.source_id)}
                        className={`text-left px-2.5 py-1.5 border text-xs cursor-pointer font-mono ${
                          isSelected
                            ? "border-amber-500 bg-amber-500/20 text-amber-200"
                            : "border-neutral-900 bg-black text-neutral-400 hover:text-neutral-200 hover:border-neutral-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{s.source_id.slice(0, 14)}...</span>
                          <span className="text-[10px] text-neutral-400">{s.epoch_count} epochs</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 flex justify-between mt-0.5">
                          <span>RA {s.reference_ra_deg.toFixed(4)}°</span>
                          <span>Dec {s.reference_dec_deg.toFixed(4)}°</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Variability Metrics */}
              <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-white uppercase border-b border-neutral-800 pb-1">
                  Variability Telemetry
                </span>

                {metrics ? (
                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Reduced Chi-Square (χ²/ν)</span>
                      <span
                        className={`font-bold px-1 py-0.2 text-[11px] ${
                          (metrics.reduced_chi2 ?? 0) > 3.0
                            ? "bg-red-950 text-red-400 border border-red-800"
                            : (metrics.reduced_chi2 ?? 0) > 1.5
                              ? "bg-amber-950 text-amber-400 border border-amber-800"
                              : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        }`}
                      >
                        {metrics.reduced_chi2 != null ? metrics.reduced_chi2.toFixed(2) : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Fractional Var (Fvar)</span>
                      <span className="font-bold text-cyan-300">
                        {metrics.fractional_variability != null
                          ? `${(metrics.fractional_variability * 100).toFixed(1)}%`
                          : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Peak-to-Peak Amplitude</span>
                      <span className="text-white">
                        {metrics.peak_to_peak_jy != null ? `${(metrics.peak_to_peak_jy * 1000).toFixed(2)} mJy` : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                      <span className="text-neutral-400">Weighted Mean Flux</span>
                      <span className="text-white">
                        {metrics.weighted_mean_flux_jy != null
                          ? `${(metrics.weighted_mean_flux_jy * 1000).toFixed(2)} mJy`
                          : metrics.mean_flux_jy != null
                            ? `${(metrics.mean_flux_jy * 1000).toFixed(2)} mJy`
                            : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Robust Dispersion (σ)</span>
                      <span className="text-neutral-300">
                        {metrics.robust_sigma_jy != null ? `${(metrics.robust_sigma_jy * 1000).toFixed(2)} mJy` : "N/A"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 py-1">
                    No metrics available.
                  </div>
                )}
              </div>

              {/* Gaia DR3 External Cross-Match Telemetry Card */}
              <div className="border border-neutral-800 bg-[#0d0d0d] p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-1">
                  <span className="text-[10px] font-bold text-neutral-300 uppercase">
                    Gaia DR3 Counterpart
                  </span>
                  {activeGaiaAssociation && (
                    <span
                      className={`px-1 text-[9px] font-bold border ${
                        activeGaiaAssociation.status === "MATCHED"
                          ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                          : activeGaiaAssociation.status === "AMBIGUOUS"
                            ? "bg-amber-950 text-amber-400 border-amber-800"
                            : "bg-neutral-900 text-neutral-400 border-neutral-700"
                      }`}
                    >
                      {activeGaiaAssociation.status}
                    </span>
                  )}
                </div>

                {activeGaiaAssociation?.best ? (
                  <div className="flex flex-col gap-0.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Gaia ID:</span>
                      <span className="text-cyan-300 font-bold">{activeGaiaAssociation.best.gaia_source_id.slice(-10)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Offset:</span>
                      <span className="text-white font-bold">{activeGaiaAssociation.best.separation_arcsec.toFixed(3)}&quot;</span>
                    </div>
                    {activeGaiaAssociation.best.source?.photometry?.g != null && (
                      <div className="flex justify-between">
                        <span className="text-neutral-500">G Mag:</span>
                        <span className="text-emerald-400 font-bold">{activeGaiaAssociation.best.source.photometry.g.toFixed(2)}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setActiveAnalysisMode("gaia")}
                      className="mt-1 px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] uppercase font-bold cursor-pointer"
                    >
                      Inspect Gaia Astrometry
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500">
                      {isGaiaAssocBusy ? "Associating with Gaia DR3..." : "Query Gaia counterpart candidates for selected source."}
                    </span>
                    <button
                      onClick={handleTriggerGaiaAssociation}
                      disabled={isGaiaAssocBusy || !activeSource}
                      className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 border border-neutral-700 text-neutral-300 text-[10px] uppercase font-bold cursor-pointer"
                    >
                      {isGaiaAssocBusy ? "QUERYING..." : "CROSS-MATCH GAIA"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Visualization & Ledger */}
            <div className="lg:col-span-8 flex flex-col gap-3">
              {/* Mode 1: Light Curves */}
              {activeAnalysisMode === "lightcurve" && (
                <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold uppercase text-white tracking-wider">
                      Photometric Light Curve (S_ν vs MJD)
                    </span>

                    <div className="flex items-center gap-2 text-[10px]">
                      {Object.entries(BAND_COLORS).map(([b, col]) => (
                        <div key={b} className="flex items-center gap-1">
                          <span className="h-2 w-2" style={{ backgroundColor: col.fill }} />
                          <span className="text-neutral-400">{b.replace("SPHEREx-", "")}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {validPoints.length > 0 ? (
                    <div className="relative w-full overflow-x-auto bg-black border border-neutral-900 p-2">
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
                                x={padLeft - 6}
                                y={y + 3}
                                textAnchor="end"
                                fill="#737373"
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
                                y={padTop + innerHeight + 14}
                                textAnchor="middle"
                                fill="#737373"
                                fontSize="9"
                                fontFamily="monospace"
                              >
                                {mjdVal.toFixed(2)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Mean Flux Line */}
                        {metrics?.mean_flux_jy != null && (
                          <line
                            x1={padLeft}
                            y1={toPlotY(metrics.mean_flux_jy)}
                            x2={padLeft + innerWidth}
                            y2={toPlotY(metrics.mean_flux_jy)}
                            stroke="#f59e0b"
                            strokeDasharray="4,4"
                            strokeWidth="1"
                          />
                        )}

                        {/* Polyline */}
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

                        {/* Data Points */}
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
                              className="cursor-pointer"
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
                                    strokeWidth="1"
                                  />
                                  <line
                                    x1={cx - 3}
                                    y1={yTop}
                                    x2={cx + 3}
                                    y2={yTop}
                                    stroke={col.stroke}
                                    strokeWidth="1"
                                  />
                                  <line
                                    x1={cx - 3}
                                    y1={yBottom}
                                    x2={cx + 3}
                                    y2={yBottom}
                                    stroke={col.stroke}
                                    strokeWidth="1"
                                  />
                                </>
                              )}

                              <circle
                                cx={cx}
                                cy={cy}
                                r="4"
                                fill={col.fill}
                                stroke="#ffffff"
                                strokeWidth="1"
                              />
                            </g>
                          );
                        })}

                        <text
                          x={plotWidth / 2}
                          y={plotHeight - 6}
                          textAnchor="middle"
                          fill="#737373"
                          fontSize="10"
                        >
                          MODIFIED JULIAN DATE (MJD)
                        </text>

                        <text
                          x={14}
                          y={plotHeight / 2}
                          textAnchor="middle"
                          fill="#737373"
                          fontSize="10"
                          transform={`rotate(-90 14 ${plotHeight / 2})`}
                        >
                          FLUX DENSITY S_ν (Jy)
                        </text>
                      </svg>

                      {hoveredPoint && (
                        <div className="absolute top-3 right-3 border border-neutral-700 bg-black p-2 text-xs flex flex-col gap-0.5 pointer-events-none">
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-bold">{hoveredPoint.band || "Band"}</span>
                            <span className="text-neutral-400">MJD: {hoveredPoint.time_mjd?.toFixed(4)}</span>
                          </div>
                          <div className="text-white">
                            Flux: {hoveredPoint.flux_jy.toFixed(5)} ± {hoveredPoint.flux_jy_error?.toFixed(5) ?? "0"} Jy
                          </div>
                          <div className="text-neutral-500 text-[10px]">
                            SNR: {hoveredPoint.snr?.toFixed(1) ?? "N/A"} · Quality: {hoveredPoint.quality}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center border border-neutral-900 bg-black text-neutral-500 text-xs">
                      No photometric points for this source.
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: Transient Screening */}
              {activeAnalysisMode === "transients" && (
                <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
                  <span className="text-xs font-bold uppercase text-white border-b border-neutral-800 pb-1.5">
                    Transient Candidate Verification
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 border border-neutral-800 bg-black flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-500 uppercase">Non-Detection History</span>
                      <span className="text-base font-bold text-white">
                        {activeSeries?.non_detections === 0 ? "0 Non-Detections" : `${activeSeries?.non_detections} Non-Detections`}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {activeSeries?.non_detections === 0 ? "Persistent across all observed epochs" : "Candidate for episodic transient event"}
                      </span>
                    </div>

                    <div className="p-3 border border-neutral-800 bg-black flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-500 uppercase">SNR Threshold Status</span>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                          VERIFIED
                        </span>
                        <span className="text-xs text-white font-bold">SNR ≥ 3.0σ</span>
                      </div>
                      <span className="text-[10px] text-neutral-400">
                        Evaluated against background annulus
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 3: Proper Motion Tracking */}
              {activeAnalysisMode === "motion" && (
                <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
                  <span className="text-xs font-bold uppercase text-white border-b border-neutral-800 pb-1.5">
                    Centroid Astrometry & Proper Motion
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 border border-neutral-800 bg-black flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-500 uppercase">Centroid Position Scatter</span>
                      <span className="text-base font-bold text-white">
                        {activeSource?.position_scatter_arcsec != null
                          ? `${activeSource.position_scatter_arcsec.toFixed(3)} arcsec`
                          : "N/A"}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        SPHEREx pixel scale: ~6.2 arcsec/pixel
                      </span>
                    </div>

                    <div className="p-3 border border-neutral-800 bg-black flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-500 uppercase">Astrometric Motion Verdict</span>
                      <span className="text-base font-bold text-emerald-400">
                        {(activeSource?.position_scatter_arcsec ?? 0) < 3.0
                          ? "STATIONARY (Sub-pixel)"
                          : "MOTION CANDIDATE"}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        Consistent with WCS registration precision
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 4: Spectral Channels & DR1 Cube Analyzer */}
              {activeAnalysisMode === "spectral" && (
                <div className="flex flex-col gap-3">
                  <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-white">
                          DR1 Cube Spectral Extraction
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                          102 Channels (0.75 - 5.00 µm)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[10px] text-neutral-400">Method:</span>
                        <select
                          value={spatialMethod}
                          onChange={(e) => setSpatialMethod(e.target.value as "bilinear" | "nearest")}
                          className="bg-black border border-neutral-800 px-2 py-0.5 text-xs text-white outline-none cursor-pointer"
                        >
                          <option value="bilinear">Bilinear Interpolation</option>
                          <option value="nearest">Nearest Pixel</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-neutral-400">
                        RA {parseFloat(ra).toFixed(5)}°, Dec {parseFloat(dec).toFixed(5)}°
                      </div>

                      <div className="flex items-center gap-2">
                        {activeSource && (
                          <button
                            onClick={() => handleTriggerExtractSpectrum(true)}
                            disabled={isSpectrumBusy}
                            className="px-2.5 py-1 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
                          >
                            Extract For Source
                          </button>
                        )}
                        <button
                          onClick={() => handleTriggerExtractSpectrum(false)}
                          disabled={isSpectrumBusy}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 border border-blue-500 text-white font-bold text-xs uppercase cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {isSpectrumBusy ? (
                            <>
                              <TwinOrbit className="size-3 text-white" />
                              <span>SAMPLING...</span>
                            </>
                          ) : (
                            <span>EXTRACT 1D SPECTRUM</span>
                          )}
                        </button>

                        <button
                          onClick={() => setShowComparisonPanel(!showComparisonPanel)}
                          className={`px-2.5 py-1 border text-xs font-bold uppercase cursor-pointer ${
                            showComparisonPanel
                              ? "bg-amber-600 text-white border-amber-500"
                              : "bg-neutral-900 text-neutral-300 hover:text-white border-neutral-700"
                          }`}
                        >
                          {showComparisonPanel ? "Hide Compare" : "Compare"}
                        </button>
                      </div>
                    </div>

                    {/* Pairwise comparison sub-drawer */}
                    {showComparisonPanel && (
                      <div className="border border-neutral-800 bg-black p-3 flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-amber-300 uppercase">
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
                              className="bg-black border border-neutral-800 px-2 py-1 text-xs text-white outline-none"
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
                              className="bg-black border border-neutral-800 px-2 py-1 text-xs text-white outline-none"
                            />
                          </div>

                          <button
                            onClick={handleTriggerCompareSpectra}
                            disabled={isComparingBusy || !activeSpectrum}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 border border-amber-500 text-white font-bold text-xs uppercase cursor-pointer disabled:cursor-not-allowed"
                          >
                            {isComparingBusy ? "COMPARING..." : "RUN COMPARISON"}
                          </button>
                        </div>
                        {activeCompareError && (
                          <span className="text-[10px] text-red-400">{activeCompareError}</span>
                        )}
                      </div>
                    )}

                    {activeSpectralError && (
                      <div className="border border-red-600 bg-red-950/40 p-2 text-xs text-red-200 flex items-center justify-between">
                        <span>{activeSpectralError}</span>
                        <button
                          onClick={() => handleTriggerExtractSpectrum(false)}
                          className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Active Spectrum Visualizer */}
                  {activeSpectrum ? (
                    <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase text-white">
                            102-Channel Surface Brightness
                          </span>
                          <span className="text-[10px] text-emerald-400 font-bold">
                            {activeSpectrum.valid_channel_count} / {activeSpectrum.channel_count} Valid
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <button
                            onClick={handleExportCsv}
                            className="px-2 py-0.5 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-neutral-300 uppercase font-bold cursor-pointer"
                          >
                            Export CSV
                          </button>
                          <button
                            onClick={handleExportJson}
                            className="px-2 py-0.5 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-neutral-300 uppercase font-bold cursor-pointer"
                          >
                            Export JSON
                          </button>
                        </div>
                      </div>

                      {/* Interactive 102-Channel SVG Spectrum Plot */}
                      <div className="relative w-full overflow-x-auto bg-black border border-neutral-900 p-2">
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
                          const specPlotHeight = 280;
                          const specPadLeft = 60;
                          const specPadRight = 20;
                          const specPadTop = 20;
                          const specPadBottom = 35;
                          const specInnerWidth = specPlotWidth - specPadLeft - specPadRight;
                          const specInnerHeight = specPlotHeight - specPadTop - specPadBottom;

                          const toSpecX = (wl: number) => specPadLeft + ((wl - 0.75) / (5.00 - 0.75)) * specInnerWidth;
                          const toSpecY = (f: number) => specPadTop + specInnerHeight - ((f - specYMin) / specYRange) * specInnerHeight;

                          return (
                            <svg
                              viewBox={`0 0 ${specPlotWidth} ${specPlotHeight}`}
                              className="w-full h-auto min-w-[600px]"
                            >
                              {/* Detector Zone Backgrounds */}
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
                                      fillOpacity="0.06"
                                    />
                                    <text
                                      x={xStart + width / 2}
                                      y={specPadTop + 12}
                                      textAnchor="middle"
                                      fill={zone.color}
                                      fontSize="9"
                                      fontFamily="monospace"
                                      opacity="0.7"
                                    >
                                      {zone.name}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Horizontal Gridlines */}
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
                                      strokeDasharray="2,2"
                                    />
                                    <text
                                      x={specPadLeft - 6}
                                      y={y + 3}
                                      textAnchor="end"
                                      fill="#737373"
                                      fontSize="9"
                                      fontFamily="monospace"
                                    >
                                      {fluxVal.toFixed(2)}
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
                                      strokeDasharray="2,2"
                                    />
                                    <text
                                      x={x}
                                      y={specPadTop + specInnerHeight + 12}
                                      textAnchor="middle"
                                      fill="#737373"
                                      fontSize="9"
                                      fontFamily="monospace"
                                    >
                                      {wl.toFixed(1)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Target Spectrum Polyline */}
                              {validSpectrumChannels.length > 1 && (
                                <polyline
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth="1.5"
                                  points={validSpectrumChannels
                                    .sort((a, b) => (a.wavelength_um ?? 0) - (b.wavelength_um ?? 0))
                                    .map((c) => `${toSpecX(c.wavelength_um!)},${toSpecY(c.flux_mjy_sr!)}`)
                                    .join(" ")}
                                />
                              )}

                              {/* Reference Spectrum Polyline */}
                              {activeComparison &&
                                activeComparison.channels.filter((c) => c.flux_b_mjy_sr != null).length > 1 && (
                                  <polyline
                                    fill="none"
                                    stroke="#c084fc"
                                    strokeWidth="1.5"
                                    strokeDasharray="3,3"
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
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoveredChannel(c)}
                                    onMouseLeave={() => setHoveredChannel(null)}
                                  >
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r={isUsable ? (hoveredChannel?.index === c.index ? 5 : 3) : 2}
                                      fill={isUsable ? zone.color : "#404040"}
                                      stroke={hoveredChannel?.index === c.index ? "#ffffff" : isUsable ? zone.color : "#737373"}
                                      strokeWidth={hoveredChannel?.index === c.index ? 2 : 1}
                                    />
                                  </g>
                                );
                              })}

                              <text
                                x={specPlotWidth / 2}
                                y={specPlotHeight - 4}
                                textAnchor="middle"
                                fill="#737373"
                                fontSize="10"
                              >
                                WAVELENGTH λ (µm)
                              </text>

                              <text
                                x={14}
                                y={specPlotHeight / 2}
                                textAnchor="middle"
                                fill="#737373"
                                fontSize="10"
                                transform={`rotate(-90 14 ${specPlotHeight / 2})`}
                              >
                                SURFACE BRIGHTNESS (MJy / sr)
                              </text>
                            </svg>
                          );
                        })()}

                        {hoveredChannel && (
                          <div className="absolute top-3 right-3 border border-neutral-700 bg-black p-2 text-xs flex flex-col gap-0.5 pointer-events-none">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sky-300 font-bold">
                                Ch #{hoveredChannel.index} (D{hoveredChannel.detector})
                              </span>
                              <span
                                className={`px-1 text-[9px] font-bold ${
                                  hoveredChannel.quality === "PASS"
                                    ? "bg-emerald-950 text-emerald-400"
                                    : "bg-amber-950 text-amber-400"
                                }`}
                              >
                                {hoveredChannel.quality}
                              </span>
                            </div>
                            <div className="text-neutral-300">
                              λ: {hoveredChannel.wavelength_um?.toFixed(4) ?? "N/A"} µm
                            </div>
                            <div className="text-white font-bold">
                              {hoveredChannel.flux_mjy_sr != null
                                ? `${hoveredChannel.flux_mjy_sr.toFixed(4)} MJy/sr`
                                : "UNUSABLE"}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              R: {hoveredChannel.resolving_power?.toFixed(1) ?? "N/A"} · NHITS: {hoveredChannel.nhits ?? 0}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Channel Filter & Numerical Table */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-1">
                          <span className="text-[11px] font-bold text-neutral-400 uppercase">
                            Channel Measurements
                          </span>
                          <div className="flex items-center gap-1 text-[10px]">
                            {["ALL", "D1", "D2", "D3", "D4", "D5", "D6"].map((d) => (
                              <button
                                key={d}
                                onClick={() => setChannelDetectorFilter(d)}
                                className={`px-1.5 py-0.2 border font-bold cursor-pointer ${
                                  channelDetectorFilter === d
                                    ? "bg-neutral-800 text-amber-300 border-neutral-600"
                                    : "bg-black text-neutral-500 border-neutral-900 hover:text-white"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="overflow-x-auto max-h-48">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase sticky top-0 bg-[#0d0d0d]">
                                <th className="py-1 px-2">Idx</th>
                                <th className="py-1 px-2">Band</th>
                                <th className="py-1 px-2">Sub</th>
                                <th className="py-1 px-2">λ (µm)</th>
                                <th className="py-1 px-2">Flux (MJy/sr)</th>
                                <th className="py-1 px-2">R</th>
                                <th className="py-1 px-2">Quality</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-900 text-[11px]">
                              {activeSpectrum.channels
                                .filter((c) => {
                                  if (channelDetectorFilter !== "ALL") {
                                    const detNum = parseInt(channelDetectorFilter.replace("D", ""), 10);
                                    if (c.detector !== detNum) return false;
                                  }
                                  return true;
                                })
                                .map((c) => (
                                  <tr key={c.index} className="hover:bg-neutral-900">
                                    <td className="py-1 px-2 text-neutral-500">#{c.index}</td>
                                    <td className="py-1 px-2 text-purple-300 font-bold">D{c.detector}</td>
                                    <td className="py-1 px-2 text-neutral-400">{c.subchan ?? "-"}</td>
                                    <td className="py-1 px-2 text-white">{c.wavelength_um?.toFixed(4) ?? "-"}</td>
                                    <td className="py-1 px-2">
                                      {c.flux_mjy_sr != null ? (
                                        <span className="text-emerald-400 font-bold">{c.flux_mjy_sr.toFixed(4)}</span>
                                      ) : (
                                        <span className="text-neutral-600">NULL</span>
                                      )}
                                    </td>
                                    <td className="py-1 px-2 text-neutral-400">{c.resolving_power?.toFixed(1) ?? "-"}</td>
                                    <td className="py-1 px-2">
                                      <span
                                        className={`px-1 py-0.2 text-[9px] font-bold ${
                                          c.quality === "PASS"
                                            ? "text-emerald-400 bg-emerald-950"
                                            : "text-amber-400 bg-amber-950"
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
                    <div className="p-6 border border-neutral-800 bg-[#0d0d0d] text-center text-xs text-neutral-400">
                      Click EXTRACT 1D SPECTRUM above to sample the SPHEREx DR1 surface brightness cube across 102 channels.
                    </div>
                  )}
                </div>
              )}

              {/* Mode 5: Gaia DR3 Catalog Integration */}
              {activeAnalysisMode === "gaia" && (
                <div className="flex flex-col gap-3">
                  {/* Top Controls & Sub-tabs */}
                  <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-white tracking-wider">
                          Gaia DR3 Astrometry & Cross-Matching
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                          ESA Gaia DR3 (Ref Epoch 2016.0)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setGaiaSubMode("association")}
                          className={`px-2 py-0.5 text-[10px] uppercase font-bold border cursor-pointer ${
                            gaiaSubMode === "association"
                              ? "bg-neutral-800 text-amber-300 border-neutral-600"
                              : "bg-black text-neutral-400 hover:text-white border-neutral-800"
                          }`}
                        >
                          Source Cross-Match
                        </button>
                        <button
                          onClick={() => setGaiaSubMode("cone")}
                          className={`px-2 py-0.5 text-[10px] uppercase font-bold border cursor-pointer ${
                            gaiaSubMode === "cone"
                              ? "bg-neutral-800 text-amber-300 border-neutral-600"
                              : "bg-black text-neutral-400 hover:text-white border-neutral-800"
                          }`}
                        >
                          Target Cone Search
                        </button>
                      </div>
                    </div>

                    {/* Submode 1: Source Cross-Match */}
                    {gaiaSubMode === "association" && (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-neutral-400">
                            {activeSource ? (
                              <span>
                                Target Source: <strong className="text-white">{activeSource.source_id.slice(0, 16)}...</strong> (RA {activeSource.reference_ra_deg.toFixed(4)}°, Dec {activeSource.reference_dec_deg.toFixed(4)}°)
                              </span>
                            ) : (
                              <span>No active source selected from catalog.</span>
                            )}
                          </div>

                          <button
                            onClick={handleTriggerGaiaAssociation}
                            disabled={isGaiaAssocBusy || !activeSource}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 border border-blue-500 text-white font-bold text-xs uppercase cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {isGaiaAssocBusy ? (
                              <>
                                <TwinOrbit className="size-3 text-white" />
                                <span>CROSS-MATCHING...</span>
                              </>
                            ) : (
                              <span>QUERY GAIA DR3 COUNTERPART</span>
                            )}
                          </button>
                        </div>

                        {activeGaiaAssocError && (
                          <div className="border border-red-600 bg-red-950/40 p-2 text-xs text-red-200 flex items-center justify-between">
                            <span>{activeGaiaAssocError}</span>
                            <button
                              onClick={handleTriggerGaiaAssociation}
                              className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {activeGaiaAssociation && (
                          <div className="flex flex-col gap-3">
                            {/* Match Status Banner */}
                            <div className="flex items-center justify-between p-2.5 border border-neutral-800 bg-black">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-neutral-500 uppercase font-bold">Match Outcome:</span>
                                <span
                                  className={`px-2 py-0.5 text-[11px] font-bold border uppercase ${
                                    activeGaiaAssociation.status === "MATCHED"
                                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                                      : activeGaiaAssociation.status === "AMBIGUOUS"
                                        ? "bg-amber-950 text-amber-400 border-amber-800"
                                        : "bg-neutral-900 text-neutral-400 border-neutral-700"
                                  }`}
                                >
                                  {activeGaiaAssociation.status === "MATCHED"
                                    ? "MATCHED (SINGLE GAIA COUNTERPART)"
                                    : activeGaiaAssociation.status === "AMBIGUOUS"
                                      ? `AMBIGUOUS (${activeGaiaAssociation.candidates.length} CANDIDATES)`
                                      : "UNMATCHED (NO CANDIDATES IN SEARCH CONE)"}
                                </span>
                              </div>

                              <span className="text-[10px] text-neutral-500">
                                Match Radius: {activeGaiaAssociation.config?.radius_arcsec ?? 3.0}&quot;
                              </span>
                            </div>

                            {/* Best Counterpart Details */}
                            {activeGaiaAssociation.best && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
                                  <span className="text-[10px] text-neutral-500 uppercase">Gaia Source ID</span>
                                  <span className="font-bold text-white font-mono break-all text-[11px]">
                                    {activeGaiaAssociation.best.gaia_source_id}
                                  </span>
                                </div>

                                <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
                                  <span className="text-[10px] text-neutral-500 uppercase">Angular Separation</span>
                                  <span className="text-sm font-bold text-emerald-400">
                                    {activeGaiaAssociation.best.separation_arcsec.toFixed(3)}&quot;
                                  </span>
                                  {activeGaiaAssociation.best.separation_propagated_arcsec != null && (
                                    <span className="text-[10px] text-neutral-400">
                                      Propagated: {activeGaiaAssociation.best.separation_propagated_arcsec.toFixed(3)}&quot;
                                    </span>
                                  )}
                                </div>

                                <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
                                  <span className="text-[10px] text-neutral-500 uppercase">Photometry (G/BP/RP)</span>
                                  <span className="font-bold text-cyan-300">
                                    G: {activeGaiaAssociation.best.source?.photometry?.g != null ? `${activeGaiaAssociation.best.source.photometry.g.toFixed(2)} mag` : "-"}
                                  </span>
                                  <span className="text-[10px] text-neutral-400">
                                    BP: {activeGaiaAssociation.best.source?.photometry?.bp != null ? `${activeGaiaAssociation.best.source.photometry.bp.toFixed(2)}` : "-"} · RP: {activeGaiaAssociation.best.source?.photometry?.rp != null ? `${activeGaiaAssociation.best.source.photometry.rp.toFixed(2)}` : "-"}
                                  </span>
                                </div>

                                <div className="p-2 border border-neutral-800 bg-black flex flex-col gap-0.5">
                                  <span className="text-[10px] text-neutral-500 uppercase">Proper Motion & RUWE</span>
                                  <span className="font-bold text-white font-mono text-[11px]">
                                    {activeGaiaAssociation.best.source?.astrometry?.pmra_mas_yr != null ? `μα* ${activeGaiaAssociation.best.source.astrometry.pmra_mas_yr.toFixed(1)}` : "No PM"}
                                  </span>
                                  <span className="text-[10px] text-neutral-400 font-mono">
                                    {activeGaiaAssociation.best.source?.astrometry?.pmdec_mas_yr != null ? `μδ ${activeGaiaAssociation.best.source.astrometry.pmdec_mas_yr.toFixed(1)} mas/yr` : ""} · RUWE: {activeGaiaAssociation.best.source?.astrometry?.ruwe != null ? activeGaiaAssociation.best.source.astrometry.ruwe.toFixed(2) : "-"}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Statistical Significance and Epoch Propagation */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {/* Positional Significance Card */}
                              <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-amber-300 uppercase">
                                  Positional Significance Telemetry
                                </span>
                                <div className="flex justify-between border-b border-neutral-900 pb-0.5 text-[11px]">
                                  <span className="text-neutral-500">Combined Uncertainty (σ):</span>
                                  <span className="text-white font-mono">
                                    {activeGaiaAssociation.significance?.combined_sigma_arcsec != null
                                      ? `${activeGaiaAssociation.significance.combined_sigma_arcsec.toFixed(3)}"`
                                      : "N/A"}
                                  </span>
                                </div>
                                <div className="flex justify-between border-b border-neutral-900 pb-0.5 text-[11px]">
                                  <span className="text-neutral-500">Normalized Separation (χ):</span>
                                  <span className="text-white font-mono">
                                    {activeGaiaAssociation.significance?.normalized_separation != null
                                      ? `${activeGaiaAssociation.significance.normalized_separation.toFixed(2)}σ`
                                      : "N/A"}
                                  </span>
                                </div>
                                <div className="flex justify-between border-b border-neutral-900 pb-0.5 text-[11px]">
                                  <span className="text-neutral-500">Rayleigh Null P-Value:</span>
                                  <span className="text-emerald-400 font-bold font-mono">
                                    {activeGaiaAssociation.significance?.match_p_value != null
                                      ? activeGaiaAssociation.significance.match_p_value.toExponential(3)
                                      : "N/A"}
                                  </span>
                                </div>
                                <span className="text-[9px] text-neutral-500 italic mt-0.5">
                                  P-value is probability of offset under Rayleigh null; not physical association proof.
                                </span>
                              </div>

                              {/* Epoch Propagation Card */}
                              <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-sky-300 uppercase">
                                  Proper-Motion Epoch Propagation
                                </span>
                                <div className="flex justify-between border-b border-neutral-900 pb-0.5 text-[11px]">
                                  <span className="text-neutral-500">Gaia Reference Epoch:</span>
                                  <span className="text-white font-mono">2016.0 (J2016.0)</span>
                                </div>
                                <div className="flex justify-between border-b border-neutral-900 pb-0.5 text-[11px]">
                                  <span className="text-neutral-500">Observation Epoch:</span>
                                  <span className="text-white font-mono">
                                    {activeGaiaAssociation.observation_epoch?.julian_year != null
                                      ? `${activeGaiaAssociation.observation_epoch.julian_year.toFixed(3)} J`
                                      : "Unknown"}
                                  </span>
                                </div>
                                <div className="flex justify-between border-b border-neutral-900 pb-0.5 text-[11px]">
                                  <span className="text-neutral-500">Propagation Status:</span>
                                  <span className="text-white font-mono">
                                    {activeGaiaAssociation.propagation?.propagated ? "PROCEED (PM APPLIED)" : (activeGaiaAssociation.propagation?.limitation || "None")}
                                  </span>
                                </div>
                                <span className="text-[9px] text-neutral-500 italic mt-0.5">
                                  Propagated coordinate displacement accounts for stellar space motion.
                                </span>
                              </div>
                            </div>

                            {/* Candidate List Table */}
                            {activeGaiaAssociation.candidates.length > 0 && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-bold text-neutral-400 uppercase">
                                  Candidate Counterparts ({activeGaiaAssociation.candidates.length})
                                </span>
                                <div className="overflow-x-auto max-h-40">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                      <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase sticky top-0 bg-[#0d0d0d]">
                                        <th className="py-1 px-2">Gaia ID</th>
                                        <th className="py-1 px-2">Sep (&quot;)</th>
                                        <th className="py-1 px-2">Prop. Sep</th>
                                        <th className="py-1 px-2">G (mag)</th>
                                        <th className="py-1 px-2">BP (mag)</th>
                                        <th className="py-1 px-2">RP (mag)</th>
                                        <th className="py-1 px-2">Plx (mas)</th>
                                        <th className="py-1 px-2">RUWE</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-900 text-[11px]">
                                      {activeGaiaAssociation.candidates.map((cand) => (
                                        <tr key={cand.gaia_source_id} className="hover:bg-neutral-900">
                                          <td className="py-1 px-2 text-cyan-300 font-mono">{cand.gaia_source_id}</td>
                                          <td className="py-1 px-2 text-white font-bold">{cand.separation_arcsec.toFixed(3)}&quot;</td>
                                          <td className="py-1 px-2 text-neutral-400">
                                            {cand.separation_propagated_arcsec != null ? `${cand.separation_propagated_arcsec.toFixed(3)}"` : "-"}
                                          </td>
                                          <td className="py-1 px-2 text-emerald-400 font-bold">
                                            {cand.source?.photometry?.g != null ? cand.source.photometry.g.toFixed(2) : "-"}
                                          </td>
                                          <td className="py-1 px-2 text-neutral-300">
                                            {cand.source?.photometry?.bp != null ? cand.source.photometry.bp.toFixed(2) : "-"}
                                          </td>
                                          <td className="py-1 px-2 text-neutral-300">
                                            {cand.source?.photometry?.rp != null ? cand.source.photometry.rp.toFixed(2) : "-"}
                                          </td>
                                          <td className="py-1 px-2 text-neutral-400">
                                            {cand.source?.astrometry?.parallax_mas != null ? cand.source.astrometry.parallax_mas.toFixed(2) : "-"}
                                          </td>
                                          <td className="py-1 px-2 text-neutral-400">
                                            {cand.source?.astrometry?.ruwe != null ? cand.source.astrometry.ruwe.toFixed(2) : "-"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Submode 2: Field Cone Search */}
                    {gaiaSubMode === "cone" && (
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                          <div className="flex flex-col gap-0.5">
                            <label htmlFor={gaiaRadiusId} className="text-[10px] uppercase font-bold text-neutral-400">
                              Radius (arcsec)
                            </label>
                            <input
                              id={gaiaRadiusId}
                              type="number"
                              min="0.1"
                              max="60.0"
                              step="0.5"
                              value={gaiaRadiusArcsec}
                              onChange={(e) => setGaiaRadiusArcsec(e.target.value)}
                              className="bg-black border border-neutral-800 px-2.5 py-1 text-xs text-white font-mono outline-none"
                            />
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <label htmlFor={gaiaMagId} className="text-[10px] uppercase font-bold text-neutral-400">
                              G Mag Cut (≤)
                            </label>
                            <input
                              id={gaiaMagId}
                              type="text"
                              value={gaiaMagCut}
                              onChange={(e) => setGaiaMagCut(e.target.value)}
                              placeholder="21.0"
                              className="bg-black border border-neutral-800 px-2.5 py-1 text-xs text-white font-mono outline-none"
                            />
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <label htmlFor={gaiaLimitId} className="text-[10px] uppercase font-bold text-neutral-400">
                              Limit
                            </label>
                            <input
                              id={gaiaLimitId}
                              type="number"
                              min="1"
                              max="1000"
                              value={gaiaLimit}
                              onChange={(e) => setGaiaLimit(e.target.value)}
                              className="bg-black border border-neutral-800 px-2.5 py-1 text-xs text-white font-mono outline-none"
                            />
                          </div>

                          <button
                            onClick={handleTriggerGaiaSearch}
                            disabled={isGaiaSearchBusy}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 border border-blue-500 text-white font-bold text-xs uppercase cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            {isGaiaSearchBusy ? (
                              <>
                                <TwinOrbit className="size-3 text-white" />
                                <span>SEARCHING...</span>
                              </>
                            ) : (
                              <span>SEARCH GAIA DR3 CONE</span>
                            )}
                          </button>
                        </div>

                        {activeGaiaSearchErr && (
                          <div className="border border-red-600 bg-red-950/40 p-2 text-xs text-red-200 flex items-center justify-between">
                            <span>{activeGaiaSearchErr}</span>
                            <button
                              onClick={handleTriggerGaiaSearch}
                              className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {activeGaiaSearch && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs text-neutral-400 border-b border-neutral-800 pb-1">
                              <span>Found <strong className="text-white">{activeGaiaSearch.sources.length}</strong> Gaia DR3 sources within {activeGaiaSearch.query.radius_arcsec}&quot;</span>
                              <span className="text-[10px]">ICRS J2016.0</span>
                            </div>

                            <div className="overflow-x-auto max-h-56">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase sticky top-0 bg-[#0d0d0d]">
                                    <th className="py-1 px-2">Gaia Source ID</th>
                                    <th className="py-1 px-2">Sep (&quot;)</th>
                                    <th className="py-1 px-2">RA (deg)</th>
                                    <th className="py-1 px-2">Dec (deg)</th>
                                    <th className="py-1 px-2">G (mag)</th>
                                    <th className="py-1 px-2">BP (mag)</th>
                                    <th className="py-1 px-2">RP (mag)</th>
                                    <th className="py-1 px-2">PM RA</th>
                                    <th className="py-1 px-2">PM Dec</th>
                                    <th className="py-1 px-2">RUWE</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-900 text-[11px]">
                                  {activeGaiaSearch.sources.map((src, idx) => (
                                    <tr key={src.source_id} className="hover:bg-neutral-900">
                                      <td className="py-1 px-2 text-cyan-300 font-mono">{src.source_id}</td>
                                      <td className="py-1 px-2 text-white font-bold">
                                        {activeGaiaSearch.separations_arcsec[idx]?.toFixed(3) ?? "-"}
                                      </td>
                                      <td className="py-1 px-2 text-neutral-300">{src.coordinates.ra.toFixed(5)}</td>
                                      <td className="py-1 px-2 text-neutral-300">{src.coordinates.dec.toFixed(5)}</td>
                                      <td className="py-1 px-2 text-emerald-400 font-bold">
                                        {src.photometry.g != null ? src.photometry.g.toFixed(2) : "-"}
                                      </td>
                                      <td className="py-1 px-2 text-neutral-300">
                                        {src.photometry.bp != null ? src.photometry.bp.toFixed(2) : "-"}
                                      </td>
                                      <td className="py-1 px-2 text-neutral-300">
                                        {src.photometry.rp != null ? src.photometry.rp.toFixed(2) : "-"}
                                      </td>
                                      <td className="py-1 px-2 text-neutral-400 font-mono">
                                        {src.astrometry.pmra_mas_yr != null ? src.astrometry.pmra_mas_yr.toFixed(1) : "-"}
                                      </td>
                                      <td className="py-1 px-2 text-neutral-400 font-mono">
                                        {src.astrometry.pmdec_mas_yr != null ? src.astrometry.pmdec_mas_yr.toFixed(1) : "-"}
                                      </td>
                                      <td className="py-1 px-2 text-neutral-400 font-mono">
                                        {src.astrometry.ruwe != null ? src.astrometry.ruwe.toFixed(2) : "-"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Photometric Epoch Measurements Ledger */}
              <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-col gap-2">
                <span className="text-xs font-bold uppercase text-white tracking-wider border-b border-neutral-800 pb-1">
                  Photometric Epoch Measurements Ledger
                </span>

                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase sticky top-0 bg-[#0d0d0d]">
                        <th className="py-1.5 px-2">UTC</th>
                        <th className="py-1.5 px-2">MJD</th>
                        <th className="py-1.5 px-2">Band</th>
                        <th className="py-1.5 px-2">Flux (Jy)</th>
                        <th className="py-1.5 px-2">1-σ Error</th>
                        <th className="py-1.5 px-2">SNR</th>
                        <th className="py-1.5 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900 text-[11px]">
                      {validPoints.map(({ point: p, band }, idx) => (
                        <tr key={idx} className="hover:bg-neutral-900 transition-colors">
                          <td className="py-1.5 px-2 text-neutral-300">{p.time_utc || "-"}</td>
                          <td className="py-1.5 px-2 text-neutral-400">{p.time_mjd?.toFixed(4) || "-"}</td>
                          <td className="py-1.5 px-2">
                            <span className={`font-bold ${BAND_COLORS[band]?.text || "text-white"}`}>
                              {band.replace("SPHEREx-", "")}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-white font-bold">{p.flux_jy.toFixed(5)}</td>
                          <td className="py-1.5 px-2 text-neutral-400">±{p.flux_jy_error?.toFixed(5) || "0.00000"}</td>
                          <td className="py-1.5 px-2 text-cyan-300">{p.snr ? p.snr.toFixed(1) : "-"}</td>
                          <td className="py-1.5 px-2">
                            <span className="px-1.5 py-0.2 text-[10px] uppercase bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                              {p.quality === "PASS" ? "ACK" : p.quality}
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
        <div className="border border-neutral-800 bg-[#0d0d0d] p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="text-xs font-bold text-white uppercase tracking-wider">
            Time-Domain Photometry Standby
          </div>
          <p className="text-xs text-neutral-400 max-w-md">
            Click Extract Light Curves above to detect compact sources across all discovered epochs and compute multi-band flux time-series.
          </p>
          <button
            onClick={handleRun}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            EXTRACT LIGHT CURVES
          </button>
        </div>
      )}
    </div>
  );
}
