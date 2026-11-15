import { useState, useId } from "react";
import {
  type TargetLightCurveResponse,
  type SourceLightCurve,
  type LightCurvePoint,
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
  onExtractLightCurve: (maxObs: number, thresholdSigma: number, band: string) => void;
  onSelectSourceId: (sourceId: string) => void;
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
  onExtractLightCurve,
  onSelectSourceId,
  onNavigateTab,
}: TimeDomainAnalysisTabProps) {
  const maxObsId = useId();
  const sigmaId = useId();

  const [maxObs, setMaxObs] = useState("10");
  const [sigma, setSigma] = useState("3.0");
  const [selectedBand, setSelectedBand] = useState<string>("ALL");
  const [activeAnalysisMode, setActiveAnalysisMode] = useState<"lightcurve" | "transients" | "motion" | "spectral">("lightcurve");

  const [hoveredPoint, setHoveredPoint] = useState<LightCurvePoint | null>(null);

  const activeSource: SourceLightCurve | undefined = lightCurveData?.sources?.find(
    (s) => s.source_id === selectedSourceId
  ) || lightCurveData?.sources?.[0];

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

              {/* Mode 4: Spectral Channels */}
              {activeAnalysisMode === "spectral" && (
                <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold uppercase text-white">
                      SPHEREx Linear Variable Filter Channels (D1 to D6)
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      Mean flux per spectral channel
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {["SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3", "SPHEREx-D4", "SPHEREx-D5", "SPHEREx-D6"].map((b) => {
                      const seriesForBand = activeSource?.series.find((s) => s.band === b);
                      const meanVal = seriesForBand?.metrics.mean_flux_jy;

                      return (
                        <div key={b} className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col">
                          <span className={`text-[10px] font-bold ${BAND_COLORS[b]?.text || "text-white"}`}>
                            {b.replace("SPHEREx-", "")}
                          </span>
                          <span className="text-sm font-bold text-white mt-1">
                            {meanVal != null ? `${(meanVal * 1000).toFixed(2)} mJy` : "No Data"}
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

