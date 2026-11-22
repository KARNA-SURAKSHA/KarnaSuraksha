"""Tunable configuration for the spread-map prediction engine.

Disease behaviour is data, not code: adding a disease = adding one entry to
DISEASE_PROFILES. Any disease found in the real reports but NOT listed here
automatically uses DEFAULT_PROFILE, so a new disease can never crash the map.
"""

# Original four profiles are carried over unchanged from diseases.py.
# Typhoid / Chikungunya are NEW and their numbers are engineering estimates
# (see the integration notes) -- review them before your viva.
DISEASE_PROFILES = {
    "Dengue": {
        "spread_factor": 0.35, "risk_multiplier": 1.20,
        "transmission": "Vector-borne", "incubation_days": (4, 10),
        "severity": "High", "season": "Monsoon",
    },
    "Malaria": {
        "spread_factor": 0.25, "risk_multiplier": 1.00,
        "transmission": "Vector-borne", "incubation_days": (7, 30),
        "severity": "Medium", "season": "Monsoon",
    },
    "Influenza": {
        "spread_factor": 0.40, "risk_multiplier": 1.10,
        "transmission": "Airborne", "incubation_days": (1, 4),
        "severity": "Medium", "season": "Winter",
    },
    "COVID-19": {
        "spread_factor": 0.50, "risk_multiplier": 1.30,
        "transmission": "Airborne", "incubation_days": (2, 14),
        "severity": "High", "season": "All Year",
    },
    # ---- new diseases ----
    "Typhoid": {
        # Food/water-borne: spreads through shared sources, weakly with
        # geographic proximity -> lowest neighbour coupling.
        "spread_factor": 0.20, "risk_multiplier": 0.90,
        "transmission": "Food/Water-borne", "incubation_days": (6, 30),
        "severity": "Medium", "season": "Monsoon",
    },
    "Chikungunya": {
        # Same vector family as dengue, slightly lower coupling.
        "spread_factor": 0.30, "risk_multiplier": 1.00,
        "transmission": "Vector-borne", "incubation_days": (3, 7),
        "severity": "Medium", "season": "Monsoon",
    },
}

DEFAULT_PROFILE = {
    "spread_factor": 0.25, "risk_multiplier": 1.00,
    "transmission": "Unknown", "incubation_days": (3, 14),
    "severity": "Medium", "season": "All Year",
}


def get_profile(disease: str) -> dict:
    return DISEASE_PROFILES.get(disease, DEFAULT_PROFILE)


# ---- model constants (weekly real-data model) -------------------------
DISTANCE_THRESHOLD_KM = 50      # neighbour radius (unchanged from your engine)
HISTORY_WINDOW = 4              # weeks of history used for the trend
TREND_DAMPING = 0.6             # only trust 60% of the fitted slope
NEIGHBOUR_INFLOW_COEFF = 0.25   # strength of inflow from higher-case neighbours
NEIGHBOUR_CAP_RATIO = 0.30      # neighbours can add at most 30% (+2) of current
HEALTHCARE_RECOVERY_RATE = 0.03 # weekly reduction at healthcare_index = 10
MAX_STEP_RATIO = 0.40           # max +/-40% change per week ...
MIN_STEP_CASES = 3              # ... but always allow at least +/-3 cases
MAX_FORECAST_WEEKS = 4
DEFAULT_CONNECTIVITY = 5
DEFAULT_HEALTHCARE = 5
