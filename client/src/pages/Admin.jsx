import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtPrice } from "../api.js";
import { useApp } from "../store.jsx";
import { usePageMeta } from "../seo.js";
import { PROPERTY_TYPES } from "../lib/propertyTypes.js";

const MAX_PHOTOS = 12;
const MAX_VIDEO_MB = 20; // base64 adds ~33%, and the server accepts 30 MB bodies

// Photos are stored in the database, so shrink them in the browser first:
// a 5 MB phone photo becomes ~250 KB at 1600px.
const compressImage = file => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(img.src);
    resolve(canvas.toDataURL("image/jpeg", 0.8));
  };
  img.onerror = reject;
  img.src = URL.createObjectURL(file);
});

const readAsDataURL = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });

function MediaEditor({ property, onClose, onSaved }) {
  const { toast } = useApp();
  const [photos, setPhotos] = useState(property.photos?.length ? property.photos : (property.img ? [property.img] : []));
  const [video, setVideo] = useState(property.video || null);
  const [busy, setBusy] = useState(false);

  const addPhotos = async e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (photos.length + files.length > MAX_PHOTOS) toast(`Max ${MAX_PHOTOS} photos — extra ones skipped`);
    const room = files.slice(0, MAX_PHOTOS - photos.length);
    try {
      const added = await Promise.all(room.map(compressImage));
      setPhotos(p => [...p, ...added]);
    } catch { toast("Couldn't read one of those images"); }
  };

  const addVideo = async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) { toast(`Video too large — max ${MAX_VIDEO_MB} MB`); return; }
    setVideo(await readAsDataURL(f));
  };

  const makeCover = i => setPhotos(p => [p[i], ...p.filter((_, j) => j !== i)]);
  const remove = i => setPhotos(p => p.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/properties/${property.id}/media`, { photos, video });
      toast("Media saved ✔");
      onSaved();
    } catch (err) { toast(err.message); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-[min(760px,100%)] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight">{property.title}</h3>
            <p className="text-sm text-slate-500">{property.area}, {property.city}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100">Close</button>
        </div>

        <h4 className="mt-6 text-sm font-extrabold">Photos <span className="font-medium text-slate-400">({photos.length}/{MAX_PHOTOS} · first is the cover)</span></h4>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.map((src, i) => (
            <div key={i} className="group relative">
              <img src={src} alt={`Photo ${i + 1}`} className={`aspect-[4/3] w-full rounded-xl object-cover ring-2 ${i === 0 ? "ring-emerald-500" : "ring-slate-200"}`} />
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Cover</span>}
              <div className="absolute inset-x-1.5 bottom-1.5 flex gap-1">
                {i !== 0 && <button onClick={() => makeCover(i)} className="flex-1 rounded-md bg-white/90 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-white">Cover</button>}
                <button onClick={() => remove(i)} className="flex-1 rounded-md bg-rose-600/90 py-0.5 text-[11px] font-bold text-white hover:bg-rose-600">Remove</button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-200 text-center text-xs font-bold text-slate-400 hover:border-emerald-400 hover:text-emerald-600">
              + Add photos
              <input type="file" accept="image/*" multiple hidden onChange={addPhotos} />
            </label>
          )}
        </div>

        <h4 className="mt-7 text-sm font-extrabold">Video <span className="font-medium text-slate-400">(from your phone or laptop · max {MAX_VIDEO_MB} MB)</span></h4>
        {video ? (
          <div className="mt-3">
            <video controls src={video} className="w-full rounded-xl" />
            <div className="mt-2 flex gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-emerald-400">
                Replace video<input type="file" accept="video/*" hidden onChange={addVideo} />
              </label>
              <button onClick={() => setVideo(null)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50">Remove video</button>
            </div>
          </div>
        ) : (
          <label className="mt-3 block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400 hover:border-emerald-400 hover:text-emerald-600">
            + Upload a walkthrough video
            <input type="file" accept="video/*" hidden onChange={addVideo} />
          </label>
        )}

        <button
          onClick={save} disabled={busy}
          className="mt-7 w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
        >{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}

const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
const lbl = "block text-xs font-bold text-slate-600";

function DetailsEditor({ property: p, onClose, onSaved }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    title: p.title || "", type: p.type || "buy", category: p.category || "resale",
    priceINR: p.priceINR ?? "", city: p.city || "", area: p.area || "", pincode: p.pincode || "",
    beds: p.beds ?? 0, baths: p.baths ?? 0, sqft: p.sqft ?? "", desc: p.desc || "",
    furnishing: p.furnishing || "unfurnished", role: p.role === "realtor" ? "realtor" : "owner",
    segment: p.segment === "commercial" ? "commercial" : "residential",
    propertyType: p.propertyType || ""
  });
  const types = PROPERTY_TYPES[f.segment];
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const save = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/properties/${p.id}`, f);
      toast("Listing updated ✔");
      onSaved();
    } catch (err) { toast(err.message); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <form onSubmit={save} className="max-h-[90vh] w-[min(760px,100%)] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight">Edit listing</h3>
            <p className="text-xs text-slate-400">{p.id}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100">Close</button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={lbl + " sm:col-span-2"}>Title
            <input className={fieldCls + " mt-1.5"} required maxLength={80} value={f.title} onChange={e => set("title", e.target.value)} />
          </label>
          <label className={lbl}>Residential or Commercial
            <select className={fieldCls + " mt-1.5"} value={f.segment}
              onChange={e => setF(s => ({ ...s, segment: e.target.value, propertyType: PROPERTY_TYPES[e.target.value][0] }))}>
              <option value="residential">Residential</option><option value="commercial">Commercial</option>
            </select>
          </label>
          <label className={lbl}>Property type
            <select className={fieldCls + " mt-1.5"} required value={f.propertyType} onChange={e => set("propertyType", e.target.value)}>
              {!types.includes(f.propertyType) && <option value="">Choose…</option>}
              {types.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className={lbl}>Listing for
            <select className={fieldCls + " mt-1.5"} value={f.type} onChange={e => set("type", e.target.value)}>
              <option value="buy">Sale</option><option value="rent">Rent</option>
            </select>
          </label>
          <label className={lbl}>{f.type === "rent" ? "Monthly rent (₹)" : "Price (₹)"}
            <input className={fieldCls + " mt-1.5"} type="number" min="1" required value={f.priceINR} onChange={e => set("priceINR", e.target.value)} />
            {+f.priceINR > 0 && <span className="mt-1 block font-medium text-emerald-700">{fmtPrice(+f.priceINR, f.type === "rent", "INR")}</span>}
          </label>
          <label className={lbl}>Resale or New
            <select className={fieldCls + " mt-1.5"} value={f.category} onChange={e => set("category", e.target.value)}>
              <option value="resale">Resale</option><option value="new">New Project</option>
            </select>
          </label>
          <label className={lbl}>Posted by
            <select className={fieldCls + " mt-1.5"} value={f.role} onChange={e => set("role", e.target.value)}>
              <option value="owner">Owner</option><option value="realtor">Dealer / Realtor</option>
            </select>
          </label>
          <label className={lbl}>City
            <input className={fieldCls + " mt-1.5"} required value={f.city} onChange={e => set("city", e.target.value)} />
          </label>
          <label className={lbl}>Area / Locality
            <input className={fieldCls + " mt-1.5"} required value={f.area} onChange={e => set("area", e.target.value)} />
          </label>
          <label className={lbl}>Pincode
            <input className={fieldCls + " mt-1.5"} required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" value={f.pincode} onChange={e => set("pincode", e.target.value)} />
          </label>
          <label className={lbl}>Built-up area (sqft)
            <input className={fieldCls + " mt-1.5"} type="number" min="1" required value={f.sqft} onChange={e => set("sqft", e.target.value)} />
          </label>
          <label className={lbl}>Bedrooms (0 for plots / commercial)
            <select className={fieldCls + " mt-1.5"} value={f.beds} onChange={e => set("beds", e.target.value)}>
              {[0, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 0 ? "None" : `${n} BHK`}</option>)}
            </select>
          </label>
          <label className={lbl}>Bathrooms
            <select className={fieldCls + " mt-1.5"} value={f.baths} onChange={e => set("baths", e.target.value)}>
              {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 0 ? "None" : n}</option>)}
            </select>
          </label>
          <label className={lbl}>Furnishing
            <select className={fieldCls + " mt-1.5"} value={f.furnishing} onChange={e => set("furnishing", e.target.value)}>
              <option value="unfurnished">Unfurnished</option><option value="semi">Semi-furnished</option><option value="furnished">Furnished</option>
            </select>
          </label>
          <label className={lbl + " sm:col-span-2"}>Description
            <textarea className={fieldCls + " mt-1.5 min-h-[110px] resize-y"} required value={f.desc} onChange={e => set("desc", e.target.value)} />
          </label>
        </div>

        <button
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
        >{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </div>
  );
}

export default function Admin() {
  usePageMeta({ title: "Admin", noIndex: true });
  const { user } = useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [editingDetails, setEditingDetails] = useState(null);

  const load = () => api.get("/properties").then(d => setList(d.properties)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { if (user?.role === "admin") load(); }, [user]);

  if (!user || user.role !== "admin") return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <h1 className="text-xl font-extrabold">Admins only</h1>
        <p className="mt-2 text-sm text-slate-500">Log in with the admin account to manage listings.</p>
        <Link to="/login?next=/admin" className="mt-5 inline-block rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 font-bold text-white">Log in</Link>
      </div>
    </div>
  );

  const term = q.trim().toLowerCase();
  const shown = term ? list.filter(p => `${p.title} ${p.area} ${p.city} ${p.id}`.toLowerCase().includes(term)) : list;

  return (
    <div className="mx-auto w-[min(1100px,94%)] py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Admin · Listings</h1>
          <p className="text-sm text-slate-500">{list.length} properties · change photos and videos, or add a new listing.</p>
        </div>
        <Link to="/post" className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110">+ Add new property</Link>
      </div>

      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title, locality, city or ID"
        className="mt-6 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      />

      {loading ? <p className="mt-8 text-sm text-slate-400">Loading…</p> : (
        <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {shown.map(p => (
            <div key={p.id} className="flex items-center gap-4 p-3">
              <img src={p.img} alt={p.title} loading="lazy" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{p.title}</p>
                <p className="truncate text-xs text-slate-500">{p.propertyType || "No type"} · {p.area}, {p.city} · {fmtPrice(p.priceINR, p.type === "rent", "INR")}</p>
              </div>
              <span className="hidden text-xs text-slate-400 sm:block">{p.photos?.length || 0} photos{p.video ? " · video" : ""}</span>
              <Link to={`/property/${p.id}`} className="hidden rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 sm:block">View</Link>
              <button onClick={() => setEditingDetails(p)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">Edit details</button>
              <button onClick={() => setEditing(p)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">Manage media</button>
            </div>
          ))}
          {!shown.length && <p className="p-6 text-center text-sm text-slate-400">No listings match.</p>}
        </div>
      )}

      {editingDetails && (
        <DetailsEditor
          property={editingDetails}
          onClose={() => setEditingDetails(null)}
          onSaved={() => { setEditingDetails(null); load(); }}
        />
      )}

      {editing && (
        <MediaEditor
          property={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
