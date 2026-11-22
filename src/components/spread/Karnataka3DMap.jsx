import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import {
  GeoJsonLayer,
  TextLayer,
  ScatterplotLayer,
} from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";

/* =========================================================
   MAP DATA SOURCES
   ========================================================= */

const DISTRICT_URL =
  "https://mapservice.gov.in/mapserviceserv176/rest/services/BharatMapService_Karnataka/Admin_Boundary_District/MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson";

const DISTRICT_FALLBACK_URL =
  "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/geojson/states/karnataka.geojson";

const TALUK_URL =
  "https://mapservice.gov.in/mapserviceserv176/rest/services/BharatMapService_Karnataka/Admin_Boundary_Village/MapServer/2/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson";

/* =========================================================
   DEFAULT VIEW
   ========================================================= */

const DEFAULT_VIEW = {
  longitude: 75.7139,
  latitude: 15.3173,
  zoom: 5.45,
  pitch: 35,
  bearing: 0,
};

const LABEL_HIDE_ZOOM = 6.0;

/*
 * Taluk boundaries are intentionally NOT rendered for the
 * whole Karnataka map. They become active only after a
 * district/location has been selected and the map has zoomed
 * into that district. This keeps the statewide map fast.
 */
const TALUK_SHOW_ZOOM = 6.0;
const TALUK_FOCUS_ZOOM = 6.4;

/* =========================================================
   PROPERTY HELPERS
   ========================================================= */

function getDistrictName(feature) {
  const p = feature?.properties || {};

  return (
    p.dtname ||
    p.DTNAME ||
    p.district ||
    p.DISTRICT ||
    p.District ||
    p.name ||
    "Unknown"
  );
}

/* Robust label for the hover chip: tries the known keys first, then any
   property whose key looks like a district name. */
function getHoverDistrictLabel(feature) {
  const known = getDistrictName(feature);
  if (known && known !== "Unknown") return known;

  const p = feature?.properties || {};
  const key = Object.keys(p).find(
    (k) => /dist/i.test(k) && typeof p[k] === "string" && p[k].trim()
  );
  return key ? p[key] : "";
}


function getTalukName(feature) {
  const p = feature?.properties || {};

  return (
    p.sdtname ||
    p.SDTNAME ||
    p.subdistrict ||
    p.SUBDISTRICT ||
    p.taluk ||
    p.TALUK ||
    p.TALUK_NAME ||
    p.Taluk ||
    p.name ||
    "Unknown Taluk"
  );
}

function getTalukDistrictName(feature) {
  const p = feature?.properties || {};

  return (
    p.dtname ||
    p.DTNAME ||
    p.district ||
    p.DISTRICT ||
    p.District ||
    p.district_name ||
    p.DISTRICT_NAME ||
    p.parent_district ||
    p.PARENT_DISTRICT ||
    p.parentDistrict ||
    p.ParentDistrict ||
    ""
  );
}

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/*
 * District names in the disease dataset and the Karnataka boundary
 * service are not always identical. Bengaluru/Bangalore is the main
 * example. Keep the original display name, but use a canonical key
 * when matching data to boundary districts.
 */
function normalizeDistrictName(value) {
  const name = normalizeName(value)
    .replace(/\s+/g, " ");

  const aliases = {
    "bangalore urban": "bengaluru urban",
    "bangalore city": "bengaluru urban",
    "bangalore": "bengaluru urban",
    "bengaluru": "bengaluru urban",
  };

  return aliases[name] || name;
}

function resolveLocationDistrict(location, districtGeoJSON) {
  const locationDistrict = normalizeDistrictName(
    location?.district
  );

  const longitude = Number(location?.longitude);
  const latitude = Number(location?.latitude);

  /* Prefer the actual boundary containing the surveillance point.
     This removes dependence on spelling differences in district names. */
  if (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    districtGeoJSON?.features?.length
  ) {
    const containingFeature = districtGeoJSON.features.find((feature) =>
      isPointInsideFeature(
        [longitude, latitude],
        feature
      )
    );

    if (containingFeature) {
      return normalizeDistrictName(
        getDistrictName(containingFeature)
      );
    }
  }

  return locationDistrict;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter(
    (location) =>
      Number.isFinite(Number(location?.latitude)) &&
      Number.isFinite(Number(location?.longitude))
  );
}

function getCases(location) {
  return Number(
    location?.predicted_cases ??
      location?.cases ??
      0
  );
}

function getPreviousCases(location) {
  return Number(
    location?.previous_cases ??
      getCases(location)
  );
}

function getForecastChange(location) {
  return (
    getCases(location) -
    getPreviousCases(location)
  );
}

function getTrendLabel(location) {
  const change = getForecastChange(location);

  if (change > 0.5) {
    return "Increasing";
  }

  if (change < -0.5) {
    return "Decreasing";
  }

  return "Stable";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDate(dateString) {
  if (!dateString) {
    return "";
  }

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* =========================================================
   RISK CALCULATION
   =========================================================

   These thresholds match the project's existing
   Low / Medium / High case classification.

   0 - 5     -> Low
   6 - 15    -> Medium
   > 15      -> High
   ========================================================= */

function getRiskLevel(cases) {
  const value = Number(cases || 0);

  if (value <= 5) {
    return "Low";
  }

  if (value <= 15) {
    return "Medium";
  }

  return "High";
}

function getRiskPriority(risk) {
  if (risk === "High") {
    return 3;
  }

  if (risk === "Medium") {
    return 2;
  }

  return 1;
}

function getHigherRisk(currentRisk, newRisk) {
  if (
    getRiskPriority(newRisk) >
    getRiskPriority(currentRisk)
  ) {
    return newRisk;
  }

  return currentRisk;
}

/* =========================================================
   GEOMETRY HELPERS
   ========================================================= */

function getRingCentroid(ring) {
  if (!ring || ring.length < 3) {
    return null;
  }

  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];

    const cross = x1 * y2 - x2 * y1;

    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  area *= 0.5;

  if (Math.abs(area) < 0.0000001) {
    return null;
  }

  return {
    position: [
      cx / (6 * area),
      cy / (6 * area),
    ],
    area: Math.abs(area),
  };
}

function getPolygonCentroid(feature) {
  const geometry = feature?.geometry;

  if (!geometry) {
    return null;
  }

  let polygons = [];

  if (geometry.type === "Polygon") {
    polygons = [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    polygons = geometry.coordinates;
  }

  if (!polygons.length) {
    return null;
  }

  let totalArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  polygons.forEach((polygon) => {
    const result = getRingCentroid(polygon?.[0]);

    if (!result) {
      return;
    }

    totalArea += result.area;

    weightedX +=
      result.position[0] * result.area;

    weightedY +=
      result.position[1] * result.area;
  });

  if (!totalArea) {
    return null;
  }

  return [
    weightedX / totalArea,
    weightedY / totalArea,
  ];
}

function isPointInRing(point, ring) {
  if (!point || !Array.isArray(ring) || ring.length < 3) {
    return false;
  }

  const x = Number(point[0]);
  const y = Number(point[1]);
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i += 1) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInsideFeature(point, feature) {
  const geometry = feature?.geometry;

  if (!geometry || !point) {
    return false;
  }

  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  return polygons.some((polygon) => {
    const outerRing = polygon?.[0];

    if (!isPointInRing(point, outerRing)) {
      return false;
    }

    // A point inside a hole is not inside the polygon.
    return !(polygon || []).slice(1).some((hole) =>
      isPointInRing(point, hole)
    );
  });
}

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

function Karnataka3DMap({
  locations = [],
  forecastData = [],
  selectedDistrict = "",
  onDistrictSelect,
  onLocationSelect,
  onTalukSelect,
  mode = "current",
  forecastDay = 1,
}) {
  const [districtGeoJSON, setDistrictGeoJSON] =
    useState(null);

  // Hover chip with the district name (position updated via ref, no re-render)
  const [hoverName, setHoverName] = useState("");
  const hoverRef = useRef(null);
  const hoverPos = useRef({ x: 0, y: 0 });

  const [talukGeoJSON, setTalukGeoJSON] =
    useState(null);

  const [districtLoading, setDistrictLoading] =
    useState(true);

  const [talukLoading, setTalukLoading] =
    useState(true);

  const [viewState, setViewState] =
    useState(DEFAULT_VIEW);

  /*
   * Local district selection.
   *
   * This allows the information card to stay
   * directly inside the map.
   */
  const [clickedDistrict, setClickedDistrict] =
    useState("");

  const [selectedTalukName, setSelectedTalukName] =
    useState("");

  /* =======================================================
     LOAD DISTRICTS
     ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadDistricts() {
      try {
        let response = await fetch(DISTRICT_URL);

        if (!response.ok) {
          response = await fetch(
            DISTRICT_FALLBACK_URL
          );
        }

        if (!response.ok) {
          throw new Error(
            "District boundary request failed"
          );
        }

        const data = await response.json();

        if (!cancelled) {
          setDistrictGeoJSON(data);
        }
      } catch (error) {
        console.error(
          "District boundary error:",
          error
        );
      } finally {
        if (!cancelled) {
          setDistrictLoading(false);
        }
      }
    }

    loadDistricts();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     LOAD TALUKS
     ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadTaluks() {
      try {
        const response = await fetch(TALUK_URL);

        if (!response.ok) {
          throw new Error(
            "Taluk boundary request failed"
          );
        }

        const data = await response.json();

        if (!cancelled) {
          setTalukGeoJSON(data);
        }
      } catch (error) {
        console.error(
          "Taluk boundary error:",
          error
        );
      } finally {
        if (!cancelled) {
          setTalukLoading(false);
        }
      }
    }

    loadTaluks();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     CURRENT FRAME DATA
     ======================================================= */

  const validLocations = useMemo(() => {
    let frameRows;

    if (mode === "forecast") {
      const source =
        forecastData.length > 0
          ? forecastData
          : locations;

      frameRows = source.filter(
        (location) =>
          Number(location?.forecast_day) ===
          Number(forecastDay)
      );
    } else {
      frameRows = locations;
    }

    return normalizeRows(frameRows);
  }, [
    locations,
    forecastData,
    mode,
    forecastDay,
  ]);

  /* =======================================================
     GLOBAL CASE SCALE
     ======================================================= */

  const maxCases = useMemo(() => {
    const source =
      mode === "forecast" &&
      forecastData.length > 0
        ? forecastData
        : locations;

    const values = normalizeRows(source).map(
      (location) => getCases(location)
    );

    return Math.max(1, ...values);
  }, [
    locations,
    forecastData,
    mode,
  ]);

  /* =======================================================
     FORECAST CHANGE SCALE
     ======================================================= */

  const maxAbsoluteChange = useMemo(() => {
    if (
      mode !== "forecast" ||
      forecastData.length === 0
    ) {
      return 1;
    }

    const changes = forecastData.map(
      (location) =>
        Math.abs(
          getForecastChange(location)
        )
    );

    return Math.max(1, ...changes);
  }, [
    forecastData,
    mode,
  ]);

  /* =======================================================
     DISTRICT CASE TOTALS
     ======================================================= */

  const districtCaseTotals = useMemo(() => {
    const totals = {};

    validLocations.forEach((location) => {
      const district = resolveLocationDistrict(
        location,
        districtGeoJSON
      );

      if (!district) {
        return;
      }

      if (!totals[district]) {
        totals[district] = {
          cases: 0,
          hotspots: 0,
        };
      }

      totals[district].cases +=
        getCases(location);

      if (location?.is_hotspot) {
        totals[district].hotspots += 1;
      }
    });

    return totals;
  }, [validLocations, districtGeoJSON]);

  const maxDistrictCases = useMemo(() => {
    const values = Object.values(
      districtCaseTotals
    ).map(
      (item) => item.cases
    );

    return Math.max(1, ...values);
  }, [districtCaseTotals]);

  /* =======================================================
     DISTRICT DETAILED SUMMARY
     
     This is used by the new in-map information panel.
     ======================================================= */

  const districtSummaries = useMemo(() => {
    const summaries = {};

    /*
     * IMPORTANT:
     * Build the district list from the boundary data first,
     * not from disease locations.
     *
     * This means a district with ZERO cases still exists in the
     * summary and can be opened from the map. Its panel will show
     * the district name, zero cases, and its available taluks.
     */
    (districtGeoJSON?.features || []).forEach((feature) => {
      const districtName = getDistrictName(feature);
      const district = normalizeDistrictName(districtName);

      if (!district) {
        return;
      }

      summaries[district] = {
        name: districtName,
        totalCases: 0,
        risk: "Low",
        diseaseCases: {},
        locationCount: 0,
        hotspotCount: 0,
      };
    });

    /* Merge disease/location data into the boundary-based list. */
    validLocations.forEach((location) => {
      const district = resolveLocationDistrict(
        location,
        districtGeoJSON
      );

      if (!district) {
        return;
      }

      /* Keep backend-only districts visible as well. */
      if (!summaries[district]) {
        summaries[district] = {
          name: location?.district || "Unknown District",
          totalCases: 0,
          risk: "Low",
          diseaseCases: {},
          locationCount: 0,
          hotspotCount: 0,
        };
      }

      const cases = getCases(location);
      const disease = location?.disease || "Unknown";

      summaries[district].totalCases += cases;
      summaries[district].locationCount += 1;

      if (location?.is_hotspot) {
        summaries[district].hotspotCount += 1;
      }

      summaries[district].diseaseCases[disease] =
        (summaries[district].diseaseCases[disease] || 0) + cases;

      summaries[district].risk = getHigherRisk(
        summaries[district].risk,
        getRiskLevel(cases)
      );
    });

    Object.values(summaries).forEach((summary) => {
      let dominantDisease = "—";
      let dominantCases = -1;

      Object.entries(summary.diseaseCases).forEach(([disease, cases]) => {
        if (cases > dominantCases) {
          dominantCases = cases;
          dominantDisease = disease;
        }
      });

      summary.dominantDisease = dominantDisease;
    });

    return summaries;
  }, [districtGeoJSON, validLocations]);
  /* =======================================================
     SELECTED DISTRICT
     ======================================================= */

  const activeDistrictName =
    clickedDistrict ||
    selectedDistrict ||
    "";

  const selectedDistrictSummary =
    districtSummaries[
      normalizeDistrictName(
        activeDistrictName
      )
    ] || null;

  /* =======================================================
     FORECAST FRAME STATISTICS
     ======================================================= */

  const forecastFrameStats = useMemo(() => {
    if (mode !== "forecast") {
      return {
        totalPredicted: 0,
        totalPrevious: 0,
        netChange: 0,
        increasing: 0,
        decreasing: 0,
        stable: 0,
        forecastDate: "",
      };
    }

    let totalPredicted = 0;
    let totalPrevious = 0;

    let increasing = 0;
    let decreasing = 0;
    let stable = 0;

    validLocations.forEach((location) => {
      const predicted =
        getCases(location);

      const previous =
        getPreviousCases(
          location
        );

      const change =
        predicted - previous;

      totalPredicted += predicted;
      totalPrevious += previous;

      if (change > 0.5) {
        increasing += 1;
      } else if (change < -0.5) {
        decreasing += 1;
      } else {
        stable += 1;
      }
    });

    return {
      totalPredicted,
      totalPrevious,
      netChange:
        totalPredicted -
        totalPrevious,
      increasing,
      decreasing,
      stable,
      forecastDate:
        validLocations[0]
          ?.forecast_date || "",
    };
  }, [
    validLocations,
    mode,
  ]);

  /* =======================================================
     DISTRICT 3D LAYER
     ======================================================= */

  const districtLayer = useMemo(() => {
    if (!districtGeoJSON) {
      return null;
    }

    return new GeoJsonLayer({
      id: "karnataka-districts-3d",

      data: districtGeoJSON,

      pickable: true,

      filled: true,

      stroked: true,

      extruded: true,

      wireframe: true,

      getElevation: (feature) => {
        const districtName =
          normalizeName(
            getDistrictName(
              feature
            )
          );

        const district =
          districtCaseTotals[
            districtName
          ];

        const cases =
          district?.cases || 0;

        const normalized =
          cases /
          Math.max(
            1,
            maxDistrictCases
          );

        return (
          120 +
          normalized * 1800
        );
      },

      /*
       * Keep district fill transparent.
       * Heatmap remains the main intensity
       * visualization.
       */
      getFillColor: (feature) => {
        const districtName =
          normalizeName(
            getDistrictName(
              feature
            )
          );

        if (
          activeDistrictName &&
          districtName ===
            normalizeName(
              activeDistrictName
            )
        ) {
          return [
            59,
            130,
            246,
            85,
          ];
        }

        return [
          15,
          23,
          42,
          28,
        ];
      },

      getLineColor: [
        203,
        213,
        225,
        215,
      ],

      getLineWidth: 1.2,

      material: {
        ambient: 0.7,
        diffuse: 0.7,
        shininess: 20,
        specularColor: [
          255,
          255,
          255,
        ],
      },

      /* ================================================
         DISTRICT CLICK
         ================================================ */

      onClick: (info) => {
        if (!info?.object) {
          return;
        }

        const districtName =
          getDistrictName(
            info.object
          );

        /*
         * Save locally so the information
         * panel appears inside the map.
         */
        setClickedDistrict(
          districtName
        );

        setSelectedTalukName("");

        /*
         * Focus the selected district so its taluk
         * boundaries become visible without requiring
         * the user to manually zoom first.
         */
        const districtCenter =
          getPolygonCentroid(info.object);

        if (districtCenter) {
          setViewState((previous) => ({
            ...previous,
            longitude: districtCenter[0],
            latitude: districtCenter[1],
            zoom: Math.max(
              Number(previous.zoom) || DEFAULT_VIEW.zoom,
              TALUK_FOCUS_ZOOM
            ),
          }));
        }

        /*
         * Preserve existing parent
         * functionality.
         */
        if (onDistrictSelect) {
          onDistrictSelect(
            districtName
          );
        }
      },

      updateTriggers: {
        getElevation: [
          districtCaseTotals,
          maxDistrictCases,
          forecastDay,
          mode,
        ],

        getFillColor: [
          activeDistrictName,
        ],
      },
    });
  }, [
    districtGeoJSON,
    districtCaseTotals,
    maxDistrictCases,
    activeDistrictName,
    onDistrictSelect,
    forecastDay,
    mode,
  ]);

  /* =======================================================
     DISTRICT OUTLINE
     ======================================================= */

  const districtOutlineLayer =
    useMemo(() => {
      if (!districtGeoJSON) {
        return null;
      }

      return new GeoJsonLayer({
        id: "karnataka-district-outline",

        data: districtGeoJSON,

        pickable: false,

        filled: false,

        stroked: true,

        getLineColor: [
          203,
          213,
          225,
          220,
        ],

        getLineWidth: 1.3,

        lineWidthMinPixels: 1,
      });
    }, [districtGeoJSON]);

  /* =======================================================
     TALUK LAYER
     ======================================================= */

  const selectedDistrictTalukFeatures = useMemo(() => {
    if (!talukGeoJSON?.features?.length || !activeDistrictName) {
      return [];
    }

    const targetDistrict = normalizeDistrictName(activeDistrictName);

    const explicitMatches = talukGeoJSON.features.filter((feature) => {
      const parentDistrict = normalizeDistrictName(getTalukDistrictName(feature));
      return parentDistrict && parentDistrict === targetDistrict;
    });

    const districtFeature = districtGeoJSON?.features?.find(
      (feature) => normalizeDistrictName(getDistrictName(feature)) === targetDistrict
    );

    if (!districtFeature) {
      return explicitMatches;
    }

    /*
     * Some service records have missing/inconsistent parent-district
     * attributes. For the selected district only, supplement explicit
     * matches with geometry-based matches.
     */
    const geometricMatches = talukGeoJSON.features.filter((feature) => {
      const centroid = getPolygonCentroid(feature);

      if (centroid && isPointInsideFeature(centroid, districtFeature)) {
        return true;
      }

      const geometry = feature?.geometry;
      const firstPolygon =
        geometry?.type === "Polygon"
          ? geometry.coordinates
          : geometry?.type === "MultiPolygon"
            ? geometry.coordinates?.[0]
            : null;
      const representativePoint = firstPolygon?.[0]?.[0] || null;

      return (
        representativePoint &&
        isPointInsideFeature(representativePoint, districtFeature)
      );
    });

    const combined = new Map();

    [...explicitMatches, ...geometricMatches].forEach((feature) => {
      const name = normalizeName(getTalukName(feature));
      if (name && !combined.has(name)) {
        combined.set(name, feature);
      }
    });

    return Array.from(combined.values());
  }, [talukGeoJSON, districtGeoJSON, activeDistrictName]);
  const selectedDistrictTalukSummaries = useMemo(() => {
    if (!selectedDistrictTalukFeatures.length) {
      return [];
    }

    return selectedDistrictTalukFeatures
      .map((feature) => {
        const talukName = getTalukName(feature);
        const normalizedTaluk = normalizeName(talukName);

        const matchingLocations = validLocations.filter((location) => {
          const explicitTaluk = normalizeName(
            location?.taluk ||
              location?.Taluk ||
              location?.taluk_name ||
              location?.TALUK ||
              location?.TALUK_NAME
          );

          if (explicitTaluk) {
            return explicitTaluk === normalizedTaluk;
          }

          const point = [
            Number(location?.longitude),
            Number(location?.latitude),
          ];

          return (
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1]) &&
            isPointInsideFeature(point, feature)
          );
        });

        const diseaseCases = {};
        let totalCases = 0;
        let hotspotCount = 0;

        matchingLocations.forEach((location) => {
          const cases = getCases(location);
          const disease = location?.disease || "Unknown";

          totalCases += cases;
          diseaseCases[disease] =
            (diseaseCases[disease] || 0) + cases;

          if (location?.is_hotspot) {
            hotspotCount += 1;
          }
        });

        let dominantDisease = "—";
        let dominantCases = -1;

        Object.entries(diseaseCases).forEach(
          ([disease, cases]) => {
            if (cases > dominantCases) {
              dominantCases = cases;
              dominantDisease = disease;
            }
          }
        );

        return {
          name: talukName,
          feature,
          totalCases,
          locationCount: matchingLocations.length,
          hotspotCount,
          diseaseCases,
          dominantDisease,
        };
      })
      .sort((a, b) => b.totalCases - a.totalCases);
  }, [
    selectedDistrictTalukFeatures,
    validLocations,
  ]);

  const selectedTalukSummary = useMemo(() => {
    if (!selectedTalukName) {
      return null;
    }

    const target = normalizeName(selectedTalukName);

    return (
      selectedDistrictTalukSummaries.find(
        (taluk) => normalizeName(taluk.name) === target
      ) || null
    );
  }, [
    selectedTalukName,
    selectedDistrictTalukSummaries,
  ]);

  const talukLayer = useMemo(() => {
    if (
      !selectedDistrictTalukFeatures.length ||
      Number(viewState.zoom) < TALUK_SHOW_ZOOM
    ) {
      return null;
    }

    return new GeoJsonLayer({
      id: "karnataka-selected-district-taluks",

      data: selectedDistrictTalukFeatures,

      pickable: true,

      filled: false,

      stroked: true,

      getLineColor: (feature) => {
        const name = normalizeName(
          getTalukName(feature)
        );

        if (
          selectedTalukName &&
          name === normalizeName(selectedTalukName)
        ) {
          return [
            56,
            189,
            248,
            230,
          ];
        }

        return [
          148,
          163,
          184,
          150,
        ];
      },

      getLineWidth: (feature) => {
        const name = normalizeName(
          getTalukName(feature)
        );

        return selectedTalukName &&
          name === normalizeName(selectedTalukName)
          ? 2
          : 0.9;
      },

      lineWidthMinPixels: 0.7,

      onClick: (info) => {
        if (!info?.object) {
          return;
        }

        const talukName = getTalukName(
          info.object
        );

        setSelectedTalukName(talukName);

        if (onTalukSelect) {
          onTalukSelect(
            talukName,
            info.object
          );
        }
      },

      updateTriggers: {
        getLineColor: [
          selectedTalukName,
        ],
        getLineWidth: [
          selectedTalukName,
        ],
      },
    });
  }, [
    selectedDistrictTalukFeatures,
    selectedTalukName,
    onTalukSelect,
    viewState.zoom,
  ]);

  /* =======================================================
     HEATMAP
     
     IMPORTANT FIX:
     
     The heatmap radius now adapts to zoom.

     At normal Karnataka view:
       radius ≈ 40px

     When zooming in:
       radius increases

     This prevents the heatmap from visually
     disappearing when the user zooms into a district.
     ======================================================= */

  const heatmapRadius =
    useMemo(() => {
      const zoom =
        Number(viewState.zoom) ||
        DEFAULT_VIEW.zoom;

      /*
       * Base radius.
       */
      const baseRadius = 52;

      /*
       * Increase radius as we zoom in.
       *
       * Example:
       * zoom 5.45 -> ~40px
       * zoom 6.5  -> ~55px
       * zoom 7.5  -> ~70px
       * zoom 8.5  -> ~85px
       */
      const zoomIncrease =
        Math.max(
          0,
          zoom - DEFAULT_VIEW.zoom
        ) * 15;

      return Math.min(
        100,
        baseRadius +
          zoomIncrease
      );
    }, [viewState.zoom]);

  const heatmapIntensity =
    useMemo(() => {
      const zoom =
        Number(viewState.zoom) ||
        DEFAULT_VIEW.zoom;

      const zoomIncrease =
        Math.max(
          0,
          zoom - DEFAULT_VIEW.zoom
        ) * 0.12;

      /*
       * Forecast progression is deliberately reflected in the
       * heatmap itself. As D1 -> D14 advances, the heat field
       * becomes stronger instead of looking visually identical.
       */
      const forecastProgress =
        mode === "forecast"
          ? Math.max(0, Number(forecastDay) - 1) * 0.10
          : 0;

      const forecastBase = mode === "forecast" ? 0.6 : 0;

      return Math.min(3.5, 1.25 + forecastBase + zoomIncrease + forecastProgress);
    }, [viewState.zoom, forecastDay, mode]);

  const heatmapLayer = useMemo(() => {
    if (!validLocations.length) {
      return null;
    }

    return new HeatmapLayer({
      id: "disease-heatmap",

      data: validLocations,

      pickable: false,

      /*
       * The district polygons are extruded (up to ~2 km, scaled by
       * cases) and the heat texture is drawn flat on the ground, so
       * the raised districts hid it ("heat inside the map").
       * Ignore depth so the heat is always painted over them;
       * outlines, taluk borders and markers are later layers and
       * still draw on top of it.
       */
      parameters: {
        depthCompare: "always",
      },

      /*
       * Dynamic radius.
       */
      radiusPixels: heatmapRadius,

      /*
       * Dynamic intensity.
       */
      intensity: heatmapIntensity,

      /*
       * Lower threshold keeps the heatmap
       * visible even for moderate case values.
       */
      threshold: 0.01,

      opacity: 1,

      /*
       * Disease intensity:
       *
       * Blue -> Cyan -> Yellow -> Orange -> Red
       * (alpha raised so the field stays readable on the dark map)
       */
      colorRange: [
        [37, 99, 235, 90],
        [14, 165, 233, 150],
        [34, 197, 94, 185],
        [250, 204, 21, 215],
        [249, 115, 22, 240],
        [239, 68, 68, 255],
      ],

      getPosition: (location) => [
        Number(
          location.longitude
        ),
        Number(
          location.latitude
        ),
      ],

      /*
       * Cases control heat intensity.
       *
       * Square-root scaling prevents
       * one very large location from
       * dominating everything.
       */
      getWeight: (location) => {
        const cases =
          Math.max(
            0,
            getCases(location)
          );

        if (cases <= 0) {
          return 0;
        }

        let weight =
          1 +
          Math.sqrt(cases);

        if (mode === "forecast") {
          const previous = Math.max(1, getPreviousCases(location));
          const change = getForecastChange(location);
          const growthRatio = change / previous;

          /* Positive forecast growth slightly strengthens the local
             heat contribution, while avoiding extreme dominance. */
          const growthBoost =
            1 + Math.max(-0.12, Math.min(0.45, growthRatio * 0.35));

          const dayBoost =
            1 + Math.max(0, Number(forecastDay) - 1) * 0.025;

          weight *= growthBoost * dayBoost;
        }

        return weight;
      },

      aggregation: "SUM",

      updateTriggers: {
        getWeight: [
          validLocations,
          forecastDay,
          mode,
        ],

        getPosition: [
          validLocations,
        ],
      },
    });
  }, [
    validLocations,
    forecastDay,
    mode,
    heatmapRadius,
    heatmapIntensity,
  ]);

  /* =======================================================
     LOCAL DISEASE GLOW
     ======================================================= */

  const localGlowLayer = useMemo(() => {
    if (!validLocations.length) {
      return null;
    }

    return new ScatterplotLayer({
      id: "local-disease-glow",

      data: validLocations,

      pickable: false,

      filled: true,

      stroked: false,

      radiusUnits: "meters",

      getPosition: (location) => [
        Number(
          location.longitude
        ),
        Number(
          location.latitude
        ),
      ],

      getRadius: (location) => {
        const cases =
          getCases(location);

        const normalized =
          Math.sqrt(
            cases /
              Math.max(
                1,
                maxCases
              )
          );

        return (
          900 +
          normalized * 2200
        );
      },

      radiusMinPixels: 2,

      radiusMaxPixels: 8,

      getFillColor: (location) => {
        if (
          location?.is_hotspot
        ) {
          return [
            239,
            68,
            68,
            85,
          ];
        }

        if (
          mode === "forecast"
        ) {
          const change =
            getForecastChange(
              location
            );

          if (change > 0.5) {
            return [
              249,
              115,
              22,
              60,
            ];
          }

          if (change < -0.5) {
            return [
              34,
              197,
              94,
              50,
            ];
          }
        }

        return [
          250,
          204,
          21,
          40,
        ];
      },

      updateTriggers: {
        getRadius: [
          validLocations,
          maxCases,
          forecastDay,
          mode,
        ],

        getFillColor: [
          validLocations,
          forecastDay,
          mode,
        ],
      },
    });
  }, [
    validLocations,
    maxCases,
    forecastDay,
    mode,
  ]);

  /* =======================================================
     DISEASE LOCATION MARKERS
     ======================================================= */

  const markerLayer = useMemo(() => {
    if (!validLocations.length) {
      return null;
    }

    return new ScatterplotLayer({
      id: "disease-location-markers",

      data: validLocations,

      pickable: true,

      stroked: true,

      filled: true,

      radiusUnits: "meters",

      getPosition: (location) => [
        Number(
          location.longitude
        ),
        Number(
          location.latitude
        ),
      ],

      getRadius: (location) => {
        const cases =
          getCases(location);

        const normalized =
          Math.sqrt(
            cases /
              Math.max(
                1,
                maxCases
              )
          );

        let radius =
          800 +
          normalized * 2800;

        if (
          mode === "forecast"
        ) {
          const previous =
            Math.max(
              1,
              getPreviousCases(
                location
              )
            );

          const change =
            getForecastChange(
              location
            );

          const growthFactor =
            1 +
            Math.max(
              -0.2,
              Math.min(
                0.3,
                (change /
                  previous) *
                  0.2
              )
            );

          radius *=
            growthFactor;
        }

        if (
          location?.is_hotspot
        ) {
          radius *= 1.12;
        }

        return radius;
      },

      radiusMinPixels: 3,

      radiusMaxPixels: 16,

      getFillColor: (location) => {
        if (
          location?.is_hotspot
        ) {
          return [
            239,
            68,
            68,
            240,
          ];
        }

        if (
          mode === "forecast"
        ) {
          const change =
            getForecastChange(
              location
            );

          if (change > 0.5) {
            return [
              249,
              115,
              22,
              235,
            ];
          }

          if (change < -0.5) {
            return [
              34,
              197,
              94,
              235,
            ];
          }
        }

        return [
          59,
          130,
          246,
          230,
        ];
      },

      getLineColor: [
        255,
        255,
        255,
        220,
      ],

      getLineWidth: 1,

      onClick: (info) => {
        if (!info?.object) {
          return;
        }

        const location = info.object;
        const longitude = Number(location?.longitude);
        const latitude = Number(location?.latitude);

        let districtName = location?.district || "";

        /*
         * Resolve the location against the actual district geometry.
         * This fixes backend/boundary naming differences and ensures
         * a location can open its district even when the district has
         * no current case summary yet.
         */
        if (
          Number.isFinite(longitude) &&
          Number.isFinite(latitude) &&
          districtGeoJSON?.features?.length
        ) {
          const boundaryDistrict = districtGeoJSON.features.find((feature) =>
            isPointInsideFeature([longitude, latitude], feature)
          );

          if (boundaryDistrict) {
            districtName = getDistrictName(boundaryDistrict);
          }
        }

        if (districtName) {
          setClickedDistrict(districtName);
          setSelectedTalukName("");
        }

        if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
          setViewState((previous) => ({
            ...previous,
            longitude,
            latitude,
            zoom: Math.max(
              Number(previous.zoom) || DEFAULT_VIEW.zoom,
              TALUK_FOCUS_ZOOM
            ),
          }));
        }

        if (onLocationSelect) {
          onLocationSelect(location);
        }
      },

      updateTriggers: {
        getRadius: [
          validLocations,
          maxCases,
          forecastDay,
          mode,
        ],

        getFillColor: [
          validLocations,
          forecastDay,
          mode,
        ],
      },
    });
  }, [
    validLocations,
    maxCases,
    forecastDay,
    mode,
    onLocationSelect,
    districtGeoJSON,
  ]);

  /* =======================================================
     FORECAST CHANGE RINGS
     ======================================================= */

  const forecastChangeLayer =
    useMemo(() => {
      if (
        mode !== "forecast" ||
        !validLocations.length
      ) {
        return null;
      }

      return new ScatterplotLayer({
        id: "forecast-change-rings",

        data: validLocations,

        pickable: false,

        stroked: true,

        filled: false,

        radiusUnits: "meters",

        getPosition: (location) => [
          Number(
            location.longitude
          ),
          Number(
            location.latitude
          ),
        ],

        getRadius: (location) => {
          const absoluteChange =
            Math.abs(
              getForecastChange(
                location
              )
            );

          const normalized =
            Math.sqrt(
              absoluteChange /
                Math.max(
                  1,
                  maxAbsoluteChange
                )
            );

          return (
            1600 +
            normalized * 4000
          );
        },

        radiusMinPixels: 3,

        radiusMaxPixels: 14,

        getLineColor: (location) => {
          const change =
            getForecastChange(
              location
            );

          if (change > 0.5) {
            return [
              239,
              68,
              68,
              235,
            ];
          }

          if (change < -0.5) {
            return [
              34,
              197,
              94,
              235,
            ];
          }

          return [
            148,
            163,
            184,
            120,
          ];
        },

        getLineWidth: (location) => {
          const change =
            Math.abs(
              getForecastChange(
                location
              )
            );

          return change > 0.5
            ? 3
            : 1.5;
        },

        lineWidthMinPixels: 1.5,

        lineWidthMaxPixels: 4,

        updateTriggers: {
          getRadius: [
            validLocations,
            maxAbsoluteChange,
            forecastDay,
          ],

          getLineColor: [
            validLocations,
            forecastDay,
          ],

          getLineWidth: [
            validLocations,
            forecastDay,
          ],
        },
      });
    }, [
      validLocations,
      maxAbsoluteChange,
      forecastDay,
      mode,
    ]);

  /* =======================================================
     DISTRICT LABELS
     ======================================================= */

  const districtLabelData =
    useMemo(() => {
      if (
        !districtGeoJSON ||
        viewState.zoom >=
          LABEL_HIDE_ZOOM
      ) {
        return [];
      }

      return (
        districtGeoJSON.features || []
      )
        .map((feature) => {
          const position =
            getPolygonCentroid(
              feature
            );

          if (!position) {
            return null;
          }

          return {
            name:
              getDistrictName(
                feature
              ),
            position,
          };
        })
        .filter(Boolean);
    }, [
      districtGeoJSON,
      viewState.zoom,
    ]);

  const districtLabelLayer =
    useMemo(() => {
      if (
        !districtLabelData.length
      ) {
        return null;
      }

      return new TextLayer({
        id: "district-labels",

        data: districtLabelData,

        pickable: false,

        getPosition:
          (item) =>
            item.position,

        getText:
          (item) =>
            item.name,

        getSize: 9,

        sizeUnits: "pixels",

        getColor: [
          226,
          232,
          240,
          170,
        ],

        getTextAnchor:
          "middle",

        getAlignmentBaseline:
          "center",

        billboard: true,

        fontFamily:
          "Arial, sans-serif",

        fontWeight: 600,

        outlineWidth: 2,

        outlineColor: [
          15,
          23,
          42,
          220,
        ],
      });
    }, [
      districtLabelData,
    ]);

  /* =======================================================
     TOOLTIP
     ======================================================= */

  const getTooltip = (info) => {
    const object = info?.object;

    if (!object) {
      return null;
    }

    if (
      object.latitude !==
        undefined &&
      object.longitude !==
        undefined
    ) {
      const predicted =
        getCases(object);

      const previous =
        getPreviousCases(object);

      const change =
        predicted - previous;

      if (
        mode === "forecast"
      ) {
        return {
          html: `
            <div style="
              padding:10px;
              min-width:210px;
              font-family:Arial,sans-serif;
            ">
              <div style="
                font-size:15px;
                font-weight:700;
                margin-bottom:6px;
              ">
                ${
                  object.location_name ||
                  "Location"
                }
              </div>

              <div style="margin-bottom:4px;">
                <b>District:</b>
                ${
                  object.district ||
                  "—"
                }
              </div>

              <div style="margin-bottom:4px;">
                <b>Disease:</b>
                ${
                  object.disease ||
                  "—"
                }
              </div>

              <div style="margin-bottom:4px;">
                <b>Previous:</b>
                ${formatNumber(
                  previous
                )}
              </div>

              <div style="margin-bottom:4px;">
                <b>Predicted:</b>
                ${formatNumber(
                  predicted
                )}
              </div>

              <div style="
                margin-bottom:4px;
                font-weight:700;
              ">
                <b>Change:</b>
                ${
                  change >= 0
                    ? "+"
                    : ""
                }
                ${formatNumber(
                  change
                )}
              </div>

              <div>
                <b>Trend:</b>
                ${getTrendLabel(
                  object
                )}
              </div>

              ${
                object.is_hotspot
                  ? `
                    <div style="
                      margin-top:6px;
                      font-weight:700;
                      color:#ef4444;
                    ">
                      ● Current hotspot
                    </div>
                  `
                  : ""
              }
            </div>
          `,
        };
      }

      return {
        html: `
          <div style="
            padding:10px;
            min-width:190px;
            font-family:Arial,sans-serif;
          ">
            <div style="
              font-size:15px;
              font-weight:700;
              margin-bottom:6px;
            ">
              ${
                object.location_name ||
                "Location"
              }
            </div>

            <div style="margin-bottom:4px;">
              <b>District:</b>
              ${
                object.district ||
                "—"
              }
            </div>

            <div style="margin-bottom:4px;">
              <b>Disease:</b>
              ${
                object.disease ||
                "—"
              }
            </div>

            <div style="margin-bottom:4px;">
              <b>Cases:</b>
              ${formatNumber(
                predicted
              )}
            </div>

            ${
              object.is_hotspot
                ? `
                  <div style="
                    margin-top:6px;
                    font-weight:700;
                    color:#ef4444;
                  ">
                    ● Hotspot
                  </div>
                `
                : ""
            }
          </div>
        `,
      };
    }

    if (object.properties) {
      return {
        text:
          getDistrictName(
            object
          ),
      };
    }

    return null;
  };

  /* =======================================================
     MAP LAYERS
     ======================================================= */

  const layers = useMemo(
    () =>
      [
        /*
         * Base 3D districts
         */
        districtLayer,

        /*
         * Disease heatmap
         */
        heatmapLayer,

        /*
         * District boundaries above heatmap
         */
        districtOutlineLayer,

        /*
         * Taluk boundaries
         */
        talukLayer,

        /*
         * Local disease glow
         */
        localGlowLayer,

        /*
         * Actual disease markers
         */
        markerLayer,

        /*
         * Forecast increase/decrease rings
         */
        forecastChangeLayer,

        /*
         * District labels
         */
        districtLabelLayer,
      ].filter(Boolean),
    [
      districtLayer,
      heatmapLayer,
      districtOutlineLayer,
      talukLayer,
      localGlowLayer,
      markerLayer,
      forecastChangeLayer,
      districtLabelLayer,
    ]
  );

  /* =======================================================
     CURRENT DATE
     ======================================================= */

  const currentDate =
    mode === "forecast"
      ? forecastFrameStats.forecastDate
      : validLocations[0]?.date ||
        "";

  /* =======================================================
     RISK COLOR
     ======================================================= */

  const getRiskColor = (risk) => {
    if (risk === "High") {
      return "#f87171";
    }

    if (risk === "Medium") {
      return "#facc15";
    }

    return "#4ade80";
  };

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "600px",
        overflow: "hidden",
        borderRadius: "16px",
        background:
          "linear-gradient(145deg,#020617,#0f172a)",
      }}
    >
      <DeckGL
        initialViewState={
          DEFAULT_VIEW
        }
        viewState={viewState}
        controller={{
          dragPan: false,
          scrollZoom: true,
          doubleClickZoom: true,
          dragRotate: true,
          touchZoom: true,
          touchRotate: true,
        }}
        onViewStateChange={({
          viewState: nextViewState,
        }) =>
          setViewState(
            nextViewState
          )
        }
        layers={layers}
        getTooltip={getTooltip}
        onHover={(info) => {
          const obj = info?.object;
          const isPolygon =
            obj && obj.properties && obj.latitude === undefined;
          const name = isPolygon ? getHoverDistrictLabel(obj) : "";
          setHoverName((prev) => (prev === name ? prev : name));
          hoverPos.current = { x: info?.x || 0, y: info?.y || 0 };
          if (name && hoverRef.current) {
            hoverRef.current.style.transform = `translate(${hoverPos.current.x + 14}px, ${hoverPos.current.y + 14}px)`;
          }
        }}
      />

      {hoverName ? (
        <div
          ref={(el) => {
            hoverRef.current = el;
            if (el) {
              el.style.transform = `translate(${hoverPos.current.x + 14}px, ${hoverPos.current.y + 14}px)`;
            }
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 20,
            pointerEvents: "none",
            padding: "6px 12px",
            borderRadius: "10px",
            background: "rgba(2,6,23,0.92)",
            border: "1px solid rgba(148,163,184,0.35)",
            color: "#f8fafc",
            fontSize: "13px",
            fontWeight: 700,
            whiteSpace: "nowrap",
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          {hoverName}
        </div>
      ) : null}

      {/* ===================================================
          TITLE
          =================================================== */}

      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          padding: "12px 16px",
          borderRadius: "12px",
          background:
            "rgba(2,6,23,0.86)",
          backdropFilter:
            "blur(10px)",
          color: "#f8fafc",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontSize: "17px",
            fontWeight: 700,
          }}
        >
          Karnataka Disease Spread Map
        </div>

        <div
          style={{
            fontSize: "12px",
            marginTop: "3px",
            color: "#cbd5e1",
          }}
        >
          {mode === "forecast"
            ? `Forecast Day ${forecastDay}${
                currentDate
                  ? ` • ${formatDate(
                      currentDate
                    )}`
                  : ""
              }`
            : currentDate
              ? `Current data • ${formatDate(
                  currentDate
                )}`
              : "Current disease data"}
        </div>
      </div>

      {/* ===================================================
          FORECAST SUMMARY
          =================================================== */}

      {mode === "forecast" && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            zIndex: 10,
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            justifyContent:
              "flex-end",
            maxWidth: "470px",
          }}
        >
          <div
            style={{
              padding: "9px 12px",
              borderRadius: "10px",
              background:
                "rgba(2,6,23,0.86)",
              color: "#f8fafc",
              fontSize: "12px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "10px",
              }}
            >
              Predicted cases
            </div>

            <strong>
              {formatNumber(
                forecastFrameStats.totalPredicted
              )}
            </strong>
          </div>

          <div
            style={{
              padding: "9px 12px",
              borderRadius: "10px",
              background:
                "rgba(2,6,23,0.86)",
              color:
                forecastFrameStats.netChange >=
                0
                  ? "#fca5a5"
                  : "#86efac",
              fontSize: "12px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "10px",
              }}
            >
              Net change
            </div>

            <strong>
              {forecastFrameStats.netChange >=
              0
                ? "+"
                : ""}
              {formatNumber(
                forecastFrameStats.netChange
              )}
            </strong>
          </div>

          <div
            style={{
              padding: "9px 12px",
              borderRadius: "10px",
              background:
                "rgba(2,6,23,0.86)",
              color: "#fca5a5",
              fontSize: "12px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "10px",
              }}
            >
              Increasing
            </div>

            <strong>
              {forecastFrameStats.increasing}
            </strong>
          </div>

          <div
            style={{
              padding: "9px 12px",
              borderRadius: "10px",
              background:
                "rgba(2,6,23,0.86)",
              color: "#86efac",
              fontSize: "12px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "10px",
              }}
            >
              Decreasing
            </div>

            <strong>
              {forecastFrameStats.decreasing}
            </strong>
          </div>
        </div>
      )}

      {/* ===================================================
          NEW: DISTRICT INFORMATION PANEL
          =================================================== */}

      {selectedDistrictSummary && (
        <div
          style={{
            position: "absolute",
            top:
              mode === "forecast"
                ? "105px"
                : "16px",
            right: "16px",
            zIndex: 20,
            width: "280px",
            maxWidth:
              "calc(100% - 32px)",
            padding: "15px",
            borderRadius: "14px",
            background:
              "rgba(2,6,23,0.94)",
            backdropFilter:
              "blur(14px)",
            border:
              "1px solid rgba(148,163,184,0.25)",
            boxShadow:
              "0 12px 35px rgba(0,0,0,0.35)",
            color: "#f8fafc",
          }}
        >
          {/* Panel Header */}
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "flex-start",
              marginBottom: "12px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#94a3b8",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.08em",
                }}
              >
                Selected district
              </div>

              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginTop: "2px",
                }}
              >
                {
                  selectedDistrictSummary.name
                }
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setClickedDistrict("");
                setSelectedTalukName("");

                if (onDistrictSelect) {
                  onDistrictSelect("");
                }
              }}
              style={{
                border: "none",
                background:
                  "rgba(148,163,184,0.12)",
                color: "#cbd5e1",
                width: "26px",
                height: "26px",
                borderRadius: "7px",
                cursor: "pointer",
                fontSize: "16px",
              }}
              aria-label="Close district information"
            >
              ×
            </button>
          </div>

          {selectedDistrictSummary.totalCases > 0 ? (
            <>
              {/* Main statistics */}
              <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                padding: "9px",
                borderRadius: "9px",
                background:
                  "rgba(30,41,59,0.75)",
              }}
            >
              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "10px",
                }}
              >
                Total cases
              </div>

              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginTop: "2px",
                }}
              >
                {formatNumber(
                  selectedDistrictSummary.totalCases
                )}
              </div>
            </div>

            <div
              style={{
                padding: "9px",
                borderRadius: "9px",
                background:
                  "rgba(30,41,59,0.75)",
              }}
            >
              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "10px",
                }}
              >
                Risk
              </div>

              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginTop: "2px",
                  color:
                    getRiskColor(
                      selectedDistrictSummary.risk
                    ),
                }}
              >
                {
                  selectedDistrictSummary.risk
                }
              </div>
            </div>
          </div>

          {/* Dominant disease */}
          <div
            style={{
              padding: "9px",
              borderRadius: "9px",
              background:
                "rgba(30,41,59,0.55)",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "10px",
              }}
            >
              Dominant disease
            </div>

            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                marginTop: "2px",
              }}
            >
              {
                selectedDistrictSummary.dominantDisease
              }
            </div>
          </div>

          {/* Disease breakdown */}
          <div
            style={{
              fontSize: "11px",
              color: "#94a3b8",
              marginBottom: "6px",
            }}
          >
            Disease-wise cases
          </div>

              <div
                style={{
                  display: "flex",
                  flexDirection:
                    "column",
                  gap: "5px",
                }}
              >
                {Object.entries(
                  selectedDistrictSummary.diseaseCases
                )
                  .sort(
                    ([, a], [, b]) =>
                      b - a
                  )
                  .map(
                    ([
                      disease,
                      cases,
                    ]) => (
                      <div
                        key={disease}
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          padding:
                            "6px 8px",
                          borderRadius:
                            "7px",
                          background:
                            "rgba(15,23,42,0.75)",
                        }}
                      >
                        <span>
                          {disease}
                        </span>

                        <strong>
                          {formatNumber(
                            cases
                          )}
                        </strong>
                      </div>
                    )
                  )}
              </div>
            </>
          ) : (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px",
                borderRadius: "9px",
                background: "rgba(30,41,59,0.55)",
                color: "#94a3b8",
                fontSize: "11px",
                lineHeight: 1.5,
              }}
            >
              No disease cases are currently recorded in this district.
              <br />
              The district and its taluks are still available for monitoring.
            </div>
          )}

          {/* Taluk access */}
          {selectedDistrictTalukSummaries.length > 0 && (
            <div
              style={{
                marginTop: "12px",
                paddingTop: "10px",
                borderTop:
                  "1px solid rgba(148,163,184,0.15)",
              }}
            >
              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "10px",
                  marginBottom: "6px",
                }}
              >
                Taluks in district
              </div>

              <div
                style={{
                  maxHeight: "150px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  paddingRight: "2px",
                }}
              >
                {selectedDistrictTalukSummaries.map((taluk) => {
                  const selected =
                    normalizeName(taluk.name) ===
                    normalizeName(selectedTalukName);

                  return (
                    <button
                      key={taluk.name}
                      type="button"
                      onClick={() => {
                        setSelectedTalukName(taluk.name);

                        if (onTalukSelect) {
                          onTalukSelect(
                            taluk.name,
                            taluk.feature
                          );
                        }
                      }}
                      style={{
                        border: selected
                          ? "1px solid rgba(56,189,248,0.55)"
                          : "1px solid rgba(148,163,184,0.10)",
                        background: selected
                          ? "rgba(14,116,144,0.22)"
                          : "rgba(15,23,42,0.72)",
                        color: "#e2e8f0",
                        borderRadius: "7px",
                        padding: "6px 8px",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: "10px",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <span>{taluk.name}</span>
                      {selectedDistrictSummary.totalCases > 0 && (
                        <strong>{formatNumber(taluk.totalCases)}</strong>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedTalukSummary && (
                <div
                  style={{
                    marginTop: "7px",
                    padding: "8px",
                    borderRadius: "8px",
                    background: "rgba(14,116,144,0.14)",
                    border: "1px solid rgba(56,189,248,0.18)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#f8fafc",
                    }}
                  >
                    {selectedTalukSummary.name}
                  </div>

                  <div
                    style={{
                      marginTop: "4px",
                      color: "#cbd5e1",
                      fontSize: "10px",
                      lineHeight: 1.5,
                    }}
                  >
                    Cases: <strong>{formatNumber(selectedTalukSummary.totalCases)}</strong>
                    <br />
                    Locations: <strong>{selectedTalukSummary.locationCount}</strong>
                    {selectedTalukSummary.dominantDisease !== "—" && (
                      <>
                        <br />
                        Dominant disease: <strong>{selectedTalukSummary.dominantDisease}</strong>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional information */}
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              marginTop: "10px",
              paddingTop: "9px",
              borderTop:
                "1px solid rgba(148,163,184,0.15)",
              fontSize: "10px",
              color: "#94a3b8",
            }}
          >
            <span>
              Locations:{" "}
              {
                selectedDistrictSummary.locationCount
              }
            </span>

            <span>
              Hotspots:{" "}
              {
                selectedDistrictSummary.hotspotCount
              }
            </span>
          </div>

          {mode === "forecast" && (
            <div
              style={{
                marginTop: "8px",
                fontSize: "9px",
                color: "#64748b",
              }}
            >
              Showing Forecast Day{" "}
              {forecastDay} values
            </div>
          )}
        </div>
      )}

      {/* ===================================================
          LEGEND
          =================================================== */}

      <div
        style={{
          position: "absolute",
          left: "16px",
          bottom: "16px",
          zIndex: 10,
          padding: "12px 14px",
          borderRadius: "12px",
          background:
            "rgba(2,6,23,0.88)",
          backdropFilter:
            "blur(10px)",
          color: "#e2e8f0",
          fontSize: "11px",
          lineHeight: 1.6,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            marginBottom: "6px",
          }}
        >
          Disease intensity
        </div>

        <div
          style={{
            width: "150px",
            height: "10px",
            borderRadius: "6px",
            background:
              "linear-gradient(90deg,#1e40af,#0ea5e9,#facc15,#f97316,#ef4444)",
            marginBottom: "4px",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            width: "150px",
            fontSize: "9px",
            color: "#94a3b8",
          }}
        >
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </div>

        <div
          style={{
            marginTop: "8px",
            display: "flex",
            alignItems: "center",
            gap: "7px",
          }}
        >
          <span
            style={{
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: "#ef4444",
              display: "inline-block",
            }}
          />

          Hotspot
        </div>

        {mode === "forecast" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: "#f97316",
                  display: "inline-block",
                }}
              />

              Increasing
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                }}
              />

              Decreasing
            </div>
          </>
        )}
      </div>

      {/* ===================================================
          LOADING
          =================================================== */}

      {(districtLoading ||
        talukLoading) && (
        <div
          style={{
            position: "absolute",
            right: "16px",
            bottom: "16px",
            zIndex: 10,
            padding: "8px 11px",
            borderRadius: "9px",
            background:
              "rgba(2,6,23,0.82)",
            color: "#cbd5e1",
            fontSize: "11px",
          }}
        >
          Loading map boundaries...
        </div>
      )}

      {/* ===================================================
          FORECAST DISCLAIMER
          =================================================== */}

      {mode === "forecast" && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            zIndex: 10,
            maxWidth: "330px",
            padding: "9px 12px",
            borderRadius: "10px",
            background:
              "rgba(2,6,23,0.82)",
            color: "#cbd5e1",
            fontSize: "10px",
            lineHeight: 1.4,
          }}
        >
          Forecast visualization shows
          model-estimated case intensity
          and day-to-day change. It
          represents a possible future
          pattern, not a guaranteed disease
          movement.
        </div>
      )}
    </div>
  );
}

/* =========================================================
   DEFAULT EXPORT
   ========================================================= */

export default Karnataka3DMap;