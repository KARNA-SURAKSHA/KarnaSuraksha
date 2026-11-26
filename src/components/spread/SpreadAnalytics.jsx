import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, RefreshCw } from "lucide-react";

import spreadApi from "../../api/spreadApi";
import SpreadCharts from "./SpreadCharts";
import SpreadCasesTable from "./SpreadCasesTable";

/**
 * Data Visualization + All Cases table, for the user portal's Analytics page.
 * Same charts/table as before (moved out of the Disease Risk Map page), with
 * its own disease / current-forecast controls and data fetching.
 */
export default function SpreadAnalytics({
  district = "",
  casesDistrict = "",
}) {
  const [diseases, setDiseases] = useState([]);
  const [disease, setDisease] = useState("");
  const [mode, setMode] = useState("current");
  const [weeks, setWeeks] = useState(2);
  const [forecastDay, setForecastDay] = useState(1);

  const [latest, setLatest] = useState({ data: [], week_number: null });
  const [forecast, setForecast] = useState({ data: [], start_week: null });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  /* disease list */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setError("");
        setLoading(true);
        const list = await spreadApi.diseases(controller.signal);
        setDiseases(list);
        setDisease((prev) => (prev && list.includes(prev) ? prev : list[0] || ""));
        if (!list.length) setLoading(false);
      } catch (err) {
        if (err?.name === "AbortError") return;
        setError(err.message || "Unable to load analytics data.");
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [reloadKey]);

  /* data for the selected disease */
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
        if (myId !== requestId.current) return;
        setLatest(cur);
        setForecast(fc);
        setForecastDay((d) => Math.min(d, weeks));
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (myId !== requestId.current) return;
        setError(err.message || "Unable to load analytics data.");
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [disease, weeks, district, reloadKey]);

  if (error && !latest.data.length && !forecast.data.length) {
    return (
      <div className="rounded-[18px] border border-[#F3C9C9] bg-[#FFF5F5] p-8 text-center">
        <AlertTriangle className="mx-auto mb-2 text-[#C62828]" size={28} />
        <p className="text-[15px] font-semibold text-[#8A1C1C]">
          Data visualization is unavailable
        </p>
        <p className="mx-auto mt-1 max-w-[520px] text-[13px] text-[#8A1C1C]">{error}</p>
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
          Charts appear as soon as the first weekly report is submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[#E7E2D8] bg-white px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {diseases.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDisease(d)}
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
                onClick={() => setMode(m)}
                className={`rounded-full px-3.5 py-1 text-[13px] font-semibold capitalize transition ${
                  mode === m ? "bg-white text-[#13264B] shadow-sm" : "text-[#667085]"
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
                  onChange={(e) => setWeeks(Number(e.target.value))}
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
                    onClick={() => setForecastDay(w)}
                    className={`h-8 min-w-8 rounded-full px-2 text-[12px] font-semibold ${
                      w === forecastDay
                        ? "bg-[#16803C] text-white"
                        : "bg-[#F3F4F6] text-[#475467]"
                    }`}
                  >
                    +{w}w
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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
      <SpreadCasesTable
        key={reloadKey}
        district={casesDistrict}
      />
    </div>
  );
}