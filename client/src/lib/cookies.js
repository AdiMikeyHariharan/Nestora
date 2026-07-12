// Minimal first-party cookie helpers.
export function getCookie(name) {
  const m = document.cookie.match("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)");
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCookie(name, value, days) {
  let cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
  if (days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    cookie += `; expires=${d.toUTCString()}`;
  }
  // Secure attribute only over HTTPS (so it still works on http://localhost)
  if (location.protocol === "https:") cookie += "; Secure";
  document.cookie = cookie;
}

export function deleteCookie(name) {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
