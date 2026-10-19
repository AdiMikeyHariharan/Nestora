import { useEffect, useState } from "react";
import { api } from "../api.js";

const RANGES = [7, 30, 90];
const fmtDate = d => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Admin: who signed up recently.
export default function AdminUsers() {
  const [days, setDays] = useState(7);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError(""); setUsers(null);
    api.get(`/admin/users?days=${days}`).then(d => setUsers(d.users)).catch(e => setError(e.message));
  }, [days]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight">
          New sign-ups {users && <span className="font-medium text-slate-400">· {users.length} in the last {days} days</span>}
        </h2>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {RANGES.map(r => (
            <button key={r} onClick={() => setDays(r)}
              className={`rounded-lg px-3 py-1 text-xs font-bold ${days === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : !users ? <p className="mt-4 text-sm text-slate-400">Loading…</p> : !users.length ? (
        <p className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-slate-400 ring-1 ring-slate-200">No sign-ups in the last {days} days.</p>
      ) : (
        <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>{["Signed up", "Name", "Email", "Phone", "Role", "Sign-in", "Verified"].map(h => <th key={h} className="px-4 py-2 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.email} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-2 font-semibold text-slate-800">{u.name}</td>
                  <td className="px-4 py-2"><a href={`mailto:${u.email}`} className="text-emerald-700 hover:underline">{u.email}</a></td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{u.phone || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{u.role === "agent" ? "Agent" : "Buyer/Seller"}</td>
                  <td className="px-4 py-2 text-slate-600">{u.method}</td>
                  <td className="px-4 py-2">{u.verified
                    ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">Yes</span>
                    : <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
