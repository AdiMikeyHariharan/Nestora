import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// Landmark autocomplete: type "Anandas" → pick a place → onSelect({name, lat, lng})
export default function GeoSearch({ onSelect, placeholder }) {
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
    <div className="geo-wrap" ref={wrapRef}>
      <input
        value={text}
        placeholder={placeholder || "Near a landmark — e.g. Anandas, Adyar"}
        onChange={e => search(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {loading && <span style={{ position: "absolute", right: 12, top: 12 }} className="spinner-dark" />}
      {open && results.length > 0 && (
        <div className="geo-drop">
          {results.map((r, i) => (
            <button key={i} type="button" onClick={() => { onSelect(r); setText(""); setOpen(false); }}>
              <span className="pin-ic">📍</span>
              <span>{r.name}<small>{r.full}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
