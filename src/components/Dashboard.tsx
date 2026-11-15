import { useState, useEffect, useCallback } from "react";
import {
  getBackendHealth,
  getTargetTimeline,
  createCutout,
  inspectImage,
  compareImages,
  getTargetLightCurve,
  extractSpectrum,
  compareSpectra,
  searchGaia,
  getSourceGaiaAssociation,
  type BackendHealthResponse,
  type TimelineResponse,
  type TimelineProduct,
  type CutoutResponse,
  type ComparisonResponse,
  type InspectResponse,
  type TargetLightCurveResponse,
  type SpectralExtractionResponse,
  type SpectralComparisonResponse,
  type SpectralExtractionRequest,
  type GaiaConeSearchResponse,
  type SourceGaiaAssociationResponse,
} from "@/lib/api";
import {
  BENCHMARK_TARGETS,
  getBenchmarkTargetById,
  propagateTargetCoordinates,
} from "@/data/benchmarkTargets";
import { operationMonitor, useOperationMonitor } from "@/lib/operationMonitor";

import DiscoveryTab from "./tabs/DiscoveryTab";
import ImageExplorerTab from "./tabs/ImageExplorerTab";
import DifferentialAnalysisTab from "./tabs/DifferentialAnalysisTab";
import TimeDomainAnalysisTab from "./tabs/TimeDomainAnalysisTab";
import ScientificReportsTab from "./tabs/ScientificReportsTab";
import JobMonitor from "./JobMonitor";

interface DashboardProps {
  onReturnToLanding: () => void;
}

export type ActiveNavTab = "discovery" | "explorer" | "differential" | "timedomain" | "reports" | "jobs";

export default function Dashboard({ onReturnToLanding }: DashboardProps) {
  // Mission Clock
  const [currentTimeUtc, setCurrentTimeUtc] = useState<string>(() =>
    new Date().toISOString().replace("T", " ").replace("Z", " UTC")
  );
  const [currentMjd, setCurrentMjd] = useState<string>(() => {
    const jd = new Date().getTime() / 86400000 + 2440587.5;
    return (jd - 2400000.5).toFixed(4);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeUtc(now.toISOString().replace("T", " ").replace("Z", " UTC"));
      const jd = now.getTime() / 86400000 + 2440587.5;
      setCurrentMjd((jd - 2400000.5).toFixed(4));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Backend Health Telemetry
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthStatus, setHealthStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [healthError, setHealthError] = useState<string | null>(null);

  // Five Primary Workspaces Navigation
  const [activeNavTab, setActiveNavTab] = useState<ActiveNavTab>("discovery");

  // NASA Benchmark Target Preset State
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string | null>("barnards_star");
  const [isCustomizedCoords, setIsCustomizedCoords] = useState<boolean>(false);
  const [usePropagatedEpoch, setUsePropagatedEpoch] = useState<boolean>(false);

  // Synchronous Operation Monitor hook
  const { runningCount } = useOperationMonitor();

  // Target Query Parameters
  const [ra, setRa] = useState<string>(BENCHMARK_TARGETS[0].coordinates.ra.toFixed(6));
  const [dec, setDec] = useState<string>(BENCHMARK_TARGETS[0].coordinates.dec.toFixed(6));
  const [radius, setRadius] = useState<string>(BENCHMARK_TARGETS[0].search.defaultRadius.toString());
  const [cutoutSize, setCutoutSize] = useState<string>("0.05");
  const [collection, setCollection] = useState<string>("spherex_qr3");
  const [selectedBandFilter, setSelectedBandFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Discovery State
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Image Explorer State
  const [selectedProduct, setSelectedProduct] = useState<TimelineProduct | null>(null);
  const [isCutoutLoading, setIsCutoutLoading] = useState(false);
  const [cutoutData, setCutoutData] = useState<CutoutResponse | null>(null);
  const [cutoutError, setCutoutError] = useState<string | null>(null);
  const [isInspectLoading, setIsInspectLoading] = useState(false);
  const [inspectData, setInspectData] = useState<InspectResponse | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Differential Analysis State
  const [comparisonProductA, setComparisonProductA] = useState<TimelineProduct | null>(null);
  const [comparisonProductB, setComparisonProductB] = useState<TimelineProduct | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResponse | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // Time-Domain Analysis State
  const [isLightCurveLoading, setIsLightCurveLoading] = useState(false);
  const [lightCurveData, setLightCurveData] = useState<TargetLightCurveResponse | null>(null);
  const [lightCurveError, setLightCurveError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Spectral State (Phase 4)
  const [spectrumData, setSpectrumData] = useState<SpectralExtractionResponse | null>(null);
  const [isSpectrumLoading, setIsSpectrumLoading] = useState(false);
  const [spectrumError, setSpectrumError] = useState<string | null>(null);

  const [spectralComparison, setSpectralComparison] = useState<SpectralComparisonResponse | null>(null);
  const [isSpectralComparing, setIsSpectralComparing] = useState(false);
  const [spectralComparisonError, setSpectralComparisonError] = useState<string | null>(null);

  // Gaia DR3 State (Phase 5)
  const [gaiaConeSearchResult, setGaiaConeSearchResult] = useState<GaiaConeSearchResponse | null>(null);
  const [isGaiaSearching, setIsGaiaSearching] = useState(false);
  const [gaiaSearchError, setGaiaSearchError] = useState<string | null>(null);

  const [sourceGaiaAssociation, setSourceGaiaAssociation] = useState<SourceGaiaAssociationResponse | null>(null);
  const [isGaiaAssociating, setIsGaiaAssociating] = useState(false);
  const [sourceGaiaError, setSourceGaiaError] = useState<string | null>(null);

  // Synchronize Backend Health on Mount
  useEffect(() => {
    let isCancelled = false;
    getBackendHealth()
      .then((res) => {
        if (!isCancelled) {
          setHealth(res);
          setHealthStatus("online");
          setHealthError(null);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setHealthStatus("offline");
          setHealthError(err instanceof Error ? err.message : "Failed to connect to backend");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleRefreshHealth = async () => {
    setHealthStatus("connecting");
    setHealthError(null);
    try {
      const res = await operationMonitor.executeOperation(
        {
          name: "Observatory Link Heartbeat",
          category: "telemetry",
          workspace: "jobs",
          context: { label: "FastAPI Daemon Health Probe" },
          dedupKey: "health:refresh",
        },
        () => getBackendHealth()
      );
      setHealth(res);
      setHealthStatus("online");
    } catch (err: unknown) {
      setHealthStatus("offline");
      setHealthError(err instanceof Error ? err.message : "Failed to connect to backend");
    }
  };

  // NASA Benchmark Target Handlers
  const handleSelectBenchmark = (targetId: string) => {
    if (!targetId) {
      setSelectedBenchmarkId(null);
      setIsCustomizedCoords(false);
      setUsePropagatedEpoch(false);
      return;
    }

    const target = getBenchmarkTargetById(targetId);
    if (!target) return;

    setSelectedBenchmarkId(target.id);
    setIsCustomizedCoords(false);
    setUsePropagatedEpoch(false);
    setRa(target.coordinates.ra.toFixed(6));
    setDec(target.coordinates.dec.toFixed(6));
    setRadius(target.search.defaultRadius.toString());
  };

  const handleClearBenchmark = () => {
    setSelectedBenchmarkId(null);
    setIsCustomizedCoords(false);
    setUsePropagatedEpoch(false);
  };

  const handleTogglePropagateEpoch = () => {
    if (!selectedBenchmarkId) return;
    const target = getBenchmarkTargetById(selectedBenchmarkId);
    if (!target || !target.properMotion) return;

    if (!usePropagatedEpoch) {
      const prop = propagateTargetCoordinates(target, 2026.5);
      setRa(prop.ra.toFixed(6));
      setDec(prop.dec.toFixed(6));
      setUsePropagatedEpoch(true);
      setIsCustomizedCoords(false);
    } else {
      setRa(target.coordinates.ra.toFixed(6));
      setDec(target.coordinates.dec.toFixed(6));
      setUsePropagatedEpoch(false);
      setIsCustomizedCoords(false);
    }
  };

  const handleUpdateCoords = (newRa: string, newDec: string, newRadius: string, newCutout: string) => {
    setRa(newRa);
    setDec(newDec);
    setRadius(newRadius);
    setCutoutSize(newCutout);

    if (selectedBenchmarkId) {
      const target = getBenchmarkTargetById(selectedBenchmarkId);
      if (target) {
        const expectedRa = usePropagatedEpoch
          ? propagateTargetCoordinates(target, 2026.5).ra.toFixed(6)
          : target.coordinates.ra.toFixed(6);
        const expectedDec = usePropagatedEpoch
          ? propagateTargetCoordinates(target, 2026.5).dec.toFixed(6)
          : target.coordinates.dec.toFixed(6);

        if (newRa !== expectedRa || newDec !== expectedDec) {
          setIsCustomizedCoords(true);
        }
      }
    }
  };

  const handleLoadBenchmark = () => {
    handleSelectBenchmark("barnards_star");
  };

  // Execute SIA2 Discovery Query
  const handleDiscoverySearch = useCallback(async () => {
    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const radiusNum = parseFloat(radius);

    if (isNaN(raNum) || isNaN(decNum) || isNaN(radiusNum)) {
      setTimelineError("ERR_VAL: Target coordinates must be valid floating point values.");
      return;
    }

    try {
      setIsTimelineLoading(true);
      setTimelineError(null);
      const result = await operationMonitor.executeOperation(
        {
          name: "IRSA SIA2 Target Discovery",
          category: "discovery",
          workspace: "discovery",
          context: {
            ra: raNum,
            dec: decNum,
            radius: radiusNum,
            label: `Collection: ${collection || "spherex_qr3"}`,
          },
          dedupKey: `discovery:${raNum.toFixed(4)}:${decNum.toFixed(4)}:${radiusNum}`,
        },
        () =>
          getTargetTimeline({
            ra: raNum,
            dec: decNum,
            radius: radiusNum,
            collection: collection || undefined,
            bands: selectedBandFilter === "ALL" ? undefined : [selectedBandFilter],
            start_date: startDate || undefined,
            end_date: endDate || undefined,
          })
      );

      setTimelineData(result);

      // Auto-populate initial observation selection for downstream workspaces
      if (result.epochs.length > 0) {
        const firstEpoch = result.epochs[0];
        if (firstEpoch.products.length > 0) {
          const firstProd = firstEpoch.products[0];
          setSelectedProduct(firstProd);
          setComparisonProductA(firstProd);
          if (result.epochs.length > 1 && result.epochs[1].products.length > 0) {
            setComparisonProductB(result.epochs[1].products[0]);
          }
        }
      }
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : "ERR_SIA2: IRSA discovery pipeline failure");
    } finally {
      setIsTimelineLoading(false);
    }
  }, [ra, dec, radius, collection, selectedBandFilter, startDate, endDate]);

  // Generate Cutout for Selected Product (Image Explorer)
  const handleFetchCutout = useCallback(
    async (product: TimelineProduct) => {
      const obsId = product.observation_id;
      if (!obsId) return;
      const raNum = parseFloat(ra);
      const decNum = parseFloat(dec);
      const sizeNum = parseFloat(cutoutSize) || 0.1;

      try {
        setIsCutoutLoading(true);
        setCutoutError(null);
        const res = await operationMonitor.executeOperation(
          {
            name: "SPHEREx FITS Cutout Extraction",
            category: "explorer",
            workspace: "explorer",
            context: {
              observationId: obsId,
              ra: raNum,
              dec: decNum,
              radius: sizeNum,
              label: `Band: ${product.band || "Unknown"}`,
            },
            dedupKey: `cutout:${obsId}:${sizeNum}`,
          },
          () =>
            createCutout(obsId, {
              ra: raNum,
              dec: decNum,
              size: sizeNum,
            })
        );
        setCutoutData(res);
      } catch (err) {
        setCutoutError(err instanceof Error ? err.message : "ERR_IBE: Cutout extraction failed");
      } finally {
        setIsCutoutLoading(false);
      }
    },
    [ra, dec, cutoutSize]
  );

  // Inspect FITS for Selected Product (Image Explorer)
  const handleInspectFITS = useCallback(
    async (product: TimelineProduct) => {
      const obsId = product.observation_id;
      if (!obsId) return;
      const raNum = parseFloat(ra);
      const decNum = parseFloat(dec);
      const sizeNum = parseFloat(cutoutSize) || 0.1;

      try {
        setIsInspectLoading(true);
        setInspectError(null);
        const res = await operationMonitor.executeOperation(
          {
            name: "FITS Header & WCS Astrometry Inspection",
            category: "explorer",
            workspace: "explorer",
            context: {
              observationId: obsId,
              ra: raNum,
              dec: decNum,
              radius: sizeNum,
            },
            dedupKey: `inspect:${obsId}`,
          },
          () =>
            inspectImage({
              observation_id: obsId,
              ra: raNum,
              dec: decNum,
              size: sizeNum,
            })
        );
        setInspectData(res);
      } catch (err) {
        setInspectError(err instanceof Error ? err.message : "ERR_HDU: FITS header inspection failed");
      } finally {
        setIsInspectLoading(false);
      }
    },
    [ra, dec, cutoutSize]
  );

  // Run Differential Comparison (Differential Analysis)
  const handleRunComparison = useCallback(async () => {
    const obsIdA = comparisonProductA?.observation_id;
    const obsIdB = comparisonProductB?.observation_id;
    if (!obsIdA || !obsIdB) {
      setComparisonError("ERR_DIFF: Two distinct observation epochs required for differential comparison.");
      return;
    }

    const labelA = comparisonProductA?.observation_time || comparisonProductA?.start_time || "Ref";
    const labelB = comparisonProductB?.observation_time || comparisonProductB?.start_time || "Target";

    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const sizeNum = parseFloat(cutoutSize) || 0.1;

    try {
      setIsComparing(true);
      setComparisonError(null);
      const res = await operationMonitor.executeOperation(
        {
          name: "Differential Reprojection & Subtraction",
          category: "differential",
          workspace: "differential",
          context: {
            observationId: `${obsIdA} / ${obsIdB}`,
            ra: raNum,
            dec: decNum,
            radius: sizeNum,
            label: `${labelA} vs ${labelB}`,
          },
          dedupKey: `diff:${obsIdA}:${obsIdB}`,
        },
        () =>
          compareImages({
            observation_id_a: obsIdA,
            observation_id_b: obsIdB,
            ra: raNum,
            dec: decNum,
            size: sizeNum,
          })
      );
      setComparisonResult(res);
    } catch (err) {
      setComparisonError(err instanceof Error ? err.message : "ERR_DIFF: Image reprojection/subtraction failed");
    } finally {
      setIsComparing(false);
    }
  }, [comparisonProductA, comparisonProductB, ra, dec, cutoutSize]);

  // Run Time-Domain Extraction (Time-Domain Analysis)
  const handleExtractLightCurve = useCallback(
    async (maxObs: number, thresholdSigma: number, band: string) => {
      const raNum = parseFloat(ra);
      const decNum = parseFloat(dec);
      const radiusNum = parseFloat(radius) || 0.05;
      const cutoutNum = parseFloat(cutoutSize) || 0.1;

      try {
        setIsLightCurveLoading(true);
        setLightCurveError(null);
        const res = await operationMonitor.executeOperation(
          {
            name: "Time-Domain Aperture Photometry Light Curve",
            category: "timedomain",
            workspace: "timedomain",
            context: {
              ra: raNum,
              dec: decNum,
              radius: radiusNum,
              label: `Max Obs: ${maxObs}, Band: ${band}`,
            },
            dedupKey: `lightcurve:${raNum.toFixed(4)}:${decNum.toFixed(4)}:${band}:${maxObs}`,
          },
          () =>
            getTargetLightCurve({
              ra: raNum,
              dec: decNum,
              radius_deg: radiusNum,
              cutout_size_deg: cutoutNum,
              max_observations: maxObs,
              bands: band === "ALL" ? undefined : [band],
              detection: {
                threshold_sigma: thresholdSigma,
              },
            })
        );
        setLightCurveData(res);
        if (res.sources && res.sources.length > 0) {
          setSelectedSourceId(res.sources[0].source_id);
        }
      } catch (err) {
        setLightCurveError(err instanceof Error ? err.message : "Time-domain extraction failed");
      } finally {
        setIsLightCurveLoading(false);
      }
    },
    [ra, dec, radius, cutoutSize]
  );

  // Spectral Extraction Handler (Phase 4)
  const handleExtractSpectrum = useCallback(
    async (
      targetSourceId?: string,
      customRa?: number,
      customDec?: number,
      method: "bilinear" | "nearest" = "bilinear"
    ) => {
      const raNum = customRa ?? parseFloat(ra);
      const decNum = customDec ?? parseFloat(dec);

      if (isNaN(raNum) || isNaN(decNum)) {
        setSpectrumError("Target coordinates must be valid floating point values.");
        return;
      }

      try {
        setIsSpectrumLoading(true);
        setSpectrumError(null);

        const payload: SpectralExtractionRequest = {
          config: { spatial_method: method },
        };
        if (targetSourceId) {
          payload.source_id = targetSourceId;
        } else {
          payload.ra = raNum;
          payload.dec = decNum;
        }

        const res = await operationMonitor.executeOperation(
          {
            name: targetSourceId
              ? `Spectral Extraction (${targetSourceId})`
              : "Spectral Extraction (Coordinate)",
            category: "timedomain",
            workspace: "timedomain",
            context: {
              sourceId: targetSourceId,
              ra: raNum,
              dec: decNum,
              label: `Method: ${method}`,
            },
            dedupKey: targetSourceId
              ? `spectrum:source:${targetSourceId}`
              : `spectrum:coord:${raNum.toFixed(4)}:${decNum.toFixed(4)}`,
          },
          () => extractSpectrum(payload)
        );
        setSpectrumData(res);
      } catch (err) {
        setSpectrumError(err instanceof Error ? err.message : "Spectral cube extraction failed");
      } finally {
        setIsSpectrumLoading(false);
      }
    },
    [ra, dec]
  );

  // Spectral Comparison Handler (Phase 4)
  const handleCompareSpectra = useCallback(
    async (spectrumIdA: string, spectrumIdB: string) => {
      try {
        setIsSpectralComparing(true);
        setSpectralComparisonError(null);

        const res = await operationMonitor.executeOperation(
          {
            name: "Cross-Epoch Spectral Comparison",
            category: "timedomain",
            workspace: "timedomain",
            context: {
              spectrumId: `${spectrumIdA} vs ${spectrumIdB}`,
              label: "Residual & Correlation Analysis",
            },
            dedupKey: `spec-comp:${spectrumIdA}:${spectrumIdB}`,
          },
          () =>
            compareSpectra({
              spectrum_id_a: spectrumIdA,
              spectrum_id_b: spectrumIdB,
            })
        );
        setSpectralComparison(res);
      } catch (err) {
        setSpectralComparisonError(err instanceof Error ? err.message : "Spectral comparison failed");
      } finally {
        setIsSpectralComparing(false);
      }
    },
    []
  );

  // Gaia DR3 Cone Search (Phase 5)
  const handleSearchGaia = useCallback(
    async (customRadiusArcsec?: number, customMagLimit?: number, customLimit?: number) => {
      const raNum = parseFloat(ra);
      const decNum = parseFloat(dec);
      if (isNaN(raNum) || isNaN(decNum)) {
        setGaiaSearchError("Invalid celestial coordinates");
        return;
      }
      try {
        setIsGaiaSearching(true);
        setGaiaSearchError(null);
        const res = await operationMonitor.executeOperation(
          {
            name: "Gaia DR3 Cone Search",
            category: "timedomain",
            workspace: "timedomain",
            context: {
              ra: raNum,
              dec: decNum,
              radius: customRadiusArcsec || 10,
              label: `Mag Limit: ${customMagLimit ?? "none"}, Max: ${customLimit || 50}`,
            },
            dedupKey: `gaia-cone:${raNum.toFixed(4)}:${decNum.toFixed(4)}:${customRadiusArcsec || 10}`,
          },
          () =>
            searchGaia({
              ra: raNum,
              dec: decNum,
              radius_arcsec: customRadiusArcsec || 10,
              magnitude_limit: customMagLimit,
              limit: customLimit || 50,
            })
        );
        setGaiaConeSearchResult(res);
      } catch (err) {
        setGaiaSearchError(err instanceof Error ? err.message : "Gaia cone search failed");
      } finally {
        setIsGaiaSearching(false);
      }
    },
    [ra, dec]
  );

  // Source Gaia DR3 Association (Phase 5)
  const handleAssociateGaia = useCallback(
    async (sourceId: string) => {
      try {
        setIsGaiaAssociating(true);
        setSourceGaiaError(null);
        const res = await operationMonitor.executeOperation(
          {
            name: `Gaia DR3 Source Cross-Match (${sourceId})`,
            category: "timedomain",
            workspace: "timedomain",
            context: {
              sourceId,
              label: "Cross-catalogue counterpart identification",
            },
            dedupKey: `gaia-assoc:${sourceId}`,
          },
          () => getSourceGaiaAssociation(sourceId)
        );
        setSourceGaiaAssociation(res);
      } catch (err) {
        setSourceGaiaError(err instanceof Error ? err.message : "Gaia source association failed");
      } finally {
        setIsGaiaAssociating(false);
      }
    },
    []
  );

  // Flattened array of all discovered products
  const availableProducts: TimelineProduct[] =
    timelineData?.epochs.flatMap((epoch) => epoch.products) ?? [];

  return (
    <div className="relative h-screen w-full bg-black text-neutral-200 overflow-y-auto font-mono antialiased">
      {/* MISSION CONTROL HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-black">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
          {/* Left: Back & Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={onReturnToLanding}
              className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 text-xs uppercase font-bold cursor-pointer"
            >
              BACK
            </button>

            <div className="flex flex-col">
              <span className="text-sm sm:text-base font-bold tracking-widest text-white uppercase">
                ASTROCHRONOSCOPE
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                SPHEREx OPERATIONS · NASA/IPAC IRSA · {health?.version ? `v${health.version}` : "v0.1.0"}
              </span>
            </div>
          </div>

          {/* Right: Telemetry & Mission Clock */}
          <div className="flex items-center gap-2 text-xs">
            {runningCount > 0 && (
              <div className="bg-blue-600/90 border border-blue-500 px-2.5 py-1 text-white font-bold text-xs uppercase flex items-center gap-1.5 animate-pulse">
                <span>{runningCount} OP{runningCount > 1 ? "S" : ""} ACTIVE</span>
              </div>
            )}

            <div
              className={`px-3 py-1 font-bold text-xs uppercase border ${healthStatus === "online"
                  ? "bg-emerald-600/90 text-white border-emerald-500"
                  : healthStatus === "connecting"
                    ? "bg-amber-600/90 text-white border-amber-500"
                    : "bg-red-600/90 text-white border-red-500"
                }`}
            >
              {healthStatus === "online" ? "SYSTEM ONLINE" : healthStatus === "connecting" ? "CONNECTING" : "OFFLINE"}
            </div>

            <div className="hidden md:flex items-center gap-2">
              <div className="bg-neutral-900 border border-neutral-800 px-2.5 py-1 text-neutral-300 text-[11px]">
                UTC {currentTimeUtc}
              </div>
              <div className="bg-neutral-900 border border-neutral-800 px-2.5 py-1 text-amber-300 text-[11px]">
                MJD {currentMjd}
              </div>
            </div>

            <button
              onClick={handleRefreshHealth}
              disabled={healthStatus === "connecting"}
              className="p-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white text-xs cursor-pointer"
              title="Refresh connection"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      {/* MISSION WORKSPACE TABS */}
      <nav className="sticky top-14 z-30 w-full bg-black border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-1.5">
            <button
              onClick={() => setActiveNavTab("discovery")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer border whitespace-nowrap ${activeNavTab === "discovery"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-neutral-950 text-neutral-400 hover:text-white border-neutral-900 hover:bg-neutral-900"
                }`}
            >
              Discovery
            </button>

            <button
              onClick={() => {
                setActiveNavTab("explorer");
                if (selectedProduct && !cutoutData && !isCutoutLoading) {
                  void handleFetchCutout(selectedProduct);
                  void handleInspectFITS(selectedProduct);
                }
              }}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer border whitespace-nowrap ${activeNavTab === "explorer"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-neutral-950 text-neutral-400 hover:text-white border-neutral-900 hover:bg-neutral-900"
                }`}
            >
              Image Explorer
            </button>

            <button
              onClick={() => setActiveNavTab("differential")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer border whitespace-nowrap ${activeNavTab === "differential"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-neutral-950 text-neutral-400 hover:text-white border-neutral-900 hover:bg-neutral-900"
                }`}
            >
              Differential Analysis
            </button>

            <button
              onClick={() => setActiveNavTab("timedomain")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer border whitespace-nowrap ${activeNavTab === "timedomain"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-neutral-950 text-neutral-400 hover:text-white border-neutral-900 hover:bg-neutral-900"
                }`}
            >
              Time-Domain Analysis
            </button>

            <button
              onClick={() => setActiveNavTab("reports")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer border whitespace-nowrap ${activeNavTab === "reports"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-neutral-950 text-neutral-400 hover:text-white border-neutral-900 hover:bg-neutral-900"
                }`}
            >
              Scientific Reports
            </button>

            <button
              onClick={() => setActiveNavTab("jobs")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer border whitespace-nowrap flex items-center gap-1.5 ${activeNavTab === "jobs"
                  ? "bg-neutral-800 text-amber-300 border-neutral-600"
                  : "bg-neutral-950 text-neutral-400 hover:text-white border-neutral-900 hover:bg-neutral-900"
                }`}
            >
              <span>Job Monitor</span>
              {runningCount > 0 && (
                <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-bold animate-pulse">
                  {runningCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* =========================================================================
          MISSION WORKSPACE BODY
         ========================================================================= */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 flex flex-col gap-6">
        {/* Backend Offline Banner */}
        {healthStatus === "offline" && (
          <div className="rounded border border-rose-500/60 bg-rose-950/30 p-3.5 text-xs text-rose-300 flex items-center justify-between gap-4 font-mono">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-rose-400 font-bold">CRITICAL: TELEMETRY DISCONNECTED</span>
                <span>SPHEREx daemon unreachable on <code className="text-white underline">http://127.0.0.1:8000</code></span>
              </div>
              {healthError && <span className="text-[10px] text-rose-400/90 pl-4">Exception: {healthError}</span>}
            </div>
            <button
              onClick={handleRefreshHealth}
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 rounded text-[10px] text-white uppercase tracking-widest cursor-pointer"
            >
              RE-ESTABLISH LINK
            </button>
          </div>
        )}

        {/* WORKSPACE 1: DISCOVERY */}
        {activeNavTab === "discovery" && (
          <DiscoveryTab
            ra={ra}
            dec={dec}
            radius={radius}
            cutoutSize={cutoutSize}
            collection={collection}
            selectedBandFilter={selectedBandFilter}
            startDate={startDate}
            endDate={endDate}
            timelineData={timelineData}
            isLoading={isTimelineLoading}
            error={timelineError}
            selectedProduct={selectedProduct}
            comparisonProductA={comparisonProductA}
            comparisonProductB={comparisonProductB}
            selectedBenchmarkId={selectedBenchmarkId}
            isCustomizedCoords={isCustomizedCoords}
            usePropagatedEpoch={usePropagatedEpoch}
            onSelectBenchmark={handleSelectBenchmark}
            onClearBenchmark={handleClearBenchmark}
            onTogglePropagateEpoch={handleTogglePropagateEpoch}
            onUpdateCoords={handleUpdateCoords}
            onUpdateFilters={(newColl, newBand, newStart, newEnd) => {
              setCollection(newColl);
              setSelectedBandFilter(newBand);
              setStartDate(newStart);
              setEndDate(newEnd);
            }}
            onSearch={handleDiscoverySearch}
            onLoadBenchmark={handleLoadBenchmark}
            onSelectProduct={(p) => {
              setSelectedProduct(p);
              void handleFetchCutout(p);
              void handleInspectFITS(p);
            }}
            onSetComparisonProductA={(p) => setComparisonProductA(p)}
            onSetComparisonProductB={(p) => setComparisonProductB(p)}
            onNavigateTab={(tab) => setActiveNavTab(tab)}
          />
        )}

        {/* WORKSPACE 2: IMAGE EXPLORER */}
        {activeNavTab === "explorer" && (
          <ImageExplorerTab
            ra={ra}
            dec={dec}
            cutoutSize={cutoutSize}
            selectedProduct={selectedProduct}
            availableProducts={availableProducts}
            cutoutData={cutoutData}
            inspectData={inspectData}
            isLoadingCutout={isCutoutLoading}
            isLoadingInspect={isInspectLoading}
            cutoutError={cutoutError}
            inspectError={inspectError}
            onSelectProduct={(p) => setSelectedProduct(p)}
            onFetchCutout={(p) => void handleFetchCutout(p)}
            onInspectFITS={(p) => void handleInspectFITS(p)}
            onNavigateTab={(tab) => setActiveNavTab(tab)}
          />
        )}

        {/* WORKSPACE 3: DIFFERENTIAL ANALYSIS */}
        {activeNavTab === "differential" && (
          <DifferentialAnalysisTab
            ra={ra}
            dec={dec}
            cutoutSize={cutoutSize}
            epochA={comparisonProductA}
            epochB={comparisonProductB}
            availableProducts={availableProducts}
            comparisonResult={comparisonResult}
            isComparing={isComparing}
            error={comparisonError}
            onSelectEpochA={(p) => setComparisonProductA(p)}
            onSelectEpochB={(p) => setComparisonProductB(p)}
            onRunComparison={handleRunComparison}
            onNavigateTab={(tab) => setActiveNavTab(tab)}
          />
        )}

        {/* WORKSPACE 4: TIME-DOMAIN ANALYSIS */}
        {activeNavTab === "timedomain" && (
          <TimeDomainAnalysisTab
            ra={ra}
            dec={dec}
            radius={radius}
            cutoutSize={cutoutSize}
            lightCurveData={lightCurveData}
            isLoading={isLightCurveLoading}
            error={lightCurveError}
            selectedSourceId={selectedSourceId}
            spectrumData={spectrumData}
            isExtractingSpectrum={isSpectrumLoading}
            spectrumError={spectrumError}
            spectralComparison={spectralComparison}
            isSpectralComparing={isSpectralComparing}
            spectralComparisonError={spectralComparisonError}
            sourceGaiaAssociation={sourceGaiaAssociation}
            isGaiaAssociating={isGaiaAssociating}
            sourceGaiaError={sourceGaiaError}
            gaiaConeSearchResult={gaiaConeSearchResult}
            isGaiaSearching={isGaiaSearching}
            gaiaSearchError={gaiaSearchError}
            onExtractLightCurve={(maxObs, thresholdSigma, band) => {
              void handleExtractLightCurve(maxObs, thresholdSigma, band);
            }}
            onSelectSourceId={(sId) => setSelectedSourceId(sId)}
            onExtractSpectrum={(sourceId, customRa, customDec, method) => {
              void handleExtractSpectrum(sourceId, customRa, customDec, method);
            }}
            onCompareSpectra={(specIdA, specIdB) => {
              void handleCompareSpectra(specIdA, specIdB);
            }}
            onSearchGaia={handleSearchGaia}
            onAssociateGaia={handleAssociateGaia}
            onNavigateTab={(tab) => setActiveNavTab(tab)}
          />
        )}

        {/* WORKSPACE 5: SCIENTIFIC REPORTS */}
        {activeNavTab === "reports" && (
          <ScientificReportsTab
            ra={ra}
            dec={dec}
            radius={radius}
            collection={collection}
            timelineData={timelineData}
            selectedProduct={selectedProduct}
            cutoutData={cutoutData}
            inspectData={inspectData}
            epochA={comparisonProductA}
            epochB={comparisonProductB}
            comparisonResult={comparisonResult}
            lightCurveData={lightCurveData}
            selectedSourceId={selectedSourceId}
            spectrumData={spectrumData}
            spectralComparison={spectralComparison}
            sourceGaiaAssociation={sourceGaiaAssociation}
            gaiaConeSearchResult={gaiaConeSearchResult}
            selectedBenchmarkId={selectedBenchmarkId}
            onNavigateTab={(tab) => setActiveNavTab(tab)}
          />
        )}

        {/* WORKSPACE 6: OBSERVATORY JOB MONITOR */}
        {activeNavTab === "jobs" && <JobMonitor />}
      </main>
    </div>
  );
}
