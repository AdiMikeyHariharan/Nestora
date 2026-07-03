import { useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";

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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && state !== "busy" && onClose()}>
      <div className="modal">
        {state === "done" ? (
          <div className="pay-success">
            <div className="tick">✓</div>
            <h3>Payment successful</h3>
            <p>₹{invoice.amount.toLocaleString("en-IN")} · Ref {ref}</p>
            <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
          </div>
        ) : (<>
          <div className="pay-head">
            <div><b>Nestora Secure Pay</b><small>{invoice.description || "Payment"}</small></div>
            <button className="x" onClick={onClose} disabled={state === "busy"}>×</button>
          </div>
          <div className="pay-amount">₹{invoice.amount.toLocaleString("en-IN")}</div>
          <div className="pay-tabs">
            {["upi", "card", "netbanking"].map(m => (
              <button key={m} className={method === m ? "active" : ""} onClick={() => setMethod(m)}>
                {m === "upi" ? "UPI" : m === "card" ? "Card" : "NetBanking"}
              </button>
            ))}
          </div>
          <div className="pay-body">
            {method === "upi" && <div className="form-field"><label>UPI ID</label><input defaultValue="demo@upi" /></div>}
            {method === "card" && (<>
              <div className="form-field"><label>Card number</label><input defaultValue="4111 1111 1111 1111" /></div>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <div className="form-field" style={{ flex: 1 }}><label>Expiry</label><input defaultValue="12/28" /></div>
                <div className="form-field" style={{ flex: 1 }}><label>CVV</label><input type="password" defaultValue="123" /></div>
              </div>
            </>)}
            {method === "netbanking" && (
              <div className="form-field"><label>Bank</label>
                <select><option>HDFC Bank</option><option>ICICI Bank</option><option>SBI</option><option>Axis Bank</option></select>
              </div>
            )}
          </div>
          <button className="btn btn-primary btn-block" style={{ height: 46 }} onClick={pay} disabled={state === "busy"}>
            {state === "busy" ? <><span className="spinner" /> Processing…</> : `Pay ₹${invoice.amount.toLocaleString("en-IN")}`}
          </button>
          <p className="pay-note">🔒 Demo gateway — no real money moves. Swap in Razorpay/Stripe keys for production.</p>
        </>)}
      </div>
    </div>
  );
}
