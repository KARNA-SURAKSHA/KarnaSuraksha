"""/spread/* API -- public, read-only, aggregated counts (same exposure level as
the existing /dashboard/{taluk_id} and /spread-map/{taluk_id} endpoints)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..ml.predict import classify_risk
from . import config as C
from .data_source import all_cases, current_records, load_snapshot, weekly_history
from .engine import build_neighbours, forecast, week_to_date

router = APIRouter(prefix="/spread", tags=["spread-map"])


def _in_district(row: dict, district) -> bool:
    return not district or (row.get("district") or "").strip().lower() == district.strip().lower()


def _validate_disease(snapshot: dict, disease):
    if disease and disease not in snapshot["diseases"]:
        raise HTTPException(
            status_code=404,
            detail={"error": f"No surveillance data for disease: {disease}",
                    "available_diseases": snapshot["diseases"]},
        )


@router.get("/meta")
def spread_meta(db: Session = Depends(get_db)):
    s = load_snapshot(db)
    return {
        "latest_week": s["latest_week"],
        "latest_date": week_to_date(s["latest_week"]) if s["latest_week"] else None,
        "mapped_taluks": len(s["locations"]),
        "unmapped_taluks": s["unmapped"],
        "diseases": s["diseases"],
        "diseases_using_default_profile": [d for d in s["diseases"] if d not in C.DISEASE_PROFILES],
        "distance_threshold_km": C.DISTANCE_THRESHOLD_KM,
        "max_forecast_weeks": C.MAX_FORECAST_WEEKS,
    }


@router.get("/diseases")
def spread_diseases(db: Session = Depends(get_db)):
    return load_snapshot(db)["diseases"]


@router.get("/latest")
def spread_latest(
    disease: str = Query(None),
    district: str = Query(None, description="Optional district name filter"),
    db: Session = Depends(get_db),
):
    s = load_snapshot(db)
    _validate_disease(s, disease)
    rows = [r for r in current_records(s, disease) if _in_district(r, district)]
    return {
        "week_number": s["latest_week"],
        "date": week_to_date(s["latest_week"]) if s["latest_week"] else None,
        "count": len(rows),
        "data": rows,
    }


@router.get("/forecast")
def spread_forecast(
    disease: str = Query(None),
    weeks: int = Query(2, ge=1, le=C.MAX_FORECAST_WEEKS),
    district: str = Query(None, description="Optional district name filter"),
    db: Session = Depends(get_db),
):
    s = load_snapshot(db)
    _validate_disease(s, disease)
    if not s["series"]:
        return {"start_week": None, "forecast_weeks": weeks, "disease": disease or "All",
                "count": 0, "data": []}

    diseases = [disease] if disease else s["diseases"]
    neighbours = build_neighbours(s["locations"])
    data = forecast(s["locations"], s["series"], s["latest_week"], weeks, neighbours, diseases)
    # Neighbour influence is computed statewide; only the OUTPUT is filtered,
    # so a district view still reflects spread coming in from other districts.
    data = [r for r in data if _in_district(r, district)]
    for r in data:
        r["risk_level"] = classify_risk(r["predicted_cases"])
        r["is_hotspot"] = r["risk_level"] in ("High", "Critical")
    return {
        "start_week": s["latest_week"],
        "start_date": week_to_date(s["latest_week"]),
        "forecast_weeks": weeks,
        "disease": disease or "All",
        "count": len(data),
        "data": data,
    }


@router.get("/history")
def spread_history(
    disease: str = Query(...),
    district: str = Query(None, description="Optional district name filter"),
    weeks: int = Query(10, ge=2, le=26),
    db: Session = Depends(get_db),
):
    """Weekly total cases for one disease (for the trend chart)."""
    s = load_snapshot(db)
    _validate_disease(s, disease)
    data = weekly_history(s, disease, district, weeks)
    return {"disease": disease, "district": district or "All", "count": len(data), "data": data}


@router.get("/cases")
def spread_cases(db: Session = Depends(get_db)):
    """All latest cases in the state, one row per taluk and disease, with trend."""
    s = load_snapshot(db)
    data = all_cases(s)
    return {"week_number": s["latest_week"], "count": len(data), "data": data}
