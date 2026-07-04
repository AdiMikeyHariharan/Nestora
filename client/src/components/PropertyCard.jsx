import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useApp } from "../store.jsx";
import { fmtPrice, enquireEmail } from "../api.js";

export default function PropertyCard({ p, delay = 0 }) {
  const { shortlist, toggleShortlist, currency } = useApp();
  const saved = shortlist.includes(p.id);
  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: delay / 1000, ease: "easeOut" }}
      whileHover={{ y: -6 }}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition-shadow hover:shadow-2xl hover:shadow-slate-900/10"
    >
      <Link to={`/property/${p.id}`} className="relative block aspect-[16/10] overflow-hidden bg-slate-200">
        <img
          src={p.img} alt={p.title} loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          onError={e => { e.currentTarget.style.display = "none"; }}
        />
        <span className={`absolute left-3 top-3 rounded-lg px-2.5 py-1 text-xs font-bold text-white shadow ${p.category === "new" ? "bg-amber-500" : "bg-emerald-600"}`}>
          {p.category === "new" ? "New Project" : "Resale"}
        </span>
        {p.type === "rent" && (
          <span className="absolute right-14 top-3 rounded-lg bg-slate-800/90 px-2.5 py-1 text-xs font-bold text-white shadow">For Rent</span>
        )}
        {p.distance_km != null && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-slate-900/85 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
            📍 {p.distance_km} km away
          </span>
        )}
        <button
          title="Shortlist"
          onClick={e => { e.preventDefault(); toggleShortlist(p.id); }}
          className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-base shadow transition-transform hover:scale-110 ${saved ? "text-rose-500" : "text-slate-400"}`}
        >♥</button>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-xl font-extrabold text-transparent">
          {fmtPrice(p.priceINR, p.type === "rent", currency)}
        </div>
        <Link to={`/property/${p.id}`} className="font-bold text-slate-900 hover:text-emerald-700">{p.title}</Link>
        <div className="text-sm text-slate-500">📍 {p.area}, {p.city} · {p.pincode}</div>
        <div className="mt-2 flex gap-4 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
          <span>🛏 {p.beds} Beds</span>
          <span>🛁 {p.baths} Baths</span>
          <span>📐 {p.sqft} sqft</span>
        </div>
        <div className="mt-auto flex gap-2 pt-3">
          <Link
            to={`/property/${p.id}`}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-2 text-center text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:brightness-110"
          >View details</Link>
          <button
            onClick={() => enquireEmail(p)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
          >Interested?</button>
        </div>
      </div>
    </motion.article>
  );
}
