import { Link, useLocation } from "react-router-dom";

// Shown wherever exact location (locality, landmark search, map) is members-only.
export default function LocationLock({ text = "Sign up free to see exact locations, search by locality or landmark, and explore on the map.", className = "" }) {
  const { pathname, search } = useLocation();
  const next = encodeURIComponent(pathname + search);
  return (
    <div className={`rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-4 text-center text-sm text-slate-600 ${className}`}>
      <p>🔒 {text}</p>
      <div className="mt-2.5 flex justify-center gap-2">
        <Link to={`/login?mode=signup&next=${next}`} className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-xs font-bold text-white hover:brightness-110">Sign up free</Link>
        <Link to={`/login?next=${next}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-emerald-400">Log in</Link>
      </div>
    </div>
  );
}
