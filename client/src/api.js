// Nestora API client + shared helpers
export const NESTORA = {
  whatsapp: "919000000000",        // demo WhatsApp business number
  email: "hello@nestora.in",        // demo enquiry inbox
  rates: { INR: 1, USD: 1 / 83, AED: 1 / 22.6, GBP: 1 / 105, EUR: 1 / 90 },
  symbol: { INR: "₹", USD: "$", AED: "AED ", GBP: "£", EUR: "€" }
};

export const api = {
  token: () => localStorage.getItem("nst_token") || "",
  async call(path, opts = {}) {
    const res = await fetch("/api" + path, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(this.token() ? { Authorization: "Bearer " + this.token() } : {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  },
  get(p) { return this.call(p); },
  post(p, body) { return this.call(p, { method: "POST", body }); },
  del(p) { return this.call(p, { method: "DELETE" }); }
};

export function fmtPrice(inr, isRent, currency) {
  const c = currency || localStorage.getItem("nst_currency") || "INR";
  const val = inr * NESTORA.rates[c];
  let str;
  if (c === "INR") {
    if (isRent) str = "₹" + Math.round(val).toLocaleString("en-IN");
    else if (val >= 10000000) str = "₹" + (val / 10000000).toFixed(2).replace(/\.00$/, "") + " Cr";
    else if (val >= 100000) str = "₹" + (val / 100000).toFixed(2).replace(/\.00$/, "") + " L";
    else str = "₹" + Math.round(val).toLocaleString("en-IN");
  } else {
    str = NESTORA.symbol[c] + Math.round(val).toLocaleString("en-US");
  }
  return str + (isRent ? "/mo" : "");
}

export const waLink = text => "https://wa.me/" + NESTORA.whatsapp + "?text=" + encodeURIComponent(text);

export function enquireEmail(p) {
  if (!p) return;
  const subject = `Interested: ${p.title} (${p.id})`;
  const body = `Hi Nestora team,\n\nI'm interested in this property:\n\n${p.title}\n${p.area}, ${p.city} - ${p.pincode}\nPrice: ${fmtPrice(p.priceINR, p.type === "rent")}\n\nPlease share more details / schedule a visit.\n\nThanks`;
  window.location.href = `mailto:${NESTORA.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
