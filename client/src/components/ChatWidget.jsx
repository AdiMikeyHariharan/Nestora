import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { api, fmtPrice, waLink } from "../api.js";
import { useApp } from "../store.jsx";
import { parseQuery, allProperties as allProps } from "../lib/nlsearch.js";
import { ChatIcon } from "./icons.jsx";

// Conversations are persisted server-side (chat_messages table) per browser session.
function sessionId() {
  let id = localStorage.getItem("nst_chat_session");
  if (!id) { id = "chat-" + Math.random().toString(36).slice(2, 12); localStorage.setItem("nst_chat_session", id); }
  return id;
}
const logMsg = (who, text) => api.post("/chat/log", { session: sessionId(), who, text }).catch(() => {});

export default function ChatWidget() {
  const { user, currency } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { who: "bot", text: 'Hi 👋 I\'m the Nestora assistant. Try "2 BHK near Adyar" or "flats for rent in Bengaluru".' }
  ]);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef();
  const bodyRef = useRef();

  const push = m => {
    setMsgs(prev => [...prev, m]);
    if (m.text) logMsg(m.who, m.text);
    setTimeout(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, 60);
  };
  const reply = (m, delay = 650) => new Promise(r => {
    setTyping(true);
    setTimeout(() => { setTyping(false); push(m); r(); }, delay);
  });
  const cards = list => ({ who: "bot", cards: list.slice(0, 3) });

  // LLM-first: ask the Claude-backed endpoint; fall back to the rule-based
  // engine when ANTHROPIC_API_KEY isn't configured (HTTP 501) or errors.
  const history = useRef([]);
  async function botReply(userText) {
    history.current.push({ role: "user", content: userText });
    try {
      setTyping(true);
      const { reply, propertyIds } = await api.post("/chat/ask", { messages: history.current });
      history.current.push({ role: "assistant", content: reply });
      setTyping(false);
      push({ who: "bot", text: reply });
      if (propertyIds?.length) {
        const all = await allProps().catch(() => []);
        const cardsList = propertyIds.map(id => all.find(p => p.id === id)).filter(Boolean);
        if (cardsList.length) push(cards(cardsList));
      }
      return;
    } catch (e) {
      setTyping(false);
      if (!/not configured/.test(e.message)) { /* real API error → still fall back */ }
    }
    await ruleBasedReply(userText);
  }

  async function ruleBasedReply(userText) {
    const t = userText.toLowerCase();

    if (t.includes("whatsapp")) {
      await reply({ who: "bot", text: "Sure! Opening WhatsApp so an advisor can assist you directly." });
      window.open(waLink("Hi Nestora, I was chatting on your site and want to continue here."), "_blank");
      return;
    }
    if (/visit|appointment|book|schedule/.test(t)) {
      await reply({
        who: "bot",
        text: user
          ? `Certainly, ${user.name.split(" ")[0]}. Open any property and select "Schedule a visit" — it's free, and our advisor confirms your slot by phone.`
          : 'To schedule a visit, please sign in first (one-time signup with email verification), then select "Schedule a visit" on any property. Visits are free.',
        link: { to: user ? "/listings" : "/login", label: user ? "Browse properties →" : "Login / Sign up →" }
      });
      return;
    }
    if (/post|sell my|list my|advertise/.test(t)) {
      await reply({
        who: "bot",
        text: "Owners and realtors can list free — add photos, a video, description and location. Your listing is geocoded automatically so it shows up in \"near me\" searches.",
        link: { to: "/post", label: "Post your property →" }
      });
      return;
    }
    if (/^(hi|hello|hey|namaste)\b/.test(t) || t.includes("help")) {
      await reply({ who: "bot", text: 'Hi 👋 Try "2 BHK near Adyar", "flats for rent under 50k in Koramangala", "book a visit" or "post my property".' });
      return;
    }

    const all = await allProps().catch(() => []);
    const places = [...new Set(all.flatMap(p => [p.city, p.area]))];
    const q = parseQuery(t, places);
    const hasIntent = q.near || q.place || q.beds || q.budget || q.type || q.category || q.pincode ||
      /flat|apartment|villa|house|home|property|bhk|studio|penthouse/.test(t);
    if (!hasIntent) {
      await reply({
        who: "bot",
        text: 'I can search homes for you — try a landmark ("3 BHK near Phoenix Mall"), a city, or a budget. For anything else, an advisor is one tap away.',
        href: { url: waLink("Hi Nestora! " + userText), label: "Ask on WhatsApp →" }
      });
      return;
    }

    // Geospatial branch: geocode the landmark, then radius search
    if (q.near) {
      setTyping(true);
      try {
        const { results } = await api.get("/geocode?q=" + encodeURIComponent(q.near));
        if (!results.length) {
          setTyping(false);
          push({ who: "bot", text: `I couldn't place "${q.near}" on the map. Try adding the area or city — e.g. "near ${q.near}, Adyar".` });
          return;
        }
        // try each geocode match until one has homes nearby
        let lm = results[0], properties = [], params;
        for (const cand of results.slice(0, 3)) {
          params = new URLSearchParams({ near: cand.lat + "," + cand.lng, radius: "10" });
          if (q.beds) params.set("beds", q.beds);
          if (q.type) params.set("type", q.type);
          if (q.budget) params.set("budget", q.budget);
          const resp = await api.get("/properties?" + params);
          if (resp.properties.length) { lm = cand; properties = resp.properties; break; }
        }
        if (!properties.length) {
          lm = results[0];
          params = new URLSearchParams({ near: lm.lat + "," + lm.lng, radius: "10" });
        }
        setTyping(false);
        if (properties.length) {
          push({ who: "bot", text: `Found ${properties.length} propert${properties.length === 1 ? "y" : "ies"} within 10 km of ${lm.name} — nearest first:` });
          push(cards(properties));
          push({ who: "bot", link: { to: `/listings?${params}&lname=${encodeURIComponent(lm.name)}`, label: `See all ${properties.length} on the map →` } });
        } else {
          push({ who: "bot", text: `Nothing within 10 km of ${lm.name} yet. Widen the search on the listings page, or ask an advisor:` });
          push({ who: "bot", href: { url: waLink("Hi Nestora! I'm looking for: " + userText), label: "Send to an advisor on WhatsApp →" } });
        }
      } catch {
        setTyping(false);
        push({ who: "bot", text: "The map service is busy — try again in a few seconds." });
      }
      return;
    }

    // Standard filtered search
    let list = all;
    if (q.place) list = list.filter(p => (p.city + " " + p.area).toLowerCase().includes(q.place.toLowerCase()));
    if (q.pincode) list = list.filter(p => p.pincode === q.pincode);
    if (q.beds) list = list.filter(p => p.beds === q.beds);
    if (q.type) list = list.filter(p => p.type === q.type);
    if (q.category) list = list.filter(p => p.category === q.category);
    if (q.budget) list = list.filter(p => p.priceINR <= q.budget);

    if (list.length) {
      const bits = [];
      if (q.beds) bits.push(q.beds + " BHK");
      if (q.type) bits.push("for " + (q.type === "rent" ? "rent" : "sale"));
      if (q.place) bits.push("in " + q.place);
      if (q.budget) bits.push("under " + fmtPrice(q.budget, q.type === "rent", currency));
      await reply({ who: "bot", text: `Found ${list.length} propert${list.length === 1 ? "y" : "ies"} ${bits.join(" ")} — top matches:` });
      push(cards(list));
      const params = new URLSearchParams();
      if (q.place) params.set("q", q.place);
      if (q.type) params.set("type", q.type);
      if (q.category) params.set("category", q.category);
      if (q.budget) params.set("budget", q.budget);
      if (q.beds) params.set("beds", q.beds);
      push({ who: "bot", link: { to: "/listings?" + params, label: `See all ${list.length} on the listings page →` } });
    } else {
      await reply({
        who: "bot",
        text: "Hmm, nothing matches that exactly. Try widening the budget or a nearby area — or leave it with me:",
        href: { url: waLink("Hi Nestora! I'm looking for: " + userText), label: "Send this request to an advisor →" }
      });
    }
  }

  const sendText = text => {
    if (!text.trim()) return;
    push({ who: "me", text });
    botReply(text.toLowerCase());
  };
  const submit = e => {
    e.preventDefault();
    sendText(inputRef.current.value);
    inputRef.current.value = "";
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
        className="fixed bottom-[92px] right-6 z-[60] grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-xl shadow-emerald-600/30"
        onClick={() => setOpen(o => !o)} title="Chat with us" aria-label="Open chat assistant"
      ><ChatIcon size={24} /></motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="fixed bottom-[158px] right-6 z-[61] flex w-[350px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200"
          >
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-3.5 text-white">
              <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
              <div>
                <h4 className="text-sm font-extrabold">Nestora Assistant</h4>
                <small className="text-[11px] text-emerald-100">Understands landmarks & budgets · convo saved</small>
              </div>
              <button className="ml-auto text-xl text-white/80 hover:text-white" onClick={() => setOpen(false)}>×</button>
            </div>

            <div className="flex h-[320px] flex-col gap-2.5 overflow-y-auto bg-slate-50 p-3.5" ref={bodyRef}>
              {msgs.map((m, i) => m.cards ? (
                <div className="flex w-full flex-col gap-2" key={i}>
                  {m.cards.map(p => (
                    <Link
                      key={p.id} to={`/property/${p.id}`} onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:border-emerald-400"
                    >
                      <img src={p.img} alt={p.title} loading="lazy" className="h-[50px] w-16 shrink-0 rounded-lg object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                      <div className="min-w-0">
                        <b className="block text-sm text-emerald-700">{fmtPrice(p.priceINR, p.type === "rent", currency)}</b>
                        <span className="block truncate text-xs font-semibold">{p.title}</span>
                        <small className="block truncate text-[11px] text-slate-400">📍 {p.area}, {p.city}{p.distance_km != null ? ` · ${p.distance_km} km` : ""}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div
                  key={i}
                  className={`max-w-[84%] rounded-2xl px-3.5 py-2 text-sm ${m.who === "me"
                    ? "self-end rounded-br-md bg-gradient-to-r from-emerald-600 to-teal-500 text-white"
                    : "self-start rounded-bl-md border border-slate-200 bg-white text-slate-700"}`}
                >
                  {m.text}
                  {m.link && <Link className="mt-1 block text-center text-xs font-bold text-emerald-600 hover:underline" to={m.link.to} onClick={() => setOpen(false)}>{m.link.label}</Link>}
                  {m.href && <a className="mt-1 block text-center text-xs font-bold text-emerald-600 hover:underline" href={m.href.url} target="_blank" rel="noreferrer">{m.href.label}</a>}
                </div>
              ))}
              {typing && (
                <div className="flex gap-1 self-start rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3">
                  {[0, 1, 2].map(n => <span key={n} className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />)}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 px-3.5 pb-2 pt-2">
              {["2 BHK near Adyar", "Rent under 50k", "Book a visit"].map(qk => (
                <button
                  key={qk} onClick={() => sendText(qk)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:border-emerald-400"
                >{qk}</button>
              ))}
            </div>
            <form className="flex gap-2 border-t border-slate-100 p-3" onSubmit={submit}>
              <input
                ref={inputRef} placeholder="Try: 2 BHK near Anandas…" autoComplete="off"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button type="submit" className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-3.5 font-bold text-white hover:brightness-110">➤</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
