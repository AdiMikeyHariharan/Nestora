import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  const [leads, setLeads] = useState([]);
  const [payInvoice, setPayInvoice] = useState(null);
  const [cal, setCal] = useState({ configured: false, connected: false });
  const [params, setParams] = useSearchParams();

  // Geolocation and clustered recommendations
  const [loc, setLoc] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nst_loc") || "null");
    } catch {
      return null;
    }
  });
  const [recClusters, setRecClusters] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState("");

  const getGeoLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocError("Geolocation is not supported by your browser");
      return;
    }
    setLocLoading(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLoc(coords);
        localStorage.setItem("nst_loc", JSON.stringify(coords));
      },
      (error) => {
        setLocLoading(false);
        setLocError("Location access denied or unavailable. Please share location to see nearby recommendations.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, []);

  const load = useCallback(async () => {
    try {
      const [b, i, all, l] = await Promise.all([
        api.get("/bookings"), 
        api.get("/invoices"), 
        api.get("/properties"),
        api.get("/leads").catch(() => ({ leads: [] }))
      ]);
      setBookings(b.bookings);
      setInvoices(i.invoices);
      setMine(all.properties.filter(p => p.postedBy === user.email));
      setSaved(all.properties.filter(p => shortlist.includes(p.id)));
      setLeads(l.leads || []);
    } catch (e) { toast(e.message); }
  }, [user, shortlist]); // eslint-disable-line

  useEffect(() => {
    if (!user) { navigate("/login?next=/account"); return; }
    load();
  }, [user, load]); // eslint-disable-line

  useEffect(() => {
    if (user && !loc && !locError) {
      getGeoLocation();
    }
  }, [user, loc, locError, getGeoLocation]);

  useEffect(() => {
    if (!loc) return;
    setLocLoading(true);
    api.get(`/properties/recommended?lat=${loc.lat}&lng=${loc.lng}`)
      .then(res => {
        setRecClusters(res.clusters || []);
        setLocLoading(false);
      })
      .catch(e => {
        toast(e.message);
        setLocLoading(false);
      });
  }, [loc, toast]);

  // Google Calendar connection status + OAuth-return handling.
  useEffect(() => {
    if (!user) return;
    api.get("/calendar/status").then(setCal).catch(() => {});
    const c = params.get("calendar");
    if (c === "connected") { toast("Google Calendar connected ✓"); setCal(s => ({ ...s, connected: true })); }
    else if (c === "error") toast("Calendar connection failed — please try again");
    if (c) { params.delete("calendar"); setParams(params, { replace: true }); }
  }, [user]); // eslint-disable-line

  const connectCalendar = async () => {
    try {
      const { url } = await api.get("/calendar/connect-url");
      window.location.href = url;
    } catch (e) { toast(e.message); }
  };

  if (!user) return null;

  const removeListing = async id => {
    try { await api.del("/properties/" + id); toast("Listing removed"); load(); }
    catch (e) { toast(e.message); }
  };

  const updateLeadStatus = async (id, status) => {
    try {
      await api.post(`/leads/${id}/status`, { status });
      toast(`Lead ${status}`);
      load();
    } catch (e) { toast(e.message); }
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
        {/* Google Calendar connect — visit bookings land on the seller's calendar */}
        {cal.configured && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-2xl">📅</span>
              <div>
                <h3 className="font-extrabold tracking-tight">Google Calendar</h3>
                <p className="text-sm text-slate-500">
                  {cal.connected
                    ? "Connected. Site-visit bookings for your listings are added to your calendar automatically."
                    : "Connect your calendar so buyers' site-visit bookings appear on it automatically."}
                </p>
              </div>
            </div>
            {cal.connected ? (
              <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">✓ Connected</span>
            ) : (
              <button
                onClick={connectCalendar}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
                  <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.2-7-5.1L1.2 17.2C3.2 21.2 7.3 24 12 24z" />
                  <path fill="#FBBC05" d="M5 14.3c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.2 6.8C.4 8.4 0 10.1 0 12s.4 3.6 1.2 5.2L5 14.3z" />
                  <path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17 1 14.2 0 12 0 7.3 0 3.2 2.8 1.2 6.8L5 9.7c1-2.9 3.8-5.1 7-5.1z" />
                </svg>
                Connect Google Calendar
              </button>
            )}
          </div>
        )}

        <SectionHead
          eyebrow="Personalized Picks"
          title="Properties Near You"
          action={loc ? (
            <button
              onClick={() => {
                localStorage.removeItem("nst_loc");
                setLoc(null);
                setRecClusters([]);
              }}
              className="text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
            >
              🔄 Reset Location
            </button>
          ) : null}
        />

        {locLoading && (
          <div className="flex flex-col items-center justify-center py-12 rounded-2xl bg-white ring-1 ring-slate-200">
            <span className="spin h-8 w-8 rounded-full border-4 border-emerald-600/30 border-t-emerald-600 mb-3" />
            <p className="text-sm font-semibold text-slate-500">Retrieving location and clustering nearby properties...</p>
          </div>
        )}

        {locError && (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-300 bg-white ring-1 ring-slate-200">
            <span className="text-3xl mb-2" role="img" aria-label="location">📍</span>
            <h3 className="font-bold text-slate-700">Location access required</h3>
            <p className="mt-1 text-sm text-slate-400 max-w-md">{locError}</p>
            <button
              onClick={getGeoLocation}
              className="mt-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-transform hover:scale-[1.02] cursor-pointer"
            >
              Allow Location Access
            </button>
          </div>
        )}

        {!locLoading && !locError && !loc && (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-300 bg-white ring-1 ring-slate-200">
            <span className="text-3xl mb-2" role="img" aria-label="location">📍</span>
            <h3 className="font-bold text-slate-700">Find homes near you</h3>
            <p className="mt-1 text-sm text-slate-400 max-w-md">Enable location access to automatically find property clusters near your current geographic position.</p>
            <button
              onClick={getGeoLocation}
              className="mt-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-transform hover:scale-[1.02] cursor-pointer"
            >
              Share Location
            </button>
          </div>
        )}

        {!locLoading && !locError && loc && recClusters.length === 0 && (
          <p className="py-6 text-center text-slate-400 bg-white rounded-2xl ring-1 ring-slate-200">We couldn't find any properties listed near your coordinates.</p>
        )}

        {!locLoading && !locError && loc && recClusters.length > 0 && (
          <div className="space-y-8">
            {recClusters.map((cluster) => (
              <div key={cluster.id} className="rounded-3xl bg-slate-50/50 p-6 ring-1 ring-slate-200/60">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${cluster.isCluster ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {cluster.isCluster ? `✨ Proximity Cluster (${cluster.size} homes)` : "📍 Nearby Listing"}
                    </span>
                    <h3 className="mt-1 text-lg font-extrabold text-slate-900">
                      Properties near {cluster.name}
                    </h3>
                  </div>
                  <span className="text-sm font-bold text-slate-500">
                    ~ {cluster.distance_km} km away
                  </span>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {cluster.properties.map((p, idx) => (
                    <PropertyCard key={p.id} p={p} delay={idx * 70} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <SectionHead eyebrow="Visits & Payments" title="My site visits" />
        {bookings.length ? (
          <div className="space-y-3">
            {bookings.map(b => (
              <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                {b.img && <img src={b.img} alt={b.title || "Property"} loading="lazy" className="h-14 w-[74px] rounded-xl object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />}
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

        {(user.role === "agent" || user.role === "buyer/seller") && mine.length > 0 && (
          <>
            <SectionHead eyebrow="Lead Gen" title="Property Leads" />
            {leads.length ? (
              <div className="space-y-4">
                {leads.map(lead => (
                  <div key={lead.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                    <div className="flex flex-wrap justify-between gap-4">
                      <div>
                        <b className="text-[15px]">{lead.property_title}</b>
                        <div className="mt-1 text-sm text-slate-500">
                          Buyer: {lead.buyer_email}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${lead.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : lead.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                          {lead.status.toUpperCase()}
                        </span>
                        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                          Confidence: <span className={`rounded px-1.5 py-0.5 text-white ${lead.confidence_rating >= 8 ? 'bg-emerald-500' : lead.confidence_rating >= 5 ? 'bg-amber-500' : 'bg-rose-500'}`}>{lead.confidence_rating}/10</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 border border-slate-100">
                      <strong>AI Summary:</strong> {lead.chat_summary}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {lead.status === "pending" && (
                        <>
                          <button onClick={() => updateLeadStatus(lead.id, "accepted")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700">Accept Lead</button>
                          <button onClick={() => updateLeadStatus(lead.id, "rejected")} className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100">Reject</button>
                        </>
                      )}
                      {lead.status === "accepted" && lead.buyer_phone && (
                        <a 
                          href={`https://wa.me/${lead.buyer_phone.replace(/[^0-9]/g, '')}?text=Hi, I'm the owner/agent for ${lead.property_title} on Nestora. Let's discuss your requirements!`}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-bold text-white shadow-md shadow-[#25D366]/20 hover:brightness-105"
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                          Chat on WhatsApp (Premium)
                        </a>
                      )}
                      {lead.status === "accepted" && !lead.buyer_phone && (
                        <span className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500">No phone provided by buyer</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-slate-400">No leads generated yet. Check back later!</p>
            )}
          </>
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
