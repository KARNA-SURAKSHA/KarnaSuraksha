import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Pause,
  Play,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import spreadApi from "../../api/spreadApi";
import Karnataka3DMap from "./Karnataka3DMap";
import SpreadCharts from "./SpreadCharts";
import SpreadCasesTable from "./SpreadCasesTable";

// The deck.gl map is expensive -- never re-render it for table/control changes.
const MemoMap = memo(Karnataka3DMap);

const RISK_STYLES = {
  Critical: "bg-[#FDE8E8] text-[#B42318]",
  High: "bg-[#FFEDE0] text-[#C4320A]",
  Moderate: "bg-[#FEF6DC] text-[#A15C07]",
  Low: "bg-[#E9F9EF] text-[#16803C]",
};

function weekLabel(weekNumber) {
  if (!weekNumber) return "—";
  return `Week ${weekNumber % 100}, ${Math.floor(weekNumber / 100)}`;
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-[14px] border border-[#E7E2D8] bg-white px-4 py-3">
      <div className="text-[12px] font-medium text-[#667085]">{label}</div>
      <div className="mt-1 text-[24px] font-bold text-[#13264B]">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-[#98A2B3]">{hint}</div>
      ) : null}
    </div>
  );
}

const norm = (v) => String(v || "").trim().toLowerCase();

/**
 * Optional two-way sync props (all optional, so existing usage is unchanged):
 *   district          restrict data to one district (name)       host -> map
 *   selectedDistrict  district to focus/highlight on the map      host -> map
 *   highlightTaluk    taluk name to highlight in the list         host -> map
 *   disease           disease to show (if it has data)            host -> map
 *   onDistrictSelect  (name) when a district is clicked on map    map  -> host
 *   onTalukSelect     (name) when a taluk is clicked (map/list)   map  -> host
 *   onDiseaseChange   (name) when the disease tab changes         map  -> host
 */
export default function SpreadMapPanel({
  height = 620,
  district = "",
  selectedDistrict = "",
  highlightTaluk = "",
  disease: hostDisease = "",
  onDistrictSelect,
  onTalukSelect,
  onDiseaseChange,
}) {
  const [diseases, setDiseases] = useState([]);
  const [pickedDisease, setPickedDisease] = useState("");
  const [mode, setMode] = useState("current");
  const [weeks, setWeeks] = useState(2);
  const [forecastDay, setForecastDay] = useState(1);
  const [playing, setPlaying] = useState(false);

  const [latest, setLatest] = useState({ data: [], week_number: null });
  const [forecast, setForecast] = useState({ data: [], start_week: null });
  const [meta, setMeta] = useState(null);

  const disease =
    hostDisease && diseases.includes(hostDisease) ? hostDisease : pickedDisease;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const requestId = useRef(0);

  // The district shown on the map. A click on the map overrides the host's
  // value only until the host changes its own selection/filter again.
  const hostDistrict = selectedDistrict || district || "";
  const [pick, setPick] = useState({ name: "", base: "" });
  const mapDistrict = pick.name && pick.base === hostDistrict ? pick.name : hostDistrict;
  const [pickedTaluk, setPickedTaluk] = useState("");

  // map -> host
  const handleDistrictSelect = useCallback(
    (name) => {
      setPick({ name: name || "", base: hostDistrict });
      setPickedTaluk("");
      if (onDistrictSelect) onDistrictSelect(name || "");
    },
    [hostDistrict, onDistrictSelect]
  );

  const handleTalukSelect = useCallback(
    (name) => {
      setPickedTaluk(name || "");
      if (onTalukSelect) onTalukSelect(name || "");
    },
    [onTalukSelect]
  );

  const handleDisease = useCallback(
    (d) => {
      setPickedDisease(d);
      if (onDiseaseChange) onDiseaseChange(d);
    },
    [onDiseaseChange]
  );

  /* ---------------- disease list + meta (once, and on retry) ---------------- */
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setError("");
        setLoading(true);

        const [list, info] = await Promise.all([
          spreadApi.diseases(controller.signal),
          spreadApi.meta(controller.signal),
        ]);

        setDiseases(list);
        setMeta(info);
        setPickedDisease((prev) => (prev && list.includes(prev) ? prev : list[0] || ""));

        if (!list.length) setLoading(false);
      } catch (err) {
        if (err?.name === "AbortError") return;
        setError(err.message || "Unable to load spread map data.");
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadKey]);

  /* ---------------- data for the selected disease ---------------- */
  useEffect(() => {
    if (!disease) return undefined;

    const controller = new AbortController();
    const myId = ++requestId.current;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const [cur, fc] = await Promise.all([
          spreadApi.latest(disease, controller.signal, district),
          spreadApi.forecast(disease, weeks, controller.signal, district),
        ]);

        // ignore out-of-order responses (fast disease switching)
        if (myId !== requestId.current) return;

        setLatest(cur);
        setForecast(fc);
        setForecastDay((d) => Math.min(d, weeks));
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (myId !== requestId.current) return;
        setError(err.message || "Unable to load spread map data.");
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [disease, weeks, district, reloadKey]);

  /* ---------------- play / pause the forecast animation ---------------- */
  useEffect(() => {
    if (!playing || mode !== "forecast") return undefined;

    const timer = setInterval(() => {
      setForecastDay((d) => {
        if (d >= weeks) {
          setPlaying(false);
          return d;
        }
        return d + 1;
      });
    }, 1400);

    return () => clearInterval(timer);
  }, [playing, mode, weeks]);

  const handleMode = useCallback((next) => {
    setMode(next);
    if (next !== "forecast") setPlaying(false);
  }, []);

  /* ---------------- derived values ---------------- */
  const forecastFrame = useMemo(
    () =>
      (forecast.data || []).filter(
        (r) => Number(r.forecast_day) === Number(forecastDay)
      ),
    [forecast, forecastDay]
  );

  const rows = useMemo(() => {
    if (mode === "forecast") {
      return forecastFrame
        .map((r) => ({
          key: r.location_id,
          name: r.location_name,
          district: r.district,
          value: r.predicted_cases,
          previous: r.previous_cases,
          risk: r.risk_level,
          confidence: r.confidence,
        }))
        .sort((a, b) => b.value - a.value);
    }

    return (latest.data || [])
      .map((r) => ({
        key: r.location_id,
        name: r.location_name,
        district: r.district,
        value: r.cases,
        previous: null,
        risk: r.risk_level,
        stale: r.is_stale,
      }))
      .sort((a, b) => b.value - a.value);
  }, [mode, forecastFrame, latest]);

  const totalCases = rows.reduce((sum, r) => sum + (r.value || 0), 0);
  const hotspots = rows.filter(
    (r) => r.risk === "High" || r.risk === "Critical"
  ).length;
  const staleCount = (latest.data || []).filter((r) => r.is_stale).length;

  const forecastDateLabel =
    forecastFrame[0]?.forecast_date || "";

  /* ---------------- empty / error states ---------------- */
  if (error && !latest.data.length && !forecast.data.length) {
    return (
      <div className="rounded-[18px] border border-[#F3C9C9] bg-[#FFF5F5] p-8 text-center">
        <AlertTriangle className="mx-auto mb-2 text-[#C62828]" size={28} />
        <p className="text-[15px] font-semibold text-[#8A1C1C]">
          Spread map is unavailable
        </p>
        <p className="mx-auto mt-1 max-w-[520px] text-[13px] text-[#8A1C1C]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#13264B] px-4 py-2 text-[13px] font-semibold text-white"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!loading && !diseases.length) {
    return (
      <div className="rounded-[18px] border border-[#E7E2D8] bg-white p-8 text-center">
        <Activity className="mx-auto mb-2 text-[#98A2B3]" size={28} />
        <p className="text-[15px] font-semibold text-[#13264B]">
          No surveillance reports yet
        </p>
        <p className="mx-auto mt-1 max-w-[520px] text-[13px] text-[#667085]">
          The spread map is built from the weekly reports submitted by field
          agents. It will appear as soon as the first report is submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ================= CONTROLS ================= */}
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[#E7E2D8] bg-white px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {diseases.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDisease(d)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                d === disease
                  ? "bg-[#13264B] text-white"
                  : "bg-[#F3F4F6] text-[#475467] hover:bg-[#E5E7EB]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full bg-[#F3F4F6] p-1">
            {["current", "forecast"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMode(m)}
                className={`rounded-full px-3.5 py-1 text-[13px] font-semibold capitalize transition ${
                  mode === m
                    ? "bg-white text-[#13264B] shadow-sm"
                    : "text-[#667085]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === "forecast" && (
            <>
              <label className="flex items-center gap-2 text-[13px] text-[#475467]">
                Horizon
                <select
                  value={weeks}
                  onChange={(e) => {
                    setPlaying(false);
                    setWeeks(Number(e.target.value));
                  }}
                  className="rounded-lg border border-[#D0D5DD] bg-white px-2 py-1 text-[13px]"
                >
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>
                      {w} week{w > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1">
                {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setForecastDay(w);
                    }}
                    className={`h-8 min-w-8 rounded-full px-2 text-[12px] font-semibold ${
                      w === forecastDay
                        ? "bg-[#16803C] text-white"
                        : "bg-[#F3F4F6] text-[#475467]"
                    }`}
                  >
                    +{w}w
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (!playing && forecastDay >= weeks) setForecastDay(1);
                    setPlaying((p) => !p);
                  }}
                  aria-label={playing ? "Pause forecast" : "Play forecast"}
                  className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#13264B] text-white"
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ================= SUMMARY ================= */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={mode === "forecast" ? "Predicted cases" : "Reported cases"}
          value={totalCases}
          hint={
            mode === "forecast"
              ? `${forecastDateLabel ? `Week of ${forecastDateLabel}` : ""}`
              : weekLabel(latest.week_number)
          }
        />
        <StatCard label="Taluks on map" value={rows.length} hint={meta ? `${meta.mapped_taluks} mapped overall` : ""} />
        <StatCard label="High / critical" value={hotspots} hint="Risk bands match the dashboard" />
        <StatCard
          label="Model"
          value={mode === "forecast" ? `+${forecastDay}w` : "Live"}
          hint={mode === "forecast" ? "Trend + neighbour spread" : "From agent reports"}
        />
      </div>

      {staleCount > 0 && mode === "current" && (
        <p className="rounded-lg border border-[#F2D98A] bg-[#FFF7E6] px-4 py-2 text-[13px] text-[#8A5A00]">
          {staleCount} taluk report{staleCount > 1 ? "s are" : " is"} older than the
          latest reporting week and may be out of date.
        </p>
      )}

      {meta?.unmapped_taluks?.length > 0 && (
        <p className="rounded-lg border border-[#E7E2D8] bg-[#F9FAFB] px-4 py-2 text-[12px] text-[#667085]">
          Not shown on the map (no coordinates yet): {meta.unmapped_taluks.join(", ")}.
        </p>
      )}

      {/* ================= MAP + TABLE ================= */}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div
          className="relative overflow-hidden rounded-[18px] border border-[#E7E2D8] bg-[#F8FAFC]"
          style={{ height }}
        >
          <MemoMap
            locations={latest.data || []}
            forecastData={forecast.data || []}
            selectedDistrict={mapDistrict}
            onDistrictSelect={handleDistrictSelect}
            onTalukSelect={handleTalukSelect}
            mode={mode}
            forecastDay={forecastDay}
          />

          {loading && (
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[12px] text-[#475467] shadow">
              <RefreshCw size={12} className="animate-spin" /> Updating…
            </div>
          )}
        </div>

        <aside className="rounded-[18px] border border-[#E7E2D8] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            {mode === "forecast" ? (
              <TrendingUp size={16} className="text-[#16803C]" />
            ) : (
              <CalendarDays size={16} className="text-[#13264B]" />
            )}
            <h3 className="text-[14px] font-bold text-[#13264B]">
              {mode === "forecast" ? `Forecast +${forecastDay} week` : "Latest reports"} · {disease}
            </h3>
          </div>

          <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
            {rows.map((r) => {
              const active =
                norm(r.name) === norm(pickedTaluk) ||
                (!pickedTaluk && highlightTaluk && norm(r.name) === norm(highlightTaluk));
              return (
              <div
                key={r.key}
                role="button"
                tabIndex={0}
                onClick={() => handleTalukSelect(r.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTalukSelect(r.name);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                  active
                    ? "border-[#16803C] bg-[#F1FBF4]"
                    : "border-[#EFE9DD] hover:bg-[#FAFAF7]"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[#13264B]">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-[#98A2B3]">
                    {r.district}
                    {mode === "forecast" && r.previous !== null
                      ? ` · was ${r.previous}`
                      : ""}
                    {r.stale ? " · stale" : ""}
                    {norm(r.name) === norm(highlightTaluk) ? " · your taluk" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-[#13264B]">
                    {r.value}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      RISK_STYLES[r.risk] || RISK_STYLES.Low
                    }`}
                  >
                    {r.risk}
                  </span>
                </div>
              </div>
              );
            })}

            {!rows.length && !loading && (
              <p className="py-6 text-center text-[13px] text-[#98A2B3]">
                No data for this disease yet.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* ================= DATA VISUALIZATION ================= */}
      <SpreadCharts
        disease={disease}
        district={district}
        latest={latest}
        forecast={forecast}
        forecastDay={forecastDay}
        mode={mode}
      />

      {/* ================= ALL CASES TABLE ================= */}
      <SpreadCasesTable key={reloadKey} />
    </div>
  );
}
