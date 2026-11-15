import { useState, useCallback, useId } from "react";
import {
  getTargetTimeline,
  createCutout,
  getFileUrl,
  type TimelineProduct,
} from "@/lib/api";
import { operationMonitor } from "@/lib/operationMonitor";
import { TwinOrbit } from "@/components/loading-ui/twin-orbit";

interface MosaicToolProps {
  initialRa: string;
  initialDec: string;
  initialCutoutSize: string;
  onCoordinatesChange?: (ra: string, dec: string) => void;
}

interface DetectorBandSpec {
  id: string;
  name: string;
  range: string;
  lambdaCenter: string;
  resolvingPower: string;
  scienceFocus: string;
  color: string;
  accent: string;
}

const DETECTORS: DetectorBandSpec[] = [
  {
    id: "SPHEREx-D1",
    name: "Detector 1 (D1)",
    range: "0.75 - 1.11 µm",
    lambdaCenter: "0.93 µm",
    resolvingPower: "R ~ 41",
    scienceFocus: "Cosmic Optical Background & Galactic Stellar Populations",
    color: "text-blue-400",
    accent: "border-blue-500/50 bg-blue-500/10",
  },
  {
    id: "SPHEREx-D2",
    name: "Detector 2 (D2)",
    range: "1.11 - 1.64 µm",
    lambdaCenter: "1.37 µm",
    resolvingPower: "R ~ 41",
    scienceFocus: "Near-IR Cosmic Infrared Background & Intracluster Light",
    color: "text-cyan-400",
    accent: "border-cyan-500/50 bg-cyan-500/10",
  },
  {
    id: "SPHEREx-D3",
    name: "Detector 3 (D3)",
    range: "1.64 - 2.42 µm",
    lambdaCenter: "2.03 µm",
    resolvingPower: "R ~ 41",
    scienceFocus: "Interstellar Water Ice & Planet-Forming Disk Chemistry",
    color: "text-emerald-400",
    accent: "border-emerald-500/50 bg-emerald-500/10",
  },
  {
    id: "SPHEREx-D4",
    name: "Detector 4 (D4)",
    range: "2.42 - 3.82 µm",
    lambdaCenter: "3.12 µm",
    resolvingPower: "R ~ 35",
    scienceFocus: "3.05 µm H2O Ice Mantles & Hydrocarbon Absorption",
    color: "text-amber-400",
    accent: "border-amber-500/50 bg-amber-500/10",
  },
  {
    id: "SPHEREx-D5",
    name: "Detector 5 (D5)",
    range: "3.82 - 4.42 µm",
    lambdaCenter: "4.12 µm",
    resolvingPower: "R ~ 110",
    scienceFocus: "4.27 µm CO2 Ice Band & High-Resolution Spectrophotometry",
    color: "text-orange-400",
    accent: "border-orange-500/50 bg-orange-500/10",
  },
  {
    id: "SPHEREx-D6",
    name: "Detector 6 (D6)",
    range: "4.42 - 5.00 µm",
    lambdaCenter: "4.71 µm",
    resolvingPower: "R ~ 130",
    scienceFocus: "4.67 µm CO Gas/Ice & Distant Galaxy Redshift Tomography",
    color: "text-rose-400",
    accent: "border-rose-500/50 bg-rose-500/10",
  },
];

export default function MosaicTool({
  initialRa,
  initialDec,
  initialCutoutSize,
  onCoordinatesChange,
}: MosaicToolProps) {
  const raId = useId();
  const decId = useId();
  const sizeId = useId();

  const [ra, setRa] = useState(initialRa);
  const [dec, setDec] = useState(initialDec);
  const [cutoutSize, setCutoutSize] = useState(initialCutoutSize);

  const [selectedDetector, setSelectedDetector] = useState<DetectorBandSpec>(DETECTORS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [mosaicCutouts, setMosaicCutouts] = useState<Record<string, { product: TimelineProduct; previewUrl: string; fitsUrl: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const handleAcquireMosaic = useCallback(async () => {
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const sizeNum = parseFloat(cutoutSize) || 0.1;

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

      // Query timeline to locate observations in each band
      const timeline = await operationMonitor.executeOperation(
        {
          name: "Mosaic Multi-Band Timeline Query",
          category: "discovery",
          workspace: "discovery",
          context: { ra: raNum, dec: decNum, radius: sizeNum },
          dedupKey: `mosaic-timeline:${raNum.toFixed(4)}:${decNum.toFixed(4)}:${sizeNum}`,
        },
        () =>
          getTargetTimeline({
            ra: raNum,
            dec: decNum,
            radius: sizeNum,
          })
      );

      // Find representative products for each band
      const bandMap: Record<string, TimelineProduct> = {};
      for (const epoch of timeline.epochs) {
        for (const prod of epoch.products) {
          if (prod.band && !bandMap[prod.band]) {
            bandMap[prod.band] = prod;
          }
        }
      }

      // Generate cutouts for each available band
      const results: Record<string, { product: TimelineProduct; previewUrl: string; fitsUrl: string }> = {};
      for (const [band, prod] of Object.entries(bandMap)) {
        const obsId = prod.observation_id;
        if (!obsId) continue;
        try {
          const res = await operationMonitor.executeOperation(
            {
              name: `Mosaic Cutout (${band})`,
              category: "explorer",
              workspace: "explorer",
              context: {
                observationId: obsId,
                ra: raNum,
                dec: decNum,
                radius: sizeNum,
                label: `Band: ${band}`,
              },
              dedupKey: `mosaic-cutout:${obsId}:${sizeNum}`,
            },
            () =>
              createCutout(obsId, {
                ra: raNum,
                dec: decNum,
                size: sizeNum,
              })
          );
          results[band] = {
            product: prod,
            previewUrl: res.cutout?.preview_url ? getFileUrl(res.cutout.preview_url) : "",
            fitsUrl: res.cutout?.fits_url ? getFileUrl(res.cutout.fits_url) : "",
          };
        } catch {
          // Continue with available bands
        }
      }

      setMosaicCutouts(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mosaic acquisition failed.");
    } finally {
      setIsLoading(false);
    }
  }, [ra, dec, cutoutSize, onCoordinatesChange]);

  return (
    <div className="flex flex-col gap-5">
      {/* Mosaic Header */}
      <section className="relative rounded border border-neutral-800 bg-[#050608] p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
        <div className="pointer-events-none absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-400/80" />
        <div className="pointer-events-none absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-400/80" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-400/80" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-400/80" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <h2 className="text-xs sm:text-sm font-bold tracking-widest uppercase text-white">
              SPHEREx 6-Band Focal Plane Mosaic & Spectral Cube
            </h2>
            <span className="text-[10px] text-neutral-500 uppercase">
              Linear Variable Filter (LVF) Co-Registration
            </span>
          </div>

          <button
            onClick={() => {
              setRa("156.09328159");
              setDec("-41.64466331");
              setCutoutSize("0.1");
            }}
            className="px-2.5 py-1 rounded border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 hover:border-emerald-400/50 text-[10px] font-mono uppercase tracking-wider text-neutral-300 hover:text-white transition-all cursor-pointer"
          >
            Benchmark Target
          </button>
        </div>

        {/* Input Parameters & Query */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor={raId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              RA (deg)
            </label>
            <input
              id={raId}
              type="text"
              value={ra}
              onChange={(e) => setRa(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-emerald-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
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
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-emerald-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={sizeId} className="text-[10px] uppercase tracking-wider text-neutral-400">
              Cutout Size (deg)
            </label>
            <input
              id={sizeId}
              type="text"
              value={cutoutSize}
              onChange={(e) => setCutoutSize(e.target.value)}
              className="w-full bg-[#090b0e] border border-neutral-800 focus:border-emerald-400 px-2.5 py-1.5 rounded text-xs text-white font-mono outline-none transition-colors"
            />
          </div>

          <button
            onClick={handleAcquireMosaic}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 text-white font-mono text-xs uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            {isLoading ? (
              <>
                <TwinOrbit className="size-4 text-white" />
                <span>BUILDING MOSAIC...</span>
              </>
            ) : (
              <span>ACQUIRE ALL-BAND MOSAIC</span>
            )}
          </button>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="rounded border border-rose-500/60 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-rose-400 font-bold">MOSAIC EXTRACTION NOTICE:</span>
            <span>{error}</span>
          </div>
          <button
            onClick={handleAcquireMosaic}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] uppercase text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* SPHEREx Focal Plane Array Matrix */}
      <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase text-white">
              SPHEREx 6-Band Linear Variable Filter Array
            </span>
            <span className="text-[10px] text-neutral-500 uppercase">
              2x3 Focal Plane Geometry (0.75 - 5.00 µm)
            </span>
          </div>
          <span className="text-[10px] text-neutral-400">Pixel Scale: 6.2 arcsec per pixel</span>
        </div>

        {/* 2x3 Grid of Detector Channels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DETECTORS.map((d) => {
            const hasCutout = !!mosaicCutouts[d.id];
            const isSelected = selectedDetector.id === d.id;

            return (
              <div
                key={d.id}
                onClick={() => setSelectedDetector(d)}
                className={`relative rounded border p-3.5 flex flex-col gap-2 transition-all cursor-pointer ${
                  isSelected
                    ? `${d.accent} ring-1 ring-cyan-400/50`
                    : "border-neutral-800/80 bg-neutral-900/30 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold tracking-wider ${d.color}`}>{d.name}</span>
                  <span className="text-[10px] text-neutral-400 font-mono">{d.resolvingPower}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-white font-mono">{d.range}</span>
                  <span className="text-neutral-500 text-[10px]">Center: {d.lambdaCenter}</span>
                </div>

                <p className="text-[11px] text-neutral-400 leading-tight">{d.scienceFocus}</p>

                {/* Status or preview badge */}
                <div className="mt-1 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[10px]">
                  <span className={hasCutout ? "text-emerald-400 font-bold" : "text-neutral-500"}>
                    {hasCutout ? "Cutout Ready" : "Awaiting Acquisition"}
                  </span>
                  {hasCutout && (
                    <a
                      href={mosaicCutouts[d.id].fitsUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-cyan-400 hover:text-cyan-200 underline"
                    >
                      Download FITS
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Multi-Band Cutout Previews (If Acquired) */}
      {Object.keys(mosaicCutouts).length > 0 && (
        <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="text-xs font-bold tracking-wider uppercase text-white">
              Acquired Multi-Band Spectral Cube Cutouts ({Object.keys(mosaicCutouts).length} Bands)
            </span>
            <span className="text-[10px] text-neutral-400">Co-registered on ICRS J2000 Grid</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(mosaicCutouts).map(([bandId, item]) => {
              const spec = DETECTORS.find((d) => d.id === bandId);

              return (
                <div key={bandId} className="rounded border border-neutral-800 bg-neutral-900/40 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${spec?.color || "text-white"}`}>
                      {bandId} ({spec?.range || ""})
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {item.product.observation_id ? `${item.product.observation_id.slice(0, 12)}...` : "OBS_ID"}
                    </span>
                  </div>

                  <div className="relative aspect-square w-full rounded bg-black border border-neutral-900 overflow-hidden flex items-center justify-center">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={`${bandId} Cutout`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-neutral-500 font-mono">No PNG Preview</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1">
                    <span>MJD: {item.product.t_min_mjd?.toFixed(2) ?? "N/A"}</span>
                    <a
                      href={item.fitsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 hover:text-white text-neutral-300"
                    >
                      FITS
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Selected Detector Deep Dive */}
      <section className="rounded border border-neutral-800 bg-[#050608] p-4 flex flex-col gap-3">
        <span className="text-xs font-bold tracking-wider uppercase text-cyan-400 border-b border-neutral-800 pb-2">
          DETECTOR SPECTROSCOPIC CHARACTERISTICS: {selectedDetector.name}
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Wavelength Coverage</span>
            <span className="text-white font-bold">{selectedDetector.range}</span>
            <span className="text-[10px] text-neutral-400 mt-1">Nominal center: {selectedDetector.lambdaCenter}</span>
          </div>

          <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Resolving Power</span>
            <span className="text-emerald-400 font-bold">{selectedDetector.resolvingPower}</span>
            <span className="text-[10px] text-neutral-400 mt-1">Linear variable wedge filter</span>
          </div>

          <div className="p-3 rounded border border-neutral-900 bg-neutral-950/60 flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500 uppercase">Survey Role</span>
            <span className="text-amber-300 font-bold leading-tight">{selectedDetector.scienceFocus}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
