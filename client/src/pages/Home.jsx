import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../api.js";
import { nlToUrl } from "../lib/nlsearch.js";
import { useApp } from "../store.jsx";
import PropertyCard from "../components/PropertyCard.jsx";
import MapPanel from "../components/MapPanel.jsx";
import GeoSearch from "../components/GeoSearch.jsx";
import { SkeletonGrid } from "../components/Skeleton.jsx";

function Counter({ target, suffix = "" }) {
  const ref = useRef();
  const [val, setVal] = useState(0);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now(), dur = 1400;
      const tick = t => {
        const k = Math.min(1, (t - t0) / dur);
        setVal(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <b ref={ref} className="block bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">{val.toLocaleString("en-IN")}{suffix}</b>;
}

const Section = ({ children, className = "" }) => (
  <section className={`mx-auto w-[min(1200px,94%)] ${className}`}>{children}</section>
);

const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";

function AISearchBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const go = async (value) => {
    const query = (value ?? text).trim();
    if (!query || busy) return;
    setBusy(true);
    try { navigate(await nlToUrl(query)); } finally { setBusy(false); }
  };

  return (
    <div className="mt-9 max-w-2xl">
      <form
        onSubmit={e => { e.preventDefault(); go(); }}
        className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl transition-all focus-within:border-emerald-400/60 focus-within:bg-white/15"
      >
        <span className="pl-3 text-lg" aria-hidden>✨</span>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder='Describe your dream home… "3 BHK near Whitefield under 2 Cr"'
          aria-label="Describe the home you're looking for"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-white placeholder-slate-400 outline-none"
        />
        <button
          disabled={busy}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-2.5 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-500/30 transition-all hover:brightness-110 disabled:opacity-70"
        >
          {busy ? <span className="spin h-4 w-4 rounded-full border-2 border-emerald-900/30 border-t-emerald-900" /> : "Search"}
        </button>
      </form>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">Try:</span>
        {["2 BHK near Adyar", "Villa in Hyderabad under 3 Cr", "Rent in Koramangala under 50k"].map(s => (
          <button
            key={s} onClick={() => { setText(s); go(s); }}
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur transition-colors hover:border-emerald-400/60 hover:text-emerald-200"
          >{s}</button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { shortlist } = useApp();
  const [deal, setDeal] = useState("buy");
  const [featured, setFeatured] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ q: "", category: "", budget: "" });
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/properties")
      .then(d => { setAll(d.properties); setFeatured(d.properties.slice(0, 6)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Intelligent picks: homes in the same cities as your shortlist, not yet saved
  const recommended = (() => {
    if (!shortlist.length || !all.length) return [];
    const savedCities = new Set(all.filter(p => shortlist.includes(p.id)).map(p => p.city));
    return all.filter(p => savedCities.has(p.city) && !shortlist.includes(p.id)).slice(0, 3);
  })();

  const runSearch = e => {
    e && e.preventDefault();
    const p = new URLSearchParams({ type: deal });
    Object.entries(form).forEach(([k, v]) => v && p.set(k, v));
    navigate("/listings?" + p);
  };
  const onLandmark = lm =>
    navigate(`/listings?near=${lm.lat},${lm.lng}&radius=10&lname=${encodeURIComponent(lm.name)}&type=${deal}`);

  return (
    <>
      {/* HERO — full-bleed cinematic photography (2026 luxury RE pattern) */}
      <section className="grain relative overflow-hidden bg-slate-950 pb-28 pt-16 text-white">
        <img
          src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=2000&q=75"
          alt="" aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/45 to-slate-950/10" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950/55 to-transparent" />

        <Section className="relative z-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-xs font-bold tracking-wide text-emerald-300">
              ✦ One-time signup · Buy · Rent · Resale · New Projects
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-6xl lg:text-7xl">
              Every home, every landmark —{" "}
              <span className="serif-accent text-shimmer font-semibold">find your nest.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Just describe it — our AI understands landmarks, budgets and BHK. Shortlist and book a visit.
            </p>
            <AISearchBar />
            <div className="mt-8 inline-flex rounded-2xl bg-white/10 p-1.5 backdrop-blur">
              {["buy", "rent"].map(t => (
                <button
                  key={t} onClick={() => setDeal(t)}
                  className={`rounded-xl px-7 py-2.5 text-sm font-bold transition-all ${deal === t ? "bg-white text-emerald-700 shadow-lg" : "text-white/85 hover:text-white"}`}
                >{t === "buy" ? "Buy" : "Rent"}</button>
              ))}
            </div>
          </motion.div>
        </Section>
      </section>

      {/* SEARCH CARD */}
      <Section className="relative z-20 -mt-16">
        <motion.form
          initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.15 }}
          onSubmit={runSearch}
          className="rounded-3xl bg-white/90 p-5 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200 backdrop-blur-xl"
        >
          <div className="grid items-end gap-3 md:grid-cols-[1.2fr_1.2fr_0.9fr_0.9fr_auto]">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">City / Area
              <input className={fieldCls + " mt-1.5"} value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="e.g. Bengaluru, Adyar" />
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">📍 Near a landmark
              <div className="mt-1.5"><GeoSearch onSelect={onLandmark} /></div>
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Type
              <select className={fieldCls + " mt-1.5"} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">Any</option><option value="new">New Project</option><option value="resale">Resale</option>
              </select>
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Budget (max)
              <select className={fieldCls + " mt-1.5"} value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })}>
                <option value="">Any</option>
                <option value="5000000">Up to ₹50 L</option>
                <option value="10000000">Up to ₹1 Cr</option>
                <option value="20000000">Up to ₹2 Cr</option>
                <option value="50000000">Up to ₹5 Cr</option>
                <option value="100000">Rent up to ₹1 L/mo</option>
              </select>
            </label>
            <button className="h-[42px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110">
              🔍 Search
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Popular:</span>
            {["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi"].map(c => (
              <button
                type="button" key={c}
                onClick={() => navigate(`/listings?type=${deal}&q=${c}`)}
                className="rounded-full border border-slate-200 px-3.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:border-emerald-500 hover:text-emerald-700"
              >{c}</button>
            ))}
          </div>
        </motion.form>
      </Section>

      {/* CITY MARQUEE */}
      <div className="mt-14 overflow-hidden border-y border-slate-200 bg-white py-4" aria-hidden>
        <div className="marquee-track flex w-max items-center gap-10">
          {[...Array(2)].flatMap((_, r) =>
            ["BENGALURU", "MUMBAI", "CHENNAI", "HYDERABAD", "PUNE", "DELHI", "AHMEDABAD"].map(c => (
              <span key={r + c} className="flex items-center gap-10 text-sm font-extrabold tracking-[0.3em] text-slate-300">
                {c} <i className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            )))}
        </div>
      </div>

      {/* FEATURES — bento grid */}
      <Section className="mt-14">
        <div className="grid gap-4 lg:grid-cols-3 lg:grid-rows-2">
          <motion.div
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="grain relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white lg:row-span-2"
          >
            <div className="blob absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-emerald-500/30 blur-[70px]" />
            <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-300">AI-first</span>
            <h3 className="mt-3 text-2xl font-extrabold leading-snug">Speak, don't filter.<br /><span className="serif-accent font-semibold text-emerald-300">"2 BHK near Anandas"</span></h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">Our search understands landmarks, budgets and BHK in plain language — geocoded and sorted by distance. The assistant remembers your conversation too.</p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300 backdrop-blur">
              ✨ "villa in Hyderabad under 3 cr" → <b className="text-emerald-300">1 match, 0.4 km from Gachibowli</b>
            </div>
          </motion.div>
          {[["Live map view", "Every listing pinned with prices, landmark circles and radius control on an interactive map."],
            ["Mortgage clarity", "Per-home EMI calculator with down-payment, rate and tenure sliders — know your monthly before you visit."],
            ["Owner-friendly listing", "Post with photos and video; we geocode your locality so buyers find you by landmark."]].map(([h, s], i) => (
            <motion.div
              key={h}
              initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.45 }}
              className="rounded-[2rem] bg-white p-7 ring-1 ring-slate-200 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5"
            >
              <h3 className="text-lg font-extrabold tracking-tight">{h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{s}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* STATS */}
      <Section className="mt-10">
        <div className="grid gap-4 rounded-3xl bg-white p-8 ring-1 ring-slate-200 sm:grid-cols-4">
          {[[1200, "+", "Homes listed"], [850, "+", "Happy families"], [7, "", "Cities covered"], [98, "%", "Visit satisfaction"]].map(([n, suf, label]) => (
            <div key={label} className="text-center">
              <Counter target={n} suffix={suf} />
              <span className="mt-1 block text-sm font-semibold text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* FEATURED */}
      <Section className="mt-16">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600">Handpicked</span>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Featured properties</h2>
            <p className="mt-1 text-slate-500">Fresh listings across new projects and resale homes.</p>
          </div>
          <Link to="/listings" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
            View all →
          </Link>
        </div>
        {loading ? <SkeletonGrid count={6} /> : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, i) => <PropertyCard key={p.id} p={p} delay={i * 70} />)}
          </div>
        )}
      </Section>

      {/* RECENTLY VIEWED */}
      {(() => {
        let ids = [];
        try { ids = JSON.parse(localStorage.getItem("nst_recent") || "[]"); } catch { /* ignore */ }
        const recent = ids.map(id => all.find(p => p.id === id)).filter(Boolean).slice(0, 3);
        return recent.length ? (
          <Section className="mt-16">
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600">Continue exploring</span>
            <h2 className="mb-6 mt-1 text-3xl font-extrabold tracking-tight">Recently viewed</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((p, i) => <PropertyCard key={p.id} p={p} delay={i * 70} />)}
            </div>
          </Section>
        ) : null;
      })()}

      {/* RECOMMENDED (personalized from shortlist) */}
      {recommended.length > 0 && (
        <Section className="mt-16">
          <div className="mb-7">
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600">✨ Picked for you</span>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Because of your shortlist</h2>
            <p className="mt-1 text-slate-500">Homes in the neighbourhoods you've been saving.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((p, i) => <PropertyCard key={p.id} p={p} delay={i * 70} />)}
          </div>
        </Section>
      )}

      {/* NORTH STAR FLOW */}
      <section id="flow" className="grid-tex mt-20 bg-slate-950 py-16 text-white">
        <Section>
          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-teal-300">Our North Star</span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">One autonomous journey — search to settle</h2>
          <p className="mt-2 max-w-xl text-slate-400">
            Everything happens on Nestora: discover a home, shortlist it, raise a query, book a visit, get an invoice, pay securely and stay supported.
          </p>
          <div className="mt-9 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Search", "Landmark, city, budget"], ["Shortlist", "Save homes you love"], ["Query", "Chat, WhatsApp, email"],
              ["Book visit", "Confirm an appointment"], ["Invoice & pay", "Transparent, secure"], ["Support", "Post-move assistance"]].map(([h, s], i) => (
              <motion.div
                key={h}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
              >
                <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-300 text-sm font-extrabold text-emerald-950">{i + 1}</div>
                <h4 className="text-sm font-bold">{h}</h4>
                <p className="mt-0.5 text-xs text-slate-400">{s}</p>
              </motion.div>
            ))}
          </div>
        </Section>
      </section>

      {/* MAP */}
      <Section className="mt-16">
        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600">Location</span>
        <h2 className="mb-6 mt-1 text-3xl font-extrabold tracking-tight">Explore on the map</h2>
        <MapPanel properties={featured} height={430} />
      </Section>

      {/* TESTIMONIALS */}
      <Section className="mt-16">
        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600">Word of mouth</span>
        <h2 className="mb-7 mt-1 text-3xl font-extrabold tracking-tight">What our clients say</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {[["RK", "Rahul K.", "Bought in Whitefield, Bengaluru", "Shortlisted on Sunday, visited on Wednesday, tokened the flat by Friday. The whole thing — search to payment — happened on Nestora."],
            ["PM", "Priya M.", "Rented in Koramangala, Bengaluru", 'The assistant actually understood "2 BHK under 45k near Koramangala" and showed real options with distances. Rented in a week.'],
            ["AS", "Arjun S.", "Sold in Gachibowli, Hyderabad", "As an owner I posted with photos and a video in 10 minutes, and my flat showed up in landmark searches automatically."]].map(([av, name, sub, text], i) => (
            <motion.div
              key={av}
              initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl bg-white p-6 ring-1 ring-slate-200"
            >
              <div className="mb-2 font-serif text-5xl leading-none text-emerald-300">“</div>
              <p className="text-[15px] text-slate-700">{text}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-400 text-sm font-extrabold text-white">{av}</span>
                <div><b className="block text-sm">{name}</b><small className="text-slate-400">{sub}</small></div>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* POST CTA */}
      <Section className="mt-16">
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-8 ring-1 ring-emerald-100">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Own a property? List it free.</h2>
            <p className="mt-1 text-slate-500">Owners & realtors — add photos, video and description. We geocode it so buyers find it by landmark.</p>
          </div>
          <Link to="/post" className="rounded-xl bg-amber-500 px-6 py-3 font-bold text-white shadow-lg shadow-amber-500/30 hover:brightness-105">
            ＋ Post your property
          </Link>
        </div>
      </Section>
    </>
  );
}
