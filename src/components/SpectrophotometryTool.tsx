import { useState, useCallback, useId } from "react";
import {
  getTargetLightCurve,
  type TargetLightCurveResponse,
  type SourceLightCurve,
  type LightCurvePoint,
} from "@/lib/api";
import { operationMonitor } from "@/lib/operationMonitor";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

interface SpectrophotometryToolProps {
  initialRa: string;
  initialDec: string;
  initialRadius: string;
  initialCutoutSize: string;
  onCoordinatesChange?: (ra: string, dec: string) => void;
}

const BAND_COLORS: Record<string, { stroke: string; fill: string; text: string; bg: string }> = {
  "SPHEREx-D1": { stroke: "#60a5fa", fill: "#3b82f6", text: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/40" },
  "SPHEREx-D2": { stroke: "#22d3ee", fill: "#06b6d4", text: "text-cyan-400", bg: "bg-cyan-500/20 border-cyan-500/40" },
  "SPHEREx-D3": { stroke: "#34d399", fill: "#10b981", text: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/40" },
  "SPHEREx-D4": { stroke: "#fbbf24", fill: "#f59e0b", text: "text-amber-400", bg: "bg-amber-500/20 border-amber-500/40" },
  "SPHEREx-D5": { stroke: "#fb923c", fill: "#f97316", text: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/40" },
  "SPHEREx-D6": { stroke: "#fb7185", fill: "#f43f5e", text: "text-rose-400", bg: "bg-rose-500/20 border-rose-500/40" },
};

const DEFAULT_BAND_COLOR = {
  stroke: "#38bdf8",
  fill: "#0284c7",
  text: "text-sky-400",
  bg: "bg-sky-500/20 border-sky-500/40",
};

export default function SpectrophotometryTool({
  initialRa,
  initialDec,
  initialRadius,
  initialCutoutSize,
  onCoordinatesChange,
}: SpectrophotometryToolProps) {
  const raId = useId();
  const decId = useId();
  const radiusId = useId();
  const cutoutId = useId();
  const maxObsId = useId();
  const sigmaId = useId();

  const [ra, setRa] = useState(initialRa);
  const [dec, setDec] = useState(initialDec);
  const [radius, setRadius] = useState(initialRadius);
  const [cutoutSize, setCutoutSize] = useState(initialCutoutSize);
  const [maxObservations, setMaxObservations] = useState("10");
  const [thresholdSigma, setThresholdSigma] = useState("3.0");
  const [selectedBand, setSelectedBand] = useState<string>("ALL");

  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<TargetLightCurveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<LightCurvePoint | null>(null);

  const handleExtractLightCurve = useCallback(async () => {
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const radiusNum = parseFloat(radius) || 0.05;
    const cutoutNum = parseFloat(cutoutSize) || 0.1;
    const maxObsNum = parseInt(maxObservations, 10) || 10;
    const sigmaNum = parseFloat(thresholdSigma) || 3.0;

    if (isNaN(raNum) || isNaN(decNum)) {
      setError("Target coordinates must be valid floating point values.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      if (onCoordinatesChange) {
        onCoordinatesChange(ra, dec);
      }

      const res = await operationMonitor.executeOperation(
        {
          name: "Spectrophotometry Light Curve",
          category: "timedomain",
          workspace: "timedomain",
          context: {
            ra: raNum,
            dec: decNum,
            radius: radiusNum,
            label: `Band: ${selectedBand}, Max: ${maxObsNum}`,
          },
          dedupKey: `spectro-lc:${raNum.toFixed(4)}:${decNum.toFixed(4)}:${selectedBand}:${maxObsNum}`,
        },
        () =>
          getTargetLightCurve({
            ra: raNum,
            dec: decNum,
            radius_deg: radiusNum,
            cutout_size_deg: cutoutNum,
            max_observations: maxObsNum,
            bands: selectedBand === "ALL" ? undefined : [selectedBand],
            detection: {
              threshold_sigma: sigmaNum,
            },
          })
      );

      setData(res);
      if (res.sources && res.sources.length > 0) {
        setSelectedSourceId(res.sources[0].source_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spectrophotometry extraction failed.");
    } finally {
      setIsLoading(false);
    }
  }, [ra, dec, radius, cutoutSize, maxObservations, thresholdSigma, selectedBand, onCoordinatesChange]);

  const activeSource: SourceLightCurve | undefined = data?.sources?.find(
    (s) => s.source_id === selectedSourceId
  ) || data?.sources?.[0];

  // Consolidate points across bands for plotting
  const allPoints: Array<{ point: LightCurvePoint; band: string }> = [];
  if (activeSource) {
    for (const s of activeSource.series) {
      const bandName = s.band || "Unknown";
      for (const p of s.points) {
        allPoints.push({ point: p, band: bandName });
      }
    }
  }

  // Calculate plot boundaries
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

  // Selected series metrics
  const activeSeries = activeSource?.series?.[0];
  const metrics = activeSeries?.metrics;

  return (
    <div className="flex flex-col gap-5">
      {/* Console Header */}
      <section className="relative rounded border border-neutral-800 bg-[#050608] p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
        <div className="pointer-events-none absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-400/80" />
        <div className="pointer-events-none absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-400/80" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-400/80" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-400/80" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            <h2 className="text-xs sm:text-sm font-bold tracking-widest uppercase text-white">
              Spectrophotometry & Multi-Epoch Light Curve Engine
            </h2>
            <span className="text-[10px] text-neutral-500 uppercase">
              Phase 3 Aperture Photometry & Variability Metrics
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRa("156.09328159");
                setDec("-41.64466331");
                setRadius("0.05");
                setCutoutSize("0.1");
              }}
              className="px-2.5 py-1 rounded border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 hover:border-cyan-400/50 text-[10px] font-mono uppercase tracking-wider text-neutral-300 hover:text-white transition-all cursor-pointer"
            >
              Benchmark Target
            </button>
          </div>
        </div>

        {/* Input Parameters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={raId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              RA (deg)
            </label>
            <input
              id={raId}
              type="text"
              value={ra}
              onChange={(e) => setRa(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-cyan-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={decId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Dec (deg)
            </label>
            <input
              id={decId}
              type="text"
              value={dec}
              onChange={(e) => setDec(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-cyan-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={radiusId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Radius (deg)
            </label>
            <input
              id={radiusId}
              type="text"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-cyan-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={cutoutId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Cutout Size (deg)
            </label>
            <input
              id={cutoutId}
              type="text"
              value={cutoutSize}
              onChange={(e) => setCutoutSize(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-cyan-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={maxObsId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Max Observations
            </label>
            <input
              id={maxObsId}
              type="number"
              min="1"
              max="50"
              value={maxObservations}
              onChange={(e) => setMaxObservations(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-cyan-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={sigmaId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Detection Sigma
            </label>
            <input
              id={sigmaId}
              type="text"
              value={thresholdSigma}
              onChange={(e) => setThresholdSigma(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-cyan-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>
        </div>

        {/* Band Filters & Execution Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase text-neutral-500 mr-1">Band:</span>
            {["ALL", "SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3", "SPHEREx-D4", "SPHEREx-D5", "SPHEREx-D6"].map((b) => (
              <button
                key={b}
                onClick={() => setSelectedBand(b)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider transition-all cursor-pointer ${
                  selectedBand === b
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50"
                    : "bg-neutral-900/60 text-neutral-400 border border-neutral-800 hover:text-white"
                }`}
              >
                {b.replace("SPHEREx-", "")}
              </button>
            ))}
          </div>

          <button
            onClick={handleExtractLightCurve}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 text-white font-mono text-xs uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            {isLoading ? (
              <>
                <TwinOrbit className="size-4 text-white" />
                <span>ASSOCIATING & EXTRACTING...</span>
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
            <span className="text-rose-400 font-bold">PHOTOMETRY PIPELINE EXCEPTION:</span>
            <span>{error}</span>
          </div>
          <button
            onClick={handleExtractLightCurve}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Analysis Results */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Column: Source Roster & Metrics */}
          <div className="flex flex-col gap-4">
            {/* Target & Extraction Overview */}
            <div className="rounded border border-neutral-800 bg-[#050608] p-3.5 flex flex-col gap-3">
              <span className="text-[11px] font-bold tracking-wider text-cyan-400 uppercase border-b border-neutral-800/80 pb-1.5">
                ASSOCIATION SUMMARY
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase">Target RA</div>
                  <div className="text-white font-mono">{data.target.ra.toFixed(5)} deg</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase">Target Dec</div>
                  <div className="text-white font-mono">{data.target.dec.toFixed(5)} deg</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase">Epochs Processed</div>
                  <div className="text-white font-mono">{data.epochs_processed} of {data.epochs_considered}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase">Products Processed</div>
                  <div className="text-white font-mono">{data.products_processed}</div>
                </div>
              </div>
            </div>

            {/* Variability Indicators */}
            <div className="rounded border border-neutral-800 bg-[#050608] p-3.5 flex flex-col gap-3">
              <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase border-b border-neutral-800/80 pb-1.5">
                VARIABILITY EVIDENCE
              </span>

              {metrics ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                    <span className="text-[11px] text-neutral-400">Reduced Chi-Square</span>
                    <span className={`text-xs font-mono font-bold ${
                      (metrics.reduced_chi2 ?? 0) > 3.0
                        ? "text-rose-400"
                        : (metrics.reduced_chi2 ?? 0) > 1.5
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}>
                      {metrics.reduced_chi2 != null ? metrics.reduced_chi2.toFixed(2) : "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                    <span className="text-[11px] text-neutral-400">Fractional Variability (Fvar)</span>
                    <span className="text-xs font-mono text-cyan-300 font-bold">
                      {metrics.fractional_variability != null
                        ? `${(metrics.fractional_variability * 100).toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                    <span className="text-[11px] text-neutral-400">Peak-to-Peak Amplitude</span>
                    <span className="text-xs font-mono text-white">
                      {metrics.peak_to_peak_jy != null ? `${(metrics.peak_to_peak_jy * 1000).toFixed(2)} mJy` : "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                    <span className="text-[11px] text-neutral-400">Weighted Mean Flux</span>
                    <span className="text-xs font-mono text-white">
                      {metrics.weighted_mean_flux_jy != null
                        ? `${(metrics.weighted_mean_flux_jy * 1000).toFixed(2)} mJy`
                        : metrics.mean_flux_jy != null
                          ? `${(metrics.mean_flux_jy * 1000).toFixed(2)} mJy`
                          : "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-neutral-400">Robust Sigma</span>
                    <span className="text-xs font-mono text-neutral-300">
                      {metrics.robust_sigma_jy != null
                        ? `${(metrics.robust_sigma_jy * 1000).toFixed(2)} mJy`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-neutral-500 py-3 text-center">
                  No variability metrics computed for this source series.
                </div>
              )}
            </div>

            {/* Sources List */}
            <div className="rounded border border-neutral-800 bg-[#050608] p-3.5 flex flex-col gap-2.5 max-h-[300px] overflow-y-auto">
              <span className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase border-b border-neutral-800/80 pb-1.5">
                ASSOCIATED SOURCES ({data.sources?.length ?? 0})
              </span>
              <div className="flex flex-col gap-1.5">
                {data.sources?.map((s) => (
                  <button
                    key={s.source_id}
                    onClick={() => setSelectedSourceId(s.source_id)}
                    className={`text-left p-2 rounded border text-xs font-mono transition-all cursor-pointer ${
                      selectedSourceId === s.source_id
                        ? "border-cyan-500 bg-cyan-950/30 text-white"
                        : "border-neutral-800/80 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-400">{s.source_id.slice(0, 14)}...</span>
                      <span className="text-[10px] text-neutral-400">{s.epoch_count} Epochs</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-1 flex items-center justify-between">
                      <span>RA {s.reference_ra_deg.toFixed(4)}</span>
                      <span>Dec {s.reference_dec_deg.toFixed(4)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Light Curve & Measurement Table */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* Light Curve Graph */}
            <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider uppercase text-white">
                    Flux Density Time Series
                  </span>
                  <span className="text-[10px] text-neutral-500 uppercase">
                    S_nu (Jy) vs Modified Julian Date (MJD)
                  </span>
                </div>

                {/* Band Legends */}
                <div className="flex items-center gap-3 text-[10px]">
                  {Object.entries(BAND_COLORS).map(([b, col]) => (
                    <div key={b} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.fill }} />
                      <span className="text-neutral-400">{b.replace("SPHEREx-", "")}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Light Curve SVG Canvas */}
              {validPoints.length > 0 ? (
                <div className="relative w-full overflow-x-auto bg-[#030406] rounded border border-neutral-900 p-2">
                  <svg
                    viewBox={`0 0 ${plotWidth} ${plotHeight}`}
                    className="w-full h-auto select-none"
                    style={{ minWidth: "500px" }}
                  >
                    {/* Background Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                      const y = padTop + innerHeight * frac;
                      const fluxVal = fluxMax - frac * fluxRange;
                      return (
                        <g key={`grid-y-${frac}`}>
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
                        <g key={`grid-x-${frac}`}>
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

                    {/* Light Curve Connection Line */}
                    {validPoints.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeOpacity="0.4"
                        points={validPoints
                          .sort((a, b) => (a.point.time_mjd ?? 0) - (b.point.time_mjd ?? 0))
                          .map((p) => `${toPlotX(p.point.time_mjd!)},${toPlotY(p.point.flux_jy)}`)
                          .join(" ")}
                      />
                    )}

                    {/* Data Points with Error Whiskers */}
                    {validPoints.map(({ point: p, band }, idx) => {
                      const cx = toPlotX(p.time_mjd!);
                      const cy = toPlotY(p.flux_jy);
                      const col = BAND_COLORS[band] || DEFAULT_BAND_COLOR;
                      const err = p.flux_jy_error || 0;
                      const yTop = toPlotY(p.flux_jy + err);
                      const yBottom = toPlotY(p.flux_jy - err);

                      return (
                        <g
                          key={`pt-${idx}`}
                          className="cursor-pointer group"
                          onMouseEnter={() => setHoveredPoint(p)}
                          onMouseLeave={() => setHoveredPoint(null)}
                        >
                          {/* Error Whisker */}
                          {err > 0 && (
                            <>
                              <line
                                x1={cx}
                                y1={yTop}
                                x2={cx}
                                y2={yBottom}
                                stroke={col.stroke}
                                strokeWidth="1.5"
                                opacity="0.8"
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

                          {/* Data Marker Dot */}
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

                    {/* Axis Labels */}
                    <text
                      x={plotWidth / 2}
                      y={plotHeight - 8}
                      textAnchor="middle"
                      fill="#9ca3af"
                      fontSize="10"
                      fontFamily="monospace"
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
                      fontFamily="monospace"
                      letterSpacing="0.1em"
                      transform={`rotate(-90 16 ${plotHeight / 2})`}
                    >
                      FLUX DENSITY S_nu (Jy)
                    </text>
                  </svg>

                  {/* Tooltip on Hover */}
                  {hoveredPoint && (
                    <div className="absolute top-4 right-4 rounded border border-neutral-700 bg-black/90 p-2.5 text-xs font-mono shadow-2xl flex flex-col gap-1 pointer-events-none">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400 font-bold">{hoveredPoint.band || "Band"}</span>
                        <span className="text-neutral-400">MJD: {hoveredPoint.time_mjd?.toFixed(4)}</span>
                      </div>
                      <div className="text-white">
                        Flux: {hoveredPoint.flux_jy.toFixed(5)} ± {hoveredPoint.flux_jy_error?.toFixed(5) ?? "0"} Jy
                      </div>
                      <div className="text-neutral-400 text-[10px]">
                        SNR: {hoveredPoint.snr?.toFixed(1) ?? "N/A"} | Quality: {hoveredPoint.quality}
                      </div>
                      {hoveredPoint.time_utc && (
                        <div className="text-neutral-500 text-[10px]">{hoveredPoint.time_utc}</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center border border-neutral-900 rounded bg-[#030406] text-neutral-500 text-xs">
                  <span>No light curve points available for current selection.</span>
                </div>
              )}
            </div>

            {/* Photometric Measurements Ledger */}
            <div className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
              <span className="text-xs font-bold tracking-wider uppercase text-white">
                Photometry Measurements Ledger
              </span>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
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
                    {validPoints.map(({ point: p, band }, i) => (
                      <tr key={i} className="hover:bg-neutral-900/50 transition-colors">
                        <td className="py-2 px-2.5 text-neutral-300">{p.time_utc || "N/A"}</td>
                        <td className="py-2 px-2.5 text-neutral-400">{p.time_mjd?.toFixed(4) || "N/A"}</td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              BAND_COLORS[band]?.text || "text-sky-400"
                            }`}
                          >
                            {band.replace("SPHEREx-", "")}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-white font-bold">{p.flux_jy.toFixed(5)}</td>
                        <td className="py-2 px-2.5 text-neutral-400">± {p.flux_jy_error?.toFixed(5) || "0.00000"}</td>
                        <td className="py-2 px-2.5 text-cyan-300">{p.snr ? p.snr.toFixed(1) : "N/A"}</td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                              p.quality === "PASS"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
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
      )}

      {/* Empty State Instructions */}
      {!data && !isLoading && !error && (
        <div className="rounded border border-neutral-800 bg-[#050608] p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-full border border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-lg">
            ✧
          </div>
          <h3 className="text-sm font-bold tracking-wider uppercase text-white font-mono">
            Awaiting Target Light Curve Query
          </h3>
          <p className="max-w-md text-xs text-neutral-400 leading-relaxed font-mono">
            Enter celestial coordinates (RA, Dec) above or click Benchmark Target, then click Extract Light Curves to perform cross-epoch source association and generate multi-band light curves with variability metrics.
          </p>
        </div>
      )}
    </div>
  );
}
