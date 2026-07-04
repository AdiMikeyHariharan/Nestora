import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// Landmark autocomplete: type "Anandas" → pick a place → onSelect({name, lat, lng})
export default function GeoSearch({ onSelect, placeholder, light }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounce = useRef();
  const wrapRef = useRef();

  useEffect(() => {
    const close = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const search = value => {
    setText(value);
    clearTimeout(debounce.current);
    if (value.trim().length < 3) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { results } = await api.get("/geocode?q=" + encodeURIComponent(value));
        setResults(results); setOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 450);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        value={text}
        placeholder={placeholder || "Near a landmark — e.g. Anandas, Adyar"}
        onChange={e => search(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {loading && <span className="spin absolute right-3 top-3 h-4 w-4 rounded-full border-2 border-slate-200 border-t-emerald-600" />}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          {results.map((r, i) => (
            <button
              key={i} type="button"
              onClick={() => { onSelect(r); setText(""); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-emerald-50"
            >
              <span className="text-amber-500">📍</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-800">{r.name}</span>
                <span className="block truncate text-xs text-slate-400">{r.full}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
