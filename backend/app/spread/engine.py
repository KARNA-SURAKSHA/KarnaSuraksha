"""Spread prediction engine (weekly, real-data version).

Re-uses your original ideas (Haversine neighbours, distance influence,
connectivity, healthcare effect, bounded step) but removes everything that was
calibrated to the synthetic generator (the 0.05 'expected variation' and the
hard +/-10% clamp), and works on WEEKLY taluk reports.
"""
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from . import config as C


# ------------------------------------------------------------------ geometry
def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def distance_influence(distance_km: float, threshold: float = C.DISTANCE_THRESHOLD_KM) -> float:
    if distance_km >= threshold:
        return 0.0
    return max(0.0, min(1.0, 1 - distance_km / threshold))


def build_neighbours(locations: List[dict], threshold: float = C.DISTANCE_THRESHOLD_KM) -> Dict[int, List[dict]]:
    """{location_id: [{id, distance_km}]} computed once per request."""
    out: Dict[int, List[dict]] = {loc["id"]: [] for loc in locations}
    for i, a in enumerate(locations):
        for b in locations[i + 1:]:
            d = haversine_km(a["latitude"], a["longitude"], b["latitude"], b["longitude"])
            if d <= threshold:
                out[a["id"]].append({"id": b["id"], "distance_km": round(d, 2)})
                out[b["id"]].append({"id": a["id"], "distance_km": round(d, 2)})
    return out


# --------------------------------------------------------------------- weeks
def week_to_date(week_number: int) -> str:
    """YYYYWW (ISO) -> Monday of that week as YYYY-MM-DD."""
    year, week = divmod(int(week_number), 100)
    try:
        return datetime.fromisocalendar(year, week, 1).strftime("%Y-%m-%d")
    except ValueError:
        return f"{year}-W{week:02d}"


def add_weeks(week_number: int, n: int) -> int:
    year, week = divmod(int(week_number), 100)
    monday = datetime.fromisocalendar(year, week, 1) + timedelta(weeks=n)
    iso_year, iso_week, _ = monday.isocalendar()
    return iso_year * 100 + iso_week


# ---------------------------------------------------------------- statistics
def _slope(values: List[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mx = (n - 1) / 2
    my = sum(values) / n
    den = sum((i - mx) ** 2 for i in range(n))
    return sum((i - mx) * (v - my) for i, v in enumerate(values)) / den if den else 0.0


def confidence_score(history: List[float]) -> float:
    n = len(history)
    if n == 0:
        return 0.3
    mean = sum(history) / n
    if n >= 2 and mean > 0:
        var = sum((v - mean) ** 2 for v in history) / n
        cv = min(math.sqrt(var) / mean, 1.0)
    else:
        cv = 1.0
    score = 0.4 + 0.35 * min(1.0, n / 4) + 0.25 * (1 - cv)
    return round(min(0.97, max(0.35, score)), 2)


# ---------------------------------------------------------------- prediction
def predict_next_step(disease_profile: dict, connectivity: float, healthcare: float,
                      current: float, history: List[float],
                      neighbours: List[dict]) -> int:
    """One-week-ahead prediction for one (location, disease).

    neighbours: [{"cases": x, "distance_km": d}]
    """
    spread = disease_profile["spread_factor"]
    predicted = float(current)

    # 1. damped recent trend (works for any disease, needs >= 2 points)
    window = [float(v) for v in history[-C.HISTORY_WINDOW:]]
    predicted += C.TREND_DAMPING * _slope(window)

    # 2. inflow from neighbours that have MORE cases than this location
    inflow = 0.0
    for nb in neighbours:
        gap = nb["cases"] - current
        if gap <= 0:
            continue
        inflow += (gap * spread * (connectivity / 10.0)
                   * distance_influence(nb["distance_km"]) * C.NEIGHBOUR_INFLOW_COEFF)
    predicted += min(inflow, C.NEIGHBOUR_CAP_RATIO * current + 2)

    # 3. healthcare-driven recovery
    predicted -= current * (healthcare / 10.0) * C.HEALTHCARE_RECOVERY_RATE

    # 4. bounded weekly change
    max_change = max(C.MIN_STEP_CASES, current * C.MAX_STEP_RATIO)
    predicted = min(predicted, current + max_change)
    predicted = max(predicted, max(0.0, current - max_change))
    return max(0, int(round(predicted)))


def forecast(locations: List[dict], series: Dict[tuple, List[int]],
             start_week: int, weeks: int, neighbours: Dict[int, List[dict]],
             diseases: List[str]) -> List[dict]:
    """Recursive multi-week forecast.

    series: {(location_id, disease): [cases oldest..latest]}
    """
    if not 1 <= weeks <= C.MAX_FORECAST_WEEKS:
        raise ValueError(f"weeks must be between 1 and {C.MAX_FORECAST_WEEKS}")

    state = {k: (v[-1] if v else 0) for k, v in series.items()}
    hist = {k: list(v) for k, v in series.items()}
    by_id = {loc["id"]: loc for loc in locations}
    results: List[dict] = []
    week = start_week

    for step in range(1, weeks + 1):
        nxt = add_weeks(week, 1)
        new_state = {}
        for loc in locations:
            for disease in diseases:
                key = (loc["id"], disease)
                if key not in series:
                    continue
                cur = state.get(key, 0)
                nbs = [{"cases": state.get((n["id"], disease), 0), "distance_km": n["distance_km"]}
                       for n in neighbours.get(loc["id"], [])]
                profile = C.get_profile(disease)
                pred = predict_next_step(profile, loc["connectivity_score"], loc["healthcare_index"],
                                         cur, hist[key], nbs)
                new_state[key] = pred
                hist[key].append(pred)
                results.append({
                    "location_id": loc["id"],
                    "location_name": loc["name"],
                    "district": loc["district"],
                    "latitude": loc["latitude"],
                    "longitude": loc["longitude"],
                    "disease": disease,
                    "forecast_day": step,          # map component expects this key; unit = weeks
                    "forecast_week": step,
                    "forecast_week_number": nxt,
                    "forecast_date": week_to_date(nxt),
                    "previous_cases": cur,
                    "predicted_cases": pred,
                    "confidence": confidence_score(hist[key][:-1]),
                })
        state = new_state
        week = nxt
    return results
