"""Offline tests for the spread engine (no Firebase, no database needed).

Run from backend/:   python -m tests.test_spread_engine
"""
from app.spread import config as C
from app.spread.engine import (
    add_weeks, build_neighbours, confidence_score, forecast, haversine_km, predict_next_step,
)

LOC = [
    {"id": 1, "name": "A", "district": "D", "latitude": 12.30, "longitude": 76.64,
     "connectivity_score": 8, "healthcare_index": 7},
    {"id": 2, "name": "B", "district": "D", "latitude": 12.42, "longitude": 75.74,   # ~98 km away
     "connectivity_score": 5, "healthcare_index": 5},
    {"id": 3, "name": "C", "district": "D", "latitude": 12.12, "longitude": 76.68,   # ~20 km from A
     "connectivity_score": 6, "healthcare_index": 6},
]


def test_new_and_unknown_diseases_never_crash():
    for d in ["Dengue", "Typhoid", "Chikungunya", "SomeFutureDisease"]:
        p = predict_next_step(C.get_profile(d), 7, 6, 20, [18, 19, 20], [])
        assert isinstance(p, int) and p >= 0, d
    assert C.get_profile("SomeFutureDisease") is C.DEFAULT_PROFILE


def test_never_negative_and_bounded():
    assert predict_next_step(C.get_profile("Dengue"), 9, 9, 0, [0, 0, 0], []) == 0
    p = predict_next_step(C.get_profile("Dengue"), 9, 9, 100, [10, 50, 100], [])
    assert 100 - 40 <= p <= 100 + 40
    low = predict_next_step(C.get_profile("Dengue"), 9, 9, 2, [0, 1, 2], [])
    assert 0 <= low <= 2 + C.MIN_STEP_CASES


def test_neighbour_with_more_cases_pulls_prediction_up():
    prof = C.get_profile("Influenza")
    alone = predict_next_step(prof, 8, 5, 10, [10, 10, 10], [])
    pulled = predict_next_step(prof, 8, 5, 10, [10, 10, 10],
                               [{"cases": 60, "distance_km": 5}])
    far = predict_next_step(prof, 8, 5, 10, [10, 10, 10],
                            [{"cases": 60, "distance_km": 80}])   # beyond threshold
    assert pulled > alone
    assert far == alone


def test_neighbour_graph_respects_radius():
    nb = build_neighbours(LOC)
    assert {n["id"] for n in nb[1]} == {3}
    assert nb[2] == []
    assert abs(haversine_km(12.30, 76.64, 12.12, 76.68) - 20) < 2


def test_forecast_shape_and_recursion():
    series = {(1, "Typhoid"): [5, 6, 7], (2, "Typhoid"): [9, 9, 9], (3, "Typhoid"): [20, 25, 30]}
    out = forecast(LOC, series, 202640, 3, build_neighbours(LOC), ["Typhoid"])
    assert len(out) == 3 * 3
    assert {r["forecast_day"] for r in out} == {1, 2, 3}
    assert out[0]["forecast_week_number"] == 202641
    # high-case neighbour C (30) should lift A over the horizon
    a = [r["predicted_cases"] for r in out if r["location_id"] == 1]
    assert a[-1] >= a[0] >= 7


def test_week_rollover_and_confidence():
    assert add_weeks(202652, 1) in (202653, 202701)   # ISO years may have 52 or 53 weeks
    assert add_weeks(202640, 2) == 202642
    assert confidence_score([]) == 0.3
    assert confidence_score([10, 10, 10, 10]) > confidence_score([1, 30, 2, 40])


def test_weekly_history_carries_forward_and_matches_current():
    from app.spread.data_source import weekly_history
    snap = {
        "locations": [dict(LOC[0]), dict(LOC[2])],
        "series": {(1, "Dengue"): [5, 7, 9], (3, "Dengue"): [4, 6]},
        "weeks": {(1, "Dengue"): [202638, 202639, 202640], (3, "Dengue"): [202638, 202639]},
        "latest_week": 202640,
    }
    h = weekly_history(snap, "Dengue", None, 3)
    assert [r["week_number"] for r in h] == [202638, 202639, 202640]
    assert [r["cases"] for r in h] == [9, 13, 15]          # taluk 3 carried forward at 6
    assert h[-1]["taluks_reporting"] == 1
    assert weekly_history(snap, "Dengue", "Nowhere", 3)[-1]["cases"] == 0


def test_all_cases_trend():
    from app.spread.data_source import all_cases
    snap = {
        "locations": [dict(LOC[0]), dict(LOC[2])],
        "series": {(1, "Dengue"): [5, 9], (3, "Typhoid"): [4], (3, "Dengue"): [10, 10]},
        "weeks": {(1, "Dengue"): [202639, 202640], (3, "Typhoid"): [202640], (3, "Dengue"): [202639, 202640]},
        "latest_week": 202640,
    }
    rows = {(r["taluk"], r["disease"]): r for r in all_cases(snap)}
    assert rows[("A", "Dengue")]["trend"] == "up" and rows[("A", "Dengue")]["change"] == 4
    assert rows[("C", "Typhoid")]["trend"] == "new"
    assert rows[("C", "Dengue")]["trend"] == "steady"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\n{len(tests)} tests passed")
