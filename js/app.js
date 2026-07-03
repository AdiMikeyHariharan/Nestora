// ---------- Config ----------
const FNS = {
  whatsapp: "919000000000",        // demo WhatsApp business number
  email: "hello@fnsrealty.com",     // demo enquiry inbox
  rates: { INR: 1, USD: 1 / 83, AED: 1 / 22.6, GBP: 1 / 105, EUR: 1 / 90 },
  symbol: { INR: "₹", USD: "$", AED: "AED ", GBP: "£", EUR: "€" }
};

// ---------- Currency ----------
function getCurrency() { return localStorage.getItem("fns_currency") || "INR"; }
function setCurrency(c) { localStorage.setItem("fns_currency", c); location.reload(); }
function fmtPrice(inr, isRent) {
  const c = getCurrency();
  const val = inr * FNS.rates[c];
  let str;
  if (c === "INR") {
    if (isRent) str = "₹" + Math.round(val).toLocaleString("en-IN");
    else if (val >= 10000000) str = "₹" + (val / 10000000).toFixed(2).replace(/\.00$/, "") + " Cr";
    else if (val >= 100000) str = "₹" + (val / 100000).toFixed(2).replace(/\.00$/, "") + " L";
    else str = "₹" + Math.round(val).toLocaleString("en-IN");
  } else {
    str = FNS.symbol[c] + Math.round(val).toLocaleString("en-US");
  }
  return str + (isRent ? "/mo" : "");
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ---------- Contact helpers ----------
function whatsappLink(text) {
  return "https://wa.me/" + FNS.whatsapp + "?text=" + encodeURIComponent(text);
}
function enquireEmail(prop) {
  if (!prop) return;
  const subject = "Interested: " + prop.title + " (" + prop.id + ")";
  const body = `Hi FNS team,\n\nI'm interested in this property:\n\n${prop.title}\n${prop.area}, ${prop.city} - ${prop.pincode}\nPrice: ${fmtPrice(prop.priceINR, prop.type === "rent")}\n\nPlease share more details / schedule a visit.\n\nThanks`;
  location.href = `mailto:${FNS.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- Property card ----------
function propertyCard(p, revealDelay) {
  const shortlisted = getShortlist().includes(p.id);
  const badge = p.category === "new"
    ? '<span class="badge new">New Project</span>'
    : '<span class="badge">Resale</span>';
  const rentTag = p.type === "rent" ? '<span class="badge" style="left:auto;right:56px;background:#334155">For Rent</span>' : "";
  return `
  <article class="card reveal" ${revealDelay ? `style="transition-delay:${revealDelay}ms"` : ""}>
    <a class="thumb" href="property.html?id=${p.id}">
      <img src="${p.img}" alt="${p.title}" loading="lazy"
           onerror="this.style.display='none'">
      ${badge}${rentTag}
      <button class="fav ${shortlisted ? "active" : ""}" title="Shortlist"
        onclick="event.preventDefault();toggleShortlist('${p.id}',this)">♥</button>
    </a>
    <div class="body">
      <div class="price">${fmtPrice(p.priceINR, p.type === "rent")}</div>
      <a class="title" href="property.html?id=${p.id}">${p.title}</a>
      <div class="loc">📍 ${p.area}, ${p.city} · ${p.pincode}</div>
      <div class="specs">
        <span>🛏 ${p.beds} Beds</span>
        <span>🛁 ${p.baths} Baths</span>
        <span>📐 ${p.sqft} sqft</span>
      </div>
      <div class="actions">
        <a class="btn btn-primary btn-sm" style="flex:1;justify-content:center" href="property.html?id=${p.id}">View details</a>
        <button class="btn btn-ghost btn-sm" onclick="enquireEmail(getPropertyById('${p.id}'))">Interested?</button>
      </div>
    </div>
  </article>`;
}

// ---------- Scroll reveal ----------
let _revealObserver;
function initReveal() {
  if (!_revealObserver) {
    _revealObserver = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); _revealObserver.unobserve(e.target); } });
    }, { threshold: 0.08 });
  }
  document.querySelectorAll(".reveal:not(.in)").forEach(el => _revealObserver.observe(el));
}

// ---------- Animated counters ----------
function initCounters() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      const el = e.target, target = parseInt(el.dataset.count, 10), suffix = el.dataset.suffix || "";
      const t0 = performance.now(), dur = 1400;
      (function tick(t) {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString("en-IN") + suffix;
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }, { threshold: 0.4 });
  document.querySelectorAll("[data-count]").forEach(el => obs.observe(el));
}

// ---------- Shared UI injection (header, floats, chat) ----------
function injectChrome(activePage) {
  const user = currentUser();
  const cur = getCurrency();
  const curOptions = Object.keys(FNS.rates)
    .map(c => `<option value="${c}" ${c === cur ? "selected" : ""}>${c}</option>`).join("");

  const header = `
  <header class="site-header">
    <div class="container nav">
      <a class="brand" href="index.html">
        <span class="logo">FNS</span>
        <span>FNS Realty<small>FIND · NEGOTIATE · SETTLE</small></span>
      </a>
      <nav class="nav-links">
        <a href="listings.html?type=buy" class="${activePage === "buy" ? "active" : ""}">Buy</a>
        <a href="listings.html?type=rent" class="${activePage === "rent" ? "active" : ""}">Rent</a>
        <a href="post.html" class="${activePage === "post" ? "active" : ""}">Post Property</a>
        <a href="index.html#flow">How it works</a>
      </nav>
      <div class="nav-right">
        <select class="currency" onchange="setCurrency(this.value)" title="Currency">${curOptions}</select>
        ${user
          ? `<a class="btn btn-ghost btn-sm" href="account.html">Hi, ${user.name.split(" ")[0]}</a>
             <button class="btn btn-primary btn-sm" onclick="logout()">Logout</button>`
          : `<a class="btn btn-ghost btn-sm" href="login.html">Login</a>
             <a class="btn btn-primary btn-sm" href="post.html">Post Property</a>`}
      </div>
    </div>
  </header>`;

  const floats = `
  <div class="float-stack">
    <a class="fab wa" href="${whatsappLink("Hi FNS! I'd like help finding a property.")}" target="_blank" title="WhatsApp us">🟢</a>
    <button class="fab chat" onclick="toggleChat()" title="Chat with us">💬</button>
  </div>
  <div class="chat-panel" id="chatPanel">
    <div class="chat-head">
      <span class="dot"></span>
      <div><h4>FNS Assistant</h4><small>Typically replies instantly</small></div>
      <button class="x" onclick="toggleChat()">×</button>
    </div>
    <div class="chat-body" id="chatBody">
      <div class="msg bot">Hi 👋 I'm the FNS assistant. Tell me a city, budget or "book a visit" and I'll help.</div>
    </div>
    <div class="chat-quick">
      <button onclick="chatQuick('2 BHK in Bengaluru')">2 BHK in Bengaluru</button>
      <button onclick="chatQuick('Flats for rent under 50k')">Rent under 50k</button>
      <button onclick="chatQuick('Book a site visit')">Book a visit</button>
      <button onclick="chatQuick('Talk on WhatsApp')">WhatsApp</button>
    </div>
    <form class="chat-input" onsubmit="chatSend(event)">
      <input id="chatInput" placeholder="Type your message…" autocomplete="off">
      <button type="submit">➤</button>
    </form>
  </div>`;

  const footer = `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="brand" style="color:#fff"><span class="logo">FNS</span><span style="color:#fff">FNS Realty</span></div>
          <p style="color:#94a3b8;margin-top:12px;max-width:320px">Find, negotiate and settle your next home — buy, rent, resale or new projects — end to end, all in one place.</p>
        </div>
        <div><h4>Explore</h4>
          <a href="listings.html?type=buy">Buy</a><a href="listings.html?type=rent">Rent</a>
          <a href="listings.html?category=new">New Projects</a><a href="listings.html?category=resale">Resale</a>
        </div>
        <div><h4>Company</h4>
          <a href="post.html">Post Property</a><a href="login.html">Client Login</a>
          <a href="index.html#flow">How it works</a><a href="mailto:${FNS.email}">Contact</a>
        </div>
        <div><h4>Reach us</h4>
          <a href="mailto:${FNS.email}">✉ ${FNS.email}</a>
          <a href="${whatsappLink("Hi FNS!")}" target="_blank">🟢 WhatsApp</a>
          <a href="tel:+919000000000">📞 +91 90000 00000</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} FNS Realty. Demo build.</span>
        <span>Privacy · Terms · Sitemap</span>
      </div>
    </div>
  </footer>`;

  const headerMount = document.getElementById("header");
  if (headerMount) headerMount.innerHTML = header;
  const footerMount = document.getElementById("footer");
  if (footerMount) footerMount.innerHTML = footer;
  document.body.insertAdjacentHTML("beforeend", floats);
  initReveal();
}

// ---------- Checkout modal (mock gateway; swap for Razorpay/Stripe SDK) ----------
function openCheckout(invoice, onDone) {
  document.getElementById("fnsCheckout")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "fnsCheckout"; wrap.className = "modal-overlay";
  wrap.innerHTML = `
  <div class="modal">
    <div class="pay-head">
      <div><b>FNS Secure Pay</b><small>${invoice.description || "Payment"}</small></div>
      <button class="x" onclick="document.getElementById('fnsCheckout').remove()">×</button>
    </div>
    <div class="pay-amount">₹${invoice.amount.toLocaleString("en-IN")}</div>
    <div class="pay-tabs">
      <button class="active" data-m="upi" onclick="payTab(this)">UPI</button>
      <button data-m="card" onclick="payTab(this)">Card</button>
      <button data-m="netbanking" onclick="payTab(this)">NetBanking</button>
    </div>
    <div class="pay-body" id="payBody"></div>
    <button class="btn btn-primary btn-block" id="payBtn" style="height:46px">Pay ₹${invoice.amount.toLocaleString("en-IN")}</button>
    <p class="pay-note">🔒 Demo gateway — no real money moves. Swap in Razorpay/Stripe keys for production.</p>
  </div>`;
  document.body.appendChild(wrap);

  let method = "upi";
  const forms = {
    upi: `<div class="form-field"><label>UPI ID</label><input id="payField" placeholder="name@upi" value="demo@upi"></div>`,
    card: `<div class="form-field"><label>Card number</label><input id="payField" placeholder="4111 1111 1111 1111" value="4111 1111 1111 1111"></div>
           <div style="display:flex;gap:10px;margin-top:10px">
             <div class="form-field" style="flex:1"><label>Expiry</label><input placeholder="12/28" value="12/28"></div>
             <div class="form-field" style="flex:1"><label>CVV</label><input placeholder="•••" type="password" value="123"></div>
           </div>`,
    netbanking: `<div class="form-field"><label>Bank</label><select id="payField"><option>HDFC Bank</option><option>ICICI Bank</option><option>SBI</option><option>Axis Bank</option></select></div>`
  };
  const renderForm = () => { document.getElementById("payBody").innerHTML = forms[method]; };
  window.payTab = btn => {
    method = btn.dataset.m;
    wrap.querySelectorAll(".pay-tabs button").forEach(b => b.classList.toggle("active", b === btn));
    renderForm();
  };
  renderForm();

  document.getElementById("payBtn").onclick = async () => {
    const btn = document.getElementById("payBtn");
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Processing…`;
    try {
      await new Promise(r => setTimeout(r, 1400)); // simulate gateway round-trip
      const { gateway_ref } = await API.post("/payments/pay", { invoice_id: invoice.id, method });
      wrap.querySelector(".modal").innerHTML = `
        <div class="pay-success">
          <div class="tick">✓</div>
          <h3>Payment successful</h3>
          <p>₹${invoice.amount.toLocaleString("en-IN")} · Ref ${gateway_ref}</p>
          <button class="btn btn-primary btn-block" onclick="document.getElementById('fnsCheckout').remove()">Done</button>
        </div>`;
      onDone && onDone();
    } catch (e) {
      toast(e.message); btn.disabled = false; btn.textContent = "Retry payment";
    }
  };
}

// ---------- Chatbot ----------
function toggleChat() { document.getElementById("chatPanel").classList.toggle("open"); }
function addMsg(text, who) {
  const body = document.getElementById("chatBody");
  const d = document.createElement("div");
  d.className = "msg " + who; d.textContent = text;
  body.appendChild(d); body.scrollTop = body.scrollHeight;
  return d;
}
function addHtmlMsg(html) {
  const body = document.getElementById("chatBody");
  const d = document.createElement("div");
  d.className = "msg bot rich"; d.innerHTML = html;
  body.appendChild(d); body.scrollTop = body.scrollHeight;
}
function showTyping() {
  const body = document.getElementById("chatBody");
  const d = document.createElement("div");
  d.className = "msg bot typing"; d.id = "typingDots"; d.innerHTML = "<span></span><span></span><span></span>";
  body.appendChild(d); body.scrollTop = body.scrollHeight;
}
function hideTyping() { const d = document.getElementById("typingDots"); if (d) d.remove(); }

async function chatProperties() {
  if (window._chatProps) return window._chatProps;
  window._chatProps = await fetchProperties();
  return window._chatProps;
}

function parseQuery(t, all) {
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
  // budget implies intent: lakhs/crores → buying, small monthly figures → renting
  if (!q.type && q.budget) q.type = q.budget >= 500000 ? "buy" : "rent";
  const places = new Set();
  all.forEach(p => { places.add(p.city); places.add(p.area); });
  for (const place of places) {
    if (t.includes(place.toLowerCase())) { q.place = place; break; }
  }
  const pin = t.match(/\b(\d{6})\b/); if (pin) q.pincode = pin[1];
  return q;
}

function searchListings(q, all) {
  let list = all;
  if (q.place) list = list.filter(p => (p.city + " " + p.area).toLowerCase().includes(q.place.toLowerCase()));
  if (q.pincode) list = list.filter(p => p.pincode === q.pincode);
  if (q.beds) list = list.filter(p => p.beds === q.beds);
  if (q.type) list = list.filter(p => p.type === q.type);
  if (q.category) list = list.filter(p => p.category === q.category);
  if (q.budget) list = list.filter(p => p.priceINR <= q.budget);
  return list;
}

function chatCards(list) {
  return list.slice(0, 3).map(p => `
    <a class="chat-card" href="property.html?id=${p.id}">
      <img src="${p.img}" onerror="this.style.display='none'">
      <div>
        <b>${fmtPrice(p.priceINR, p.type === "rent")}</b>
        <span>${p.title}</span>
        <small>📍 ${p.area}, ${p.city}</small>
      </div>
    </a>`).join("");
}

function listingsUrl(q) {
  const p = new URLSearchParams();
  if (q.place) p.set("q", q.place);
  if (q.pincode) p.set("pincode", q.pincode);
  if (q.type) p.set("type", q.type);
  if (q.category) p.set("category", q.category);
  if (q.budget) p.set("budget", q.budget);
  return "listings.html?" + p.toString();
}

async function botReply(userText) {
  const t = userText.toLowerCase();
  showTyping();
  const respond = fn => setTimeout(() => { hideTyping(); fn(); }, 650);

  if (t.includes("whatsapp")) {
    return respond(() => {
      addMsg("Sure! Opening WhatsApp so an advisor can assist you directly.", "bot");
      window.open(whatsappLink("Hi FNS, I was chatting on your site and want to continue here."), "_blank");
    });
  }
  if (/visit|appointment|book|schedule/.test(t)) {
    return respond(() => {
      const user = currentUser();
      addMsg(user
        ? `Great, ${user.name.split(" ")[0]}! Open any property and tap "Book a site visit" — pay the refundable ₹999 token and your slot is confirmed instantly.`
        : 'Happy to set that up! Login first (one-time signup with email OTP), then open any property and tap "Book a site visit".', "bot");
      addHtmlMsg(`<a class="chat-link" href="${user ? "listings.html" : "login.html"}">${user ? "Browse properties →" : "Login / Sign up →"}</a>`);
    });
  }
  if (/post|sell my|list my|advertise/.test(t)) {
    return respond(() => {
      addMsg("Owners and realtors can list free — add photos, a video, description and location, and buyers reach you by chat, WhatsApp and email.", "bot");
      addHtmlMsg('<a class="chat-link" href="post.html">Post your property →</a>');
    });
  }
  if (/^(hi|hello|hey|namaste)\b/.test(t) || t.includes("help")) {
    return respond(() => addMsg('Hi 👋 Try me with things like "2 BHK in Pune under 60 lakh", "flats for rent in Bengaluru", "book a visit" or "post my property".', "bot"));
  }

  const all = await chatProperties().catch(() => []);
  const q = parseQuery(t, all);
  const hasIntent = q.place || q.beds || q.budget || q.type || q.category || q.pincode ||
    /flat|apartment|villa|house|home|property|bhk|studio|penthouse/.test(t);
  if (hasIntent) {
    const results = searchListings(q, all);
    return respond(() => {
      if (results.length) {
        const bits = [];
        if (q.beds) bits.push(q.beds + " BHK");
        if (q.type) bits.push("for " + (q.type === "rent" ? "rent" : "sale"));
        if (q.place) bits.push("in " + q.place);
        if (q.budget) bits.push("under " + fmtPrice(q.budget, q.type === "rent"));
        addMsg(`Found ${results.length} propert${results.length === 1 ? "y" : "ies"} ${bits.join(" ")}`.trim() + " — here are the top matches:", "bot");
        addHtmlMsg(chatCards(results) + `<a class="chat-link" href="${listingsUrl(q)}">See all ${results.length} on the listings page →</a>`);
      } else {
        addMsg("Hmm, nothing matches that exactly. Try widening the budget or a nearby area — or leave it with me:", "bot");
        addHtmlMsg(`<a class="chat-link" href="${whatsappLink("Hi FNS! I'm looking for: " + userText)}" target="_blank">Send this request to an advisor on WhatsApp →</a>`);
      }
    });
  }
  respond(() => {
    addMsg("I can search homes for you — try a city, BHK and budget (e.g. \"3 BHK in Hyderabad under 3 cr\"). For anything else, an advisor is one tap away.", "bot");
    addHtmlMsg(`<a class="chat-link" href="${whatsappLink("Hi FNS! " + userText)}" target="_blank">Ask on WhatsApp →</a>`);
  });
}

function chatSend(e) {
  e.preventDefault();
  const inp = document.getElementById("chatInput");
  const v = inp.value.trim(); if (!v) return;
  addMsg(v, "me"); inp.value = ""; botReply(v);
}
function chatQuick(text) { addMsg(text, "me"); botReply(text); }
