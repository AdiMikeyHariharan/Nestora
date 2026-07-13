import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useApp } from "../store.jsx";
import { fmtPrice, enquireEmail } from "../api.js";
import { BedIcon, BathIcon, RulerIcon, PinIcon, HeartIcon } from "./icons.jsx";

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
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-lg bg-slate-900/85 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
            <PinIcon size={12} /> {p.distance_km} km away
          </span>
        )}
        <button
          title="Shortlist" aria-label={saved ? "Remove from shortlist" : "Add to shortlist"}
          onClick={e => { e.preventDefault(); toggleShortlist(p.id); }}
          className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow transition-transform hover:scale-110 ${saved ? "text-rose-500" : "text-slate-400"}`}
        ><HeartIcon filled={saved} size={17} /></button>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-xl font-extrabold text-transparent">
            {fmtPrice(p.priceINR, p.type === "rent", currency)}
          </div>
          {p.type !== "rent" && p.sqft > 0 && (
            <span className="text-xs font-semibold text-slate-400">₹{Math.round(p.priceINR / p.sqft).toLocaleString("en-IN")}/sqft</span>
          )}
        </div>
        <Link to={`/property/${p.id}`} className="font-bold text-slate-900 hover:text-emerald-700">{p.title}</Link>
        <div className="inline-flex items-center gap-1.5 text-sm text-slate-500"><PinIcon size={13} className="shrink-0 text-slate-400" /> {p.area}, {p.city} · {p.pincode}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          {p.postedBy === "seed" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">✓ Nestora Verified</span>
          ) : (
            <span className="rounded-md bg-sky-50 px-2 py-0.5 capitalize text-sky-700">By {p.role === "realtor" ? "Dealer" : "Owner"}</span>
          )}
          <span className={`rounded-md px-2 py-0.5 ${p.category === "new" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}>
            {p.category === "new" ? "New Launch" : "Ready to Move"}
          </span>
          {p.furnishing && <span className="rounded-md bg-slate-100 px-2 py-0.5 capitalize text-slate-600">{p.furnishing === "semi" ? "Semi-furnished" : p.furnishing}</span>}
          {p.createdAt && <span className="text-slate-400">Posted {(d => d < 1 ? "today" : d < 30 ? Math.round(d) + "d ago" : Math.round(d / 30) + "mo ago")((Date.now() - new Date(p.createdAt)) / 86400000)}</span>}
        </div>
        <div className="mt-2 flex gap-4 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5"><BedIcon size={14} className="text-slate-400" /> {p.beds} Beds</span>
          <span className="inline-flex items-center gap-1.5"><BathIcon size={14} className="text-slate-400" /> {p.baths} Baths</span>
          <span className="inline-flex items-center gap-1.5"><RulerIcon size={14} className="text-slate-400" /> {p.sqft} sqft</span>
        </div>
        <div className="mt-auto flex gap-2 pt-3">
          <Link
            to={`/property/${p.id}`}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-2 text-center text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:brightness-110"
          >View details</Link>
          <Link
            to={`/property/${p.id}?chat=true`}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
          >Interested?</Link>
        </div>
      </div>
    </motion.article>
  );
}
