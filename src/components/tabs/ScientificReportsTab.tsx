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
  type SourceGaiaAssociationResponse,
  type GaiaConeSearchResponse,
} from "@/lib/api";
import { getBenchmarkTargetById } from "@/data/benchmarkTargets";

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
  sourceGaiaAssociation?: SourceGaiaAssociationResponse | null;
  gaiaConeSearchResult?: GaiaConeSearchResponse | null;
  selectedBenchmarkId?: string | null;
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
  sourceGaiaAssociation,
  gaiaConeSearchResult,
  selectedBenchmarkId,
  onNavigateTab,
}: ScientificReportsTabProps) {
  // Section toggle state
  const [includeDiscovery, setIncludeDiscovery] = useState(true);
  const [includeInspection, setIncludeInspection] = useState(true);
  const [includeDifferential, setIncludeDifferential] = useState(true);
  const [includeTimeDomain, setIncludeTimeDomain] = useState(true);
  const [includeSpectral, setIncludeSpectral] = useState(true);
  const [includeGaia, setIncludeGaia] = useState(true);
  const [includeProvenance, setIncludeProvenance] = useState(true);
  const [generatedTimeUtc] = useState<string>(() => new Date().toISOString().replace("T", " ").slice(0, 19));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insp = (inspectData?.inspection || null) as any;
  const activeSource = lightCurveData?.sources?.find((s) => s.source_id === selectedSourceId) || lightCurveData?.sources?.[0];
  const activeSeries = activeSource?.series?.[0];
  const metrics = activeSeries?.metrics;
  const benchmarkTarget = selectedBenchmarkId ? getBenchmarkTargetById(selectedBenchmarkId) : null;

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
      benchmark_target: benchmarkTarget ? {
        id: benchmarkTarget.id,
        name: benchmarkTarget.name,
        classification: benchmarkTarget.classification,
        aliases: benchmarkTarget.aliases,
        coordinates_icrs: benchmarkTarget.coordinates,
        proper_motion: benchmarkTarget.properMotion,
        references: benchmarkTarget.references,
      } : null,
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
      gaia_dr3: {
        source_association: sourceGaiaAssociation ? {
          source_id: sourceGaiaAssociation.planetx_source_id,
          status: sourceGaiaAssociation.status,
          candidates_count: sourceGaiaAssociation.candidates?.length ?? 0,
          best_match: sourceGaiaAssociation.best,
          observation_epoch: sourceGaiaAssociation.observation_epoch,
          propagation: sourceGaiaAssociation.propagation,
          significance: sourceGaiaAssociation.significance,
        } : null,
        cone_search: gaiaConeSearchResult ? {
          total_sources: gaiaConeSearchResult.query?.total_found ?? gaiaConeSearchResult.sources?.length ?? 0,
          center_ra_deg: gaiaConeSearchResult.query?.ra,
          center_dec_deg: gaiaConeSearchResult.query?.dec,
          radius_arcsec: gaiaConeSearchResult.query?.radius_arcsec,
          catalog: gaiaConeSearchResult.catalog,
          sources: gaiaConeSearchResult.sources,
        } : null,
      },
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
              checked={includeGaia}
              onChange={(e) => setIncludeGaia(e.target.checked)}
              className="accent-neutral-400"
            />
            <span className={includeGaia ? "text-white font-bold" : "text-neutral-500"}>Gaia DR3</span>
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
            {benchmarkTarget && (
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-blue-950/40 border border-blue-500/40 text-blue-300 font-bold text-xs uppercase">
                  NASA Benchmark: {benchmarkTarget.name}
                </span>
                <span className="text-neutral-400 text-xs">
                  [{benchmarkTarget.classification}]
                </span>
              </div>
            )}
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
                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Unique Epochs</span>
                  <span className="text-sm font-bold text-white">{timelineData.unique_epochs}</span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Total Products</span>
                  <span className="text-sm font-bold text-white">{timelineData.total_products}</span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Temporal Baseline</span>
                  <span className="text-sm font-bold text-amber-300">
                    {timelineData.temporal_baseline_days != null
                      ? `${timelineData.temporal_baseline_days.toFixed(1)} days`
                      : "Single epoch"}
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Available Bands</span>
                  <span className="text-sm font-bold text-emerald-400 truncate" title={timelineData.available_bands.join(", ")}>
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
                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Observation</span>
                  <span className="font-bold text-white truncate block w-full" title={selectedProduct.observation_id || undefined}>
                    {selectedProduct.observation_id}
                  </span>
                  <span className="text-[10px] text-neutral-400">Band: {selectedProduct.band}</span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">WCS Solution</span>
                  <span className="font-bold text-emerald-400 truncate block w-full" title={`${insp.wcs?.projection || "TAN-SIP"} (${insp.wcs?.pixel_scale_arcsec?.toFixed(2) ?? "6.2"} arcsec/px)`}>
                    {insp.wcs?.projection || "TAN-SIP"} ({insp.wcs?.pixel_scale_arcsec?.toFixed(2) ?? "6.2"} arcsec/px)
                  </span>
                  <span className="text-[10px] text-neutral-400 truncate block w-full">
                    Target inside: {insp.wcs?.target_inside_image ? "VERIFIED" : "OUTSIDE"}
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Flux Statistics</span>
                  <span className="font-bold text-white truncate block w-full">
                    Mean: {insp.stats?.mean?.toFixed(4) ?? "N/A"} {cutoutData?.cutout.unit || "MJy/sr"}
                  </span>
                  <span className="text-[10px] text-neutral-400 truncate block w-full">
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
                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Epoch A (Ref)</span>
                    <span className="font-bold text-white truncate block w-full" title={epochA?.observation_id || "OBS_A"}>
                      {epochA?.observation_id || "OBS_A"}
                    </span>
                    <span className="text-[10px] text-neutral-400">Date: {epochA?.observation_time?.split("T")[0]}</span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Epoch B (Target)</span>
                    <span className="font-bold text-white truncate block w-full" title={epochB?.observation_id || "OBS_B"}>
                      {epochB?.observation_id || "OBS_B"}
                    </span>
                    <span className="text-[10px] text-neutral-400">Date: {epochB?.observation_time?.split("T")[0]}</span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Differencing Verdict</span>
                    <span className={`font-bold truncate block w-full ${comparisonResult.scientifically_valid ? "text-emerald-400" : "text-amber-400"}`}>
                      {comparisonResult.scientifically_valid ? "ACK VERIFIED" : "COMPLETED WITH CAVEATS"}
                    </span>
                    <span className="text-[10px] text-neutral-400 truncate block w-full">Model: {comparisonResult.metadata?.difference_model}</span>
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
                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Associated Sources</span>
                    <span className="font-bold text-white">{lightCurveData.sources?.length ?? 0}</span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
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

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Fractional Var (Fvar)</span>
                    <span className="font-bold text-cyan-300">
                      {metrics?.fractional_variability != null
                        ? `${(metrics.fractional_variability * 100).toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
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
                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Valid Channels</span>
                  <span className="font-bold text-emerald-400">
                    {spectrumData.spectrum.valid_channel_count} / {spectrumData.spectrum.channel_count} Valid
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Wavelength Span</span>
                  <span className="font-bold text-white truncate" title={`${spectrumData.spectrum.wavelength_min_um?.toFixed(3) ?? "0.750"} - ${spectrumData.spectrum.wavelength_max_um?.toFixed(3) ?? "5.000"} µm`}>
                    {spectrumData.spectrum.wavelength_min_um?.toFixed(3) ?? "0.750"} - {spectrumData.spectrum.wavelength_max_um?.toFixed(3) ?? "5.000"} µm
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-neutral-500 uppercase">Spatial Order</span>
                  <span className="font-bold text-white">
                    HEALPix Order {spectrumData.provenance.order ?? 5}
                  </span>
                </div>

                <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
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

        {/* Section 6: Gaia DR3 Optical Counterpart & Astrometry */}
        {includeGaia && (
          <section className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white border-b border-neutral-800 pb-1">
              6. Gaia DR3 Optical Counterpart & Astrometric Association
            </span>

            {sourceGaiaAssociation ? (
              <div className="flex flex-col gap-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Match Status</span>
                    <span className={`font-bold ${
                      sourceGaiaAssociation.status === "MATCHED"
                        ? "text-emerald-400"
                        : sourceGaiaAssociation.status === "AMBIGUOUS"
                          ? "text-amber-400"
                          : "text-neutral-400"
                    }`}>
                      {sourceGaiaAssociation.status}
                    </span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Best Gaia DR3 ID</span>
                    <span className="font-bold text-white truncate block w-full" title={sourceGaiaAssociation.best?.gaia_source_id ? String(sourceGaiaAssociation.best.gaia_source_id) : "None"}>
                      {sourceGaiaAssociation.best?.gaia_source_id ? String(sourceGaiaAssociation.best.gaia_source_id) : "-"}
                    </span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Angular Separation</span>
                    <span className="font-bold text-white truncate block w-full">
                      {sourceGaiaAssociation.best?.separation_arcsec != null
                        ? `${sourceGaiaAssociation.best.separation_arcsec.toFixed(3)}″`
                        : "-"}
                    </span>
                  </div>

                  <div className="p-2.5 border border-neutral-800 bg-black flex flex-col gap-0.5 min-w-0 overflow-hidden">
                    <span className="text-[10px] text-neutral-500 uppercase">Rayleigh p-value</span>
                    <span className="font-bold text-cyan-300 truncate block w-full">
                      {sourceGaiaAssociation.significance?.match_p_value != null
                        ? sourceGaiaAssociation.significance.match_p_value.toExponential(3)
                        : "-"}
                    </span>
                  </div>
                </div>

                {sourceGaiaAssociation.best && (
                  <div className="border border-neutral-800 bg-black p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4 text-neutral-400">
                      <span>
                        G Mag: <strong className="text-white">{sourceGaiaAssociation.best.source?.photometry?.g != null ? sourceGaiaAssociation.best.source.photometry.g.toFixed(2) : "-"}</strong>
                      </span>
                      <span>
                        BP: <strong className="text-white">{sourceGaiaAssociation.best.source?.photometry?.bp != null ? sourceGaiaAssociation.best.source.photometry.bp.toFixed(2) : "-"}</strong>
                      </span>
                      <span>
                        RP: <strong className="text-white">{sourceGaiaAssociation.best.source?.photometry?.rp != null ? sourceGaiaAssociation.best.source.photometry.rp.toFixed(2) : "-"}</strong>
                      </span>
                      <span>
                        PM: <strong className="text-white">
                          {sourceGaiaAssociation.best.source?.astrometry?.pmra_mas_yr != null && sourceGaiaAssociation.best.source?.astrometry?.pmdec_mas_yr != null
                            ? `${sourceGaiaAssociation.best.source.astrometry.pmra_mas_yr.toFixed(1)}, ${sourceGaiaAssociation.best.source.astrometry.pmdec_mas_yr.toFixed(1)} mas/yr`
                            : "N/A"}
                        </strong>
                      </span>
                      <span>
                        Parallax: <strong className="text-white">{sourceGaiaAssociation.best.source?.astrometry?.parallax_mas != null ? `${sourceGaiaAssociation.best.source.astrometry.parallax_mas.toFixed(2)} mas` : "N/A"}</strong>
                      </span>
                    </div>

                    <div className="text-[10px] text-neutral-500">
                      Epoch Propagation: {sourceGaiaAssociation.propagation?.propagated ? `J2016.0 → ${sourceGaiaAssociation.observation_epoch?.julian_year ? sourceGaiaAssociation.observation_epoch.julian_year.toFixed(2) : "Obs Epoch"}` : "None"}
                    </div>
                  </div>
                )}
              </div>
            ) : gaiaConeSearchResult ? (
              <div className="p-2.5 border border-neutral-800 bg-black text-xs flex items-center justify-between">
                <span className="text-neutral-400">
                  Target field cone search identified <strong className="text-white">{gaiaConeSearchResult.query?.total_found ?? gaiaConeSearchResult.sources?.length ?? 0}</strong> Gaia DR3 sources within {gaiaConeSearchResult.query?.radius_arcsec ?? 10}″.
                </span>
                <button
                  onClick={() => onNavigateTab("timedomain")}
                  className="text-blue-400 hover:text-blue-300 underline cursor-pointer text-xs"
                >
                  View in Time-Domain
                </button>
              </div>
            ) : (
              <div className="p-3 border border-neutral-800 bg-black text-xs text-neutral-500">
                Gaia DR3 counterpart cross-match not yet queried for the active source.
                <button
                  onClick={() => onNavigateTab("timedomain")}
                  className="ml-2 text-blue-400 underline cursor-pointer"
                >
                  Cross-Match with Gaia DR3
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 7: Scientific Provenance & Reproducibility */}
        {includeProvenance && (
          <section className="flex flex-col gap-1.5 pt-3 border-t border-neutral-800 text-[10px] text-neutral-400">
            <span className="font-bold uppercase tracking-wider text-neutral-300">
              7. Provenance & Computational Stack
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <div>
                Software: AstroChronoscope 0.1.0 · Astropy · PyWCS · Reproject · Photutils
              </div>
              <div className="sm:text-right">
                Archives: NASA/IPAC IRSA SIA2 (SPHEREx QR3) · ESA Gaia DR3 (I/355/gaiadr3)
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
