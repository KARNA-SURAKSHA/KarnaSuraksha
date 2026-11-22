// ============================================================
// Disease Spread Map API client (additive -- does not touch api.js)
// ============================================================

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function get(path, signal) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, { signal });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new Error(
      `Cannot connect to backend at ${API_BASE}. Is the backend running?`,
      { cause: err }
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail =
        typeof body?.detail === "string"
          ? body.detail
          : body?.detail?.error || "";
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }

  return response.json();
}

const withDistrict = (path, district) =>
  district ? `${path}&district=${encodeURIComponent(district)}` : path;

export const spreadApi = {
  meta: (signal) => get("/spread/meta", signal),

  diseases: (signal) => get("/spread/diseases", signal),

  latest: (disease, signal, district) =>
    get(
      withDistrict(`/spread/latest?disease=${encodeURIComponent(disease)}`, district),
      signal
    ),

  cases: (signal) => get("/spread/cases", signal),

  history: (disease, signal, district, weeks = 10) =>
    get(
      withDistrict(
        `/spread/history?disease=${encodeURIComponent(disease)}&weeks=${weeks}`,
        district
      ),
      signal
    ),

  forecast: (disease, weeks, signal, district) =>
    get(
      withDistrict(
        `/spread/forecast?disease=${encodeURIComponent(disease)}&weeks=${weeks}`,
        district
      ),
      signal
    ),
};

export default spreadApi;
