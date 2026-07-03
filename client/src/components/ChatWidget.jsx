import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtPrice, waLink } from "../api.js";
import { useApp } from "../store.jsx";

let propCache = null;
async function allProps() {
  if (!propCache) propCache = (await api.get("/properties")).properties;
  return propCache;
}

function parseQuery(t, places) {
  const q = {};
  const bhk = t.match(/(\d+)\s*bhk/); if (bhk) q.beds = parseInt(bhk[1], 10);
  if (/\brent(al|ing)?\b|to let|lease/.test(t)) q.type = "rent";
  else if (/\bbuy(ing)?\b|purchase|sale/.test(t)) q.type = "buy";
  if (/resale|second hand|pre-?owned/.test(t)) q.category = "resale";
  else if (/new project|under construction|brand new/.test(t)) q.category = "new";
  const cr = t.match(/([\d.]+)\s*(cr|crore)/);
  const lakh = t.match(/([\d.]+)\s*(l|lakh|lac)\b/);
  const k = t.match(/([\d.]+)\s*k\b/);
  const raw = t.match(/(?:under|below|max|upto|up to|budget|within)\s*(?:rs\.?|₹)?\s*([\d,]{4,})/);
  if (cr) q.budget = parseFloat(cr[1]) * 10000000;
  else if (lakh) q.budget = parseFloat(lakh[1]) * 100000;
  else if (k) q.budget = parseFloat(k[1]) * 1000;
  else if (raw) q.budget = parseInt(raw[1].replace(/,/g, ""), 10);
  if (!q.type && q.budget) q.type = q.budget >= 500000 ? "buy" : "rent";
  // "near <landmark>" → geospatial search
  const near = t.match(/near(?:by| to)?\s+([a-z0-9' ]+?)(?:\s+(?:under|below|for|with|upto|up to|in)\b|[.,!?]|$)/);
  if (near) q.near = near[1].trim();
  for (const place of places) {
    if (t.includes(place.toLowerCase()) && place.toLowerCase() !== q.near) { q.place = place; break; }
  }
  const pin = t.match(/\b(\d{6})\b/); if (pin) q.pincode = pin[1];
  return q;
}

export default function ChatWidget() {
  const { user, currency } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { who: "bot", text: 'Hi 👋 I\'m the Nestora assistant. Try "2 BHK near Anandas" or "flats for rent in Bengaluru".' }
  ]);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef();
  const bodyRef = useRef();

  const push = m => {
    setMsgs(prev => [...prev, m]);
    setTimeout(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, 50);
  };
  const reply = (m, delay = 650) => new Promise(r => {
    setTyping(true);
    setTimeout(() => { setTyping(false); push(m); r(); }, delay);
  });

  const cards = list => ({ who: "bot", cards: list.slice(0, 3) });

  async function botReply(userText) {
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
          ? `Great, ${user.name.split(" ")[0]}! Open any property and tap "Book a site visit" — pay the refundable ₹999 token and your slot is confirmed instantly.`
          : 'Happy to set that up! Login first (one-time signup with email OTP), then open any property and tap "Book a site visit".',
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
      await reply({ who: "bot", text: 'Hi 👋 Try "2 BHK near Anandas", "flats for rent under 50k in Koramangala", "book a visit" or "post my property".' });
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
      } catch (e) {
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
      <div className="float-stack" style={{ bottom: 90 }}>
        <button className="fab chat" onClick={() => setOpen(o => !o)} title="Chat with us">💬</button>
      </div>
      <div className={"chat-panel" + (open ? " open" : "")} style={{ bottom: 158 }}>
        <div className="chat-head">
          <span className="dot" />
          <div><h4>Nestora Assistant</h4><small>Understands landmarks & budgets</small></div>
          <button className="x" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="chat-body" ref={bodyRef}>
          {msgs.map((m, i) => m.cards ? (
            <div className="msg bot rich" key={i}>
              {m.cards.map(p => (
                <Link className="chat-card" key={p.id} to={`/property/${p.id}`} onClick={() => setOpen(false)}>
                  <img src={p.img} onError={e => { e.currentTarget.style.display = "none"; }} />
                  <div>
                    <b>{fmtPrice(p.priceINR, p.type === "rent", currency)}</b>
                    <span>{p.title}</span>
                    <small>📍 {p.area}, {p.city}{p.distance_km != null ? ` · ${p.distance_km} km` : ""}</small>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div key={i} className={"msg " + m.who + (m.link || m.href ? " rich" : "")}>
              {m.text}
              {m.link && <Link className="chat-link" to={m.link.to} onClick={() => setOpen(false)}>{m.link.label}</Link>}
              {m.href && <a className="chat-link" href={m.href.url} target="_blank" rel="noreferrer">{m.href.label}</a>}
            </div>
          ))}
          {typing && <div className="msg bot typing"><span /><span /><span /></div>}
        </div>
        <div className="chat-quick">
          <button onClick={() => sendText("2 BHK near Adyar")}>2 BHK near Adyar</button>
          <button onClick={() => sendText("Flats for rent under 50k")}>Rent under 50k</button>
          <button onClick={() => sendText("Book a site visit")}>Book a visit</button>
        </div>
        <form className="chat-input" onSubmit={submit}>
          <input ref={inputRef} placeholder="Try: 2 BHK near Anandas…" autoComplete="off" />
          <button type="submit">➤</button>
        </form>
      </div>
    </>
  );
}
