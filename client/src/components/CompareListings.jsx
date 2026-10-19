import { useState } from "react";
import { Link } from "react-router-dom";
import { fmtPrice } from "../api.js";
import { useApp } from "../store.jsx";
import { placeOf } from "../lib/location.js";

const MAX = 3;
const perSqft = p => p.type !== "rent" && p.sqft > 0 ? Math.round(p.priceINR / p.sqft) : null;

// Side-by-side comparison of up to 3 shortlisted listings. The best value in each
// comparable row (lowest price, lowest price/sqft, largest area) is highlighted.
export default function CompareListings({ listings }) {
  const { currency } = useApp();
  const [picked, setPicked] = useState([]);
  if (listings.length < 2) return null;

  const toggle = id => setPicked(s => s.includes(id) ? s.filter(x => x !== id) : s.length < MAX ? [...s, id] : s);
  const cols = picked.map(id => listings.find(p => p.id === id)).filter(Boolean);
  const best = (val, pick) => { const vals = cols.map(val).filter(v => v != null); return vals.length > 1 ? pick(...vals) : null; };
  const rows = [
    ["Price", p => fmtPrice(p.priceINR, p.type === "rent", currency), best(p => p.priceINR, Math.min), p => p.priceINR],
    ["Price / sqft", p => perSqft(p) ? `₹${perSqft(p).toLocaleString("en-IN")}` : "—", best(perSqft, Math.min), perSqft],
    ["Built-up area", p => `${p.sqft.toLocaleString("en-IN")} sqft`, best(p => p.sqft, Math.max), p => p.sqft],
    ["Bedrooms", p => p.beds ? `${p.beds} BHK` : "—"],
    ["Bathrooms", p => p.baths || "—"],
    ["Locality", p => placeOf(p)],
    ["Type", p => p.propertyType || "—"],
    ["Furnishing", p => ({ semi: "Semi-furnished", furnished: "Furnished", unfurnished: "Unfurnished" })[p.furnishing] || "—"],
    ["Status", p => p.category === "new" ? "New launch" : "Ready to move"],
    ["For", p => p.type === "rent" ? "Rent" : "Sale"]
  ];

  return (
    <div className="mb-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm font-extrabold">Compare <span className="font-medium text-slate-400">· pick up to {MAX}</span></p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {listings.map(p => {
          const on = picked.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} disabled={!on && picked.length >= MAX}
              className={`max-w-[240px] truncate rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-40 ${on ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
              {on ? "✓ " : ""}{p.title}
            </button>
          );
        })}
      </div>

      {cols.length >= 2 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] table-fixed text-sm">
            <thead>
              <tr>
                <th className="w-32" />
                {cols.map(p => (
                  <th key={p.id} className="px-3 pb-2 text-left align-bottom">
                    <div className="mb-2 h-28 overflow-hidden rounded-lg bg-slate-100">
                      <img src={p.img} alt="" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                    </div>
                    <Link to={`/property/${p.id}`} className="font-extrabold text-slate-800 hover:text-emerald-700">{p.title}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([label, show, bestVal, val]) => (
                <tr key={label}>
                  <td className="py-2 pr-3 text-xs font-bold text-slate-500">{label}</td>
                  {cols.map(p => {
                    const isBest = bestVal != null && val(p) === bestVal;
                    return <td key={p.id} className={`px-3 py-2 ${isBest ? "font-extrabold text-emerald-700" : "text-slate-700"}`}>{show(p)}{isBest ? " ✓" : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Select at least 2 homes to see them side by side.</p>
      )}
    </div>
  );
}
