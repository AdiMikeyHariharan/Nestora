import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import PropertyCard from "../components/PropertyCard.jsx";
import MapPanel from "../components/MapPanel.jsx";
import GeoSearch from "../components/GeoSearch.jsx";

export default function Listings() {
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("");
  const [form, setForm] = useState({
    q: params.get("q") || "", pincode: params.get("pincode") || "",
    type: params.get("type") || "", category: params.get("category") || "", budget: params.get("budget") || ""
  });

  const near = params.get("near");
  const radius = parseFloat(params.get("radius") || "10");
  const landmarkName = params.get("lname");
  const landmark = near ? (() => {
    const [lat, lng] = near.split(",").map(Number);
    return { name: landmarkName || "Selected landmark", lat, lng };
  })() : null;

  useEffect(() => {
    setLoading(true);
    api.get("/properties?" + params.toString())
      .then(d => setList(d.properties))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [params]);

  const applyFilters = e => {
    e.preventDefault();
    const p = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => v && p.set(k, v));
    if (near) { p.set("near", near); p.set("radius", radius); if (landmarkName) p.set("lname", landmarkName); }
    setParams(p);
  };
  const setRadius = km => {
    const p = new URLSearchParams(params);
    p.set("radius", km);
    setParams(p, { replace: true });
  };
  const clearNear = () => {
    const p = new URLSearchParams(params);
    ["near", "radius", "lname"].forEach(k => p.delete(k));
    setParams(p);
  };
  const onLandmark = lm => {
    const p = new URLSearchParams(params);
    p.set("near", lm.lat + "," + lm.lng);
    p.set("radius", "10");
    p.set("lname", lm.name);
    setParams(p);
  };

  const sorted = [...list];
  if (sort === "asc") sorted.sort((a, b) => a.priceINR - b.priceINR);
  if (sort === "desc") sorted.sort((a, b) => b.priceINR - a.priceINR);

  const title = near ? `Homes near ${landmark.name.split(",")[0]}`
    : params.get("type") === "buy" ? "Homes for Sale"
    : params.get("type") === "rent" ? "Homes for Rent"
    : params.get("category") === "new" ? "New Projects"
    : params.get("category") === "resale" ? "Resale Homes" : "Properties";

  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>{title}</h1>
          <p>Search by landmark, city, pincode and budget — with a live map.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 28 }}>
        <div className="container">
          <form className="search-card" style={{ marginTop: 0 }} onSubmit={applyFilters}>
            <div className="search-grid" style={{ gridTemplateColumns: "1.2fr 1.2fr 0.8fr 0.9fr 0.9fr auto" }}>
              <div className="field">
                <label>City / Area</label>
                <input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="City or area" />
              </div>
              <div className="field">
                <label>📍 Near landmark</label>
                <GeoSearch onSelect={onLandmark} />
              </div>
              <div className="field">
                <label>Buy / Rent</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="">Any</option><option value="buy">Buy</option><option value="rent">Rent</option>
                </select>
              </div>
              <div className="field">
                <label>Type</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">Any</option><option value="new">New Project</option><option value="resale">Resale</option>
                </select>
              </div>
              <div className="field">
                <label>Budget (max ₹)</label>
                <input value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="e.g. 10000000" inputMode="numeric" />
              </div>
              <div className="field">
                <button className="btn btn-primary" style={{ height: 44 }} type="submit">Filter</button>
              </div>
            </div>
            {landmark && (
              <div className="chip-row" style={{ alignItems: "center" }}>
                <span className="near-chip">
                  📍 Near {landmark.name.split(",").slice(0, 2).join(",")}
                  <button type="button" onClick={clearNear} title="Clear landmark">×</button>
                </span>
                <span className="radius-row">
                  within
                  <input type="range" min="1" max="25" value={radius} onChange={e => setRadius(e.target.value)} />
                  <b style={{ color: "var(--brand)" }}>{radius} km</b>
                </span>
              </div>
            )}
          </form>

          <div className="section-head" style={{ marginTop: 26 }}>
            <p style={{ fontWeight: 700 }}>
              {loading ? "Searching…" : `${list.length} propert${list.length === 1 ? "y" : "ies"} found${near ? " · sorted by distance" : ""}`}
            </p>
            <select className="currency" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="">{near ? "Sort: Nearest first" : "Sort: Newest"}</option>
              <option value="asc">Price: Low → High</option>
              <option value="desc">Price: High → Low</option>
            </select>
          </div>

          <div className="split">
            <div>
              {loading ? (
                <div className="spin-center"><span className="spinner-dark" />Loading properties…</div>
              ) : sorted.length ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                  {sorted.map((p, i) => <PropertyCard key={p.id} p={p} delay={Math.min(i, 6) * 60} />)}
                </div>
              ) : (
                <div className="empty">
                  <h3>No properties match</h3>
                  <p style={{ marginTop: 6 }}>{near ? "Try a bigger radius or clear the landmark." : "Try widening the budget or clearing filters."}</p>
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setParams(new URLSearchParams())}>Clear all filters</button>
                </div>
              )}
            </div>
            <div className="map-sticky">
              <MapPanel properties={sorted} landmark={landmark} radiusKm={near ? radius : null} height="100%" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
