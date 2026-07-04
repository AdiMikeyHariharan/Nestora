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
const pillCls = s => ["paid", "confirmed"].includes(s)
  ? "bg-emerald-50 text-emerald-700"
  : "bg-amber-50 text-amber-700";

const SectionHead = ({ eyebrow, title, action }) => (
  <div className="mb-5 mt-12 flex flex-wrap items-end justify-between gap-3 first:mt-0">
    <div>
      <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600">{eyebrow}</span>
      <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight">{title}</h2>
    </div>
    {action}
  </div>
);

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
      <section className="grid-tex bg-slate-950 py-12 text-white">
        <div className="mx-auto w-[min(1200px,94%)]">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Hi, {user.name} 👋</h1>
          <p className="mt-2 text-slate-400">{user.email} · {user.role || "buyer"}{user.verified ? " · ✅ verified" : ""}</p>
        </div>
      </section>

      <div className="mx-auto mt-9 w-[min(1200px,94%)] pb-10">
        <SectionHead eyebrow="Visits & Payments" title="My site visits" />
        {bookings.length ? (
          <div className="space-y-3">
            {bookings.map(b => (
              <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                {b.img && <img src={b.img} className="h-14 w-[74px] rounded-xl object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />}
                <div className="min-w-[180px] flex-1">
                  <b className="block text-[15px]">{b.title || b.property_id}</b>
                  <small className="text-slate-400">📍 {b.area}, {b.city}{b.date_pref ? " · Preferred: " + b.date_pref : ""}</small>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${pillCls(b.status)}`}>{pillLabel(b.status)}</span>
              </div>
            ))}
          </div>
        ) : <p className="py-6 text-center text-slate-400">No site visits booked yet — open any property and tap "Book a site visit".</p>}

        <SectionHead eyebrow="Billing" title="Invoices" />
        {invoices.length ? (
          <div className="space-y-3">
            {invoices.map(inv => (
              <div key={inv.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="min-w-[200px] flex-1">
                  <b className="block text-[15px]">₹{inv.amount.toLocaleString("en-IN")} — {inv.description}</b>
                  <small className="text-slate-400">{inv.id} · {new Date(inv.created_at).toLocaleDateString("en-IN")}{inv.gateway_ref ? " · ref " + inv.gateway_ref : ""}</small>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${pillCls(inv.status)}`}>{pillLabel(inv.status)}</span>
                {inv.status === "unpaid" && (
                  <button
                    onClick={() => setPayInvoice(inv)}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-amber-500/25 hover:brightness-105"
                  >Pay now</button>
                )}
              </div>
            ))}
          </div>
        ) : <p className="py-6 text-center text-slate-400">No invoices yet.</p>}

        <SectionHead eyebrow="Saved" title="My shortlist" />
        {saved.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{saved.map(p => <PropertyCard key={p.id} p={p} />)}</div>
        ) : (
          <div className="py-10 text-center">
            <h3 className="font-bold text-slate-700">No shortlisted homes yet</h3>
            <p className="mt-1 text-sm text-slate-400">Tap the ♥ on any listing to save it here.</p>
            <Link to="/listings" className="mt-4 inline-block rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25">Browse properties</Link>
          </div>
        )}

        <SectionHead
          eyebrow="Published" title="My listings"
          action={<Link to="/post" className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/25 hover:brightness-105">＋ Post another</Link>}
        />
        {mine.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map(p => (
              <div key={p.id} className="flex flex-col gap-2.5">
                <PropertyCard p={p} />
                <button
                  onClick={() => removeListing(p.id)}
                  className="rounded-xl border border-slate-200 py-2 text-sm font-bold text-slate-500 hover:border-rose-300 hover:text-rose-600"
                >🗑 Remove listing</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center">
            <h3 className="font-bold text-slate-700">You haven't posted any property</h3>
            <Link to="/post" className="mt-4 inline-block rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25">Post your property</Link>
          </div>
        )}
      </div>

      {payInvoice && (
        <CheckoutModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onPaid={load} />
      )}
    </>
  );
}
