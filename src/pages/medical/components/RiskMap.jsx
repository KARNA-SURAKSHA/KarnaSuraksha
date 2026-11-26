import AdminRiskMap from "../../admin/RiskMap";

export default function RiskMap({
  data = [],
  districtName = "",
}) {
  return (
    <AdminRiskMap
      location={{
        district: {
          name: districtName,
        },
      }}
      predictions={data}
    />
  );
}
