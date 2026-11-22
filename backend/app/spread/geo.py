"""Coordinates for taluks.

The existing `taluks` table has NO latitude/longitude and we are not allowed
to change the schema (zero breaking changes), so coordinates live here.

Resolution order for a taluk name:
  1. TALUK_GEO (explicit, editable below)
  2. the 40-city table from your original locations.py (same name)
  3. unmapped -> skipped on the map and listed in /spread/meta.unmapped_taluks

Coordinates below are APPROXIMATE town-centre values (good enough for a
50 km neighbour radius). Verify/replace them for anything you present.
Format: name -> (lat, lon, connectivity_score 1-10, healthcare_index 1-10)
"""

TALUK_GEO = {
    # Kodagu
    "Madikeri":                (12.4244, 75.7382, 6, 7),
    "Somwarpet":               (12.5970, 75.8520, 4, 5),
    "Virajpet":                (12.1930, 75.8040, 5, 5),
    "Ponnampet":               (12.1450, 75.9300, 4, 4),
    "Kushalnagar":             (12.4590, 75.9570, 5, 5),
    # Mysuru
    "Mysuru":                  (12.2958, 76.6394, 9, 9),
    "Hunsur":                  (12.3030, 76.2900, 6, 5),
    "Nanjangud":               (12.1180, 76.6800, 6, 6),
    "Tirumakudalu Narasipura": (12.2130, 76.9020, 5, 5),
    "Krishnarajanagara":       (12.4350, 76.3770, 5, 5),
    "Heggadadevankote":        (12.0860, 76.3400, 4, 4),
    "Periyapatna":             (12.3360, 76.0970, 4, 4),
    "Saraguru":                (11.9870, 76.4600, 3, 3),
    "Saligrama":               (12.4150, 76.3430, 4, 4),
}

_CITY_CACHE = None


def _cities():
    """Lazy import so a missing/renamed file can never break startup."""
    global _CITY_CACHE
    if _CITY_CACHE is None:
        try:
            from .cities import CITIES
            _CITY_CACHE = {c["name"].lower(): c for c in CITIES}
        except Exception:
            _CITY_CACHE = {}
    return _CITY_CACHE


def resolve_geo(taluk_name: str):
    """Return dict(latitude, longitude, connectivity_score, healthcare_index) or None."""
    if taluk_name in TALUK_GEO:
        lat, lon, conn, hc = TALUK_GEO[taluk_name]
        return {"latitude": lat, "longitude": lon,
                "connectivity_score": conn, "healthcare_index": hc}
    city = _cities().get(taluk_name.lower())
    if city:
        return {"latitude": city["latitude"], "longitude": city["longitude"],
                "connectivity_score": city["connectivity_score"],
                "healthcare_index": city["healthcare_index"]}
    return None
