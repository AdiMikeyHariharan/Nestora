import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../store.jsx";

export default function Login() {
  const { login, toast } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";

  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("auth"); // auth | otp
  const [pendingEmail, setPendingEmail] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "buyer" });
  const [otp, setOtp] = useState(Array(6).fill(""));
  const boxRefs = useRef([]);

  const showOtpStep = resp => {
    setPendingEmail(resp.email);
    setDemoOtp(resp.demo_otp || "");
    setStep("otp");
    setTimeout(() => boxRefs.current[0]?.focus(), 100);
  };

  const submitAuth = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const resp = await api.post("/auth/signup", form);
        toast("Account created — check your email for the OTP");
        showOtpStep(resp);
      } else {
        const resp = await api.post("/auth/login", { email: form.email, password: form.password });
        if (resp.needsOtp) { toast("Please verify your email first"); showOtpStep(resp); }
        else { login(resp.token, resp.user); toast("Logged in ✔"); navigate(next); }
      }
    } catch (err) { toast(err.message); }
    setBusy(false);
  };

  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, "").slice(-1);
    setOtp(prev => { const n = [...prev]; n[i] = d; return n; });
    if (d && i < 5) boxRefs.current[i + 1]?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) boxRefs.current[i - 1]?.focus();
  };
  const onPaste = e => {
    const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setOtp(digits.padEnd(6, "").split("").slice(0, 6));
    boxRefs.current[Math.min(digits.length, 5)]?.focus();
  };

  const verify = async () => {
    const code = otp.join("");
    if (code.length !== 6) { toast("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const resp = await api.post("/auth/verify", { email: pendingEmail, otp: code });
      login(resp.token, resp.user);
      toast("Email verified — welcome to Nestora 🎉");
      navigate(next);
    } catch (err) { toast(err.message); }
    setBusy(false);
  };

  const resend = async () => {
    try {
      const resp = await api.post("/auth/resend", { email: pendingEmail });
      toast("New code sent 📩");
      if (resp.demo_otp) setDemoOtp(resp.demo_otp);
    } catch (err) { toast(err.message); }
  };

  return (
    <div className="container auth-wrap">
      {step === "auth" ? (
        <div className="panel">
          <h2 style={{ textAlign: "center", marginBottom: 6 }}>Welcome to Nestora</h2>
          <p style={{ textAlign: "center", color: "var(--muted)", marginBottom: 20 }}>One-time signup with email verification.</p>
          <div className="tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
          </div>
          <form onSubmit={submitAuth}>
            {mode === "signup" && (
              <div className="form-field" style={{ marginBottom: 14 }}>
                <label>Full name</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
              </div>
            )}
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label>Email</label>
              <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
            </div>
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label>Password</label>
              <input type="password" required minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </div>
            {mode === "signup" && (
              <div className="form-field" style={{ marginBottom: 14 }}>
                <label>I am a</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="buyer">Buyer / Tenant</option>
                  <option value="owner">Owner</option>
                  <option value="realtor">Realtor / Mediator</option>
                </select>
              </div>
            )}
            <button className="btn btn-primary btn-block" style={{ height: 46 }} disabled={busy}>
              {busy ? <><span className="spinner" /> Please wait…</> : mode === "login" ? "Login" : "Create account"}
            </button>
          </form>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
            Demo build — OTP emails are simulated until SMTP is configured.
          </p>
        </div>
      ) : (
        <div className="panel">
          <h2 style={{ textAlign: "center", marginBottom: 6 }}>Verify your email</h2>
          <p style={{ textAlign: "center", color: "var(--muted)" }}>
            We emailed a 6-digit code to {pendingEmail}. It expires in 10 minutes.
          </p>
          <div className="otp-row" onPaste={onPaste}>
            {otp.map((d, i) => (
              <input key={i} maxLength={1} inputMode="numeric" value={d}
                ref={el => boxRefs.current[i] = el}
                onChange={e => setDigit(i, e.target.value)}
                onKeyDown={e => onKey(i, e)} />
            ))}
          </div>
          <button className="btn btn-primary btn-block" style={{ height: 46 }} onClick={verify} disabled={busy}>
            {busy ? <><span className="spinner" /> Verifying…</> : "Verify & continue"}
          </button>
          <p style={{ textAlign: "center", marginTop: 14, fontSize: 14, color: "var(--muted)" }}>
            Didn't get it? <a href="#" onClick={e => { e.preventDefault(); resend(); }} style={{ color: "var(--brand)", fontWeight: 700 }}>Resend code</a>
          </p>
          {demoOtp && (
            <div className="demo-otp">🧪 <b>Demo mode</b> (no SMTP configured): your OTP is <b>{demoOtp}</b></div>
          )}
        </div>
      )}
    </div>
  );
}
