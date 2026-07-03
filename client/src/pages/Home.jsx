import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import PropertyCard from "../components/PropertyCard.jsx";
import MapPanel from "../components/MapPanel.jsx";
import GeoSearch from "../components/GeoSearch.jsx";

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
  return <b ref={ref}>{val.toLocaleString("en-IN")}{suffix}</b>;
}

export default function Home() {
  const [deal, setDeal] = useState("buy");
  const [featured, setFeatured] = useState([]);
  const [form, setForm] = useState({ q: "", pincode: "", category: "", budget: "" });
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/properties").then(d => setFeatured(d.properties.slice(0, 6))).catch(() => {});
  }, []);

  const runSearch = e => {
    e && e.preventDefault();
    const p = new URLSearchParams({ type: deal });
    Object.entries(form).forEach(([k, v]) => v && p.set(k, v));
    navigate("/listings?" + p);
  };
  const onLandmark = lm => {
    navigate(`/listings?near=${lm.lat},${lm.lng}&radius=10&lname=${encodeURIComponent(lm.name)}&type=${deal}`);
  };

  return (
    <>
      <section className="hero">
        <div className="orb o1" /><div className="orb o2" /><div className="orb o3" />
        <div className="container">
          <span className="eyebrow" style={{ color: "#a7f3d0" }}>One-time signup · Buy · Rent · Resale · New</span>
          <h1>Every home, every landmark — <span className="grad">find your nest.</span></h1>
          <p>Search by city, pincode, budget — or just say "near Anandas". Shortlist, book a visit and pay online.</p>
          <div className="toggle-tabs">
            {["buy", "rent"].map(t => (
              <button key={t} className={deal === t ? "active" : ""} onClick={() => setDeal(t)}>
                {t === "buy" ? "Buy" : "Rent"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="container">
        <form className="search-card" onSubmit={runSearch}>
          <div className="search-grid" style={{ gridTemplateColumns: "1.3fr 1.3fr 1fr 1fr auto" }}>
            <div className="field">
              <label>City / Area</label>
              <input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="e.g. Bengaluru, Adyar" />
            </div>
            <div className="field">
              <label>📍 Near a landmark</label>
              <GeoSearch onSelect={onLandmark} />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">Any</option><option value="new">New Project</option><option value="resale">Resale</option>
              </select>
            </div>
            <div className="field">
              <label>Budget (max)</label>
              <select value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })}>
                <option value="">Any</option>
                <option value="5000000">Up to ₹50 L</option>
                <option value="10000000">Up to ₹1 Cr</option>
                <option value="20000000">Up to ₹2 Cr</option>
                <option value="50000000">Up to ₹5 Cr</option>
                <option value="100000">Rent up to ₹1 L/mo</option>
              </select>
            </div>
            <div className="field">
              <button className="btn btn-primary" style={{ height: 44 }} type="submit">🔍 Search</button>
            </div>
          </div>
          <div className="chip-row">
            <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600, alignSelf: "center" }}>Popular:</span>
            {["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi"].map(c => (
              <button type="button" className="chip" key={c} onClick={() => navigate(`/listings?type=${deal}&q=${c}`)}>{c}</button>
            ))}
          </div>
        </form>
      </div>

      <section className="section" style={{ paddingBottom: 20 }}>
        <div className="container">
          <div className="features">
            <div className="feature reveal in"><div className="ic">🧭</div><h3>Landmark search</h3><p>"2 BHK near Anandas" — geocoded and distance-sorted.</p></div>
            <div className="feature reveal in"><div className="ic">🗺️</div><h3>Live map view</h3><p>Every listing pinned with prices on an interactive map.</p></div>
            <div className="feature reveal in"><div className="ic">💬</div><h3>Smart assistant</h3><p>Chat understands landmarks, budgets and BHK.</p></div>
            <div className="feature reveal in"><div className="ic">💳</div><h3>Book & pay online</h3><p>Reserve site visits with secure online payment.</p></div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 16, paddingBottom: 16 }}>
        <div className="container">
          <div className="stats">
            <div className="stat"><Counter target={1200} suffix="+" /><span>Homes listed</span></div>
            <div className="stat"><Counter target={850} suffix="+" /><span>Happy families</span></div>
            <div className="stat"><Counter target={7} /><span>Cities covered</span></div>
            <div className="stat"><Counter target={98} suffix="%" /><span>Visit satisfaction</span></div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Handpicked</span>
              <h2>Featured properties</h2>
              <p>Fresh listings across new projects and resale homes.</p>
            </div>
            <Link className="btn btn-ghost" to="/listings">View all →</Link>
          </div>
          <div className="grid">
            {featured.map((p, i) => <PropertyCard key={p.id} p={p} delay={i * 70} />)}
          </div>
        </div>
      </section>

      <section className="section flow" id="flow">
        <div className="container">
          <span className="eyebrow" style={{ color: "#5eead4" }}>Our North Star</span>
          <h2 style={{ fontSize: 28 }}>One autonomous journey — search to settle</h2>
          <p style={{ color: "#94a3b8", marginTop: 6, maxWidth: 640 }}>
            Everything happens on Nestora: discover a home, shortlist it, raise a query, book a visit, get an invoice, pay securely and stay supported.
          </p>
          <div className="steps">
            {[["Search", "Landmark, city, pincode, budget"], ["Shortlist", "Save the homes you love"], ["Query", "Chat, WhatsApp or email"],
              ["Book visit", "Confirm an appointment"], ["Invoice & pay", "Transparent, secure"], ["Support", "Post-move assistance"]].map(([h, s], i) => (
              <div className="step" key={h}><div className="n">{i + 1}</div><h4>{h}</h4><p>{s}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Location</span><h2>Explore on the map</h2></div></div>
          <MapPanel properties={featured} height={420} />
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Word of mouth</span><h2>What our clients say</h2></div></div>
          <div className="quotes">
            {[["RK", "Rahul K.", "Bought in Whitefield, Bengaluru", "Shortlisted on Sunday, visited on Wednesday, tokened the flat by Friday. The whole thing — search to payment — happened on Nestora."],
              ["PM", "Priya M.", "Rented in Koramangala, Bengaluru", 'The assistant actually understood "2 BHK under 45k near Koramangala" and showed real options with distances. Rented in a week.'],
              ["AS", "Arjun S.", "Sold in Gachibowli, Hyderabad", "As an owner I posted with photos and a video in 10 minutes, and my flat showed up in landmark searches automatically."]].map(([av, name, sub, text]) => (
              <div className="quote" key={av}>
                <p>{text}</p>
                <div className="who"><span className="av">{av}</span><div><b>{name}</b><small>{sub}</small></div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", background: "linear-gradient(120deg,#ecfdf5,#fff)" }}>
            <div>
              <h2 style={{ fontSize: 24 }}>Own a property? List it free.</h2>
              <p style={{ color: "var(--muted)", marginTop: 4 }}>Owners & realtors — add photos, video and description. We geocode it so buyers find it by landmark.</p>
            </div>
            <Link className="btn btn-accent" to="/post">＋ Post your property</Link>
          </div>
        </div>
      </section>
    </>
  );
}
