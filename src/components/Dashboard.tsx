import { useState, useEffect, useCallback } from "react";
import {
  getBackendHealth,
  getTargetTimeline,
  createCutout,
  inspectImage,
  compareImages,
  getTargetLightCurve,
  type BackendHealthResponse,
  type TimelineResponse,
  type TimelineProduct,
  type CutoutResponse,
  type ComparisonResponse,
  type InspectResponse,
  type TargetLightCurveResponse,
} from "@/lib/api";

import DiscoveryTab from "./tabs/DiscoveryTab";
import ImageExplorerTab from "./tabs/ImageExplorerTab";
import DifferentialAnalysisTab from "./tabs/DifferentialAnalysisTab";
import TimeDomainAnalysisTab from "./tabs/TimeDomainAnalysisTab";
import ScientificReportsTab from "./tabs/ScientificReportsTab";

interface DashboardProps {
  onReturnToLanding: () => void;
}

// Benchmark preset for Planet X candidate search
const BENCHMARK_TARGET = {
  name: "Planet X Benchmark Candidate",
  ra: 156.09328159,
  dec: -41.64466331,
  radius: 0.01,
  size: 0.1,
  frame: "ICRS (J2000)",
  collection: "spherex_qr3",
};

export type ActiveNavTab = "discovery" | "explorer" | "differential" | "timedomain" | "reports";

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

  // Target Query Parameters
  const [ra, setRa] = useState<string>(BENCHMARK_TARGET.ra.toString());
  const [dec, setDec] = useState<string>(BENCHMARK_TARGET.dec.toString());
  const [radius, setRadius] = useState<string>(BENCHMARK_TARGET.radius.toString());
  const [cutoutSize, setCutoutSize] = useState<string>(BENCHMARK_TARGET.size.toString());
  const [collection, setCollection] = useState<string>(BENCHMARK_TARGET.collection);
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
      const res = await getBackendHealth();
      setHealth(res);
      setHealthStatus("online");
    } catch (err: unknown) {
      setHealthStatus("offline");
      setHealthError(err instanceof Error ? err.message : "Failed to connect to backend");
    }
  };

  // Load Benchmark Preset
  const handleLoadBenchmark = () => {
    setRa(BENCHMARK_TARGET.ra.toString());
    setDec(BENCHMARK_TARGET.dec.toString());
    setRadius(BENCHMARK_TARGET.radius.toString());
    setCutoutSize(BENCHMARK_TARGET.size.toString());
    setCollection(BENCHMARK_TARGET.collection);
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
      const result = await getTargetTimeline({
        ra: raNum,
        dec: decNum,
        radius: radiusNum,
        collection: collection || undefined,
        bands: selectedBandFilter === "ALL" ? undefined : [selectedBandFilter],
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });

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
      if (!product.observation_id) return;
      const raNum = parseFloat(ra);
      const decNum = parseFloat(dec);
      const sizeNum = parseFloat(cutoutSize) || 0.1;

      try {
        setIsCutoutLoading(true);
        setCutoutError(null);
        const res = await createCutout(product.observation_id, {
          ra: raNum,
          dec: decNum,
          size: sizeNum,
        });
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
      if (!product.observation_id) return;
      const raNum = parseFloat(ra);
      const decNum = parseFloat(dec);
      const sizeNum = parseFloat(cutoutSize) || 0.1;

      try {
        setIsInspectLoading(true);
        setInspectError(null);
        const res = await inspectImage({
          observation_id: product.observation_id,
          ra: raNum,
          dec: decNum,
          size: sizeNum,
        });
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
    if (!comparisonProductA?.observation_id || !comparisonProductB?.observation_id) {
      setComparisonError("ERR_DIFF: Two distinct observation epochs required for differential comparison.");
      return;
    }

    const raNum = parseFloat(ra);
    const decNum = parseFloat(dec);
    const sizeNum = parseFloat(cutoutSize) || 0.1;

    try {
      setIsComparing(true);
      setComparisonError(null);
      const res = await compareImages({
        observation_id_a: comparisonProductA.observation_id,
        observation_id_b: comparisonProductB.observation_id,
        ra: raNum,
        dec: decNum,
        size: sizeNum,
      });
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
        const res = await getTargetLightCurve({
          ra: raNum,
          dec: decNum,
          radius_deg: radiusNum,
          cutout_size_deg: cutoutNum,
          max_observations: maxObs,
          bands: band === "ALL" ? undefined : [band],
          detection: {
            threshold_sigma: thresholdSigma,
          },
        });
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

  // Flattened array of all discovered products
  const availableProducts: TimelineProduct[] =
    timelineData?.epochs.flatMap((epoch) => epoch.products) ?? [];

  return (
    <div className="relative h-screen w-full bg-black text-neutral-200 overflow-y-auto selection:bg-amber-400/30 selection:text-white font-mono antialiased">
      {/* =========================================================================
          MISSION CONTROL TOP FLIGHT DECK (HEADER)
         ========================================================================= */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-black/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left: Back Navigation & Mission Brand */}
          <div className="flex items-center gap-3 sm:gap-6">
            <button
              onClick={onReturnToLanding}
              className="group inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 hover:border-amber-400/60 px-3 py-1.5 text-[11px] font-mono tracking-wider uppercase text-neutral-300 hover:text-white transition-all cursor-pointer active:scale-95"
              title="Return to Spacecraft Landing View"
            >
              <span className="text-amber-400 opacity-70 group-hover:-translate-x-0.5 transition-transform">◀</span>
              <span>BACK</span>
            </button>

            <div className="flex flex-col">
              <span
                className="text-base sm:text-lg font-bold tracking-[0.2em] text-white font-bodoni uppercase"
                style={{ fontFamily: "'OPTIBodoni-Antiqua', serif" }}
              >
                ASTROCHRONOSCOPE
              </span>
              <div className="flex items-center gap-2 text-[10px] tracking-wider text-neutral-400">
                <span className="text-amber-400/90 font-semibold">MISSION: SPHEREx</span>
                <span className="text-neutral-600">|</span>
                <span className="text-neutral-400">NASA/IPAC IRSA SIA2</span>
              </div>
            </div>
          </div>

          {/* Center: Live UTC Mission Clock & MJD */}
          <div className="hidden lg:flex items-center gap-4 rounded border border-neutral-800 bg-[#07080a] px-3.5 py-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-neutral-500 uppercase text-[10px]">UTC:</span>
              <span className="text-white font-bold tabular-nums">{currentTimeUtc}</span>
            </div>
            <span className="text-neutral-700">|</span>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 uppercase text-[10px]">MJD:</span>
              <span className="text-amber-400 font-bold tabular-nums">{currentMjd}</span>
            </div>
          </div>

          {/* Right: Telemetry Status */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 rounded border border-neutral-800 bg-[#07080a] px-3 py-1 text-xs">
              <span className="relative flex h-2 w-2">
                {healthStatus === "online" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    healthStatus === "online"
                      ? "bg-emerald-400"
                      : healthStatus === "connecting"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                  }`}
                />
              </span>
              <div className="flex flex-col text-right">
                <span className="text-[9px] text-neutral-500 uppercase tracking-widest leading-none">
                  {healthStatus === "online" ? "SYS_NOMINAL" : healthStatus === "connecting" ? "ACQUIRING..." : "LINK_OFFLINE"}
                </span>
                <span className="text-[11px] text-white font-bold tracking-wider leading-tight">
                  {health ? `${health.default_collection} v${health.version}` : "127.0.0.1:8000"}
                </span>
              </div>
            </div>

            <button
              onClick={handleRefreshHealth}
              disabled={healthStatus === "connecting"}
              className="p-1.5 rounded border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 hover:border-neutral-600 text-neutral-400 hover:text-white transition-all cursor-pointer text-xs disabled:opacity-50"
              title="Ping Telemetry Stream"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          FIVE PRIMARY WORKSPACES TOP NAVIGATION BAR
          (Discovery | Image Explorer | Differential Analysis | Time-Domain Analysis | Scientific Reports)
         ========================================================================= */}
      <nav className="sticky top-16 z-30 w-full bg-[#0a2744] border-b border-[#143d66] shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-12 flex items-center text-sm font-sans sm:text-base">
          <div className="flex items-center overflow-x-auto">
            {/* Tab 1: Discovery */}
            <button
              onClick={() => setActiveNavTab("discovery")}
              className={`px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeNavTab === "discovery"
                  ? "text-sky-300 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                  : "text-[#3896e6] hover:text-sky-200"
              }`}
            >
              Discovery
            </button>

            <span className="text-[#1d4d7a] mx-2 sm:mx-3 select-none">|</span>

            {/* Tab 2: Image Explorer */}
            <button
              onClick={() => {
                setActiveNavTab("explorer");
                if (selectedProduct && !cutoutData && !isCutoutLoading) {
                  void handleFetchCutout(selectedProduct);
                  void handleInspectFITS(selectedProduct);
                }
              }}
              className={`px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeNavTab === "explorer"
                  ? "text-sky-300 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                  : "text-[#3896e6] hover:text-sky-200"
              }`}
            >
              Image Explorer
            </button>

            <span className="text-[#1d4d7a] mx-2 sm:mx-3 select-none">|</span>

            {/* Tab 3: Differential Analysis */}
            <button
              onClick={() => setActiveNavTab("differential")}
              className={`px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeNavTab === "differential"
                  ? "text-sky-300 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                  : "text-[#3896e6] hover:text-sky-200"
              }`}
            >
              Differential Analysis
            </button>

            <span className="text-[#1d4d7a] mx-2 sm:mx-3 select-none">|</span>

            {/* Tab 4: Time-Domain Analysis */}
            <button
              onClick={() => setActiveNavTab("timedomain")}
              className={`px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeNavTab === "timedomain"
                  ? "text-sky-300 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                  : "text-[#3896e6] hover:text-sky-200"
              }`}
            >
              Time-Domain Analysis
            </button>

            <span className="text-[#1d4d7a] mx-2 sm:mx-3 select-none">|</span>

            {/* Tab 5: Scientific Reports */}
            <button
              onClick={() => setActiveNavTab("reports")}
              className={`px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeNavTab === "reports"
                  ? "text-sky-300 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                  : "text-[#3896e6] hover:text-sky-200"
              }`}
            >
              Scientific Reports
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
            onUpdateCoords={(newRa, newDec, newRadius, newCutoutSize) => {
              setRa(newRa);
              setDec(newDec);
              setRadius(newRadius);
              setCutoutSize(newCutoutSize);
            }}
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
            onExtractLightCurve={(maxObs, thresholdSigma, band) => {
              void handleExtractLightCurve(maxObs, thresholdSigma, band);
            }}
            onSelectSourceId={(sId) => setSelectedSourceId(sId)}
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
            onNavigateTab={(tab) => setActiveNavTab(tab)}
          />
        )}
      </main>
    </div>
  );
}
