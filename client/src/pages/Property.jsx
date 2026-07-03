import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmtPrice, waLink, enquireEmail } from "../api.js";
import { useApp } from "../store.jsx";
import MapPanel from "../components/MapPanel.jsx";
import CheckoutModal from "../components/CheckoutModal.jsx";

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

  useEffect(() => {
    api.get("/properties/" + id)
      .then(d => { setP(d.property); setMainImg(d.property.img); })
      .catch(() => setP(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="spin-center" style={{ minHeight: "50vh" }}><span className="spinner-dark" />Loading…</div>;
  if (!p) return (
    <div className="empty" style={{ minHeight: "40vh" }}>
      <h3>Property not found</h3>
      <Link className="btn btn-primary" style={{ marginTop: 16 }} to="/listings">Browse all properties</Link>
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
    <section className="section" style={{ paddingTop: 34 }}>
      <div className="container">
        <div style={{ marginBottom: 18 }}>
          <Link to="/listings" style={{ color: "var(--brand)", fontWeight: 700, fontSize: 14 }}>← Back to search</Link>
        </div>
        <div className="detail-grid">
          <div>
            <div className="gallery">
              <div className="main"><img src={mainImg} alt={p.title} onError={e => { e.currentTarget.style.display = "none"; }} /></div>
            </div>
            {photos.length > 1 && (
              <div className="thumbs">
                {photos.map(ph => (
                  <img key={ph} src={ph} className={ph === mainImg ? "sel" : ""}
                    onClick={() => setMainImg(ph)} onError={e => e.currentTarget.remove()} />
                ))}
              </div>
            )}

            {p.video && (
              <div className="panel" style={{ marginTop: 18 }}>
                <h3 style={{ marginBottom: 10 }}>Video tour</h3>
                <video controls style={{ width: "100%", borderRadius: 10 }} src={p.video} />
              </div>
            )}

            <div className="panel" style={{ marginTop: 22 }}>
              <h3>About this property</h3>
              <p style={{ color: "var(--muted)", marginTop: 10 }}>{p.desc}</p>
              <div className="spec-list">
                <div className="s"><small>Type</small><b>{isRent ? "For Rent" : "For Sale"} · {p.category === "new" ? "New Project" : "Resale"}</b></div>
                <div className="s"><small>Configuration</small><b>{p.beds} BHK · {p.baths} Bath</b></div>
                <div className="s"><small>Built-up area</small><b>{p.sqft} sqft</b></div>
                <div className="s"><small>Pincode</small><b>{p.pincode}</b></div>
              </div>
            </div>

            {p.lat != null && (
              <div style={{ marginTop: 22 }}>
                <MapPanel properties={[p]} height={340} />
              </div>
            )}
          </div>

          <div className="sidebar-card">
            <div className="panel">
              <div className="price" style={{ fontSize: 30, fontWeight: 800 }}>{fmtPrice(p.priceINR, isRent, currency)}</div>
              <h2 style={{ fontSize: 20, marginTop: 6 }}>{p.title}</h2>
              <div className="loc" style={{ color: "var(--muted)", marginTop: 6 }}>📍 {p.area}, {p.city} — {p.pincode}</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
                <button className="btn btn-accent btn-block" onClick={() => setVisitOpen(true)}>📅 Book a site visit — ₹999 token</button>
                <button className="btn btn-primary btn-block" onClick={() => enquireEmail(p)}>✉ Interested? Enquire by email</button>
                <a className="btn btn-primary btn-block" style={{ background: "var(--wa)" }} target="_blank" rel="noreferrer"
                  href={waLink(`Hi Nestora! I'm interested in "${p.title}" (${p.id}) in ${p.area}, ${p.city}. Please share details / book a visit.`)}>
                  🟢 WhatsApp us
                </a>
                <button className="btn btn-ghost btn-block" onClick={() => toggleShortlist(p.id)}>
                  {saved ? "♥ Shortlisted" : "♡ Add to shortlist"}
                </button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 14 }}>
                The ₹999 visit token is fully refundable and confirms your slot instantly — search → shortlist → visit → invoice → pay → support, all on Nestora.
              </p>
            </div>
          </div>
        </div>
      </div>

      {visitOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setVisitOpen(false)}>
          <div className="modal">
            <div className="pay-head">
              <div><b>Book a site visit</b><small>{p.title} — {p.area}, {p.city}</small></div>
              <button className="x" onClick={() => setVisitOpen(false)}>×</button>
            </div>
            <div className="form-field" style={{ margin: "16px 0" }}>
              <label>Preferred date</label>
              <input type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                value={visitDate} onChange={e => setVisitDate(e.target.value)} />
            </div>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>Preferred time</label>
              <select value={visitTime} onChange={e => setVisitTime(e.target.value)}>
                <option>Morning (10am–12pm)</option><option>Afternoon (12pm–4pm)</option><option>Evening (4pm–7pm)</option>
              </select>
            </div>
            <button className="btn btn-primary btn-block" style={{ height: 46 }} onClick={startBooking} disabled={booking}>
              {booking ? <><span className="spinner" /> Creating booking…</> : "Continue to pay ₹999 token"}
            </button>
            <p className="pay-note">Fully refundable. Your slot is confirmed the moment payment succeeds.</p>
          </div>
        </div>
      )}

      {invoice && (
        <CheckoutModal invoice={invoice} onClose={() => setInvoice(null)}
          onPaid={() => toast("Visit confirmed 🎉 See it under My Account")} />
      )}
    </section>
  );
}
