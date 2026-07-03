import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import PropertyCard from "../components/PropertyCard.jsx";
import CheckoutModal from "../components/CheckoutModal.jsx";

const pillLabel = s => ({
  paid: "Paid", unpaid: "Unpaid", confirmed: "Confirmed ✓",
  awaiting_payment: "Awaiting payment", pending: "Pending"
}[s] || s);

export default function Account() {
  const { user, shortlist, toast } = useApp();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [mine, setMine] = useState([]);
  const [saved, setSaved] = useState([]);
  const [payInvoice, setPayInvoice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [b, i, all] = await Promise.all([api.get("/bookings"), api.get("/invoices"), api.get("/properties")]);
      setBookings(b.bookings);
      setInvoices(i.invoices);
      setMine(all.properties.filter(p => p.postedBy === user.email));
      setSaved(all.properties.filter(p => shortlist.includes(p.id)));
    } catch (e) { toast(e.message); }
  }, [user, shortlist]); // eslint-disable-line

  useEffect(() => {
    if (!user) { navigate("/login?next=/account"); return; }
    load();
  }, [user, load]); // eslint-disable-line

  if (!user) return null;

  const removeListing = async id => {
    try { await api.del("/properties/" + id); toast("Listing removed"); load(); }
    catch (e) { toast(e.message); }
  };

  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>Hi, {user.name} 👋</h1>
          <p>{user.email} · {user.role || "buyer"}{user.verified ? " · ✅ verified" : ""}</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 30 }}>
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Visits & Payments</span><h2 style={{ fontSize: 24 }}>My site visits</h2></div></div>
          {bookings.length ? (
            <div className="row-list">
              {bookings.map(b => (
                <div className="row-item" key={b.id}>
                  {b.img && <img src={b.img} onError={e => { e.currentTarget.style.display = "none"; }} />}
                  <div className="grow">
                    <b>{b.title || b.property_id}</b>
                    <small>📍 {b.area}, {b.city}{b.date_pref ? " · Preferred: " + b.date_pref : ""}</small>
                  </div>
                  <span className={"pill " + b.status}>{pillLabel(b.status)}</span>
                </div>
              ))}
            </div>
          ) : <div className="empty" style={{ padding: "26px 0" }}><p>No site visits booked yet — open any property and tap "Book a site visit".</p></div>}

          <div className="section-head" style={{ marginTop: 42 }}><div><span className="eyebrow">Billing</span><h2 style={{ fontSize: 24 }}>Invoices</h2></div></div>
          {invoices.length ? (
            <div className="row-list">
              {invoices.map(inv => (
                <div className="row-item" key={inv.id}>
                  <div className="grow">
                    <b>₹{inv.amount.toLocaleString("en-IN")} — {inv.description}</b>
                    <small>{inv.id} · {new Date(inv.created_at).toLocaleDateString("en-IN")}{inv.gateway_ref ? " · ref " + inv.gateway_ref : ""}</small>
                  </div>
                  <span className={"pill " + inv.status}>{pillLabel(inv.status)}</span>
                  {inv.status === "unpaid" && (
                    <button className="btn btn-accent btn-sm" onClick={() => setPayInvoice(inv)}>Pay now</button>
                  )}
                </div>
              ))}
            </div>
          ) : <div className="empty" style={{ padding: "26px 0" }}><p>No invoices yet.</p></div>}

          <div className="section-head" style={{ marginTop: 42 }}><div><span className="eyebrow">Saved</span><h2 style={{ fontSize: 24 }}>My shortlist</h2></div></div>
          {saved.length ? (
            <div className="grid">{saved.map(p => <PropertyCard key={p.id} p={p} />)}</div>
          ) : (
            <div className="empty">
              <h3>No shortlisted homes yet</h3>
              <p style={{ marginTop: 6 }}>Tap the ♥ on any listing to save it here.</p>
              <Link className="btn btn-primary" style={{ marginTop: 16 }} to="/listings">Browse properties</Link>
            </div>
          )}

          <div className="section-head" style={{ marginTop: 46 }}>
            <div><span className="eyebrow">Published</span><h2 style={{ fontSize: 24 }}>My listings</h2></div>
            <Link className="btn btn-accent" to="/post">＋ Post another</Link>
          </div>
          {mine.length ? (
            <div className="grid">
              {mine.map(p => (
                <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <PropertyCard p={p} />
                  <button className="btn btn-ghost btn-sm" onClick={() => removeListing(p.id)}>🗑 Remove listing</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>You haven't posted any property</h3>
              <Link className="btn btn-primary" style={{ marginTop: 16 }} to="/post">Post your property</Link>
            </div>
          )}
        </div>
      </section>

      {payInvoice && (
        <CheckoutModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onPaid={load} />
      )}
    </>
  );
}
