// Global app state: session, currency, shortlist, toasts
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "./api.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nst_user") || "null"); } catch { return null; }
  });
  const [currency, setCurrencyState] = useState(localStorage.getItem("nst_currency") || "INR");
  const [shortlist, setShortlist] = useState([]);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef();

  const toast = useCallback(msg => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const setCurrency = c => { localStorage.setItem("nst_currency", c); setCurrencyState(c); };

  const login = (token, u) => {
    localStorage.setItem("nst_token", token);
    localStorage.setItem("nst_user", JSON.stringify(u));
    setUser(u);
  };
  const logout = async () => {
    try { await api.post("/auth/logout", {}); } catch {}
    localStorage.removeItem("nst_token");
    localStorage.removeItem("nst_user");
    setUser(null); setShortlist([]);
  };

  useEffect(() => {
    if (!user) { setShortlist([]); return; }
    api.get("/shortlist").then(d => setShortlist(d.ids)).catch(() => setShortlist([]));
  }, [user]);

  const toggleShortlist = async id => {
    if (!user) { toast("Login to shortlist homes"); return false; }
    try {
      const { shortlisted } = await api.post("/shortlist", { property_id: id });
      setShortlist(s => shortlisted ? [...s, id] : s.filter(x => x !== id));
      toast(shortlisted ? "Added to shortlist ♥" : "Removed from shortlist");
      return shortlisted;
    } catch (e) { toast(e.message); return false; }
  };

  return (
    <Ctx.Provider value={{ user, login, logout, currency, setCurrency, shortlist, toggleShortlist, toast }}>
      {children}
      <div className={"toast" + (toastMsg ? " show" : "")}>{toastMsg}</div>
    </Ctx.Provider>
  );
}
