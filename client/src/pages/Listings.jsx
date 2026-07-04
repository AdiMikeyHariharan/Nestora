import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import PropertyCard from "../components/PropertyCard.jsx";
import MapPanel from "../components/MapPanel.jsx";
import GeoSearch from "../components/GeoSearch.jsx";

const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
const lbl = "block text-[11px] font-bold uppercase tracking-wide text-slate-500";

export default function Listings() {
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("");
  const [form, setForm] = useState({
    q: params.get("q") || "", pincode: params.get("pincode") || "",
    type: params.get("type") || "", category: params.get("category") || "",
    minBudget: params.get("minBudget") || "", budget: params.get("budget") || "",
    furnishing: params.get("furnishing") || ""
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
      <section className="grid-tex bg-slate-950 py-12 text-white">
        <div className="mx-auto w-[min(1200px,94%)]">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-slate-400">Search by landmark, city, pincode and budget — with a live map.</p>
        </div>
      </section>

      <div className="mx-auto mt-8 w-[min(1200px,94%)] pb-6">
        <form onSubmit={applyFilters} className="rounded-3xl bg-white p-5 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200">
          <div className="grid items-end gap-3 md:grid-cols-3 xl:grid-cols-[1fr_1fr_0.7fr_0.7fr_1.1fr_0.8fr_auto]">
            <label className={lbl}>City / Area
              <input className={fieldCls + " mt-1.5"} value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="City or area" />
            </label>
            <label className={lbl}>📍 Near landmark
              <div className="mt-1.5"><GeoSearch onSelect={onLandmark} /></div>
            </label>
            <label className={lbl}>Buy / Rent
              <select className={fieldCls + " mt-1.5"} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="">Any</option><option value="buy">Buy</option><option value="rent">Rent</option>
              </select>
            </label>
            <label className={lbl}>Type
              <select className={fieldCls + " mt-1.5"} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">Any</option><option value="new">New Project</option><option value="resale">Resale</option>
              </select>
            </label>
            <label className={lbl}>Budget (₹ min – max)
              <div className="mt-1.5 flex gap-1.5">
                <input className={fieldCls} value={form.minBudget} onChange={e => setForm({ ...form, minBudget: e.target.value })} placeholder="Min" inputMode="numeric" aria-label="Minimum budget" />
                <input className={fieldCls} value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="Max" inputMode="numeric" aria-label="Maximum budget" />
              </div>
            </label>
            <label className={lbl}>Furnishing
              <select className={fieldCls + " mt-1.5"} value={form.furnishing} onChange={e => setForm({ ...form, furnishing: e.target.value })}>
                <option value="">Any</option><option value="furnished">Furnished</option>
                <option value="semi">Semi-furnished</option><option value="unfurnished">Unfurnished</option>
              </select>
            </label>
            <button className="h-[42px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110">
              Filter
            </button>
          </div>

          {/* BHK quick filters (99acres-style facet chips) */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Bedrooms:</span>
            {["", "1", "2", "3", "4"].map(b => {
              const active = (params.get("beds") || "") === b;
              return (
                <button
                  key={b} type="button"
                  onClick={() => {
                    const p = new URLSearchParams(params);
                    b ? p.set("beds", b) : p.delete("beds");
                    setParams(p);
                  }}
                  className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-colors ${active
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-700"}`}
                >{b ? `${b} BHK${b === "4" ? "+" : ""}` : "Any"}</button>
              );
            })}
          </div>

          {landmark && (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-800">
                📍 Near {landmark.name.split(",").slice(0, 2).join(",")}
                <button type="button" onClick={clearNear} title="Clear landmark" className="text-base leading-none hover:text-emerald-950">×</button>
              </span>
              <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-500">
                within
                <input type="range" min="1" max="25" value={radius} onChange={e => setRadius(e.target.value)} className="w-32" />
                <b className="text-emerald-700">{radius} km</b>
              </span>
            </div>
          )}
        </form>

        <div className="mb-5 mt-7 flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-slate-700">
            {loading ? "Searching…" : `${list.length} propert${list.length === 1 ? "y" : "ies"} found${near ? " · sorted by distance" : ""}`}
          </p>
          <select
            value={sort} onChange={e => setSort(e.target.value)}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">{near ? "Sort: Nearest first" : "Sort: Newest"}</option>
            <option value="asc">Price: Low → High</option>
            <option value="desc">Price: High → Low</option>
          </select>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div>
            {loading ? (
              <div className="grid place-items-center py-20 text-slate-400">
                <span className="spin mb-3 h-7 w-7 rounded-full border-[3px] border-slate-200 border-t-emerald-600" />
                Loading properties…
              </div>
            ) : sorted.length ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {sorted.map((p, i) => <PropertyCard key={p.id} p={p} delay={Math.min(i, 6) * 60} />)}
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500">
                <h3 className="text-lg font-bold text-slate-700">No properties match</h3>
                <p className="mt-1.5 text-sm">{near ? "Try a bigger radius or clear the landmark." : "Try widening the budget or clearing filters."}</p>
                <button
                  onClick={() => setParams(new URLSearchParams())}
                  className="mt-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25"
                >Clear all filters</button>
              </div>
            )}
          </div>
          <div className="lg:sticky lg:top-[84px]" style={{ minHeight: 420 }}>
            <MapPanel properties={sorted} landmark={landmark} radiusKm={near ? radius : null} height="calc(100vh - 120px)" />
          </div>
        </div>
      </div>
    </>
  );
}
