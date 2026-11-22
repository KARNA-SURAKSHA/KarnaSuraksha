"""Bridge between the dashboard's REAL data and the spread engine.

Reads the existing `disease_reports` (weekly, agent-entered) and `taluks` /
`districts` tables. It only ever READS; it never writes to the database.
"""
from typing import Dict, List, Tuple

from sqlalchemy.orm import Session

from .. import models
from ..ml.predict import classify_risk   # same risk bands as the rest of the dashboard
from . import config as C
from .geo import resolve_geo
from .engine import week_to_date


def load_snapshot(db: Session) -> dict:
    """Return everything the routes need, from real reports.

    {
      "locations": [ {id,name,district,latitude,longitude,connectivity_score,healthcare_index} ],
      "series":    {(taluk_id, disease): [cases oldest..latest]},
      "latest":    {(taluk_id, disease): {"week": int, "cases": int}},
      "weeks":     {(taluk_id, disease): [week numbers aligned with series]},
      "latest_week": int | None,
      "unmapped":  [taluk names that have reports but no coordinates],
      "diseases":  [disease names that have data],
    }
    """
    rows = (
        db.query(
            models.DiseaseReport.taluk_id,
            models.DiseaseReport.disease,
            models.DiseaseReport.week_number,
            models.DiseaseReport.cases,
            models.DiseaseReport.created_at,
        )
        .order_by(models.DiseaseReport.created_at.asc())
        .all()
    )

    per_week: Dict[Tuple[int, str], Dict[int, int]] = {}
    for taluk_id, disease, week, cases, _created in rows:
        if not disease or week is None:
            continue
        # later submission for the same week overwrites the earlier one
        per_week.setdefault((taluk_id, disease), {})[int(week)] = int(cases or 0)

    taluk_ids = sorted({k[0] for k in per_week})
    taluk_rows = (
        db.query(models.Taluk, models.District)
        .join(models.District, models.Taluk.district_id == models.District.id)
        .filter(models.Taluk.id.in_(taluk_ids) if taluk_ids else False)
        .all()
    )

    locations: List[dict] = []
    unmapped: List[str] = []
    mapped_ids = set()
    for taluk, district in taluk_rows:
        geo = resolve_geo(taluk.name)
        if geo is None:
            unmapped.append(taluk.name)
            continue
        locations.append({
            "id": taluk.id, "name": taluk.name, "district": district.name, **geo,
        })
        mapped_ids.add(taluk.id)

    series, latest, weeks = {}, {}, {}
    for (tid, disease), wk in per_week.items():
        if tid not in mapped_ids:
            continue
        ordered = sorted(wk.items())
        series[(tid, disease)] = [c for _, c in ordered]
        weeks[(tid, disease)] = [w for w, _ in ordered]
        latest[(tid, disease)] = {"week": ordered[-1][0], "cases": ordered[-1][1]}

    all_weeks = [v["week"] for v in latest.values()]
    return {
        "locations": locations,
        "series": series,
        "latest": latest,
        "weeks": weeks,
        "latest_week": max(all_weeks) if all_weeks else None,
        "unmapped": sorted(unmapped),
        "diseases": sorted({d for (_t, d) in series}),
    }


def current_records(snapshot: dict, disease: str = None) -> List[dict]:
    """'Current' view: each taluk's most recent real report per disease."""
    loc_by_id = {l["id"]: l for l in snapshot["locations"]}
    latest_week = snapshot["latest_week"]
    out = []
    for (tid, dis), info in snapshot["latest"].items():
        if disease and dis != disease:
            continue
        loc = loc_by_id.get(tid)
        if not loc:
            continue
        cases = info["cases"]
        risk = classify_risk(cases)
        out.append({
            "id": tid,
            "location_id": tid,
            "location_name": loc["name"],
            "district": loc["district"],
            "latitude": loc["latitude"],
            "longitude": loc["longitude"],
            "disease": dis,
            "cases": cases,
            "date": week_to_date(info["week"]),
            "week_number": info["week"],
            "risk_level": risk,
            "is_hotspot": risk in ("High", "Critical"),
            "is_stale": info["week"] != latest_week,   # reporting agent is behind
        })
    out.sort(key=lambda r: (r["location_name"], r["disease"]))
    return out


def weekly_history(snapshot: dict, disease: str, district: str = None, weeks: int = 10) -> List[dict]:
    """Weekly totals for one disease over the last `weeks` consecutive ISO weeks.

    A taluk that has not yet reported for a week carries its last known value
    forward (the same rule the map's 'current' view uses), so the final point
    equals the map's current total. Taluks with no report yet at that week are
    not counted. `taluks_reporting` = taluks that actually submitted that week.
    """
    from .engine import add_weeks

    latest_week = snapshot["latest_week"]
    if not latest_week:
        return []
    loc_by_id = {l["id"]: l for l in snapshot["locations"]}
    wanted = (district or "").strip().lower()

    per_taluk = {}
    for (tid, dis), wks in snapshot["weeks"].items():
        loc = loc_by_id.get(tid)
        if dis != disease or not loc:
            continue
        if wanted and (loc["district"] or "").strip().lower() != wanted:
            continue
        per_taluk[tid] = dict(zip(wks, snapshot["series"][(tid, dis)]))

    out = []
    for i in range(weeks - 1, -1, -1):
        w = add_weeks(latest_week, -i)
        total, reporting = 0, 0
        for by_week in per_taluk.values():
            if w in by_week:
                reporting += 1
            known = [wk for wk in by_week if wk <= w]
            if known:
                total += by_week[max(known)]
        out.append({"week_number": w, "date": week_to_date(w),
                    "cases": total, "taluks_reporting": reporting})
    return out


def all_cases(snapshot: dict) -> List[dict]:
    """Every taluk x disease with its latest report and recent trend (statewide)."""
    loc_by_id = {l["id"]: l for l in snapshot["locations"]}
    out = []
    for (tid, dis), values in snapshot["series"].items():
        loc = loc_by_id.get(tid)
        if not loc or not values:
            continue
        wks = snapshot["weeks"][(tid, dis)]
        cases, week = values[-1], wks[-1]
        prev = values[-2] if len(values) > 1 else None
        delta = None if prev is None else cases - prev
        if delta is None:
            direction = "new"
        elif delta == 0 or (abs(delta) <= 1 and prev and abs(delta) / max(prev, 1) < 0.05):
            direction = "steady"
        else:
            direction = "up" if delta > 0 else "down"
        risk = classify_risk(cases)
        out.append({
            "taluk_id": tid, "taluk": loc["name"], "district": loc["district"],
            "disease": dis, "cases": cases, "week_number": week,
            "date": week_to_date(week), "risk_level": risk,
            "previous_cases": prev, "change": delta,
            "change_pct": None if not prev else round(delta / prev * 100, 1),
            "trend": direction, "recent": values[-5:],
            "is_stale": week != snapshot["latest_week"],
        })
    out.sort(key=lambda r: (-r["cases"], r["district"], r["taluk"], r["disease"]))
    return out
