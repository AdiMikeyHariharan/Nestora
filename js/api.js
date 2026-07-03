// FNS API client — talks to server.js and keeps a property cache for sync helpers.
const API = {
  token() { return localStorage.getItem("fns_token") || ""; },

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
    if (!res.ok) throw new Error(data.error || ("Request failed (" + res.status + ")"));
    return data;
  },

  get(p) { return this.call(p); },
  post(p, body) { return this.call(p, { method: "POST", body }); },
  del(p) { return this.call(p, { method: "DELETE" }); }
};

// ---------- Property cache (lets card onclick handlers stay synchronous) ----------
window._propCache = {};
function cacheProps(list) { list.forEach(p => { window._propCache[p.id] = p; }); return list; }
function getPropertyById(id) { return window._propCache[id]; }

async function fetchProperties(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const { properties } = await API.get("/properties" + (qs ? "?" + qs : ""));
  return cacheProps(properties);
}
async function fetchProperty(id) {
  if (window._propCache[id]) return window._propCache[id];
  const { property } = await API.get("/properties/" + id);
  return cacheProps([property])[0];
}

// ---------- Auth session ----------
function currentUser() {
  try { return JSON.parse(localStorage.getItem("fns_user") || "null"); } catch (e) { return null; }
}
function saveSession(token, user) {
  localStorage.setItem("fns_token", token);
  localStorage.setItem("fns_user", JSON.stringify(user));
}
async function logout() {
  try { await API.post("/auth/logout", {}); } catch (e) {}
  localStorage.removeItem("fns_token");
  localStorage.removeItem("fns_user");
  location.href = "index.html";
}

// ---------- Shortlist (server-backed, cached per page load) ----------
window._shortlist = null;
async function loadShortlist() {
  if (!currentUser()) { window._shortlist = []; return []; }
  if (window._shortlist) return window._shortlist;
  try { window._shortlist = (await API.get("/shortlist")).ids; }
  catch (e) { window._shortlist = []; }
  return window._shortlist;
}
function getShortlist() { return window._shortlist || []; }
async function toggleShortlist(id, btn) {
  if (!currentUser()) {
    toast("Login to shortlist homes");
    setTimeout(() => location.href = "login.html?next=" + encodeURIComponent(location.pathname + location.search), 800);
    return;
  }
  try {
    const { shortlisted } = await API.post("/shortlist", { property_id: id });
    window._shortlist = shortlisted ? [...getShortlist(), id] : getShortlist().filter(x => x !== id);
    if (btn) btn.classList.toggle("active", shortlisted);
    toast(shortlisted ? "Added to shortlist ♥" : "Removed from shortlist");
  } catch (e) { toast(e.message); }
}
