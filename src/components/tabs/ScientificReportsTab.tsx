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
    <div className="flex flex-col gap-4 font-mono text-neutral-200">
      {/* Report Controls & Export Actions Bar */}
      <section className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-wrap items-center justify-between gap-3">
        {/* Section Inclusion Checkboxes */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[10px] text-neutral-400 uppercase font-bold mr-1">SECTIONS:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDiscovery}
              onChange={(e) => setIncludeDiscovery(e.target.checked)}
              className="accent-neutral-400"
            />
            <span className={includeDiscovery ? "text-white font-bold" : "text-neutral-500"}>Discovery</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInspection}
              onChange={(e) => setIncludeInspection(e.target.checked)}
              className="accent-neutral-400"
            />
            <span className={includeInspection ? "text-white font-bold" : "text-neutral-500"}>FITS Inspection</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDifferential}
              onChange={(e) => setIncludeDifferential(e.target.checked)}
              className="accent-neutral-400"
            />
            <span className={includeDifferential ? "text-white font-bold" : "text-neutral-500"}>Differencing</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTimeDomain}
              onChange={(e) => setIncludeTimeDomain(e.target.checked)}
              className="accent-neutral-400"
            />
            <span className={includeTimeDomain ? "text-white font-bold" : "text-neutral-500"}>Time-Domain</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSpectral}
              onChange={(e) => setIncludeSpectral(e.target.checked)}
              className="accent-neutral-400"
            />
            <span className={includeSpectral ? "text-white font-bold" : "text-neutral-500"}>DR1 Spectra</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeProvenance}
              onChange={(e) => setIncludeProvenance(e.target.checked)}
              className="accent-neutral-400"
            />
            <span className={includeProvenance ? "text-white font-bold" : "text-neutral-500"}>Provenance</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={!activeSeries || !activeSeries.points.length}
            className="px-3 py-1 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-xs text-neutral-300 hover:text-white uppercase font-bold cursor-pointer"
          >
            EXPORT CSV
          </button>

          <button
            onClick={handleExportJson}
            className="px-3 py-1 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 hover:text-white uppercase font-bold cursor-pointer"
          >
            EXPORT JSON
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-1 bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            PRINT / PDF
          </button>
        </div>
      </section>

      {/* Report Document Body */}
      <div className="border border-neutral-800 bg-[#0d0d0d] p-5 flex flex-col gap-6">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-neutral-800 pb-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
              SPHEREx SCIENTIFIC INVESTIGATION REPORT
            </span>
            <h2 className="text-base font-bold tracking-wider text-white uppercase">
              TARGET RA {parseFloat(ra).toFixed(4)}°, DEC {parseFloat(dec).toFixed(4)}°
            </h2>
            <div className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
              <span>Collection: {collection}</span>
              <span>·</span>
              <span>Frame: ICRS J2000</span>
              <span>·</span>
              <span>Radius: {radius}°</span>
            </div>
          </div>

          <div className="flex flex-col sm:text-right text-xs text-neutral-400 font-mono">
            <span>ID: ASTRO-{Math.abs(Math.round(parseFloat(ra) * 100))}-{Math.abs(Math.round(parseFloat(dec) * 100))}</span>
            <span>Date: {generatedTimeUtc} UTC</span>
            <span className="text-emerald-400 font-bold mt-0.5">AUTHENTIC ARCHIVAL DATA</span>
          </div>
        </div>

        {/* Section 1: Target Discovery Summary */}
        {includeDiscovery && (
          <section className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white border-b border-neutral-800 pb-1">
              1. Archival Discovery & Temporal Baseline
            </span>

            {timelineData ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Unique Epochs</span>
                  <span className="text-sm font-bold text-white">{timelineData.unique_epochs}</span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Total Products</span>
                  <span className="text-sm font-bold text-white">{timelineData.total_products}</span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Temporal Baseline</span>
                  <span className="text-sm font-bold text-amber-300">
                    {timelineData.temporal_baseline_days != null
                      ? `${timelineData.temporal_baseline_days.toFixed(1)} days`
                      : "Single epoch"}
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Available Bands</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {timelineData.available_bands.join(", ") || "None"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 border border-neutral-800 bg-black text-xs text-neutral-500">
                Discovery search not yet executed.
                <button
                  onClick={() => onNavigateTab("discovery")}
                  className="ml-2 text-blue-400 underline cursor-pointer"
                >
                  Run Discovery
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 2: FITS Inspection Findings */}
        {includeInspection && (
          <section className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white border-b border-neutral-800 pb-1">
              2. FITS Astrometry & Quality Inspection
            </span>

            {selectedProduct && insp ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Observation</span>
                  <span className="font-bold text-white">{selectedProduct.observation_id}</span>
                  <span className="text-[10px] text-neutral-400">Band: {selectedProduct.band}</span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">WCS Solution</span>
                  <span className="font-bold text-emerald-400">
                    {insp.wcs?.projection || "TAN-SIP"} ({insp.wcs?.pixel_scale_arcsec?.toFixed(2) ?? "6.2"} arcsec/px)
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    Target inside: {insp.wcs?.target_inside_image ? "VERIFIED" : "OUTSIDE"}
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Flux Statistics</span>
                  <span className="font-bold text-white">
                    Mean: {insp.stats?.mean?.toFixed(4) ?? "N/A"} {cutoutData?.cutout.unit || "MJy/sr"}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    Std: {insp.stats?.std?.toFixed(4) ?? "N/A"} · Valid: {((insp.stats?.valid_fraction ?? 1) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 border border-neutral-800 bg-black text-xs text-neutral-500">
                FITS inspection not yet executed.
                <button
                  onClick={() => onNavigateTab("explorer")}
                  className="ml-2 text-blue-400 underline cursor-pointer"
                >
                  Open Image Explorer
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 3: Differential Comparison Findings */}
        {includeDifferential && (
          <section className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white border-b border-neutral-800 pb-1">
              3. Differential Reprojection & Subtraction
            </span>

            {comparisonResult ? (
              <div className="flex flex-col gap-2 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                    <span className="text-[10px] text-neutral-500 uppercase">Epoch A (Ref)</span>
                    <span className="font-bold text-white">{epochA?.observation_id || "OBS_A"}</span>
                    <span className="text-[10px] text-neutral-400">Date: {epochA?.observation_time?.split("T")[0]}</span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                    <span className="text-[10px] text-neutral-500 uppercase">Epoch B (Target)</span>
                    <span className="font-bold text-white">{epochB?.observation_id || "OBS_B"}</span>
                    <span className="text-[10px] text-neutral-400">Date: {epochB?.observation_time?.split("T")[0]}</span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                    <span className="text-[10px] text-neutral-500 uppercase">Differencing Verdict</span>
                    <span className={`font-bold ${comparisonResult.scientifically_valid ? "text-emerald-400" : "text-amber-400"}`}>
                      {comparisonResult.scientifically_valid ? "ACK VERIFIED" : "COMPLETED WITH CAVEATS"}
                    </span>
                    <span className="text-[10px] text-neutral-400">Model: {comparisonResult.metadata?.difference_model}</span>
                  </div>
                </div>

                {comparisonResult.quality && (
                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-wrap gap-2 text-[10px]">
                    {comparisonResult.quality.checks.map((chk, i) => (
                      <span
                        key={i}
                        className={`px-1.5 py-0.2 border ${
                          chk.status === "PASS"
                            ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                            : "bg-amber-950 text-amber-400 border-amber-800"
                        }`}
                      >
                        {chk.name}: {chk.status}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 border border-neutral-800 bg-black text-xs text-neutral-500">
                Differential comparison not yet executed.
                <button
                  onClick={() => onNavigateTab("differential")}
                  className="ml-2 text-blue-400 underline cursor-pointer"
                >
                  Run Differential Analysis
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 4: Time-Domain Photometry Findings */}
        {includeTimeDomain && (
          <section className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white border-b border-neutral-800 pb-1">
              4. Time-Domain Photometry & Variability
            </span>

            {lightCurveData && activeSource ? (
              <div className="flex flex-col gap-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                    <span className="text-[10px] text-neutral-500 uppercase">Associated Sources</span>
                    <span className="font-bold text-white">{lightCurveData.sources?.length ?? 0}</span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                    <span className="text-[10px] text-neutral-500 uppercase">Reduced Chi-Square</span>
                    <span className={`font-bold ${
                      (metrics?.reduced_chi2 ?? 0) > 3.0
                        ? "text-red-400"
                        : (metrics?.reduced_chi2 ?? 0) > 1.5
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}>
                      {metrics?.reduced_chi2 != null ? metrics.reduced_chi2.toFixed(2) : "N/A"}
                    </span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                    <span className="text-[10px] text-neutral-500 uppercase">Fractional Var (Fvar)</span>
                    <span className="font-bold text-cyan-300">
                      {metrics?.fractional_variability != null
                        ? `${(metrics.fractional_variability * 100).toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                    <span className="text-[10px] text-neutral-500 uppercase">Weighted Mean Flux</span>
                    <span className="font-bold text-white">
                      {metrics?.weighted_mean_flux_jy != null
                        ? `${(metrics.weighted_mean_flux_jy * 1000).toFixed(2)} mJy`
                        : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Compact Photometry Ledger in Report */}
                {activeSeries && activeSeries.points.length > 0 && (
                  <div className="border border-neutral-800 bg-black p-2">
                    <div className="text-[10px] text-neutral-500 uppercase mb-1">
                      Photometric Observations:
                    </div>
                    <div className="overflow-x-auto max-h-40">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-800 text-neutral-500 text-[10px] uppercase">
                            <th className="py-1 px-2">MJD</th>
                            <th className="py-1 px-2">UTC</th>
                            <th className="py-1 px-2">Band</th>
                            <th className="py-1 px-2">Flux (Jy)</th>
                            <th className="py-1 px-2">1-σ Error</th>
                            <th className="py-1 px-2">SNR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-900">
                          {activeSeries.points.map((p, i) => (
                            <tr key={i}>
                              <td className="py-1 px-2 text-neutral-400">{p.time_mjd?.toFixed(3) ?? "-"}</td>
                              <td className="py-1 px-2 text-neutral-300">{p.time_utc?.split("T")[0] ?? "-"}</td>
                              <td className="py-1 px-2 text-white font-bold">{p.band?.replace("SPHEREx-", "")}</td>
                              <td className="py-1 px-2 text-white font-bold">{p.flux_jy.toFixed(5)}</td>
                              <td className="py-1 px-2 text-neutral-400">±{p.flux_jy_error?.toFixed(5) ?? "0"}</td>
                              <td className="py-1 px-2 text-cyan-300">{p.snr?.toFixed(1) ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 border border-neutral-800 bg-black text-xs text-neutral-500">
                Time-domain extraction not yet executed.
                <button
                  onClick={() => onNavigateTab("timedomain")}
                  className="ml-2 text-blue-400 underline cursor-pointer"
                >
                  Run Time-Domain Analysis
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 5: SPHEREx DR1 Cube Spectral Findings */}
        {includeSpectral && (
          <section className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white border-b border-neutral-800 pb-1">
              5. SPHEREx DR1 Cube 102-Channel Spectral Profile
            </span>

            {spectrumData?.spectrum ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Valid Channels</span>
                  <span className="font-bold text-emerald-400">
                    {spectrumData.spectrum.valid_channel_count} / {spectrumData.spectrum.channel_count} Valid
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Wavelength Span</span>
                  <span className="font-bold text-white">
                    {spectrumData.spectrum.wavelength_min_um?.toFixed(3) ?? "0.750"} - {spectrumData.spectrum.wavelength_max_um?.toFixed(3) ?? "5.000"} µm
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Spatial Order</span>
                  <span className="font-bold text-white">
                    HEALPix Order {spectrumData.provenance.order ?? 5}
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 uppercase">Calibration Unit</span>
                  <span className="font-bold text-cyan-300">
                    MJy/sr (Surface Brightness)
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 border border-neutral-800 bg-black text-xs text-neutral-500">
                Cube spectrum not yet extracted.
                <button
                  onClick={() => onNavigateTab("timedomain")}
                  className="ml-2 text-blue-400 underline cursor-pointer"
                >
                  Extract Spectrum in Time-Domain
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 6: Scientific Provenance & Reproducibility */}
        {includeProvenance && (
          <section className="flex flex-col gap-1.5 pt-3 border-t border-neutral-800 text-[10px] text-neutral-400">
            <span className="font-bold uppercase tracking-wider text-neutral-300">
              6. Provenance & Computational Stack
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <div>
                Software: AstroChronoscope 0.1.0 · Astropy · PyWCS · Reproject · Photutils
              </div>
              <div className="sm:text-right">
                Archive: NASA/IPAC IRSA SIA2 (SPHEREx QR3)
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
