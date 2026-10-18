import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

const RANGES = [7, 30, 90];
const fmtDay = d => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const num = n => (n ?? 0).toLocaleString("en-IN");

function Tile({ label, value, note }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{num(value)}</p>
      {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

// Daily unique visitors. Single series, so the title names it and no legend is needed.
function DailyChart({ daily }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...daily.map(d => d.visitors));
  const h = daily[hover];
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm font-extrabold">Visitors per day</p>
      <div className="relative mt-4 flex h-44">
        <div className="flex w-8 shrink-0 flex-col justify-between pb-5 text-right text-[10px] text-slate-400">
          <span>{num(max)}</span><span>0</span>
        </div>
        <div className="relative ml-2 flex-1">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-100" />
          <div className="absolute inset-x-0 bottom-5 flex items-end gap-[2px] border-b border-slate-200" style={{ top: 0 }}
            onMouseLeave={() => setHover(null)}>
            {daily.map((d, i) => (
              // Full-height column is the hit target; the bar inside is the mark.
              <div key={d.day} className="flex h-full flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)}>
                <div className={`w-full rounded-t ${hover === i ? "bg-emerald-700" : "bg-emerald-500"}`}
                  style={{ height: `${(d.visitors / max) * 100}%`, minHeight: d.visitors ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-slate-400">
            <span>{daily[0] && fmtDay(daily[0].day)}</span><span>{daily.at(-1) && fmtDay(daily.at(-1).day)}</span>
          </div>
          {h && (
            // Anchor toward the middle near either edge so the tooltip never leaves the card.
            <div className={`pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg ${
                (hover + 0.5) / daily.length > 0.75 ? "-translate-x-full" : (hover + 0.5) / daily.length < 0.25 ? "" : "-translate-x-1/2"}`}
              style={{ left: `${((hover + 0.5) / daily.length) * 100}%` }}>
              <b>{fmtDay(h.day)}</b> · {num(h.visitors)} visitors · {num(h.pageviews)} page views
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminMetrics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api.get(`/admin/metrics?days=${days}`).then(setData).catch(e => setError(e.message));
  }, [days]);

  const s = data?.summary;
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight">Site metrics</h2>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {RANGES.map(r => (
            <button key={r} onClick={() => setDays(r)}
              className={`rounded-lg px-3 py-1 text-xs font-bold ${days === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : !data ? <p className="mt-4 text-sm text-slate-400">Loading…</p> : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Visitors" value={s.visitors} note={`${num(s.signed_in_visitors)} signed in`} />
            <Tile label="Visitors today" value={s.visitors_today} />
            <Tile label="Page views" value={s.pageviews} />
            <Tile label="Listing views" value={s.listing_views} />
            <Tile label="Interest submitted" value={s.interest} note={`${num(s.bookings)} visits booked`} />
            <Tile label="New sign-ups" value={s.signups} />
          </div>
          {s.ai_attacks_blocked > 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
              ⚠ <b>{num(s.ai_attacks_blocked)}</b> prompt-injection attempt{s.ai_attacks_blocked === 1 ? "" : "s"} blocked by the AI assistant in this period
              (logged in the <code>llm_security_events</code> table).
            </p>
          )}

          <div className="mt-3"><DailyChart daily={data.daily} /></div>

          <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            <p className="p-4 pb-2 text-sm font-extrabold">Per listing <span className="font-medium text-slate-400">· last {days} days · saved is all-time</span></p>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold">Listing</th>
                    {["Views", "Unique visitors", "Interest", "Visits booked", "Saved", "Interest rate"].map(h =>
                      <th key={h} className="px-3 py-2 text-right font-bold">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.listings.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="max-w-[280px] px-4 py-2">
                        <Link to={`/property/${p.id}`} className="block truncate font-bold text-slate-800 hover:text-emerald-700">{p.title}</Link>
                        <span className="block truncate text-xs text-slate-400">{p.area}, {p.city}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(p.views)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(p.visitors)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(p.interest)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(p.bookings)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(p.saved)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {p.visitors ? Math.round((p.interest / p.visitors) * 100) + "%" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
