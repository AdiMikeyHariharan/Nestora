import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import PropertyCard from "../components/PropertyCard.jsx";
import MapPanel from "../components/MapPanel.jsx";
import GeoSearch from "../components/GeoSearch.jsx";
import { SkeletonGrid } from "../components/Skeleton.jsx";

const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
const lbl = "block text-[11px] font-bold uppercase tracking-wide text-slate-500";
const chipCls = active =>
  `rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
    active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-700"
  }`;

const PROPERTY_TYPES = ["Apartment", "Villa", "House", "Plot", "Commercial", "PG/Hostel"];
const AMENITIES = ["Parking", "Lift", "Gym", "Swimming Pool", "Security", "Power Backup", "Pet Friendly"];
const HISTOGRAM_BUCKETS = 20;

// Buckets a list of prices into N equal-width bins between min and max.
// Returns { counts: number[], min, max } where counts[i] = how many prices fall in that bucket.
function buildHistogram(prices, bucketCount = HISTOGRAM_BUCKETS) {
  if (!prices.length) return { counts: new Array(bucketCount).fill(0), min: 0, max: 0 };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(max - min, 1);
  const counts = new Array(bucketCount).fill(0);
  prices.forEach(p => {
    let idx = Math.floor(((p - min) / span) * bucketCount);
    if (idx >= bucketCount) idx = bucketCount - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  });
  return { counts, min, max };
}

function BudgetHistogramSlider({ min, max, counts, valueMin, valueMax, onChange, matchCount, loading }) {
  const range = Math.max(max - min, 1);
  const pctMin = ((valueMin - min) / range) * 100;
  const pctMax = ((valueMax - min) / range) * 100;
  const maxCount = Math.max(...counts, 1);

  const fmt = n => {
    const num = Number(n);
    if (!num) return "0";
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(num % 10000000 === 0 ? 0 : 1)}Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(num % 100000 === 0 ? 0 : 1)}L`;
    return `₹${num.toLocaleString("en-IN")}`;
  };

  return (
    <div className="mt-2">
      <div className="mb-1.5 text-xs font-bold text-emerald-700">
        {loading ? "Calculating…" : `${matchCount} propert${matchCount === 1 ? "y" : "ies"} in this range`}
      </div>
      {/* the "mountain" bars — real counts per price bucket, from currently loaded listings */}
      <div className="flex h-12 items-end gap-[2px]">
        {counts.map((c, i) => {
          const barPct = (i / counts.length) * 100;
          const inRange = barPct >= pctMin && barPct <= pctMax;
          const heightPct = Math.max((c / maxCount) * 100, c > 0 ? 8 : 2);
          return (
            <div
              key={i}
              title={`${c} propert${c === 1 ? "y" : "ies"}`}
              className={`flex-1 rounded-sm transition-colors ${inRange ? "bg-emerald-500" : "bg-slate-200"}`}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>

      {/* dual-thumb range slider overlay */}
      <div className="relative mt-2 h-5">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-emerald-500"
          style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
        />
        <input
          type="range" min={min} max={max} value={valueMin}
          onChange={e => onChange(Math.min(Number(e.target.value), valueMax - 1), valueMax)}
          className="range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
        <input
          type="range" min={min} max={max} value={valueMax}
          onChange={e => onChange(valueMin, Math.max(Number(e.target.value), valueMin + 1))}
          className="range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
      </div>

      <div className="mt-1 flex justify-between text-xs font-bold text-slate-500">
        <span>{fmt(valueMin)}</span>
        <span>{fmt(valueMax)}</span>
      </div>

      <style>{`
        .range-thumb { pointer-events: none; }
        .range-thumb::-webkit-slider-thumb {
          pointer-events: all;
          appearance: none;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #059669;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          cursor: pointer;
          margin-top: -6px;
        }
        .range-thumb::-moz-range-thumb {
          pointer-events: all;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #059669;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .range-thumb::-webkit-slider-runnable-track { background: transparent; }
      `}</style>
    </div>
  );
}

export default function Listings() {
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("");
  const [showMap, setShowMap] = useState(false);

  // Budgetless dataset: same filters (type/category/propertyType/location) but no min/max price,
  // used purely to compute the real price histogram and live in-range count.
  const [budgetlessList, setBudgetlessList] = useState([]);
  const [histogramLoading, setHistogramLoading] = useState(true);

  const [form, setForm] = useState({
    q: params.get("q") || "", pincode: params.get("pincode") || "",
    type: params.get("type") || "", category: params.get("category") || "",
    minBudget: params.get("minBudget") || "",
    budget: params.get("budget") || "",
    furnishing: params.get("furnishing") || "",
    propertyType: params.get("propertyType") || "",
    availability: params.get("availability") || "",
    postedWithin: params.get("postedWithin") || "",
    amenities: params.get("amenities") ? params.get("amenities").split(",") : [],
  });

  // State for user's active geolocation
  const [loc, setLoc] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nst_loc") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!loc && navigator.geolocation && params.get("local") !== "false") {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setLoc(coords);
          localStorage.setItem("nst_loc", JSON.stringify(coords));
        },
        () => {}
      );
    }
  }, [loc, params]);

  const hasExplicitLocation = params.has("q") || params.has("near") || params.has("pincode") || params.get("local") === "false";
  const near = params.get("near") || (!hasExplicitLocation && loc ? `${loc.lat},${loc.lng}` : null);
  const radius = parseFloat(params.get("radius") || (params.get("near") ? "10" : "50"));
  const landmarkName = params.get("lname") || (!params.get("near") && !hasExplicitLocation && loc ? "Your Location" : null);

  const landmark = near ? (() => {
    const [lat, lng] = near.split(",").map(Number);
    return { name: landmarkName || "Selected landmark", lat, lng };
  })() : null;

  useEffect(() => {
    setLoading(true);
    let queryParams = new URLSearchParams(params);
    if (!hasExplicitLocation && loc) {
      queryParams.set("near", `${loc.lat},${loc.lng}`);
      queryParams.set("radius", String(radius));
    }
    api.get("/properties?" + queryParams.toString())
      .then(d => setList(d.properties))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [params, hasExplicitLocation, loc, radius]);

  // Fetch the same result set MINUS the budget filter, so the histogram/count reflect
  // real data for the current location/type/property-type — not a static shape.
  useEffect(() => {
    setHistogramLoading(true);
    const p = new URLSearchParams(params);
    p.delete("minBudget");
    p.delete("budget");
    if (!hasExplicitLocation && loc) {
      p.set("near", `${loc.lat},${loc.lng}`);
      p.set("radius", String(radius));
    }
    api.get("/properties?" + p.toString())
      .then(d => setBudgetlessList(d.properties || []))
      .catch(() => setBudgetlessList([]))
      .finally(() => setHistogramLoading(false));
  }, [params, hasExplicitLocation, loc, radius]);

  const budgetlessPrices = budgetlessList.map(p => p.priceINR).filter(n => typeof n === "number");
  const histogram = buildHistogram(budgetlessPrices);
  const rangeMin = form.minBudget !== "" ? Number(form.minBudget) : histogram.min;
  const rangeMax = form.budget !== "" ? Number(form.budget) : histogram.max;
  const matchCount = budgetlessPrices.filter(p => p >= rangeMin && p <= rangeMax).length;

  const applyFilters = e => {
    e?.preventDefault();
    const p = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => {
      if (k === "amenities") {
        if (v.length) p.set("amenities", v.join(","));
      } else if (v) {
        p.set(k, v);
      }
    });
    if (near) { p.set("near", near); p.set("radius", radius); if (landmarkName) p.set("lname", landmarkName); }
    setParams(p);
  };
  const resetFilters = () => {
    setForm({
      q: "", pincode: "", type: "", category: "", minBudget: "", budget: "",
      furnishing: "", propertyType: "", availability: "", postedWithin: "", amenities: [],
    });
    setParams(new URLSearchParams());
  };
  const toggleAmenity = a => setForm(f => ({
    ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a],
  }));
  const setRadius = km => {
    const p = new URLSearchParams(params);
    p.set("radius", km);
    setParams(p, { replace: true });
  };
  const clearNear = () => {
    const p = new URLSearchParams(params);
    ["near", "radius", "lname"].forEach(k => p.delete(k));
    p.set("local", "false");
    setParams(p);
  };
  const onLandmark = lm => {
    const p = new URLSearchParams(params);
    p.set("near", lm.lat + "," + lm.lng);
    p.set("radius", "10");
    p.set("lname", lm.name);
    p.delete("local");
    setParams(p);
  };

  const [savedSearches, setSavedSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nst_saved_searches") || "[]"); } catch { return []; }
  });
  const persistSearches = next => {
    setSavedSearches(next);
    localStorage.setItem("nst_saved_searches", JSON.stringify(next));
  };
  const saveSearch = () => {
    const qs = params.toString();
    if (!qs) return;
    const bits = [params.get("beds") && params.get("beds") + " BHK", params.get("propertyType") || params.get("type"),
      params.get("q") || (landmarkName && "near " + landmarkName.split(",")[0]),
      params.get("furnishing"), params.get("budget") && "≤₹" + (+params.get("budget")).toLocaleString("en-IN")
    ].filter(Boolean);
    const name = bits.join(" · ") || "All properties";
    if (savedSearches.some(s => s.qs === qs)) return;
    persistSearches([{ name, qs }, ...savedSearches].slice(0, 6));
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
    <div className="mx-auto flex w-[min(1200px,94%)] items-start gap-6 py-6 lg:flex-row flex-col">
      {/* ---- Sidebar filters ---- */}
      <form
        onSubmit={applyFilters}
        className="w-full shrink-0 self-start rounded-3xl bg-white p-5 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 lg:sticky lg:top-4 lg:w-[300px]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-800">Filters</h2>
          <button type="button" onClick={resetFilters} className="text-xs font-bold text-emerald-700 hover:text-emerald-900">Reset</button>
        </div>

        <label className={lbl}>City / Area
          <input className={fieldCls + " mt-1.5"} value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="City or area" />
        </label>

        <label className={lbl + " mt-4 block"}>📍 Near landmark
          <div className="mt-1.5"><GeoSearch onSelect={onLandmark} /></div>
        </label>

        {landmark ? (
          <div className="mt-3 space-y-2.5">
            <span className="inline-flex w-full items-center justify-between gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-800">
              📍 {landmark.name.split(",").slice(0, 2).join(",")}
              <button type="button" onClick={clearNear} title="Clear landmark" className="text-base leading-none hover:text-emerald-950">×</button>
            </span>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-500">
              within
              <input type="range" min="1" max="100" value={radius} onChange={e => setRadius(e.target.value)} className="flex-1" />
              <b className="text-emerald-700">{radius} km</b>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (loc) {
                const p = new URLSearchParams(params);
                p.delete("local");
                setParams(p);
              } else {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
                    setLoc(coords);
                    localStorage.setItem("nst_loc", JSON.stringify(coords));
                    const p = new URLSearchParams(params);
                    p.delete("local");
                    setParams(p);
                  },
                  () => alert("Could not access location. Please check browser settings/permissions.")
                );
              }
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >📍 Use my location</button>
        )}

        <label className={lbl + " mt-4 block"}>Buy / Rent
          <div className="mt-1.5 flex gap-1.5">
            {["", "buy", "rent"].map(t => (
              <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                className={chipCls(form.type === t) + " flex-1"}>
                {t === "" ? "Any" : t === "buy" ? "Buy" : "Rent"}
              </button>
            ))}
          </div>
        </label>

        <label className={lbl + " mt-4 block"}>Property type
          <select className={fieldCls + " mt-1.5"} value={form.propertyType} onChange={e => setForm({ ...form, propertyType: e.target.value })}>
            <option value="">Any</option>
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className={lbl + " mt-4 block"}>New / Resale
          <select className={fieldCls + " mt-1.5"} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            <option value="">Any</option><option value="new">New Project</option><option value="resale">Resale</option>
          </select>
        </label>

        <div className={lbl + " mt-4"}>Budget (₹ min – max)
          <BudgetHistogramSlider
            min={histogram.min} max={histogram.max} counts={histogram.counts}
            valueMin={rangeMin} valueMax={rangeMax}
            matchCount={matchCount} loading={histogramLoading}
            onChange={(lo, hi) => setForm(f => ({ ...f, minBudget: String(lo), budget: String(hi) }))}
          />
        </div>

        <div className={lbl + " mt-4"}>Bedrooms
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["", "1", "1.5", "2", "2.5", "3", "4"].map(b => {
              const active = (params.get("beds") || "") === b;
              return (
                <button key={b} type="button"
                  onClick={() => {
                    const p = new URLSearchParams(params);
                    b ? p.set("beds", b) : p.delete("beds");
                    setParams(p);
                  }}
                  className={chipCls(active)}
                >{b ? `${b} BHK${b === "4" ? "+" : ""}` : "Any"}</button>
              );
            })}
          </div>
        </div>

        <label className={lbl + " mt-4 block"}>Furnishing
          <select className={fieldCls + " mt-1.5"} value={form.furnishing} onChange={e => setForm({ ...form, furnishing: e.target.value })}>
            <option value="">Any</option><option value="furnished">Furnished</option>
            <option value="semi">Semi-furnished</option><option value="unfurnished">Unfurnished</option>
          </select>
        </label>

        <label className={lbl + " mt-4 block"}>Availability
          <select className={fieldCls + " mt-1.5"} value={form.availability} onChange={e => setForm({ ...form, availability: e.target.value })}>
            <option value="">Any</option><option value="ready">Ready to move</option><option value="under_construction">Under construction</option>
          </select>
        </label>

        <div className={lbl + " mt-4"}>Amenities
          <div className="mt-1.5 space-y-1">
            {AMENITIES.map(a => (
              <label key={a} className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <input type="checkbox" checked={form.amenities.includes(a)} onChange={() => toggleAmenity(a)} className="h-4 w-4 accent-emerald-600" />
                {a}
              </label>
            ))}
          </div>
        </div>

        <label className={lbl + " mt-4 block"}>Posted within
          <select className={fieldCls + " mt-1.5"} value={form.postedWithin} onChange={e => setForm({ ...form, postedWithin: e.target.value })}>
            <option value="">Any time</option><option value="1">Today</option>
            <option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
          </select>
        </label>

        <button className="mt-5 h-[42px] w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110">
          Apply filters
        </button>
      </form>

      {/* ---- Listings + map ---- */}
      <div className="min-w-0 flex-1">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-extrabold text-slate-800">{title}</h1>
            <p className="text-sm font-semibold text-slate-500">
              {loading ? "Searching…" : `${list.length} propert${list.length === 1 ? "y" : "ies"} found${near ? " · sorted by distance" : ""}`}
            </p>
            {params.toString() && (
              <button onClick={saveSearch} className="rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                ＋ Save search
              </button>
            )}
            {savedSearches.map(s => (
              <span key={s.qs} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                <button onClick={() => setParams(new URLSearchParams(s.qs))} className="hover:text-emerald-700">{s.name}</button>
                <button aria-label="Remove saved search" onClick={() => persistSearches(savedSearches.filter(x => x.qs !== s.qs))} className="text-slate-400 hover:text-rose-500">×</button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMap(v => !v)}
              className={`rounded-xl border px-3.5 py-2 text-sm font-bold ${showMap ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >🗺️ Map view</button>
            <select
              value={sort} onChange={e => setSort(e.target.value)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">{near ? "Sort: Nearest first" : "Sort: Newest"}</option>
              <option value="asc">Price: Low → High</option>
              <option value="desc">Price: High → Low</option>
            </select>
          </div>
        </div>

        <div className={showMap ? "grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]" : ""}>
          <div>
            {loading ? (
              <SkeletonGrid count={6} />
            ) : sorted.length ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {sorted.map((p, i) => <PropertyCard key={p.id} p={p} delay={Math.min(i, 6) * 60} />)}
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500">
                <h3 className="text-lg font-bold text-slate-700">No properties match</h3>
                <p className="mt-1.5 text-sm">{near ? "Try a bigger radius or clear the landmark." : "Try widening the budget or clearing filters."}</p>
                <button
                  onClick={resetFilters}
                  className="mt-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25"
                >Clear all filters</button>
              </div>
            )}
          </div>
          {showMap && (
            <div className="lg:sticky lg:top-4" style={{ minHeight: 420 }}>
              <MapPanel properties={sorted} landmark={landmark} radiusKm={near ? radius : null} height="calc(100vh - 120px)" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}