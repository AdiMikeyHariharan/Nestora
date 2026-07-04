import { useMemo, useState } from "react";
import { useApp } from "../store.jsx";
import { fmtPrice } from "../api.js";

const Slider = ({ label, value, display, min, max, step, onChange }) => (
  <label className="block">
    <div className="flex items-baseline justify-between text-xs font-bold text-slate-600">
      <span>{label}</span>
      <span className="text-sm font-extrabold text-emerald-700">{display}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(+e.target.value)}
      className="mt-2 w-full" aria-label={label}
    />
  </label>
);

export default function MortgageCalc({ price }) {
  const { currency } = useApp();
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(20);

  const { emi, principal, totalInterest, interestShare } = useMemo(() => {
    const principal = price * (1 - downPct / 100);
    const r = rate / 12 / 100, n = years * 12;
    const emi = r ? principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : principal / n;
    const totalInterest = emi * n - principal;
    return { emi, principal, totalInterest, interestShare: totalInterest / (principal + totalInterest) };
  }, [price, downPct, rate, years]);

  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-lg">🏦</span>
        <h3 className="font-extrabold">Mortgage calculator</h3>
      </div>

      <div className="mt-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 p-5 text-center ring-1 ring-emerald-100">
        <span className="text-xs font-bold uppercase tracking-wide text-emerald-700/70">Est. monthly EMI</span>
        <div className="mt-1 bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
          {fmtPrice(Math.round(emi), true, currency)}
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <Slider label="Down payment" value={downPct} display={`${downPct}% · ${fmtPrice(Math.round(price * downPct / 100), false, currency)}`}
          min={10} max={80} step={5} onChange={setDownPct} />
        <Slider label="Interest rate" value={rate} display={`${rate.toFixed(2)}% p.a.`}
          min={6} max={12} step={0.25} onChange={setRate} />
        <Slider label="Tenure" value={years} display={`${years} years`}
          min={5} max={30} step={1} onChange={setYears} />
      </div>

      <div className="mt-6">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Principal vs interest split">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-500" style={{ width: `${(1 - interestShare) * 100}%` }} />
          <div className="bg-amber-400" style={{ width: `${interestShare * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><i className="h-2 w-2 rounded-full bg-emerald-500" />Loan amount</span>
            <b className="mt-0.5 block">{fmtPrice(Math.round(principal), false, currency)}</b>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><i className="h-2 w-2 rounded-full bg-amber-400" />Total interest</span>
            <b className="mt-0.5 block">{fmtPrice(Math.round(totalInterest), false, currency)}</b>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">Indicative only. Actual rates depend on your lender, credit profile and tenure.</p>
    </div>
  );
}
