// First-party, cookie-based analytics. Page views are only tracked after the
// visitor accepts cookies (consent banner). Data is sent to our own backend.
import { getCookie, setCookie } from "./cookies.js";

const VID = "nst_vid";        // persistent anonymous visitor id (1 year)
const SID = "nst_sid";        // per-session id (session cookie)
const CONSENT = "nst_consent"; // "granted" | "denied"

const uuid = () =>
  (crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));

export function consentState() {
  return getCookie(CONSENT); // null until the visitor decides
}
export function hasConsent() {
  return getCookie(CONSENT) === "granted";
}

function ensureIds() {
  if (!getCookie(VID)) setCookie(VID, uuid(), 365); // 1-year visitor cookie
  if (!getCookie(SID)) setCookie(SID, uuid());       // session cookie (no expiry)
}

export function grantConsent() {
  setCookie(CONSENT, "granted", 365);
  ensureIds();
  trackPageView(location.pathname + location.search);
}
export function denyConsent() {
  setCookie(CONSENT, "denied", 365);
}

// Fire-and-forget page view; silently no-ops without consent or on failure.
export function trackPageView(path) {
  if (!hasConsent()) return;
  ensureIds();
  try {
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        vid: getCookie(VID),
        sid: getCookie(SID),
        path,
        referrer: document.referrer,
        event: "pageview"
      })
    }).catch(() => {});
  } catch {}
}
