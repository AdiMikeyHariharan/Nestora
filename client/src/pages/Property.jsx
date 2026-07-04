import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { api, fmtPrice, waLink, enquireEmail } from "../api.js";
import { useApp } from "../store.jsx";
import MapPanel from "../components/MapPanel.jsx";
import CheckoutModal from "../components/CheckoutModal.jsx";
import MortgageCalc from "../components/MortgageCalc.jsx";
import PropertyCard from "../components/PropertyCard.jsx";

const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
const btnBase = "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all";

export default function Property() {
  const { id } = useParams();
  const { user, shortlist, toggleShortlist, toast, currency } = useApp();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mainImg, setMainImg] = useState("");
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitDate, setVisitDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [visitTime, setVisitTime] = useState("Morning (10am–12pm)");
  const [booking, setBooking] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [similar, setSimilar] = useState([]);

  useEffect(() => {
    api.get("/properties/" + id)
      .then(d => { setP(d.property); setMainImg(d.property.img); return d.property; })
      .then(prop => api.get("/properties").then(({ properties }) => {
        // intelligent picks: same city first, then same configuration, never itself
        const ranked = properties
          .filter(x => x.id !== prop.id)
          .map(x => ({ x, score: (x.city === prop.city ? 2 : 0) + (x.beds === prop.beds ? 1 : 0) + (x.type === prop.type ? 1 : 0) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3).map(r => r.x);
        setSimilar(ranked);
      }))
      .catch(() => setP(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="grid min-h-[50vh] place-items-center text-slate-400">
      <div className="text-center"><span className="spin mx-auto mb-3 block h-7 w-7 rounded-full border-[3px] border-slate-200 border-t-emerald-600" />Loading…</div>
    </div>
  );
  if (!p) return (
    <div className="grid min-h-[40vh] place-items-center text-center">
      <div>
        <h3 className="text-xl font-bold">Property not found</h3>
        <Link to="/listings" className="mt-4 inline-block rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 font-bold text-white shadow-lg shadow-emerald-600/25">Browse all properties</Link>
      </div>
    </div>
  );

  const isRent = p.type === "rent";
  const saved = shortlist.includes(p.id);
  const photos = p.photos && p.photos.length ? p.photos :
    [p.img, ...(p.img && p.img.includes("picsum") ? [1, 2, 3].map(n => p.img.replace("/800/500", `-${n}/800/500`).replace("seed/", "seed/x")) : [])].filter(Boolean);

  const startBooking = async () => {
    if (!user) {
      toast("Please login to book a visit");
      setTimeout(() => navigate("/login?next=" + encodeURIComponent("/property/" + p.id)), 800);
      return;
    }
    setBooking(true);
    try {
      const resp = await api.post("/bookings", { property_id: p.id, date_pref: visitDate + ", " + visitTime });
      setVisitOpen(false);
      setInvoice({ id: resp.invoice_id, amount: resp.amount, description: "Site-visit token — " + p.title });
    } catch (e) { toast(e.message); }
    setBooking(false);
  };

  return (
    <div className="mx-auto mt-8 w-[min(1200px,94%)] pb-10">
      <Link to="/listings" className="text-sm font-bold text-emerald-700 hover:underline">← Back to search</Link>

      <div className="mt-4 grid items-start gap-7 lg:grid-cols-[1.7fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <div className="overflow-hidden rounded-3xl shadow-xl shadow-slate-900/10 ring-1 ring-slate-200">
            <div className="aspect-video bg-slate-200">
              <img src={mainImg} alt={p.title} className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
            </div>
          </div>
          {photos.length > 1 && (
            <div className="mt-2.5 grid grid-cols-4 gap-2.5">
              {photos.map(ph => (
                <img
                  key={ph} src={ph}
                  className={`aspect-[4/3] cursor-pointer rounded-xl object-cover ring-2 transition-all ${ph === mainImg ? "ring-emerald-500" : "ring-transparent hover:ring-emerald-200"}`}
                  onClick={() => setMainImg(ph)} onError={e => e.currentTarget.remove()}
                />
              ))}
            </div>
          )}

          {p.video && (
            <div className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-slate-200">
              <h3 className="mb-3 font-extrabold">Video tour</h3>
              <video controls className="w-full rounded-xl" src={p.video} />
            </div>
          )}

          <div className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-slate-200">
            <h3 className="font-extrabold">About this property</h3>
            <p className="mt-2.5 leading-relaxed text-slate-500">{p.desc}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[["Type", `${isRent ? "For Rent" : "For Sale"} · ${p.category === "new" ? "New Project" : "Resale"}`],
                ["Configuration", `${p.beds} BHK · ${p.baths} Bath`],
                ["Built-up area", `${p.sqft} sqft`],
                ["Pincode", p.pincode]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3.5">
                  <small className="text-xs text-slate-400">{k}</small>
                  <b className="block text-[15px]">{v}</b>
                </div>
              ))}
            </div>
          </div>

          {p.lat != null && (
            <div className="mt-6"><MapPanel properties={[p]} height={340} /></div>
          )}

          {!isRent && <div className="mt-6"><MortgageCalc price={p.priceINR} /></div>}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}
          className="lg:sticky lg:top-[84px]"
        >
          <div className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200">
            <div className="bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              {fmtPrice(p.priceINR, isRent, currency)}
            </div>
            <h2 className="mt-1.5 text-xl font-extrabold">{p.title}</h2>
            <div className="mt-1.5 text-sm text-slate-500">📍 {p.area}, {p.city} — {p.pincode}</div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button onClick={() => setVisitOpen(true)} className={btnBase + " bg-amber-500 text-white shadow-lg shadow-amber-500/30 hover:brightness-105"}>
                📅 Book a site visit — ₹999 token
              </button>
              <button onClick={() => enquireEmail(p)} className={btnBase + " bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-600/25 hover:brightness-110"}>
                ✉ Interested? Enquire by email
              </button>
              <a
                href={waLink(`Hi Nestora! I'm interested in "${p.title}" (${p.id}) in ${p.area}, ${p.city}. Please share details / book a visit.`)}
                target="_blank" rel="noreferrer"
                className={btnBase + " bg-[#25d366] text-white shadow-lg shadow-green-500/25 hover:brightness-105"}
              >🟢 WhatsApp us</a>
              <button
                onClick={() => toggleShortlist(p.id)}
                className={btnBase + ` border ${saved ? "border-rose-300 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700"}`}
              >{saved ? "♥ Shortlisted" : "♡ Add to shortlist"}</button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              The ₹999 visit token is fully refundable and confirms your slot instantly — search → shortlist → visit → invoice → pay → support, all on Nestora.
            </p>
          </div>
        </motion.div>
      </div>

      {similar.length > 0 && (
        <div className="mt-16">
          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600">✨ Picked for you</span>
          <h2 className="mb-6 mt-1 text-2xl font-extrabold tracking-tight">Similar homes you may like</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((sp, i) => <PropertyCard key={sp.id} p={sp} delay={i * 70} />)}
          </div>
        </div>
      )}

      {visitOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setVisitOpen(false)}>
          <motion.div
            initial={{ scale: 0.92, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="w-[400px] max-w-full rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <b className="font-extrabold">Book a site visit</b>
                <p className="mt-0.5 text-xs text-slate-500">{p.title} — {p.area}, {p.city}</p>
              </div>
              <button className="text-2xl leading-none text-slate-400 hover:text-slate-600" onClick={() => setVisitOpen(false)}>×</button>
            </div>
            <label className="mt-5 block text-xs font-bold text-slate-600">Preferred date
              <input type="date" className={fieldCls + " mt-1.5"} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                value={visitDate} onChange={e => setVisitDate(e.target.value)} />
            </label>
            <label className="mt-3.5 block text-xs font-bold text-slate-600">Preferred time
              <select className={fieldCls + " mt-1.5"} value={visitTime} onChange={e => setVisitTime(e.target.value)}>
                <option>Morning (10am–12pm)</option><option>Afternoon (12pm–4pm)</option><option>Evening (4pm–7pm)</option>
              </select>
            </label>
            <button
              onClick={startBooking} disabled={booking}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
            >
              {booking ? (<><span className="spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> Creating booking…</>) : "Continue to pay ₹999 token"}
            </button>
            <p className="mt-3 text-center text-[11px] text-slate-400">Fully refundable. Your slot is confirmed the moment payment succeeds.</p>
          </motion.div>
        </div>
      )}

      {invoice && (
        <CheckoutModal invoice={invoice} onClose={() => setInvoice(null)}
          onPaid={() => toast("Visit confirmed 🎉 See it under My Account")} />
      )}
    </div>
  );
}
