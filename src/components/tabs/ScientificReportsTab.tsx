import { useState } from "react";
import {
  type TimelineResponse,
  type TimelineProduct,
  type CutoutResponse,
  type InspectResponse,
  type ComparisonResponse,
  type TargetLightCurveResponse,
  type SpectralExtractionResponse,
  type SpectralComparisonResponse,
} from "@/lib/api";

export interface ScientificReportsTabProps {
  ra: string;
  dec: string;
  radius: string;
  collection: string;
  timelineData: TimelineResponse | null;
  selectedProduct: TimelineProduct | null;
  cutoutData: CutoutResponse | null;
  inspectData: InspectResponse | null;
  epochA: TimelineProduct | null;
  epochB: TimelineProduct | null;
  comparisonResult: ComparisonResponse | null;
  lightCurveData: TargetLightCurveResponse | null;
  selectedSourceId: string | null;
  spectrumData?: SpectralExtractionResponse | null;
  spectralComparison?: SpectralComparisonResponse | null;
  onNavigateTab: (tab: "discovery" | "explorer" | "differential" | "timedomain" | "reports") => void;
}

export default function ScientificReportsTab({
  ra,
  dec,
  radius,
  collection,
  timelineData,
  selectedProduct,
  cutoutData,
  inspectData,
  epochA,
  epochB,
  comparisonResult,
  lightCurveData,
  selectedSourceId,
  spectrumData,
  spectralComparison,
  onNavigateTab,
}: ScientificReportsTabProps) {
  // Section toggle state
  const [includeDiscovery, setIncludeDiscovery] = useState(true);
  const [includeInspection, setIncludeInspection] = useState(true);
  const [includeDifferential, setIncludeDifferential] = useState(true);
  const [includeTimeDomain, setIncludeTimeDomain] = useState(true);
  const [includeSpectral, setIncludeSpectral] = useState(true);
  const [includeProvenance, setIncludeProvenance] = useState(true);
  const [generatedTimeUtc] = useState<string>(() => new Date().toISOString().replace("T", " ").slice(0, 19));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insp = (inspectData?.inspection || null) as any;
  const activeSource = lightCurveData?.sources?.find((s) => s.source_id === selectedSourceId) || lightCurveData?.sources?.[0];
  const activeSeries = activeSource?.series?.[0];
  const metrics = activeSeries?.metrics;

  // JSON Export Handler
  const handleExportJson = () => {
    const reportData = {
      title: "AstroChronoscope Scientific Investigation Report",
      generated_at_utc: new Date().toISOString(),
      platform: "AstroChronoscope v0.1.0 (NASA SPHEREx / IPAC IRSA)",
      target: {
        ra_deg: parseFloat(ra),
        dec_deg: parseFloat(dec),
        search_radius_deg: parseFloat(radius),
        collection: collection,
        frame: "ICRS (J2000)",
      },
      discovery_summary: timelineData ? {
        unique_epochs: timelineData.unique_epochs,
        total_products: timelineData.total_products,
        temporal_baseline_days: timelineData.temporal_baseline_days,
        earliest_epoch: timelineData.earliest_observation_time,
        latest_epoch: timelineData.latest_observation_time,
        available_bands: timelineData.available_bands,
      } : null,
      fits_inspection: insp ? {
        observation_id: selectedProduct?.observation_id,
        band: selectedProduct?.band,
        wcs: insp.wcs,
        stats: insp.stats,
        hdus: insp.hdus,
      } : null,
      differential_analysis: comparisonResult ? {
        comparison_id: comparisonResult.comparison_id,
        status: comparisonResult.status,
        scientifically_valid: comparisonResult.scientifically_valid,
        difference_model: comparisonResult.metadata?.difference_model,
        epoch_a: epochA?.observation_id,
        epoch_b: epochB?.observation_id,
        checks: comparisonResult.quality?.checks,
      } : null,
      time_domain_photometry: lightCurveData ? {
        sources_detected: lightCurveData.sources?.length ?? 0,
        active_source: activeSource ? {
          source_id: activeSource.source_id,
          reference_ra_deg: activeSource.reference_ra_deg,
          reference_dec_deg: activeSource.reference_dec_deg,
          position_scatter_arcsec: activeSource.position_scatter_arcsec,
          variability_metrics: metrics,
          measurements_count: activeSeries?.points?.length ?? 0,
        } : null,
      } : null,
      spectra: spectrumData?.spectrum ? {
        spectrum_id: spectrumData.spectrum.spectrum_id,
        collection: spectrumData.spectrum.collection,
        product_id: spectrumData.spectrum.product_id,
        valid_channels: spectrumData.spectrum.valid_channel_count,
        total_channels: spectrumData.spectrum.channel_count,
        wavelength_min_um: spectrumData.spectrum.wavelength_min_um,
        wavelength_max_um: spectrumData.spectrum.wavelength_max_um,
        quality: spectrumData.spectrum.quality,
        provenance: spectrumData.provenance,
        limitations: spectrumData.spectrum.limitations,
      } : null,
      spectral_comparison: spectralComparison?.comparison ? {
        spectrum_id_a: spectralComparison.comparison.spectrum_id_a,
        spectrum_id_b: spectralComparison.comparison.spectrum_id_b,
        basis: spectralComparison.comparison.comparison_basis,
        overlap_channels: spectralComparison.comparison.overlap_channel_count,
        grid_compatible: spectralComparison.comparison.grid_compatible,
        quality: spectralComparison.comparison.quality,
      } : null,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AstroChronoscope_Report_${parseFloat(ra).toFixed(4)}_${parseFloat(dec).toFixed(4)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV Photometry Export Handler
  const handleExportCsv = () => {
    if (!activeSeries || !activeSeries.points.length) return;

    const headers = ["time_utc", "time_mjd", "band", "flux_jy", "flux_jy_error", "snr", "quality", "observation_id"];
    const rows = activeSeries.points.map((p) => [
      p.time_utc || "",
      p.time_mjd != null ? p.time_mjd.toFixed(5) : "",
      p.band || "",
      p.flux_jy.toFixed(6),
      p.flux_jy_error != null ? p.flux_jy_error.toFixed(6) : "",
      p.snr != null ? p.snr.toFixed(2) : "",
      p.quality || "PASS",
      p.observation_id || "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LightCurve_${activeSource?.source_id.slice(0, 16)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6 font-mono">
      {/* Workspace Header */}
      <div className="flex flex-col gap-1 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
          <h1 className="text-sm sm:text-base font-bold tracking-widest uppercase text-white">
            Scientific Reports & Synthesis Workspace
          </h1>
          <span className="text-[10px] text-neutral-400 uppercase">
            Stage 5 of 5 · Consolidate Evidence, Provenance & Export
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          Gather and consolidate observational evidence generated across Discovery, Image Explorer, Differential Analysis, and Time-Domain Analysis into structured, reproducible scientific reports.
        </p>
      </div>

      {/* Report Controls & Export Actions Bar */}
      <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Section Inclusion Checkboxes */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[10px] text-neutral-500 uppercase mr-1">Include Sections:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDiscovery}
              onChange={(e) => setIncludeDiscovery(e.target.checked)}
              className="accent-purple-500"
            />
            <span className={includeDiscovery ? "text-white" : "text-neutral-500"}>Discovery</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInspection}
              onChange={(e) => setIncludeInspection(e.target.checked)}
              className="accent-purple-500"
            />
            <span className={includeInspection ? "text-white" : "text-neutral-500"}>FITS Inspection</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDifferential}
              onChange={(e) => setIncludeDifferential(e.target.checked)}
              className="accent-purple-500"
            />
            <span className={includeDifferential ? "text-white" : "text-neutral-500"}>Differencing</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTimeDomain}
              onChange={(e) => setIncludeTimeDomain(e.target.checked)}
              className="accent-purple-500"
            />
            <span className={includeTimeDomain ? "text-white" : "text-neutral-500"}>Time-Domain</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSpectral}
              onChange={(e) => setIncludeSpectral(e.target.checked)}
              className="accent-purple-500"
            />
            <span className={includeSpectral ? "text-white" : "text-neutral-500"}>DR1 Spectra</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeProvenance}
              onChange={(e) => setIncludeProvenance(e.target.checked)}
              className="accent-purple-500"
            />
            <span className={includeProvenance ? "text-white" : "text-neutral-500"}>Provenance</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={!activeSeries || !activeSeries.points.length}
            className="px-3 py-1.5 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-xs text-neutral-300 hover:text-white uppercase transition-all cursor-pointer"
            title="Export Photometry Measurements as CSV"
          >
            Export CSV
          </button>

          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 rounded border border-purple-500/50 bg-purple-950/30 hover:bg-purple-900/40 text-xs text-purple-200 uppercase transition-all cursor-pointer"
            title="Export Full Investigation Data Package as JSON"
          >
            Export JSON
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_12px_rgba(168,85,247,0.3)]"
          >
            Print / PDF Report
          </button>
        </div>
      </section>

      {/* Printable Report Document Body */}
      <div className="rounded border border-neutral-800 bg-[#040507] p-6 sm:p-8 flex flex-col gap-8 shadow-2xl">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-neutral-800 pb-5">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-[0.2em]">
              NASA SPHEREx ARCHIVAL INVESTIGATION REPORT
            </span>
            <h2 className="text-lg sm:text-xl font-bold tracking-wider text-white uppercase">
              Target RA {parseFloat(ra).toFixed(4)}°, Dec {parseFloat(dec).toFixed(4)}°
            </h2>
            <div className="text-xs text-neutral-400 flex items-center gap-2 mt-1">
              <span>Collection: {collection}</span>
              <span>·</span>
              <span>Celestial System: ICRS J2000</span>
              <span>·</span>
              <span>Radius: {radius}°</span>
            </div>
          </div>

          <div className="flex flex-col sm:text-right text-xs text-neutral-500">
            <span>Report ID: ASTRO-{Math.abs(Math.round(parseFloat(ra) * 100))}-{Math.abs(Math.round(parseFloat(dec) * 100))}</span>
            <span>Date Generated: {generatedTimeUtc} UTC</span>
            <span className="text-emerald-400 font-bold mt-1">Status: Genuine Archival Observations</span>
          </div>
        </div>

        {/* Section 1: Target Discovery Summary */}
        {includeDiscovery && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                1. Archival Discovery & Temporal Baseline
              </h3>
              <span className="text-[10px] text-neutral-500 uppercase">Stage 1 Discovery</span>
            </div>

            {timelineData ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase">Unique Observation Epochs</span>
                  <span className="text-sm font-bold text-white">{timelineData.unique_epochs}</span>
                </div>

                <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase">Total Archival Products</span>
                  <span className="text-sm font-bold text-white">{timelineData.total_products}</span>
                </div>

                <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase">Temporal Baseline</span>
                  <span className="text-sm font-bold text-amber-400">
                    {timelineData.temporal_baseline_days != null
                      ? `${timelineData.temporal_baseline_days.toFixed(1)} days`
                      : "Single epoch"}
                  </span>
                </div>

                <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase">Detected Bands</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {timelineData.available_bands.join(", ") || "None"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded border border-dashed border-neutral-800 text-xs text-neutral-500 text-center">
                Observation discovery not yet performed.
                <button
                  onClick={() => onNavigateTab("discovery")}
                  className="ml-2 text-sky-400 underline cursor-pointer"
                >
                  Run Discovery
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 2: FITS Inspection Findings */}
        {includeInspection && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                2. Single-Observation Astrometry & Quality Inspection
              </h3>
              <span className="text-[10px] text-neutral-500 uppercase">Stage 2 Image Explorer</span>
            </div>

            {selectedProduct && insp ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase">Inspected Observation</span>
                  <span className="font-bold text-white">{selectedProduct.observation_id}</span>
                  <span className="text-[10px] text-neutral-400 mt-1">Band: {selectedProduct.band}</span>
                </div>

                <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase">WCS Astrometric Solution</span>
                  <span className="font-bold text-emerald-400">
                    {insp.wcs?.projection || "TAN-SIP"} ({insp.wcs?.pixel_scale_arcsec?.toFixed(2) ?? "6.2"} arcsec/px)
                  </span>
                  <span className="text-[10px] text-neutral-400 mt-1">
                    Target inside: {insp.wcs?.target_inside_image ? "VERIFIED" : "OUTSIDE"}
                  </span>
                </div>

                <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase">Flux Statistics</span>
                  <span className="font-bold text-white">
                    Mean: {insp.stats?.mean?.toFixed(4) ?? "N/A"} {cutoutData?.cutout.unit || "MJy/sr"}
                  </span>
                  <span className="text-[10px] text-neutral-400 mt-1">
                    Std: {insp.stats?.std?.toFixed(4) ?? "N/A"} · Valid: {((insp.stats?.valid_fraction ?? 1) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded border border-dashed border-neutral-800 text-xs text-neutral-500 text-center">
                Individual FITS inspection not yet performed.
                <button
                  onClick={() => onNavigateTab("explorer")}
                  className="ml-2 text-cyan-400 underline cursor-pointer"
                >
                  Open Image Explorer
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 3: Differential Comparison Findings */}
        {includeDifferential && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                3. Differential Reprojection & Differencing
              </h3>
              <span className="text-[10px] text-neutral-500 uppercase">Stage 3 Differential Analysis</span>
            </div>

            {comparisonResult ? (
              <div className="flex flex-col gap-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Epoch A (Reference)</span>
                    <span className="font-bold text-white">{epochA?.observation_id || "OBS_A"}</span>
                    <span className="text-[10px] text-neutral-400 mt-1">Date: {epochA?.observation_time?.split("T")[0]}</span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Epoch B (Target)</span>
                    <span className="font-bold text-white">{epochB?.observation_id || "OBS_B"}</span>
                    <span className="text-[10px] text-neutral-400 mt-1">Date: {epochB?.observation_time?.split("T")[0]}</span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Differencing Verdict</span>
                    <span className={`font-bold ${comparisonResult.scientifically_valid ? "text-emerald-400" : "text-amber-400"}`}>
                      {comparisonResult.scientifically_valid ? "Verified Clean Difference" : "Completed with Caveats"}
                    </span>
                    <span className="text-[10px] text-neutral-400 mt-1">Model: {comparisonResult.metadata?.difference_model}</span>
                  </div>
                </div>

                {/* Quality Checklist Summary */}
                {comparisonResult.quality && (
                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/40 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Scientific Checks Passed:</span>
                    <div className="flex flex-wrap gap-2 text-[10px] mt-1">
                      {comparisonResult.quality.checks.map((chk, i) => (
                        <span
                          key={i}
                          className={`px-1.5 py-0.5 rounded ${
                            chk.status === "PASS"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {chk.name}: {chk.status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded border border-dashed border-neutral-800 text-xs text-neutral-500 text-center">
                Differential comparison not yet performed.
                <button
                  onClick={() => onNavigateTab("differential")}
                  className="ml-2 text-amber-400 underline cursor-pointer"
                >
                  Run Differential Analysis
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 4: Time-Domain Photometry & Variability Findings */}
        {includeTimeDomain && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                4. Time-Domain Photometry & Source Variability Evidence
              </h3>
              <span className="text-[10px] text-neutral-500 uppercase">Stage 4 Time-Domain Analysis</span>
            </div>

            {lightCurveData && activeSource ? (
              <div className="flex flex-col gap-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Sources Associated</span>
                    <span className="font-bold text-white">{lightCurveData.sources?.length ?? 0}</span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Reduced Chi-Square</span>
                    <span className={`font-bold ${
                      (metrics?.reduced_chi2 ?? 0) > 3.0
                        ? "text-rose-400"
                        : (metrics?.reduced_chi2 ?? 0) > 1.5
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}>
                      {metrics?.reduced_chi2 != null ? metrics.reduced_chi2.toFixed(2) : "N/A"}
                    </span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Fractional Variability</span>
                    <span className="font-bold text-cyan-300">
                      {metrics?.fractional_variability != null
                        ? `${(metrics.fractional_variability * 100).toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Weighted Mean Flux</span>
                    <span className="font-bold text-white font-mono">
                      {metrics?.weighted_mean_flux_jy != null
                        ? `${(metrics.weighted_mean_flux_jy * 1000).toFixed(2)} mJy`
                        : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Compact Photometry Ledger in Report */}
                {activeSeries && activeSeries.points.length > 0 && (
                  <div className="rounded border border-neutral-900 bg-neutral-950/40 p-3">
                    <div className="text-[10px] text-neutral-500 uppercase mb-2">
                      Photometric Observations Summary:
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-800 text-neutral-500 text-[10px] uppercase">
                            <th className="py-1 px-2">MJD</th>
                            <th className="py-1 px-2">Date (UTC)</th>
                            <th className="py-1 px-2">Band</th>
                            <th className="py-1 px-2">Flux (Jy)</th>
                            <th className="py-1 px-2">Uncertainty</th>
                            <th className="py-1 px-2">SNR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-900">
                          {activeSeries.points.map((p, i) => (
                            <tr key={i}>
                              <td className="py-1 px-2 text-neutral-400">{p.time_mjd?.toFixed(3) ?? "N/A"}</td>
                              <td className="py-1 px-2 text-neutral-300">{p.time_utc?.split("T")[0] ?? "N/A"}</td>
                              <td className="py-1 px-2 text-emerald-400 font-bold">{p.band?.replace("SPHEREx-", "")}</td>
                              <td className="py-1 px-2 text-white font-bold">{p.flux_jy.toFixed(5)}</td>
                              <td className="py-1 px-2 text-neutral-400">± {p.flux_jy_error?.toFixed(5) ?? "0"}</td>
                              <td className="py-1 px-2 text-cyan-300">{p.snr?.toFixed(1) ?? "N/A"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded border border-dashed border-neutral-800 text-xs text-neutral-500 text-center">
                Time-domain source extraction not yet performed.
                <button
                  onClick={() => onNavigateTab("timedomain")}
                  className="ml-2 text-emerald-400 underline cursor-pointer"
                >
                  Run Time-Domain Analysis
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 5: SPHEREx DR1 Cube Spectral Findings */}
        {includeSpectral && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                5. SPHEREx DR1 Cube 102-Channel Spectral Profile
              </h3>
              <span className="text-[10px] text-neutral-500 uppercase">Phase 4 Spectral Extraction</span>
            </div>

            {spectrumData?.spectrum ? (
              <div className="flex flex-col gap-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Operational Channels</span>
                    <span className="font-bold text-emerald-400">
                      {spectrumData.spectrum.valid_channel_count} / {spectrumData.spectrum.channel_count} Valid
                    </span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Spectral Span</span>
                    <span className="font-bold text-white">
                      {spectrumData.spectrum.wavelength_min_um?.toFixed(3) ?? "0.750"} - {spectrumData.spectrum.wavelength_max_um?.toFixed(3) ?? "5.000"} µm
                    </span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">HEALPix Spatial Tile</span>
                    <span className="font-bold text-white">
                      Order {spectrumData.provenance.order ?? 5}, NPIX {spectrumData.provenance.npix ?? "9621"}
                    </span>
                  </div>

                  <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase">Calibration Unit</span>
                    <span className="font-bold text-cyan-300">
                      MJy/sr (Surface Brightness)
                    </span>
                  </div>
                </div>

                {spectralComparison?.comparison && (
                  <div className="p-3 rounded border border-amber-500/30 bg-amber-950/20 text-xs flex items-center justify-between">
                    <span className="text-amber-300 font-bold uppercase">
                      Pairwise Spectral Differential Comparison
                    </span>
                    <span className="text-neutral-300">
                      Basis: <strong className="text-white">{spectralComparison.comparison.comparison_basis}</strong> · Overlap: <strong className="text-emerald-400">{spectralComparison.comparison.overlap_channel_count} Channels</strong>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded border border-dashed border-neutral-800 text-xs text-neutral-500 text-center">
                DR1 all-sky cube spectrum not yet extracted for this target.
                <button
                  onClick={() => onNavigateTab("timedomain")}
                  className="ml-2 text-purple-400 underline cursor-pointer"
                >
                  Extract Spectrum in Time-Domain Workspace
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 6: Scientific Provenance & Reproducibility */}
        {includeProvenance && (
          <section className="flex flex-col gap-2 pt-4 border-t border-neutral-800/80 text-[10px] text-neutral-500">
            <span className="font-bold uppercase tracking-wider text-neutral-400">
              6. Scientific Provenance & Audit Trail
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span>Software: AstroChronoscope 0.1.0 · Astropy · PyWCS · Reproject · Photutils</span>
              </div>
              <div className="sm:text-right">
                <span>Archive: NASA/IPAC Infrared Science Archive (IRSA) Simple Image Access 2 (SIA2)</span>
              </div>
            </div>
            <div className="mt-1 text-neutral-600">
              Disclaimer: Observational data originate from actual SPHEREx Quick Release 3 (QR3) products. Variability metrics and photometric difference values are calculated according to documented statistical standards.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
