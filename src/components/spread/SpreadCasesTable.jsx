import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Search, Sparkles, Table2 } from "lucide-react";

import spreadApi from "../../api/spreadApi";

const RISK_STYLES = {
  Critical: "bg-[#FDE8E8] text-[#B42318]",
  High: "bg-[#FFEDE0] text-[#C4320A]",
  Moderate: "bg-[#FEF6DC] text-[#A15C07]",
  Low: "bg-[#E9F9EF] text-[#16803C]",
};

// More cases = worse, so up is red and down is green; always with arrow + words.
const TREND = {
  up: { Icon: ArrowUp, text: "Rising", cls: "text-[#B42318]" },
  down: { Icon: ArrowDown, text: "Falling", cls: "text-[#16803C]" },
  steady: { Icon: ArrowRight, text: "Steady", cls: "text-[#667085]" },
  new: { Icon: Sparkles, text: "First report", cls: "text-[#667085]" },
};

function Spark({ values }) {
  if (!values || values.length < 2) return null;
  const w = 56;
  const h = 18;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#2a78d6" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const COLUMNS = [
  { key: "district", label: "District" },
  { key: "taluk", label: "Taluk" },
  { key: "disease", label: "Disease" },
  { key: "cases", label: "Cases", num: true },
  { key: "change", label: "Recent trend", num: true },
  { key: "risk_level", label: "Risk" },
];

const RISK_RANK = { Low: 0, Moderate: 1, High: 2, Critical: 3 };

function weekLabel(w) {
  return w ? `Week ${w % 100}, ${Math.floor(w / 100)}` : "";
}

export default function SpreadCasesTable() {
  const [state, setState] = useState({ rows: [], week: null, loading: true, error: "" });
  const [query, setQuery] = useState("");
  const [disease, setDisease] = useState("All");
  const [sort, setSort] = useState({ key: "cases", dir: "desc" });
  const [limit, setLimit] = useState(15);

  useEffect(() => {
    const controller = new AbortController();
    spreadApi
      .cases(controller.signal)
      .then((res) =>
        setState({ rows: res.data || [], week: res.week_number, loading: false, error: "" })
      )
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setState({ rows: [], week: null, loading: false, error: err.message || "Unable to load cases." });
      });
    return () => controller.abort();
  }, []);

  const diseases = useMemo(
    () => [...new Set(state.rows.map((r) => r.disease))].sort(),
    [state.rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = state.rows.filter(
      (r) =>
        (disease === "All" || r.disease === disease) &&
        (!q ||
          r.taluk.toLowerCase().includes(q) ||
          r.district.toLowerCase().includes(q) ||
          r.disease.toLowerCase().includes(q))
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r) =>
      sort.key === "risk_level"
        ? RISK_RANK[r.risk_level] ?? 0
        : sort.key === "change"
          ? r.change ?? -Infinity
          : r[sort.key];
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (typeof x === "string") return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
  }, [state.rows, query, disease, sort]);

  const totalCases = visible.reduce((s, r) => s + r.cases, 0);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "cases" || key === "change" || key === "risk_level" ? "desc" : "asc" }));

  if (state.loading) return null;
  if (state.error) {
    return (
      <p className="rounded-lg border border-[#E7E2D8] bg-[#F9FAFB] px-4 py-2 text-[12px] text-[#667085]">
        All-cases table unavailable: {state.error}
      </p>
    );
  }

  return (
    <section className="rounded-[18px] border border-[#E7E2D8] bg-white p-4" data-testid="spread-cases-table">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#13264B]">
            <Table2 size={16} /> All reported cases in Karnataka
          </h3>
          <p className="text-[12px] text-[#667085]">
            Latest report for every taluk and disease{state.week ? ` · up to ${weekLabel(state.week)}` : ""}.
            Trend compares with the taluk&apos;s previous report.
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(15);
              }}
              placeholder="Search…"
              className="w-[230px] rounded-lg border border-[#D0D5DD] bg-white py-1.5 pl-8 pr-2 text-[13px]"
            />
          </label>
          <select
            value={disease}
            onChange={(e) => {
              setDisease(e.target.value);
              setLimit(15);
            }}
            className="rounded-lg border border-[#D0D5DD] bg-white px-2 py-1.5 text-[13px]"
          >
            <option value="All">All diseases</option>
            {diseases.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E7E2D8] text-left text-[12px] text-[#667085]">
              {COLUMNS.map((c) => (
                <th key={c.key} className={`py-2 pr-3 font-semibold ${c.num ? "text-right" : ""}`}>
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1 hover:text-[#13264B]"
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map((r) => {
              const t = TREND[r.trend] || TREND.steady;
              return (
                <tr key={`${r.taluk_id}-${r.disease}`} className="border-b border-[#F0F1F3] text-[#13264B]">
                  <td className="py-2 pr-3 text-[#475467]">{r.district}</td>
                  <td className="py-2 pr-3 font-semibold">
                    {r.taluk}
                    {r.is_stale ? <span className="ml-1 text-[11px] font-normal text-[#98A2B3]">(stale)</span> : null}
                  </td>
                  <td className="py-2 pr-3">{r.disease}</td>
                  <td className="py-2 pr-3 text-right font-bold">{r.cases}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-end gap-2">
                      <Spark values={r.recent} />
                      <span className={`inline-flex min-w-[96px] items-center gap-1 text-[12px] font-semibold ${t.cls}`}>
                        <t.Icon size={13} />
                        {t.text}
                        {r.change ? ` ${r.change > 0 ? "+" : ""}${r.change}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RISK_STYLES[r.risk_level] || RISK_STYLES.Low}`}>
                      {r.risk_level}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center text-[#98A2B3]">
                  No matching cases.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#667085]">
        <span>
          {visible.length} row{visible.length === 1 ? "" : "s"} · {totalCases} cases
        </span>
        {visible.length > limit ? (
          <button
            type="button"
            onClick={() => setLimit((l) => l + 25)}
            className="rounded-full bg-[#F3F4F6] px-3 py-1 font-semibold text-[#13264B] hover:bg-[#E5E7EB]"
          >
            Show more ({visible.length - limit} left)
          </button>
        ) : null}
      </div>
    </section>
  );
}
