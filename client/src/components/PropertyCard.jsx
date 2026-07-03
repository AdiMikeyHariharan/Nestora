import { Link } from "react-router-dom";
import { useApp } from "../store.jsx";
import { fmtPrice, enquireEmail } from "../api.js";

export default function PropertyCard({ p, delay = 0 }) {
  const { shortlist, toggleShortlist, currency } = useApp();
  const saved = shortlist.includes(p.id);
  return (
    <article className="card reveal in" style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      <Link className="thumb" to={`/property/${p.id}`}>
        <img src={p.img} alt={p.title} loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} />
        {p.category === "new" ? <span className="badge new">New Project</span> : <span className="badge">Resale</span>}
        {p.type === "rent" && <span className="badge" style={{ left: "auto", right: 56, background: "#334155" }}>For Rent</span>}
        {p.distance_km != null && <span className="dist-badge">📍 {p.distance_km} km away</span>}
        <button
          className={"fav" + (saved ? " active" : "")}
          title="Shortlist"
          onClick={e => { e.preventDefault(); toggleShortlist(p.id); }}
        >♥</button>
      </Link>
      <div className="body">
        <div className="price">{fmtPrice(p.priceINR, p.type === "rent", currency)}</div>
        <Link className="title" to={`/property/${p.id}`}>{p.title}</Link>
        <div className="loc">📍 {p.area}, {p.city} · {p.pincode}</div>
        <div className="specs">
          <span>🛏 {p.beds} Beds</span>
          <span>🛁 {p.baths} Baths</span>
          <span>📐 {p.sqft} sqft</span>
        </div>
        <div className="actions">
          <Link className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }} to={`/property/${p.id}`}>View details</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => enquireEmail(p)}>Interested?</button>
        </div>
      </div>
    </article>
  );
}
