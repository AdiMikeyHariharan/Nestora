import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";

const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";

export default function Login() {
  const { login, toast } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";

  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("auth"); // auth | otp | google_confirm
  const [loginMethod, setLoginMethod] = useState("password"); // password | otp
  const [googleSsoData, setGoogleSsoData] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "buyer/seller", phone: "" });
  const [otp, setOtp] = useState(Array(6).fill(""));
  const boxRefs = useRef([]);

  // Handle Google SSO redirect back
  useEffect(() => {
    const ssoErr = params.get("sso_error");
    if (ssoErr) { toast(ssoErr); return; }

    const googleSso = params.get("google_sso");
    if (googleSso) {
      setGoogleSsoData({
        tempToken: params.get("temp_token"),
        email: params.get("email"),
        name: decodeURIComponent(params.get("name") || ""),
        hasPassword: params.get("has_password") === "true"
      });
      setStep("google_confirm");
      return;
    }

    const token = params.get("sso");
    if (token) {
      try {
        const user = JSON.parse(atob(params.get("u").replace(/-/g, "+").replace(/_/g, "/")));
        login(token, user);
        toast("Signed in with Google ✔");
        navigate(next);
      } catch { toast("Sign-in failed — try again"); }
    }
  }, []); // eslint-disable-line

  const googleSSO = async () => {
    const { google } = await api.get("/auth/sso/status").catch(() => ({ google: false }));
    if (!google) { toast("Google SSO needs GOOGLE_CLIENT_ID — see README"); return; }
    window.location.href = "/api/auth/google";
  };

  const showOtpStep = resp => {
    setPendingEmail(resp.email);
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
        if (loginMethod === "password") {
          const resp = await api.post("/auth/login", { email: form.email, password: form.password });
          login(resp.token, resp.user);
          toast("Logged in ✔");
          navigate(next);
        } else {
          const resp = await api.post("/auth/login-otp", { email: form.email });
          toast("Verification code sent to your email");
          showOtpStep(resp);
        }
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
      await api.post("/auth/resend", { email: pendingEmail });
      toast("New code sent 📩");
    } catch (err) { toast(err.message); }
  };

  const submitGoogleConfirm = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const resp = await api.post("/auth/google/confirm", {
        temp_token: googleSsoData.tempToken,
        password: form.password,
        role: form.role,
        phone: form.phone
      });
      login(resp.token, resp.user);
      toast(googleSsoData.hasPassword ? "Logged in ✔" : "Account password configured & logged in ✔");
      navigate(next);
    } catch (err) {
      toast(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto my-14 w-[min(430px,92%)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
        className="rounded-3xl bg-white p-7 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200"
      >
        {step === "auth" && (
          <>
            <h2 className="text-center text-2xl font-extrabold tracking-tight">Welcome to Nestora</h2>
            <p className="mb-6 mt-1 text-center text-sm text-slate-500">One-time signup with email verification.</p>
            <div className="mb-5 flex rounded-xl bg-slate-100 p-1">
              {["login", "signup"].map(m => (
                <button
                  key={m} onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${mode === m ? "bg-white text-emerald-700 shadow" : "text-slate-500"}`}
                >{m === "login" ? "Login" : "Sign up"}</button>
              ))}
            </div>
            <form onSubmit={submitAuth} className="space-y-3.5">
              {mode === "signup" && (
                <label className="block text-xs font-bold text-slate-600">Full name
                  <input className={fieldCls + " mt-1.5"} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
                </label>
              )}
              <label className="block text-xs font-bold text-slate-600">Email
                <input className={fieldCls + " mt-1.5"} type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
              </label>
              {(mode === "signup" || loginMethod === "password") && (
                <label className="block text-xs font-bold text-slate-600">Password
                  <input className={fieldCls + " mt-1.5"} type="password" required minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
                </label>
              )}
              {mode === "signup" && (
                <>
                  <label className="block text-xs font-bold text-slate-600">Phone (for WhatsApp)
                    <input className={fieldCls + " mt-1.5"} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1234567890" />
                  </label>
                  <label className="block text-xs font-bold text-slate-600">I am a
                    <select className={fieldCls + " mt-1.5"} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      <option value="buyer/seller">Buyer / Seller</option>
                      <option value="agent">Agent / Realtor</option>
                    </select>
                  </label>
                </>
              )}
              {mode === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setLoginMethod(prev => prev === "password" ? "otp" : "password")}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    {loginMethod === "password" ? "Log in with OTP instead" : "Log in with Password instead"}
                  </button>
                </div>
              )}
              <button
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
              >
                {busy ? (
                  <><span className="spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> Please wait…</>
                ) : mode === "login" ? (
                  loginMethod === "password" ? "Login" : "Send OTP"
                ) : (
                  "Create account"
                )}
              </button>
            </form>
            <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-slate-300">
              <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              type="button" onClick={googleSSO}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.2-7-5.1L1.2 17.2C3.2 21.2 7.3 24 12 24z" />
                <path fill="#FBBC05" d="M5 14.3c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.2 6.8C.4 8.4 0 10.1 0 12s.4 3.6 1.2 5.2L5 14.3z" />
                <path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17 1 14.2 0 12 0 7.3 0 3.2 2.8 1.2 6.8L5 9.7c1-2.9 3.8-5.1 7-5.1z" />
              </svg>
              Continue with Google
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <h2 className="text-center text-2xl font-extrabold tracking-tight">Verify your email</h2>
            <p className="mt-1 text-center text-sm text-slate-500">
              We emailed a 6-digit code to {pendingEmail}. It expires in 10 minutes.
            </p>
            <div className="my-6 flex justify-center gap-2" onPaste={onPaste}>
              {otp.map((d, i) => (
                <input
                  key={i} maxLength={1} inputMode="numeric" value={d}
                  ref={el => boxRefs.current[i] = el}
                  onChange={e => setDigit(i, e.target.value)}
                  onKeyDown={e => onKey(i, e)}
                  className="h-14 w-11 rounded-xl border-2 border-slate-200 text-center text-xl font-extrabold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                />
              ))}
            </div>
            <button
              onClick={verify} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
            >
              {busy ? (<><span className="spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> Verifying…</>) : "Verify & continue"}
            </button>
            <p className="mt-4 text-center text-sm text-slate-500">
              Didn't get it?{" "}
              <button onClick={resend} className="font-bold text-emerald-700 hover:underline">Resend code</button>
            </p>
          </>
        )}

        {step === "google_confirm" && googleSsoData && (
          <>
            <h2 className="text-center text-2xl font-extrabold tracking-tight">Complete Google Sign-In</h2>
            <p className="mb-6 mt-1 text-center text-sm text-slate-500">
              {googleSsoData.hasPassword 
                ? `Please verify the password for your Nestora account (${googleSsoData.email}).`
                : `Set a password for your new Nestora account (${googleSsoData.email}).`
              }
            </p>
            <form onSubmit={submitGoogleConfirm} className="space-y-4">
              <label className="block text-xs font-bold text-slate-600">Password
                <input 
                  className={fieldCls + " mt-1.5"} 
                  type="password" 
                  required 
                  minLength={6} 
                  value={form.password} 
                  onChange={e => setForm({ ...form, password: e.target.value })} 
                  placeholder={googleSsoData.hasPassword ? "Enter password" : "Create password (min. 6 chars)"} 
                />
              </label>
              {!googleSsoData.hasPassword && (
                <>
                  <label className="block text-xs font-bold text-slate-600">Phone (for WhatsApp)
                    <input className={fieldCls + " mt-1.5"} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1234567890" />
                  </label>
                  <label className="block text-xs font-bold text-slate-600">I am a
                    <select className={fieldCls + " mt-1.5"} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      <option value="buyer/seller">Buyer / Seller</option>
                      <option value="agent">Agent / Realtor</option>
                    </select>
                  </label>
                </>
              )}
              <button
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-70"
              >
                {busy ? (
                  <><span className="spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> Processing…</>
                ) : (
                  googleSsoData.hasPassword ? "Verify & Log in" : "Set password & Sign up"
                )}
              </button>
              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("auth");
                    setGoogleSsoData(null);
                    navigate("/login", { replace: true });
                  }}
                  className="text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
