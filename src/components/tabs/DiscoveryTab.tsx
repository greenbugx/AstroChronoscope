import { useId } from "react";
import {
  type TimelineResponse,
  type TimelineEpoch,
  type TimelineProduct,
} from "@/lib/api";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";
import {
  BENCHMARK_TARGETS,
  getBenchmarkTargetById,
  propagateTargetCoordinates,
} from "@/data/benchmarkTargets";

export interface DiscoveryTabProps {
  ra: string;
  dec: string;
  radius: string;
  cutoutSize: string;
  collection: string;
  selectedBandFilter: string;
  startDate: string;
  endDate: string;
  timelineData: TimelineResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedProduct: TimelineProduct | null;
  comparisonProductA: TimelineProduct | null;
  comparisonProductB: TimelineProduct | null;
  selectedBenchmarkId: string | null;
  isCustomizedCoords: boolean;
  usePropagatedEpoch: boolean;
  onSelectBenchmark: (targetId: string) => void;
  onClearBenchmark: () => void;
  onTogglePropagateEpoch: () => void;
  onUpdateCoords: (ra: string, dec: string, radius: string, cutoutSize: string) => void;
  onUpdateFilters: (collection: string, bandFilter: string, startDate: string, endDate: string) => void;
  onSearch: () => void;
  onLoadBenchmark: () => void;
  onSelectProduct: (product: TimelineProduct) => void;
  onSetComparisonProductA: (product: TimelineProduct) => void;
  onSetComparisonProductB: (product: TimelineProduct) => void;
  onNavigateTab: (tab: "discovery" | "explorer" | "differential" | "timedomain" | "reports") => void;
}

const SPHEREX_BANDS = ["ALL", "SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3", "SPHEREx-D4", "SPHEREx-D5", "SPHEREx-D6"];

export default function DiscoveryTab({
  ra,
  dec,
  radius,
  cutoutSize,
  collection,
  selectedBandFilter,
  startDate,
  endDate,
  timelineData,
  isLoading,
  error,
  selectedProduct,
  comparisonProductA,
  comparisonProductB,
  selectedBenchmarkId,
  isCustomizedCoords,
  usePropagatedEpoch,
  onSelectBenchmark,
  onClearBenchmark,
  onTogglePropagateEpoch,
  onUpdateCoords,
  onUpdateFilters,
  onSearch,
  onLoadBenchmark,
  onSelectProduct,
  onSetComparisonProductA,
  onSetComparisonProductB,
  onNavigateTab,
}: DiscoveryTabProps) {
  const presetId = useId();
  const raId = useId();
  const decId = useId();
  const radiusId = useId();
  const cutoutId = useId();
  const startId = useId();
  const endId = useId();

  const selectedBenchmark = selectedBenchmarkId ? getBenchmarkTargetById(selectedBenchmarkId) : null;

  const filteredEpochs = timelineData?.epochs.filter((epoch) => {
    if (selectedBandFilter === "ALL") return true;
    return epoch.bands.includes(selectedBandFilter);
  }) ?? [];

  // Flattened products for clean telemetry table view
  const allFilteredProducts: Array<{ product: TimelineProduct; epoch: TimelineEpoch }> = [];
  filteredEpochs.forEach((epoch) => {
    epoch.products.forEach((prod) => {
      if (selectedBandFilter === "ALL" || prod.band === selectedBandFilter) {
        allFilteredProducts.push({ product: prod, epoch });
      }
    });
  });

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* Target Parameters Panel */}
      <section className="border border-neutral-800 bg-[#0d0d0d]">
        <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800 flex items-center justify-between">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Target Coordinates & Search Parameters
          </span>
          <button
            onClick={onLoadBenchmark}
            className="px-2.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 text-[11px] uppercase cursor-pointer"
            title="Quick shortcut: load Barnard's Star preset"
          >
            Load Benchmark Target
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          {/* NASA Benchmark Targets Selector Row */}
          <div className="p-2.5 bg-[#121212] border border-neutral-800 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={presetId} className="text-[10px] uppercase font-bold text-neutral-300 flex items-center gap-2">
                <span>NASA Benchmark Targets</span>
                {selectedBenchmark && (
                  <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase border ${
                    isCustomizedCoords
                      ? "bg-amber-950/40 text-amber-400 border-amber-800"
                      : "bg-emerald-950/40 text-emerald-400 border-emerald-800"
                  }`}>
                    {isCustomizedCoords ? "Customized Coordinates" : "Preset Active"}
                  </span>
                )}
              </label>

              {selectedBenchmark && (
                <button
                  type="button"
                  onClick={onClearBenchmark}
                  className="text-[10px] text-neutral-400 hover:text-white underline cursor-pointer"
                >
                  Clear Preset Selection
                </button>
              )}
            </div>

            <select
              id={presetId}
              value={selectedBenchmarkId || ""}
              onChange={(e) => onSelectBenchmark(e.target.value)}
              className="bg-black border border-neutral-700 focus:border-blue-500 px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
            >
              <option value="">Select a NASA benchmark target...</option>
              {BENCHMARK_TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.classification} ({t.coordinates.ra.toFixed(4)}°, {t.coordinates.dec > 0 ? "+" : ""}{t.coordinates.dec.toFixed(4)}°)
                </option>
              ))}
            </select>

            {/* Compact Benchmark Target Information Preview */}
            {selectedBenchmark && (
              <div className="mt-1 pt-2 border-t border-neutral-800 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs uppercase">{selectedBenchmark.name}</span>
                    <span className="text-[10px] text-cyan-400 font-bold uppercase">
                      [{selectedBenchmark.classification}]
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                    <span>Frame: <strong className="text-white">{selectedBenchmark.coordinates.frame}</strong></span>
                    <span>·</span>
                    <span>Catalog Epoch: <strong className="text-white">{selectedBenchmark.coordinates.epoch}</strong></span>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-300 leading-snug">
                  {selectedBenchmark.description}
                </p>

                {/* Property Ledger */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  <div className="p-1.5 bg-black border border-neutral-800 flex flex-col min-w-0 overflow-hidden">
                    <span className="text-[9px] uppercase text-neutral-500">Catalog Coords</span>
                    <span className="font-bold text-white font-mono truncate" title={`${selectedBenchmark.coordinates.ra.toFixed(6)}°, ${selectedBenchmark.coordinates.dec > 0 ? "+" : ""}${selectedBenchmark.coordinates.dec.toFixed(6)}°`}>
                      {selectedBenchmark.coordinates.ra.toFixed(6)}°, {selectedBenchmark.coordinates.dec > 0 ? "+" : ""}{selectedBenchmark.coordinates.dec.toFixed(6)}°
                    </span>
                  </div>

                  <div className="p-1.5 bg-black border border-neutral-800 flex flex-col min-w-0 overflow-hidden">
                    <span className="text-[9px] uppercase text-neutral-500">Default Cone Radius</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {selectedBenchmark.search.defaultRadius}° ({selectedBenchmark.search.defaultRadius * 3600}″)
                    </span>
                  </div>

                  <div className="p-1.5 bg-black border border-neutral-800 flex flex-col min-w-0 overflow-hidden">
                    <span className="text-[9px] uppercase text-neutral-500">Proper Motion (μα*, μδ)</span>
                    <span className="font-bold text-sky-400 font-mono truncate" title={selectedBenchmark.properMotion ? `${selectedBenchmark.properMotion.pmRa.toFixed(1)}, ${selectedBenchmark.properMotion.pmDec.toFixed(1)} mas/yr` : "N/A"}>
                      {selectedBenchmark.properMotion
                        ? `${selectedBenchmark.properMotion.pmRa.toFixed(1)}, ${selectedBenchmark.properMotion.pmDec.toFixed(1)} mas/yr`
                        : "N/A"}
                    </span>
                  </div>

                  <div className="p-1.5 bg-black border border-neutral-800 flex flex-col min-w-0 overflow-hidden">
                    <span className="text-[9px] uppercase text-neutral-500">Catalog Reference</span>
                    <a
                      href={selectedBenchmark.references.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-blue-400 hover:underline font-mono truncate block"
                      title={selectedBenchmark.references.identifier || selectedBenchmark.references.catalog}
                    >
                      {selectedBenchmark.references.identifier || selectedBenchmark.references.catalog}
                    </a>
                  </div>
                </div>

                {/* Proper Motion Propagation Toggle for High Proper Motion Objects */}
                {selectedBenchmark.properMotion && Math.hypot(selectedBenchmark.properMotion.pmRa, selectedBenchmark.properMotion.pmDec) > 50 && (
                  <div className="p-2 bg-black border border-amber-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-amber-400 uppercase font-bold">Space Motion:</span>
                      <span className="text-[11px] text-neutral-300">
                        {usePropagatedEpoch
                          ? `Propagated to Mission Epoch J2026.5 (${propagateTargetCoordinates(selectedBenchmark, 2026.5).deltaArcsec}″ shift applied)`
                          : `Catalog reference position at ${selectedBenchmark.coordinates.epoch}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onTogglePropagateEpoch}
                      className={`px-2.5 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${
                        usePropagatedEpoch
                          ? "bg-amber-600 text-white border-amber-500"
                          : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:text-white"
                      }`}
                    >
                      {usePropagatedEpoch ? "Revert to J2000.0 Reference" : "Propagate to Epoch J2026.5"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="flex flex-col gap-1">
              <label htmlFor={raId} className="text-[10px] uppercase text-neutral-400">
                RA (deg)
              </label>
              <input
                id={raId}
                type="text"
                value={ra}
                onChange={(e) => onUpdateCoords(e.target.value, dec, radius, cutoutSize)}
                className="bg-black border border-neutral-700 focus:border-blue-500 px-2 py-1 text-xs text-white outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={decId} className="text-[10px] uppercase text-neutral-400">
                Dec (deg)
              </label>
              <input
                id={decId}
                type="text"
                value={dec}
                onChange={(e) => onUpdateCoords(ra, e.target.value, radius, cutoutSize)}
                className="bg-black border border-neutral-700 focus:border-blue-500 px-2 py-1 text-xs text-white outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={radiusId} className="text-[10px] uppercase text-neutral-400">
                Radius (deg)
              </label>
              <input
                id={radiusId}
                type="text"
                value={radius}
                onChange={(e) => onUpdateCoords(ra, dec, e.target.value, cutoutSize)}
                className="bg-black border border-neutral-700 focus:border-blue-500 px-2 py-1 text-xs text-white outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={cutoutId} className="text-[10px] uppercase text-neutral-400">
                Cutout (deg)
              </label>
              <input
                id={cutoutId}
                type="text"
                value={cutoutSize}
                onChange={(e) => onUpdateCoords(ra, dec, radius, e.target.value)}
                className="bg-black border border-neutral-700 focus:border-blue-500 px-2 py-1 text-xs text-white outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={startId} className="text-[10px] uppercase text-neutral-400">
                Start Date
              </label>
              <input
                id={startId}
                type="text"
                value={startDate}
                placeholder="YYYY-MM-DD"
                onChange={(e) => onUpdateFilters(collection, selectedBandFilter, e.target.value, endDate)}
                className="bg-black border border-neutral-700 focus:border-blue-500 px-2 py-1 text-xs text-white outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={endId} className="text-[10px] uppercase text-neutral-400">
                End Date
              </label>
              <input
                id={endId}
                type="text"
                value={endDate}
                placeholder="YYYY-MM-DD"
                onChange={(e) => onUpdateFilters(collection, selectedBandFilter, startDate, e.target.value)}
                className="bg-black border border-neutral-700 focus:border-blue-500 px-2 py-1 text-xs text-white outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800">
            {/* Band Filters */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-neutral-500 mr-1">Band:</span>
              {SPHEREX_BANDS.map((b) => (
                <button
                  key={b}
                  onClick={() => onUpdateFilters(collection, b, startDate, endDate)}
                  className={`px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors cursor-pointer ${
                    selectedBandFilter === b
                      ? "bg-amber-600 text-white border-amber-500"
                      : "bg-neutral-900 text-neutral-400 hover:text-white border-neutral-800"
                  }`}
                >
                  {b.replace("SPHEREx-", "")}
                </button>
              ))}
            </div>

            <button
              onClick={onSearch}
              disabled={isLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-bold text-xs uppercase cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <TwinOrbit className="size-3.5 text-white" />
                  <span>SEARCHING...</span>
                </>
              ) : (
                <span>DISCOVER OBSERVATIONS</span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Query Error */}
      {error && (
        <div className="border border-red-600 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>ERROR: {error}</span>
          <button
            onClick={onSearch}
            className="px-2 py-0.5 bg-red-600 text-white font-bold uppercase text-[10px] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Telemetry Panel */}
      {timelineData && (
        <section className="border border-neutral-800 bg-[#0d0d0d] flex flex-col">
          {/* Summary Header */}
          <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-white uppercase tracking-wider">
              Discovered Archive Inventory ({allFilteredProducts.length} Products in {filteredEpochs.length} Epochs)
            </span>
            <div className="flex items-center gap-3 text-[11px] text-neutral-400">
              <span>Collection: <strong className="text-white">{timelineData.query.collection}</strong></span>
              <span>Baseline: <strong className="text-amber-300">{timelineData.temporal_baseline_days?.toFixed(1) ?? "0"} d</strong></span>
              <span>Bands: <strong className="text-emerald-400">{timelineData.available_bands.join(", ")}</strong></span>
            </div>
          </div>

          {/* Observations Table (matching ground station telemetry list in reference image) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#181818] border-b border-neutral-800 text-[10px] text-neutral-400 uppercase">
                  <th className="py-1.5 px-3">#</th>
                  <th className="py-1.5 px-3">Date (UTC)</th>
                  <th className="py-1.5 px-3">MJD</th>
                  <th className="py-1.5 px-3">Observation ID</th>
                  <th className="py-1.5 px-3">Band</th>
                  <th className="py-1.5 px-3">Coverage</th>
                  <th className="py-1.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900 font-mono text-[11px]">
                {allFilteredProducts.map(({ product: p, epoch }, idx) => {
                  const isActive = selectedProduct?.observation_id === p.observation_id;
                  const isSetA = comparisonProductA?.observation_id === p.observation_id;
                  const isSetB = comparisonProductB?.observation_id === p.observation_id;

                  // Highlighting selected row (matching amber highlight like 014C MPS MANOEUVER in reference image)
                  const isHighlighted = isActive || isSetA || isSetB;

                  return (
                    <tr
                      key={p.observation_id || idx}
                      className={`transition-colors ${
                        isHighlighted
                          ? "bg-amber-900/35 text-amber-200 border-l-2 border-amber-500 font-semibold"
                          : "hover:bg-neutral-900/60 text-neutral-300"
                      }`}
                    >
                      <td className="py-1.5 px-3 text-neutral-500">
                        {(idx + 1).toString().padStart(2, "0")}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {epoch.observation_time?.replace("T", " ").slice(0, 19) || "N/A"}
                      </td>
                      <td className="py-1.5 px-3 text-neutral-400">
                        {epoch.midpoint_mjd ? epoch.midpoint_mjd.toFixed(4) : "N/A"}
                      </td>
                      <td className="py-1.5 px-3 font-bold text-white whitespace-nowrap">
                        {p.observation_id}
                      </td>
                      <td className="py-1.5 px-3">
                        <span className="font-bold text-sky-400">
                          {p.band?.replace("SPHEREx-", "") || "N/A"}
                        </span>
                      </td>
                      <td className="py-1.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${
                            epoch.target_covered === true
                              ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/40"
                              : epoch.target_covered === false
                                ? "bg-red-600/20 text-red-300 border-red-500/40"
                                : "bg-neutral-800 text-neutral-400 border-neutral-700"
                          }`}
                        >
                          {epoch.target_covered === true ? "COVERED" : epoch.target_covered === false ? "OUTSIDE" : "UNVERIFIED"}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              onSelectProduct(p);
                              onNavigateTab("explorer");
                            }}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase cursor-pointer"
                          >
                            SELECT
                          </button>
                          <button
                            onClick={() => onSetComparisonProductA(p)}
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${
                              isSetA
                                ? "bg-amber-600 text-white border-amber-500"
                                : "bg-neutral-900 text-neutral-300 hover:text-white border-neutral-700"
                            }`}
                          >
                            {isSetA ? "REF A ✓" : "REF A"}
                          </button>
                          <button
                            onClick={() => onSetComparisonProductB(p)}
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${
                              isSetB
                                ? "bg-cyan-600 text-white border-cyan-500"
                                : "bg-neutral-900 text-neutral-300 hover:text-white border-neutral-700"
                            }`}
                          >
                            {isSetB ? "TGT B ✓" : "TGT B"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Standby State */}
      {!timelineData && !isLoading && !error && (
        <div className="border border-neutral-800 bg-[#0d0d0d] p-8 text-center flex flex-col items-center justify-center gap-2">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Observation Discovery Standby
          </span>
          <span className="text-[11px] text-neutral-400 max-w-sm">
            Enter target coordinates above or click Load Benchmark Target, then click DISCOVER OBSERVATIONS to query NASA/IPAC IRSA SIA2.
          </span>
        </div>
      )}
    </div>
  );
}
