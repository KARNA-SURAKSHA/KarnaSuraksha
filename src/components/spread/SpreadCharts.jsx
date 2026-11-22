import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";

import spreadApi from "../../api/spreadApi";

// Validated categorical pair (colour-blind safe, >=3:1 on white).
const ACTUAL = "#2F6FDE";
const PREDICTED = "#D9661A";

// Same risk colours as the rest of the dashboard (status colours + labels).
const RISK_ORDER = ["Low", "Moderate", "High", "Critical"];
const RISK_FILL = {
  Low: "#16803C",
  Moderate: "#D99A0B",
  High: "#C4320A",
  Critical: "#B42318",
};

// Taluk share donut: validated categorical slots 1-5 + neutral for "Other".
const SHARE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#98A2B3";

const INK = "#13264B";
const INK_2 = "#475467";
const GRID = "#EEF0F3";

const shortWeek = (w) => (w ? `W${w % 100}` : "");

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <section className={`${className} rounded-[18px] border border-[#E7E2D8] bg-white p-4`}>
      <h4 className="text-[14px] font-bold text-[#13264B]">{title}</h4>
      {subtitle ? <p className="mb-2 text-[12px] text-[#667085]">{subtitle}</p> : null}
      {children}
    </section>
  );
}

function TooltipBox({ active, payload, label, unit = "cases" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#E7E2D8] bg-white px-3 py-2 text-[12px] shadow">
      <div className="mb-1 font-semibold text-[#13264B]">{label}</div>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2 text-[#475467]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            {p.name}: <b className="text-[#13264B]">{p.value}</b> {unit}
          </div>
        ))}
    </div>
  );
}

function countByRisk(list) {
  const out = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
  list.forEach((r) => {
    if (out[r] !== undefined) out[r] += 1;
  });
  return out;
}

function RiskMixBar({ label, counts }) {
  const total = RISK_ORDER.reduce((s, k) => s + counts[k], 0) || 1;
  return (
    <div className="mb-3">
      <div className="mb-1 text-[12px] font-semibold text-[#475467]">{label}</div>
      <div className="flex h-7 w-full overflow-hidden rounded-md bg-[#F3F4F6]">
        {RISK_ORDER.filter((k) => counts[k] > 0).map((k) => (
          <div
            key={k}
            title={`${k}: ${counts[k]} taluk${counts[k] > 1 ? "s" : ""}`}
            className="flex items-center justify-center border-r-2 border-white text-[11px] font-bold text-white last:border-r-0"
            style={{ width: `${(counts[k] / total) * 100}%`, background: RISK_FILL[k] }}
          >
            {counts[k]}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Charts for the spread map. Everything is driven by the same disease /
 * district / forecast-week the map is showing, so they always agree.
 */
export default function SpreadCharts({
  disease,
  district,
  latest,
  forecast,
  forecastDay,
  mode,
}) {
  const [history, setHistory] = useState({ key: "", data: [] });
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState("chart");

  const key = `${disease}|${district || ""}`;

  useEffect(() => {
    if (!disease) return undefined;
    const controller = new AbortController();
    spreadApi
      .history(disease, controller.signal, district, 10)
      .then((res) => {
        setFailed(false);
        setHistory({ key, data: res.data || [] });
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [disease, district, key]);

  const hist = useMemo(
    () => (history.key === key ? history.data : []),
    [history, key]
  );
  const fcRows = useMemo(() => forecast.data || [], [forecast]);
  const curRows = useMemo(() => latest.data || [], [latest]);

  // A) trend: actual weekly totals + forecast totals per forecast week
  const trend = useMemo(() => {
    const points = hist.map((h) => ({
      label: shortWeek(h.week_number),
      full: `Week ${h.week_number % 100}, ${Math.floor(h.week_number / 100)}`,
      actual: h.cases,
      predicted: null,
    }));
    if (!points.length || !fcRows.length) return points;
    points[points.length - 1].predicted = points[points.length - 1].actual; // join the lines
    const days = [...new Set(fcRows.map((r) => Number(r.forecast_day)))].sort((a, b) => a - b);
    days.forEach((d) => {
      const rows = fcRows.filter((r) => Number(r.forecast_day) === d);
      const wk = rows[0]?.forecast_week_number;
      points.push({
        label: wk ? shortWeek(wk) : `+${d}w`,
        full: `+${d} week${wk ? ` (week ${wk % 100})` : ""} · forecast`,
        actual: null,
        predicted: rows.reduce((s, r) => s + (r.predicted_cases || 0), 0),
        day: d,
      });
    });
    return points;
  }, [hist, fcRows]);

  const selectedPoint = trend.find((p) => p.day === forecastDay);

  // B) top taluks: reported now vs predicted at the selected forecast week
  const topTaluks = useMemo(() => {
    const predicted = new Map(
      fcRows
        .filter((r) => Number(r.forecast_day) === Number(forecastDay))
        .map((r) => [r.location_id, r.predicted_cases])
    );
    return curRows
      .map((r) => ({
        name: r.location_name,
        current: r.cases,
        predicted: predicted.has(r.location_id) ? predicted.get(r.location_id) : null,
      }))
      .sort((a, b) => Math.max(b.current, b.predicted || 0) - Math.max(a.current, a.predicted || 0))
      .slice(0, 8);
  }, [curRows, fcRows, forecastDay]);

  // D) share of cases by taluk (follows the Current / Forecast mode)
  const share = useMemo(() => {
    const items =
      mode === "forecast"
        ? fcRows
            .filter((r) => Number(r.forecast_day) === Number(forecastDay))
            .map((r) => ({ name: r.location_name, value: r.predicted_cases || 0 }))
        : curRows.map((r) => ({ name: r.location_name, value: r.cases || 0 }));
    const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((sum, i) => sum + i.value, 0);
    const top = sorted.slice(0, 5).map((i, idx) => ({ ...i, color: SHARE_COLORS[idx] }));
    const restValue = sorted.slice(5).reduce((sum, i) => sum + i.value, 0);
    if (restValue > 0) top.push({ name: "Other taluks", value: restValue, color: OTHER_COLOR });
    return { total, parts: top.map((i) => ({ ...i, pct: total ? Math.round((i.value / total) * 100) : 0 })) };
  }, [mode, fcRows, curRows, forecastDay]);

  // C) risk mix by number of taluks
  const mixNow = useMemo(() => countByRisk(curRows.map((r) => r.risk_level)), [curRows]);
  const mixFc = useMemo(
    () =>
      countByRisk(
        fcRows
          .filter((r) => Number(r.forecast_day) === Number(forecastDay))
          .map((r) => r.risk_level)
      ),
    [fcRows, forecastDay]
  );

  if (!curRows.length && !hist.length) return null;

  return (
    <div className="space-y-4" data-testid="spread-charts">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#13264B]">
          <BarChart3 size={16} /> Data visualization · {disease}
          {district ? ` · ${district}` : ""}
        </h3>
        <div className="inline-flex rounded-full bg-[#F3F4F6] p-1">
          {[
            ["chart", "Charts", BarChart3],
            ["table", "Table", Table2],
          ].map(([v, text, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold ${
                view === v ? "bg-white text-[#13264B] shadow-sm" : "text-[#667085]"
              }`}
            >
              <Icon size={12} /> {text}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <p className="rounded-lg border border-[#E7E2D8] bg-[#F9FAFB] px-4 py-2 text-[12px] text-[#667085]">
          Weekly history could not be loaded; showing the charts that do not need it.
        </p>
      )}

      {view === "chart" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ChartCard
              title="Weekly cases: reported and forecast"
              subtitle="Total across the taluks shown on the map. Dashed line is the model's forecast."
            >
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: INK_2, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis allowDecimals={false} tick={{ fill: INK_2, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload }) => (
                        <TooltipBox active={active} payload={payload} label={payload?.[0]?.payload?.full} />
                      )}
                    />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: INK_2 }} />
                    <Line name="Reported" dataKey="actual" stroke={ACTUAL} strokeWidth={2} dot={{ r: 4, fill: ACTUAL, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
                    <Line name="Forecast" dataKey="predicted" stroke={PREDICTED} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4, fill: PREDICTED, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
                    {mode === "forecast" && selectedPoint ? (
                      <ReferenceDot x={selectedPoint.label} y={selectedPoint.predicted} r={8} fill="none" stroke={INK} strokeWidth={2} />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <ChartCard
            title="Where the cases are"
            subtitle={
              mode === "forecast"
                ? `Share of predicted cases by taluk at +${forecastDay} week`
                : "Share of reported cases by taluk"
            }
          >
            {share.parts.length ? (
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative" style={{ width: 170, height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={share.parts}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={80}
                        stroke="#fff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {share.parts.map((p) => (
                          <Cell key={p.name} fill={p.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <TooltipBox
                              active
                              label={payload[0].name}
                              payload={[{ dataKey: "v", name: "Cases", value: payload[0].value, color: payload[0].payload.color }]}
                            />
                          ) : null
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[22px] font-bold leading-none text-[#13264B]">{share.total}</span>
                    <span className="text-[11px] text-[#667085]">cases</span>
                  </div>
                </div>
                <ul className="min-w-[160px] flex-1 space-y-1.5 text-[12px]">
                  {share.parts.map((p) => (
                    <li key={p.name} className="flex items-center gap-2 text-[#475467]">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto font-semibold text-[#13264B]">
                        {p.value} · {p.pct}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-[#98A2B3]">No cases to show.</p>
            )}
          </ChartCard>

          <ChartCard
            className="order-last lg:col-span-2"
            title="Highest-burden taluks"
            subtitle={`Reported now vs predicted at +${forecastDay} week`}
          >
            <div style={{ height: Math.max(180, topTaluks.length * 38 + 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTaluks} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barGap={2}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: INK_2, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={96} tick={{ fill: INK, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                  <Tooltip cursor={{ fill: "#F5F6F8" }} content={({ active, payload, label }) => <TooltipBox active={active} payload={payload} label={label} />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK_2 }} />
                  <Bar name="Reported now" dataKey="current" fill={ACTUAL} barSize={9} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  <Bar name={`Predicted +${forecastDay}w`} dataKey="predicted" fill={PREDICTED} barSize={9} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Risk mix"
            subtitle="Number of taluks in each risk band (same bands as the dashboard)"
          >
            <RiskMixBar label="Reported now" counts={mixNow} />
            <RiskMixBar label={`Predicted +${forecastDay} week`} counts={mixFc} />
            <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[#475467]">
              {RISK_ORDER.map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RISK_FILL[k] }} />
                  {k}
                </span>
              ))}
            </div>
          </ChartCard>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Weekly totals">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[#667085]">
                  <th className="py-1">Week</th>
                  <th>Reported</th>
                  <th>Forecast</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((p) => (
                  <tr key={p.full} className="border-t border-[#F0F1F3] text-[#13264B]">
                    <td className="py-1">{p.full}</td>
                    <td>{p.actual ?? "—"}</td>
                    <td>{p.predicted !== null && p.day ? p.predicted : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
          <ChartCard title="Highest-burden taluks">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[#667085]">
                  <th className="py-1">Taluk</th>
                  <th>Now</th>
                  <th>+{forecastDay}w</th>
                </tr>
              </thead>
              <tbody>
                {topTaluks.map((t) => (
                  <tr key={t.name} className="border-t border-[#F0F1F3] text-[#13264B]">
                    <td className="py-1">{t.name}</td>
                    <td>{t.current}</td>
                    <td>{t.predicted ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
