import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";

const field = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";

// Mock gateway UI; swap for the Razorpay/Stripe SDK in production.
export default function CheckoutModal({ invoice, onClose, onPaid }) {
  const { toast } = useApp();
  const [method, setMethod] = useState("upi");
  const [state, setState] = useState("idle"); // idle | busy | done
  const [ref, setRef] = useState("");

  const pay = async () => {
    setState("busy");
    try {
      await new Promise(r => setTimeout(r, 1400)); // simulate gateway round-trip
      const { gateway_ref } = await api.post("/payments/pay", { invoice_id: invoice.id, method });
      setRef(gateway_ref); setState("done");
      onPaid && onPaid();
    } catch (e) { toast(e.message); setState("idle"); }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
        onClick={e => e.target === e.currentTarget && state !== "busy" && onClose()}
      >
        <motion.div
          initial={{ scale: 0.92, y: 14, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          className="w-[400px] max-w-full rounded-3xl bg-white p-6 shadow-2xl"
        >
          {state === "done" ? (
            <div className="py-3 text-center">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-3xl text-white shadow-lg shadow-emerald-500/40"
              >✓</motion.div>
              <h3 className="text-lg font-extrabold">Payment successful</h3>
              <p className="mb-5 mt-1 text-sm text-slate-500">₹{invoice.amount.toLocaleString("en-IN")} · Ref {ref}</p>
              <button onClick={onClose} className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110">Done</button>
            </div>
          ) : (<>
            <div className="flex items-start justify-between">
              <div>
                <b className="text-base font-extrabold">Nestora Secure Pay</b>
                <p className="mt-0.5 max-w-[280px] text-xs text-slate-500">{invoice.description || "Payment"}</p>
              </div>
              <button className="text-2xl leading-none text-slate-400 hover:text-slate-600" onClick={onClose} disabled={state === "busy"}>×</button>
            </div>
            <div className="mb-1 mt-4 bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              ₹{invoice.amount.toLocaleString("en-IN")}
            </div>
            <div className="my-4 flex gap-1.5">
              {["upi", "card", "netbanking"].map(m => (
                <button
                  key={m} onClick={() => setMethod(m)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-bold transition-colors ${
                    method === m ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                >{m === "upi" ? "UPI" : m === "card" ? "Card" : "NetBanking"}</button>
              ))}
            </div>
            <div className="mb-4 space-y-2.5">
              {method === "upi" && (
                <label className="block text-xs font-bold text-slate-600">UPI ID
                  <input className={field + " mt-1"} defaultValue="demo@upi" />
                </label>
              )}
              {method === "card" && (<>
                <label className="block text-xs font-bold text-slate-600">Card number
                  <input className={field + " mt-1"} defaultValue="4111 1111 1111 1111" />
                </label>
                <div className="flex gap-2.5">
                  <label className="block flex-1 text-xs font-bold text-slate-600">Expiry
                    <input className={field + " mt-1"} defaultValue="12/28" />
                  </label>
                  <label className="block flex-1 text-xs font-bold text-slate-600">CVV
                    <input className={field + " mt-1"} type="password" defaultValue="123" />
                  </label>
                </div>
              </>)}
              {method === "netbanking" && (
                <label className="block text-xs font-bold text-slate-600">Bank
                  <select className={field + " mt-1"}>
                    <option>HDFC Bank</option><option>ICICI Bank</option><option>SBI</option><option>Axis Bank</option>
                  </select>
                </label>
              )}
            </div>
            <button
              onClick={pay} disabled={state === "busy"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
            >
              {state === "busy" ? (<><span className="spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> Processing…</>)
                : `Pay ₹${invoice.amount.toLocaleString("en-IN")}`}
            </button>
            <p className="mt-3 text-center text-[11px] text-slate-400">🔒 Payments are encrypted and processed securely.</p>
          </>)}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
