import { useState } from "react";
import {
  type TimelineProduct,
  type CutoutResponse,
  type InspectResponse,
  getFileUrl,
} from "@/lib/api";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

export interface ImageExplorerTabProps {
  ra: string;
  dec: string;
  cutoutSize: string;
  selectedProduct: TimelineProduct | null;
  availableProducts: TimelineProduct[];
  cutoutData: CutoutResponse | null;
  inspectData: InspectResponse | null;
  isLoadingCutout: boolean;
  isLoadingInspect: boolean;
  cutoutError: string | null;
  inspectError: string | null;
  onSelectProduct: (product: TimelineProduct) => void;
  onFetchCutout: (product: TimelineProduct) => void;
  onInspectFITS: (product: TimelineProduct) => void;
  onNavigateTab: (tab: "discovery" | "explorer" | "differential" | "timedomain" | "reports") => void;
}

export default function ImageExplorerTab({
  selectedProduct,
  availableProducts,
  cutoutData,
  inspectData,
  isLoadingCutout,
  isLoadingInspect,
  cutoutError,
  inspectError,
  onSelectProduct,
  onFetchCutout,
  onInspectFITS,
  onNavigateTab,
}: ImageExplorerTabProps) {
  const [stretchMode, setStretchMode] = useState<"linear" | "log" | "asinh" | "sqrt">("asinh");

  // Type safe cast of inspection response payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insp = (inspectData?.inspection || null) as any;

  return (
    <div className="flex flex-col gap-6">
      {/* Workspace Header */}
      <div className="flex flex-col gap-1 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          <h1 className="text-sm sm:text-base font-bold tracking-widest uppercase text-white font-mono">
            FITS Image Explorer Workspace
          </h1>
          <span className="text-[10px] text-neutral-400 uppercase font-mono">
            Stage 2 of 5 · Single-Observation Inspection & Astrometry
          </span>
        </div>
        <p className="text-xs text-neutral-400 font-mono">
          Detailed scientific inspection of individual SPHEREx FITS observations: spatial cutouts, multi-extension HDUs (IMAGE, FLAGS, VARIANCE, EPSF), pixel flux statistics, and celestial WCS coordinates.
        </p>
      </div>

      {/* Observation Selector Bar */}
      <div className="rounded border border-neutral-800 bg-[#050608] p-3.5 flex flex-wrap items-center justify-between gap-3 font-mono">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-neutral-500 uppercase">Active Observation:</span>
          {selectedProduct ? (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                {selectedProduct.observation_id}
              </span>
              <span className="text-[10px] text-neutral-400">
                Band: {selectedProduct.band || "Unknown"} · Calib: {selectedProduct.calib_level ?? 2}
              </span>
            </div>
          ) : (
            <span className="text-xs text-amber-400 font-bold">No Observation Selected</span>
          )}
        </div>

        {/* Product Switcher if multiple products exist */}
        {availableProducts.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-xl">
            <span className="text-[10px] text-neutral-500 uppercase mr-1">Switch:</span>
            {availableProducts.map((p) => (
              <button
                key={p.observation_id}
                onClick={() => {
                  onSelectProduct(p);
                  onFetchCutout(p);
                  onInspectFITS(p);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase whitespace-nowrap transition-all cursor-pointer ${
                  selectedProduct?.observation_id === p.observation_id
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50"
                    : "bg-neutral-900/60 text-neutral-400 border border-neutral-800 hover:text-white"
                }`}
              >
                {p.band?.replace("SPHEREx-", "") || "Product"} · {p.observation_id?.slice(-8)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Notices */}
      {cutoutError && (
        <div className="rounded border border-rose-500/60 bg-rose-950/20 p-3.5 text-xs text-rose-300 font-mono flex items-center justify-between">
          <span className="text-rose-400 font-bold">CUTOUT ERROR: {cutoutError}</span>
          {selectedProduct && (
            <button
              onClick={() => onFetchCutout(selectedProduct)}
              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {inspectError && (
        <div className="rounded border border-rose-500/60 bg-rose-950/20 p-3.5 text-xs text-rose-300 font-mono flex items-center justify-between">
          <span className="text-rose-400 font-bold">INSPECTION ERROR: {inspectError}</span>
          {selectedProduct && (
            <button
              onClick={() => onInspectFITS(selectedProduct)}
              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Main Workspace Layout (Two Columns) */}
      {selectedProduct ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 font-mono">
          {/* Left Column: Spatial Cutout Visualizer */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <section className="relative rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider uppercase text-white">
                    Spatial Cutout Preview
                  </span>
                  <span className="text-[10px] text-neutral-500 uppercase">
                    Extracted from Calibrated FITS Data
                  </span>
                </div>

                {/* Stretch Controls */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-neutral-500 uppercase mr-1">Stretch:</span>
                  {(["linear", "log", "asinh", "sqrt"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setStretchMode(m)}
                      className={`px-2 py-0.5 rounded uppercase font-mono transition-all cursor-pointer ${
                        stretchMode === m
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50"
                          : "bg-neutral-900/60 text-neutral-400 border border-neutral-800 hover:text-white"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Viewport Frame */}
              <div className="relative aspect-square w-full rounded border border-neutral-900 bg-black overflow-hidden flex items-center justify-center">
                {isLoadingCutout ? (
                  <div className="flex flex-col items-center gap-3">
                    <TwinOrbit className="size-6 text-cyan-400" />
                    <span className="text-xs text-neutral-400 uppercase tracking-widest">
                      Extracting Cutout...
                    </span>
                  </div>
                ) : cutoutData?.cutout.preview_url ? (
                  <img
                    src={getFileUrl(cutoutData.cutout.preview_url)}
                    alt={`FITS Cutout for ${selectedProduct.observation_id}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-neutral-500 text-xs text-center p-6">
                    <span>No cutout loaded for this observation.</span>
                    <button
                      onClick={() => onFetchCutout(selectedProduct)}
                      className="px-3 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white text-[10px] uppercase cursor-pointer"
                    >
                      Fetch Cutout
                    </button>
                  </div>
                )}

                {/* Target Crosshair Overlay */}
                {cutoutData && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-40">
                    <div className="h-6 w-6 border border-cyan-400/60 rounded-full" />
                    <div className="absolute h-8 w-[1px] bg-cyan-400/60" />
                    <div className="absolute w-8 h-[1px] bg-cyan-400/60" />
                  </div>
                )}
              </div>

              {/* Cutout Controls & Direct FITS Download */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-900 text-xs">
                <div className="flex items-center gap-2 text-neutral-400 text-[10px]">
                  <span>Dimensions: {cutoutData?.cutout.width ?? 0} × {cutoutData?.cutout.height ?? 0} px</span>
                  <span>·</span>
                  <span>Unit: {cutoutData?.cutout.unit || "MJy/sr"}</span>
                </div>

                <div className="flex items-center gap-2">
                  {cutoutData?.cutout.fits_url && (
                    <a
                      href={getFileUrl(cutoutData.cutout.fits_url)}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-cyan-400 hover:text-cyan-200 uppercase tracking-wider transition-all"
                    >
                      Download Cutout FITS
                    </a>
                  )}
                  {selectedProduct.fits_access_url && (
                    <a
                      href={selectedProduct.fits_access_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-neutral-300 hover:text-white uppercase tracking-wider transition-all"
                    >
                      Original Full FITS
                    </a>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Statistics, WCS & HDU Metadata */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Image Flux Statistics */}
            <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
              <span className="text-xs font-bold tracking-wider uppercase text-cyan-400 border-b border-neutral-800 pb-1.5">
                Image Flux Statistics (Finite Pixels)
              </span>

              {insp?.stats ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-neutral-950/60 border border-neutral-900">
                    <div className="text-[10px] text-neutral-500 uppercase">Finite Fraction</div>
                    <div className="text-white font-bold">
                      {(insp.stats.finite_fraction * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="p-2 rounded bg-neutral-950/60 border border-neutral-900">
                    <div className="text-[10px] text-neutral-500 uppercase">Valid Fraction</div>
                    <div className="text-emerald-400 font-bold">
                      {(insp.stats.valid_fraction * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="p-2 rounded bg-neutral-950/60 border border-neutral-900">
                    <div className="text-[10px] text-neutral-500 uppercase">Mean Flux</div>
                    <div className="text-white font-mono">
                      {insp.stats.mean != null ? insp.stats.mean.toFixed(4) : "N/A"}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-neutral-950/60 border border-neutral-900">
                    <div className="text-[10px] text-neutral-500 uppercase">Median Flux</div>
                    <div className="text-white font-mono">
                      {insp.stats.median != null ? insp.stats.median.toFixed(4) : "N/A"}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-neutral-950/60 border border-neutral-900">
                    <div className="text-[10px] text-neutral-500 uppercase">Std Deviation</div>
                    <div className="text-neutral-300 font-mono">
                      {insp.stats.std != null ? insp.stats.std.toFixed(4) : "N/A"}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-neutral-950/60 border border-neutral-900">
                    <div className="text-[10px] text-neutral-500 uppercase">Range [Min, Max]</div>
                    <div className="text-neutral-300 font-mono text-[10px]">
                      {insp.stats.min != null ? insp.stats.min.toFixed(2) : "0"} to {insp.stats.max != null ? insp.stats.max.toFixed(2) : "0"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-neutral-500 py-3 text-center">
                  {isLoadingInspect ? "Inspecting FITS statistics..." : "Click Inspect HDU to compute image statistics."}
                </div>
              )}
            </section>

            {/* Celestial WCS & Astrometry Matrix */}
            <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
              <span className="text-xs font-bold tracking-wider uppercase text-amber-400 border-b border-neutral-800 pb-1.5">
                Celestial WCS & Astrometric Solution
              </span>

              {insp?.wcs ? (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                    <span className="text-neutral-400">Projection</span>
                    <span className="text-white font-bold">{insp.wcs.projection || "TAN-SIP"}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                    <span className="text-neutral-400">Pixel Scale</span>
                    <span className="text-white font-mono">
                      {insp.wcs.pixel_scale_arcsec != null ? `${insp.wcs.pixel_scale_arcsec.toFixed(3)} arcsec/px` : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                    <span className="text-neutral-400">Target Inside Footprint</span>
                    <span className={`font-bold ${insp.wcs.target_inside_image ? "text-emerald-400" : "text-rose-400"}`}>
                      {insp.wcs.target_inside_image ? "VERIFIED (INSIDE)" : "OUTSIDE FOOTPRINT"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Reference Pixel [CRPIX]</span>
                    <span className="text-neutral-300 font-mono text-[11px]">
                      {insp.wcs.crpix ? `[${insp.wcs.crpix[0]?.toFixed(1)}, ${insp.wcs.crpix[1]?.toFixed(1)}]` : "N/A"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-neutral-500 py-3 text-center">
                  Astrometric WCS solution not yet inspected.
                </div>
              )}
            </section>

            {/* FITS HDU Extensions Matrix */}
            <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
                <span className="text-xs font-bold tracking-wider uppercase text-white">
                  FITS HDU Extensions Matrix
                </span>
                <button
                  onClick={() => onInspectFITS(selectedProduct)}
                  disabled={isLoadingInspect}
                  className="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] text-cyan-400 uppercase cursor-pointer disabled:opacity-50"
                >
                  {isLoadingInspect ? "Inspecting..." : "Re-Inspect HDU"}
                </button>
              </div>

              {insp?.hdus && insp.hdus.length > 0 ? (
                <div className="flex flex-col gap-1.5 text-xs">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {insp.hdus.map((hdu: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-2 rounded border border-neutral-900 bg-neutral-950/40 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-neutral-800 text-neutral-300">
                          #{hdu.index}
                        </span>
                        <span className="font-bold text-white">{hdu.name || "PRIMARY"}</span>
                        <span className="text-[10px] text-neutral-500 uppercase">{hdu.kind}</span>
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono">
                        {hdu.shape ? `${hdu.shape.join(" × ")} px` : "Header Only"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-neutral-500 py-3 text-center">
                  No HDU extensions loaded.
                </div>
              )}

              {/* Special Extensions Quality Status */}
              <div className="pt-2 border-t border-neutral-900 grid grid-cols-3 gap-2 text-[10px]">
                <div className="p-1.5 rounded bg-neutral-950/60 border border-neutral-900 flex flex-col">
                  <span className="text-neutral-500">FLAGS</span>
                  <span className={insp?.mask?.available ? "text-emerald-400 font-bold" : "text-neutral-500"}>
                    {insp?.mask?.available ? "Available" : "Absent"}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-neutral-950/60 border border-neutral-900 flex flex-col">
                  <span className="text-neutral-500">VARIANCE</span>
                  <span className={insp?.variance?.available ? "text-emerald-400 font-bold" : "text-neutral-500"}>
                    {insp?.variance?.available ? "Available" : "Absent"}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-neutral-950/60 border border-neutral-900 flex flex-col">
                  <span className="text-neutral-500">EPSF</span>
                  <span className={insp?.psf?.available ? "text-emerald-400 font-bold" : "text-neutral-500"}>
                    {insp?.psf?.available ? "Available" : "Absent"}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : (
        /* Standby State When No Product Selected */
        <div className="rounded border border-neutral-800 bg-[#050608] p-12 text-center flex flex-col items-center justify-center gap-4 font-mono">
          <div className="h-12 w-12 rounded border border-cyan-400/40 bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-lg font-bold">
            🔭
          </div>
          <div className="max-w-md flex flex-col gap-1">
            <h3 className="text-sm sm:text-base font-bold tracking-[0.2em] text-white uppercase">
              No Observation Selected For Inspection
            </h3>
            <p className="text-xs text-neutral-400">
              Go to the Discovery workspace to search and select a SPHEREx observation epoch, or choose from previously discovered observations.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab("discovery")}
            className="mt-2 inline-flex items-center gap-2 rounded border border-cyan-400/60 bg-cyan-500/15 hover:bg-cyan-500/25 px-5 py-2 text-xs font-bold uppercase tracking-wider text-cyan-200 transition-all cursor-pointer active:scale-95"
          >
            <span>GO TO DISCOVERY WORKSPACE</span>
            <span className="text-cyan-400">▶</span>
          </button>
        </div>
      )}
    </div>
  );
}

