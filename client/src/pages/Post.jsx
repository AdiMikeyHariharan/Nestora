import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../store.jsx";

const readAsDataURL = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });

export default function Post() {
  const { user, toast } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [form, setForm] = useState({
    role: "owner", type: "buy", category: "resale", price: "", title: "", desc: "",
    city: "", area: "", pincode: "", sqft: "", beds: "2", baths: "2"
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onPhotos = async e => {
    const files = [...e.target.files].slice(0, 6);
    setPhotos(await Promise.all(files.map(readAsDataURL)));
  };
  const onVideo = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast("Video too large for demo (max ~25MB)"); e.target.value = ""; return; }
    setVideo(await readAsDataURL(f));
  };

  const submit = async e => {
    e.preventDefault();
    if (!user) {
      toast("Please login first — one-time signup");
      setTimeout(() => navigate("/login?next=/post"), 800);
      return;
    }
    setBusy(true);
    try {
      const { id } = await api.post("/properties", {
        title: form.title, type: form.type, category: form.category,
        city: form.city, area: form.area, pincode: form.pincode,
        priceINR: parseInt(form.price, 10), beds: parseInt(form.beds, 10),
        baths: parseInt(form.baths, 10), sqft: parseInt(form.sqft, 10),
        desc: form.desc, photos, video, role: form.role
      });
      toast("Listing published 🎉 (auto-geocoded for landmark search)");
      navigate("/property/" + id);
    } catch (err) {
      toast(err.message);
      if (/verify/i.test(err.message)) setTimeout(() => navigate("/login?next=/post"), 1200);
    }
    setBusy(false);
  };

  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>Post your property — free</h1>
          <p>For owners & realtors. We geocode your locality automatically so buyers find it with landmark search.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 30 }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <form className="panel" onSubmit={submit}>
            <h3 style={{ marginBottom: 18 }}>Property details</h3>
            <div className="form-grid">
              <div className="form-field">
                <label>I am a</label>
                <select value={form.role} onChange={e => set("role", e.target.value)}>
                  <option value="owner">Owner</option><option value="realtor">Realtor / Mediator</option>
                </select>
              </div>
              <div className="form-field">
                <label>Listing for</label>
                <select value={form.type} onChange={e => set("type", e.target.value)}>
                  <option value="buy">Sale</option><option value="rent">Rent</option>
                </select>
              </div>
              <div className="form-field">
                <label>Resale or New</label>
                <select value={form.category} onChange={e => set("category", e.target.value)}>
                  <option value="resale">Resale</option><option value="new">New Project</option>
                </select>
              </div>
              <div className="form-field">
                <label>Expected price (₹)</label>
                <input type="number" min="1" required value={form.price} onChange={e => set("price", e.target.value)} placeholder="e.g. 8500000 (or monthly rent)" />
              </div>
              <div className="form-field full">
                <label>Title</label>
                <input required maxLength={80} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Sunny 2 BHK near Metro" />
              </div>
              <div className="form-field full">
                <label>Description of property</label>
                <textarea required value={form.desc} onChange={e => set("desc", e.target.value)} placeholder="Layout, amenities, age, facing, nearby landmarks…" />
              </div>
              <div className="form-field">
                <label>City</label>
                <input required value={form.city} onChange={e => set("city", e.target.value)} placeholder="e.g. Bengaluru" />
              </div>
              <div className="form-field">
                <label>Area / Locality</label>
                <input required value={form.area} onChange={e => set("area", e.target.value)} placeholder="e.g. Whitefield" />
              </div>
              <div className="form-field">
                <label>Pincode</label>
                <input required pattern="[0-9]{6}" maxLength={6} value={form.pincode} onChange={e => set("pincode", e.target.value)} placeholder="6-digit pincode" inputMode="numeric" />
              </div>
              <div className="form-field">
                <label>Built-up area (sqft)</label>
                <input type="number" min="1" required value={form.sqft} onChange={e => set("sqft", e.target.value)} placeholder="e.g. 1200" />
              </div>
              <div className="form-field">
                <label>Bedrooms</label>
                <select value={form.beds} onChange={e => set("beds", e.target.value)}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>
              </div>
              <div className="form-field">
                <label>Bathrooms</label>
                <select value={form.baths} onChange={e => set("baths", e.target.value)}>{[1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select>
              </div>

              <div className="form-field full">
                <label>Add pictures</label>
                <label className="uploader" style={{ display: "block" }}>
                  📷 Click to add photos (JPG/PNG, up to 6)
                  <input type="file" accept="image/*" multiple hidden onChange={onPhotos} />
                </label>
                {photos.length > 0 && <div className="preview-row">{photos.map((d, i) => <img key={i} src={d} />)}</div>}
              </div>
              <div className="form-field full">
                <label>Add video (optional)</label>
                <label className="uploader" style={{ display: "block" }}>
                  🎬 Click to add a walkthrough video (MP4)
                  <input type="file" accept="video/*" hidden onChange={onVideo} />
                </label>
                {video && <video controls style={{ width: "100%", borderRadius: 10, marginTop: 12 }} src={video} />}
              </div>
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 22, height: 48, fontSize: 16 }} disabled={busy}>
              {busy ? <><span className="spinner" /> Publishing…</> : "Publish listing"}
            </button>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
              One-time signup required — you'll be asked to login if you aren't already.
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
