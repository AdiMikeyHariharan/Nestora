import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";

const readAsDataURL = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
const lbl = "block text-xs font-bold text-slate-600";

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
        priceINR: parseInt(form.price, 10), beds: parseFloat(form.beds),
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
      <section className="grid-tex bg-slate-950 py-12 text-white">
        <div className="mx-auto w-[min(1200px,94%)]">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Post your property — free</h1>
          <p className="mt-2 text-slate-400">For owners & realtors. We geocode your locality automatically so buyers find it with landmark search.</p>
        </div>
      </section>

      <div className="mx-auto mt-9 w-[min(820px,94%)] pb-10">
        <motion.form
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          onSubmit={submit}
          className="rounded-3xl bg-white p-7 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200"
        >
          <h3 className="mb-5 text-lg font-extrabold">Property details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={lbl}>I am a
              <select className={fieldCls + " mt-1.5"} value={form.role} onChange={e => set("role", e.target.value)}>
                <option value="owner">Owner</option><option value="realtor">Realtor / Mediator</option>
              </select>
            </label>
            <label className={lbl}>Listing for
              <select className={fieldCls + " mt-1.5"} value={form.type} onChange={e => set("type", e.target.value)}>
                <option value="buy">Sale</option><option value="rent">Rent</option>
              </select>
            </label>
            <label className={lbl}>Resale or New
              <select className={fieldCls + " mt-1.5"} value={form.category} onChange={e => set("category", e.target.value)}>
                <option value="resale">Resale</option><option value="new">New Project</option>
              </select>
            </label>
            <label className={lbl}>Expected price (₹)
              <input className={fieldCls + " mt-1.5"} type="number" min="1" required value={form.price} onChange={e => set("price", e.target.value)} placeholder="e.g. 8500000 (or monthly rent)" />
            </label>
            <label className={lbl + " sm:col-span-2"}>Title
              <input className={fieldCls + " mt-1.5"} required maxLength={80} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Sunny 2 BHK near Metro" />
            </label>
            <label className={lbl + " sm:col-span-2"}>Description of property
              <textarea className={fieldCls + " mt-1.5 min-h-[110px] resize-y"} required value={form.desc} onChange={e => set("desc", e.target.value)} placeholder="Layout, amenities, age, facing, nearby landmarks…" />
            </label>
            <label className={lbl}>City
              <input className={fieldCls + " mt-1.5"} required value={form.city} onChange={e => set("city", e.target.value)} placeholder="e.g. Bengaluru" />
            </label>
            <label className={lbl}>Area / Locality
              <input className={fieldCls + " mt-1.5"} required value={form.area} onChange={e => set("area", e.target.value)} placeholder="e.g. Whitefield" />
            </label>
            <label className={lbl}>Pincode
              <input className={fieldCls + " mt-1.5"} required pattern="[0-9]{6}" maxLength={6} value={form.pincode} onChange={e => set("pincode", e.target.value)} placeholder="6-digit pincode" inputMode="numeric" />
            </label>
            <label className={lbl}>Built-up area (sqft)
              <input className={fieldCls + " mt-1.5"} type="number" min="1" required value={form.sqft} onChange={e => set("sqft", e.target.value)} placeholder="e.g. 1200" />
            </label>
            <label className={lbl}>Bedrooms
              <select className={fieldCls + " mt-1.5"} value={form.beds} onChange={e => set("beds", e.target.value)}>{["1", "1.5", "2", "2.5", "3", "4", "5"].map(n => <option key={n} value={n}>{n} BHK</option>)}</select>
            </label>
            <label className={lbl}>Bathrooms
              <select className={fieldCls + " mt-1.5"} value={form.baths} onChange={e => set("baths", e.target.value)}>{[1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select>
            </label>

            <div className="sm:col-span-2">
              <span className={lbl}>Add pictures</span>
              <label className="mt-1.5 block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 p-7 text-center text-sm font-semibold text-slate-400 transition-colors hover:border-emerald-400 hover:text-emerald-600">
                📷 Click to add photos (JPG/PNG, up to 6)
                <input type="file" accept="image/*" multiple hidden onChange={onPhotos} />
              </label>
              {photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.map((d, i) => <img key={i} src={d} className="h-16 w-20 rounded-lg object-cover ring-1 ring-slate-200" />)}
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <span className={lbl}>Add video (optional)</span>
              <label className="mt-1.5 block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 p-7 text-center text-sm font-semibold text-slate-400 transition-colors hover:border-emerald-400 hover:text-emerald-600">
                🎬 Click to add a walkthrough video (MP4)
                <input type="file" accept="video/*" hidden onChange={onVideo} />
              </label>
              {video && <video controls className="mt-3 w-full rounded-xl" src={video} />}
            </div>
          </div>
          <button
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
          >
            {busy ? (<><span className="spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> Publishing…</>) : "Publish listing"}
          </button>
          <p className="mt-3.5 text-center text-xs text-slate-400">One-time signup required — you'll be asked to login if you aren't already.</p>
        </motion.form>
      </div>
    </>
  );
}
