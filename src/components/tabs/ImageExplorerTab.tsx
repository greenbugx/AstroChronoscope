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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insp = (inspectData?.inspection || null) as any;

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* Observation Selector Bar */}
      <div className="border border-neutral-800 bg-[#0d0d0d] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-neutral-400 uppercase">Active Observation:</span>
          {selectedProduct ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-white bg-black px-2 py-0.5 border border-neutral-700 truncate max-w-[260px] sm:max-w-md block" title={selectedProduct.observation_id || undefined}>
                {selectedProduct.observation_id}
              </span>
              <span className="text-sky-400 font-bold">
                {selectedProduct.band?.replace("SPHEREx-", "") || "Band"}
              </span>
              <span className="text-neutral-500">
                Calib Level: {selectedProduct.calib_level ?? 2}
              </span>
            </div>
          ) : (
            <span className="text-amber-400 font-bold">No Observation Selected</span>
          )}
        </div>

        {/* Switcher buttons if multiple products */}
        {availableProducts.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-xl">
            <span className="text-[10px] text-neutral-500 uppercase mr-1">Switch:</span>
            {availableProducts.map((p) => {
              const isActive = selectedProduct?.observation_id === p.observation_id;
              return (
                <button
                  key={p.observation_id}
                  onClick={() => {
                    onSelectProduct(p);
                    onFetchCutout(p);
                    onInspectFITS(p);
                  }}
                  className={`px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors cursor-pointer ${
                    isActive
                      ? "bg-amber-600 text-white border-amber-500"
                      : "bg-neutral-900 text-neutral-400 hover:text-white border-neutral-800"
                  }`}
                >
                  {p.band?.replace("SPHEREx-", "") || "P"} · {p.observation_id?.slice(-6) || "ID"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Errors */}
      {cutoutError && (
        <div className="border border-red-600 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>CUTOUT ERROR: {cutoutError}</span>
          {selectedProduct && (
            <button
              onClick={() => onFetchCutout(selectedProduct)}
              className="px-2 py-0.5 bg-red-600 text-white font-bold uppercase text-[10px]"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {inspectError && (
        <div className="border border-red-600 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>INSPECTION ERROR: {inspectError}</span>
          {selectedProduct && (
            <button
              onClick={() => onInspectFITS(selectedProduct)}
              className="px-2 py-0.5 bg-red-600 text-white font-bold uppercase text-[10px]"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Main Workspace Layout */}
      {selectedProduct ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Spatial Cutout Visualizer */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <section className="border border-neutral-800 bg-[#0d0d0d] flex flex-col">
              <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800 flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Spatial Cutout Preview
                </span>

                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-neutral-500 uppercase mr-1">Stretch:</span>
                  {(["linear", "log", "asinh", "sqrt"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setStretchMode(m)}
                      className={`px-1.5 py-0.5 uppercase border ${
                        stretchMode === m
                          ? "bg-blue-600 text-white border-blue-500 font-bold"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Viewport Frame */}
              <div className="relative aspect-square w-full bg-black border-b border-neutral-800 flex items-center justify-center p-2">
                {isLoadingCutout ? (
                  <div className="flex flex-col items-center gap-2 text-neutral-400 text-xs">
                    <TwinOrbit className="size-5 text-white" />
                    <span>EXTRACTING CUTOUT...</span>
                  </div>
                ) : cutoutData?.cutout.preview_url ? (
                  <img
                    src={getFileUrl(cutoutData.cutout.preview_url)}
                    alt={`Cutout for ${selectedProduct.observation_id}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-neutral-500 text-xs text-center p-6">
                    <span>No cutout loaded.</span>
                    <button
                      onClick={() => onFetchCutout(selectedProduct)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase cursor-pointer"
                    >
                      Fetch Cutout
                    </button>
                  </div>
                )}
              </div>

              {/* Action bar below preview */}
              <div className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#111111]">
                <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                  <span>Dimensions: <strong className="text-white">{cutoutData?.cutout.width ?? 0} × {cutoutData?.cutout.height ?? 0} px</strong></span>
                  <span>Unit: <strong className="text-white">{cutoutData?.cutout.unit || "MJy/sr"}</strong></span>
                </div>

                <div className="flex items-center gap-2">
                  {cutoutData?.cutout.fits_url && (
                    <a
                      href={getFileUrl(cutoutData.cutout.fits_url)}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 text-[10px] uppercase font-bold"
                    >
                      Download Cutout FITS
                    </a>
                  )}
                  {selectedProduct.fits_access_url && (
                    <a
                      href={selectedProduct.fits_access_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 text-[10px] uppercase font-bold"
                    >
                      Full FITS
                    </a>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: HDU Structure & Statistics */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Pixel Statistics */}
            <section className="border border-neutral-800 bg-[#0d0d0d]">
              <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800 flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Pixel Flux Statistics
                </span>
                <button
                  onClick={() => onInspectFITS(selectedProduct)}
                  disabled={isLoadingInspect}
                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 text-[10px] uppercase font-bold cursor-pointer"
                >
                  {isLoadingInspect ? "Inspecting..." : "Inspect HDU"}
                </button>
              </div>

              {insp?.stats ? (
                <div className="p-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-black border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block">Finite Fraction</span>
                    <span className="text-white font-bold">{(insp.stats.finite_fraction * 100).toFixed(1)}%</span>
                  </div>

                  <div className="p-2 bg-black border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block">Valid Fraction</span>
                    <span className="text-emerald-400 font-bold">{(insp.stats.valid_fraction * 100).toFixed(1)}%</span>
                  </div>

                  <div className="p-2 bg-black border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block">Mean Flux</span>
                    <span className="text-white font-bold">{insp.stats.mean != null ? insp.stats.mean.toFixed(4) : "N/A"}</span>
                  </div>

                  <div className="p-2 bg-black border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block">Median Flux</span>
                    <span className="text-white font-bold">{insp.stats.median != null ? insp.stats.median.toFixed(4) : "N/A"}</span>
                  </div>

                  <div className="p-2 bg-black border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block">Std Deviation</span>
                    <span className="text-neutral-300 font-bold">{insp.stats.std != null ? insp.stats.std.toFixed(4) : "N/A"}</span>
                  </div>

                  <div className="p-2 bg-black border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block">Flux Range [Min, Max]</span>
                    <span className="text-neutral-300 text-[11px]">
                      {insp.stats.min != null ? insp.stats.min.toFixed(2) : "0"} to {insp.stats.max != null ? insp.stats.max.toFixed(2) : "0"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-neutral-500 text-xs text-center">
                  Click Inspect HDU to compute image statistics.
                </div>
              )}
            </section>

            {/* WCS Astrometry */}
            <section className="border border-neutral-800 bg-[#0d0d0d]">
              <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  WCS Astrometric Solution
                </span>
              </div>

              {insp?.wcs ? (
                <div className="p-3 flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                    <span className="text-neutral-400">Projection</span>
                    <span className="text-white font-bold">{insp.wcs.projection || "TAN-SIP"}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                    <span className="text-neutral-400">Pixel Scale</span>
                    <span className="text-white font-bold">
                      {insp.wcs.pixel_scale_arcsec != null ? `${insp.wcs.pixel_scale_arcsec.toFixed(3)} arcsec/px` : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                    <span className="text-neutral-400">Target Inside Footprint</span>
                    <span className={`font-bold uppercase ${insp.wcs.target_inside_image ? "text-emerald-400" : "text-red-400"}`}>
                      {insp.wcs.target_inside_image ? "INSIDE (YES)" : "OUTSIDE (NO)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">CRPIX</span>
                    <span className="text-neutral-300">
                      {insp.wcs.crpix ? `[${insp.wcs.crpix[0]?.toFixed(1)}, ${insp.wcs.crpix[1]?.toFixed(1)}]` : "N/A"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-neutral-500 text-xs text-center">
                  Astrometric WCS solution not yet inspected.
                </div>
              )}
            </section>

            {/* FITS HDU Extensions */}
            <section className="border border-neutral-800 bg-[#0d0d0d]">
              <div className="bg-[#141414] px-3 py-1.5 border-b border-neutral-800 flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  HDU Extensions Table
                </span>
              </div>

              {insp?.hdus && insp.hdus.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#181818] border-b border-neutral-800 text-[10px] text-neutral-400 uppercase">
                        <th className="py-1 px-2.5">#</th>
                        <th className="py-1 px-2.5">Name</th>
                        <th className="py-1 px-2.5">Type</th>
                        <th className="py-1 px-2.5">Shape</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900 font-mono text-[11px]">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {insp.hdus.map((hdu: any, idx: number) => (
                        <tr key={idx} className="hover:bg-neutral-900/50">
                          <td className="py-1 px-2.5 text-neutral-500">#{hdu.index}</td>
                          <td className="py-1 px-2.5 font-bold text-white">{hdu.name || "PRIMARY"}</td>
                          <td className="py-1 px-2.5 text-neutral-400 uppercase">{hdu.kind}</td>
                          <td className="py-1 px-2.5 text-neutral-300">{hdu.shape ? `${hdu.shape.join(" × ")}` : "Header"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-neutral-500 text-xs text-center">
                  No HDU extensions loaded.
                </div>
              )}

              {/* Special Extension Presence */}
              <div className="p-2 border-t border-neutral-800 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div className="p-1 bg-black border border-neutral-800">
                  <span className="text-neutral-500 block">FLAGS</span>
                  <span className={insp?.mask?.available ? "text-emerald-400 font-bold" : "text-neutral-600"}>
                    {insp?.mask?.available ? "PRESENT" : "ABSENT"}
                  </span>
                </div>
                <div className="p-1 bg-black border border-neutral-800">
                  <span className="text-neutral-500 block">VARIANCE</span>
                  <span className={insp?.variance?.available ? "text-emerald-400 font-bold" : "text-neutral-600"}>
                    {insp?.variance?.available ? "PRESENT" : "ABSENT"}
                  </span>
                </div>
                <div className="p-1 bg-black border border-neutral-800">
                  <span className="text-neutral-500 block">EPSF</span>
                  <span className={insp?.psf?.available ? "text-emerald-400 font-bold" : "text-neutral-600"}>
                    {insp?.psf?.available ? "PRESENT" : "ABSENT"}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="border border-neutral-800 bg-[#0d0d0d] p-8 text-center flex flex-col items-center justify-center gap-2">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            No Observation Selected
          </span>
          <span className="text-[11px] text-neutral-400">
            Go to Discovery to query and select an observation product.
          </span>
          <button
            onClick={() => onNavigateTab("discovery")}
            className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase cursor-pointer"
          >
            GO TO DISCOVERY
          </button>
        </div>
      )}
    </div>
  );
}
