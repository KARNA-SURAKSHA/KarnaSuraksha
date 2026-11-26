import SpreadAnalyticsLazy from "../../../components/spread/SpreadAnalyticsLazy";

export default function SurveillanceAnalytics({
  districtName = "",
}) {
  const district = districtName.trim();

  return (
    <div>
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A9489]">
          District-wide surveillance
        </p>
        <h2 className="mt-1 text-[20px] font-semibold text-[#1F3144]">
          Analytics
        </h2>
        <p className="mt-1 text-[13px] text-[#7A8598]">
          Data visualization and case records
          {district ? ` for ${district} District` : " for the assigned district"}.
        </p>
      </div>
      <SpreadAnalyticsLazy
        district={district}
        casesDistrict={district}
      />
    </div>
  );
}
