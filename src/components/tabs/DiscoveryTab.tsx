import { useId } from "react";
import {
  type TimelineResponse,
  type TimelineEpoch,
  type TimelineProduct,
} from "@/lib/api";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

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
  onUpdateCoords: (ra: string, dec: string, radius: string, cutoutSize: string) => void;
  onUpdateFilters: (collection: string, bandFilter: string, startDate: string, endDate: string) => void;
  onSearch: () => void;
  onLoadBenchmark: () => void;
  onSelectProduct: (product: TimelineProduct) => void;
  onSetComparisonProductA: (product: TimelineProduct) => void;
  onSetComparisonProductB: (product: TimelineProduct) => void;
  onNavigateTab: (tab: "discovery" | "explorer" | "differential" | "timedomain" | "reports") => void;
}

const SPHEREX_BANDS = [
  { id: "ALL", name: "All Bands", range: "0.75 - 5.00 µm" },
  { id: "SPHEREx-D1", name: "D1", range: "0.75 - 1.11 µm", color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
  { id: "SPHEREx-D2", name: "D2", range: "1.11 - 1.64 µm", color: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10" },
  { id: "SPHEREx-D3", name: "D3", range: "1.64 - 2.42 µm", color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
  { id: "SPHEREx-D4", name: "D4", range: "2.42 - 3.82 µm", color: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
  { id: "SPHEREx-D5", name: "D5", range: "3.82 - 4.42 µm", color: "text-orange-400 border-orange-500/40 bg-orange-500/10" },
  { id: "SPHEREx-D6", name: "D6", range: "4.42 - 5.00 µm", color: "text-rose-400 border-rose-500/40 bg-rose-500/10" },
];

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
  onUpdateCoords,
  onUpdateFilters,
  onSearch,
  onLoadBenchmark,
  onSelectProduct,
  onSetComparisonProductA,
  onSetComparisonProductB,
  onNavigateTab,
}: DiscoveryTabProps) {
  const raId = useId();
  const decId = useId();
  const radiusId = useId();
  const cutoutId = useId();
  const startId = useId();
  const endId = useId();

  const filteredEpochs = timelineData?.epochs.filter((epoch) => {
    if (selectedBandFilter === "ALL") return true;
    return epoch.bands.includes(selectedBandFilter);
  }) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Workspace Header & Scope Explanation */}
      <div className="flex flex-col gap-1 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
          <h1 className="text-sm sm:text-base font-bold tracking-widest uppercase text-white font-mono">
            Observation Discovery Workspace
          </h1>
          <span className="text-[10px] text-neutral-400 uppercase font-mono">
            Stage 1 of 5 · Astronomical Target Search & SIA2 Catalog
          </span>
        </div>
        <p className="text-xs text-neutral-400 font-mono">
          Locate celestial targets in the NASA/IPAC IRSA SPHEREx archive, inspect temporal observation distribution across unique epochs, and select observations for downstream image exploration and differential analysis.
        </p>
      </div>

      {/* Target Pointing & Query Parameters Console */}
      <section className="relative rounded border border-neutral-800 bg-[#050608] p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
        <div className="pointer-events-none absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-sky-400/80" />
        <div className="pointer-events-none absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-sky-400/80" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-sky-400/80" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-sky-400/80" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[10px] text-sky-400 font-bold uppercase tracking-wider font-mono">
              SIA2.01
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-wider text-white uppercase font-mono">
                Target Coordinates & Survey Constraints
              </h2>
              <span className="text-[10px] text-neutral-400 block font-mono">
                NASA/IPAC IRSA SIMPLE IMAGE ACCESS 2 · ICRS CELESTIAL FRAME
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onLoadBenchmark}
              className="px-3 py-1.5 rounded border border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 hover:border-amber-400/60 text-[11px] font-mono tracking-wider uppercase text-neutral-300 hover:text-white transition-all cursor-pointer active:scale-95"
            >
              Benchmark: Planet X Candidate
            </button>
          </div>
        </div>

        {/* Input Coordinates Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={raId} className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
              Right Ascension (deg)
            </label>
            <input
              id={raId}
              type="text"
              value={ra}
              onChange={(e) => onUpdateCoords(e.target.value, dec, radius, cutoutSize)}
              placeholder="e.g. 156.09328"
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-sky-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={decId} className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
              Declination (deg)
            </label>
            <input
              id={decId}
              type="text"
              value={dec}
              onChange={(e) => onUpdateCoords(ra, e.target.value, radius, cutoutSize)}
              placeholder="e.g. -41.64466"
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-sky-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={radiusId} className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
              Search Radius (deg)
            </label>
            <input
              id={radiusId}
              type="text"
              value={radius}
              onChange={(e) => onUpdateCoords(ra, dec, e.target.value, cutoutSize)}
              placeholder="0.01"
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-sky-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={cutoutId} className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
              Cutout Size (deg)
            </label>
            <input
              id={cutoutId}
              type="text"
              value={cutoutSize}
              onChange={(e) => onUpdateCoords(ra, dec, radius, e.target.value)}
              placeholder="0.10"
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-sky-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={startId} className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
              Start Date (Optional)
            </label>
            <input
              id={startId}
              type="text"
              value={startDate}
              onChange={(e) => onUpdateFilters(collection, selectedBandFilter, e.target.value, endDate)}
              placeholder="YYYY-MM-DD"
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-sky-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={endId} className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
              End Date (Optional)
            </label>
            <input
              id={endId}
              type="text"
              value={endDate}
              onChange={(e) => onUpdateFilters(collection, selectedBandFilter, startDate, e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-sky-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>
        </div>

        {/* Band Filters & Execution Trigger */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-900">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase text-neutral-500 font-mono mr-1">Band Filter:</span>
            {SPHEREX_BANDS.map((b) => (
              <button
                key={b.id}
                onClick={() => onUpdateFilters(collection, b.id, startDate, endDate)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono tracking-wider uppercase transition-all cursor-pointer ${
                  selectedBandFilter === b.id
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/50"
                    : "bg-neutral-900/60 text-neutral-400 border border-neutral-800 hover:text-white"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>

          <button
            onClick={onSearch}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-800 text-white font-mono text-xs uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(2,132,199,0.3)]"
          >
            {isLoading ? (
              <>
                <TwinOrbit className="size-4 text-white" />
                <span>QUERYING ARCHIVE...</span>
              </>
            ) : (
              <span>DISCOVER OBSERVATIONS</span>
            )}
          </button>
        </div>
      </section>

      {/* Query Error Notice */}
      {error && (
        <div className="rounded border border-rose-500/60 bg-rose-950/20 p-3.5 text-xs text-rose-300 font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-rose-400 font-bold">DISCOVERY ERROR:</span>
            <span>{error}</span>
          </div>
          <button
            onClick={onSearch}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Discovery Results & Observation Timeline */}
      {timelineData && (
        <div className="flex flex-col gap-5">
          {/* Summary Audit Card */}
          <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
              <span className="text-xs font-bold tracking-wider uppercase text-white">
                Archival Survey Inventory Summary
              </span>
              <span className="text-[10px] text-neutral-400">
                Collection: {timelineData.query.collection} · Frame: {timelineData.metadata.frame}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60">
                <div className="text-[10px] text-neutral-500 uppercase">Unique Epochs</div>
                <div className="text-base font-bold text-sky-400">{timelineData.unique_epochs}</div>
              </div>

              <div className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60">
                <div className="text-[10px] text-neutral-500 uppercase">Total Products</div>
                <div className="text-base font-bold text-white">{timelineData.total_products}</div>
              </div>

              <div className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60">
                <div className="text-[10px] text-neutral-500 uppercase">Temporal Baseline</div>
                <div className="text-base font-bold text-amber-400">
                  {timelineData.temporal_baseline_days != null
                    ? `${timelineData.temporal_baseline_days.toFixed(1)} days`
                    : "0 days"}
                </div>
              </div>

              <div className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60">
                <div className="text-[10px] text-neutral-500 uppercase">Earliest Epoch</div>
                <div className="text-xs font-bold text-neutral-300">
                  {timelineData.earliest_observation_time?.split("T")[0] || "N/A"}
                </div>
              </div>

              <div className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60">
                <div className="text-[10px] text-neutral-500 uppercase">Latest Epoch</div>
                <div className="text-xs font-bold text-neutral-300">
                  {timelineData.latest_observation_time?.split("T")[0] || "N/A"}
                </div>
              </div>

              <div className="p-2.5 rounded border border-neutral-900 bg-neutral-950/60">
                <div className="text-[10px] text-neutral-500 uppercase">Available Bands</div>
                <div className="text-xs font-bold text-emerald-400">
                  {timelineData.available_bands.join(", ") || "None"}
                </div>
              </div>
            </div>

            {/* Quality & Coverage Notices */}
            {timelineData.warnings && timelineData.warnings.length > 0 && (
              <div className="mt-1 pt-2 border-t border-neutral-900 flex flex-col gap-1 text-[11px] text-amber-300/90">
                {timelineData.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="text-amber-400">Notice:</span>
                    <span>{w.message} ({w.count} instances)</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Unique Epochs & Observation Ledger */}
          <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-4 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider uppercase text-white">
                  Temporal Epoch Ledger ({filteredEpochs.length} Epochs Displayed)
                </span>
                <span className="text-[10px] text-neutral-500 uppercase">
                  Grouped by unique observation time
                </span>
              </div>
              <span className="text-[10px] text-neutral-400">
                Click an observation action to send to Explorer or Differential analysis
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {filteredEpochs.map((epoch: TimelineEpoch) => {
                const isSelectedForA = comparisonProductA && epoch.products.some((p) => p.observation_id === comparisonProductA.observation_id);
                const isSelectedForB = comparisonProductB && epoch.products.some((p) => p.observation_id === comparisonProductB.observation_id);

                return (
                  <div
                    key={epoch.epoch_key}
                    className={`rounded border p-3.5 flex flex-col gap-3 transition-colors ${
                      isSelectedForA || isSelectedForB
                        ? "border-sky-500/80 bg-sky-950/20"
                        : "border-neutral-800/90 bg-neutral-900/30 hover:border-neutral-700"
                    }`}
                  >
                    {/* Epoch Top Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-sky-400 border border-neutral-700">
                          Epoch {epoch.epoch_index + 1}
                        </span>
                        <span className="text-white font-bold">
                          {epoch.observation_time?.replace("T", " ") || epoch.epoch_key}
                        </span>
                        <span className="text-neutral-400 text-[10px]">
                          MJD: {epoch.midpoint_mjd ? epoch.midpoint_mjd.toFixed(4) : "N/A"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {epoch.bands.map((b) => (
                          <span
                            key={b}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 border border-sky-500/30 text-sky-300"
                          >
                            {b.replace("SPHEREx-", "")}
                          </span>
                        ))}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            epoch.target_covered === true
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : epoch.target_covered === false
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : "bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          {epoch.target_covered === true
                            ? "Target Covered"
                            : epoch.target_covered === false
                              ? "Target Outside"
                              : "Coverage Unverified"}
                        </span>
                      </div>
                    </div>

                    {/* Products In Epoch */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-neutral-800/60">
                      {epoch.products.map((p: TimelineProduct) => {
                        const isCurrentActive = selectedProduct?.observation_id === p.observation_id;
                        const isSetA = comparisonProductA?.observation_id === p.observation_id;
                        const isSetB = comparisonProductB?.observation_id === p.observation_id;

                        return (
                          <div
                            key={p.observation_id || p.obs_publisher_did}
                            className={`p-2.5 rounded border text-xs flex flex-wrap items-center justify-between gap-3 ${
                              isCurrentActive
                                ? "border-amber-400/60 bg-amber-500/10"
                                : "border-neutral-900 bg-black/40"
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">
                                  {p.observation_id || "OBS_PRODUCT"}
                                </span>
                                <span className="text-[10px] text-neutral-500">
                                  DID: {p.obs_publisher_did?.slice(-16) || "N/A"}
                                </span>
                              </div>
                              <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                                <span>Band: {p.band || "Unknown"}</span>
                                <span>·</span>
                                <span>Calib Level: {p.calib_level ?? 2}</span>
                                <span>·</span>
                                <span>FITS Status: {p.processing_status}</span>
                              </div>
                            </div>

                            {/* Action Buttons to connect to subsequent tabs */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  onSelectProduct(p);
                                  onNavigateTab("explorer");
                                }}
                                className="px-2.5 py-1 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-sky-400 text-[10px] text-white uppercase tracking-wider transition-all cursor-pointer"
                                title="Inspect FITS in Image Explorer"
                              >
                                Inspect in Explorer
                              </button>

                              <button
                                onClick={() => onSetComparisonProductA(p)}
                                className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                                  isSetA
                                    ? "bg-amber-400 text-black font-bold border border-amber-300"
                                    : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white hover:border-amber-400"
                                }`}
                                title="Designate as Epoch A (Reference) for Differential Analysis"
                              >
                                {isSetA ? "Epoch A Set" : "Set Epoch A"}
                              </button>

                              <button
                                onClick={() => onSetComparisonProductB(p)}
                                className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                                  isSetB
                                    ? "bg-cyan-400 text-black font-bold border border-cyan-300"
                                    : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white hover:border-cyan-400"
                                }`}
                                title="Designate as Epoch B (Target) for Differential Analysis"
                              >
                                {isSetB ? "Epoch B Set" : "Set Epoch B"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Standby State */}
      {!timelineData && !isLoading && !error && (
        <div className="rounded border border-neutral-800 bg-[#050608] p-12 text-center flex flex-col items-center justify-center gap-4 font-mono">
          <div className="h-12 w-12 rounded border border-sky-400/40 bg-sky-500/10 flex items-center justify-center text-sky-400 text-lg font-bold">
            ⌖
          </div>
          <div className="max-w-md flex flex-col gap-1">
            <h3 className="text-sm sm:text-base font-bold tracking-[0.2em] text-white uppercase">
              Target Discovery Ready
            </h3>
            <p className="text-xs text-neutral-400">
              Input celestial coordinates (RA, Dec) or click Benchmark: Planet X Candidate, then click Discover Observations to initiate SIA2 query protocol across the SPHEREx archive.
            </p>
          </div>
          <button
            onClick={onSearch}
            className="mt-2 inline-flex items-center gap-2 rounded border border-sky-400/60 bg-sky-500/15 hover:bg-sky-500/25 px-5 py-2 text-xs font-bold uppercase tracking-wider text-sky-200 transition-all cursor-pointer active:scale-95"
          >
            <span>START DISCOVERY QUERY</span>
            <span className="text-sky-400">▶</span>
          </button>
        </div>
      )}
    </div>
  );
}

